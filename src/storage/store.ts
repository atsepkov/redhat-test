import { Database } from "bun:sqlite";
import type { Bucket, ObjectId, ContentHash, IStorageEngine } from "./types.ts";

/**
 * SQLite-backed content-addressed object store with per-bucket deduplication.
 *
 * Schema — two tables mirror the logical two-layer design:
 *
 *   object_index   (bucket, object_id) → content_hash
 *     Primary lookup: resolves a named object to its content hash.
 *
 *   content_store  content_hash → (data, ref_count)
 *     Stores the actual bytes. ref_count tracks how many index rows point here;
 *     the row is deleted (GC'd) when the count reaches zero.
 *
 * Deduplication is bucket-scoped: the hash is computed over `bucket\0data` so
 * identical content in different buckets produces distinct hashes and is stored
 * independently.
 *
 * All mutating operations (put, delete) run inside explicit transactions so the
 * index and content tables are never left in an inconsistent state.
 */
export class StorageEngine implements IStorageEngine {
  protected db: Database;

  // Prepared statements — compiled once, reused on every call
  private stmts: {
    getHash: ReturnType<Database["prepare"]>;
    getContent: ReturnType<Database["prepare"]>;
    upsertContent: ReturnType<Database["prepare"]>;
    incrementRef: ReturnType<Database["prepare"]>;
    upsertIndex: ReturnType<Database["prepare"]>;
    decrementRef: ReturnType<Database["prepare"]>;
    gcContent: ReturnType<Database["prepare"]>;
    deleteIndex: ReturnType<Database["prepare"]>;
  };

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
    this.stmts = this.prepareStatements();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS content_store (
        content_hash TEXT PRIMARY KEY,
        data         TEXT NOT NULL,
        ref_count    INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS object_index (
        bucket       TEXT NOT NULL,
        object_id    TEXT NOT NULL,
        content_hash TEXT NOT NULL REFERENCES content_store(content_hash),
        PRIMARY KEY (bucket, object_id)
      );
    `);
  }

  private prepareStatements() {
    return {
      getHash: this.db.prepare<{ content_hash: string }, [string, string]>(
        "SELECT content_hash FROM object_index WHERE bucket = ?1 AND object_id = ?2"
      ),
      getContent: this.db.prepare<{ data: string }, [string]>(
        "SELECT data FROM content_store WHERE content_hash = ?1"
      ),
      upsertContent: this.db.prepare(
        `INSERT INTO content_store (content_hash, data, ref_count) VALUES (?1, ?2, 1)
         ON CONFLICT (content_hash) DO NOTHING`
      ),
      incrementRef: this.db.prepare(
        "UPDATE content_store SET ref_count = ref_count + 1 WHERE content_hash = ?1"
      ),
      upsertIndex: this.db.prepare(
        `INSERT INTO object_index (bucket, object_id, content_hash) VALUES (?1, ?2, ?3)
         ON CONFLICT (bucket, object_id) DO UPDATE SET content_hash = excluded.content_hash`
      ),
      decrementRef: this.db.prepare(
        "UPDATE content_store SET ref_count = ref_count - 1 WHERE content_hash = ?1"
      ),
      gcContent: this.db.prepare(
        "DELETE FROM content_store WHERE content_hash = ?1 AND ref_count <= 0"
      ),
      deleteIndex: this.db.prepare(
        "DELETE FROM object_index WHERE bucket = ?1 AND object_id = ?2"
      ),
    };
  }

  private hashContent(bucket: Bucket, data: string): ContentHash {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(`${bucket}\0${data}`);
    return hasher.digest("hex");
  }

  async put(bucket: Bucket, id: ObjectId, data: string): Promise<void> {
    this.db.transaction(() => {
      const newHash = this.hashContent(bucket, data);
      const existingRow = this.stmts.getHash.get(bucket, id) as { content_hash: string } | null;
      const existingHash = existingRow?.content_hash ?? null;

      if (existingHash === newHash) return; // idempotent no-op

      // Insert content if new, otherwise bump the refcount
      const inserted = this.stmts.upsertContent.run(newHash, data);
      if (inserted.changes === 0) this.stmts.incrementRef.run(newHash);

      // Update index before GC — FK constraint requires content row to exist
      this.stmts.upsertIndex.run(bucket, id, newHash);

      if (existingHash !== null) {
        this.stmts.decrementRef.run(existingHash);
        this.stmts.gcContent.run(existingHash);
      }
    })();
  }

  async get(bucket: Bucket, id: ObjectId): Promise<string | null> {
    const row = this.stmts.getHash.get(bucket, id) as { content_hash: string } | null;
    if (!row) return null;
    const content = this.stmts.getContent.get(row.content_hash) as { data: string } | null;
    return content?.data ?? null;
  }

  async delete(bucket: Bucket, id: ObjectId): Promise<boolean> {
    const deleted = this.db.transaction(() => {
      const row = this.stmts.getHash.get(bucket, id) as { content_hash: string } | null;
      if (!row) return false;

      this.stmts.deleteIndex.run(bucket, id);
      this.stmts.decrementRef.run(row.content_hash);
      this.stmts.gcContent.run(row.content_hash);
      return true;
    })();

    return deleted as boolean;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

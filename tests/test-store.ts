import { StorageEngine } from "../src/storage/store.ts";

export class TestStorageEngine extends StorageEngine {
  contentEntryCount(): number {
    return (this.db.query("SELECT COUNT(*) as count FROM content_store").get() as { count: number }).count;
  }

  indexEntryCount(): number {
    return (this.db.query("SELECT COUNT(*) as count FROM object_index").get() as { count: number }).count;
  }
}

export type DbType = "sqlite"; // extend as new adapters are added

export interface Config {
  port: number;
  dbType: DbType;
  dbPath: string;
  maxBodyBytes: number;
}

export function loadConfig(): Config {
  // Port: PORT env → 8080
  let port = 8080;
  if (process.env.PORT) {
    const parsed = parseInt(process.env.PORT, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed >= 65536) {
      throw new Error(`Invalid PORT env var: "${process.env.PORT}"`);
    }
    port = parsed;
  }

  // DB type: DB_TYPE env → sqlite
  const dbType = (process.env.DB_TYPE ?? "sqlite") as DbType;

  // DB path: DB_PATH env → ./objects.db (sqlite only; use ":memory:" for ephemeral/test)
  const dbPath = process.env.DB_PATH ?? "./objects.db";

  // Body size limit: MAX_BODY_BYTES env → 10 MB
  const maxBodyBytes = parseInt(process.env.MAX_BODY_BYTES ?? "10485760", 10);
  if (isNaN(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error(`Invalid MAX_BODY_BYTES env var: "${process.env.MAX_BODY_BYTES}"`);
  }

  return { port, dbType, dbPath, maxBodyBytes };
}

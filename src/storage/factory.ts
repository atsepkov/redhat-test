import type { Config } from "../config.ts";
import type { IStorageEngine } from "./types.ts";
import { StorageEngine } from "./store.ts";

export function createStore(config: Config): IStorageEngine {
  switch (config.dbType) {
    case "sqlite":
      return new StorageEngine(config.dbPath);
    default:
      throw new Error(`Unsupported DB_TYPE: "${config.dbType}". Supported: sqlite`);
  }
}

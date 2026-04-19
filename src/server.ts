import { loadConfig } from "./config.ts";
import { createStore } from "./storage/factory.ts";
import { route } from "./router.ts";

const config = loadConfig();
const store = createStore(config);

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    return route(req, store, config);
  },
});

console.log(`Object store listening on http://localhost:${server.port}`);
console.log(`Database: ${config.dbPath}`);

async function shutdown() {
  server.stop();
  await store.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

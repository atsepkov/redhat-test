import type { IStorageEngine } from "./storage/types.ts";
import type { Config } from "./config.ts";
import { handlePut } from "./handlers/put.ts";
import { handleGet } from "./handlers/get.ts";
import { handleDelete } from "./handlers/delete.ts";

const OBJECT_PATH = /^\/objects\/([^/]+)\/([^/]+)$/;

export async function route(req: Request, store: IStorageEngine, config: Config): Promise<Response> {
  const start = performance.now();
  const url = new URL(req.url);

  const res = await dispatch(req, url, store, config);

  const ms = (performance.now() - start).toFixed(1);
  console.log(`${req.method} ${url.pathname} ${res.status} ${ms}ms`);
  return res;
}

async function dispatch(req: Request, url: URL, store: IStorageEngine, config: Config): Promise<Response> {
  if (url.pathname === "/healthz") {
    return new Response("OK", { status: 200 });
  }

  const match = OBJECT_PATH.exec(url.pathname);

  if (!match) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let bucket: string, objectId: string;
  try {
    bucket = decodeURIComponent(match[1]);
    objectId = decodeURIComponent(match[2]);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid path encoding" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  switch (req.method) {
    case "PUT":
      return handlePut(req, store, bucket, objectId, config.maxBodyBytes);
    case "GET":
      return handleGet(store, bucket, objectId);
    case "DELETE":
      return handleDelete(store, bucket, objectId);
    default:
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", Allow: "GET, PUT, DELETE" },
      });
  }
}

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { StorageEngine } from "../src/storage/store.ts";
import { route } from "../src/router.ts";
import type { Config } from "../src/config.ts";

const testConfig: Config = { port: 0, dbType: "sqlite", dbPath: ":memory:", maxBodyBytes: 10_485_760 };

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  const store = new StorageEngine(":memory:");
  server = Bun.serve({
    port: 0,
    fetch: (req) => route(req, store, testConfig),
  });
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
});

const url = (bucket: string, id: string) => `${base}/objects/${bucket}/${id}`;

describe("PUT /objects/:bucket/:objectId", () => {
  it("returns 201 with {id} on success", async () => {
    const res = await fetch(url("b", "o1"), { method: "PUT", body: "hello" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "o1" });
  });

  it("overwrites an existing object and still returns 201", async () => {
    await fetch(url("b", "overwrite-me"), { method: "PUT", body: "v1" });
    const res = await fetch(url("b", "overwrite-me"), { method: "PUT", body: "v2" });
    expect(res.status).toBe(201);
  });

  it("returns 413 when body exceeds limit declared in Content-Length", async () => {
    const store = new StorageEngine(":memory:");
    const smallConfig: Config = { port: 0, dbType: "sqlite", dbPath: ":memory:", maxBodyBytes: 10 };
    const s = Bun.serve({ port: 0, fetch: (req) => route(req, store, smallConfig) });
    const res = await fetch(`http://localhost:${s.port}/objects/b/big`, {
      method: "PUT",
      body: "x".repeat(11),
      headers: { "Content-Length": "11" },
    });
    s.stop();
    expect(res.status).toBe(413);
  });
});

describe("GET /objects/:bucket/:objectId", () => {
  it("returns 200 and the stored body", async () => {
    await fetch(url("b", "get-me"), { method: "PUT", body: "my content" });
    const res = await fetch(url("b", "get-me"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("my content");
  });

  it("returns 404 for a missing object", async () => {
    const res = await fetch(url("b", "does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns updated content after overwrite", async () => {
    await fetch(url("b", "versioned"), { method: "PUT", body: "v1" });
    await fetch(url("b", "versioned"), { method: "PUT", body: "v2" });
    const res = await fetch(url("b", "versioned"));
    expect(await res.text()).toBe("v2");
  });
});

describe("DELETE /objects/:bucket/:objectId", () => {
  it("returns 200 when object exists", async () => {
    await fetch(url("b", "del-me"), { method: "PUT", body: "bye" });
    const res = await fetch(url("b", "del-me"), { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when object does not exist", async () => {
    const res = await fetch(url("b", "ghost"), { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("object is unreachable after delete", async () => {
    await fetch(url("b", "temp"), { method: "PUT", body: "temporary" });
    await fetch(url("b", "temp"), { method: "DELETE" });
    const res = await fetch(url("b", "temp"));
    expect(res.status).toBe(404);
  });
});

describe("Bucket isolation", () => {
  it("same objectId in different buckets are independent", async () => {
    await fetch(url("bucket-x", "shared-id"), { method: "PUT", body: "X content" });
    await fetch(url("bucket-y", "shared-id"), { method: "PUT", body: "Y content" });
    expect(await (await fetch(url("bucket-x", "shared-id"))).text()).toBe("X content");
    expect(await (await fetch(url("bucket-y", "shared-id"))).text()).toBe("Y content");
  });

  it("deleting from one bucket does not affect another", async () => {
    await fetch(url("bkt-a", "obj"), { method: "PUT", body: "alpha" });
    await fetch(url("bkt-b", "obj"), { method: "PUT", body: "beta" });
    await fetch(url("bkt-a", "obj"), { method: "DELETE" });
    expect((await fetch(url("bkt-b", "obj"))).status).toBe(200);
  });
});

describe("GET /healthz", () => {
  it("returns 200 OK", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});

describe("Routing edge cases", () => {
  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${base}/not-objects/b/o`);
    expect(res.status).toBe(404);
  });

  it("returns 405 for unsupported methods on a valid path", async () => {
    const res = await fetch(url("b", "o"), { method: "PATCH" });
    expect(res.status).toBe(405);
  });

  it("returns 404 for path missing objectId segment", async () => {
    const res = await fetch(`${base}/objects/bucket-only`);
    expect(res.status).toBe(404);
  });
});

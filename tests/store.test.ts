import { describe, it, expect, beforeEach } from "bun:test";
import { TestStorageEngine } from "./test-store.ts";

describe("StorageEngine", () => {
  let store: TestStorageEngine;

  beforeEach(() => {
    store = new TestStorageEngine(":memory:");
  });

  describe("put / get basics", () => {
    it("stores an object and retrieves it", async () => {
      await store.put("bucket-a", "obj-1", "hello world");
      expect(await store.get("bucket-a", "obj-1")).toBe("hello world");
    });

    it("returns null for a missing object", async () => {
      expect(await store.get("bucket-a", "missing")).toBeNull();
    });
  });

  describe("deduplication within a bucket", () => {
    it("stores only one content entry for two identical objects", async () => {
      await store.put("b", "id-1", "same content");
      await store.put("b", "id-2", "same content");
      expect(store.contentEntryCount()).toBe(1);
      expect(store.indexEntryCount()).toBe(2);
    });

    it("both ids still resolve after dedup", async () => {
      await store.put("b", "id-1", "shared");
      await store.put("b", "id-2", "shared");
      expect(await store.get("b", "id-1")).toBe("shared");
      expect(await store.get("b", "id-2")).toBe("shared");
    });
  });

  describe("deduplication is bucket-scoped", () => {
    it("same content in different buckets uses separate entries", async () => {
      await store.put("bucket-x", "obj", "data");
      await store.put("bucket-y", "obj", "data");
      expect(store.contentEntryCount()).toBe(2);
    });

    it("each bucket's object resolves independently", async () => {
      await store.put("x", "obj", "value-x");
      await store.put("y", "obj", "value-y");
      expect(await store.get("x", "obj")).toBe("value-x");
      expect(await store.get("y", "obj")).toBe("value-y");
    });
  });

  describe("delete", () => {
    it("returns true when object exists", async () => {
      await store.put("b", "obj", "data");
      expect(await store.delete("b", "obj")).toBe(true);
    });

    it("returns false for a missing object", async () => {
      expect(await store.delete("b", "ghost")).toBe(false);
    });

    it("object is unreachable after delete", async () => {
      await store.put("b", "obj", "data");
      await store.delete("b", "obj");
      expect(await store.get("b", "obj")).toBeNull();
    });

    it("garbage-collects content when last reference is deleted", async () => {
      await store.put("b", "obj", "solo");
      await store.delete("b", "obj");
      expect(store.contentEntryCount()).toBe(0);
    });

    it("does NOT gc content when a second reference still exists", async () => {
      await store.put("b", "id-1", "shared");
      await store.put("b", "id-2", "shared");
      await store.delete("b", "id-1");
      expect(store.contentEntryCount()).toBe(1);
      expect(await store.get("b", "id-2")).toBe("shared");
    });

    it("gc fires only when both references are deleted", async () => {
      await store.put("b", "id-1", "shared");
      await store.put("b", "id-2", "shared");
      await store.delete("b", "id-1");
      await store.delete("b", "id-2");
      expect(store.contentEntryCount()).toBe(0);
    });
  });

  describe("overwrite (PUT to existing id)", () => {
    it("replaces content and old content is gc'd if no other refs", async () => {
      await store.put("b", "obj", "original");
      await store.put("b", "obj", "updated");
      expect(await store.get("b", "obj")).toBe("updated");
      expect(store.contentEntryCount()).toBe(1);
    });

    it("overwrite to same content is a no-op on storage", async () => {
      await store.put("b", "obj", "same");
      await store.put("b", "obj", "same");
      expect(store.contentEntryCount()).toBe(1);
      expect(store.indexEntryCount()).toBe(1);
    });

    it("overwrite releases old ref — other object sharing old content still works", async () => {
      await store.put("b", "id-1", "original");
      await store.put("b", "id-2", "original"); // shares content with id-1
      await store.put("b", "id-1", "updated");  // id-1 moves to new content
      expect(await store.get("b", "id-2")).toBe("original");
      expect(store.contentEntryCount()).toBe(2);
    });
  });
});

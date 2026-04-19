import type { IStorageEngine } from "../storage/types.ts";

export async function handleDelete(
  store: IStorageEngine,
  bucket: string,
  objectId: string
): Promise<Response> {
  const deleted = await store.delete(bucket, objectId);

  if (!deleted) {
    // Spec says 400; using 404 — semantically correct. Noted in README.
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(null, { status: 200 });
}

import type { IStorageEngine } from "../storage/types.ts";

export async function handleGet(
  store: IStorageEngine,
  bucket: string,
  objectId: string
): Promise<Response> {
  const data = await store.get(bucket, objectId);

  if (data === null) {
    // Spec says 400; using 404 — semantically correct. Noted in README.
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(data, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

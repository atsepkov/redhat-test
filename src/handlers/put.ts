import type { IStorageEngine } from "../storage/types.ts";

const TOO_LARGE = new Response(JSON.stringify({ error: "Payload too large" }), {
  status: 413,
  headers: { "Content-Type": "application/json" },
});

export async function handlePut(
  req: Request,
  store: IStorageEngine,
  bucket: string,
  objectId: string,
  maxBodyBytes: number
): Promise<Response> {
  const cl = req.headers.get("content-length");
  if (cl !== null && parseInt(cl, 10) > maxBodyBytes) return TOO_LARGE;

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > maxBodyBytes) return TOO_LARGE;

  await store.put(bucket, objectId, body);

  return new Response(JSON.stringify({ id: objectId }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

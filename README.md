# Object Storage Service
A lightweight HTTP service for storing and retrieving text objects organized by buckets, with per-bucket content deduplication.

## Running the service
The web service requires bun to run. Bun is a modern alternative to NodeJS JavaScript runtime, which you can install as follows:
```bash
curl -fsSL https://bun.com/install | bash
```
Afterwards, starting up the server requires no runtime dependencies:
```bash
PORT=8080 bun run src/server.ts
```

`PORT` defaults to `8080` if not set. Storage defaults to on-disk sqlite file. To use ephemeral in-memory storage instead:

```bash
DB_PATH=:memory: PORT=8080 bun run src/server.ts
```

## Running tests
```bash
bun test
```

## API
All objects are addressed by `/objects/{bucket}/{objectID}`.

### PUT /objects/{bucket}/{objectID}
Upload an object. The request body is stored as-is. Uploading to an existing ID overwrites it.

```bash
curl -X PUT http://localhost:8080/objects/my-bucket/hello.txt \
     -d "hello world"
```

Response: `201 Created`:
```json
{ "id": "hello.txt" }
```

### GET /objects/{bucket}/{objectID}
Download an object.

```bash
curl http://localhost:8080/objects/my-bucket/hello.txt
```

Response: `200 OK`:
```
hello world
```

Response if not found: `404 Not Found`:
```json
{ "error": "Not found" }
```

### DELETE /objects/{bucket}/{objectID}
Delete an object.

```bash
curl -X DELETE http://localhost:8080/objects/my-bucket/hello.txt
```

Response: `200 OK` (empty body)

Response if not found: `404 Not Found`:
```json
{ "error": "Not found" }
```

## CLI
I've added an additional `cli.ts` file that allows interacting with the server without the need for curl or Postman. It basically abstracts the same API into a set of CLI commands you can run from your shell:
```bash
./cli.ts upload <bucket> <object_id> <source_file>
./cli.ts download <bucket> <object_id> [destination_file]
./cli.ts delete <bucket> <object_id>
```
If destination_file is unspecified, CLI will dump contents to STDOUT.

## Design Choices
I prefer simplicity and my design choices reflect that:
- I chose SQLite as the database due to its setup simplicity and lightweight footprint (many of my other projects on github use SQLite as well). The storage layer is designed for easy substitution: `src/storage/store.ts` implements an `IStorageEngine` interface, and `src/storage/factory.ts` selects the implementation at startup based on the `DB_TYPE` env var. Swapping in Postgres or another database requires only a new adapter file implementing the same interface — no changes to the server, router, or handlers.
- JavaScript/TypeScript is well-suited for web-development and allows consistent language + design patterns on backend and frontend. I went with TypeScript due to additional type safety it introduces over regular JS, which is often desired in production-level systems.
- I chose BunJS as the runtime as a modern alternative to NodeJS + Express, BunJS comes bundled with bun:test and bun:sqlite, further reducing the need for external dependencies.

### Status Code Deviation
The original spec asks for `400 Not Found` status for objects that don't exist. This is semantically incorrect as the standard `Not Found` code is 404. I have made the adjustment to the implementation, assuming this was a typo in the design.

Conversely, the spec mandates `201 Created` for all PUT responses. Per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), an overwrite of an existing object would more correctly return `200 OK` or `204 No Content`, since no new resource is being created. In this case I followed the spec because we have no dedicated POST endpoint to further differentiate correct behavior here.

### Deduplication
The spec asks for per-bucket deduplication. Two objects in the same bucket that share identical content are stored once and reference-counted; the same content in different buckets is stored independently. This is implemented via a two-table SQLite schema: `content_store` holds deduplicated data keyed by a SHA-256 hash of `(bucket, content)`, and `object_index` maps `(bucket, objectID)` to a content hash. Reference counts drive garbage collection when objects are overwritten or deleted.

## AI usage
All architectural decisions (storage design, deduplication approach, choice of language/runtime/DB, project structure) were my own. AI was used in two distinct phases:

- **Phase 1: initial development:** Claude Code assisted with boilerplate (handler stubs, test scaffolding) and helped me verify my interpretation of the spec, particularly the deduplication edge cases around overwrites and shared references.
- **Phase 2: iterative code review:** I used a secondary Claude Code agent as a stand-in for the kind of thorough code review that would normally come from a teammate or tech lead. This surfaced production-readiness gaps I'd have caught in a real review cycle but hadn't prioritized yet: type safety infrastructure (`tsconfig.json`, silent type errors), input protection (body size limits, URL decoding), and observability (the `/healthz` endpoint).

Not every suggestion was accepted. For example, AI flagged the module-level `const TOO_LARGE = new Response(...)` as a potential bug around Response body reuse. I pushed back, we looked up Bun's documented behavior together, and confirmed the original approach was correct. Bun explicitly supports reusing string-body Response objects and even builds its static routes feature on this guarantee. That back-and-forth is representative of how I used AI throughout: as a reviewer to pressure-test decisions, not as an author.

I've relied exclusively on Sonnet 4.6 for all agentic work.

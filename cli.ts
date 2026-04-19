#!/usr/bin/env bun

import * as fs from "fs";

const BASE_URL = process.env.SERVER_URL ?? "http://localhost:8080";

function usage(): never {
  console.error(`Usage:
  cli.ts upload   <bucket> <objectID> <file>
  cli.ts download <bucket> <objectID> [outputFile]
  cli.ts delete   <bucket> <objectID>

Environment:
  SERVER_URL  Base URL of the server (default: ${BASE_URL})
`);
  process.exit(1);
}

async function upload(bucket: string, objectID: string, file: string) {
  const url = `${BASE_URL}/objects/${bucket}/${objectID}`;
  console.log(`PUT ${url}`);
  const res = await fetch(url, { method: "PUT", body: fs.readFileSync(file) });
  console.log(`Status: ${res.status}`);
  console.log(await res.text());
}

async function download(bucket: string, objectID: string, outputFile?: string) {
  const url = `${BASE_URL}/objects/${bucket}/${objectID}`;
  console.log(`GET ${url}`);
  const res = await fetch(url);
  console.log(`Status: ${res.status}`);
  if (res.status === 200) {
    const data = Buffer.from(await res.arrayBuffer());
    if (outputFile) {
      fs.writeFileSync(outputFile, data);
      console.log(`Saved to ${outputFile}`);
    } else {
      process.stdout.write(data);
    }
  } else {
    console.log(await res.text());
  }
}

async function del(bucket: string, objectID: string) {
  const url = `${BASE_URL}/objects/${bucket}/${objectID}`;
  console.log(`DELETE ${url}`);
  const res = await fetch(url, { method: "DELETE" });
  console.log(`Status: ${res.status}`);
  const text = await res.text();
  if (text) console.log(text);
}

const [, , cmd, ...args] = process.argv;

(async () => {
  switch (cmd) {
    case "upload":
      if (args.length < 3) usage();
      await upload(args[0], args[1], args[2]);
      break;
    case "download":
      if (args.length < 2) usage();
      await download(args[0], args[1], args[2]);
      break;
    case "delete":
      if (args.length < 2) usage();
      await del(args[0], args[1]);
      break;
    default:
      usage();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

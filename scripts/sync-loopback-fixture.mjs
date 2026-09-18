import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4291);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Port must be an integer between 1024 and 65535");

let putCount = 0;
let lastPutBytes = 0;
let lastPutRecords = 0;
let lastPut = [];

function headers(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    "Content-Type": "application/json"
  };
}

function record(id, text, revision = 1, deleted = false) {
  const now = new Date().toISOString();
  return {
    id,
    recordType: "note",
    owner: "core.remote",
    schemaVersion: 1,
    createdAt: now,
    modifiedAt: now,
    provenance: { source: "REMOTE_REPLICA", capturedAt: now },
    truthClass: "USER_OBSERVATION",
    sensitivity: "PRIVATE",
    revision,
    deleted,
    data: { text }
  };
}

function writeJson(response, status, body, origin) {
  response.writeHead(status, headers(origin));
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error("replica body exceeds 1 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : "*";
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers(origin));
    response.end();
    return;
  }
  if (requestUrl.pathname === "/__state" && request.method === "GET") {
    writeJson(response, 200, { putCount, lastPutBytes, lastPutRecords, deletedIds: lastPut.filter((item) => item?.deleted === true).map((item) => item.id) }, origin);
    return;
  }
  if (requestUrl.pathname !== "/replica") {
    writeJson(response, 404, { error: "not found" }, origin);
    return;
  }
  if (requestUrl.searchParams.get("mode") === "fail" && request.method === "PUT") {
    writeJson(response, 503, { error: "synthetic push failure" }, origin);
    return;
  }
  if (request.method === "GET") {
    const records = [record("remote-sync-current-sentinel", "Remote sync sentinel")];
    for (const deleted of lastPut.filter((item) => item?.deleted === true && typeof item.id === "string")) records.push(record(deleted.id, "Stale remote resurrection", Math.max(1, Number(deleted.revision) - 1)));
    writeJson(response, 200, { format: "OMNEVUM_REPLICA", version: 1, records }, origin);
    return;
  }
  if (request.method === "PUT") {
    try {
      const body = JSON.parse(await readBody(request));
      const records = Array.isArray(body?.records) ? body.records : [];
      putCount += 1;
      lastPutBytes = Buffer.byteLength(JSON.stringify(body));
      lastPutRecords = records.length;
      lastPut = records;
      console.log(`SYNC_FIXTURE_PUT count=${putCount} bytes=${lastPutBytes} records=${lastPutRecords}`);
      response.writeHead(204, headers(origin));
      response.end();
    } catch (error) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : "invalid replica" }, origin);
    }
    return;
  }
  writeJson(response, 405, { error: "method not allowed" }, origin);
});

server.listen(port, "localhost", () => console.log(`SYNC_FIXTURE_READY http://localhost:${port}/replica`));
process.once("SIGINT", () => server.close(() => process.exit(0)));

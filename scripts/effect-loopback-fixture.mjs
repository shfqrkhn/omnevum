import { createServer } from "node:http";

const requestedPort = Number(process.argv[2] ?? 59994);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) throw new Error("Port must be an integer from 0 through 65535");

const identities = new Map();
let created = 0;
let posts = 0;
let reconciliations = 0;

const server = createServer(async (request, response) => {
  await new Promise((resolve, reject) => {
    request.once("error", reject);
    request.once("end", resolve);
    request.resume();
  });
  const origin = String(request.headers.origin ?? "");
  const corsHeaders = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "Content-Type, Idempotency-Key", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "Origin" } : {};
  if (request.method === "OPTIONS" && request.url?.startsWith("/action")) {
    response.writeHead(204, corsHeaders).end();
    return;
  }
  const idempotencyKey = String(request.headers["idempotency-key"] ?? "");
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "POST" && requestUrl.pathname === "/action") {
    posts += 1;
    if (!identities.has(idempotencyKey)) {
      const remoteIdentity = `loopback-${created + 1}`;
      identities.set(idempotencyKey, remoteIdentity);
      created += 1;
      console.log(JSON.stringify({ event: "POST_RESPONSE_LOST", idempotencyKey, remoteIdentity, posts, created }));
      response.destroy();
      return;
    }
    console.log(JSON.stringify({ event: "POST_DUPLICATE", idempotencyKey, remoteIdentity: identities.get(idempotencyKey), posts, created }));
    response.writeHead(200, { ...corsHeaders, "content-type": "application/json" });
    response.end(JSON.stringify({ outcome: "SUCCEEDED", remoteIdentity: identities.get(idempotencyKey), duplicate: true }));
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/action" && identities.has(requestUrl.searchParams.get("idempotencyKey") ?? "")) {
    const key = requestUrl.searchParams.get("idempotencyKey");
    reconciliations += 1;
    console.log(JSON.stringify({ event: "GET_RECONCILED", idempotencyKey: key, remoteIdentity: identities.get(key), reconciliations }));
    response.writeHead(200, { ...corsHeaders, "content-type": "application/json" });
    response.end(JSON.stringify({ outcome: "SUCCEEDED", remoteIdentity: identities.get(key) }));
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/stats") {
    response.writeHead(200, { ...corsHeaders, "content-type": "application/json" });
    response.end(JSON.stringify({ posts, created, reconciliations, keys: [...identities.keys()] }));
    return;
  }
  response.writeHead(404, corsHeaders).end();
});

server.listen(requestedPort, "localhost", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback fixture did not receive a TCP address");
  console.log(`EFFECT_LOOPBACK_READY http://localhost:${address.port}/action`);
});

const close = () => server.close(() => process.exit(0));
process.once("SIGINT", close);
process.once("SIGTERM", close);

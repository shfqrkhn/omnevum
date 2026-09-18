export function createEffectLoopbackState() {
  return { identities: new Map(), created: 0, posts: 0, reconciliations: 0 };
}

export function createEffectLoopbackHandler(state, options = {}) {
  const basePath = normalizeBasePath(options.basePath ?? "");
  const log = options.log ?? ((event) => console.log(JSON.stringify(event)));
  return async (request, response) => {
    await consumeRequest(request);
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = requestUrl.pathname.startsWith(basePath) ? requestUrl.pathname.slice(basePath.length) || "/" : requestUrl.pathname;
    const origin = String(request.headers.origin ?? "");
    const corsHeaders = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(origin) ? { "access-control-allow-origin": origin, "access-control-allow-headers": "Content-Type, Idempotency-Key", "access-control-allow-methods": "GET, POST, OPTIONS", vary: "Origin" } : {};
    if (request.method === "OPTIONS" && pathname === "/action") {
      response.writeHead(204, corsHeaders).end();
      return;
    }
    const idempotencyKey = String(request.headers["idempotency-key"] ?? "");
    if (request.method === "POST" && pathname === "/action") {
      state.posts += 1;
      if (!state.identities.has(idempotencyKey)) {
        const remoteIdentity = `loopback-${state.created + 1}`;
        state.identities.set(idempotencyKey, remoteIdentity);
        state.created += 1;
        log({ event: "POST_RESPONSE_LOST", idempotencyKey, remoteIdentity, posts: state.posts, created: state.created });
        response.destroy();
        return;
      }
      log({ event: "POST_DUPLICATE", idempotencyKey, remoteIdentity: state.identities.get(idempotencyKey), posts: state.posts, created: state.created });
      writeJson(response, 200, { outcome: "SUCCEEDED", remoteIdentity: state.identities.get(idempotencyKey), duplicate: true }, corsHeaders);
      return;
    }
    const key = requestUrl.searchParams.get("idempotencyKey") ?? "";
    if (request.method === "GET" && pathname === "/action" && state.identities.has(key)) {
      state.reconciliations += 1;
      log({ event: "GET_RECONCILED", idempotencyKey: key, remoteIdentity: state.identities.get(key), reconciliations: state.reconciliations });
      writeJson(response, 200, { outcome: "SUCCEEDED", remoteIdentity: state.identities.get(key) }, corsHeaders);
      return;
    }
    if (request.method === "GET" && pathname === "/stats") {
      writeJson(response, 200, { posts: state.posts, created: state.created, reconciliations: state.reconciliations, keys: [...state.identities.keys()] }, corsHeaders);
      return;
    }
    response.writeHead(404, corsHeaders).end();
  };
}

function normalizeBasePath(value) {
  if (!value) return "";
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function writeJson(response, status, value, headers = {}) {
  response.writeHead(status, { ...headers, "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function consumeRequest(request) {
  return new Promise((resolve, reject) => {
    request.once("error", reject);
    request.once("end", resolve);
    request.resume();
  });
}

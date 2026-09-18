import { createServer } from "node:http";
import { createEffectLoopbackHandler, createEffectLoopbackState } from "./effect-loopback-core.mjs";

const requestedPort = Number(process.argv[2] ?? 59994);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) throw new Error("Port must be an integer from 0 through 65535");

const state = createEffectLoopbackState();
const server = createServer(createEffectLoopbackHandler(state));

server.listen(requestedPort, "localhost", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback fixture did not receive a TCP address");
  console.log(`EFFECT_LOOPBACK_READY http://localhost:${address.port}/action`);
});

const close = () => server.close(() => process.exit(0));
process.once("SIGINT", close);
process.once("SIGTERM", close);

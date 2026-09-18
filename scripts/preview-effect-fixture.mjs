import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] ?? 4242);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Port must be an integer from 1 through 65535");
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const args = npmExecPath
  ? [npmExecPath, "run", "preview", "--", "--host", "localhost", "--port", String(port)]
  : ["run", "preview", "--", "--host", "localhost", "--port", String(port)];
const child = spawn(command, args, {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, OMNEVUM_EFFECT_FIXTURE: "1" },
  stdio: "inherit"
});
const stop = (signal) => child.kill(signal);
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

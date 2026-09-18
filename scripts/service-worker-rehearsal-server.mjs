import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = process.cwd();
const distRoot = resolve(root, "dist");
const args = new Map(process.argv.slice(2).flatMap((value, index, values) => value.startsWith("--") ? [[value.slice(2), values[index + 1] ?? ""]] : []));
const port = Number(args.get("port") || 4176);
const oldRef = args.get("old-ref") || "HEAD";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port must be an integer from 1 to 65535");
if (!existsSync(join(distRoot, "index.html")) || !existsSync(join(distRoot, "sw.js"))) throw new Error("dist must contain a completed build before starting the rehearsal server");

const oldWorker = execFileSync("git", ["show", `${oldRef}:public/sw.js`], { cwd: root, encoding: "utf8" });
const currentWorker = readFileSync(join(distRoot, "sw.js"));
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};
let mode = "old";

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/__mode") {
    if (url.searchParams.has("value")) mode = url.searchParams.get("value") === "new" ? "new" : "old";
    response.writeHead(200, { "cache-control": "no-store", "content-type": "text/plain" });
    response.end(mode);
    return;
  }
  if (url.pathname === "/sw.js") {
    response.writeHead(200, { "cache-control": "no-store", "content-type": "text/javascript" });
    response.end(mode === "old" ? oldWorker : currentWorker);
    return;
  }
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = resolve(distRoot, relativePath);
  const fileRelativePath = relative(distRoot, file);
  if (fileRelativePath.startsWith("..") || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "cache-control": "no-store", "content-type": contentTypes[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});

server.listen(port, "127.0.0.1", () => console.log(`SW_REHEARSAL_SERVER_READY port=${port} mode=${mode} oldRef=${oldRef}`));

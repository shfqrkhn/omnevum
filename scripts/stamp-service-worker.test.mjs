import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, it } from "node:test";
import { stampServiceWorkerFile, stampServiceWorkerSource } from "./stamp-service-worker.mjs";

const workerSource = `const CACHE_NAME = "omnevum-shell-v1";\nconst PRECACHE_URLS = ["./"];\n`;
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("service-worker stamping", () => {
  it("stamps both rollback identity markers without changing the output contract", () => {
    const stamped = stampServiceWorkerSource(workerSource, "0123456789abcdef", ["./", "./assets/app.js"]);
    assert.equal(stamped, 'const CACHE_NAME = "omnevum-shell-0123456789abcdef";\nconst PRECACHE_URLS = ["./","./assets/app.js"];\n');
  });

  it("fails closed before writing when a required marker drifts", () => {
    const directory = mkdtempSync(join(tmpdir(), "omnevum-sw-stamp-"));
    temporaryDirectories.push(directory);
    const workerPath = join(directory, "sw.js");
    const original = 'const CACHE_NAME = "omnevum-shell-custom";\nconst PRECACHE_URLS = ["./"];\n';
    writeFileSync(workerPath, original, "utf8");
    writeFileSync(join(directory, "app.js"), "console.log(1);", "utf8");

    assert.throws(() => stampServiceWorkerFile(directory, workerPath), /cache identity marker/);
    assert.equal(readFileSync(workerPath, "utf8"), original);
  });

  it("writes a stamped worker and leaves no temporary writer behind", () => {
    const directory = mkdtempSync(join(tmpdir(), "omnevum-sw-stamp-"));
    temporaryDirectories.push(directory);
    const workerPath = join(directory, "sw.js");
    writeFileSync(workerPath, workerSource, "utf8");
    writeFileSync(join(directory, "app.js"), "console.log(1);", "utf8");

    const result = stampServiceWorkerFile(directory, workerPath);
    const stamped = readFileSync(workerPath, "utf8");
    assert.match(stamped, new RegExp(`const CACHE_NAME = "omnevum-shell-${result.buildId}"`));
    assert.match(stamped, /const PRECACHE_URLS = \["\.\/","\.\/app\.js"\];/u);
    assert.equal(result.precacheCount, 2);
    assert.deepEqual(readdirSync(directory).sort(), ["app.js", "sw.js"]);
  });
});

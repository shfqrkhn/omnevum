import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath ?? (process.platform === "win32" ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js") : undefined);
const testFile = "src/core/factory-interruption.test.ts";
const checkpointDirectory = mkdtempSync(join(tmpdir(), "omnevum-factory-interruption-"));
const checkpointPath = join(checkpointDirectory, "checkpoint.json");
const run = (phase) => {
  const args = npmCli ? [npmCli, "exec", "vitest", "run", testFile] : ["exec", "vitest", "run", testFile];
  const result = spawnSync(npmCli ? process.execPath : "npm", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, OMNEVUM_FACTORY_PHASE: phase, OMNEVUM_FACTORY_CHECKPOINT: checkpointPath },
    stdio: "pipe"
  });
  return { ...result, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};

try {
  const interrupted = run("create");
  if (interrupted.status === 0 || !interrupted.output.includes("FACTORY_INTENTIONAL_INTERRUPTION")) {
    throw new Error(`Factory interruption phase did not stop at the deliberate checkpoint.\n${interrupted.output}`);
  }
  console.log("FACTORY_INTERRUPTION_EXPECTED_STOP_PASS");
  const resumed = run("resume");
  if (resumed.status !== 0) {
    throw new Error(`Factory resume phase failed.\n${resumed.output}`);
  }
  console.log("FACTORY_INTERRUPTION_RESUME_PASS");
} finally {
  if (existsSync(checkpointDirectory)) rmSync(checkpointDirectory, { recursive: true, force: true });
}

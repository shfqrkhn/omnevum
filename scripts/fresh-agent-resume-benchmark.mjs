import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const git = process.platform === "win32" ? "git.exe" : "git";
const npmCli = process.env.npm_execpath ?? (process.platform === "win32" ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js") : undefined);
const run = (command, args, cwd, options = {}) => execFileSync(command, args, { cwd, encoding: "utf8", stdio: options.capture === false ? "inherit" : "pipe" });
const runNpm = (args, cwd, options = {}) => npmCli ? run(process.execPath, [npmCli, ...args], cwd, options) : run("npm", args, cwd, options);
const sourceRevision = run(git, ["rev-parse", "HEAD"], root).trim();
const status = run(git, ["status", "--porcelain"], root).trim();
if (status) throw new Error("Fresh-agent benchmark requires a clean source checkout");

const ledger = JSON.parse(readFileSync(join(root, "docs", "control", "completion-ledger.json"), "utf8"));
const recoveryBundle = JSON.parse(readFileSync(join(root, "docs", "control", "recovery-bundle.json"), "utf8"));
if (ledger.status !== "IN_PROGRESS" || typeof ledger.next !== "string" || ledger.next.length === 0) throw new Error("Completion ledger does not expose resumable in-progress state");
if (recoveryBundle.repository?.secretsIncluded !== false) throw new Error("Recovery bundle does not declare secrets excluded");

const worktree = mkdtempSync(join(tmpdir(), "omnevum-fresh-agent-"));
let added = false;
try {
  run(git, ["worktree", "add", "--detach", worktree, sourceRevision], root, { capture: false });
  added = true;
  const resumedRevision = run(git, ["rev-parse", "HEAD"], worktree).trim();
  if (resumedRevision !== sourceRevision) throw new Error("Fresh worktree revision differs from source revision");
  console.log(`FRESH_AGENT_RESUME_START source=${sourceRevision} ledger=${ledger.status}`);
  runNpm(["ci"], worktree, { capture: false });
  console.log("FRESH_AGENT_NPM_CI_PASS");
  runNpm(["run", "audit:recovery"], worktree, { capture: false });
  console.log("FRESH_AGENT_RECOVERY_AUDIT_PASS");
  runNpm(["run", "ci"], worktree, { capture: false });
  console.log("FRESH_AGENT_CI_PASS");
  console.log(`FRESH_AGENT_RESUME_PASS revision=${resumedRevision} clean-clone=true original-conversation=false`);
} finally {
  if (added) run(git, ["worktree", "remove", "--force", worktree], root, { capture: false });
  if (existsSync(worktree)) throw new Error(`Fresh-agent worktree was not removed: ${worktree}`);
}

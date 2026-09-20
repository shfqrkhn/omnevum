import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = process.platform === "win32" ? "git.exe" : "git";
const FIXTURE_TIME = "2026-09-20T00:00:00.000Z";
const databasePrefix = `omnevum-launchpad-proof-${process.pid}`;
const sourceFiles = [
  "src/core/artifact.ts",
  "src/core/commands.ts",
  "src/core/launchpad-transplant.integration.test.ts",
  "src/core/launchpad-transplant.ts",
  "src/core/storage.ts",
  "scripts/launchpad-transplant-benchmark.mjs"
].sort();
const read = (path) => readFileSync(join(root, path));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const revision = execFileSync(git, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const workingTree = execFileSync(git, ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
const sourceSha256 = sha256(sourceFiles.map((path) => `${path}\0${read(path).toString("utf8")}`).join("\0"));
const checks = [];
const metrics = {};
const assert = (condition, message) => {
  if (!condition) throw new Error(`LAUNCHPAD_TRANSPLANT_BENCHMARK_FAIL: ${message}`);
};
const check = (name, condition, message) => {
  assert(condition, message);
  checks.push(name);
};

const WORKLOAD = [
  { flow: "Note/Knowledge", sourceId: "neumanos:note:42", recordId: "omnevum:launchpad:note-42", recordType: "note", text: "launchpad note" },
  { flow: "Task/Project", sourceId: "neumanos:task:17", recordId: "omnevum:launchpad:task-17", recordType: "task", text: "launchpad task" },
  { flow: "Calendar/Time", sourceId: "neumanos:event:2026-09-20", recordId: "omnevum:launchpad:event-2026-09-20", recordType: "observation", text: "launchpad calendar event" },
  { flow: "Habit/Routine", sourceId: "neumanos:habit:walk", recordId: "omnevum:launchpad:habit-walk", recordType: "observation", text: "launchpad routine" },
  { flow: "Document/Artifact", sourceId: "neumanos:document:receipt-7", recordId: "omnevum:launchpad:artifact-receipt-7", recordType: "artifact", text: "launchpad artifact" },
  { flow: "Automation", sourceId: "neumanos:automation:review", recordId: "omnevum:launchpad:automation-review", recordType: "observation", text: "launchpad automation" }
];

let vite;
let result;
try {
  vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { hmr: false, middlewareMode: true } });
  const [storage, commands, transplant] = await Promise.all([
    vite.ssrLoadModule("/src/core/storage.ts"),
    vite.ssrLoadModule("/src/core/commands.ts"),
    vite.ssrLoadModule("/src/core/launchpad-transplant.ts")
  ]);
  const { CanonicalStore } = storage;
  const { CommandBus } = commands;
  const { V018_LAUNCHPAD_FLOWS, admitLaunchpadMutation, canonicalOwnerForFlow, evaluateOwnershipBoundary } = transplant;
  check("six-flow-coverage", JSON.stringify(WORKLOAD.map(({ flow }) => flow)) === JSON.stringify(V018_LAUNCHPAD_FLOWS), "workload does not cover the six MPES flows exactly once");

  let directLegacyWriteCount = 0;
  for (const item of WORKLOAD) {
    const legacy = [{ storeId: `legacy:${item.flow}`, flow: item.flow, writable: true, owner: `legacy.${item.flow}` }];
    const admission = admitLaunchpadMutation({ flow: item.flow, sourceId: item.sourceId, recordId: item.recordId, revision: 1, data: { text: item.text } }, legacy);
    check(`direct-write-rejected-${item.flow}`, admission.decision === "REJECT_DIRECT_STORE" && admission.owner === canonicalOwnerForFlow(item.flow), `writable legacy authority was not rejected for ${item.flow}`);
    const readOnly = evaluateOwnershipBoundary([{ storeId: `retained:${item.flow}`, flow: item.flow, writable: false, owner: canonicalOwnerForFlow(item.flow) }], item.flow);
    check(`read-only-seam-${item.flow}`, readOnly.accepted, `read-only retained seam was not accepted for ${item.flow}`);
    if (admission.decision === "COMMAND_ONLY") directLegacyWriteCount += 1;
  }
  check("no-legacy-write-side-effect", directLegacyWriteCount === 0, "a direct legacy writer would have been invoked");

  const source = new CanonicalStore(`${databasePrefix}-source`);
  const destination = new CanonicalStore(`${databasePrefix}-destination`);
  await source.open();
  await destination.open();
  try {
    const bus = new CommandBus(source);
    const created = [];
    for (const item of WORKLOAD) {
      const metadata = { text: item.text, launchpadFlow: item.flow, stableSourceId: item.sourceId, stableCanonicalId: item.recordId, capturedAt: FIXTURE_TIME };
      const record = item.recordType === "artifact"
        ? await bus.createArtifact({ id: item.recordId, fileName: "launchpad-proof.txt", mimeType: "text/plain", blob: new Blob([item.text], { type: "text/plain" }), sourceId: item.sourceId, adapter: "TEXT", metadata })
        : item.flow === "Automation"
          ? await bus.create({ id: item.recordId, recordType: item.recordType, owner: canonicalOwnerForFlow(item.flow), truthClass: "IMPORTED_RECORD", provenance: { source: "IMPORT", sourceId: item.sourceId, capturedAt: FIXTURE_TIME }, data: metadata })
          : await bus.createLaunchpad({ flow: item.flow, text: item.text, sourceId: item.sourceId, recordId: item.recordId, data: { capturedAt: FIXTURE_TIME } });
      const updated = await bus.update(record.id, { ...record.data, proofRevision: "owner-bound-command" }, record.revision);
      check(`stable-owner-${item.flow}`, updated.id === item.recordId && updated.owner === canonicalOwnerForFlow(item.flow) && updated.provenance.sourceId === item.sourceId && updated.revision === 2, `stable identity/owner/revision failed for ${item.flow}`);
      created.push(updated);
    }
    check("six-flow-search", (await source.search("launchpad")).length === WORKLOAD.length, "derived search did not expose all retained flows");
    const vault = await source.exportVault();
    check("vault-six-flow-records", vault.records.length === WORKLOAD.length && vault.history.length === WORKLOAD.length * 2, "Vault did not retain all six records and their revisions");
    const first = await destination.importVault(vault);
    const second = await destination.importVault(vault);
    check("vault-idempotent-roundtrip", first.imported === WORKLOAD.length && second.skipped === WORKLOAD.length && second.conflicts === 0, "Vault restore was not idempotent");
    check("restored-stable-identities", (await destination.list()).every((record) => created.some((item) => item.id === record.id && item.owner === record.owner && item.provenance.sourceId === record.provenance.sourceId && item.revision === record.revision)), "restored records did not retain stable identity/provenance/revision");
    check("recovery-state-reconstructable", (await destination.exportRetainedState()).format === "OMNEVUM_VAULT", "retained state could not be exported after restore");
    metrics.records = (await destination.list()).length;
    metrics.historyEntries = (await destination.history()).length;
    metrics.vault = { firstImport: first, secondImport: second };
  } finally {
    source.close();
    destination.close();
  }

  result = {
    schemaVersion: 1,
    kind: "launchpad-transplant-benchmark-result",
    status: "PASS",
    authority: "Current v0.18 canonical-core transplantability proof; not donor UI, cross-browser, deployment, security, human-acceptance, or release evidence.",
    current: { revision, workingTree, sourceFiles, sourceSha256, sourceHashDefinition: "SHA-256 of sorted repository-relative source paths and exact current UTF-8 bytes." },
    workload: WORKLOAD.map(({ flow, sourceId, recordId }) => ({ flow, sourceId, recordId, owner: canonicalOwnerForFlow(flow) })),
    checks,
    checkCount: checks.length,
    metrics,
    limitations: [
      "The workload uses synthetic donor identities and the current Omnevum-owned store; no donor source, database, credential, sync authority, or plugin was imported.",
      "This proves the selected shell plus selective-harvest contract boundary; it does not admit the rejected NeumanOS UI or prove WebKit/Firefox, assistive technology, production rollback, real quota/process faults, security/egress, or human acceptance.",
      "Utopia remains architecture-only because its recorded license/runtime constraints are not qualified for code adoption."
    ]
  };
} catch (error) {
  result = { schemaVersion: 1, kind: "launchpad-transplant-benchmark-result", status: "FAIL", authority: "Current v0.18 canonical-core transplantability proof; fail-closed on invariant failure.", current: { revision, workingTree, sourceFiles, sourceSha256 }, checks, checkCount: checks.length, metrics, error: error instanceof Error ? error.message : String(error) };
  process.exitCode = 1;
} finally {
  await vite?.close();
}

console.log(result.status === "PASS" ? "LAUNCHPAD_TRANSPLANT_BENCHMARK_PASS" : "LAUNCHPAD_TRANSPLANT_BENCHMARK_FAIL");
console.log(JSON.stringify(result, null, 2));

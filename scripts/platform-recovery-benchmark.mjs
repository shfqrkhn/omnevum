import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = process.platform === "win32" ? "git.exe" : "git";
const FIXTURE_TIME = "2026-09-20T00:00:00.000Z";
const benchmarkDatabasePrefix = `omnevum-platform-recovery-${process.pid}`;
const sourceFiles = [
  ".github/workflows/pages.yml",
  "index.html",
  "public/recovery.html",
  "public/sw.js",
  "scripts/platform-recovery-benchmark.mjs",
  "src/core/migration.ts",
  "src/core/presentation.ts",
  "src/core/storage.ts",
  "src/core/update-ledger.ts",
  "src/core/vault.ts",
  "vite.config.ts"
].sort();

const read = (path) => readFileSync(join(root, path));
const readText = (path) => read(path).toString("utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const currentRevision = execFileSync(git, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const workingTree = execFileSync(git, ["status", "--short"], { cwd: root, encoding: "utf8" }).trim();
const current = {
  revision: currentRevision,
  workingTree,
  sourceFiles,
  sourceSha256: sha256(sourceFiles.map((path) => `${path}\0${readText(path)}`).join("\0")),
  sourceHashDefinition: "SHA-256 of sorted repository-relative source paths and exact current UTF-8 bytes."
};

const checks = [];
const metrics = {};
const assert = (condition, message) => {
  if (!condition) throw new Error(`PLATFORM_RECOVERY_BENCHMARK_FAIL: ${message}`);
};
const check = (name, condition, message) => {
  assert(condition, message);
  checks.push(name);
};
const record = (id, text, revision = 1, overrides = {}) => ({
  id,
  recordType: "note",
  owner: "core.capture",
  schemaVersion: 1,
  createdAt: FIXTURE_TIME,
  modifiedAt: FIXTURE_TIME,
  provenance: { source: "USER_INPUT", capturedAt: FIXTURE_TIME, sourceId: id },
  truthClass: "USER_OBSERVATION",
  sensitivity: "PRIVATE",
  revision,
  deleted: false,
  data: { text },
  ...overrides
});

function openInterruptedUpgrade(databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 7);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("benchmark-interruption-marker")) request.result.createObjectStore("benchmark-interruption-marker");
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      request.result.close();
      reject(new Error("Interrupted migration unexpectedly completed"));
    };
    request.onerror = () => resolve();
    request.onblocked = () => reject(new Error("Interrupted migration upgrade was blocked"));
  });
}

async function runStorageBenchmark({ CanonicalStore }) {
  let usageBytes = 10;
  const databaseName = `${benchmarkDatabasePrefix}-quota`;
  const store = new CanonicalStore(databaseName, {
    estimateStorage: async () => ({ usageBytes, quotaBytes: 100 }),
    requestPersistentStorage: async () => true
  });
  await store.open();
  try {
    const original = record("platform-recovery-quota-record", "quota sentinel");
    await store.put(original);
    await store.search("quota sentinel");
    const normal = await store.health();
    check("quota-normal-index", normal.searchIndexValid && normal.storage?.pressure === "NORMAL", "baseline search state was not valid before pressure");

    usageBytes = 90;
    const pressured = await store.health();
    const retained = await store.get(original.id);
    const retainedHistory = await store.history(original.id);
    check("quota-derived-reclaim", pressured.storage?.pressure === "ELEVATED" && pressured.storage.reclaimedDerivedState === true && pressured.searchIndexValid === false, "elevated pressure did not reclaim only the derived search state");
    check("quota-canonical-preservation", retained?.id === original.id && retained.data.text === original.data.text && retainedHistory.length === 1, "quota reclamation lost canonical data or revision history");

    await store.rebuildSearchIndex();
    const repaired = await store.health();
    check("quota-derived-rebuild", repaired.searchIndexValid && repaired.storage?.reclaimedDerivedState === false && (await store.get(original.id))?.id === original.id, "rebuilding derived state did not converge without changing the canonical record");
    metrics.quotaPressure = {
      quotaBytes: 100,
      usageBytes: 90,
      pressure: pressured.storage?.pressure,
      canonicalRecordsPreserved: Number((await store.list(true)).length),
      historyEntriesPreserved: retainedHistory.length,
      derivedStateReclaimed: pressured.storage?.reclaimedDerivedState === true,
      derivedStateRebuilt: repaired.searchIndexValid
    };
  } finally {
    store.close();
  }

  const staleDatabaseName = `${benchmarkDatabasePrefix}-stale-client`;
  const staleClient = new CanonicalStore(staleDatabaseName);
  await staleClient.open();
  try {
    const staleRecord = record("platform-recovery-stale-client", "stale client sentinel");
    await staleClient.put(staleRecord);
    const upgrade = indexedDB.open(staleDatabaseName, 7);
    const upgradedDatabase = await new Promise((resolve, reject) => {
      upgrade.onupgradeneeded = () => {
        if (!upgrade.result.objectStoreNames.contains("stale-client-marker")) upgrade.result.createObjectStore("stale-client-marker");
      };
      upgrade.onsuccess = () => resolve(upgrade.result);
      upgrade.onerror = () => reject(upgrade.error ?? new Error("Stale-client upgrade failed"));
      upgrade.onblocked = () => reject(new Error("Stale-client upgrade was blocked"));
    });
    upgradedDatabase.close();
    let staleClientRejected = false;
    try {
      await staleClient.get(staleRecord.id);
    } catch (error) {
      staleClientRejected = error instanceof Error && error.message.includes("Store is not open");
    }
    check("stale-client-fencing", staleClientRejected, "a client that received IndexedDB versionchange did not fail closed");
    metrics.staleClient = { versionUpgradeCompleted: true, staleClientRejected };
  } finally {
    staleClient.close();
  }

  const interruptedDatabaseName = `${benchmarkDatabasePrefix}-interrupted-migration`;
  const beforeMigration = new CanonicalStore(interruptedDatabaseName);
  await beforeMigration.open();
  const migrationRecord = record("platform-recovery-interrupted-migration", "migration sentinel");
  await beforeMigration.put(migrationRecord);
  beforeMigration.close();
  await openInterruptedUpgrade(interruptedDatabaseName);
  const afterMigration = new CanonicalStore(interruptedDatabaseName);
  await afterMigration.open();
  try {
    check("interrupted-migration-preservation", (await afterMigration.get(migrationRecord.id))?.data.text === migrationRecord.data.text, "an aborted IndexedDB migration did not preserve the prior canonical record");
    metrics.interruptedMigration = { migrationAborted: true, canonicalRecordsPreserved: (await afterMigration.list(true)).length };
  } finally {
    afterMigration.close();
  }
}

async function runUpdateBenchmark({ migration, updateLedger }) {
  const shellCandidate = {
    releaseId: "shell-benchmark-2",
    shellVersion: "0.2.0",
    sourceRevision: "benchmark-shell-source",
    artifactDigest: "a".repeat(64),
    kind: "SHELL_ONLY",
    currentSchemaVersion: 1,
    targetSchemaVersion: 1,
    migrations: [],
    rollbackPath: "retain-previous-shell-cache",
    readCompatible: true
  };
  const schemaCandidate = {
    releaseId: "schema-benchmark-2",
    shellVersion: "0.3.0",
    sourceRevision: "benchmark-schema-source",
    artifactDigest: "b".repeat(64),
    kind: "CANONICAL_SCHEMA",
    currentSchemaVersion: 1,
    targetSchemaVersion: 2,
    migrations: [{ id: "records-v2", description: "Add bounded typed metadata", affectedRecordClasses: ["note"], fromSchemaVersion: 1, toSchemaVersion: 2 }],
    rollbackPath: "restore-vault-before-records-v2",
    readCompatible: false
  };
  const shellEvaluation = migration.evaluateUpdate(shellCandidate, FIXTURE_TIME);
  const shellActivation = migration.evaluateShellActivation(shellCandidate, false);
  const shellLedger = migration.makeUpdateLedgerEntry(shellCandidate, FIXTURE_TIME, shellEvaluation);
  check("shell-update-policy", shellEvaluation.decision === "APPLY_SILENTLY" && shellEvaluation.backupRequired === false && shellActivation.decision === "ACTIVATE", "shell-only update was not admitted with its no-schema-change policy");
  check("shell-rollback-receipt", shellLedger.rollbackPath === shellCandidate.rollbackPath, "shell update ledger did not preserve its rollback path");

  const missingBackup = migration.evaluateUpdate(schemaCandidate, FIXTURE_TIME, undefined, false);
  const blockedActivation = migration.evaluateShellActivation(schemaCandidate, false);
  const interrupted = migration.interruptedMigration(schemaCandidate);
  check("migration-approval-gate", missingBackup.decision === "REQUIRE_APPROVAL" && missingBackup.backupState === "MISSING" && missingBackup.backupRequired && blockedActivation.decision === "REFUSE_CONTROL", "canonical migration bypassed approval or backup gating");
  check("migration-interruption-rollback", interrupted.canonicalData === "RETAIN_CURRENT_SCHEMA" && interrupted.shell === "CURRENT_SHELL" && interrupted.rollbackPath === schemaCandidate.rollbackPath, "interrupted migration did not retain the current schema/shell rollback path");

  const staleBackup = { verifiedAt: "2026-09-18T00:00:00.000Z", digest: "c".repeat(64), recordCount: 1, artifactCount: 0 };
  const staleEvaluation = migration.evaluateUpdate(schemaCandidate, FIXTURE_TIME, staleBackup, true);
  const currentBackup = { verifiedAt: "2026-09-19T12:00:00.000Z", digest: "d".repeat(64), recordCount: 1, artifactCount: 0 };
  const approvedEvaluation = migration.evaluateUpdate(schemaCandidate, FIXTURE_TIME, currentBackup, true);
  const approvedActivation = migration.evaluateShellActivation(schemaCandidate, true);
  check("migration-stale-backup-rejection", staleEvaluation.decision === "REQUIRE_APPROVAL" && staleEvaluation.backupState === "STALE" && staleEvaluation.backupRequired, "a stale backup receipt was treated as sufficient for schema migration");
  check("migration-approved-path", approvedEvaluation.decision === "APPLY_AFTER_APPROVAL" && approvedEvaluation.backupState === "CURRENT" && approvedActivation.decision === "ACTIVATE", "approved migration with a current verified backup did not reach the apply path");

  const waiting = updateLedger.appendShellUpdateObservation([], { releaseId: "omnevum-shell-benchmark", shellVersion: "0.2.0", cacheName: "omnevum-shell-benchmark", observedAt: FIXTURE_TIME, decision: "WAITING", rollbackPath: "retain-previous-shell-cache" });
  const rolledBack = updateLedger.appendShellUpdateObservation(waiting, { releaseId: "omnevum-shell-benchmark", shellVersion: "0.2.0", cacheName: "omnevum-shell-benchmark", observedAt: FIXTURE_TIME, decision: "ROLLED_BACK", rollbackPath: "retain-previous-shell-cache" });
  check("service-worker-rollback-ledger", rolledBack.some((entry) => entry.decision === "ROLLED_BACK" && entry.rollbackPath === "retain-previous-shell-cache"), "service-worker rollback decision did not remain observable");
  metrics.updatePolicy = {
    shellDecision: shellEvaluation.decision,
    missingBackupDecision: missingBackup.decision,
    staleBackupState: staleEvaluation.backupState,
    approvedDecision: approvedEvaluation.decision,
    rollbackPathChecks: 4,
    serviceWorkerLedgerEntries: rolledBack.length
  };
}

async function runVaultBenchmark({ CanonicalStore, vault }) {
  const source = new CanonicalStore(`${benchmarkDatabasePrefix}-vault-source`);
  const destination = new CanonicalStore(`${benchmarkDatabasePrefix}-vault-destination`);
  await source.open();
  await destination.open();
  try {
    const original = record("platform-recovery-vault-record", "Vault idempotence sentinel");
    await source.put(original);
    const exported = await source.exportVault();
    const serialized = JSON.stringify(exported);
    const parsed = vault.parseVault(serialized);
    await vault.verifyVaultIntegrity(parsed);
    check("vault-integrity-receipt", typeof parsed.integrity?.digest === "string" && parsed.integrity.digest.length === 64, "exported Vault did not carry a SHA-256 integrity receipt");

    const firstImport = await destination.importVault(parsed);
    const secondImport = await destination.importVault(parsed);
    check("vault-idempotent-reimport", firstImport.imported === 1 && secondImport.imported === 0 && secondImport.skipped === 1 && secondImport.conflicts === 0, "re-importing the same Vault was not idempotent");
    check("vault-round-trip-fingerprint", (await vault.fingerprintVault(exported)) === (await vault.fingerprintVault(await destination.exportVault())), "Vault restore changed the portable state fingerprint");

    const tampered = { ...parsed, exportedAt: "2026-09-20T00:00:01.000Z" };
    let tamperRejected = false;
    try {
      await destination.importVault(tampered);
    } catch (error) {
      tamperRejected = error instanceof Error && error.message.includes("integrity");
    }
    check("vault-tamper-rejection", tamperRejected && (await destination.list()).length === 1, "a tampered integrity-protected Vault was not rejected before writing");
    metrics.vault = {
      exportedRecords: parsed.records.length,
      integrityAlgorithm: parsed.integrity?.algorithm,
      firstImport: firstImport.imported,
      secondImportSkipped: secondImport.skipped,
      roundTripFingerprintEqual: true,
      tamperedImportRejected: tamperRejected
    };
  } finally {
    source.close();
    destination.close();
  }
}

async function runPresentationBenchmark({ CanonicalStore, presentation }) {
  const store = new CanonicalStore(`${benchmarkDatabasePrefix}-presentation`);
  await store.open();
  try {
    await store.setSetting("presentation", { schemaVersion: 99, productName: "invalid", family: "untrusted", theme: "neon", navigation: { visible: [] } });
    const stored = await store.getSetting("presentation");
    const normalResolution = presentation.resolvePresentationProfile(stored, false);
    const safeResolution = presentation.resolvePresentationProfile(stored, true);
    const requiredSections = ["assistant", "recovery", "presentation"];
    check("safe-mode-invalid-profile", normalResolution.storedProfileValid === false && requiredSections.every((section) => normalResolution.profile.navigation.visible.includes(section)), "an invalid stored presentation profile did not resolve to a recoverable profile");
    check("safe-mode-default-presentation", safeResolution.safeMode && safeResolution.profile.family === presentation.DEFAULT_PRESENTATION.family && safeResolution.profile.density === "compact" && requiredSections.every((section) => safeResolution.profile.navigation.visible.includes(section)), "Safe Mode did not restore the compact default presentation with recovery surfaces");
    metrics.safeMode = {
      storedProfileValid: normalResolution.storedProfileValid,
      fallbackFamily: normalResolution.profile.family,
      safeModeFamily: safeResolution.profile.family,
      safeModeDensity: safeResolution.profile.density,
      recoverySurfacesRetained: requiredSections.length
    };
  } finally {
    store.close();
  }
}

function runStaticHostBenchmark() {
  const index = readText("index.html");
  const recovery = readText("public/recovery.html");
  const serviceWorker = readText("public/sw.js");
  const viteConfig = readText("vite.config.ts");
  const pagesWorkflow = readText(".github/workflows/pages.yml");
  const indexCsp = index.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u)?.[1] ?? "";
  const recoveryCsp = recovery.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u)?.[1] ?? "";
  check("static-index-csp", indexCsp.includes("default-src 'self'") && indexCsp.includes("object-src 'none'") && indexCsp.includes("form-action 'self'") && indexCsp.includes("script-src 'self'") && !/frame-ancestors\s/iu.test(indexCsp), "the baseline app CSP is missing an enforceable browser control or claims unsupported frame-ancestors delivery");
  check("static-recovery-isolation", recovery.includes('data-console="OMNEVUM_LAST_RESORT_RECOVERY"') && recoveryCsp.includes("default-src 'none'") && recoveryCsp.includes("connect-src 'none'") && !/<(?:script|link|img)[^>]+(?:src|href)=['"](?:https?:|\/\/)/iu.test(recovery) && !/<script[^>]+type=['"]module['"]/iu.test(recovery), "the independent recovery route has a remote/module dependency or lacks its no-network boundary");
  check("static-relative-deployment", /base:\s*["']\.\/["']/u.test(viteConfig) && pagesWorkflow.includes("path: ./dist") && pagesWorkflow.includes("actions/deploy-pages@v4"), "the static deployment path is not explicitly relative and Pages-owned");
  check("static-service-worker-boundary", serviceWorker.includes("const CACHE_PREFIX = \"omnevum-shell-\";") && serviceWorker.includes("self.addEventListener(\"fetch\""), "the service-worker source does not expose its owned cache/fetch boundary");
  metrics.staticHost = {
    baseline: "GitHub Pages constrained static HTTPS profile",
    applicationControlsChecked: ["meta CSP", "independent no-network recovery route", "relative Vite base", "owned service-worker cache/fetch"],
    responseHeaders: "NOT_PROJECT_CONTROLLED",
    headerDependentOptionalFeatures: "NOT_ADMITTED_BY_THIS_BENCHMARK",
    liveResponseHeadersChecked: false
  };
}

let vite;
let result;
try {
  vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { hmr: false, middlewareMode: true } });
  const [storage, migration, updateLedger, vault, presentation] = await Promise.all([
    vite.ssrLoadModule("/src/core/storage.ts"),
    vite.ssrLoadModule("/src/core/migration.ts"),
    vite.ssrLoadModule("/src/core/update-ledger.ts"),
    vite.ssrLoadModule("/src/core/vault.ts"),
    vite.ssrLoadModule("/src/core/presentation.ts")
  ]);
  await runStorageBenchmark(storage);
  await runUpdateBenchmark({ migration, updateLedger });
  await runVaultBenchmark({ CanonicalStore: storage.CanonicalStore, vault });
  await runPresentationBenchmark({ CanonicalStore: storage.CanonicalStore, presentation });
  runStaticHostBenchmark();
  result = {
    schemaVersion: 1,
    kind: "platform-recovery-benchmark-result",
    status: "PASS",
    authority: "Current v0.18 source-contract and fake-IndexedDB benchmark; not release, deployment, human-acceptance, or cross-browser evidence.",
    current,
    coveredAreas: [
      "quota-pressure derived-state reclamation with canonical preservation",
      "interrupted IndexedDB migration and stale-client versionchange fencing",
      "shell/schema update approval, migration interruption, and rollback paths",
      "Vault integrity, tamper rejection, round-trip, and idempotent re-import",
      "Safe Mode recovery from an invalid presentation profile",
      "constrained static-host application controls and unavailable response-header controls"
    ],
    checks,
    checkCount: checks.length,
    metrics,
    limitations: [
      "Synthetic deterministic fixtures only; no real user data, credentials, network effects, or production database are used.",
      "fake-indexeddb models IndexedDB API behavior but does not prove browser-specific quota, eviction, corruption, durability, concurrency, or private-mode behavior.",
      "The migration interruption and stale-client checks use a synthetic IndexedDB version upgrade; real browser tabs, process crashes, and OS interruption remain untested here.",
      "Static source checks cannot prove live HTTP response headers, HSTS, host-added headers, TLS configuration, CDN behavior, or browser enforcement; those require deployed target probes.",
      "Safe Mode resolution is tested through the current presentation API and persisted setting seam, not assistive-technology or human acceptance.",
      "This benchmark does not change package scripts, controls, evidence, UI, deployment artifacts, or release status."
    ]
  };
} catch (error) {
  result = {
    schemaVersion: 1,
    kind: "platform-recovery-benchmark-result",
    status: "FAIL",
    authority: "Current v0.18 source-contract and fake-IndexedDB benchmark; fail-closed on invariant failure.",
    current,
    checks,
    checkCount: checks.length,
    metrics,
    error: error instanceof Error ? error.message : String(error)
  };
  process.exitCode = 1;
} finally {
  await vite?.close();
}

console.log(result.status === "PASS" ? "PLATFORM_RECOVERY_BENCHMARK_PASS" : "PLATFORM_RECOVERY_BENCHMARK_FAIL");
console.log(JSON.stringify(result, null, 2));

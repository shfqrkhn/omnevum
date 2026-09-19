import "./styles.css";
import { CommandBus } from "./core/commands";
import { CanonicalStore } from "./core/storage";
import { CapabilityRuntime } from "./core/capability-runtime";
import { EffectRunner } from "./core/effect-runner";
import { PackageAutomationRegistry } from "./core/package-automation-registry";
import { CORE_AUTOMATION_PACKAGE, PackageAutomationRuntime } from "./core/package-automation-runtime";
import { PackageRegistry } from "./core/package-contract";
import { mountApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Omnevum app root is missing");

const store = new CanonicalStore();
try {
  await store.open();
  if (new URLSearchParams(window.location.search).get("search-degraded-preview") === "1") {
    await store.invalidateSearchIndex();
  }
  await new EffectRunner(store).recoverInterrupted();
  const commands = new CommandBus(store);
  const packages = new PackageRegistry();
  packages.install(CORE_AUTOMATION_PACKAGE);
  const packageAutomationRuntime = new PackageAutomationRuntime(new PackageAutomationRegistry(packages), store);
  await packageAutomationRuntime.restore();
  const capabilityRuntime = new CapabilityRuntime([
    { id: "core.canonical", critical: true, start: async () => { await store.health(); } },
    { id: "core.search", start: async () => {
      const searchHealth = await store.getSearchHealth();
      if (!searchHealth.valid) throw new Error(`Search index is ${searchHealth.invalidReason?.toLowerCase() ?? "unavailable"}`);
    } },
    { id: "core.recovery", critical: true, start: async () => { await store.exportDiagnostics(); } }
  ]);
  await capabilityRuntime.start(undefined);
  await mountApp(root, store, commands, capabilityRuntime, packageAutomationRuntime);

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
      const health = root.querySelector<HTMLElement>("#health-status");
      if (health) health.textContent = `${health.textContent ?? ""} Offline shell registration is unavailable on this target.`;
    });
  }
} catch (error) {
  root.innerHTML = `
    <main class="failure-shell" aria-labelledby="failure-heading">
      <section class="panel">
        <p class="eyebrow">Recovery</p>
        <h1 id="failure-heading">Local storage needs attention</h1>
        <p id="failure-message" role="alert">Omnevum could not open its canonical store. Existing data was not deleted.</p>
        <div class="form-row">
          <button id="retry-storage" type="button">Retry</button>
          <button id="export-failure-state" class="secondary" type="button">Export retained state</button>
          <button id="repair-failure-state" class="secondary" type="button">Repair from retained snapshot</button>
        </div>
        <p id="failure-status" class="hint" role="status"></p>
      </section>
    </main>
  `;
  const message = root.querySelector<HTMLElement>("#failure-message");
  if (message && error instanceof Error) message.textContent = `${message.textContent} ${error.message}`;
  root.querySelector<HTMLButtonElement>("#retry-storage")?.addEventListener("click", () => window.location.reload());
  root.querySelector<HTMLButtonElement>("#export-failure-state")?.addEventListener("click", async () => {
    const status = root.querySelector<HTMLElement>("#failure-status");
    try {
      const retainedState = await store.exportRetainedState();
      const isVault = retainedState.format === "OMNEVUM_VAULT";
      const blob = new Blob([JSON.stringify(retainedState, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = isVault ? "omnevum-recovery-vault.json" : "omnevum-recovery-snapshot.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (status) status.textContent = isVault ? "Retained Vault exported; canonical records were not changed." : "Read-only recovery snapshot exported; canonical state was not changed. Repair or restore it before resuming writes.";
    } catch (exportError) {
      if (status) status.textContent = exportError instanceof Error ? exportError.message : "Recovery export failed";
    }
  });
  root.querySelector<HTMLButtonElement>("#repair-failure-state")?.addEventListener("click", async () => {
    const status = root.querySelector<HTMLElement>("#failure-status");
    try {
      const retainedState = await store.exportRetainedState();
      if (retainedState.format !== "OMNEVUM_RECOVERY_SNAPSHOT") {
        if (status) status.textContent = "The retained state is already a valid Vault; use Retry to reopen it.";
        return;
      }
      if (!window.confirm("Repair the canonical store from valid records in the retained snapshot? Malformed rows will be removed after this read-only snapshot remains available.")) return;
      const result = await store.repairFromRecoverySnapshot(retainedState);
      if (status) status.textContent = `Recovery repair retained ${result.retainedRecords} record(s), removed ${result.removedRecords} malformed record(s), and retained ${result.retainedHistory} history entr${result.retainedHistory === 1 ? "y" : "ies"}. Reload to resume normal operation.`;
    } catch (repairError) {
      if (status) status.textContent = repairError instanceof Error ? repairError.message : "Recovery repair failed";
    }
  });
}

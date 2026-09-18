import "./styles.css";
import { CommandBus } from "./core/commands";
import { CanonicalStore } from "./core/storage";
import { mountApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Omnevum app root is missing");

const store = new CanonicalStore();
try {
  await store.open();
  const commands = new CommandBus(store);
  await mountApp(root, store, commands);

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
          <button id="export-failure-vault" class="secondary" type="button">Export retained Vault</button>
        </div>
        <p id="failure-status" class="hint" role="status"></p>
      </section>
    </main>
  `;
  const message = root.querySelector<HTMLElement>("#failure-message");
  if (message && error instanceof Error) message.textContent = `${message.textContent} ${error.message}`;
  root.querySelector<HTMLButtonElement>("#retry-storage")?.addEventListener("click", () => window.location.reload());
  root.querySelector<HTMLButtonElement>("#export-failure-vault")?.addEventListener("click", async () => {
    const status = root.querySelector<HTMLElement>("#failure-status");
    try {
      const vault = await store.exportVault();
      const blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "omnevum-recovery-vault.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (status) status.textContent = "Retained Vault exported; canonical records were not changed.";
    } catch (exportError) {
      if (status) status.textContent = exportError instanceof Error ? exportError.message : "Recovery export failed";
    }
  });
}

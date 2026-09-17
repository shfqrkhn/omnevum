import type { CommandBus } from "../core/commands";
import { parsePresentationProfile, type PresentationProfile } from "../core/presentation";
import { parseVault } from "../core/vault";
import type { CanonicalStore } from "../core/storage";

export async function mountApp(root: HTMLElement, store: CanonicalStore, commands: CommandBus): Promise<void> {
  let presentation: PresentationProfile = parsePresentationProfile(await store.getSetting<unknown>("presentation"));
  root.dataset.theme = presentation.theme;
  document.documentElement.dataset.theme = presentation.theme;
  root.innerHTML = `
    <header class="topbar">
      <div>
        <p id="product-label" class="eyebrow"></p>
        <h1 id="product-heading">Life, in context.</h1>
        <p class="lede">A private, local-first place to capture what matters.</p>
      </div>
      <button id="theme-toggle" class="secondary" type="button" aria-pressed="false">AMOLED dark</button>
    </header>
    <main>
      <section class="status-card" aria-labelledby="status-heading">
        <div>
          <p class="eyebrow">System</p>
          <h2 id="status-heading">Local foundation ready</h2>
          <p id="health-status" role="status">Canonical records stay in this browser until you export them.</p>
        </div>
        <span class="status-pill">LOCAL</span>
      </section>

      <section id="presentation" class="panel" aria-labelledby="presentation-heading">
        <p class="eyebrow">Personalization</p>
        <h2 id="presentation-heading">Make it yours</h2>
        <form id="presentation-form">
          <label for="product-name">App name</label>
          <div class="form-row">
            <input id="product-name" name="productName" type="text" maxlength="80" required />
            <button type="submit">Save name</button>
          </div>
          <p id="presentation-status" class="hint" role="status">Presentation settings are inert and do not change canonical IDs.</p>
        </form>
      </section>

      <section id="capture" class="panel" aria-labelledby="capture-heading">
        <p class="eyebrow">Capture</p>
        <h2 id="capture-heading">Get it out of your head</h2>
        <form id="capture-form">
          <label for="capture-type">Kind</label>
          <select id="capture-type" name="recordType">
            <option value="note">Note</option>
            <option value="task">Task</option>
            <option value="observation">Observation</option>
          </select>
          <label for="capture-text">Note</label>
          <textarea id="capture-text" name="text" rows="4" maxlength="5000" required placeholder="Capture a thought, task, observation, or question."></textarea>
          <div class="form-row">
            <span class="hint">Stored as a private user observation.</span>
            <button type="submit">Save capture</button>
          </div>
        </form>
      </section>

      <section id="search" class="panel" aria-labelledby="search-heading">
        <p class="eyebrow">Search / Explore</p>
        <h2 id="search-heading">Find across your captures</h2>
        <form id="search-form" class="search-form">
          <label for="search-query">Search terms</label>
          <div class="form-row search-row">
            <input id="search-query" name="query" type="search" placeholder="Try a word or phrase" autocomplete="off" />
            <button type="submit">Search</button>
            <button id="clear-search" class="secondary" type="button">Clear</button>
          </div>
          <p id="search-status" class="hint" role="status"></p>
        </form>
      </section>

      <section id="records" class="panel" aria-labelledby="records-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Canonical records</p>
            <h2 id="records-heading">Recent captures</h2>
          </div>
          <span id="record-count" class="count" aria-label="record count">0</span>
        </div>
        <ul id="record-list" class="record-list"></ul>
        <p id="empty-state" class="empty-state">Nothing captured yet.</p>
      </section>

      <section id="recovery" class="panel" aria-labelledby="recovery-heading">
        <p class="eyebrow">Recovery</p>
        <h2 id="recovery-heading">Keep a portable copy</h2>
        <p class="hint">Vault export is the first off-origin recovery path. Import validates the format before writing.</p>
        <div class="form-row recovery-row">
          <button id="export-vault" class="secondary" type="button">Export Vault</button>
          <label class="file-button secondary" for="import-vault">Import Vault</label>
          <input id="import-vault" type="file" accept="application/json,.json" />
        </div>
        <p id="recovery-status" class="hint" role="status"></p>
      </section>
    </main>
    <footer><span>Phase 0 foundation</span><span>AI and sync are optional and not active.</span></footer>
  `;

  const captureForm = root.querySelector<HTMLFormElement>("#capture-form");
  const captureType = root.querySelector<HTMLSelectElement>("#capture-type");
  const captureText = root.querySelector<HTMLTextAreaElement>("#capture-text");
  const searchForm = root.querySelector<HTMLFormElement>("#search-form");
  const searchQuery = root.querySelector<HTMLInputElement>("#search-query");
  const clearSearch = root.querySelector<HTMLButtonElement>("#clear-search");
  const searchStatus = root.querySelector<HTMLElement>("#search-status");
  const productLabel = root.querySelector<HTMLElement>("#product-label");
  const productName = root.querySelector<HTMLInputElement>("#product-name");
  const presentationForm = root.querySelector<HTMLFormElement>("#presentation-form");
  const presentationStatus = root.querySelector<HTMLElement>("#presentation-status");
  const recordList = root.querySelector<HTMLUListElement>("#record-list");
  const emptyState = root.querySelector<HTMLParagraphElement>("#empty-state");
  const recordCount = root.querySelector<HTMLElement>("#record-count");
  const recoveryStatus = root.querySelector<HTMLElement>("#recovery-status");
  const themeToggle = root.querySelector<HTMLButtonElement>("#theme-toggle");
  const exportButton = root.querySelector<HTMLButtonElement>("#export-vault");
  const importInput = root.querySelector<HTMLInputElement>("#import-vault");
  if (!captureForm || !captureType || !captureText || !searchForm || !searchQuery || !clearSearch || !searchStatus || !productLabel || !productName || !presentationForm || !presentationStatus || !recordList || !emptyState || !recordCount || !recoveryStatus || !themeToggle || !exportButton || !importInput) {
    throw new Error("Omnevum foundation controls are missing");
  }

  productLabel.textContent = `${presentation.productName} foundation`;
  productName.value = presentation.productName;
  themeToggle.textContent = presentation.theme === "dark" ? "Light theme" : "AMOLED dark";
  themeToggle.setAttribute("aria-pressed", String(presentation.theme === "dark"));

  const renderRecords = async (query = ""): Promise<void> => {
    const records = query.trim() ? await store.search(query) : await store.list();
    recordList.replaceChildren();
    recordCount.textContent = String(records.length);
    emptyState.hidden = records.length > 0;
    emptyState.textContent = query.trim() ? "No matching captures." : "Nothing captured yet.";

    for (const record of [...records].reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = record.recordType === "task" && record.data.status === "DONE" ? "task - done" : record.recordType;
      const text = document.createElement("p");
      text.textContent = String(record.data.text ?? "");
      const meta = document.createElement("small");
      meta.textContent = `${record.owner} - revision ${record.revision}`;
      content.append(title, text, meta);
      if (record.recordType === "task" && record.data.status !== "DONE") {
        const complete = document.createElement("button");
        complete.type = "button";
        complete.className = "icon-button complete-button";
        complete.textContent = "Complete";
        complete.addEventListener("click", async () => {
          await commands.update(record.id, { ...record.data, status: "DONE" });
          await renderRecords(searchQuery.value);
        });
        item.append(complete);
      }
      if (record.revision > 1) {
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "icon-button complete-button";
        undo.textContent = "Undo";
        undo.addEventListener("click", async () => {
          await commands.undo(record.id);
          await renderRecords(searchQuery.value);
        });
        item.append(undo);
      }
      const archive = document.createElement("button");
      archive.type = "button";
      archive.className = "icon-button";
      archive.textContent = "Archive";
      archive.addEventListener("click", async () => {
        await commands.archive(record.id);
        await renderRecords(searchQuery.value);
      });
      item.append(content, archive);
      recordList.append(item);
    }
  };

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = captureText.value.trim();
    if (!text) return;
    const recordType = captureType.value === "task" || captureType.value === "observation" ? captureType.value : "note";
    await commands.create({ recordType, owner: "core.capture", data: { text, ...(recordType === "task" ? { status: "OPEN" } : {}) } });
    captureForm.reset();
    await renderRecords(searchQuery.value);
    captureText.focus();
  });

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = searchQuery.value.trim();
    await renderRecords(query);
    const health = await store.getSearchHealth();
    searchStatus.textContent = query ? `${(await store.search(query)).length} result(s); derived index ${health.valid ? "healthy" : "rebuilding"}.` : "Showing all active records.";
  });

  clearSearch.addEventListener("click", async () => {
    searchQuery.value = "";
    searchStatus.textContent = "Showing all active records.";
    await renderRecords();
    searchQuery.focus();
  });

  themeToggle.addEventListener("click", () => {
    const dark = root.dataset.theme !== "dark";
    presentation = { ...presentation, theme: dark ? "dark" : "light" };
    root.dataset.theme = presentation.theme;
    document.documentElement.dataset.theme = presentation.theme;
    themeToggle.textContent = dark ? "Light theme" : "AMOLED dark";
    themeToggle.setAttribute("aria-pressed", String(dark));
    void store.setSetting("presentation", presentation);
  });

  presentationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextName = productName.value.trim().slice(0, 80);
    if (!nextName) return;
    presentation = { ...presentation, productName: nextName };
    await store.setSetting("presentation", presentation);
    productLabel.textContent = `${presentation.productName} foundation`;
    presentationStatus.textContent = `Saved ${presentation.productName}. Canonical identities are unchanged.`;
  });

  exportButton.addEventListener("click", async () => {
    const vault = await store.exportVault();
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "omnevum-vault.json";
    link.click();
    URL.revokeObjectURL(url);
    recoveryStatus.textContent = `Exported ${vault.records.length} record(s).`;
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const result = await store.importVault(parseVault(await file.text()));
      recoveryStatus.textContent = `Imported ${result.imported} record(s); skipped ${result.skipped}.`;
      await renderRecords();
    } catch (error) {
      recoveryStatus.textContent = error instanceof Error ? error.message : "Vault import failed";
    } finally {
      importInput.value = "";
    }
  });

  await renderRecords();
}

import type { CommandBus } from "../core/commands";
import { isCompletedTask, recordSpace, recordText, recordTriageStatus, type SpaceId } from "../core/domain";
import { getUiCopy } from "../core/i18n";
import { parsePresentationProfile, type PresentationProfile } from "../core/presentation";
import { parseVault } from "../core/vault";
import type { CanonicalStore } from "../core/storage";

export async function mountApp(root: HTMLElement, store: CanonicalStore, commands: CommandBus): Promise<void> {
  let presentation: PresentationProfile = parsePresentationProfile(await store.getSetting<unknown>("presentation"));
  const copy = getUiCopy(presentation.locale);
  root.dataset.theme = presentation.theme;
  document.documentElement.dataset.theme = presentation.theme;
  root.innerHTML = `
    <header class="topbar">
      <div>
        <p id="product-label" class="eyebrow"></p>
        <h1 id="product-heading">${copy.productHeading}</h1>
        <p class="lede">${copy.lede}</p>
      </div>
      <button id="theme-toggle" class="secondary" type="button" aria-pressed="false">${copy.themeDark}</button>
    </header>
    <main>
      <section class="status-card" aria-labelledby="status-heading">
        <div>
          <p class="eyebrow">${copy.system}</p>
          <h2 id="status-heading">${copy.ready}</h2>
        <p id="health-status" role="status">${copy.healthInitial}</p>
        </div>
        <span class="status-pill">${copy.local}</span>
      </section>

      <section id="home-summary" class="panel" aria-labelledby="summary-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${copy.home}</p>
            <h2 id="summary-heading">${copy.currentPicture}</h2>
          </div>
          <span id="summary-total" class="count" aria-label="${copy.activeRecordCount}">0</span>
        </div>
        <div id="summary-grid" class="summary-grid"></div>
      </section>

      <section id="presentation" class="panel" aria-labelledby="presentation-heading">
        <p class="eyebrow">${copy.personalization}</p>
        <h2 id="presentation-heading">${copy.makeItYours}</h2>
        <form id="presentation-form">
          <label for="product-name">${copy.appName}</label>
          <div class="form-row">
            <input id="product-name" name="productName" type="text" maxlength="80" required />
            <button type="submit">${copy.save}</button>
          </div>
          <label for="locale">${copy.language}</label>
          <select id="locale" name="locale">
            <option value="en-CA">${copy.english}</option>
            <option value="fr-CA">${copy.french}</option>
          </select>
          <p id="presentation-status" class="hint" role="status">${copy.presentationHint}</p>
        </form>
      </section>

      <section id="capture" class="panel" aria-labelledby="capture-heading">
        <p class="eyebrow">${copy.capture}</p>
        <h2 id="capture-heading">${copy.getItOut}</h2>
        <form id="capture-form">
          <label for="capture-type">${copy.kind}</label>
          <select id="capture-type" name="recordType">
            <option value="note">${copy.note}</option>
            <option value="task">${copy.task}</option>
            <option value="observation">${copy.observation}</option>
          </select>
          <label for="capture-space">${copy.space}</label>
          <select id="capture-space" name="space">
            <option value="personal">${copy.personal}</option>
            <option value="household">${copy.household}</option>
            <option value="work">${copy.work}</option>
          </select>
          <label for="capture-text">${copy.captureContent}</label>
          <textarea id="capture-text" name="text" rows="4" maxlength="5000" required placeholder="${copy.capturePlaceholder}"></textarea>
          <div class="form-row">
            <span class="hint">${copy.captureHint}</span>
            <button type="submit">${copy.saveCapture}</button>
          </div>
        </form>
      </section>

      <section id="search" class="panel" aria-labelledby="search-heading">
        <p class="eyebrow">${copy.searchExplore}</p>
        <h2 id="search-heading">${copy.findCaptures}</h2>
        <form id="search-form" class="search-form">
          <label for="search-query">${copy.searchTerms}</label>
          <div class="form-row search-row">
            <input id="search-query" name="query" type="search" placeholder="${copy.searchPlaceholder}" autocomplete="off" />
            <button type="submit">${copy.search}</button>
            <button id="clear-search" class="secondary" type="button">${copy.clear}</button>
          </div>
          <p id="search-status" class="hint" role="status"></p>
        </form>
      </section>

      <section id="review" class="panel" aria-labelledby="review-heading">
        <div class="section-heading">
          <div>
          <p class="eyebrow">${copy.triage}</p>
            <h2 id="review-heading">${copy.reviewInbox}</h2>
          </div>
          <span id="review-count" class="count" aria-label="${copy.inboxCount}">0</span>
        </div>
        <ul id="review-list" class="record-list"></ul>
        <p id="review-empty" class="empty-state">${copy.inboxClear}</p>
      </section>

      <section id="relate" class="panel" aria-labelledby="relate-heading">
        <p class="eyebrow">${copy.relate}</p>
        <h2 id="relate-heading">${copy.connectWithoutCopying}</h2>
        <form id="relate-form" class="relationship-form">
          <label for="relate-source">${copy.sourceRecord}</label>
          <select id="relate-source" name="source"></select>
          <label for="relate-target">${copy.targetRecord}</label>
          <select id="relate-target" name="target"></select>
          <label for="relate-label">${copy.relationship}</label>
          <input id="relate-label" name="relation" type="text" maxlength="120" value="related" />
          <button id="relate-submit" type="submit">${copy.createLink}</button>
          <p id="relate-status" class="hint" role="status">${copy.relationshipHint}</p>
        </form>
      </section>

      <section id="focus" class="panel" aria-labelledby="focus-heading">
        <p class="eyebrow">${copy.timeObserve}</p>
        <h2 id="focus-heading">${copy.focusHeading}</h2>
        <p class="hint">${copy.focusHint}</p>
        <div class="form-row">
          <button id="focus-toggle" type="button">${copy.startFocus}</button>
          <span id="focus-status" class="hint" role="status">${copy.noActiveSession}</span>
        </div>
      </section>

      <section id="records" class="panel" aria-labelledby="records-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${copy.canonicalRecords}</p>
            <h2 id="records-heading">${copy.recentCaptures}</h2>
          </div>
          <span id="record-count" class="count" aria-label="${copy.recordCount}">0</span>
        </div>
        <ul id="record-list" class="record-list"></ul>
        <p id="empty-state" class="empty-state">${copy.nothingCaptured}</p>
        <div class="section-heading archive-heading">
          <h3>${copy.archivedRecords}</h3>
          <button id="toggle-archive" class="secondary" type="button" aria-expanded="false">${copy.showArchived}</button>
        </div>
        <div id="archive-panel" hidden>
          <ul id="archive-list" class="record-list"></ul>
          <p id="archive-empty" class="empty-state">${copy.noArchived}</p>
        </div>
      </section>

      <section id="recovery" class="panel" aria-labelledby="recovery-heading">
        <p class="eyebrow">${copy.recovery}</p>
        <h2 id="recovery-heading">${copy.keepPortable}</h2>
        <p class="hint">${copy.recoveryHint}</p>
        <div class="form-row recovery-row">
          <button id="export-vault" class="secondary" type="button">${copy.exportVault}</button>
          <button id="export-diagnostics" class="secondary" type="button">${copy.exportDiagnostics}</button>
          <button id="repair-search" class="secondary" type="button">${copy.repairSearch}</button>
          <label class="file-button secondary" for="import-vault">${copy.importVault}</label>
          <input id="import-vault" type="file" accept="application/json,.json" />
          <label class="file-button secondary" for="artifact-input">${copy.attachArtifact}</label>
          <input id="artifact-input" type="file" />
        </div>
        <p id="recovery-status" class="hint" role="status"></p>
      </section>
    </main>
    <footer><span>${copy.footerPhase0}</span><span>${copy.footerOptional}</span></footer>
  `;

  const captureForm = root.querySelector<HTMLFormElement>("#capture-form");
  const captureType = root.querySelector<HTMLSelectElement>("#capture-type");
  const captureSpace = root.querySelector<HTMLSelectElement>("#capture-space");
  const captureText = root.querySelector<HTMLTextAreaElement>("#capture-text");
  const searchForm = root.querySelector<HTMLFormElement>("#search-form");
  const searchQuery = root.querySelector<HTMLInputElement>("#search-query");
  const clearSearch = root.querySelector<HTMLButtonElement>("#clear-search");
  const searchStatus = root.querySelector<HTMLElement>("#search-status");
  const summaryTotal = root.querySelector<HTMLElement>("#summary-total");
  const summaryGrid = root.querySelector<HTMLElement>("#summary-grid");
  const reviewList = root.querySelector<HTMLUListElement>("#review-list");
  const reviewCount = root.querySelector<HTMLElement>("#review-count");
  const reviewEmpty = root.querySelector<HTMLElement>("#review-empty");
  const relateForm = root.querySelector<HTMLFormElement>("#relate-form");
  const relateSource = root.querySelector<HTMLSelectElement>("#relate-source");
  const relateTarget = root.querySelector<HTMLSelectElement>("#relate-target");
  const relateLabel = root.querySelector<HTMLInputElement>("#relate-label");
  const relateSubmit = root.querySelector<HTMLButtonElement>("#relate-submit");
  const relateStatus = root.querySelector<HTMLElement>("#relate-status");
  const focusToggle = root.querySelector<HTMLButtonElement>("#focus-toggle");
  const focusStatus = root.querySelector<HTMLElement>("#focus-status");
  const productLabel = root.querySelector<HTMLElement>("#product-label");
  const productName = root.querySelector<HTMLInputElement>("#product-name");
  const localeInput = root.querySelector<HTMLSelectElement>("#locale");
  const presentationForm = root.querySelector<HTMLFormElement>("#presentation-form");
  const presentationStatus = root.querySelector<HTMLElement>("#presentation-status");
  const recordList = root.querySelector<HTMLUListElement>("#record-list");
  const emptyState = root.querySelector<HTMLParagraphElement>("#empty-state");
  const recordCount = root.querySelector<HTMLElement>("#record-count");
  const toggleArchive = root.querySelector<HTMLButtonElement>("#toggle-archive");
  const archivePanel = root.querySelector<HTMLElement>("#archive-panel");
  const archiveList = root.querySelector<HTMLUListElement>("#archive-list");
  const archiveEmpty = root.querySelector<HTMLParagraphElement>("#archive-empty");
  const recoveryStatus = root.querySelector<HTMLElement>("#recovery-status");
  const healthStatus = root.querySelector<HTMLElement>("#health-status");
  const themeToggle = root.querySelector<HTMLButtonElement>("#theme-toggle");
  const exportButton = root.querySelector<HTMLButtonElement>("#export-vault");
  const diagnosticsButton = root.querySelector<HTMLButtonElement>("#export-diagnostics");
  const repairSearchButton = root.querySelector<HTMLButtonElement>("#repair-search");
  const importInput = root.querySelector<HTMLInputElement>("#import-vault");
  const artifactInput = root.querySelector<HTMLInputElement>("#artifact-input");
  if (!captureForm || !captureType || !captureSpace || !captureText || !searchForm || !searchQuery || !clearSearch || !searchStatus || !summaryTotal || !summaryGrid || !reviewList || !reviewCount || !reviewEmpty || !relateForm || !relateSource || !relateTarget || !relateLabel || !relateSubmit || !relateStatus || !focusToggle || !focusStatus || !productLabel || !productName || !localeInput || !presentationForm || !presentationStatus || !recordList || !emptyState || !recordCount || !toggleArchive || !archivePanel || !archiveList || !archiveEmpty || !recoveryStatus || !healthStatus || !themeToggle || !exportButton || !diagnosticsButton || !repairSearchButton || !importInput || !artifactInput) {
    throw new Error("Omnevum foundation controls are missing");
  }

  productLabel.textContent = `${presentation.productName} ${copy.foundation}`;
  productName.value = presentation.productName;
  localeInput.value = presentation.locale;
  themeToggle.textContent = presentation.theme === "dark" ? copy.themeLight : copy.themeDark;
  themeToggle.setAttribute("aria-pressed", String(presentation.theme === "dark"));

  const typeLabel = (recordType: string): string => recordType === "task" ? copy.task : recordType === "observation" ? copy.observation : recordType === "artifact" ? copy.attachArtifact : recordType === "relationship" ? copy.relationship : copy.note;
  const spaceLabel = (space: SpaceId): string => space === "household" ? copy.household : space === "work" ? copy.work : copy.personal;

  const renderSummary = async (): Promise<void> => {
    const records = await store.list();
    summaryTotal.textContent = String(records.length);
    summaryGrid.replaceChildren();
    const counts = new Map<string, number>();
    for (const record of records) {
      const key = `${spaceLabel(recordSpace(record))} - ${typeLabel(record.recordType)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = copy.capturePicture;
      summaryGrid.append(empty);
      return;
    }
    for (const [label, count] of entries) {
      const card = document.createElement("div");
      card.className = "summary-item";
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const value = document.createElement("strong");
      value.textContent = String(count);
      card.append(labelElement, value);
      summaryGrid.append(card);
    }
  };

  const renderReview = async (): Promise<void> => {
    const records = (await store.list()).filter((record) => recordTriageStatus(record) === "INBOX");
    reviewList.replaceChildren();
    reviewCount.textContent = String(records.length);
    reviewEmpty.hidden = records.length > 0;
    for (const record of [...records].reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const text = document.createElement("p");
      text.textContent = `${typeLabel(record.recordType)}: ${recordText(record)}`;
      const review = document.createElement("button");
      review.type = "button";
      review.className = "icon-button complete-button";
      review.textContent = copy.markReviewed;
      review.addEventListener("click", async () => {
        await commands.update(record.id, { ...record.data, triageStatus: "REVIEWED" });
        await renderRecords(searchQuery.value);
      });
      item.append(text, review);
      reviewList.append(item);
    }
  };

  const renderRelationshipChoices = async (): Promise<void> => {
    const records = (await store.list()).filter((record) => record.recordType !== "relationship");
    for (const select of [relateSource, relateTarget]) {
      const previous = select.value;
      select.replaceChildren();
      for (const record of records) {
        const option = document.createElement("option");
        option.value = record.id;
        option.textContent = `${typeLabel(record.recordType)}: ${recordText(record).slice(0, 70)}`;
        select.append(option);
      }
      if (records.some((record) => record.id === previous)) select.value = previous;
    }
    relateSubmit.disabled = records.length < 2;
    if (records.length < 2) relateStatus.textContent = copy.atLeastTwo;
  };

  const renderArchived = async (): Promise<void> => {
    const records = (await store.list(true)).filter((record) => record.deleted).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    archiveList.replaceChildren();
    archiveEmpty.hidden = records.length > 0;
    for (const record of records) {
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${spaceLabel(recordSpace(record))} - ${typeLabel(record.recordType)}`;
      const text = document.createElement("p");
      text.textContent = recordText(record);
      const meta = document.createElement("small");
      meta.textContent = `${record.owner} - revision ${record.revision}`;
      content.append(title, text, meta);
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "icon-button complete-button";
      restore.textContent = copy.restore;
      restore.addEventListener("click", async () => {
        await commands.restore(record.id);
        await renderRecords(searchQuery.value);
      });
      item.append(content, restore);
      archiveList.append(item);
    }
  };

  const renderRecords = async (query = ""): Promise<void> => {
    const records = query.trim() ? await store.search(query) : await store.list();
    recordList.replaceChildren();
    recordCount.textContent = String(records.length);
    emptyState.hidden = records.length > 0;
    emptyState.textContent = query.trim() ? copy.noMatching : copy.nothingCaptured;

    for (const record of [...records].reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = isCompletedTask(record) ? copy.taskDone : `${spaceLabel(recordSpace(record))} - ${typeLabel(record.recordType)}`;
      const text = document.createElement("p");
      text.textContent = recordText(record);
      const meta = document.createElement("small");
      meta.textContent = `${record.owner} - revision ${record.revision}`;
      content.append(title, text, meta);
      if (record.recordType === "task" && !isCompletedTask(record)) {
        const complete = document.createElement("button");
        complete.type = "button";
        complete.className = "icon-button complete-button";
        complete.textContent = copy.complete;
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
        undo.textContent = copy.undo;
        undo.addEventListener("click", async () => {
          await commands.undo(record.id);
          await renderRecords(searchQuery.value);
        });
        item.append(undo);
      }
      const archive = document.createElement("button");
      archive.type = "button";
      archive.className = "icon-button";
      archive.textContent = copy.archive;
      archive.addEventListener("click", async () => {
        await commands.archive(record.id);
        await renderRecords(searchQuery.value);
      });
      item.append(content, archive);
      recordList.append(item);
    }
    await renderSummary();
    await renderReview();
    await renderRelationshipChoices();
    const healthBefore = await store.health();
    if (!healthBefore.searchIndexValid) await store.rebuildSearchIndex();
    const healthAfter = await store.health();
    healthStatus.textContent = copy.healthMessage(healthAfter.activeRecords, healthAfter.archivedRecords, healthAfter.historyEntries, healthAfter.artifactPayloads, healthAfter.searchIndexValid ? copy.healthy : copy.degraded);
    if (!archivePanel.hidden) await renderArchived();
  };

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = captureText.value.trim();
    if (!text) return;
    const recordType = captureType.value === "task" || captureType.value === "observation" ? captureType.value : "note";
    const space = (captureSpace.value === "household" || captureSpace.value === "work" ? captureSpace.value : "personal") satisfies SpaceId;
    await commands.create({ recordType, owner: "core.capture", data: { text, space, triageStatus: "INBOX", ...(recordType === "task" ? { status: "OPEN" } : {}) } });
    captureForm.reset();
    await renderRecords(searchQuery.value);
    captureText.focus();
  });

  let focusStartedAt: string | undefined;
  focusToggle.addEventListener("click", async () => {
    if (!focusStartedAt) {
      focusStartedAt = new Date().toISOString();
      focusToggle.textContent = copy.stopFocus;
      focusStatus.textContent = copy.startedMessage(new Date(focusStartedAt).toLocaleTimeString(presentation.locale));
      return;
    }
    const startedAt = focusStartedAt;
    const endedAt = new Date().toISOString();
    const durationMinutes = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000));
    await commands.create({
      recordType: "observation",
      owner: "platform.time",
      data: { text: "Focus session", kind: "focus-session", startedAt, endedAt, durationMinutes, space: "personal", triageStatus: "REVIEWED" }
    });
    focusStartedAt = undefined;
    focusToggle.textContent = copy.startFocus;
    focusStatus.textContent = copy.savedFocusMessage(durationMinutes);
    await renderRecords(searchQuery.value);
  });

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = searchQuery.value.trim();
    await renderRecords(query);
    const health = await store.getSearchHealth();
    searchStatus.textContent = query ? copy.resultMessage((await store.search(query)).length, health.valid ? copy.healthy : copy.degraded) : copy.showingAll;
  });

  relateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!relateSource.value || !relateTarget.value || relateSource.value === relateTarget.value) {
      relateStatus.textContent = copy.atLeastTwo;
      return;
    }
    const relation = relateLabel.value.trim() || "related";
    await commands.relate(relateSource.value, relateTarget.value, relation);
    relateStatus.textContent = copy.linkCreated;
    await renderRecords(searchQuery.value);
  });

  clearSearch.addEventListener("click", async () => {
    searchQuery.value = "";
    searchStatus.textContent = copy.showingAll;
    await renderRecords();
    searchQuery.focus();
  });

  toggleArchive.addEventListener("click", async () => {
    const showing = archivePanel.hidden;
    archivePanel.hidden = !showing;
    toggleArchive.setAttribute("aria-expanded", String(showing));
    toggleArchive.textContent = showing ? copy.hideArchived : copy.showArchived;
    if (showing) await renderArchived();
  });

  themeToggle.addEventListener("click", () => {
    const dark = root.dataset.theme !== "dark";
    presentation = { ...presentation, theme: dark ? "dark" : "light" };
    root.dataset.theme = presentation.theme;
    document.documentElement.dataset.theme = presentation.theme;
    themeToggle.textContent = dark ? copy.themeLight : copy.themeDark;
    themeToggle.setAttribute("aria-pressed", String(dark));
    void store.setSetting("presentation", presentation);
  });

  presentationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextName = productName.value.trim().slice(0, 80);
    if (!nextName) return;
    const nextLocale = localeInput.value === "fr-CA" ? "fr-CA" : "en-CA";
    const localeChanged = nextLocale !== presentation.locale;
    presentation = { ...presentation, productName: nextName, locale: nextLocale };
    await store.setSetting("presentation", presentation);
    if (localeChanged) {
      await mountApp(root, store, commands);
      return;
    }
    productLabel.textContent = `${presentation.productName} ${copy.foundation}`;
    presentationStatus.textContent = copy.savedName(presentation.productName);
  });

  exportButton.addEventListener("click", async () => {
    const vault = await store.exportVault();
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "omnevum-vault.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    recoveryStatus.textContent = copy.exportMessage(vault.records.length);
  });

  diagnosticsButton.addEventListener("click", async () => {
    const diagnostics = await store.exportDiagnostics();
    downloadJson("omnevum-diagnostics.json", diagnostics);
    recoveryStatus.textContent = copy.diagnosticsMessage;
  });

  repairSearchButton.addEventListener("click", async () => {
    await store.rebuildSearchIndex();
    recoveryStatus.textContent = copy.searchRepairMessage;
    await renderRecords(searchQuery.value);
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const result = await store.importVault(parseVault(await file.text()));
      recoveryStatus.textContent = copy.importedMessage(result.imported, result.skipped, result.conflicts);
      await renderRecords();
    } catch (error) {
      recoveryStatus.textContent = error instanceof Error ? error.message : "Vault import failed";
    } finally {
      importInput.value = "";
    }
  });

  artifactInput.addEventListener("change", async () => {
    const file = artifactInput.files?.[0];
    if (!file) return;
    try {
      const record = await commands.createArtifact({ fileName: file.name, mimeType: file.type || "application/octet-stream", blob: file, space: "personal" });
      recoveryStatus.textContent = copy.attachedMessage(String(record.data.fileName), Number(record.data.size));
      await renderRecords(searchQuery.value);
    } catch (error) {
      recoveryStatus.textContent = error instanceof Error ? error.message : "Artifact intake failed";
    } finally {
      artifactInput.value = "";
    }
  });

  await renderRecords();
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

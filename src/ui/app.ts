import type { CommandBus } from "../core/commands";
import { acceptCandidates, stageBlob, stageText, stageUrl, type AcquireCandidate, type AcquirePreview } from "../core/acquire";
import { isCompletedTask, recordSpace, recordText, recordTriageStatus, type SpaceId } from "../core/domain";
import { captureKindLabel, formatDateTime, formatNumber, getRecoveryCopy, getTimeCopy, getUiCopy, localeDirection } from "../core/i18n";
import { CAPTURE_KINDS, type CaptureKind } from "../core/model";
import { resolvePresentationProfile, type PresentationProfile } from "../core/presentation";
import { TrackService } from "../core/track";
import { makeReminderData, reconcileReminders } from "../core/time";
import { decryptVault, encryptVault, isEncryptedVaultEnvelope } from "../core/crypto";
import { MAX_VAULT_JSON_BYTES, parseVault } from "../core/vault";
import type { CanonicalStore } from "../core/storage";
import { captureExpense, captureHealthMeasurement } from "../core/workflows";
import { projectDataset } from "../core/data";
import { countRecords, groupCounts } from "../core/analysis";
import type { CapabilityRuntime } from "../core/capability-runtime";
import { DeviceInputBroker } from "../core/device";
import { SpaceService } from "../core/space";
import { historyWithDiffs } from "../core/history";
import { makeUserDashboard, projectView, ViewRegistry } from "../core/compose";
import { readPath } from "../core/data";
import { assessTextAnchor, createTextAnnotation } from "../core/annotation";
import { createEvidenceLink, type EvidenceRelation } from "../core/evidence";
import { makePlaceData, parseGeoJsonPoint } from "../core/place";

export async function mountApp(root: HTMLElement, store: CanonicalStore, commands: CommandBus, capabilityRuntime?: CapabilityRuntime<unknown>): Promise<void> {
  const rawPresentation = await store.getSetting<unknown>("presentation");
  const safePresentationMode = readSafePresentationMode();
  const presentationResolution = resolvePresentationProfile(rawPresentation, safePresentationMode);
  let presentation: PresentationProfile = presentationResolution.profile;
  const copy = getUiCopy(presentation.locale);
  const recoveryCopy = getRecoveryCopy(presentation.locale);
  const timeCopy = getTimeCopy(presentation.locale);
  root.dataset.theme = presentation.theme;
  document.documentElement.dataset.theme = presentation.theme;
  document.documentElement.lang = presentation.locale;
  document.documentElement.dir = localeDirection(presentation.locale);
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
         <span id="capability-status" class="status-pill">${copy.local}</span>
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
        <p id="analysis-status" class="hint" role="status"></p>
        <div class="section-heading insight-heading">
          <div>
            <p class="eyebrow">${copy.visualize}</p>
            <h3>${copy.signals}</h3>
          </div>
        </div>
        <div id="insights-grid" class="summary-grid"></div>
        <div class="section-heading insight-heading">
          <div>
            <p class="eyebrow">${timeCopy.reminders}</p>
            <h3>${timeCopy.dueOnResume}</h3>
          </div>
        </div>
        <div id="attention-panel" class="attention-panel" role="status"></div>
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
            ${CAPTURE_KINDS.map((kind) => `<option value="${kind}">${captureKindLabel(presentation.locale, kind)}</option>`).join("")}
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

      <section id="acquire" class="panel" aria-labelledby="acquire-heading">
        <p class="eyebrow">${copy.capture}</p>
        <h2 id="acquire-heading">${copy.acquireHeading}</h2>
        <form id="acquire-form">
          <label for="acquire-text">${copy.captureContent}</label>
          <textarea id="acquire-text" name="source" rows="4" maxlength="5242880" placeholder="${copy.acquirePlaceholder}"></textarea>
          <div class="form-row">
            <span class="hint">${copy.acquireHint}</span>
            <button type="submit">${copy.stageImport}</button>
          </div>
          <div class="form-row">
            <label class="file-button secondary" for="acquire-file">${copy.acquireFile}</label>
            <input id="acquire-file" type="file" accept="text/*,application/json,.json,.csv,.txt" />
            <button id="acquire-clipboard" class="secondary" type="button">${copy.readClipboard}</button>
          </div>
          <p id="acquire-status" class="hint" role="status"></p>
          <ul id="acquire-preview" class="record-list"></ul>
          <button id="accept-staged" class="secondary" type="button" disabled>${copy.acceptStaged}</button>
        </form>
      </section>

      <section id="track" class="panel" aria-labelledby="track-heading">
        <p class="eyebrow">${copy.track}</p>
        <h2 id="track-heading">${copy.trackHeading}</h2>
        <form id="track-form">
          <label for="track-name">${copy.metricName}</label>
          <input id="track-name" name="metricName" type="text" maxlength="120" required placeholder="${copy.trackPlaceholder}" />
          <label for="track-value">${copy.value}</label>
          <input id="track-value" name="value" type="number" inputmode="decimal" step="any" required />
          <label for="track-unit">${copy.unit}</label>
          <input id="track-unit" name="unit" type="text" maxlength="40" />
          <label for="track-space">${copy.space}</label>
          <select id="track-space" name="space">
            <option value="personal">${copy.personal}</option>
            <option value="household">${copy.household}</option>
            <option value="work">${copy.work}</option>
          </select>
          <div class="form-row">
            <span class="hint">${copy.trackHint}</span>
            <button type="submit">${copy.saveObservation}</button>
          </div>
          <p id="track-status" class="hint" role="status"></p>
        </form>
      </section>

      <section id="domains" class="panel" aria-labelledby="domains-heading">
        <p class="eyebrow">${copy.domains}</p>
        <h2 id="domains-heading">${copy.domains}</h2>
        <div class="domain-grid">
          <form id="expense-form" class="domain-form">
            <h3>${copy.financeHeading}</h3>
            <label for="expense-merchant">${copy.merchant}</label>
            <input id="expense-merchant" name="merchant" type="text" maxlength="160" required />
            <label for="expense-amount">${copy.value}</label>
            <input id="expense-amount" name="amount" type="text" inputmode="decimal" maxlength="32" required />
            <label for="expense-currency">${copy.currency}</label>
            <select id="expense-currency" name="currency"><option value="CAD">CAD</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="JPY">JPY</option></select>
            <label for="expense-space">${copy.space}</label>
            <select id="expense-space" name="space"><option value="personal">${copy.personal}</option><option value="household">${copy.household}</option><option value="work">${copy.work}</option></select>
            <p class="hint">${copy.financeHint}</p>
            <button type="submit">${copy.saveExpense}</button>
            <p id="expense-status" class="hint" role="status"></p>
          </form>
          <form id="health-form" class="domain-form">
            <h3>${copy.healthHeading}</h3>
            <label for="health-metric">${copy.metricName}</label>
            <input id="health-metric" name="metric" type="text" maxlength="160" required />
            <label for="health-value">${copy.value}</label>
            <input id="health-value" name="value" type="number" inputmode="decimal" step="any" required />
            <label for="health-unit">${copy.unit}</label>
            <input id="health-unit" name="unit" type="text" maxlength="40" />
            <label for="health-subject">${copy.subject}</label>
            <input id="health-subject" name="subjectId" type="text" maxlength="160" placeholder="person:self" required />
            <label for="health-note">${copy.optionalNote}</label>
            <textarea id="health-note" name="note" rows="2" maxlength="1000"></textarea>
            <label for="health-space">${copy.space}</label>
            <select id="health-space" name="space"><option value="personal">${copy.personal}</option><option value="household">${copy.household}</option><option value="work">${copy.work}</option></select>
            <p class="hint">${copy.healthHint}</p>
            <button type="submit">${copy.saveMeasurement}</button>
            <p id="health-form-status" class="hint" role="status"></p>
          </form>
        </div>
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

      <section id="spaces" class="panel" aria-labelledby="spaces-heading">
        <p class="eyebrow">${copy.space}</p>
        <h2 id="spaces-heading">${copy.scopeWithoutCopying}</h2>
        <form id="space-form" class="relationship-form">
          <label for="space-record">${copy.assignToSpace}</label>
          <select id="space-record" name="record"></select>
          <label for="space-membership">${copy.addMembership}</label>
          <select id="space-membership" name="space">
            <option value="personal">${copy.personal}</option>
            <option value="household">${copy.household}</option>
            <option value="work">${copy.work}</option>
          </select>
          <button id="space-submit" type="submit">${copy.addMembership}</button>
          <p id="space-status" class="hint" role="status"></p>
        </form>
        <label for="space-filter">${copy.filterSpace}</label>
        <select id="space-filter" name="filter">
          <option value="">${copy.allSpaces}</option>
          <option value="personal">${copy.personal}</option>
          <option value="household">${copy.household}</option>
          <option value="work">${copy.work}</option>
        </select>
      </section>

      <section id="compose" class="panel" aria-labelledby="compose-heading">
        <p class="eyebrow">${copy.compose}</p>
        <h2 id="compose-heading">${copy.composeHeading}</h2>
        <form id="compose-form" class="relationship-form">
          <label for="compose-title">${copy.viewTitle}</label>
          <input id="compose-title" name="title" type="text" maxlength="240" required value="${copy.defaultViewTitle}" />
          <label for="compose-fields">${copy.viewFields}</label>
          <input id="compose-fields" name="fields" type="text" maxlength="1000" value="recordType, data.text, owner, modifiedAt" required />
          <label for="compose-space">${copy.viewSpace}</label>
          <select id="compose-space" name="space">
            <option value="">${copy.allSpaces}</option>
            <option value="personal">${copy.personal}</option>
            <option value="household">${copy.household}</option>
            <option value="work">${copy.work}</option>
          </select>
          <button type="submit">${copy.saveView}</button>
          <p id="compose-status" class="hint" role="status"></p>
        </form>
        <div id="compose-preview" class="compose-preview" aria-live="polite"></div>
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

      <section id="knowledge" class="panel" aria-labelledby="knowledge-heading">
        <p class="eyebrow">${copy.sources}</p>
        <h2 id="knowledge-heading">${copy.sourcesHeading}</h2>
        <div class="domain-grid">
          <form id="evidence-form" class="domain-form">
            <h3>${copy.evidenceHeading}</h3>
            <label for="evidence-subject">${copy.subjectRecord}</label>
            <select id="evidence-subject" name="subject"></select>
            <label for="evidence-source">${copy.sourceRecord}</label>
            <select id="evidence-source" name="source"></select>
            <label for="evidence-relation">${copy.evidenceRelation}</label>
            <select id="evidence-relation" name="relation">
              <option value="SUPPORTS">${copy.supports}</option>
              <option value="CONTRADICTS">${copy.contradicts}</option>
              <option value="QUALIFIES">${copy.qualifies}</option>
              <option value="DERIVES_FROM">${copy.derivesFrom}</option>
            </select>
            <label for="evidence-claim">${copy.claim}</label>
            <textarea id="evidence-claim" name="claim" rows="3" maxlength="1000" required></textarea>
            <label for="evidence-uncertainty">${copy.uncertainty}</label>
            <input id="evidence-uncertainty" name="uncertainty" type="text" maxlength="500" />
            <button id="evidence-submit" type="submit">${copy.createEvidence}</button>
            <p id="evidence-status" class="hint" role="status"></p>
          </form>
          <form id="annotation-form" class="domain-form">
            <h3>${copy.annotationHeading}</h3>
            <label for="annotation-source">${copy.sourceRecord}</label>
            <select id="annotation-source" name="source"></select>
            <label for="annotation-quote">${copy.annotationQuote}</label>
            <textarea id="annotation-quote" name="quote" rows="3" maxlength="1000" required></textarea>
            <label for="annotation-note">${copy.annotationNote}</label>
            <textarea id="annotation-note" name="note" rows="3" maxlength="5000" required></textarea>
            <button id="annotation-submit" type="submit">${copy.createAnnotation}</button>
            <p id="annotation-status" class="hint" role="status"></p>
          </form>
          <form id="place-form" class="domain-form">
            <h3>${copy.placeHeading}</h3>
            <label for="place-label">${copy.placeLabel}</label>
            <input id="place-label" name="label" type="text" maxlength="240" required />
            <label for="place-latitude">${copy.latitude}</label>
            <input id="place-latitude" name="latitude" type="number" inputmode="decimal" step="any" />
            <label for="place-longitude">${copy.longitude}</label>
            <input id="place-longitude" name="longitude" type="number" inputmode="decimal" step="any" />
            <label for="place-geojson">${copy.optionalGeoJson}</label>
            <textarea id="place-geojson" name="geojson" rows="2" placeholder='{"type":"Point","coordinates":[-79.3832,43.6532]}'></textarea>
            <button type="submit">${copy.savePlace}</button>
            <p id="place-status" class="hint" role="status"></p>
          </form>
        </div>
        <p id="knowledge-status" class="hint" role="status"></p>
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

      <section id="reminders" class="panel" aria-labelledby="reminder-heading">
        <p class="eyebrow">${timeCopy.reminders}</p>
        <h2 id="reminder-heading">${timeCopy.reminderHeading}</h2>
        <form id="reminder-form">
          <label for="reminder-title">${timeCopy.reminderTitle}</label>
          <input id="reminder-title" name="title" type="text" maxlength="240" required />
          <label for="reminder-due">${timeCopy.reminderDueAt}</label>
          <input id="reminder-due" name="dueAt" type="datetime-local" required />
          <p class="hint">${timeCopy.reminderHint}</p>
          <button type="submit">${timeCopy.saveReminder}</button>
          <p id="reminder-status" class="hint" role="status"></p>
        </form>
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
          <button id="export-encrypted" class="secondary" type="button">${recoveryCopy.exportEncrypted}</button>
           <button id="export-diagnostics" class="secondary" type="button">${copy.exportDiagnostics}</button>
           <button id="repair-search" class="secondary" type="button">${copy.repairSearch}</button>
           <button id="safe-presentation" class="secondary" type="button">${safePresentationMode ? recoveryCopy.safePresentationActive : recoveryCopy.safePresentation}</button>
           <button id="clear-canonical" class="danger-button" type="button">${recoveryCopy.clearCanonical}</button>
          <label class="file-button secondary" for="import-vault">${copy.importVault}</label>
          <input id="import-vault" type="file" accept="application/json,.json" />
          <label class="file-button secondary" for="artifact-input">${copy.attachArtifact}</label>
          <input id="artifact-input" type="file" />
        </div>
        <label for="vault-password">${recoveryCopy.password}</label>
        <input id="vault-password" type="password" minlength="8" autocomplete="new-password" />
        <p class="hint">${recoveryCopy.passwordHint}</p>
        <p id="recovery-status" class="hint" role="status"></p>
      </section>
    </main>
    <footer><span>${copy.footerPhase0}</span><span>${copy.footerOptional}</span></footer>
  `;

  const captureForm = root.querySelector<HTMLFormElement>("#capture-form");
  const captureType = root.querySelector<HTMLSelectElement>("#capture-type");
  const captureSpace = root.querySelector<HTMLSelectElement>("#capture-space");
  const captureText = root.querySelector<HTMLTextAreaElement>("#capture-text");
  const acquireForm = root.querySelector<HTMLFormElement>("#acquire-form");
  const acquireText = root.querySelector<HTMLTextAreaElement>("#acquire-text");
  const acquireFile = root.querySelector<HTMLInputElement>("#acquire-file");
  const acquireClipboard = root.querySelector<HTMLButtonElement>("#acquire-clipboard");
  const acquireStatus = root.querySelector<HTMLElement>("#acquire-status");
  const acquirePreview = root.querySelector<HTMLUListElement>("#acquire-preview");
  const acceptStaged = root.querySelector<HTMLButtonElement>("#accept-staged");
  const trackForm = root.querySelector<HTMLFormElement>("#track-form");
  const trackName = root.querySelector<HTMLInputElement>("#track-name");
  const trackValue = root.querySelector<HTMLInputElement>("#track-value");
  const trackUnit = root.querySelector<HTMLInputElement>("#track-unit");
  const trackSpace = root.querySelector<HTMLSelectElement>("#track-space");
  const trackStatus = root.querySelector<HTMLElement>("#track-status");
  const expenseForm = root.querySelector<HTMLFormElement>("#expense-form");
  const expenseMerchant = root.querySelector<HTMLInputElement>("#expense-merchant");
  const expenseAmount = root.querySelector<HTMLInputElement>("#expense-amount");
  const expenseCurrency = root.querySelector<HTMLSelectElement>("#expense-currency");
  const expenseSpace = root.querySelector<HTMLSelectElement>("#expense-space");
  const expenseStatus = root.querySelector<HTMLElement>("#expense-status");
  const healthForm = root.querySelector<HTMLFormElement>("#health-form");
  const healthMetric = root.querySelector<HTMLInputElement>("#health-metric");
  const healthValue = root.querySelector<HTMLInputElement>("#health-value");
  const healthUnit = root.querySelector<HTMLInputElement>("#health-unit");
  const healthSubject = root.querySelector<HTMLInputElement>("#health-subject");
  const healthNote = root.querySelector<HTMLTextAreaElement>("#health-note");
  const healthSpace = root.querySelector<HTMLSelectElement>("#health-space");
  const healthFormStatus = root.querySelector<HTMLElement>("#health-form-status");
  const searchForm = root.querySelector<HTMLFormElement>("#search-form");
  const searchQuery = root.querySelector<HTMLInputElement>("#search-query");
  const clearSearch = root.querySelector<HTMLButtonElement>("#clear-search");
  const searchStatus = root.querySelector<HTMLElement>("#search-status");
  const spaceForm = root.querySelector<HTMLFormElement>("#space-form");
  const spaceRecord = root.querySelector<HTMLSelectElement>("#space-record");
  const spaceMembership = root.querySelector<HTMLSelectElement>("#space-membership");
  const spaceFilter = root.querySelector<HTMLSelectElement>("#space-filter");
  const spaceStatus = root.querySelector<HTMLElement>("#space-status");
  const composeForm = root.querySelector<HTMLFormElement>("#compose-form");
  const composeTitle = root.querySelector<HTMLInputElement>("#compose-title");
  const composeFields = root.querySelector<HTMLInputElement>("#compose-fields");
  const composeSpace = root.querySelector<HTMLSelectElement>("#compose-space");
  const composeStatus = root.querySelector<HTMLElement>("#compose-status");
  const composePreview = root.querySelector<HTMLElement>("#compose-preview");
  const summaryTotal = root.querySelector<HTMLElement>("#summary-total");
  const analysisStatus = root.querySelector<HTMLElement>("#analysis-status");
  const summaryGrid = root.querySelector<HTMLElement>("#summary-grid");
  const insightsGrid = root.querySelector<HTMLElement>("#insights-grid");
  const attentionPanel = root.querySelector<HTMLElement>("#attention-panel");
  const reviewList = root.querySelector<HTMLUListElement>("#review-list");
  const reviewCount = root.querySelector<HTMLElement>("#review-count");
  const reviewEmpty = root.querySelector<HTMLElement>("#review-empty");
  const relateForm = root.querySelector<HTMLFormElement>("#relate-form");
  const relateSource = root.querySelector<HTMLSelectElement>("#relate-source");
  const relateTarget = root.querySelector<HTMLSelectElement>("#relate-target");
  const relateLabel = root.querySelector<HTMLInputElement>("#relate-label");
  const relateSubmit = root.querySelector<HTMLButtonElement>("#relate-submit");
  const relateStatus = root.querySelector<HTMLElement>("#relate-status");
  const evidenceForm = root.querySelector<HTMLFormElement>("#evidence-form");
  const evidenceSubject = root.querySelector<HTMLSelectElement>("#evidence-subject");
  const evidenceSource = root.querySelector<HTMLSelectElement>("#evidence-source");
  const evidenceRelation = root.querySelector<HTMLSelectElement>("#evidence-relation");
  const evidenceClaim = root.querySelector<HTMLTextAreaElement>("#evidence-claim");
  const evidenceUncertainty = root.querySelector<HTMLInputElement>("#evidence-uncertainty");
  const evidenceSubmit = root.querySelector<HTMLButtonElement>("#evidence-submit");
  const evidenceStatus = root.querySelector<HTMLElement>("#evidence-status");
  const annotationForm = root.querySelector<HTMLFormElement>("#annotation-form");
  const annotationSource = root.querySelector<HTMLSelectElement>("#annotation-source");
  const annotationQuote = root.querySelector<HTMLTextAreaElement>("#annotation-quote");
  const annotationNote = root.querySelector<HTMLTextAreaElement>("#annotation-note");
  const annotationSubmit = root.querySelector<HTMLButtonElement>("#annotation-submit");
  const annotationStatus = root.querySelector<HTMLElement>("#annotation-status");
  const placeForm = root.querySelector<HTMLFormElement>("#place-form");
  const placeLabel = root.querySelector<HTMLInputElement>("#place-label");
  const placeLatitude = root.querySelector<HTMLInputElement>("#place-latitude");
  const placeLongitude = root.querySelector<HTMLInputElement>("#place-longitude");
  const placeGeoJson = root.querySelector<HTMLTextAreaElement>("#place-geojson");
  const placeStatus = root.querySelector<HTMLElement>("#place-status");
  const knowledgeStatus = root.querySelector<HTMLElement>("#knowledge-status");
  const focusToggle = root.querySelector<HTMLButtonElement>("#focus-toggle");
  const focusStatus = root.querySelector<HTMLElement>("#focus-status");
  const reminderForm = root.querySelector<HTMLFormElement>("#reminder-form");
  const reminderTitle = root.querySelector<HTMLInputElement>("#reminder-title");
  const reminderDue = root.querySelector<HTMLInputElement>("#reminder-due");
  const reminderStatus = root.querySelector<HTMLElement>("#reminder-status");
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
  const capabilityStatus = root.querySelector<HTMLElement>("#capability-status");
  const themeToggle = root.querySelector<HTMLButtonElement>("#theme-toggle");
  const exportButton = root.querySelector<HTMLButtonElement>("#export-vault");
  const encryptedExportButton = root.querySelector<HTMLButtonElement>("#export-encrypted");
  const vaultPassword = root.querySelector<HTMLInputElement>("#vault-password");
  const diagnosticsButton = root.querySelector<HTMLButtonElement>("#export-diagnostics");
  const repairSearchButton = root.querySelector<HTMLButtonElement>("#repair-search");
  const safePresentationButton = root.querySelector<HTMLButtonElement>("#safe-presentation");
  const clearCanonicalButton = root.querySelector<HTMLButtonElement>("#clear-canonical");
  const importInput = root.querySelector<HTMLInputElement>("#import-vault");
  const artifactInput = root.querySelector<HTMLInputElement>("#artifact-input");
  if (!captureForm || !captureType || !captureSpace || !captureText || !acquireForm || !acquireText || !acquireFile || !acquireClipboard || !acquireStatus || !acquirePreview || !acceptStaged || !trackForm || !trackName || !trackValue || !trackUnit || !trackSpace || !trackStatus || !expenseForm || !expenseMerchant || !expenseAmount || !expenseCurrency || !expenseSpace || !expenseStatus || !healthForm || !healthMetric || !healthValue || !healthUnit || !healthSubject || !healthNote || !healthSpace || !healthFormStatus || !searchForm || !searchQuery || !clearSearch || !searchStatus || !spaceForm || !spaceRecord || !spaceMembership || !spaceFilter || !spaceStatus || !composeForm || !composeTitle || !composeFields || !composeSpace || !composeStatus || !composePreview || !summaryTotal || !analysisStatus || !summaryGrid || !insightsGrid || !attentionPanel || !reviewList || !reviewCount || !reviewEmpty || !relateForm || !relateSource || !relateTarget || !relateLabel || !relateSubmit || !relateStatus || !evidenceForm || !evidenceSubject || !evidenceSource || !evidenceRelation || !evidenceClaim || !evidenceUncertainty || !evidenceSubmit || !evidenceStatus || !annotationForm || !annotationSource || !annotationQuote || !annotationNote || !annotationSubmit || !annotationStatus || !placeForm || !placeLabel || !placeLatitude || !placeLongitude || !placeGeoJson || !placeStatus || !knowledgeStatus || !focusToggle || !focusStatus || !reminderForm || !reminderTitle || !reminderDue || !reminderStatus || !productLabel || !productName || !localeInput || !presentationForm || !presentationStatus || !recordList || !emptyState || !recordCount || !toggleArchive || !archivePanel || !archiveList || !archiveEmpty || !recoveryStatus || !healthStatus || !capabilityStatus || !themeToggle || !exportButton || !encryptedExportButton || !vaultPassword || !diagnosticsButton || !repairSearchButton || !safePresentationButton || !clearCanonicalButton || !importInput || !artifactInput) {
    throw new Error("Omnevum foundation controls are missing");
  }

  const sharedParameters = new URLSearchParams(window.location.search);
  const sharedInput = [sharedParameters.get("title"), sharedParameters.get("text"), sharedParameters.get("url")].filter((value): value is string => Boolean(value?.trim())).join("\n").trim();
  if (sharedInput) acquireText.value = sharedInput.slice(0, 5 * 1024 * 1024);

  const trackService = new TrackService(store, commands);
  const spaceService = new SpaceService(store, commands);
  const viewRegistry = new ViewRegistry(store);
  const deviceInput = new DeviceInputBroker();
  let stagedCandidates: AcquireCandidate[] = [];
  let activeSpace: SpaceId | undefined;

  const showAcquirePreview = (preview: AcquirePreview): void => {
    stagedCandidates = preview.candidates;
    acquirePreview.replaceChildren();
    for (const candidate of stagedCandidates.slice(0, 20)) {
      const item = document.createElement("li");
      item.textContent = `${candidate.kind} - ${typeof candidate.data.text === "string" ? candidate.data.text : candidate.candidateId} (${candidate.confidence})`;
      acquirePreview.append(item);
    }
    acquireStatus.textContent = copy.stagedMessage(stagedCandidates.length, preview.warnings.length);
    acceptStaged.disabled = stagedCandidates.length === 0;
  };

  const stageAcquireText = async (source: string): Promise<void> => {
    const preview = /^https?:\/\//i.test(source) ? await stageUrl(source) : await stageText(source);
    showAcquirePreview(preview);
  };

  const scopedRecords = async (includeDeleted = false): Promise<Awaited<ReturnType<CanonicalStore["list"]>>> => {
    const records = await store.list(includeDeleted);
    const visible = activeSpace ? await spaceService.project(records, activeSpace) : records;
    return visible.filter((record) => record.owner !== "platform.space");
  };

  const degradedCapabilities = (capabilityRuntime?.snapshot() ?? []).filter((status) => status.state === "DEGRADED");
  capabilityStatus.textContent = degradedCapabilities.length === 0 ? copy.local : `${copy.local} - ${degradedCapabilities.length} degraded`;
  capabilityStatus.title = degradedCapabilities.length === 0 ? "Core capabilities are ready." : degradedCapabilities.map((status) => `${status.id}: ${status.reason ?? "degraded"}`).join("; ");

  productLabel.textContent = `${presentation.productName} ${copy.foundation}`;
  productName.value = presentation.productName;
  localeInput.value = presentation.locale;
  presentationStatus.textContent = safePresentationMode ? recoveryCopy.safePresentationHint : presentationResolution.storedProfileValid ? copy.presentationHint : `Safe presentation fallback is active. ${copy.presentationHint}`;
  themeToggle.textContent = presentation.theme === "dark" ? copy.themeLight : copy.themeDark;
  themeToggle.setAttribute("aria-pressed", String(presentation.theme === "dark"));

  const typeLabel = (recordType: string): string => recordType === "task" ? copy.task : recordType === "observation" ? copy.observation : recordType === "artifact" ? copy.attachArtifact : recordType === "relationship" ? copy.relationship : copy.note;
  const spaceLabel = (space: SpaceId): string => space === "household" ? copy.household : space === "work" ? copy.work : copy.personal;

  const renderSpaceChoices = async (): Promise<void> => {
    const records = (await store.list()).filter((record) => record.owner !== "platform.space");
    const previous = spaceRecord.value;
    spaceRecord.replaceChildren();
    for (const record of records) {
      const option = document.createElement("option");
      option.value = record.id;
      option.textContent = `${typeLabel(record.recordType)}: ${recordText(record).slice(0, 70)}`;
      spaceRecord.append(option);
    }
    if (records.some((record) => record.id === previous)) spaceRecord.value = previous;
    spaceForm.querySelector("button[type=submit]")?.toggleAttribute("disabled", records.length === 0);
  };

  const renderComposeView = async (): Promise<void> => {
    const view = (await viewRegistry.list())[0];
    composePreview.replaceChildren();
    if (!view) {
      composePreview.textContent = copy.viewEmpty;
      return;
    }
    let records = await scopedRecords();
    if (view.space) records = (await spaceService.project(await store.list(), view.space)).filter((record) => record.owner !== "platform.space");
    const viewForProjection = structuredClone(view);
    delete viewForProjection.space;
    records = projectView(viewForProjection, records).slice(0, 100);
    const heading = document.createElement("h3");
    heading.textContent = view.title;
    const summary = document.createElement("p");
    summary.className = "hint";
    summary.textContent = `${records.length} record(s); projection only.`;
    composePreview.append(heading, summary);
    for (const widget of view.widgets) {
      const section = document.createElement("section");
      section.className = "view-widget";
      const widgetHeading = document.createElement("h4");
      widgetHeading.textContent = widget.title;
      section.append(widgetHeading);
      const fields = widget.fields ?? [];
      if (widget.type === "form") {
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = "Capture remains on the normal semantic command path; this generated form is a view projection.";
        section.append(note);
      } else if (widget.type === "list" || widget.type === "timeline") {
        const list = document.createElement("ul");
        list.className = "record-list";
        for (const record of records.slice(0, 20)) {
          const item = document.createElement("li");
          item.textContent = fields.map((field) => formatViewValue(readPath(record, field))).filter(Boolean).join(" - ") || recordText(record);
          list.append(item);
        }
        section.append(list);
      } else if (widget.type === "table") {
        section.append(makeViewTable(records, fields, copy.tableLabel));
      } else if (widget.type === "chart") {
        const chart = document.createElement("div");
        chart.setAttribute("role", "img");
        chart.setAttribute("aria-label", copy.chartLabel);
        const groups = groupCounts(records, fields[0] ?? "recordType");
        const list = document.createElement("ul");
        for (const [key, count] of Object.entries(groups.value as Record<string, number>)) {
          const item = document.createElement("li");
          item.textContent = `${key}: ${formatNumber(presentation.locale, count)}`;
          list.append(item);
        }
        chart.append(list);
        section.append(chart);
      } else {
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = `${records.length} record(s) available to this projection.`;
        section.append(note);
      }
      composePreview.append(section);
    }
  };

  const makeViewTable = (records: Awaited<ReturnType<CanonicalStore["list"]>>, fields: string[], captionText: string): HTMLTableElement => {
    const table = document.createElement("table");
    table.className = "view-table";
    const caption = document.createElement("caption");
    caption.textContent = captionText;
    table.append(caption);
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const field of fields) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = field;
      headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (const record of records.slice(0, 20)) {
      const row = document.createElement("tr");
      for (const field of fields) {
        const cell = document.createElement("td");
        cell.textContent = formatViewValue(readPath(record, field));
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    return table;
  };

  const renderSummary = async (): Promise<void> => {
    const records = await scopedRecords();
    summaryTotal.textContent = formatNumber(presentation.locale, records.length);
    const count = countRecords(records);
    const dataset = projectDataset(records, ["recordType", "owner", "modifiedAt"]);
    const groups = groupCounts(records, "recordType");
    analysisStatus.textContent = copy.derivedStatus(Number(count.value), dataset.sourceIds.length, Object.keys(groups.value).length);
    summaryGrid.replaceChildren();
    const counts = new Map<string, number>();
    for (const record of records) {
      const key = `${spaceLabel(recordSpace(record))} - ${typeLabel(record.recordType)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const entries = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
    const openTasks = records.filter((record) => record.recordType === "task" && !isCompletedTask(record)).length;
    const completedTasks = records.filter((record) => isCompletedTask(record)).length;
    const focusMinutes = records.filter((record) => record.recordType === "observation" && record.data.kind === "focus-session").reduce((sum, record) => sum + (typeof record.data.durationMinutes === "number" ? record.data.durationMinutes : 0), 0);
    const relationships = records.filter((record) => record.recordType === "relationship").length;
    insightsGrid.replaceChildren();
    for (const [label, value] of [[copy.openTasks, openTasks], [copy.completedTasks, completedTasks], [copy.focusMinutes, focusMinutes], [copy.relationships, relationships]] as const) {
      const card = document.createElement("div");
      card.className = "summary-item";
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const valueElement = document.createElement("strong");
      valueElement.textContent = formatNumber(presentation.locale, value);
      card.append(labelElement, valueElement);
      insightsGrid.append(card);
    }
    const dueReminders = reconcileReminders(records).filter((reminder) => reminder.state === "DUE");
    attentionPanel.replaceChildren();
    if (dueReminders.length === 0) {
      attentionPanel.textContent = timeCopy.noDue;
    } else {
      const list = document.createElement("ul");
      list.className = "attention-list";
      for (const reminder of dueReminders) {
        const item = document.createElement("li");
        item.textContent = `${reminder.recordId} - ${timeCopy.dueOnResume}. ${timeCopy.deliveryLimited}`;
        list.append(item);
      }
      attentionPanel.append(list);
    }
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
    const records = (await scopedRecords()).filter((record) => recordTriageStatus(record) === "INBOX");
    reviewList.replaceChildren();
    reviewCount.textContent = formatNumber(presentation.locale, records.length);
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
        try {
          await commands.update(record.id, { ...record.data, triageStatus: "REVIEWED" });
          await renderRecords(searchQuery.value);
        } catch (error) {
          relateStatus.textContent = describeError(error, "Review update failed");
        }
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

  const renderKnowledgeChoices = async (): Promise<void> => {
    const records = (await store.list()).filter((record) => record.owner !== "platform.space");
    const fill = (select: HTMLSelectElement, previous: string): void => {
      select.replaceChildren();
      for (const record of records) {
        const option = document.createElement("option");
        option.value = record.id;
        option.textContent = `${typeLabel(record.recordType)}: ${recordText(record).slice(0, 70)} (r${record.revision})`;
        select.append(option);
      }
      if (records.some((record) => record.id === previous)) select.value = previous;
    };
    const previousSubject = evidenceSubject.value;
    const previousSource = evidenceSource.value;
    const previousAnnotation = annotationSource.value;
    fill(evidenceSubject, previousSubject);
    fill(evidenceSource, previousSource);
    fill(annotationSource, previousAnnotation);
    evidenceSubmit.disabled = records.length < 2;
    annotationSubmit.disabled = records.length === 0;
  };

  const renderKnowledgeStatus = async (): Promise<void> => {
    const records = await store.list();
    let evidence = 0;
    let annotations = 0;
    let active = 0;
    let stale = 0;
    let orphaned = 0;
    let places = 0;
    for (const record of records) {
      if (record.owner === "platform.evidence") evidence += 1;
      if (record.owner === "platform.place") places += 1;
      if (record.owner !== "platform.annotate") continue;
      annotations += 1;
      const sourceId = typeof record.data.sourceId === "string" ? record.data.sourceId : "";
      const source = sourceId ? await store.get(sourceId) : undefined;
      const state = source ? assessTextAnchor(record, recordText(source), source.revision) : "ORPHANED";
      if (state === "ACTIVE") active += 1;
      else if (state === "STALE") stale += 1;
      else orphaned += 1;
    }
    knowledgeStatus.textContent = copy.knowledgeStatus(evidence, annotations, active, stale, orphaned, places);
  };

  const renderArchived = async (): Promise<void> => {
    const records = (await scopedRecords(true)).filter((record) => record.deleted).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
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
        try {
          await commands.restore(record.id);
          await renderRecords(searchQuery.value);
        } catch (error) {
          recoveryStatus.textContent = describeError(error, "Restore failed");
        }
      });
      item.append(content, restore);
      archiveList.append(item);
    }
  };

  const renderHistory = async (record: Awaited<ReturnType<CanonicalStore["get"]>>): Promise<HTMLDetailsElement | undefined> => {
    if (!record) return undefined;
    const entries = await historyWithDiffs(store, record.id);
    if (entries.length <= 1) return undefined;
    const details = document.createElement("details");
    details.className = "history-details";
    const summary = document.createElement("summary");
    summary.textContent = `${copy.historyHeading} (${entries.length})`;
    const list = document.createElement("ol");
    for (const entry of entries) {
      const changes = entry.changesFromPrevious.length > 0 ? entry.changesFromPrevious.map((change) => change.path) : ["initial"];
      const item = document.createElement("li");
      item.textContent = copy.historyEntry(entry.revision, formatDateTime(presentation.locale, entry.recordedAt), changes.join(", "));
      list.append(item);
    }
    details.append(summary, list);
    return details;
  };

  const renderRecords = async (query = ""): Promise<void> => {
    const candidateRecords = query.trim() ? await store.search(query) : await store.list();
    const records = activeSpace ? (await spaceService.project(candidateRecords, activeSpace)).filter((record) => record.owner !== "platform.space") : candidateRecords.filter((record) => record.owner !== "platform.space");
    recordList.replaceChildren();
    recordCount.textContent = formatNumber(presentation.locale, records.length);
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
      const history = await renderHistory(record);
      if (history) content.append(history);
      if (record.recordType === "task" && !isCompletedTask(record)) {
        const complete = document.createElement("button");
        complete.type = "button";
        complete.className = "icon-button complete-button";
        complete.textContent = copy.complete;
        complete.addEventListener("click", async () => {
          try {
            await commands.update(record.id, { ...record.data, status: "DONE" }, record.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            healthStatus.textContent = describeError(error, "Task completion failed; canonical data was not changed.");
          }
        });
        item.append(complete);
      }
      if (record.revision > 1) {
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "icon-button complete-button";
        undo.textContent = copy.undo;
        undo.addEventListener("click", async () => {
          try {
            await commands.undo(record.id);
            await renderRecords(searchQuery.value);
          } catch (error) {
            healthStatus.textContent = describeError(error, "Undo failed; canonical data was not changed.");
          }
        });
        item.append(undo);
      }
      const archive = document.createElement("button");
      archive.type = "button";
      archive.className = "icon-button";
      archive.textContent = copy.archive;
      archive.addEventListener("click", async () => {
        try {
          await commands.archive(record.id);
          await renderRecords(searchQuery.value);
        } catch (error) {
          healthStatus.textContent = describeError(error, "Archive failed; canonical data was not changed.");
        }
      });
      item.append(content, archive);
      recordList.append(item);
    }
    await renderSummary();
    await renderReview();
    await renderSpaceChoices();
    await renderComposeView();
    await renderRelationshipChoices();
    await renderKnowledgeChoices();
    await renderKnowledgeStatus();
    const healthBefore = await store.health();
    if (!healthBefore.searchIndexValid) await store.rebuildSearchIndex();
    const healthAfter = await store.health();
    healthStatus.textContent = copy.healthMessage(healthAfter.activeRecords, healthAfter.archivedRecords, healthAfter.historyEntries, healthAfter.artifactPayloads, healthAfter.searchIndexValid ? copy.healthy : copy.degraded, healthAfter.storage?.pressure);
    if (!archivePanel.hidden) await renderArchived();
  };

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = captureText.value.trim();
    if (!text) return;
    try {
      const selectedKind = CAPTURE_KINDS.includes(captureType.value as CaptureKind) ? captureType.value as CaptureKind : "note";
      const recordType = recordTypeForCaptureKind(selectedKind);
      const space = (captureSpace.value === "household" || captureSpace.value === "work" ? captureSpace.value : "personal") satisfies SpaceId;
      await commands.create({ recordType, owner: selectedKind === "event" ? "platform.time" : "core.capture", data: { text, kind: selectedKind, space, triageStatus: "INBOX", ...(recordType === "task" ? { status: "OPEN" } : {}) } });
      captureForm.reset();
      await renderRecords(searchQuery.value);
      captureText.focus();
    } catch (error) {
      healthStatus.textContent = describeError(error, "Capture failed; canonical data was not changed by this action.");
    }
  });

  acquireForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const source = acquireText.value.trim();
    if (!source) return;
    try {
      await stageAcquireText(source);
    } catch (error) {
      acquireStatus.textContent = error instanceof Error ? error.message : "Acquire staging failed";
    }
  });

  acquireFile.addEventListener("change", async () => {
    const file = acquireFile.files?.[0];
    if (!file) return;
    try {
      const preview = await stageBlob(deviceInput.readFile(file), file.name, file.type || "text/plain");
      acquireText.value = "";
      showAcquirePreview(preview);
    } catch (error) {
      acquireStatus.textContent = error instanceof Error ? error.message : "Acquire file staging failed";
    } finally {
      acquireFile.value = "";
    }
  });

  acquireClipboard.addEventListener("click", async () => {
    try {
      const text = await deviceInput.readClipboardText();
      acquireText.value = text;
      await stageAcquireText(text.trim());
    } catch (error) {
      acquireStatus.textContent = error instanceof Error ? error.message : "Clipboard staging failed";
    }
  });

  acceptStaged.addEventListener("click", async () => {
    if (stagedCandidates.length === 0) return;
    try {
      const result = await acceptCandidates(commands, stagedCandidates);
      acquireStatus.textContent = copy.importedMessage(result.accepted, result.skipped, 0);
      stagedCandidates = [];
      acquirePreview.replaceChildren();
      acceptStaged.disabled = true;
      acquireText.value = "";
      acquireFile.value = "";
      await renderRecords(searchQuery.value);
    } catch (error) {
      acquireStatus.textContent = describeError(error, "Staged records were not accepted");
    }
  });

  trackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = trackName.value.trim().slice(0, 120);
    const value = Number(trackValue.value);
    if (!name || !Number.isFinite(value)) return;
    try {
      const space = (trackSpace.value === "household" || trackSpace.value === "work" ? trackSpace.value : "personal") satisfies SpaceId;
      const unit = trackUnit.value.trim().slice(0, 40);
      const definition = await trackService.define({ name, valueType: "NUMBER", ...(unit ? { unit } : {}), space });
      await trackService.observe(definition, value);
      trackForm.reset();
      trackStatus.textContent = copy.trackSaved(name);
      await renderRecords(searchQuery.value);
    } catch (error) {
      trackStatus.textContent = describeError(error, "Observation capture failed");
    }
  });

  expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const space = (expenseSpace.value === "household" || expenseSpace.value === "work" ? expenseSpace.value : "personal") satisfies SpaceId;
      await captureExpense(commands, { merchant: expenseMerchant.value, amount: expenseAmount.value, currency: expenseCurrency.value, space });
      expenseForm.reset();
      expenseStatus.textContent = copy.expenseSaved;
      await renderRecords(searchQuery.value);
    } catch (error) {
      expenseStatus.textContent = error instanceof Error ? error.message : "Expense capture failed";
    }
  });

  healthForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const space = (healthSpace.value === "household" || healthSpace.value === "work" ? healthSpace.value : "personal") satisfies SpaceId;
      await captureHealthMeasurement(commands, { metric: healthMetric.value, value: Number(healthValue.value), unit: healthUnit.value, subjectId: healthSubject.value, note: healthNote.value, space });
      healthForm.reset();
      healthFormStatus.textContent = copy.measurementSaved;
      await renderRecords(searchQuery.value);
    } catch (error) {
      healthFormStatus.textContent = error instanceof Error ? error.message : "Health measurement capture failed";
    }
  });

  let focusStartedAt: string | undefined;
  focusToggle.addEventListener("click", async () => {
    if (!focusStartedAt) {
      focusStartedAt = new Date().toISOString();
      focusToggle.textContent = copy.stopFocus;
      focusStatus.textContent = copy.startedMessage(formatDateTime(presentation.locale, focusStartedAt));
      return;
    }
    const startedAt = focusStartedAt;
    const endedAt = new Date().toISOString();
    const durationMinutes = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000));
    try {
      await commands.create({
        recordType: "observation",
        owner: "platform.time",
        data: { text: "Focus session", kind: "focus-session", startedAt, endedAt, durationMinutes, space: "personal", triageStatus: "REVIEWED" }
      });
      focusStartedAt = undefined;
      focusToggle.textContent = copy.startFocus;
      focusStatus.textContent = copy.savedFocusMessage(durationMinutes);
      await renderRecords(searchQuery.value);
    } catch (error) {
      focusStatus.textContent = describeError(error, "Focus session could not be saved; the session remains active.");
    }
  });

  reminderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const dueAt = new Date(reminderDue.value).toISOString();
      const data = makeReminderData(reminderTitle.value, dueAt, "IN_APP");
      await commands.create({ recordType: "observation", owner: "platform.time", data: { ...data, text: data.title, space: "personal", triageStatus: "REVIEWED" } });
      reminderForm.reset();
      reminderStatus.textContent = timeCopy.reminderSaved;
      await renderRecords(searchQuery.value);
    } catch (error) {
      reminderStatus.textContent = describeError(error, "Reminder was not saved");
    }
  });

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = searchQuery.value.trim();
    try {
      await renderRecords(query);
      const health = await store.getSearchHealth();
      searchStatus.textContent = query ? copy.resultMessage((await store.search(query)).length, health.valid ? copy.healthy : copy.degraded) : copy.showingAll;
    } catch (error) {
      searchStatus.textContent = describeError(error, "Search failed; canonical data was not changed.");
    }
  });

  spaceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedSpace = spaceMembership.value === "household" || spaceMembership.value === "work" ? spaceMembership.value : "personal";
    if (!spaceRecord.value) {
      spaceStatus.textContent = copy.capturePicture;
      return;
    }
    try {
      await spaceService.add(spaceRecord.value, selectedSpace);
      spaceStatus.textContent = copy.membershipCreated(spaceLabel(selectedSpace));
      activeSpace = selectedSpace;
      spaceFilter.value = selectedSpace;
      await renderRecords(searchQuery.value);
    } catch (error) {
      spaceStatus.textContent = describeError(error, "Space membership was not created; canonical records were not changed.");
    }
  });

  spaceFilter.addEventListener("change", async () => {
    activeSpace = spaceFilter.value === "household" || spaceFilter.value === "work" ? spaceFilter.value : spaceFilter.value === "personal" ? "personal" : undefined;
    spaceStatus.textContent = activeSpace ? `Showing ${spaceLabel(activeSpace)} records.` : copy.showingAll;
    await renderRecords(searchQuery.value);
  });

  composeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const viewSpace = composeSpace.value === "household" || composeSpace.value === "work" ? composeSpace.value : composeSpace.value === "personal" ? "personal" : undefined;
      const view = makeUserDashboard(composeTitle.value, composeFields.value.split(",").map((field) => field.trim()), viewSpace);
      await viewRegistry.save(view);
      composeStatus.textContent = copy.viewSaved;
      await renderComposeView();
    } catch (error) {
      composeStatus.textContent = describeError(error, "View was not saved; canonical records were not changed.");
    }
  });

  relateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!relateSource.value || !relateTarget.value || relateSource.value === relateTarget.value) {
      relateStatus.textContent = copy.atLeastTwo;
      return;
    }
    const relation = relateLabel.value.trim() || "related";
    try {
      await commands.relate(relateSource.value, relateTarget.value, relation);
      relateStatus.textContent = copy.linkCreated;
      await renderRecords(searchQuery.value);
    } catch (error) {
      relateStatus.textContent = describeError(error, "Relationship was not created");
    }
  });

  evidenceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!evidenceSubject.value || !evidenceSource.value || evidenceSubject.value === evidenceSource.value) {
      evidenceStatus.textContent = copy.atLeastTwo;
      return;
    }
    const relations: EvidenceRelation[] = ["SUPPORTS", "CONTRADICTS", "QUALIFIES", "DERIVES_FROM"];
    const relation = relations.includes(evidenceRelation.value as EvidenceRelation) ? evidenceRelation.value as EvidenceRelation : "SUPPORTS";
    try {
      await createEvidenceLink(commands, { subjectId: evidenceSubject.value, sourceId: evidenceSource.value, relation, claim: evidenceClaim.value, uncertainty: evidenceUncertainty.value });
      evidenceClaim.value = "";
      evidenceUncertainty.value = "";
      evidenceStatus.textContent = copy.evidenceSaved;
      await renderRecords(searchQuery.value);
    } catch (error) {
      evidenceStatus.textContent = describeError(error, "Evidence link was not created; canonical records were not changed.");
    }
  });

  annotationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const source = await commands.get(annotationSource.value);
    if (!source) {
      annotationStatus.textContent = copy.sourceRequired;
      return;
    }
    const quote = annotationQuote.value.trim();
    const sourceText = recordText(source);
    const start = sourceText.indexOf(quote);
    if (!quote || start < 0) {
      annotationStatus.textContent = copy.quoteMissing;
      return;
    }
    try {
      await createTextAnnotation(commands, { sourceId: source.id, sourceRevision: source.revision, quote, note: annotationNote.value, start, end: start + quote.length });
      annotationQuote.value = "";
      annotationNote.value = "";
      annotationStatus.textContent = copy.annotationSaved;
      await renderRecords(searchQuery.value);
    } catch (error) {
      annotationStatus.textContent = describeError(error, "Annotation was not created; canonical records were not changed.");
    }
  });

  placeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = placeLabel.value.trim();
    if (!label) return;
    try {
      const geoJson = placeGeoJson.value.trim();
      const coordinates = geoJson ? parseGeoJsonPoint(JSON.parse(geoJson) as unknown) : { latitude: Number(placeLatitude.value), longitude: Number(placeLongitude.value) };
      const place = makePlaceData(label, coordinates);
      await commands.create({ recordType: "observation", owner: "platform.place", truthClass: "USER_OBSERVATION", data: { ...place, text: place.label, space: "personal", triageStatus: "REVIEWED" } });
      placeForm.reset();
      placeStatus.textContent = copy.placeSaved(label);
      await renderRecords(searchQuery.value);
    } catch (error) {
      placeStatus.textContent = describeError(error, "Place was not saved; canonical records were not changed.");
    }
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
    if (showing) {
      try {
        await renderArchived();
      } catch (error) {
        recoveryStatus.textContent = describeError(error, "Archived records could not be displayed");
      }
    }
  });

  themeToggle.addEventListener("click", async () => {
    const dark = root.dataset.theme !== "dark";
    const nextPresentation: PresentationProfile = { ...presentation, theme: dark ? "dark" : "light" };
    try {
      await store.setSetting("presentation", nextPresentation);
      presentation = nextPresentation;
      root.dataset.theme = presentation.theme;
      document.documentElement.dataset.theme = presentation.theme;
      themeToggle.textContent = dark ? copy.themeLight : copy.themeDark;
      themeToggle.setAttribute("aria-pressed", String(dark));
    } catch (error) {
      presentationStatus.textContent = describeError(error, "Theme preference was not saved");
    }
  });

  safePresentationButton.addEventListener("click", () => {
    try {
      if (safePresentationMode) window.sessionStorage.removeItem("omnevum-safe-presentation");
      else window.sessionStorage.setItem("omnevum-safe-presentation", "1");
      window.location.reload();
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Safe Presentation Mode could not be changed; the stored profile was preserved.");
    }
  });

  presentationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextName = productName.value.trim().slice(0, 80);
    if (!nextName) return;
    const nextLocale: PresentationProfile["locale"] = localeInput.value === "fr-CA" ? "fr-CA" : "en-CA";
    const localeChanged = nextLocale !== presentation.locale;
    try {
      const nextPresentation: PresentationProfile = { ...presentation, productName: nextName, locale: nextLocale };
      await store.setSetting("presentation", nextPresentation);
      presentation = nextPresentation;
      if (localeChanged) {
        await mountApp(root, store, commands);
        return;
      }
      productLabel.textContent = `${presentation.productName} ${copy.foundation}`;
      presentationStatus.textContent = copy.savedName(presentation.productName);
    } catch (error) {
      presentationStatus.textContent = describeError(error, "Presentation preference was not saved");
    }
  });

  exportButton.addEventListener("click", async () => {
    try {
      const vault = await store.exportVault();
      const blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "omnevum-vault.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      recoveryStatus.textContent = copy.exportMessage(vault.records.length);
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Vault export failed; canonical data was not changed.");
    }
  });

  encryptedExportButton.addEventListener("click", async () => {
    if (vaultPassword.value.length < 8) {
      recoveryStatus.textContent = recoveryCopy.passwordRequired;
      vaultPassword.focus();
      return;
    }
    try {
      const encrypted = await encryptVault(await store.exportVault(), vaultPassword.value);
      downloadJson("omnevum-vault.encrypted.json", encrypted);
      vaultPassword.value = "";
      recoveryStatus.textContent = recoveryCopy.encryptedExported;
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Encrypted Vault export failed; canonical data was not changed.");
    }
  });

  diagnosticsButton.addEventListener("click", async () => {
    try {
      const diagnostics = await store.exportDiagnostics({ serviceWorker: await readServiceWorkerDiagnostics() });
      downloadJson("omnevum-diagnostics.json", diagnostics);
      recoveryStatus.textContent = copy.diagnosticsMessage;
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Diagnostics export failed");
    }
  });

  repairSearchButton.addEventListener("click", async () => {
    try {
      await store.rebuildSearchIndex();
      recoveryStatus.textContent = copy.searchRepairMessage;
      await renderRecords(searchQuery.value);
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Search repair failed; canonical data was not changed.");
    }
  });

  clearCanonicalButton.addEventListener("click", async () => {
    if (!window.confirm(recoveryCopy.clearConfirmation)) return;
    try {
      await store.clear();
      recoveryStatus.textContent = recoveryCopy.clearedCanonical;
      await renderRecords();
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Canonical data was not cleared");
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (new TextEncoder().encode(text).byteLength > MAX_VAULT_JSON_BYTES) throw new Error("Vault JSON exceeds the bounded 64 MiB import limit");
      const parsed: unknown = JSON.parse(text);
      const vault = isEncryptedVaultEnvelope(parsed) ? await decryptVault(parsed, vaultPassword.value) : parseVault(text);
      const preview = await store.previewVault(vault);
      if (!window.confirm(copy.importPreviewMessage(preview.recordCount, preview.historyEntries, preview.artifactPayloads, preview.imported, preview.skipped, preview.conflicts, preview.hasPresentation))) {
        recoveryStatus.textContent = copy.importCancelled;
        return;
      }
      const result = await store.importVault(vault);
      recoveryStatus.textContent = copy.importedMessage(result.imported, result.skipped, result.conflicts);
      await renderRecords();
    } catch (error) {
      recoveryStatus.textContent = error instanceof Error ? error.message : "Vault import failed";
    } finally {
      vaultPassword.value = "";
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

async function readServiceWorkerDiagnostics(): Promise<NonNullable<NonNullable<Parameters<CanonicalStore["exportDiagnostics"]>[0]>["serviceWorker"]>> {
  if (!("serviceWorker" in navigator)) return { status: "UNAVAILABLE", controlled: false, updateWaiting: false };
  try {
    const registration = await navigator.serviceWorker.getRegistration("./");
    return { status: "AVAILABLE", controlled: Boolean(navigator.serviceWorker.controller), ...(registration?.active?.state ? { activeState: registration.active.state } : {}), updateWaiting: Boolean(registration?.waiting) };
  } catch {
    return { status: "AVAILABLE", controlled: Boolean(navigator.serviceWorker.controller), updateWaiting: false };
  }
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

function recordTypeForCaptureKind(kind: CaptureKind): "note" | "task" | "observation" {
  if (kind === "task") return "task";
  if (kind === "observation" || kind === "expense" || kind === "measurement" || kind === "workout") return "observation";
  return "note";
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function readSafePresentationMode(): boolean {
  try {
    return window.sessionStorage.getItem("omnevum-safe-presentation") === "1";
  } catch {
    return false;
  }
}

function formatViewValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).slice(0, 240);
  try {
    return (JSON.stringify(value) ?? "[unavailable]").slice(0, 240);
  } catch {
    return "[unavailable]";
  }
}

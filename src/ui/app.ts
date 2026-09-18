import type { CommandBus, TriageRouteTarget, TriageSplitPart } from "../core/commands";
import { acceptCandidates, stageBlob, stageText, stageUrl, type AcquireCandidate, type AcquirePreview } from "../core/acquire";
import { inspectArtifact } from "../core/artifact";
import { redactTextArtifact } from "../core/document";
import { isCompletedTask, isSpaceId, proposeTriage, recordSpace, recordText, recordTriageDeferredUntil, recordTriageStatus, SPACE_LABELS, type SpaceId, type TriageProposalAction, type TriageStatus } from "../core/domain";
import { captureKindLabel, formatDateTime, formatNumber, getRecoveryCopy, getTimeCopy, getUiCopy, localeDirection } from "../core/i18n";
import { CAPTURE_KINDS, type CaptureKind } from "../core/model";
import { DEFAULT_PRESENTATION, MAX_PRESENTATION_PROFILE_JSON_BYTES, PRESENTATION_HOME_WIDGET_IDS, PRESENTATION_SECTION_IDS, makePresentationProfileDocument, parsePresentationProfile, parsePresentationProfileDocument, resolvePresentationProfile, type PresentationHomeWidgetId, type PresentationProfile, type PresentationSectionId } from "../core/presentation";
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
import { isSpaceMembership, SpaceService } from "../core/space";
import { historyWithDiffs, revertToRevision } from "../core/history";
import { makeUserDashboard, projectView, ViewRegistry } from "../core/compose";
import { readPath } from "../core/data";
import { assessTextAnchor, createTextAnnotation } from "../core/annotation";
import { createEvidenceLink, type EvidenceRelation } from "../core/evidence";
import { makePlaceData, parseGeoJsonPoint } from "../core/place";
import { projectForAuthorizedShare } from "../core/share";
import { canUseShareGrant, createShareGrant, revokeShareGrant } from "../core/sharing";
import { transitionEffect } from "../core/effect";
import { createExternalEffect } from "../core/effect-service";
import { createEffectRevalidationGuard } from "../core/effect-guard";
import { EffectRunner } from "../core/effect-runner";
import { JsonEndpointEffectExecutor, JsonEndpointTransport } from "../core/remote";
import { SyncEngine, SyncFailure } from "../core/sync";

function parseExternalEffectPayload(value: string): Record<string, unknown> | string {
  const raw = value.trim();
  if (!raw) throw new Error("Enter a JSON object or a stable reference beginning with ref:");
  if (raw.startsWith("ref:")) return raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Enter valid JSON or a stable reference beginning with ref:");
  }
  if (typeof parsed === "string" && parsed.trim()) return parsed;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  throw new Error("The external effect payload must be a JSON object or string reference");
}

export async function mountApp(root: HTMLElement, store: CanonicalStore, commands: CommandBus, capabilityRuntime?: CapabilityRuntime<unknown>): Promise<void> {
  const rawPresentation = await store.getSetting<unknown>("presentation");
  const safePresentationMode = readSafePresentationMode();
  const presentationResolution = resolvePresentationProfile(rawPresentation, safePresentationMode);
  let presentation: PresentationProfile = presentationResolution.profile;
  const copy = getUiCopy(presentation.locale);
  const recoveryCopy = getRecoveryCopy(presentation.locale);
  const timeCopy = getTimeCopy(presentation.locale);
  root.dataset.theme = presentation.theme;
  root.dataset.density = presentation.density;
  root.dataset.typeface = presentation.typeface;
  root.dataset.iconography = presentation.iconography;
  document.documentElement.dataset.theme = presentation.theme;
  document.documentElement.dataset.typeface = presentation.typeface;
  document.documentElement.lang = presentation.locale;
  document.documentElement.dir = localeDirection(presentation.locale);
  root.innerHTML = `
    <header class="topbar">
      <div>
        <p id="product-label" class="eyebrow"></p>
        <h1 id="product-heading">${copy.productHeading}</h1>
        <p id="product-tagline" class="lede">${copy.lede}</p>
      </div>
      <button id="theme-toggle" class="secondary" type="button" aria-pressed="false">${copy.themeDark}</button>
    </header>
    <nav id="primary-nav" class="primary-nav" aria-label="${copy.home}"><ol id="primary-nav-list"></ol></nav>
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
            <p id="home-label" class="eyebrow">${copy.home}</p>
            <h2 id="summary-heading">${copy.currentPicture}</h2>
          </div>
          <span id="summary-total" class="count" aria-label="${copy.activeRecordCount}">0</span>
        </div>
        <div data-home-widget="summary">
          <div id="summary-grid" class="summary-grid"></div>
          <p id="analysis-status" class="hint" role="status"></p>
        </div>
        <div data-home-widget="insights">
          <div class="section-heading insight-heading">
            <div>
              <p class="eyebrow">${copy.visualize}</p>
              <h3>${copy.signals}</h3>
            </div>
          </div>
          <div id="insights-grid" class="summary-grid"></div>
        </div>
        <div data-home-widget="attention">
          <div class="section-heading insight-heading">
            <div>
              <p class="eyebrow">${timeCopy.reminders}</p>
              <h3>${timeCopy.dueOnResume}</h3>
            </div>
          </div>
          <div id="attention-panel" class="attention-panel" role="status"></div>
        </div>
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
          <label for="tagline">${copy.tagline}</label>
          <input id="tagline" name="tagline" type="text" maxlength="160" />
          <div class="form-row presentation-grid">
            <div>
              <label for="density">${copy.density}</label>
              <select id="density" name="density"><option value="comfortable">${copy.comfortable}</option><option value="compact">${copy.compact}</option></select>
            </div>
            <div>
              <label for="typeface">${copy.typeface}</label>
              <select id="typeface" name="typeface"><option value="system">${copy.systemTypeface}</option><option value="serif">${copy.serifTypeface}</option><option value="mono">${copy.monoTypeface}</option></select>
            </div>
            <div>
              <label for="iconography">${copy.iconography}</label>
              <select id="iconography" name="iconography"><option value="labels">${copy.labelIconography}</option><option value="glyphs">${copy.glyphIconography}</option></select>
            </div>
          </div>
          <div class="presentation-grid">
            <div>
              <label for="home-label-input">${copy.homeLabel}</label>
              <input id="home-label-input" name="homeLabel" type="text" maxlength="40" />
            </div>
            <div>
              <label for="capture-label-input">${copy.captureLabel}</label>
              <input id="capture-label-input" name="captureLabel" type="text" maxlength="40" />
            </div>
            <div>
              <label for="records-label-input">${copy.recordsLabel}</label>
              <input id="records-label-input" name="recordsLabel" type="text" maxlength="40" />
            </div>
          </div>
          <fieldset class="presentation-fieldset">
            <legend>${copy.navigationSections}</legend>
            <div id="navigation-options" class="presentation-options"></div>
            <p class="hint">${copy.navigationHint}</p>
          </fieldset>
          <fieldset class="presentation-fieldset">
            <legend>${copy.homeWidgets}</legend>
            <div id="home-widget-options" class="presentation-options"></div>
            <p class="hint">${copy.homeWidgetsHint}</p>
          </fieldset>
          <div class="form-row">
            <button id="reset-presentation" class="secondary" type="button">${copy.resetPresentation}</button>
            <button id="export-presentation-profile" class="secondary" type="button">${copy.exportPresentationProfile}</button>
            <label class="file-button secondary" for="presentation-profile-input">${copy.importPresentationProfile}</label>
            <input id="presentation-profile-input" type="file" accept="application/json,.json" />
          </div>
          <p id="presentation-status" class="hint" role="status">${copy.presentationHint}</p>
        </form>
      </section>

      <section id="capture" class="panel" aria-labelledby="capture-heading">
        <p id="capture-label" class="eyebrow">${copy.capture}</p>
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
          <label class="check-row" for="capture-safe-route"><input id="capture-safe-route" type="checkbox" /> ${copy.safeDirectRoute}</label>
          <p class="hint">${copy.safeDirectRouteHint}</p>
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
            <input id="acquire-file" type="file" accept="text/*,application/json,application/gpx+xml,.json,.csv,.gpx,.txt" />
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
        <form id="space-create-form" class="relationship-form">
          <label for="space-name">${copy.spaceName}</label>
          <input id="space-name" name="name" type="text" maxlength="80" required />
          <button id="space-create" type="submit">${copy.createSpace}</button>
          <p id="space-create-status" class="hint" role="status"></p>
        </form>
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
        <ul id="space-list" class="record-list"></ul>
        <p class="hint">${copy.activeMemberships}</p>
        <ul id="space-membership-list" class="record-list"></ul>
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
        <p id="triage-status" class="hint" role="status"></p>
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

      <section id="sharing" class="panel" aria-labelledby="sharing-heading">
        <p class="eyebrow">${copy.sharing}</p>
        <h2 id="sharing-heading">${copy.sharingHeading}</h2>
        <form id="share-form" class="relationship-form">
          <label for="share-recipient">${copy.shareRecipient}</label>
          <input id="share-recipient" name="recipient" type="text" maxlength="160" required />
          <label for="share-purpose">${copy.sharePurpose}</label>
          <input id="share-purpose" name="purpose" type="text" maxlength="500" required />
          <label for="share-expiry">${copy.shareExpiry}</label>
          <input id="share-expiry" name="expiresAt" type="datetime-local" />
          <label for="share-space">${copy.space}</label>
          <select id="share-space" name="space">
            <option value="personal">${copy.personal}</option>
            <option value="household">${copy.household}</option>
            <option value="work">${copy.work}</option>
          </select>
          <label for="share-grant">${copy.shareGrant}</label>
          <select id="share-grant" name="grant"><option value="">${copy.selectGrant}</option></select>
          <label for="share-records">${copy.selectRecords}</label>
          <select id="share-records" name="records" multiple size="6"></select>
          <label class="check-row" for="share-include-private"><input id="share-include-private" type="checkbox" /> ${copy.includePrivate}</label>
          <p class="hint">${copy.sharingHint}</p>
          <div class="form-row">
            <button id="share-grant-submit" type="submit" disabled>${copy.createGrant}</button>
            <button id="share-export" class="secondary" type="button" disabled>${copy.exportProjection}</button>
          </div>
          <p id="share-status" class="hint" role="status"></p>
        </form>
        <ul id="share-grant-list" class="record-list"></ul>
      </section>

      <section id="sync" class="panel" aria-labelledby="sync-heading">
        <p class="eyebrow">SYNC / PORTABILITY</p>
        <h2 id="sync-heading">${copy.syncHeading}</h2>
        <form id="sync-form" class="relationship-form">
          <label for="sync-endpoint">${copy.syncEndpoint}</label>
          <input id="sync-endpoint" name="endpoint" type="url" maxlength="500" placeholder="https://your-endpoint.example/replica" required />
          <p class="hint">${copy.syncHint}</p>
          <button id="sync-submit" type="submit">${copy.syncRun}</button>
          <p id="sync-status" class="hint" role="status"></p>
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
            <p id="records-label" class="eyebrow">${copy.canonicalRecords}</p>
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
        <form id="document-finish-form" class="relationship-form">
          <h3>${copy.documentFinishHeading}</h3>
          <label for="document-finish-source">${copy.documentFinishSource}</label>
          <select id="document-finish-source" required><option value="">${copy.documentFinishSource}</option></select>
          <label for="document-finish-terms">${copy.documentFinishTerms}</label>
          <input id="document-finish-terms" type="text" maxlength="1000" required />
          <label for="document-finish-replacement">${copy.documentFinishReplacement}</label>
          <input id="document-finish-replacement" type="text" maxlength="80" value="[REDACTED]" required />
          <p class="hint">${copy.documentFinishHint}</p>
          <button type="submit">${copy.documentFinishSubmit}</button>
          <p id="document-finish-status" class="hint" role="status"></p>
        </form>
        <form id="effect-stage-form" class="relationship-form">
          <h3>${copy.effectStageHeading}</h3>
          <label for="effect-stage-destination">${copy.effectDestination}</label>
          <input id="effect-stage-destination" type="url" maxlength="500" placeholder="https://your-endpoint.example/action" required />
          <label for="effect-stage-purpose">${copy.effectPurpose}</label>
          <input id="effect-stage-purpose" type="text" maxlength="500" required />
          <label for="effect-stage-payload">${copy.effectPayload}</label>
          <textarea id="effect-stage-payload" rows="4" maxlength="20000" required></textarea>
          <label for="effect-stage-space">${copy.effectScope}</label>
          <select id="effect-stage-space" name="space" required></select>
          <p class="hint">${copy.effectStageHint}</p>
          <button type="submit">${copy.effectQueue}</button>
          <p id="effect-stage-status" class="hint" role="status"></p>
        </form>
        <form id="effect-run-form" class="relationship-form">
          <h3>${copy.effectRunHeading}</h3>
          <label for="effect-run-endpoint">${copy.effectRunEndpoint}</label>
          <input id="effect-run-endpoint" type="url" maxlength="500" placeholder="https://your-endpoint.example/action" required />
          <p class="hint">${copy.effectRunHint}</p>
          <button type="submit">${copy.effectRun}</button>
          <p id="effect-run-status" class="hint" role="status"></p>
        </form>
        <div class="relationship-form">
          <h3>${copy.effectOutboxHeading}</h3>
          <p class="hint">${copy.effectOutboxHint}</p>
          <ul id="effect-list" class="record-list"></ul>
        </div>
        <label for="vault-password">${recoveryCopy.password}</label>
        <input id="vault-password" type="password" minlength="8" autocomplete="new-password" />
        <p class="hint">${recoveryCopy.passwordHint}</p>
        <p id="recovery-status" class="hint" role="status"></p>
      </section>
    </main>
    <dialog id="effect-run-dialog" aria-labelledby="effect-run-dialog-title" aria-describedby="effect-run-dialog-message" aria-modal="true">
      <h2 id="effect-run-dialog-title">${copy.effectRunHeading}</h2>
      <p id="effect-run-dialog-message"></p>
      <div class="dialog-actions">
        <button id="effect-run-dialog-cancel" class="secondary" type="button">${copy.effectRunCancel}</button>
        <button id="effect-run-dialog-confirm" type="button">${copy.effectRunConfirm}</button>
      </div>
    </dialog>
    <footer><span>${copy.footerPhase0}</span><span>${copy.footerOptional}</span></footer>
  `;

  const captureForm = root.querySelector<HTMLFormElement>("#capture-form");
  const captureType = root.querySelector<HTMLSelectElement>("#capture-type");
  const captureSpace = root.querySelector<HTMLSelectElement>("#capture-space");
  const captureText = root.querySelector<HTMLTextAreaElement>("#capture-text");
  const captureSafeRoute = root.querySelector<HTMLInputElement>("#capture-safe-route");
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
  const spaceCreateForm = root.querySelector<HTMLFormElement>("#space-create-form");
  const spaceName = root.querySelector<HTMLInputElement>("#space-name");
  const spaceCreateStatus = root.querySelector<HTMLElement>("#space-create-status");
  const spaceForm = root.querySelector<HTMLFormElement>("#space-form");
  const spaceRecord = root.querySelector<HTMLSelectElement>("#space-record");
  const spaceMembership = root.querySelector<HTMLSelectElement>("#space-membership");
  const spaceFilter = root.querySelector<HTMLSelectElement>("#space-filter");
  const spaceStatus = root.querySelector<HTMLElement>("#space-status");
  const spaceList = root.querySelector<HTMLUListElement>("#space-list");
  const spaceMembershipList = root.querySelector<HTMLUListElement>("#space-membership-list");
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
  const triageStatusMessage = root.querySelector<HTMLElement>("#triage-status")!;
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
  const shareForm = root.querySelector<HTMLFormElement>("#share-form");
  const shareRecipient = root.querySelector<HTMLInputElement>("#share-recipient");
  const sharePurpose = root.querySelector<HTMLInputElement>("#share-purpose");
  const shareExpiry = root.querySelector<HTMLInputElement>("#share-expiry");
  const shareSpace = root.querySelector<HTMLSelectElement>("#share-space");
  const shareGrant = root.querySelector<HTMLSelectElement>("#share-grant");
  const shareRecords = root.querySelector<HTMLSelectElement>("#share-records");
  const shareIncludePrivate = root.querySelector<HTMLInputElement>("#share-include-private");
  const shareGrantSubmit = root.querySelector<HTMLButtonElement>("#share-grant-submit");
  const shareExport = root.querySelector<HTMLButtonElement>("#share-export");
  const shareStatus = root.querySelector<HTMLElement>("#share-status");
  const shareGrantList = root.querySelector<HTMLUListElement>("#share-grant-list");
  const syncForm = root.querySelector<HTMLFormElement>("#sync-form");
  const syncEndpoint = root.querySelector<HTMLInputElement>("#sync-endpoint");
  const syncStatus = root.querySelector<HTMLElement>("#sync-status");
  const focusToggle = root.querySelector<HTMLButtonElement>("#focus-toggle");
  const focusStatus = root.querySelector<HTMLElement>("#focus-status");
  const reminderForm = root.querySelector<HTMLFormElement>("#reminder-form");
  const reminderTitle = root.querySelector<HTMLInputElement>("#reminder-title");
  const reminderDue = root.querySelector<HTMLInputElement>("#reminder-due");
  const reminderStatus = root.querySelector<HTMLElement>("#reminder-status");
  const productLabel = root.querySelector<HTMLElement>("#product-label");
  const productTagline = root.querySelector<HTMLElement>("#product-tagline");
  const productName = root.querySelector<HTMLInputElement>("#product-name");
  const localeInput = root.querySelector<HTMLSelectElement>("#locale");
  const taglineInput = root.querySelector<HTMLInputElement>("#tagline");
  const densityInput = root.querySelector<HTMLSelectElement>("#density");
  const typefaceInput = root.querySelector<HTMLSelectElement>("#typeface");
  const iconographyInput = root.querySelector<HTMLSelectElement>("#iconography");
  const homeLabelInput = root.querySelector<HTMLInputElement>("#home-label-input");
  const captureLabelInput = root.querySelector<HTMLInputElement>("#capture-label-input");
  const recordsLabelInput = root.querySelector<HTMLInputElement>("#records-label-input");
  const captureLabel = root.querySelector<HTMLElement>("#capture-label");
  const navigationOptions = root.querySelector<HTMLElement>("#navigation-options");
  const homeWidgetOptions = root.querySelector<HTMLElement>("#home-widget-options");
  const resetPresentation = root.querySelector<HTMLButtonElement>("#reset-presentation");
  const exportPresentationProfileButton = root.querySelector<HTMLButtonElement>("#export-presentation-profile");
  const presentationProfileInput = root.querySelector<HTMLInputElement>("#presentation-profile-input");
  const primaryNavList = root.querySelector<HTMLOListElement>("#primary-nav-list");
  const homeLabel = root.querySelector<HTMLElement>("#home-label");
  const recordsLabel = root.querySelector<HTMLElement>("#records-label");
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
  const effectList = root.querySelector<HTMLUListElement>("#effect-list")!;
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
  const documentFinishForm = root.querySelector<HTMLFormElement>("#document-finish-form");
  const documentFinishSource = root.querySelector<HTMLSelectElement>("#document-finish-source");
  const documentFinishTerms = root.querySelector<HTMLInputElement>("#document-finish-terms");
  const documentFinishReplacement = root.querySelector<HTMLInputElement>("#document-finish-replacement");
  const documentFinishStatus = root.querySelector<HTMLElement>("#document-finish-status");
  const effectStageForm = root.querySelector<HTMLFormElement>("#effect-stage-form");
  const effectStageDestination = root.querySelector<HTMLInputElement>("#effect-stage-destination");
  const effectStagePurpose = root.querySelector<HTMLInputElement>("#effect-stage-purpose");
  const effectStagePayload = root.querySelector<HTMLTextAreaElement>("#effect-stage-payload");
  const effectStageSpace = root.querySelector<HTMLSelectElement>("#effect-stage-space");
  const effectStageStatus = root.querySelector<HTMLElement>("#effect-stage-status");
  const effectRunForm = root.querySelector<HTMLFormElement>("#effect-run-form");
  const effectRunEndpoint = root.querySelector<HTMLInputElement>("#effect-run-endpoint");
  const effectRunStatus = root.querySelector<HTMLElement>("#effect-run-status");
  const effectRunDialog = root.querySelector<HTMLDialogElement>("#effect-run-dialog");
  const effectRunDialogMessage = root.querySelector<HTMLElement>("#effect-run-dialog-message");
  const effectRunDialogCancel = root.querySelector<HTMLButtonElement>("#effect-run-dialog-cancel");
  const effectRunDialogConfirm = root.querySelector<HTMLButtonElement>("#effect-run-dialog-confirm");
  if (!captureForm || !captureType || !captureSpace || !captureText || !captureSafeRoute || !acquireForm || !acquireText || !acquireFile || !acquireClipboard || !acquireStatus || !acquirePreview || !acceptStaged || !trackForm || !trackName || !trackValue || !trackUnit || !trackSpace || !trackStatus || !expenseForm || !expenseMerchant || !expenseAmount || !expenseCurrency || !expenseSpace || !expenseStatus || !healthForm || !healthMetric || !healthValue || !healthUnit || !healthSubject || !healthNote || !healthSpace || !healthFormStatus || !searchForm || !searchQuery || !clearSearch || !searchStatus || !spaceCreateForm || !spaceName || !spaceCreateStatus || !spaceForm || !spaceRecord || !spaceMembership || !spaceFilter || !spaceStatus || !spaceList || !spaceMembershipList || !composeForm || !composeTitle || !composeFields || !composeSpace || !composeStatus || !composePreview || !summaryTotal || !analysisStatus || !summaryGrid || !insightsGrid || !attentionPanel || !reviewList || !reviewCount || !reviewEmpty || !relateForm || !relateSource || !relateTarget || !relateLabel || !relateSubmit || !relateStatus || !evidenceForm || !evidenceSubject || !evidenceSource || !evidenceRelation || !evidenceClaim || !evidenceUncertainty || !evidenceSubmit || !evidenceStatus || !annotationForm || !annotationSource || !annotationQuote || !annotationNote || !annotationSubmit || !annotationStatus || !placeForm || !placeLabel || !placeLatitude || !placeLongitude || !placeGeoJson || !placeStatus || !knowledgeStatus || !shareForm || !shareRecipient || !sharePurpose || !shareExpiry || !shareSpace || !shareGrant || !shareRecords || !shareIncludePrivate || !shareGrantSubmit || !shareExport || !shareStatus || !shareGrantList || !syncForm || !syncEndpoint || !syncStatus || !focusToggle || !focusStatus || !reminderForm || !reminderTitle || !reminderDue || !reminderStatus || !productLabel || !productTagline || !productName || !localeInput || !taglineInput || !densityInput || !typefaceInput || !iconographyInput || !homeLabelInput || !captureLabelInput || !recordsLabelInput || !captureLabel || !navigationOptions || !homeWidgetOptions || !resetPresentation || !exportPresentationProfileButton || !presentationProfileInput || !primaryNavList || !homeLabel || !recordsLabel || !presentationForm || !presentationStatus || !recordList || !emptyState || !recordCount || !toggleArchive || !archivePanel || !archiveList || !archiveEmpty || !recoveryStatus || !healthStatus || !capabilityStatus || !themeToggle || !exportButton || !encryptedExportButton || !vaultPassword || !diagnosticsButton || !repairSearchButton || !safePresentationButton || !clearCanonicalButton || !importInput || !artifactInput) {
    throw new Error("Omnevum foundation controls are missing");
  }
  if (!documentFinishForm || !documentFinishSource || !documentFinishTerms || !documentFinishReplacement || !documentFinishStatus) {
    throw new Error("Omnevum document-finishing controls are missing");
  }
  if (!effectStageForm || !effectStageDestination || !effectStagePurpose || !effectStagePayload || !effectStageSpace || !effectStageStatus || !effectRunForm || !effectRunEndpoint || !effectRunStatus || !effectRunDialog || !effectRunDialogMessage || !effectRunDialogCancel || !effectRunDialogConfirm) {
    throw new Error("Omnevum external-effect controls are missing");
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
  const spaceLabels = new Map<SpaceId, string>(Object.entries(SPACE_LABELS));
  const requestEffectRunConfirmation = (endpoint: string): Promise<boolean> => new Promise((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    effectRunDialogMessage.textContent = `${copy.effectRunConfirmation} ${endpoint}?`;
    let settled = false;
    const finish = (confirmed: boolean): void => {
      if (settled) return;
      settled = true;
      effectRunDialog.removeEventListener("cancel", onCancel);
      effectRunDialogCancel.removeEventListener("click", cancel);
      effectRunDialogConfirm.removeEventListener("click", confirm);
      if (effectRunDialog.open) effectRunDialog.close();
      previousFocus?.focus();
      resolve(confirmed);
    };
    const cancel = (): void => finish(false);
    const confirm = (): void => finish(true);
    const onCancel = (event: Event): void => { event.preventDefault(); cancel(); };
    effectRunDialog.addEventListener("cancel", onCancel);
    effectRunDialogCancel.addEventListener("click", cancel);
    effectRunDialogConfirm.addEventListener("click", confirm);
    effectRunDialog.showModal();
    effectRunDialogConfirm.focus();
  });

  const sectionLabel = (id: PresentationSectionId): string => {
    switch (id) {
      case "home-summary": return presentation.labels.home || copy.home;
      case "capture":
      case "acquire": return presentation.labels.capture || copy.capture;
      case "records": return presentation.labels.records || copy.canonicalRecords;
      case "presentation": return copy.personalization;
      case "recovery": return copy.recovery;
      case "track": return copy.track;
      case "domains": return copy.domains;
      case "search": return copy.searchExplore;
      case "spaces": return copy.space;
      case "compose": return copy.compose;
      case "review": return copy.triage;
      case "relate": return copy.relate;
      case "knowledge": return copy.sources;
      case "sharing": return copy.sharing;
      case "sync": return copy.syncHeading;
      case "focus": return copy.timeObserve;
      case "reminders": return timeCopy.reminders;
    }
  };

  const homeWidgetLabel = (id: PresentationHomeWidgetId): string => id === "summary" ? copy.currentPicture : id === "insights" ? copy.signals : timeCopy.dueOnResume;
  const sectionIcon = (id: PresentationSectionId): string => ({ "home-summary": "⌂", capture: "✎", acquire: "↓", track: "◌", domains: "◇", search: "⌕", spaces: "▦", compose: "▤", review: "✓", relate: "↔", knowledge: "§", sharing: "⇧", sync: "⟳", focus: "◷", reminders: "!", records: "☷", recovery: "↺", presentation: "⚙" })[id];
  const presentationSections = new Map(PRESENTATION_SECTION_IDS.map((id) => [id, root.querySelector<HTMLElement>(`#${id}`)] as const));
  const movePresentationRow = (container: HTMLElement, button: HTMLButtonElement): void => {
    const row = button.closest<HTMLElement>("[data-presentation-option]");
    if (!row) return;
    if (button.dataset.direction === "up" && row.previousElementSibling) container.insertBefore(row, row.previousElementSibling);
    if (button.dataset.direction === "down" && row.nextElementSibling) container.insertBefore(row.nextElementSibling, row);
  };
  const renderPresentationOptions = (): void => {
    const renderRows = <T extends string>(container: HTMLElement, order: readonly T[], allowed: readonly T[], labelFor: (id: T) => string, visible: readonly T[], required: readonly T[], optionName: string): void => {
      container.replaceChildren();
      const ordered = [...order, ...allowed.filter((id) => !order.includes(id))];
      for (const id of ordered) {
        const row = document.createElement("div");
        row.dataset.presentationOption = id;
        const label = document.createElement("label");
        label.className = "check-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = visible.includes(id);
        checkbox.disabled = required.includes(id);
        checkbox.dataset.presentationVisibility = optionName;
        checkbox.value = id;
        label.append(checkbox, document.createTextNode(labelFor(id)));
        const actions = document.createElement("span");
        actions.className = "presentation-order-actions";
        for (const direction of ["up", "down"] as const) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "secondary icon-button";
          button.dataset.direction = direction;
          button.textContent = direction === "up" ? "↑" : "↓";
          button.setAttribute("aria-label", direction === "up" ? "Move up" : "Move down");
          actions.append(button);
        }
        row.append(label, actions);
        container.append(row);
      }
    };
    renderRows(navigationOptions, presentation.navigation.order, PRESENTATION_SECTION_IDS, sectionLabel, presentation.navigation.visible, ["recovery", "presentation"], "navigation");
    renderRows(homeWidgetOptions, presentation.homeWidgets, PRESENTATION_HOME_WIDGET_IDS, homeWidgetLabel, presentation.homeWidgets, [], "home");
  };
  const readOptionOrder = <T extends string>(container: HTMLElement): T[] => [...container.children].map((row) => row.getAttribute("data-presentation-option")).filter((value): value is T => typeof value === "string") ;
  const readOptionVisibility = <T extends string>(container: HTMLElement): T[] => [...container.querySelectorAll<HTMLInputElement>("input[data-presentation-visibility]:checked")].map((input) => input.value as T);
  const applyPresentationProfile = (): void => {
    root.dataset.theme = presentation.theme;
    root.dataset.density = presentation.density;
    root.dataset.typeface = presentation.typeface;
    root.dataset.iconography = presentation.iconography;
    document.documentElement.dataset.theme = presentation.theme;
    document.documentElement.dataset.typeface = presentation.typeface;
    document.title = `${presentation.productName} - ${copy.productHeading}`;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = presentation.theme === "dark" ? "#000000" : "#f7f8fa";
    productLabel.textContent = `${presentation.productName} ${copy.foundation}`;
    productTagline.textContent = presentation.tagline || copy.lede;
    productName.value = presentation.productName;
    taglineInput.value = presentation.tagline;
    localeInput.value = presentation.locale;
    densityInput.value = presentation.density;
    typefaceInput.value = presentation.typeface;
    iconographyInput.value = presentation.iconography;
    homeLabelInput.value = presentation.labels.home;
    captureLabelInput.value = presentation.labels.capture;
    recordsLabelInput.value = presentation.labels.records;
    homeLabel.textContent = presentation.labels.home || copy.home;
    captureLabel.textContent = presentation.labels.capture || copy.capture;
    recordsLabel.textContent = presentation.labels.records || copy.canonicalRecords;
    themeToggle.textContent = presentation.theme === "dark" ? copy.themeLight : copy.themeDark;
    themeToggle.setAttribute("aria-pressed", String(presentation.theme === "dark"));
    renderPresentationOptions();
    primaryNavList.replaceChildren();
    const visible = new Set(presentation.navigation.visible);
    for (const id of presentation.navigation.order) {
      if (!visible.has(id)) continue;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = sectionLabel(id);
      link.dataset.navIcon = sectionIcon(id);
      item.append(link);
      primaryNavList.append(item);
    }
    const order = new Map(presentation.navigation.order.map((id, index) => [id, index + 1]));
    for (const id of PRESENTATION_SECTION_IDS) {
      const section = presentationSections.get(id);
      if (!section) continue;
      section.hidden = !visible.has(id);
      section.style.order = String(order.get(id) ?? PRESENTATION_SECTION_IDS.length + 1);
    }
    const homeOrder = new Map(presentation.homeWidgets.map((id, index) => [id, index + 1]));
    for (const widget of root.querySelectorAll<HTMLElement>("[data-home-widget]")) {
      const id = widget.dataset.homeWidget as PresentationHomeWidgetId;
      widget.hidden = !presentation.homeWidgets.includes(id);
      widget.style.order = String(homeOrder.get(id) ?? PRESENTATION_HOME_WIDGET_IDS.length + 1);
    }
  };
  for (const container of [navigationOptions, homeWidgetOptions]) container.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-direction]");
    if (button) movePresentationRow(container, button);
  });
  applyPresentationProfile();

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

  presentationStatus.textContent = safePresentationMode ? recoveryCopy.safePresentationHint : presentationResolution.storedProfileValid ? copy.presentationHint : `Safe presentation fallback is active. ${copy.presentationHint}`;

  const typeLabel = (recordType: string): string => recordType === "task" ? copy.task : recordType === "observation" ? copy.observation : recordType === "artifact" ? copy.attachArtifact : recordType === "relationship" ? copy.relationship : copy.note;
  const triageActionLabel = (action: TriageProposalAction): string => ({ REVIEW: copy.markReviewed, CLARIFY: copy.clarify, DEFER: copy.defer, REFERENCE: copy.reference, LINK: copy.createLink, ROUTE: copy.route, SPLIT: copy.split, DELETE: copy.delete })[action];
  const spaceLabel = (space: SpaceId): string => spaceLabels.get(space) ?? space;

  const renderSpaceChoices = async (): Promise<void> => {
    const spaces = await spaceService.listSpaces();
    spaceLabels.clear();
    for (const space of spaces) {
      const localizedName = space.id === "personal" ? copy.personal : space.id === "household" ? copy.household : space.id === "work" ? copy.work : space.name;
      spaceLabels.set(space.id, localizedName);
    }
    const fillSpaces = (select: HTMLSelectElement, includeAll: boolean): void => {
      const previous = select.value;
      select.replaceChildren();
      if (includeAll) {
        const all = document.createElement("option");
        all.value = "";
        all.textContent = copy.allSpaces;
        select.append(all);
      }
      for (const space of spaces) {
        const option = document.createElement("option");
        option.value = space.id;
        option.textContent = spaceLabels.get(space.id) ?? space.name;
        select.append(option);
      }
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
      else if (!includeAll && spaces[0]) select.value = spaces[0].id;
    };
    fillSpaces(spaceMembership, false);
    fillSpaces(spaceFilter, true);
    fillSpaces(composeSpace, true);
    fillSpaces(shareSpace, false);
    fillSpaces(effectStageSpace, false);
    spaceList.replaceChildren();
    for (const space of spaces.filter((candidate) => !candidate.builtIn)) {
      const item = document.createElement("li");
      item.className = "record-item";
      const label = document.createElement("strong");
      label.textContent = space.name;
      const meta = document.createElement("small");
      meta.textContent = space.id;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.textContent = copy.removeSpace;
      remove.addEventListener("click", async () => {
        if (!window.confirm(copy.removeSpaceConfirmation(space.name))) return;
        try {
          await spaceService.removeSpace(space.id);
          if (activeSpace === space.id) activeSpace = undefined;
          spaceStatus.textContent = copy.spaceRemoved(space.name);
          await renderRecords(searchQuery.value);
        } catch (error) {
          spaceStatus.textContent = describeError(error, "Space was not removed; canonical records were not changed.");
        }
      });
      item.append(label, meta, remove);
      spaceList.append(item);
    }
    const records = (await store.list()).filter((record) => record.owner !== "platform.space");
    const recordsById = new Map(records.map((record) => [record.id, record]));
    spaceMembershipList.replaceChildren();
    for (const membership of (await spaceService.memberships()).filter(isSpaceMembership)) {
      const source = recordsById.get(membership.data.recordId);
      if (!source) continue;
      const item = document.createElement("li");
      item.className = "record-item";
      const label = document.createElement("strong");
      label.textContent = `${spaceLabel(membership.data.space)} - ${typeLabel(source.recordType)}: ${recordText(source).slice(0, 120)}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.textContent = copy.removeMembership;
      remove.addEventListener("click", async () => {
        if (!window.confirm(copy.removeMembershipConfirmation(recordText(source), spaceLabel(membership.data.space)))) return;
        try {
          await spaceService.remove(membership.id);
          spaceStatus.textContent = copy.membershipRemoved(spaceLabel(membership.data.space));
          await renderRecords(searchQuery.value);
        } catch (error) {
          spaceStatus.textContent = describeError(error, "Space membership was not removed; canonical records were not changed.");
        }
      });
      item.append(label, remove);
      spaceMembershipList.append(item);
    }
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

  const renderDocumentFinishChoices = async (): Promise<void> => {
    const previous = documentFinishSource.value;
    const artifacts = (await store.list()).filter((record) => {
      if (record.deleted || record.recordType !== "artifact") return false;
      const adapter = record.data.adapter;
      const mimeType = typeof record.data.mimeType === "string" ? record.data.mimeType : "";
      return adapter === "TEXT" || adapter === "HTML" || (!adapter && mimeType.startsWith("text/"));
    });
    documentFinishSource.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = copy.documentFinishSource;
    documentFinishSource.append(placeholder);
    for (const record of artifacts) {
      const option = document.createElement("option");
      option.value = record.id;
      option.textContent = `${String(record.data.fileName ?? record.id)} (revision ${record.revision})`;
      documentFinishSource.append(option);
    }
    if (artifacts.some((record) => record.id === previous)) documentFinishSource.value = previous;
    documentFinishForm.querySelector("button[type=submit]")?.toggleAttribute("disabled", artifacts.length === 0);
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
    const scoped = await scopedRecords();
    const now = Date.now();
    const records = scoped.filter((record) => {
      if (recordTriageStatus(record) === "REVIEWED") return false;
      const deferredUntil = recordTriageDeferredUntil(record);
      return !deferredUntil || Date.parse(deferredUntil) <= now;
    });
    const linkTargets = scoped.filter((record) => record.recordType !== "relationship");
    reviewList.replaceChildren();
    reviewCount.textContent = formatNumber(presentation.locale, records.length);
    reviewEmpty.hidden = records.length > 0;
    for (const record of [...records].reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const text = document.createElement("p");
      const triageStatus = recordTriageStatus(record);
      text.textContent = `${typeLabel(record.recordType)}: ${recordText(record)} (${copy.triageStatus(triageStatus)})`;
      const proposal = proposeTriage(record);
      const proposalText = document.createElement("p");
      proposalText.className = "hint triage-proposal";
      proposalText.textContent = copy.triageProposal(
        proposal.possibleOwners.join(", "),
        proposal.possibleTypes.map((type) => typeLabel(type)).join(", "),
        proposal.possibleActions.map(triageActionLabel).join(", ")
      );
      const actions = document.createElement("div");
      actions.className = "triage-actions";
      const updateTriage = (status: TriageStatus, label: string, extraData: Record<string, unknown> = {}): void => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-button";
        button.textContent = label;
        button.addEventListener("click", async () => {
          try {
            const { triageDisposition: _previousDisposition, ...dataWithoutDisposition } = record.data;
            await commands.update(record.id, { ...dataWithoutDisposition, ...extraData, triageStatus: status }, record.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            triageStatusMessage.textContent = describeError(error, "Triage update failed; canonical data was not changed.");
          }
        });
        actions.append(button);
      };
      updateTriage("REVIEWED", copy.markReviewed);
      const deferUntil = document.createElement("input");
      deferUntil.type = "datetime-local";
      deferUntil.setAttribute("aria-label", copy.deferUntil);
      deferUntil.value = new Date(Date.now() + 24 * 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
      const defer = document.createElement("button");
      defer.type = "button";
      defer.className = "icon-button";
      defer.textContent = copy.defer;
      defer.addEventListener("click", async () => {
        try {
          await commands.deferTriage(record.id, new Date(deferUntil.value).toISOString(), record.revision);
          await renderRecords(searchQuery.value);
        } catch (error) {
          triageStatusMessage.textContent = describeError(error, "Triage defer failed; canonical data was not changed.");
        }
      });
      actions.append(deferUntil, defer);
      updateTriage("CLARIFY", copy.clarify);
      updateTriage("REVIEWED", copy.reference, { triageDisposition: "REFERENCE" });
      const targets = linkTargets.filter((target) => target.id !== record.id);
      if (targets.length > 0) {
        const targetSelect = document.createElement("select");
        targetSelect.setAttribute("aria-label", copy.targetRecord);
        for (const target of targets) {
          const option = document.createElement("option");
          option.value = target.id;
          option.textContent = `${typeLabel(target.recordType)}: ${recordText(target).slice(0, 70)}`;
          targetSelect.append(option);
        }
        const link = document.createElement("button");
        link.type = "button";
        link.className = "icon-button";
        link.textContent = copy.createLink;
        link.addEventListener("click", async () => {
          try {
            await commands.linkTriage(record.id, targetSelect.value, "related", record.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            triageStatusMessage.textContent = describeError(error, "Triage link failed; canonical data was not changed.");
          }
        });
        actions.append(targetSelect, link);
      }
      const routeSelect = document.createElement("select");
      routeSelect.setAttribute("aria-label", copy.route);
      for (const [value, label] of [["note", copy.note], ["task", copy.task]] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        routeSelect.append(option);
      }
      const route = document.createElement("button");
      route.type = "button";
      route.className = "icon-button";
      route.textContent = copy.route;
      route.addEventListener("click", async () => {
        try {
          const target: TriageRouteTarget = routeSelect.value === "task" ? "task" : "note";
          await commands.routeTriage(record.id, target, record.revision);
          await renderRecords(searchQuery.value);
        } catch (error) {
          triageStatusMessage.textContent = describeError(error, "Triage route failed; canonical data was not changed.");
        }
      });
      actions.append(routeSelect, route);
      const splitControls = document.createElement("div");
      splitControls.className = "triage-split";
      const splitType = document.createElement("select");
      splitType.setAttribute("aria-label", copy.splitKind);
      for (const [value, label] of [["note", copy.note], ["task", copy.task]] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        splitType.append(option);
      }
      const splitParts = document.createElement("textarea");
      splitParts.rows = 2;
      splitParts.maxLength = 8000;
      splitParts.placeholder = copy.splitHint;
      splitParts.setAttribute("aria-label", copy.splitParts);
      const split = document.createElement("button");
      split.type = "button";
      split.className = "icon-button";
      split.textContent = copy.split;
      split.addEventListener("click", async () => {
        const texts = splitParts.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        if (texts.length < 2) {
          triageStatusMessage.textContent = copy.splitHint;
          return;
        }
        try {
          const target = splitType.value === "task" ? "task" : "note";
          const parts: TriageSplitPart[] = texts.map((text) => ({ target, text }));
          await commands.splitTriage(record.id, parts, record.revision);
          triageStatusMessage.textContent = copy.splitSaved(parts.length);
          await renderRecords(searchQuery.value);
        } catch (error) {
          triageStatusMessage.textContent = describeError(error, "Triage split failed; canonical data was not changed.");
        }
      });
      splitControls.append(splitType, splitParts, split);
      actions.append(splitControls);
      const deleteTriage = document.createElement("button");
      deleteTriage.type = "button";
      deleteTriage.className = "icon-button danger-button";
      deleteTriage.textContent = copy.delete;
      deleteTriage.addEventListener("click", async () => {
        try {
          await commands.deleteTriage(record.id, record.revision);
          await renderRecords(searchQuery.value);
        } catch (error) {
          triageStatusMessage.textContent = describeError(error, "Triage delete failed; canonical data was not changed.");
        }
      });
      actions.append(deleteTriage);
      const archive = document.createElement("button");
      archive.type = "button";
      archive.className = "icon-button";
      archive.textContent = copy.archive;
      archive.addEventListener("click", async () => {
        try {
          await commands.archive(record.id);
          await renderRecords(searchQuery.value);
        } catch (error) {
          triageStatusMessage.textContent = describeError(error, "Triage archive failed; canonical data was not changed.");
        }
      });
      actions.append(archive);
      item.append(text, proposalText, actions);
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

  const selectedShareIds = (): string[] => [...shareRecords.selectedOptions].map((option) => option.value);

  const updateShareActions = (): void => {
    const hasSelection = selectedShareIds().length > 0;
    shareGrantSubmit.disabled = !hasSelection;
    shareExport.disabled = !hasSelection || !shareGrant.value;
  };

  const renderShareChoices = async (): Promise<void> => {
    const selected = new Set(selectedShareIds());
    const records = (await store.list()).filter((record) => record.owner !== "platform.space" && record.owner !== "platform.share");
    shareRecords.replaceChildren();
    for (const record of records) {
      const option = document.createElement("option");
      option.value = record.id;
      option.textContent = `${typeLabel(record.recordType)}: ${recordText(record).slice(0, 70)}`;
      option.selected = selected.has(record.id);
      shareRecords.append(option);
    }
    updateShareActions();
  };

  const renderShareGrants = async (): Promise<void> => {
    const grants = (await store.list()).filter((record) => record.owner === "platform.share" && record.data.kind === "share-grant").sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    const selectedGrant = shareGrant.value;
    shareGrant.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = copy.selectGrant;
    shareGrant.append(placeholder);
    shareGrantList.replaceChildren();
    for (const grant of grants) {
      const recordIds = Array.isArray(grant.data.recordIds) ? grant.data.recordIds.filter((id): id is string => typeof id === "string") : [];
      const usable = canUseShareGrant(grant, recordIds);
      if (usable) {
        const option = document.createElement("option");
        option.value = grant.id;
        option.textContent = `${typeof grant.data.grantedTo === "string" ? grant.data.grantedTo : "recipient"}: ${typeof grant.data.purpose === "string" ? grant.data.purpose : "share"}`;
        option.selected = grant.id === selectedGrant;
        shareGrant.append(option);
      }
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${typeof grant.data.grantedTo === "string" ? grant.data.grantedTo : "recipient"} - ${grant.data.status === "ACTIVE" ? (usable ? "ACTIVE" : "EXPIRED") : "REVOKED"}`;
      const detail = document.createElement("p");
      detail.textContent = typeof grant.data.purpose === "string" ? grant.data.purpose : recordText(grant);
      const meta = document.createElement("small");
      meta.textContent = `${Array.isArray(grant.data.recordIds) ? grant.data.recordIds.length : 0} record(s)${typeof grant.data.expiresAt === "string" ? ` - expires ${formatDateTime(presentation.locale, grant.data.expiresAt)}` : ""}`;
      content.append(title, detail, meta);
      if (grant.data.status === "ACTIVE") {
        const revoke = document.createElement("button");
        revoke.type = "button";
        revoke.className = "icon-button";
        revoke.textContent = copy.revoke;
        revoke.addEventListener("click", async () => {
          try {
            await revokeShareGrant(commands, grant.id);
            if (shareGrant.value === grant.id) shareGrant.value = "";
            shareStatus.textContent = copy.grantRevoked;
            await renderRecords(searchQuery.value);
          } catch (error) {
            shareStatus.textContent = describeError(error, "Share grant could not be revoked.");
          }
        });
        item.append(revoke);
      }
      item.prepend(content);
      shareGrantList.append(item);
    }
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
      if (entry.revision < record.revision) {
        const revert = document.createElement("button");
        revert.type = "button";
        revert.className = "secondary";
        revert.textContent = copy.revertToRevision(entry.revision);
        revert.addEventListener("click", async () => {
          try {
            await revertToRevision(commands, store, record.id, entry.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            healthStatus.textContent = describeError(error, "Revert failed; canonical data was not changed.");
          }
        });
        item.append(revert);
      }
      list.append(item);
    }
    details.append(summary, list);
    return details;
  };

  const renderEffects = async (): Promise<void> => {
    const operations = (await store.listEffects()).filter((operation) => operation.status !== "SUCCEEDED");
    effectList.replaceChildren();
    if (operations.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.effectNoMaterial;
      effectList.append(empty);
      return;
    }
    for (const operation of operations.slice(-40).reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${operation.status} - ${operation.purpose}`;
      const destination = document.createElement("p");
      destination.textContent = operation.destination;
      const meta = document.createElement("small");
      const retryAt = operation.nextAttemptAt ? `; next ${formatDateTime(presentation.locale, operation.nextAttemptAt)}` : "";
      const scope = operation.authorization?.space ? `; Space ${spaceLabel(operation.authorization.space)}` : "";
      meta.textContent = `attempts ${operation.retryCount}/${operation.retryPolicy.maxAttempts}${scope}${retryAt}`;
      content.append(title, destination, meta);
      const canCancel = ["PENDING", "FAILED_RETRYABLE", "OUTCOME_UNKNOWN", "RECONCILE"].includes(operation.status);
      if (canCancel) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "icon-button";
        cancel.textContent = copy.effectCancel;
        cancel.addEventListener("click", async () => {
          if (!window.confirm(`${copy.effectCancel}?`)) return;
          try {
            const cancelled = transitionEffect(operation, "CANCELLED", { evidence: [...operation.evidence, "cancelled-from-recovery-ledger"] });
            await store.updateEffect(cancelled, operation.status);
            recoveryStatus.textContent = copy.effectCancelled;
            await renderEffects();
          } catch (error) {
            recoveryStatus.textContent = describeError(error, "Effect cancellation failed; its persisted state was not changed.");
          }
        });
        item.append(cancel);
      }
      if (operation.status === "FAILED_RETRYABLE" && operation.retryCount < operation.retryPolicy.maxAttempts) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "icon-button";
        retry.textContent = copy.effectRetry;
        retry.addEventListener("click", async () => {
          try {
            const queued = transitionEffect(operation, "PENDING", { nextAttemptAt: undefined, evidence: [...operation.evidence, "manual-retry-requested"] });
            await store.updateEffect(queued, operation.status);
            recoveryStatus.textContent = copy.effectRetryQueued;
            await renderEffects();
          } catch (error) {
            recoveryStatus.textContent = describeError(error, "Effect retry could not be queued; its persisted state was not changed.");
          }
        });
        item.append(retry);
      }
      item.prepend(content);
      effectList.append(item);
    }
  };

  effectStageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const operation = createExternalEffect({ destination: effectStageDestination.value, purpose: effectStagePurpose.value, payloadOrReference: parseExternalEffectPayload(effectStagePayload.value), authorization: { authority: "local-user", permission: "effect.execute", space: effectStageSpace.value, disclosureClass: "PRIVATE", schema: "effect-json-v1" } });
      await store.enqueueEffect(operation);
      effectStageStatus.textContent = copy.effectQueued;
      effectStagePurpose.value = "";
      effectStagePayload.value = "";
      await renderEffects();
    } catch (error) {
      effectStageStatus.textContent = describeError(error, "The external effect was not queued; no request was sent.");
    }
  });

  effectRunForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const endpoint = effectRunEndpoint.value.trim();
    if (!await requestEffectRunConfirmation(endpoint)) return;
    try {
      const results = await new EffectRunner(store, new JsonEndpointEffectExecutor(endpoint), createEffectRevalidationGuard({
        authority: "local-user",
        allowedPermissions: ["effect.execute"],
        availableSpaces: async () => new Set((await spaceService.listSpaces()).map((space) => space.id)),
        allowedDisclosureClasses: ["PRIVATE"],
        supportedSchemas: ["effect-json-v1"]
      })).runAvailable();
      const succeeded = results.filter((operation) => operation.status === "SUCCEEDED").length;
      const attention = results.length - succeeded;
      effectRunStatus.textContent = copy.effectRunResult(results.length, succeeded, attention);
      await renderEffects();
    } catch (error) {
      effectRunStatus.textContent = describeError(error, "External effects could not be run; persisted state was not discarded.");
    }
  });

  const renderRecords = async (query = ""): Promise<number> => {
    const allRecords = await store.list();
    if (activeSpace) {
      const availableSpaces = await spaceService.listSpaces();
      if (!availableSpaces.some((space) => space.id === activeSpace)) {
        const revokedSpace = spaceLabel(activeSpace);
        activeSpace = undefined;
        spaceStatus.textContent = copy.spaceAccessRevoked(revokedSpace);
      }
    }
    const allowedIds = activeSpace ? new Set((await spaceService.project(allRecords, activeSpace)).map((record) => record.id)) : undefined;
    const candidateRecords = query.trim() ? await store.search(query, allowedIds) : allRecords;
    const records = candidateRecords.filter((record) => record.owner !== "platform.space" && (!allowedIds || allowedIds.has(record.id)));
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
    await renderSpaceChoices();
    await renderDocumentFinishChoices();
    await renderSummary();
    await renderReview();
    await renderComposeView();
    await renderRelationshipChoices();
    await renderKnowledgeChoices();
    await renderKnowledgeStatus();
    await renderShareChoices();
    await renderShareGrants();
    const healthBefore = await store.health();
    if (!healthBefore.searchIndexValid) await store.rebuildSearchIndex();
    const healthAfter = await store.health();
    healthStatus.textContent = copy.healthMessage(healthAfter.activeRecords, healthAfter.archivedRecords, healthAfter.historyEntries, healthAfter.artifactPayloads, healthAfter.searchIndexValid ? copy.healthy : copy.degraded, healthAfter.storage?.pressure);
    await renderEffects();
    if (!archivePanel.hidden) await renderArchived();
    return records.length;
  };

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = captureText.value.trim();
    if (!text) return;
    try {
      const selectedKind = CAPTURE_KINDS.includes(captureType.value as CaptureKind) ? captureType.value as CaptureKind : "note";
      const recordType = recordTypeForCaptureKind(selectedKind);
      const space = (captureSpace.value === "household" || captureSpace.value === "work" ? captureSpace.value : "personal") satisfies SpaceId;
      await commands.create({ recordType, owner: selectedKind === "event" ? "platform.time" : "core.capture", data: { text, kind: selectedKind, space, triageStatus: captureSafeRoute.checked ? "REVIEWED" : "INBOX", ...(recordType === "task" ? { status: "OPEN" } : {}) } });
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
      const resultCount = await renderRecords(query);
      const health = await store.getSearchHealth();
      searchStatus.textContent = query ? copy.resultMessage(resultCount, health.valid ? copy.healthy : copy.degraded) : copy.showingAll;
    } catch (error) {
      searchStatus.textContent = describeError(error, "Search failed; canonical data was not changed.");
    }
  });

  spaceCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const created = await spaceService.create(spaceName.value);
      spaceName.value = "";
      spaceCreateStatus.textContent = copy.spaceCreated(created.name);
      activeSpace = created.id;
      await renderRecords();
      spaceFilter.value = created.id;
    } catch (error) {
      spaceCreateStatus.textContent = describeError(error, "Space was not created; canonical records were not changed.");
    }
  });

  spaceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedSpace = isSpaceId(spaceMembership.value) ? spaceMembership.value : "personal";
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
    activeSpace = isSpaceId(spaceFilter.value) ? spaceFilter.value : undefined;
    spaceStatus.textContent = activeSpace ? `Showing ${spaceLabel(activeSpace)} records.` : copy.showingAll;
    await renderRecords(searchQuery.value);
  });

  composeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const viewSpace = isSpaceId(composeSpace.value) ? composeSpace.value : undefined;
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

  shareRecords.addEventListener("change", updateShareActions);
  shareGrant.addEventListener("change", updateShareActions);

  shareForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const recordIds = selectedShareIds();
    if (recordIds.length === 0) {
      shareStatus.textContent = copy.shareSelectionRequired;
      return;
    }
    const space = isSpaceId(shareSpace.value) ? shareSpace.value : "personal";
    try {
      const scopedIds = new Set((await spaceService.project(await store.list(), space)).map((record) => record.id));
      if (recordIds.some((id) => !scopedIds.has(id))) {
        shareStatus.textContent = copy.grantSpaceMismatch;
        return;
      }
      const grant = await createShareGrant(commands, { grantedTo: shareRecipient.value, purpose: sharePurpose.value, space, recordIds, ...(shareExpiry.value ? { expiresAt: new Date(shareExpiry.value).toISOString() } : {}) });
      shareStatus.textContent = copy.grantSaved;
      shareRecipient.value = "";
      sharePurpose.value = "";
      shareExpiry.value = "";
      await renderRecords(searchQuery.value);
      shareGrant.value = grant.id;
      updateShareActions();
    } catch (error) {
      shareStatus.textContent = describeError(error, "Share grant was not created; canonical records were not changed.");
    }
  });

  shareExport.addEventListener("click", async () => {
    const recordIds = selectedShareIds();
    if (recordIds.length === 0) {
      shareStatus.textContent = copy.shareSelectionRequired;
      return;
    }
    try {
      const grant = shareGrant.value ? await commands.get(shareGrant.value) : undefined;
      if (!grant) {
        shareStatus.textContent = copy.grantRequired;
        updateShareActions();
        return;
      }
      const allRecords = await store.list();
      const projection = projectForAuthorizedShare(grant, allRecords, recordIds, shareIncludePrivate.checked, allRecords);
      downloadJson("omnevum-share-projection.json", projection);
      shareStatus.textContent = copy.projectionSaved(projection.records.length, projection.omittedRecordCount);
    } catch (error) {
      shareStatus.textContent = describeError(error, "Bounded share projection failed; canonical records were not changed.");
    }
  });

  syncForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await new SyncEngine(store, new JsonEndpointTransport(syncEndpoint.value.trim())).synchronize();
      syncStatus.textContent = copy.syncResult(result.imported, result.skipped, result.conflicts.length, result.tombstonesPreserved);
      await renderRecords(searchQuery.value);
    } catch (error) {
      if (error instanceof SyncFailure && error.phase === "PUSH" && error.partialResult) {
        const result = error.partialResult;
        syncStatus.textContent = `${copy.syncPartial(result.imported, result.skipped, result.conflicts.length, result.tombstonesPreserved)} ${describeError(error, "Remote sync push failed.")}`;
        await renderRecords(searchQuery.value);
      } else {
        syncStatus.textContent = describeError(error, "Sync failed before the local canonical merge completed; local canonical records were not changed by this action.");
      }
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
      applyPresentationProfile();
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
      const nextPresentation = parsePresentationProfile({
        ...presentation,
        productName: nextName,
        tagline: taglineInput.value,
        locale: nextLocale,
        density: densityInput.value,
        typeface: typefaceInput.value,
        iconography: iconographyInput.value,
        labels: { home: homeLabelInput.value, capture: captureLabelInput.value, records: recordsLabelInput.value },
        navigation: {
          visible: readOptionVisibility<PresentationSectionId>(navigationOptions),
          order: readOptionOrder<PresentationSectionId>(navigationOptions)
        },
        homeWidgets: readOptionVisibility<PresentationHomeWidgetId>(homeWidgetOptions)
      });
      await store.setSetting("presentation", nextPresentation);
      presentation = nextPresentation;
      if (localeChanged) {
        await mountApp(root, store, commands);
        return;
      }
      applyPresentationProfile();
      presentationStatus.textContent = copy.savedName(presentation.productName);
    } catch (error) {
      presentationStatus.textContent = describeError(error, "Presentation preference was not saved");
    }
  });

  resetPresentation.addEventListener("click", async () => {
    try {
      const reset = parsePresentationProfile(structuredClone(DEFAULT_PRESENTATION));
      await store.setSetting("presentation", reset);
      presentation = reset;
      applyPresentationProfile();
      presentationStatus.textContent = `${copy.resetPresentation}. ${copy.presentationHint}`;
    } catch (error) {
      presentationStatus.textContent = describeError(error, "Presentation reset failed; canonical data was not changed.");
    }
  });

  exportPresentationProfileButton.addEventListener("click", () => {
    try {
      downloadJson("omnevum-presentation-profile.json", makePresentationProfileDocument(presentation));
      presentationStatus.textContent = copy.presentationProfileExported;
    } catch (error) {
      presentationStatus.textContent = describeError(error, "Presentation profile export failed; canonical data was not changed.");
    }
  });

  presentationProfileInput.addEventListener("change", async () => {
    const file = presentationProfileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (new TextEncoder().encode(text).byteLength > MAX_PRESENTATION_PROFILE_JSON_BYTES) throw new Error("Presentation profile exceeds the bounded 256 KiB import limit");
      const imported = parsePresentationProfileDocument(JSON.parse(text));
      const localeChanged = imported.locale !== presentation.locale;
      await store.setSetting("presentation", imported);
      presentation = imported;
      if (localeChanged) {
        await mountApp(root, store, commands);
        return;
      }
      applyPresentationProfile();
      presentationStatus.textContent = copy.presentationProfileImported;
    } catch (error) {
      presentationStatus.textContent = describeError(error, "Presentation profile import failed; the stored profile and canonical data were not changed.");
    } finally {
      presentationProfileInput.value = "";
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
      const inspection = await inspectArtifact(file, file.name, file.type || "application/octet-stream");
      const record = await commands.createArtifact({ fileName: file.name, mimeType: file.type || "application/octet-stream", blob: file, space: "personal", adapter: inspection.adapter, metadata: inspection.metadata, ...(inspection.derivedText ? { derivedText: inspection.derivedText } : {}) });
      recoveryStatus.textContent = `${copy.attachedMessage(String(record.data.fileName), Number(record.data.size))} ${copy.artifactInspectionMessage(inspection.adapter, inspection.adapterStatus, inspection.ocr, inspection.warnings.length)}`;
      await renderRecords(searchQuery.value);
    } catch (error) {
      recoveryStatus.textContent = error instanceof Error ? error.message : "Artifact intake failed";
    } finally {
      artifactInput.value = "";
    }
  });

  documentFinishForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const source = await commands.get(documentFinishSource.value);
    if (!source || source.recordType !== "artifact" || source.deleted) {
      documentFinishStatus.textContent = copy.documentFinishSource;
      return;
    }
    try {
      const payload = await store.getArtifact(source.id);
      if (!payload) throw new Error("The selected source Artifact payload is unavailable");
      const result = await redactTextArtifact(payload, String(source.data.fileName ?? "artifact"), String(source.data.mimeType ?? "text/plain"), documentFinishTerms.value.split(","), documentFinishReplacement.value);
      const derivedText = await result.blob.text();
      const derived = await commands.createDerivedArtifact({
        sourceId: source.id,
        operation: "document-redact-text",
        fileName: result.fileName,
        mimeType: result.mimeType,
        blob: result.blob,
        ...(typeof source.data.space === "string" ? { space: source.data.space } : {}),
        adapter: "TEXT",
        metadata: { sourceAdapter: result.sourceAdapter, sourceSha256: result.sourceSha256, redactedCount: result.redactedCount },
        derivedText: { truthClass: "DERIVED", operation: "safe-text-extraction", text: derivedText, truncated: false }
      });
      documentFinishStatus.textContent = copy.documentFinishSaved(String(derived.data.fileName), result.redactedCount);
      documentFinishTerms.value = "";
      await renderRecords(searchQuery.value);
    } catch (error) {
      documentFinishStatus.textContent = describeError(error, "Document finishing failed; the source Artifact was not changed.");
    }
  });

  const unsubscribeExternalChanges = store.subscribe((change) => {
    if (change.kind === "SETTING_CHANGED") {
      if (change.settingId === "presentation") window.location.reload();
      return;
    }
    if (change.kind === "EFFECT_CHANGED") {
      void renderEffects().catch((error) => {
        recoveryStatus.textContent = describeError(error, "The effect ledger could not refresh after an external change.");
      });
      return;
    }
    if (change.kind === "CANONICAL_CHANGED" || change.kind === "STORE_CLEARED") {
      void renderRecords(searchQuery.value).catch((error) => {
        recoveryStatus.textContent = describeError(error, "The view could not refresh after an external change.");
      });
    }
  });
  window.addEventListener("pagehide", unsubscribeExternalChanges, { once: true });

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

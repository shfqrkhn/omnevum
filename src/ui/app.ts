import { runTriageBatch, type CommandBus, type TriageBatchAction, type TriageRouteTarget, type TriageSplitPart } from "../core/commands";
import { acceptCandidates, stageBlob, stageText, stageUrl, type AcquireCandidate, type AcquirePreview } from "../core/acquire";
import { inspectArtifact } from "../core/artifact";
import { redactTextArtifact } from "../core/document";
import { isCompletedTask, isSpaceId, proposeTriage, recordSpace, recordText, recordTriageDeferredUntil, recordTriageStatus, SPACE_LABELS, type SpaceId, type TriageProposalAction, type TriageStatus } from "../core/domain";
import { captureKindLabel, formatDateTime, formatNumber, getDeviceInputCopy, getInstalledMetadataStatus, getRecoveryCopy, getStoragePersistenceNotice, getTimeCopy, getUiCopy, localeDirection } from "../core/i18n";
import { CAPTURE_KINDS, type CanonicalRecord, type CaptureKind } from "../core/model";
import { accessibilityPreset, DEFAULT_PRESENTATION, MAX_PRESENTATION_PROFILE_JSON_BYTES, PRESENTATION_HOME_WIDGET_IDS, PRESENTATION_LENS_IDS, PRESENTATION_SECTION_IDS, makePresentationProfileDocument, parsePresentationProfile, parsePresentationProfileDocument, resolvePresentationProfile, type PresentationAccessibilityProfile, type PresentationFamily, type PresentationHomeWidgetId, type PresentationLensId, type PresentationProfile, type PresentationSectionId, type PresentationTargetSize, type PresentationTextScale } from "../core/presentation";
import { PRESENTATION_LENS_DEFINITIONS, lensIdsForRecord, projectLensRecords } from "../core/lenses";
import { TrackService } from "../core/track";
import { makeReminderData } from "../core/time";
import { projectDueReminderConsiderations } from "../core/considerations";
import { decryptVault, encryptVault, isEncryptedVaultEnvelope } from "../core/crypto";
import { MAX_VAULT_JSON_BYTES, parseVault } from "../core/vault";
import type { CanonicalStore } from "../core/storage";
import { captureExpense, captureFinancePlan, captureHealthMeasurement } from "../core/workflows";
import { acceptFinanceStatementFacts, acceptFinanceTransactions, createFinanceSourceId, deduplicateFinanceTransactions, extractFinanceStatementFacts, parseFinanceCsv, parseFinanceStatementFactsCsv, reconcileFinanceStatement, type FinanceStatementFacts, type FinanceStatementSource } from "../core/finance";
import { formatMoney, parseMoney } from "../core/money";
import { classifyFinanceSource, summarizeFinanceTransactions } from "../core/finance-model";
import { projectFinanceState } from "../core/finance-projection";
import { projectDataset } from "../core/data";
import { countRecords, groupCounts } from "../core/analysis";
import type { CapabilityRuntime } from "../core/capability-runtime";
import { DeviceInputBroker } from "../core/device";
import { isSpaceMembership, SpaceService } from "../core/space";
import { historyWithDiffs, revertToRevision } from "../core/history";
import { makeSearchView, makeUserDashboard, projectView, ViewRegistry } from "../core/compose";
import { matchesSearchFacets, parseSearchQuery, serializeSearchQuery, type ParsedSearchQuery } from "../core/search";
import { readPath } from "../core/data";
import { assessTextAnchor, createTextAnnotation } from "../core/annotation";
import { createEvidenceLink, type EvidenceRelation } from "../core/evidence";
import { createDependencyLink, isDependencyLink, type DependencyEdgeKind } from "../core/dependency-graph";
import { makePlaceData, parseGeoJsonPoint } from "../core/place";
import { projectForAuthorizedShare } from "../core/share";
import { canUseShareGrant, createShareGrant, revokeShareGrant } from "../core/sharing";
import { createContextDelta, exportAuthorizedContext, makeContextExportProfile, parseContextExportProfile, type ContextExportFormat, type ContextExportProfile, type ContextExportSnapshot } from "../core/context-export";
import { transitionEffect } from "../core/effect";
import { createExternalEffect } from "../core/effect-service";
import { createEffectRevalidationGuard } from "../core/effect-guard";
import { EffectRunner } from "../core/effect-runner";
import { CredentialKeyBroker } from "../core/credential";
import { JsonEndpointEffectExecutor, JsonEndpointTransport } from "../core/remote";
import { SyncEngine, SyncFailure } from "../core/sync";
import { createRecordAppDefinition } from "../core/factory";
import { FACTORY_PREVIEW_APP_TITLE, FACTORY_PREVIEW_FIELDS, FACTORY_PREVIEW_GAME, FACTORY_PREVIEW_MANIFEST, factoryPreviewGameAdapter, type FactoryPreviewGamePayload } from "../core/factory-preview";
import { isCleanupHistoryRecord, previewCleanup, reconstructCleanupHistory, type CleanupDecision, type CleanupPreview, type CleanupRecipe } from "../core/cleanup";
import { CORE_AUTOMATION_PACKAGE, type PackageAutomationRuntime } from "../core/package-automation-runtime";
import type { PackageAutomationProposal } from "../core/package-automation-registry";
import { shouldAutoShowOnboarding } from "../core/onboarding";
import { REVIEW_SESSION_SETTING, REVIEW_TEMPLATES, advanceReviewSession, getReviewTemplate, isReviewSession, makeReviewSession, type ReviewSession } from "../core/review";
import { makeTelemetryPreviewInput, parseTelemetryPreviewMode, projectTelemetry, projectTelemetryConsiderations, parseTelemetryDispositions, parseTelemetryThresholds, TELEMETRY_DISPOSITIONS_SETTING, TELEMETRY_THRESHOLDS_SETTING, type TelemetryDispositions, type TelemetryThresholds } from "../core/telemetry";

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

export async function mountApp(root: HTMLElement, store: CanonicalStore, commands: CommandBus, capabilityRuntime?: CapabilityRuntime<unknown>, packageAutomationRuntime?: PackageAutomationRuntime): Promise<void> {
  const rawPresentation = await store.getSetting<unknown>("presentation");
  let savedContextProfile: ContextExportProfile | undefined;
  const savedContextProfileRaw = await store.getSetting<unknown>("context-export.profile");
  if (savedContextProfileRaw !== undefined) {
    try {
      savedContextProfile = parseContextExportProfile(savedContextProfileRaw);
    } catch {
      savedContextProfile = undefined;
    }
  }
  const onboardingDismissed = await store.getSetting<boolean>("onboarding.dismissed") === true;
  let homeFocusMode = await store.getSetting<boolean>("home.focusMode") === true;
  let telemetryThresholds: TelemetryThresholds = parseTelemetryThresholds(await store.getSetting<unknown>(TELEMETRY_THRESHOLDS_SETTING));
  let telemetryDispositions: TelemetryDispositions = parseTelemetryDispositions(await store.getSetting<unknown>(TELEMETRY_DISPOSITIONS_SETTING));
  const initialRecordCount = (await store.list()).length;
  const onboardingAutoShown = shouldAutoShowOnboarding(initialRecordCount, onboardingDismissed);
  const safePresentationMode = readSafePresentationMode();
  const presentationResolution = resolvePresentationProfile(rawPresentation, safePresentationMode);
  let presentation: PresentationProfile = presentationResolution.profile;
  const platformReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (!safePresentationMode && rawPresentation === undefined && platformReducedMotion) {
    presentation = { ...presentation, accessibility: { ...presentation.accessibility, profile: "custom", reducedMotion: true } };
    await store.setSetting("presentation", presentation);
  }
  const copy = getUiCopy(presentation.locale);
  const deviceCopy = getDeviceInputCopy(presentation.locale);
  const recoveryCopy = getRecoveryCopy(presentation.locale);
  const timeCopy = getTimeCopy(presentation.locale);
  const familyLabels: Record<PresentationFamily, string> = presentation.locale === "fr-CA"
    ? { alpha: "Concept Alpha - Monastique tactile", beta: "Concept Beta - Editorial humaniste", gamma: "Concept Gamma - Utilitaire industriel" }
    : { alpha: "Concept Alpha - Tactile Monastic", beta: "Concept Beta - Humanist Editorial", gamma: "Concept Gamma - Industrial Utility" };
  const accessibilityCopy = presentation.locale === "fr-CA"
    ? { profile: "Profil d'accessibilite", standard: "Standard", lowVision: "Vision reduite", motor: "Cibles larges / motricite", cognitive: "Charge cognitive reduite", custom: "Personnalise", textScale: "Echelle du texte", scale100: "100 %", scale125: "125 %", scale150: "150 %", scale200: "200 %", targetSize: "Taille des cibles", targetStandard: "Cibles standard", targetLarge: "Cibles larges", reducedMotion: "Mode sans mouvement", hint: "Les profils changent uniquement la presentation; chaque reglage reste modifiable." }
    : { profile: "Accessibility profile", standard: "Standard", lowVision: "Low vision", motor: "Motor / large target", cognitive: "Low cognitive load", custom: "Custom", textScale: "Text scale", scale100: "100%", scale125: "125%", scale150: "150%", scale200: "200%", targetSize: "Target size", targetStandard: "Standard targets", targetLarge: "Large targets", reducedMotion: "Zero-motion mode", hint: "Profiles change presentation only; every underlying setting remains editable." };
  const factoryPreviewMode = new URLSearchParams(window.location.search).get("factory-preview") === "1";
  const effectRevocationPreviewMode = new URLSearchParams(window.location.search).get("effect-revocation-preview") === "1";
  const effectCredentialedPreviewMode = new URLSearchParams(window.location.search).get("effect-credentialed-preview") === "1";
  const effectCredentialedRestartPreviewMode = new URLSearchParams(window.location.search).get("effect-credentialed-restart-preview") === "1";
  const telemetryPreviewMode = parseTelemetryPreviewMode(new URLSearchParams(window.location.search).get("telemetry-preview"), ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
  root.dataset.theme = presentation.theme;
  root.dataset.family = presentation.family;
  root.dataset.density = presentation.density;
  root.dataset.typeface = presentation.typeface;
  root.dataset.iconography = presentation.iconography;
  document.documentElement.dataset.theme = presentation.theme;
  document.documentElement.dataset.family = presentation.family;
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
      <div class="topbar-actions">
        <button id="quick-density" class="secondary" type="button">${copy.density}: ${presentation.density === "compact" ? copy.compact : copy.comfortable}</button>
        <button id="theme-toggle" class="secondary" type="button" aria-pressed="false">${copy.themeDark}</button>
      </div>
    </header>
    <nav id="primary-nav" class="primary-nav" aria-label="${copy.home}"><details id="primary-nav-menu" class="primary-nav-menu"><summary>${copy.navigationSections}</summary><ol id="primary-nav-list"></ol></details></nav>
    <nav id="lens-nav" class="lens-nav" aria-label="${copy.lenses}">
      <div class="lens-nav-heading"><p id="lens-nav-label" class="eyebrow">${copy.lenses}</p><button id="lens-overflow-toggle" class="secondary" type="button">${copy.lensOverflow}</button></div>
      <ol id="lens-nav-list"></ol>
      <p id="lens-nav-status" class="hint">${copy.lensHint}</p>
    </nav>
    <dialog id="lens-overflow-dialog" aria-labelledby="lens-overflow-heading">
      <div class="lens-dialog-content">
        <h2 id="lens-overflow-heading">${copy.lensOverflow}</h2>
        <p class="hint">${copy.lensHint}</p>
        <div id="lens-overflow-grid" class="lens-overflow-grid"></div>
        <button id="lens-overflow-close" class="secondary" type="button">${copy.clear}</button>
      </div>
    </dialog>
    <main>
      <section class="status-card" aria-labelledby="status-heading">
        <div>
          <p class="eyebrow">${copy.system}</p>
          <h2 id="status-heading">${copy.ready}</h2>
        <p id="health-status" role="status">${copy.healthInitial}</p>
        </div>
        <div class="status-actions">
          <span id="capability-status" class="status-pill">${copy.local}</span>
          <button id="onboarding-show" class="secondary" type="button"${onboardingAutoShown ? " hidden" : ""}>${copy.onboardingShow}</button>
        </div>
      </section>

      <details id="onboarding" class="panel onboarding-panel compact-panel" aria-labelledby="onboarding-heading"${onboardingAutoShown ? "" : " hidden"}>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.foundation}</p><h2 id="onboarding-heading">${copy.onboardingHeading}</h2></span></summary>
        <div class="onboarding-content">
          <div class="section-heading">
            <p class="hint">${copy.onboardingHint}</p>
            <button id="onboarding-dismiss" class="secondary" type="button">${copy.onboardingDismiss}</button>
          </div>
          <ol class="onboarding-steps">
            <li>${copy.onboardingCapture}</li>
            <li>${copy.onboardingReview}</li>
            <li>${copy.onboardingRecovery}</li>
          </ol>
          <a class="secondary onboarding-start" href="#capture">${copy.onboardingStart}</a>
        </div>
      </details>

      <section id="home-summary" class="panel" aria-labelledby="summary-heading">
        <div class="section-heading">
          <div>
            <div class="editable-term"><p id="home-label" class="eyebrow">${copy.home}</p><button id="edit-home-label" class="secondary term-edit-button" type="button">${copy.editLabel}</button></div>
            <h2 id="summary-heading">${copy.currentPicture}</h2>
          </div>
          <span id="summary-total" class="count" aria-label="${copy.activeRecordCount}">0</span>
        </div>
        <div data-home-widget="summary">
          <div id="summary-grid" class="summary-grid"></div>
          <p id="analysis-status" class="hint" role="status"></p>
        </div>
        <details data-home-widget="insights" class="home-widget-disclosure compact-panel">
          <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.visualize}</p><h3>${copy.signals}</h3></span></summary>
          <div id="insights-grid" class="summary-grid"></div>
        </details>
        <div data-home-widget="attention">
          <div class="section-heading insight-heading">
            <div>
              <p class="eyebrow">${timeCopy.considerations}</p>
              <h3 id="home-attention-heading">${timeCopy.considerationsHeading}</h3>
            </div>
            <button id="home-focus-toggle" class="secondary" type="button" aria-pressed="${homeFocusMode}">${homeFocusMode ? timeCopy.focusModeActive : timeCopy.focusMode}</button>
          </div>
          <div id="attention-panel" class="attention-panel" role="region" aria-labelledby="home-attention-heading" aria-live="polite"></div>
        </div>
      </section>

      <details id="active-lens" class="panel compact-panel" aria-labelledby="active-lens-heading">
        <summary class="compact-summary section-heading">
          <span class="compact-summary-copy"><p id="active-lens-label" class="eyebrow">${copy.lenses}</p><h2 id="active-lens-heading">${PRESENTATION_LENS_DEFINITIONS[presentation.activeLens].label}</h2></span>
          <span id="active-lens-status" class="status-pill">${copy.lensPinned}</span>
        </summary>
        <p id="active-lens-hint" class="hint">${copy.lensHint}</p>
        <ul id="active-lens-records" class="record-list"></ul>
      </details>

      <dialog id="record-detail-dialog" aria-labelledby="record-detail-heading" aria-describedby="record-detail-context">
        <div class="record-detail-content">
          <p id="record-detail-context" class="eyebrow"></p>
          <h2 id="record-detail-heading">${copy.recordDetail}</h2>
          <p id="record-detail-text" class="record-detail-lede"></p>
          <nav id="record-detail-segments" class="detail-segment-bar" aria-label="${copy.recordDetail}">
            <button type="button" class="secondary" data-detail-segment="overview" aria-selected="true">${copy.recordOverview}</button>
            <button type="button" class="secondary" data-detail-segment="relationships" aria-selected="false">${copy.recordRelationships}</button>
            <button type="button" class="secondary" data-detail-segment="evidence" aria-selected="false">${copy.recordEvidence}</button>
            <button type="button" class="secondary" data-detail-segment="history" aria-selected="false">${copy.historyHeading}</button>
          </nav>
          <p id="record-detail-status" class="hint" role="status" aria-live="polite"></p>
          <section id="record-detail-overview" class="record-detail-segment" data-detail-panel="overview" aria-labelledby="record-detail-overview-heading">
            <h3 id="record-detail-overview-heading">${copy.recordOverview}</h3>
            <dl id="record-detail-metadata" class="record-detail-metadata"></dl>
            <form id="record-detail-edit-form" class="record-detail-edit" hidden>
              <label for="record-detail-edit-text">${copy.recordEditLabel}</label>
              <textarea id="record-detail-edit-text" rows="5" maxlength="5000" required></textarea>
              <p class="hint">${copy.recordEditHint}</p>
              <button type="submit">${copy.saveRecordEdit}</button>
              <p id="record-detail-edit-status" class="hint" role="status" aria-live="polite"></p>
            </form>
          </section>
          <section id="record-detail-relationships" class="record-detail-segment" data-detail-panel="relationships" aria-labelledby="record-detail-relationships-heading" hidden>
            <h3 id="record-detail-relationships-heading">${copy.recordRelationships}</h3>
            <ul id="record-detail-relationship-list" class="record-list"></ul>
          </section>
          <section id="record-detail-evidence" class="record-detail-segment" data-detail-panel="evidence" aria-labelledby="record-detail-evidence-heading" hidden>
            <h3 id="record-detail-evidence-heading">${copy.recordEvidence}</h3>
            <ul id="record-detail-evidence-list" class="record-list"></ul>
          </section>
          <section id="record-detail-history" class="record-detail-segment" data-detail-panel="history" aria-labelledby="record-detail-history-heading" hidden>
            <h3 id="record-detail-history-heading">${copy.historyHeading}</h3>
            <ol id="record-detail-history-list" class="record-detail-history"></ol>
          </section>
          <button id="record-detail-close" class="secondary" type="button">${copy.closeRecord}</button>
        </div>
      </dialog>

      <details id="presentation" class="panel compact-panel" aria-labelledby="presentation-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.personalization}</p><h2 id="presentation-heading">${copy.makeItYours}</h2></span></summary>
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
          <label for="family">${presentation.locale === "fr-CA" ? "Famille visuelle" : "Visual family"}</label>
          <select id="family" name="family">
            <option value="alpha">${familyLabels.alpha}</option>
            <option value="beta">${familyLabels.beta}</option>
            <option value="gamma">${familyLabels.gamma}</option>
          </select>
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
          <fieldset class="presentation-fieldset accessibility-fieldset">
            <legend>${accessibilityCopy.profile}</legend>
            <label for="accessibility-profile">${accessibilityCopy.profile}</label>
            <select id="accessibility-profile" name="accessibilityProfile">
              <option value="standard">${accessibilityCopy.standard}</option>
              <option value="low-vision">${accessibilityCopy.lowVision}</option>
              <option value="motor-large-target">${accessibilityCopy.motor}</option>
              <option value="low-cognitive-load">${accessibilityCopy.cognitive}</option>
              <option value="custom">${accessibilityCopy.custom}</option>
            </select>
            <div class="presentation-grid">
              <div>
                <label for="accessibility-text-scale">${accessibilityCopy.textScale}</label>
                <select id="accessibility-text-scale" name="accessibilityTextScale"><option value="1">${accessibilityCopy.scale100}</option><option value="1.25">${accessibilityCopy.scale125}</option><option value="1.5">${accessibilityCopy.scale150}</option><option value="2">${accessibilityCopy.scale200}</option></select>
              </div>
              <div>
                <label for="accessibility-target-size">${accessibilityCopy.targetSize}</label>
                <select id="accessibility-target-size" name="accessibilityTargetSize"><option value="standard">${accessibilityCopy.targetStandard}</option><option value="large">${accessibilityCopy.targetLarge}</option></select>
              </div>
            </div>
            <label class="check-row" for="accessibility-reduced-motion"><input id="accessibility-reduced-motion" name="accessibilityReducedMotion" type="checkbox" /> ${accessibilityCopy.reducedMotion}</label>
            <p class="hint">${accessibilityCopy.hint}</p>
          </fieldset>
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
          <fieldset class="presentation-fieldset">
            <legend>${copy.lensPinned}</legend>
            <div id="lens-pin-options" class="presentation-options"></div>
            <p class="hint">${copy.lensHint} Keep up to four visible; the remaining lenses stay in the equal-prominence overflow grid.</p>
          </fieldset>
          <div class="form-row">
            <button id="reset-presentation" class="secondary" type="button">${copy.resetPresentation}</button>
            <button id="export-presentation-profile" class="secondary" type="button">${copy.exportPresentationProfile}</button>
            <label class="file-button secondary" for="presentation-profile-input">${copy.importPresentationProfile}</label>
            <input id="presentation-profile-input" type="file" accept="application/json,.json" />
          </div>
          <p id="presentation-status" class="hint" role="status">${copy.presentationHint}</p>
          <p id="presentation-host-status" class="hint" role="status"></p>
        </form>
      </details>

      <dialog id="presentation-label-dialog" aria-labelledby="presentation-label-dialog-heading">
        <form id="presentation-label-dialog-form" method="dialog">
          <h2 id="presentation-label-dialog-heading">${copy.editLabel}</h2>
          <label for="presentation-label-input">${copy.editLabel}</label>
          <input id="presentation-label-input" type="text" maxlength="40" required />
          <div class="dialog-actions">
            <button id="presentation-label-cancel" class="secondary" type="button">${copy.clear}</button>
            <button type="submit">${copy.save}</button>
          </div>
          <p id="presentation-label-dialog-status" class="hint" role="status"></p>
        </form>
      </dialog>

      <section id="capture" class="panel" aria-labelledby="capture-heading">
        <div class="editable-term"><p id="capture-label" class="eyebrow">${copy.capture}</p><button id="edit-capture-label" class="secondary term-edit-button" type="button">${copy.editLabel}</button></div>
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

      <details id="acquire" class="panel compact-panel" aria-labelledby="acquire-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.capture}</p><h2 id="acquire-heading">${copy.acquireHeading}</h2></span></summary>
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
          <div class="relationship-form" id="cleanup-panel">
            <h3>${copy.cleanupHeading}</h3>
            <p class="hint">${copy.cleanupHint}</p>
            <label class="check-row" for="cleanup-imported-only"><input id="cleanup-imported-only" type="checkbox" checked /> ${copy.cleanupImportedOnly}</label>
            <div class="form-row">
              <label class="check-row" for="cleanup-trim"><input id="cleanup-trim" type="checkbox" checked /> ${copy.cleanupTrim}</label>
              <label class="check-row" for="cleanup-whitespace"><input id="cleanup-whitespace" type="checkbox" checked /> ${copy.cleanupWhitespace}</label>
            </div>
            <div class="form-row">
              <button id="cleanup-preview" class="secondary" type="button">${copy.cleanupPreview}</button>
              <button id="cleanup-apply" type="button" disabled>${copy.cleanupApply}</button>
            </div>
            <p id="cleanup-status" class="hint" role="status"></p>
            <div id="cleanup-preview-output" hidden>
              <p id="cleanup-summary" class="hint"></p>
              <ul id="cleanup-sources" class="record-list"></ul>
              <ul id="cleanup-proposals" class="record-list"></ul>
            </div>
            <details>
              <summary>${copy.cleanupHistory}</summary>
              <ul id="cleanup-history-list" class="record-list"></ul>
              <p id="cleanup-history-empty" class="empty-state">${copy.cleanupHistoryEmpty}</p>
            </details>
          </div>
        </form>
        <div class="relationship-form device-input-panel">
          <h3>${deviceCopy.heading}</h3>
          <p class="hint">${deviceCopy.hint}</p>
          <p id="device-capabilities" class="hint" role="status"></p>
          <div class="form-row">
            <button id="device-share" class="secondary" type="button">${deviceCopy.share}</button>
            <button id="device-location" class="secondary" type="button">${deviceCopy.location}</button>
            <button id="device-camera" class="secondary" type="button">${deviceCopy.camera}</button>
            <button id="device-microphone" class="secondary" type="button">${deviceCopy.microphone}</button>
            <label class="file-button secondary" for="device-barcode-input">${deviceCopy.barcode}</label>
            <input id="device-barcode-input" type="file" accept="image/*" />
          </div>
          <p class="hint">${deviceCopy.manualFallback}</p>
          <p id="device-input-status" class="hint" role="status">${deviceCopy.ready}</p>
        </div>
      </details>

      <details id="track" class="panel compact-panel" aria-labelledby="track-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.track}</p><h2 id="track-heading">${copy.trackHeading}</h2></span></summary>
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
      </details>

      <details id="domains" class="panel compact-panel" aria-labelledby="domains-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.domains}</p><h2 id="domains-heading">${copy.domains}</h2></span></summary>
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
          <form id="finance-plan-form" class="domain-form">
            <h3>${copy.financePlanHeading}</h3>
            <label for="finance-plan-kind">${copy.financePlanKind}</label>
            <select id="finance-plan-kind" name="kind">
              <option value="resource">${copy.financeResource}</option>
              <option value="goal">${copy.financeGoal}</option>
            </select>
            <label for="finance-plan-label">${copy.financePlanLabel}</label>
            <input id="finance-plan-label" name="label" type="text" maxlength="160" required />
            <label for="finance-plan-amount">${copy.financePlanAmount}</label>
            <input id="finance-plan-amount" name="amount" type="text" inputmode="decimal" maxlength="32" required />
            <label for="finance-plan-currency">${copy.currency}</label>
            <select id="finance-plan-currency" name="currency"><option value="CAD">CAD</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="JPY">JPY</option></select>
            <label for="finance-plan-space">${copy.space}</label>
            <select id="finance-plan-space" name="space"><option value="personal">${copy.personal}</option><option value="household">${copy.household}</option><option value="work">${copy.work}</option></select>
            <label for="finance-plan-date">${copy.financeGoalDate}</label>
            <input id="finance-plan-date" name="targetDate" type="date" />
            <label for="finance-plan-surplus">${copy.financeMonthlySurplus}</label>
            <input id="finance-plan-surplus" name="surplus" type="text" inputmode="decimal" maxlength="32" />
            <label class="check-row" for="finance-plan-hard"><input id="finance-plan-hard" name="hardConstraint" type="checkbox" /><span>${copy.financeHardConstraint}</span></label>
            <p class="hint">${copy.financePlanHint}</p>
            <button type="submit">${copy.saveFinancePlan}</button>
            <p id="finance-plan-status" class="hint" role="status"></p>
          </form>
          <form id="finance-import-form" class="domain-form">
            <h3>${copy.financeImportHeading}</h3>
            <label for="finance-import-file">${copy.financeFile}</label>
            <input id="finance-import-file" type="file" accept="text/csv,text/tab-separated-values,.csv,.tsv" required />
            <label for="finance-import-account">${copy.financeAccount}</label>
            <input id="finance-import-account" type="text" maxlength="160" required />
            <label for="finance-import-currency">${copy.currency}</label>
            <select id="finance-import-currency"><option value="CAD">CAD</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="JPY">JPY</option></select>
            <label for="finance-import-opening">${copy.financeOpening}</label>
            <input id="finance-import-opening" type="text" inputmode="decimal" maxlength="32" />
            <label for="finance-import-closing">${copy.financeClosing}</label>
            <input id="finance-import-closing" type="text" inputmode="decimal" maxlength="32" />
            <p class="hint">${copy.financeImportHint}</p>
            <button type="submit">${copy.financeImport}</button>
            <p id="finance-import-status" class="hint" role="status"></p>
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
      </details>

      <details id="search" class="panel compact-panel" aria-labelledby="search-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.searchExplore}</p><h2 id="search-heading">${copy.findCaptures}</h2></span></summary>
        <form id="search-form" class="search-form">
          <label for="search-query">${copy.searchTerms}</label>
          <div class="form-row search-row">
            <input id="search-query" name="query" type="search" placeholder="${copy.searchPlaceholder}" autocomplete="off" />
            <button type="submit">${copy.search}</button>
            <button id="clear-search" class="secondary" type="button">${copy.clear}</button>
          </div>
          <button id="search-filters-toggle" class="secondary" type="button" aria-expanded="false">${copy.searchFilters}</button>
          <div id="search-filters" class="search-filters" hidden>
            <div id="search-facet-chips" class="facet-chips" aria-live="polite"></div>
            <div class="search-facet-grid">
              <div><label for="search-facet-lens">${copy.searchFacetLens}</label><select id="search-facet-lens"><option value="">${copy.searchAll}</option><option value="direction">Direction</option><option value="people">People</option><option value="self">Self</option><option value="resources">Resources</option><option value="work">Work</option><option value="environment">Environment</option><option value="knowledge">Knowledge</option><option value="change">Change</option></select></div>
              <div><label for="search-facet-type">${copy.searchFacetType}</label><select id="search-facet-type"><option value="">${copy.searchAll}</option><option value="note">${copy.note}</option><option value="task">${copy.task}</option><option value="observation">${copy.observation}</option><option value="relationship">${copy.relationship}</option><option value="artifact">${copy.attachArtifact}</option></select></div>
              <div><label for="search-facet-space">${copy.searchFacetSpace}</label><select id="search-facet-space"><option value="">${copy.searchAll}</option><option value="personal">${copy.personal}</option><option value="household">${copy.household}</option><option value="work">${copy.work}</option></select></div>
              <div><label for="search-facet-artifact">${copy.searchFacetArtifact}</label><select id="search-facet-artifact"><option value="">${copy.searchAll}</option><option value="true">${copy.searchHasArtifact}</option></select></div>
            </div>
            <div class="form-row">
              <label for="search-view-name">${copy.searchViewName}</label>
              <input id="search-view-name" type="text" maxlength="120" placeholder="${copy.defaultViewTitle}" />
              <button id="search-save-view" class="secondary" type="button">${copy.searchSaveView}</button>
            </div>
          </div>
          <p id="search-scope-status" class="hint"></p>
          <p id="search-status" class="hint" role="status"></p>
        </form>
      </details>

      <details id="spaces" class="panel compact-panel" aria-labelledby="spaces-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.space}</p><h2 id="spaces-heading">${copy.scopeWithoutCopying}</h2></span></summary>
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
      </details>

      <section id="factory-preview" class="panel" aria-labelledby="factory-preview-heading"${factoryPreviewMode ? "" : " hidden"}>
        <p class="eyebrow">${copy.factoryPreview}</p>
        <h2 id="factory-preview-heading">${copy.factoryPreview}</h2>
        <div class="factory-preview-grid">
          <div class="relationship-form">
            <h3>${copy.factoryAppHeading}</h3>
            <p class="hint">${copy.factoryAppHint}</p>
            <form id="factory-app-form"></form>
            <p id="factory-app-status" class="hint" role="status"></p>
            <ul id="factory-app-list" class="record-list" aria-live="polite"></ul>
          </div>
          <div class="relationship-form">
            <h3>${copy.factoryGameHeading}</h3>
            <p class="hint">${copy.factoryGameHint}</p>
            <p id="factory-game-status" class="hint" role="status"></p>
            <div id="factory-game-board" class="factory-game-board" role="group" aria-label="${copy.factoryGameHeading}"></div>
            <div class="form-row">
              <button id="factory-game-move" type="button">${copy.factoryGameMove}</button>
              <button id="factory-game-collect" type="button">${copy.factoryGameCollect}</button>
              <button id="factory-game-pause" type="button" class="secondary">${copy.factoryGamePause}</button>
            </div>
            <div class="form-row">
              <button id="factory-game-save" type="button" class="secondary">${copy.factoryGameSave}</button>
              <button id="factory-game-load" type="button" class="secondary">${copy.factoryGameLoad}</button>
            </div>
          </div>
        </div>
      </section>

      <details id="compose" class="panel compact-panel" aria-labelledby="compose-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.compose}</p><h2 id="compose-heading">${copy.composeHeading}</h2></span></summary>
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
      </details>

      <details id="review" class="panel compact-panel" aria-labelledby="review-heading" data-section-disclosure>
        <summary class="compact-summary section-heading">
          <span class="compact-summary-copy"><p class="eyebrow">${copy.triage}</p><h2 id="review-heading">${copy.reviewInbox}</h2></span>
          <span id="review-count" class="count" aria-label="${copy.inboxCount}">0</span>
        </summary>
        <div id="triage-batch" class="triage-batch" hidden>
          <label class="check-row" for="triage-select-all"><input id="triage-select-all" type="checkbox" /> ${copy.triageSelectAll}</label>
          <span id="triage-selected" class="hint">${copy.triageSelected(0)}</span>
          <input id="triage-batch-defer-until" type="datetime-local" aria-label="${copy.triageBatchDeferUntil}" />
          <button id="triage-batch-review" class="secondary" type="button" disabled>${copy.triageBatchReview}</button>
          <button id="triage-batch-defer" class="secondary" type="button" disabled>${copy.triageBatchDefer}</button>
        </div>
        <details id="review-templates" class="review-templates">
          <summary class="review-templates-summary"><h3>${copy.reviewTemplates}</h3></summary>
          <p class="hint">${copy.reviewHint}</p>
          <div id="review-template-buttons" class="review-template-buttons"></div>
          <div id="review-stepper" class="review-stepper" hidden>
            <div class="section-heading">
              <h3 id="review-stepper-heading"></h3>
              <span id="review-stepper-progress" class="count"></span>
            </div>
            <p id="review-stepper-prompt"></p>
            <p id="review-stepper-motivation" class="hint"></p>
            <ul id="review-stepper-records" class="record-list"></ul>
            <div class="form-row">
              <button id="review-stepper-skip" class="secondary" type="button">${copy.reviewSkip}</button>
              <button id="review-stepper-abandon" class="secondary" type="button">${copy.reviewAbandon}</button>
              <button id="review-stepper-next" type="button">${copy.reviewNext}</button>
            </div>
            <p id="review-stepper-status" class="hint" role="status"></p>
          </div>
        </details>
        <ul id="review-list" class="record-list"></ul>
        <p id="triage-status" class="hint" role="status"></p>
        <p id="review-empty" class="empty-state">${copy.inboxClear}</p>
      </details>

      <details id="relate" class="panel compact-panel" aria-labelledby="relate-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.relate}</p><h2 id="relate-heading">${copy.connectWithoutCopying}</h2></span></summary>
        <form id="relate-form" class="relationship-form">
          <label for="relate-source">${copy.sourceRecord}</label>
          <select id="relate-source" name="source"></select>
          <label for="relate-target">${copy.targetRecord}</label>
          <select id="relate-target" name="target"></select>
          <label for="relate-label">${copy.relationship}</label>
          <input id="relate-label" name="relation" type="text" maxlength="120" value="related" />
          <label for="relate-kind">${copy.typedRelationshipKind}</label>
          <select id="relate-kind" name="kind">
            <option value="REFERENCE">${copy.typedReference}</option>
            <option value="DEPENDENCY">${copy.dependency}</option>
            <option value="ALLOCATION">${copy.allocation}</option>
            <option value="SYNERGY">${copy.synergy}</option>
            <option value="CONFLICT">${copy.conflict}</option>
            <option value="FEEDBACK">${copy.feedback}</option>
          </select>
          <label for="relate-scenario">${copy.relationshipScenario}</label>
          <input id="relate-scenario" name="scenario" type="text" maxlength="160" />
          <label for="relate-allocation-mode">${copy.allocationMode}</label>
          <select id="relate-allocation-mode" name="allocationMode">
            <option value="EXCLUSIVE">${copy.exclusive}</option>
            <option value="ENABLING">${copy.enabling}</option>
          </select>
          <label for="relate-allocation-amount">${copy.allocationAmount}</label>
          <input id="relate-allocation-amount" name="allocationAmount" type="text" inputmode="decimal" maxlength="32" />
          <label for="relate-allocation-currency">${copy.allocationCurrency}</label>
          <select id="relate-allocation-currency" name="allocationCurrency">
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
          </select>
          <button id="relate-submit" type="submit">${copy.createLink}</button>
          <p id="relate-status" class="hint" role="status">${copy.relationshipHint} ${copy.typedRelationshipHint}</p>
        </form>
      </details>

      <details id="knowledge" class="panel compact-panel" aria-labelledby="knowledge-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.sources}</p><h2 id="knowledge-heading">${copy.sourcesHeading}</h2></span></summary>
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
      </details>

      <details id="sharing" class="panel compact-panel" aria-labelledby="sharing-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.sharing}</p><h2 id="sharing-heading">${copy.sharingHeading}</h2></span></summary>
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
          <label for="context-export-format">${copy.contextExportFormat}</label>
          <select id="context-export-format" name="contextFormat">
            <option value="MARKDOWN">Markdown</option>
            <option value="TEXT">Plain text</option>
            <option value="JSON" selected>JSON</option>
            <option value="JSONL">JSONL</option>
            <option value="CSV">CSV (tabular only)</option>
            <option value="TSV">TSV (tabular only)</option>
          </select>
          <label for="context-export-objective">${copy.contextExportObjective}</label>
          <textarea id="context-export-objective" name="contextObjective" maxlength="5000" rows="3"></textarea>
          <label for="context-export-budget">${copy.contextExportBudget}</label>
          <input id="context-export-budget" name="contextBudget" type="number" min="512" max="2000000" step="1" value="250000" />
          <p class="hint">${copy.contextExportHint}</p>
          <div class="form-row">
            <button id="context-export" class="secondary" type="button" disabled>${copy.contextExport}</button>
            <button id="context-export-rerun" class="secondary" type="button" disabled>${copy.contextExportRerun}</button>
          </div>
          <p id="share-status" class="hint" role="status"></p>
        </form>
        <ul id="share-grant-list" class="record-list"></ul>
      </details>

      <details id="sync" class="panel compact-panel" aria-labelledby="sync-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">SYNC / PORTABILITY</p><h2 id="sync-heading">${copy.syncHeading}</h2></span></summary>
        <form id="sync-form" class="relationship-form">
          <label for="sync-endpoint">${copy.syncEndpoint}</label>
          <input id="sync-endpoint" name="endpoint" type="url" maxlength="500" placeholder="https://your-endpoint.example/replica" required />
          <p class="hint">${copy.syncHint}</p>
          <button id="sync-submit" type="submit">${copy.syncRun}</button>
          <p id="sync-status" class="hint" role="status"></p>
        </form>
      </details>

      <details id="focus" class="panel compact-panel" aria-labelledby="focus-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.timeObserve}</p><h2 id="focus-heading">${copy.focusHeading}</h2></span></summary>
        <p class="hint">${copy.focusHint}</p>
        <div class="form-row">
          <button id="focus-toggle" type="button">${copy.startFocus}</button>
          <span id="focus-status" class="hint" role="status">${copy.noActiveSession}</span>
        </div>
      </details>

      <details id="reminders" class="panel compact-panel" aria-labelledby="reminder-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${timeCopy.reminders}</p><h2 id="reminder-heading">${timeCopy.reminderHeading}</h2></span></summary>
        <form id="reminder-form">
          <label for="reminder-title">${timeCopy.reminderTitle}</label>
          <input id="reminder-title" name="title" type="text" maxlength="240" required />
          <label for="reminder-due">${timeCopy.reminderDueAt}</label>
          <input id="reminder-due" name="dueAt" type="datetime-local" required />
          <p class="hint">${timeCopy.reminderHint}</p>
          <button type="submit">${timeCopy.saveReminder}</button>
          <p id="reminder-status" class="hint" role="status"></p>
        </form>
      </details>

      <details id="records" class="panel compact-panel" aria-labelledby="records-heading" data-section-disclosure>
        <summary class="compact-summary section-heading">
          <span class="compact-summary-copy"><p id="records-label" class="eyebrow">${copy.canonicalRecords}</p><h2 id="records-heading">${copy.recentCaptures}</h2></span>
          <span id="record-count" class="count" aria-label="${copy.recordCount}">0</span>
        </summary>
        <div class="editable-term compact-inline-control"><button id="edit-records-label" class="secondary term-edit-button" type="button">${copy.editLabel}</button></div>
        <ul id="record-list" class="record-list"></ul>
        <p id="empty-state" class="empty-state">${copy.nothingCaptured}</p>
        <div id="undo-banner" class="undo-banner" role="status" hidden>
          <span id="undo-message"></span>
          <button id="undo-archive" class="secondary" type="button">${copy.undo}</button>
        </div>
        <div class="section-heading archive-heading">
          <h3>${copy.archivedRecords}</h3>
          <button id="toggle-archive" class="secondary" type="button" aria-expanded="false">${copy.showArchived}</button>
        </div>
        <div id="archive-panel" hidden>
          <ul id="archive-list" class="record-list"></ul>
          <p id="archive-empty" class="empty-state">${copy.noArchived}</p>
        </div>
      </details>

      <details id="recovery" class="panel compact-panel" aria-labelledby="recovery-heading" data-section-disclosure>
        <summary class="compact-summary"><span class="compact-summary-copy"><p class="eyebrow">${copy.recovery}</p><h2 id="recovery-heading">${copy.keepPortable}</h2></span></summary>
        <p class="hint">${copy.recoveryHint}</p>
        <div class="form-row recovery-row">
          <button id="export-vault" class="secondary" type="button">${copy.exportVault}</button>
          <button id="export-encrypted" class="secondary" type="button">${recoveryCopy.exportEncrypted}</button>
           <button id="export-diagnostics" class="secondary" type="button">${copy.exportDiagnostics}</button>
           <button id="repair-search" class="secondary" type="button">${copy.repairSearch}</button>
           <button id="request-persistence" class="secondary" type="button">${recoveryCopy.requestPersistence}</button>
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
        <div class="relationship-form" id="package-automation-panel">
          <h3>${copy.automationHeading}</h3>
          <p class="hint">${copy.automationHint}</p>
          <p class="hint"><strong>${copy.automationPackage}:</strong> ${CORE_AUTOMATION_PACKAGE.packageId} · <strong>Permission:</strong> automation.proposal</p>
          <form id="package-automation-form">
            <label for="package-automation-record">${copy.automationRecord}</label>
            <select id="package-automation-record" required></select>
            <label for="package-automation-document">${copy.automationDocument}</label>
            <textarea id="package-automation-document" rows="10" maxlength="32000" required></textarea>
            <div class="form-row">
              <button id="package-automation-install" type="submit">${copy.automationInstall}</button>
              <button id="package-automation-preview" class="secondary" type="button">${copy.automationPreview}</button>
            </div>
          </form>
          <p id="package-automation-status" class="hint" role="status"></p>
          <h4>${copy.automationRules}</h4>
          <ul id="package-automation-list" class="record-list"></ul>
          <h4>${copy.automationProposals}</h4>
          <ul id="package-automation-proposals" class="record-list"></ul>
        </div>
        <label for="vault-password">${recoveryCopy.password}</label>
        <input id="vault-password" type="password" minlength="8" autocomplete="new-password" />
        <p class="hint">${recoveryCopy.passwordHint}</p>
        <p id="recovery-status" class="hint" role="status"></p>
      </details>
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
  const deviceCapabilities = root.querySelector<HTMLElement>("#device-capabilities");
  const deviceShare = root.querySelector<HTMLButtonElement>("#device-share");
  const deviceLocation = root.querySelector<HTMLButtonElement>("#device-location");
  const deviceCamera = root.querySelector<HTMLButtonElement>("#device-camera");
  const deviceMicrophone = root.querySelector<HTMLButtonElement>("#device-microphone");
  const deviceBarcodeInput = root.querySelector<HTMLInputElement>("#device-barcode-input");
  const deviceInputStatus = root.querySelector<HTMLElement>("#device-input-status");
  const acquireStatus = root.querySelector<HTMLElement>("#acquire-status");
  const acquirePreview = root.querySelector<HTMLUListElement>("#acquire-preview");
  const acceptStaged = root.querySelector<HTMLButtonElement>("#accept-staged");
  const cleanupImportedOnly = root.querySelector<HTMLInputElement>("#cleanup-imported-only");
  const cleanupTrim = root.querySelector<HTMLInputElement>("#cleanup-trim");
  const cleanupWhitespace = root.querySelector<HTMLInputElement>("#cleanup-whitespace");
  const cleanupPreviewButton = root.querySelector<HTMLButtonElement>("#cleanup-preview");
  const cleanupApplyButton = root.querySelector<HTMLButtonElement>("#cleanup-apply");
  const cleanupStatus = root.querySelector<HTMLElement>("#cleanup-status");
  const cleanupPreviewOutput = root.querySelector<HTMLElement>("#cleanup-preview-output");
  const cleanupSummary = root.querySelector<HTMLElement>("#cleanup-summary");
  const cleanupSources = root.querySelector<HTMLUListElement>("#cleanup-sources");
  const cleanupProposals = root.querySelector<HTMLUListElement>("#cleanup-proposals");
  const cleanupHistoryList = root.querySelector<HTMLUListElement>("#cleanup-history-list");
  const cleanupHistoryEmpty = root.querySelector<HTMLElement>("#cleanup-history-empty");
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
  const financePlanForm = root.querySelector<HTMLFormElement>("#finance-plan-form");
  const financePlanKind = root.querySelector<HTMLSelectElement>("#finance-plan-kind");
  const financePlanLabel = root.querySelector<HTMLInputElement>("#finance-plan-label");
  const financePlanAmount = root.querySelector<HTMLInputElement>("#finance-plan-amount");
  const financePlanCurrency = root.querySelector<HTMLSelectElement>("#finance-plan-currency");
  const financePlanSpace = root.querySelector<HTMLSelectElement>("#finance-plan-space");
   const financePlanDate = root.querySelector<HTMLInputElement>("#finance-plan-date");
   const financePlanSurplus = root.querySelector<HTMLInputElement>("#finance-plan-surplus");
   const financePlanHardConstraint = root.querySelector<HTMLInputElement>("#finance-plan-hard");
   const financePlanStatus = root.querySelector<HTMLElement>("#finance-plan-status");
  const financeImportForm = root.querySelector<HTMLFormElement>("#finance-import-form");
  const financeImportFile = root.querySelector<HTMLInputElement>("#finance-import-file");
  const financeImportAccount = root.querySelector<HTMLInputElement>("#finance-import-account");
  const financeImportCurrency = root.querySelector<HTMLSelectElement>("#finance-import-currency");
  const financeImportOpening = root.querySelector<HTMLInputElement>("#finance-import-opening");
  const financeImportClosing = root.querySelector<HTMLInputElement>("#finance-import-closing");
  const financeImportStatus = root.querySelector<HTMLElement>("#finance-import-status");
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
  const searchFiltersToggle = root.querySelector<HTMLButtonElement>("#search-filters-toggle");
  const searchFilters = root.querySelector<HTMLElement>("#search-filters");
  const searchFacetChips = root.querySelector<HTMLElement>("#search-facet-chips");
  const searchFacetLens = root.querySelector<HTMLSelectElement>("#search-facet-lens");
  const searchFacetType = root.querySelector<HTMLSelectElement>("#search-facet-type");
  const searchFacetSpace = root.querySelector<HTMLSelectElement>("#search-facet-space");
  const searchFacetArtifact = root.querySelector<HTMLSelectElement>("#search-facet-artifact");
  const searchViewName = root.querySelector<HTMLInputElement>("#search-view-name");
  const searchSaveView = root.querySelector<HTMLButtonElement>("#search-save-view");
  const searchScopeStatus = root.querySelector<HTMLElement>("#search-scope-status");
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
  const factoryPreview = root.querySelector<HTMLElement>("#factory-preview");
  const factoryAppForm = root.querySelector<HTMLFormElement>("#factory-app-form");
  const factoryAppStatus = root.querySelector<HTMLElement>("#factory-app-status");
  const factoryAppList = root.querySelector<HTMLUListElement>("#factory-app-list");
  const factoryGameStatus = root.querySelector<HTMLElement>("#factory-game-status");
  const factoryGameBoard = root.querySelector<HTMLElement>("#factory-game-board");
  const factoryGameMove = root.querySelector<HTMLButtonElement>("#factory-game-move");
  const factoryGameCollect = root.querySelector<HTMLButtonElement>("#factory-game-collect");
  const factoryGamePause = root.querySelector<HTMLButtonElement>("#factory-game-pause");
  const factoryGameSave = root.querySelector<HTMLButtonElement>("#factory-game-save");
  const factoryGameLoad = root.querySelector<HTMLButtonElement>("#factory-game-load");
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
  const insightsDisclosure = root.querySelector<HTMLDetailsElement>('[data-home-widget="insights"]');
  const attentionPanel = root.querySelector<HTMLElement>("#attention-panel");
  const homeFocusToggle = root.querySelector<HTMLButtonElement>("#home-focus-toggle");
  const reviewList = root.querySelector<HTMLUListElement>("#review-list");
  const reviewCount = root.querySelector<HTMLElement>("#review-count");
  const triageStatusMessage = root.querySelector<HTMLElement>("#triage-status")!;
  const reviewEmpty = root.querySelector<HTMLElement>("#review-empty");
  const triageBatch = root.querySelector<HTMLElement>("#triage-batch");
  const triageSelectAll = root.querySelector<HTMLInputElement>("#triage-select-all");
  const triageSelected = root.querySelector<HTMLElement>("#triage-selected");
  const triageBatchDeferUntil = root.querySelector<HTMLInputElement>("#triage-batch-defer-until");
  const triageBatchReview = root.querySelector<HTMLButtonElement>("#triage-batch-review");
  const triageBatchDefer = root.querySelector<HTMLButtonElement>("#triage-batch-defer");
  const reviewTemplates = root.querySelector<HTMLDetailsElement>("#review-templates");
  const reviewTemplateButtons = root.querySelector<HTMLElement>("#review-template-buttons");
  const reviewStepper = root.querySelector<HTMLElement>("#review-stepper");
  const reviewStepperHeading = root.querySelector<HTMLElement>("#review-stepper-heading");
  const reviewStepperProgress = root.querySelector<HTMLElement>("#review-stepper-progress");
  const reviewStepperPrompt = root.querySelector<HTMLElement>("#review-stepper-prompt");
  const reviewStepperMotivation = root.querySelector<HTMLElement>("#review-stepper-motivation");
  const reviewStepperRecords = root.querySelector<HTMLUListElement>("#review-stepper-records");
  const reviewStepperSkip = root.querySelector<HTMLButtonElement>("#review-stepper-skip");
  const reviewStepperAbandon = root.querySelector<HTMLButtonElement>("#review-stepper-abandon");
  const reviewStepperNext = root.querySelector<HTMLButtonElement>("#review-stepper-next");
  const reviewStepperStatus = root.querySelector<HTMLElement>("#review-stepper-status");
  const relateForm = root.querySelector<HTMLFormElement>("#relate-form");
  const relateSource = root.querySelector<HTMLSelectElement>("#relate-source");
  const relateTarget = root.querySelector<HTMLSelectElement>("#relate-target");
  const relateLabel = root.querySelector<HTMLInputElement>("#relate-label");
  const relateKind = root.querySelector<HTMLSelectElement>("#relate-kind")!;
  const relateScenario = root.querySelector<HTMLInputElement>("#relate-scenario")!;
  const relateAllocationMode = root.querySelector<HTMLSelectElement>("#relate-allocation-mode")!;
  const relateAllocationAmount = root.querySelector<HTMLInputElement>("#relate-allocation-amount")!;
  const relateAllocationCurrency = root.querySelector<HTMLSelectElement>("#relate-allocation-currency")!;
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
  const contextExportFormat = root.querySelector<HTMLSelectElement>("#context-export-format");
  const contextExportObjective = root.querySelector<HTMLTextAreaElement>("#context-export-objective");
  const contextExportBudget = root.querySelector<HTMLInputElement>("#context-export-budget");
  const contextExportButton = root.querySelector<HTMLButtonElement>("#context-export");
  const contextExportRerunButton = root.querySelector<HTMLButtonElement>("#context-export-rerun");
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
  const quickDensity = root.querySelector<HTMLButtonElement>("#quick-density");
  const localeInput = root.querySelector<HTMLSelectElement>("#locale");
  const taglineInput = root.querySelector<HTMLInputElement>("#tagline");
  const familyInput = root.querySelector<HTMLSelectElement>("#family");
  const densityInput = root.querySelector<HTMLSelectElement>("#density");
  const typefaceInput = root.querySelector<HTMLSelectElement>("#typeface");
  const iconographyInput = root.querySelector<HTMLSelectElement>("#iconography");
  const accessibilityProfileInput = root.querySelector<HTMLSelectElement>("#accessibility-profile");
  const accessibilityTextScaleInput = root.querySelector<HTMLSelectElement>("#accessibility-text-scale");
  const accessibilityTargetSizeInput = root.querySelector<HTMLSelectElement>("#accessibility-target-size");
  const accessibilityReducedMotionInput = root.querySelector<HTMLInputElement>("#accessibility-reduced-motion");
  const homeLabelInput = root.querySelector<HTMLInputElement>("#home-label-input");
  const captureLabelInput = root.querySelector<HTMLInputElement>("#capture-label-input");
  const recordsLabelInput = root.querySelector<HTMLInputElement>("#records-label-input");
  const captureLabel = root.querySelector<HTMLElement>("#capture-label");
  const editHomeLabel = root.querySelector<HTMLButtonElement>("#edit-home-label");
  const editCaptureLabel = root.querySelector<HTMLButtonElement>("#edit-capture-label");
  const editRecordsLabel = root.querySelector<HTMLButtonElement>("#edit-records-label");
  const presentationLabelDialog = root.querySelector<HTMLDialogElement>("#presentation-label-dialog");
  const presentationLabelDialogForm = root.querySelector<HTMLFormElement>("#presentation-label-dialog-form");
  const presentationLabelInput = root.querySelector<HTMLInputElement>("#presentation-label-input");
  const presentationLabelCancel = root.querySelector<HTMLButtonElement>("#presentation-label-cancel");
  const presentationLabelDialogStatus = root.querySelector<HTMLElement>("#presentation-label-dialog-status");
  const navigationOptions = root.querySelector<HTMLElement>("#navigation-options");
  const homeWidgetOptions = root.querySelector<HTMLElement>("#home-widget-options");
  const resetPresentation = root.querySelector<HTMLButtonElement>("#reset-presentation");
  const exportPresentationProfileButton = root.querySelector<HTMLButtonElement>("#export-presentation-profile");
  const presentationProfileInput = root.querySelector<HTMLInputElement>("#presentation-profile-input");
  const primaryNavMenu = root.querySelector<HTMLDetailsElement>("#primary-nav-menu");
  const primaryNavList = root.querySelector<HTMLOListElement>("#primary-nav-list");
  const lensNavList = root.querySelector<HTMLOListElement>("#lens-nav-list");
  const lensOverflowToggle = root.querySelector<HTMLButtonElement>("#lens-overflow-toggle");
  const lensOverflowDialog = root.querySelector<HTMLDialogElement>("#lens-overflow-dialog");
  const lensOverflowGrid = root.querySelector<HTMLElement>("#lens-overflow-grid");
  const lensOverflowClose = root.querySelector<HTMLButtonElement>("#lens-overflow-close");
  const lensNavStatus = root.querySelector<HTMLElement>("#lens-nav-status");
  const activeLensHeading = root.querySelector<HTMLElement>("#active-lens-heading");
  const activeLensStatus = root.querySelector<HTMLElement>("#active-lens-status");
  const activeLensHint = root.querySelector<HTMLElement>("#active-lens-hint");
  const activeLensRecords = root.querySelector<HTMLUListElement>("#active-lens-records");
  const activeLensDisclosure = root.querySelector<HTMLDetailsElement>("#active-lens");
  const reviewDisclosure = root.querySelector<HTMLDetailsElement>("#review");
  const recordsDisclosure = root.querySelector<HTMLDetailsElement>("#records");
  const lensPinOptions = root.querySelector<HTMLElement>("#lens-pin-options");
  const recordDetailDialog = root.querySelector<HTMLDialogElement>("#record-detail-dialog");
  const recordDetailContext = root.querySelector<HTMLElement>("#record-detail-context");
  const recordDetailHeading = root.querySelector<HTMLElement>("#record-detail-heading");
  const recordDetailText = root.querySelector<HTMLElement>("#record-detail-text");
  const recordDetailStatus = root.querySelector<HTMLElement>("#record-detail-status");
  const recordDetailEditForm = root.querySelector<HTMLFormElement>("#record-detail-edit-form");
  const recordDetailEditText = root.querySelector<HTMLTextAreaElement>("#record-detail-edit-text");
  const recordDetailEditStatus = root.querySelector<HTMLElement>("#record-detail-edit-status");
  const recordDetailMetadata = root.querySelector<HTMLDListElement>("#record-detail-metadata");
  const recordDetailRelationshipList = root.querySelector<HTMLUListElement>("#record-detail-relationship-list");
  const recordDetailEvidenceList = root.querySelector<HTMLUListElement>("#record-detail-evidence-list");
  const recordDetailHistoryList = root.querySelector<HTMLOListElement>("#record-detail-history-list");
  const recordDetailClose = root.querySelector<HTMLButtonElement>("#record-detail-close");
  const recordDetailSegments = root.querySelector<HTMLElement>("#record-detail-segments");
  const homeLabel = root.querySelector<HTMLElement>("#home-label");
  const recordsLabel = root.querySelector<HTMLElement>("#records-label");
  const presentationForm = root.querySelector<HTMLFormElement>("#presentation-form");
  const presentationStatus = root.querySelector<HTMLElement>("#presentation-status");
  const presentationHostStatus = root.querySelector<HTMLElement>("#presentation-host-status");
  const recordList = root.querySelector<HTMLUListElement>("#record-list");
  const emptyState = root.querySelector<HTMLParagraphElement>("#empty-state");
  const recordCount = root.querySelector<HTMLElement>("#record-count");
  const undoBanner = root.querySelector<HTMLElement>("#undo-banner");
  const undoMessage = root.querySelector<HTMLElement>("#undo-message");
  const undoArchive = root.querySelector<HTMLButtonElement>("#undo-archive");
  const toggleArchive = root.querySelector<HTMLButtonElement>("#toggle-archive");
  const archivePanel = root.querySelector<HTMLElement>("#archive-panel");
  const archiveList = root.querySelector<HTMLUListElement>("#archive-list");
  const archiveEmpty = root.querySelector<HTMLParagraphElement>("#archive-empty");
  const recoveryStatus = root.querySelector<HTMLElement>("#recovery-status");
  const effectList = root.querySelector<HTMLUListElement>("#effect-list")!;
  const healthStatus = root.querySelector<HTMLElement>("#health-status");
  const capabilityStatus = root.querySelector<HTMLElement>("#capability-status");
  const onboardingPanel = root.querySelector<HTMLDetailsElement>("#onboarding");
  const onboardingDismiss = root.querySelector<HTMLButtonElement>("#onboarding-dismiss");
  const onboardingShow = root.querySelector<HTMLButtonElement>("#onboarding-show");
  const themeToggle = root.querySelector<HTMLButtonElement>("#theme-toggle");
  const exportButton = root.querySelector<HTMLButtonElement>("#export-vault");
  const encryptedExportButton = root.querySelector<HTMLButtonElement>("#export-encrypted");
  const vaultPassword = root.querySelector<HTMLInputElement>("#vault-password");
  const diagnosticsButton = root.querySelector<HTMLButtonElement>("#export-diagnostics");
  const repairSearchButton = root.querySelector<HTMLButtonElement>("#repair-search");
  const requestPersistenceButton = root.querySelector<HTMLButtonElement>("#request-persistence");
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
  const effectRunDialogTitle = root.querySelector<HTMLHeadingElement>("#effect-run-dialog-title");
  const effectRunDialogMessage = root.querySelector<HTMLElement>("#effect-run-dialog-message");
  const effectRunDialogCancel = root.querySelector<HTMLButtonElement>("#effect-run-dialog-cancel");
  const effectRunDialogConfirm = root.querySelector<HTMLButtonElement>("#effect-run-dialog-confirm");
  const packageAutomationForm = root.querySelector<HTMLFormElement>("#package-automation-form");
  const packageAutomationRecord = root.querySelector<HTMLSelectElement>("#package-automation-record");
  const packageAutomationDocument = root.querySelector<HTMLTextAreaElement>("#package-automation-document");
  const packageAutomationPreviewButton = root.querySelector<HTMLButtonElement>("#package-automation-preview");
  const packageAutomationStatus = root.querySelector<HTMLElement>("#package-automation-status");
  const packageAutomationList = root.querySelector<HTMLUListElement>("#package-automation-list");
  const packageAutomationProposals = root.querySelector<HTMLUListElement>("#package-automation-proposals");
  if (!captureForm || !captureType || !captureSpace || !captureText || !captureSafeRoute || !acquireForm || !acquireText || !acquireFile || !acquireClipboard || !deviceCapabilities || !deviceShare || !deviceLocation || !deviceCamera || !deviceMicrophone || !deviceBarcodeInput || !deviceInputStatus || !acquireStatus || !acquirePreview || !acceptStaged || !cleanupImportedOnly || !cleanupTrim || !cleanupWhitespace || !cleanupPreviewButton || !cleanupApplyButton || !cleanupStatus || !cleanupPreviewOutput || !cleanupSummary || !cleanupSources || !cleanupProposals || !cleanupHistoryList || !cleanupHistoryEmpty || !trackForm || !trackName || !trackValue || !trackUnit || !trackSpace || !trackStatus || !expenseForm || !expenseMerchant || !expenseAmount || !expenseCurrency || !expenseSpace || !expenseStatus || !healthForm || !healthMetric || !healthValue || !healthUnit || !healthSubject || !healthNote || !healthSpace || !healthFormStatus || !searchForm || !searchQuery || !clearSearch || !searchFiltersToggle || !searchFilters || !searchFacetChips || !searchFacetLens || !searchFacetType || !searchFacetSpace || !searchFacetArtifact || !searchViewName || !searchSaveView || !searchScopeStatus || !searchStatus || !spaceCreateForm || !spaceName || !spaceCreateStatus || !spaceForm || !spaceRecord || !spaceMembership || !spaceFilter || !spaceStatus || !spaceList || !spaceMembershipList || !composeForm || !composeTitle || !composeFields || !composeSpace || !composeStatus || !composePreview || !summaryTotal || !analysisStatus || !summaryGrid || !insightsGrid || !insightsDisclosure || !attentionPanel || !homeFocusToggle || !reviewList || !reviewCount || !reviewEmpty || !triageBatch || !triageSelectAll || !triageSelected || !triageBatchDeferUntil || !triageBatchReview || !triageBatchDefer || !relateForm || !relateSource || !relateTarget || !relateLabel || !relateSubmit || !relateStatus || !evidenceForm || !evidenceSubject || !evidenceSource || !evidenceRelation || !evidenceClaim || !evidenceUncertainty || !evidenceSubmit || !evidenceStatus || !annotationForm || !annotationSource || !annotationQuote || !annotationNote || !annotationSubmit || !annotationStatus || !placeForm || !placeLabel || !placeLatitude || !placeLongitude || !placeGeoJson || !placeStatus || !knowledgeStatus || !shareForm || !shareRecipient || !sharePurpose || !shareExpiry || !shareSpace || !shareGrant || !shareRecords || !shareIncludePrivate || !shareGrantSubmit || !shareExport || !contextExportFormat || !contextExportObjective || !contextExportBudget || !contextExportButton || !contextExportRerunButton || !shareStatus || !shareGrantList || !syncForm || !syncEndpoint || !syncStatus || !focusToggle || !focusStatus || !reminderForm || !reminderTitle || !reminderDue || !reminderStatus || !productLabel || !productTagline || !productName || !quickDensity || !localeInput || !taglineInput || !densityInput || !typefaceInput || !iconographyInput || !homeLabelInput || !captureLabelInput || !recordsLabelInput || !captureLabel || !editHomeLabel || !editCaptureLabel || !editRecordsLabel || !presentationLabelDialog || !presentationLabelDialogForm || !presentationLabelInput || !presentationLabelCancel || !presentationLabelDialogStatus || !navigationOptions || !homeWidgetOptions || !resetPresentation || !exportPresentationProfileButton || !presentationProfileInput || !primaryNavMenu || !primaryNavList || !homeLabel || !recordsLabel || !presentationForm || !presentationStatus || !presentationHostStatus || !recordList || !emptyState || !recordCount || !undoBanner || !undoMessage || !undoArchive || !toggleArchive || !archivePanel || !archiveList || !archiveEmpty || !recoveryStatus || !healthStatus || !capabilityStatus || !onboardingPanel || !onboardingDismiss || !onboardingShow || !themeToggle || !exportButton || !encryptedExportButton || !vaultPassword || !diagnosticsButton || !repairSearchButton || !requestPersistenceButton || !safePresentationButton || !clearCanonicalButton || !importInput || !artifactInput || !activeLensDisclosure || !reviewDisclosure || !recordsDisclosure) {
    throw new Error("Omnevum foundation controls are missing");
  }
  if (!financeImportForm || !financeImportFile || !financeImportAccount || !financeImportCurrency || !financeImportOpening || !financeImportClosing || !financeImportStatus) {
    throw new Error("Omnevum Finance import controls are missing");
  }
  if (!financePlanForm || !financePlanKind || !financePlanLabel || !financePlanAmount || !financePlanCurrency || !financePlanSpace || !financePlanDate || !financePlanSurplus || !financePlanHardConstraint || !financePlanStatus) {
    throw new Error("Omnevum Finance planning controls are missing");
  }
  if (!documentFinishForm || !documentFinishSource || !documentFinishTerms || !documentFinishReplacement || !documentFinishStatus) {
    throw new Error("Omnevum document-finishing controls are missing");
  }
  if (!effectStageForm || !effectStageDestination || !effectStagePurpose || !effectStagePayload || !effectStageSpace || !effectStageStatus || !effectRunForm || !effectRunEndpoint || !effectRunStatus || !effectRunDialog || !effectRunDialogTitle || !effectRunDialogMessage || !effectRunDialogCancel || !effectRunDialogConfirm) {
    throw new Error("Omnevum external-effect controls are missing");
  }
  if (!factoryPreview || !factoryAppForm || !factoryAppStatus || !factoryAppList || !factoryGameStatus || !factoryGameBoard || !factoryGameMove || !factoryGameCollect || !factoryGamePause || !factoryGameSave || !factoryGameLoad) {
    throw new Error("Omnevum factory preview controls are missing");
  }
  if (!lensNavList || !lensOverflowToggle || !lensOverflowDialog || !lensOverflowGrid || !lensOverflowClose || !lensNavStatus || !activeLensHeading || !activeLensStatus || !activeLensHint || !activeLensRecords || !lensPinOptions) {
    throw new Error("Omnevum lens navigation controls are missing");
  }
  if (!recordDetailDialog || !recordDetailContext || !recordDetailHeading || !recordDetailText || !recordDetailStatus || !recordDetailEditForm || !recordDetailEditText || !recordDetailEditStatus || !recordDetailMetadata || !recordDetailRelationshipList || !recordDetailEvidenceList || !recordDetailHistoryList || !recordDetailClose || !recordDetailSegments) {
    throw new Error("Omnevum record detail controls are missing");
  }
  if (!familyInput || !accessibilityProfileInput || !accessibilityTextScaleInput || !accessibilityTargetSizeInput || !accessibilityReducedMotionInput) throw new Error("Omnevum presentation accessibility controls are missing");
  if (!packageAutomationForm || !packageAutomationRecord || !packageAutomationDocument || !packageAutomationPreviewButton || !packageAutomationStatus || !packageAutomationList || !packageAutomationProposals) {
    throw new Error("Omnevum package-automation controls are missing");
  }
  if (!reviewTemplates || !reviewTemplateButtons || !reviewStepper || !reviewStepperHeading || !reviewStepperProgress || !reviewStepperPrompt || !reviewStepperMotivation || !reviewStepperRecords || !reviewStepperSkip || !reviewStepperAbandon || !reviewStepperNext || !reviewStepperStatus) {
    throw new Error("Omnevum Review template controls are missing");
  }

  const sharedParameters = new URLSearchParams(window.location.search);
  const sharedInput = [sharedParameters.get("title"), sharedParameters.get("text"), sharedParameters.get("url")].filter((value): value is string => Boolean(value?.trim())).join("\n").trim();
  if (sharedInput) acquireText.value = sharedInput.slice(0, 5 * 1024 * 1024);

  const trackService = new TrackService(store, commands);
  const spaceService = new SpaceService(store, commands);
  const viewRegistry = new ViewRegistry(store);
  const renderSearchFacets = (parsed: ParsedSearchQuery): void => {
    const selections: Array<{ key: string; value: string; select: HTMLSelectElement }> = [
      ...(parsed.facets.lens ? [{ key: copy.searchFacetLens, value: parsed.facets.lens, select: searchFacetLens }] : []),
      ...(parsed.facets.recordType ? [{ key: copy.searchFacetType, value: parsed.facets.recordType, select: searchFacetType }] : []),
      ...(parsed.facets.space ? [{ key: copy.searchFacetSpace, value: parsed.facets.space, select: searchFacetSpace }] : []),
      ...(parsed.facets.hasArtifact ? [{ key: copy.searchFacetArtifact, value: "artifact", select: searchFacetArtifact }] : [])
    ];
    searchFacetChips.replaceChildren();
    for (const selection of selections) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "secondary facet-chip";
      chip.textContent = copy.searchFacetChip(selection.key, selection.value);
      chip.addEventListener("click", () => {
        selection.select.value = "";
        const next = parseSearchQuery(searchQuery.value);
        if (selection.select === searchFacetLens) delete next.facets.lens;
        if (selection.select === searchFacetType) delete next.facets.recordType;
        if (selection.select === searchFacetSpace) delete next.facets.space;
        if (selection.select === searchFacetArtifact) delete next.facets.hasArtifact;
        searchQuery.value = serializeSearchQuery(next);
        void renderRecords(searchQuery.value);
      });
      searchFacetChips.append(chip);
    }
  };
  const syncSearchFacetControls = (parsed: ParsedSearchQuery): void => {
    searchFacetLens.value = parsed.facets.lens ?? "";
    searchFacetType.value = parsed.facets.recordType ?? "";
    searchFacetSpace.value = parsed.facets.space ?? "";
    searchFacetArtifact.value = parsed.facets.hasArtifact ? "true" : "";
    renderSearchFacets(parsed);
  };
  const updateSearchQueryFromFacetControls = (): void => {
    const parsed = parseSearchQuery(searchQuery.value);
    parsed.facets = {
      ...(searchFacetLens.value ? { lens: searchFacetLens.value as NonNullable<ParsedSearchQuery["facets"]["lens"]> } : {}),
      ...(searchFacetType.value ? { recordType: searchFacetType.value as NonNullable<ParsedSearchQuery["facets"]["recordType"]> } : {}),
      ...(searchFacetSpace.value ? { space: searchFacetSpace.value as NonNullable<ParsedSearchQuery["facets"]["space"]> } : {}),
      ...(searchFacetArtifact.value === "true" ? { hasArtifact: true } : {})
    };
    searchQuery.value = serializeSearchQuery(parsed);
    renderSearchFacets(parsed);
    void renderRecords(searchQuery.value);
  };
  searchFiltersToggle.addEventListener("click", () => {
    searchFilters.hidden = !searchFilters.hidden;
    searchFiltersToggle.setAttribute("aria-expanded", String(!searchFilters.hidden));
  });
  for (const facet of [searchFacetLens, searchFacetType, searchFacetSpace, searchFacetArtifact]) facet.addEventListener("change", updateSearchQueryFromFacetControls);
  const deviceInput = new DeviceInputBroker();
  const deviceCapabilitySnapshot = deviceInput.capabilities();
  const availableDeviceCapabilities = Object.entries(deviceCapabilitySnapshot).filter(([, available]) => available).map(([id]) => id);
  deviceCapabilities.textContent = `${deviceCopy.capabilities}: ${availableDeviceCapabilities.length > 0 ? availableDeviceCapabilities.join(", ") : deviceCopy.manualFallback}`;
  deviceShare.disabled = !deviceCapabilitySnapshot.share;
  deviceLocation.disabled = !deviceCapabilitySnapshot.geolocation;
  deviceCamera.disabled = !deviceCapabilitySnapshot.camera;
  deviceMicrophone.disabled = !deviceCapabilitySnapshot.microphone;
  deviceBarcodeInput.disabled = !deviceCapabilitySnapshot.barcode;
  let stagedCandidates: AcquireCandidate[] = [];
  let cleanupPreviewState: CleanupPreview | undefined;
  let recordsRenderRevision = 0;
  const selectedTriageIds = new Set<string>();
  let visibleTriageRecords = new Map<string, CanonicalRecord>();
  let reviewSession: ReviewSession | undefined;
  let reviewSessionOpen = false;
  let activeRecordDetail: { recordId: string; revision: number; lensId: PresentationLensId } | undefined;
  let packageAutomationProposalsState: PackageAutomationProposal[] = [];
  let financeChangedIds: string[] = [];
  const ARCHIVE_UNDO_WINDOW_MS = 10_000;
  let archiveUndoState: { recordId: string; expiresAt: number } | undefined;
  let archiveUndoTicker: number | undefined;
  const clearArchiveUndo = (): void => {
    if (archiveUndoTicker !== undefined) window.clearInterval(archiveUndoTicker);
    archiveUndoTicker = undefined;
    archiveUndoState = undefined;
    undoBanner.hidden = true;
    undoArchive.disabled = true;
  };
  const renderArchiveUndo = (): boolean => {
    if (!archiveUndoState) return false;
    const remaining = Math.ceil((archiveUndoState.expiresAt - Date.now()) / 1000);
    if (remaining <= 0) {
      clearArchiveUndo();
      return false;
    }
    undoMessage.textContent = copy.undoAvailable(remaining);
    undoBanner.hidden = false;
    undoArchive.disabled = false;
    return true;
  };
  const startArchiveUndo = (recordId: string): void => {
    clearArchiveUndo();
    archiveUndoState = { recordId, expiresAt: Date.now() + ARCHIVE_UNDO_WINDOW_MS };
    renderArchiveUndo();
    archiveUndoTicker = window.setInterval(renderArchiveUndo, 250);
  };
  const packageAutomationRuleId = `${CORE_AUTOMATION_PACKAGE.packageId}.manual-review-${Date.now()}`;
  const makePackageAutomationDocument = (recordId: string): string => JSON.stringify({
    schemaVersion: 1,
    ruleId: packageAutomationRuleId,
    version: 1,
    trigger: "MANUAL",
    when: { op: "exists", path: "record.id" },
    actions: [{ command: "record.update", arguments: { recordId, field: "automationReviewed", value: true } }],
    enabled: true
  }, null, 2);
  let activeSpace: SpaceId | undefined;
  const spaceLabels = new Map<SpaceId, string>(Object.entries(SPACE_LABELS));
  const requestConfirmation = (message: string, title = copy.confirmationHeading, confirmLabel = copy.confirm): Promise<boolean> => new Promise((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    effectRunDialogTitle.textContent = title;
    effectRunDialogMessage.textContent = message;
    effectRunDialogConfirm.textContent = confirmLabel;
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

  const requestEffectRunConfirmation = (endpoint: string): Promise<boolean> => requestConfirmation(`${copy.effectRunConfirmation} ${endpoint}?`, copy.effectRunHeading, copy.effectRunConfirm);

  const factoryAppDefinition = createRecordAppDefinition({ manifest: FACTORY_PREVIEW_MANIFEST, title: FACTORY_PREVIEW_APP_TITLE, fields: FACTORY_PREVIEW_FIELDS });
  const factoryAppRuntime = factoryAppDefinition.createRuntime(commands);
  const factoryGameSession = FACTORY_PREVIEW_GAME.createSession(factoryPreviewGameAdapter, 42);
  factoryPreview.dataset.factoryViewId = factoryAppDefinition.baselineView.id;

  const renderFactoryApp = async (): Promise<void> => {
    const records = await factoryAppRuntime.list();
    factoryAppList.replaceChildren();
    if (records.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.factoryAppEmpty;
      factoryAppList.append(empty);
      return;
    }
    for (const record of [...records].reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const body = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = String(record.data.title ?? "Generated record");
      const meta = document.createElement("small");
      meta.textContent = `${record.data.minutes ?? 0} min · ${record.data.status === "DONE" ? copy.taskDone : `revision ${record.revision}`}`;
      body.append(title, meta);
      const complete = document.createElement("button");
      complete.type = "button";
      complete.className = "icon-button";
      complete.textContent = copy.factoryAppComplete;
      complete.disabled = record.data.status === "DONE";
      complete.addEventListener("click", async () => {
        try {
          await factoryAppRuntime.complete(record.id, record.revision);
          factoryAppStatus.textContent = copy.factoryAppSaved(String(record.data.title ?? "record"));
          await renderFactoryApp();
        } catch (error) {
          factoryAppStatus.textContent = describeError(error, "Generated record could not be completed; canonical state was not changed.");
        }
      });
      item.append(body, complete);
      factoryAppList.append(item);
    }
  };

  const renderFactoryGame = (): void => {
    const state = factoryGameSession.snapshot();
    const payload = state.payload as Partial<FactoryPreviewGamePayload>;
    const position = payload.position ?? 0;
    const energy = payload.energy ?? 4;
    const stars = payload.stars ?? 0;
    const layout = FACTORY_PREVIEW_GAME.boardLayout(window.innerWidth);
    factoryGameBoard.dataset.columns = String(layout.columns);
    factoryGameBoard.dataset.compact = String(layout.compact);
    factoryGameBoard.replaceChildren();
    for (let index = 0; index < 4; index += 1) {
      const cell = document.createElement("span");
      cell.className = "factory-game-cell";
      cell.textContent = index === position ? "●" : "○";
      cell.setAttribute("aria-label", `Position ${index}${index === position ? ", current" : ""}`);
      if (index === position) cell.dataset.current = "true";
      factoryGameBoard.append(cell);
    }
    factoryGameStatus.textContent = copy.factoryGameStatus(position, energy, stars, state.tick);
    factoryGamePause.textContent = state.paused ? copy.factoryGameResume : copy.factoryGamePause;
    factoryGameMove.disabled = state.paused || energy <= 0 || position >= 3;
    factoryGameCollect.disabled = state.paused || position === 0 || position % 2 !== 0 || stars >= 2;
  };

  const factoryGameDispatch = (action: "move.right" | "collect"): void => {
    try {
      factoryGameSession.dispatch(action);
      renderFactoryGame();
    } catch (error) {
      factoryGameStatus.textContent = describeError(error, "The generated game rejected that action without changing its save.");
    }
  };

  if (factoryPreviewMode) {
    factoryAppForm.replaceChildren();
    for (const field of factoryAppDefinition.fields) {
      const label = document.createElement("label");
      label.textContent = field.labels[presentation.locale] ?? field.labels["en-CA"] ?? field.id;
      const input = document.createElement("input");
      input.name = field.id;
      input.dataset.factoryField = field.id;
      input.dataset.factoryType = field.type;
      input.required = Boolean(field.required);
      input.type = field.type === "number" ? "number" : "text";
      if (field.type === "tags") input.placeholder = "tag1, tag2";
      label.htmlFor = `factory-field-${field.id}`;
      input.id = label.htmlFor;
      factoryAppForm.append(label, input);
    }
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = copy.factoryAppSave;
    factoryAppForm.append(submit);
    factoryAppForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const input: Record<string, unknown> = {};
        for (const field of factoryAppDefinition.fields) {
          const control = factoryAppForm.elements.namedItem(field.id);
          if (!(control instanceof HTMLInputElement)) continue;
          input[field.id] = field.type === "number" ? (control.value ? control.valueAsNumber : undefined) : field.type === "tags" ? control.value.split(",").map((tag) => tag.trim()).filter(Boolean) : control.value;
        }
        const record = await factoryAppRuntime.capture(input);
        factoryAppStatus.textContent = copy.factoryAppSaved(String(record.data.title ?? "record"));
        factoryAppForm.reset();
        await renderFactoryApp();
      } catch (error) {
        factoryAppStatus.textContent = describeError(error, "The generated record was not saved; canonical state was not changed.");
      }
    });
    factoryGameMove.addEventListener("click", () => factoryGameDispatch("move.right"));
    factoryGameCollect.addEventListener("click", () => factoryGameDispatch("collect"));
    factoryGamePause.addEventListener("click", () => {
      if (factoryGameSession.snapshot().paused) factoryGameSession.resume();
      else factoryGameSession.pause();
      renderFactoryGame();
    });
    factoryGameSave.addEventListener("click", async () => {
      try {
        const state = JSON.parse(factoryGameSession.save()) as Record<string, unknown>;
        await store.setPackageState({ packageId: FACTORY_PREVIEW_GAME.manifest.packageId, schemaVersion: FACTORY_PREVIEW_GAME.manifest.saveSchemaVersion, state });
        factoryGameStatus.textContent = copy.factoryGameSaved;
      } catch (error) {
        factoryGameStatus.textContent = describeError(error, "The generated game save was not retained; current state was not changed.");
      }
    });
    factoryGameLoad.addEventListener("click", async () => {
      const packageState = await store.getPackageState(FACTORY_PREVIEW_GAME.manifest.packageId);
      const legacySave = packageState ? undefined : await store.getSetting<string>("factory.preview.game.save");
      const save = packageState ? JSON.stringify(packageState.state) : legacySave;
      if (!save) {
        factoryGameStatus.textContent = copy.factoryGameLoaded;
        return;
      }
      try {
        factoryGameSession.load(save);
        if (!packageState && legacySave) {
          await store.setPackageState({ packageId: FACTORY_PREVIEW_GAME.manifest.packageId, schemaVersion: FACTORY_PREVIEW_GAME.manifest.saveSchemaVersion, state: JSON.parse(legacySave) as Record<string, unknown> });
        }
        factoryGameStatus.textContent = copy.factoryGameLoaded;
        renderFactoryGame();
      } catch (error) {
        factoryGameStatus.textContent = describeError(error, "The generated game save was incompatible; current state was retained.");
      }
    });
    void renderFactoryApp();
    renderFactoryGame();
  }

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

  const homeWidgetLabel = (id: PresentationHomeWidgetId): string => id === "summary" ? copy.currentPicture : id === "insights" ? copy.signals : timeCopy.considerationsHeading;
  const sectionIcon = (id: PresentationSectionId): string => ({ "home-summary": "⌂", capture: "✎", acquire: "↓", track: "◌", domains: "◇", search: "⌕", spaces: "▦", compose: "▤", review: "✓", relate: "↔", knowledge: "§", sharing: "⇧", sync: "⟳", focus: "◷", reminders: "!", records: "☷", recovery: "↺", presentation: "⚙" })[id];
  const presentationSections = new Map(PRESENTATION_SECTION_IDS.map((id) => [id, root.querySelector<HTMLElement>(`#${id}`)] as const));
  const movePresentationRow = (container: HTMLElement, button: HTMLButtonElement): void => {
    const row = button.closest<HTMLElement>("[data-presentation-option]");
    if (!row) return;
    if (button.dataset.direction === "up" && row.previousElementSibling) container.insertBefore(row, row.previousElementSibling);
    if (button.dataset.direction === "down" && row.nextElementSibling) container.insertBefore(row.nextElementSibling, row);
  };
  const renderLensPins = (): void => {
    lensPinOptions.replaceChildren();
    for (const id of PRESENTATION_LENS_IDS) {
      const row = document.createElement("div");
      row.dataset.presentationLens = id;
      const label = document.createElement("label");
      label.className = "check-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = presentation.lensPins.includes(id);
      checkbox.value = id;
      checkbox.dataset.presentationLensPin = "true";
      label.append(checkbox, document.createTextNode(PRESENTATION_LENS_DEFINITIONS[id].label));
      row.append(label);
      lensPinOptions.append(row);
    }
  };
  const renderLensNavigation = (): void => {
    const pinned = presentation.lensPins.slice(0, 4);
    const barLensIds = [...pinned];
    if (!barLensIds.includes(presentation.activeLens)) barLensIds.push(presentation.activeLens);
    lensNavList.replaceChildren();
    for (const id of barLensIds) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary lens-nav-button";
      button.dataset.lensId = id;
      button.textContent = PRESENTATION_LENS_DEFINITIONS[id].label;
      button.setAttribute("aria-current", id === presentation.activeLens ? "page" : "false");
      item.append(button);
      lensNavList.append(item);
    }
    lensOverflowGrid.replaceChildren();
    for (const id of PRESENTATION_LENS_IDS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary lens-grid-button";
      button.dataset.lensId = id;
      button.textContent = PRESENTATION_LENS_DEFINITIONS[id].label;
      button.setAttribute("aria-current", id === presentation.activeLens ? "page" : "false");
      lensOverflowGrid.append(button);
    }
    lensNavStatus.textContent = `${copy.lensHint} ${barLensIds.length} visible in the bar; ${PRESENTATION_LENS_IDS.length} available in ${copy.lensOverflow.toLowerCase()}.`;
  };
  const setRecordDetailSegment = (segment: string): void => {
    let selectedLabel = segment;
    for (const button of recordDetailSegments.querySelectorAll<HTMLButtonElement>("button[data-detail-segment]")) {
      const selected = button.dataset.detailSegment === segment;
      button.setAttribute("aria-selected", String(selected));
      if (selected) selectedLabel = button.textContent?.trim() || segment;
    }
    for (const panel of recordDetailDialog.querySelectorAll<HTMLElement>("[data-detail-panel]")) panel.hidden = panel.dataset.detailPanel !== segment;
    recordDetailStatus.textContent = copy.recordEditSegmentStatus(selectedLabel);
  };
  const openRecordDetail = async (recordId: string, lensId: PresentationLensId = presentation.activeLens): Promise<void> => {
    const record = await store.get(recordId, true);
    if (!record) return;
    activeRecordDetail = { recordId: record.id, revision: record.revision, lensId };
    const editable = !record.deleted && (record.recordType === "note" || record.recordType === "task" || record.recordType === "observation") && typeof record.data.text === "string";
    recordDetailEditForm.hidden = !editable;
    recordDetailEditText.value = editable ? String(record.data.text) : "";
    recordDetailEditStatus.textContent = editable ? "" : copy.recordEditUnavailable;
    const allRecords = await store.list(true);
    const recordLensIds = lensIdsForRecord(record);
    const contextLens = recordLensIds.includes(lensId) ? lensId : (recordLensIds[0] ?? lensId);
    const definition = PRESENTATION_LENS_DEFINITIONS[contextLens];
    recordDetailContext.textContent = `${copy.lenses} / ${definition.label} / ${record.owner}`;
    recordDetailHeading.textContent = `${typeLabel(record.recordType)} · revision ${record.revision}`;
    recordDetailText.textContent = recordText(record);
    recordDetailMetadata.replaceChildren();
    const metadata: Array<[string, string]> = [
      [copy.recordIdLabel, record.id],
      [copy.recordOwnerLabel, record.owner],
      [copy.recordTruthLabel, record.truthClass],
      [copy.recordSensitivityLabel, record.sensitivity],
      [copy.recordProvenanceLabel, `${record.provenance.source}${record.provenance.sourceId ? ` / ${record.provenance.sourceId}` : ""}`]
    ];
    for (const [label, value] of metadata) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      recordDetailMetadata.append(term, description);
    }
    const related = allRecords.filter((candidate) => !candidate.deleted && candidate.recordType === "relationship" && (candidate.data.sourceId === record.id || candidate.data.targetId === record.id));
    recordDetailRelationshipList.replaceChildren();
    if (related.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.noRecordRelationships;
      recordDetailRelationshipList.append(empty);
    } else {
      for (const relationship of related) {
        const item = document.createElement("li");
        item.className = "record-item";
        const otherId = relationship.data.sourceId === record.id ? relationship.data.targetId : relationship.data.sourceId;
        const relation = isDependencyLink(relationship)
          ? `${relationship.data.edgeKind}${relationship.data.scenarioId ? ` [${relationship.data.scenarioId}]` : ""}: ${relationship.data.label}`
          : typeof relationship.data.relation === "string" ? relationship.data.relation : "related";
        const label = document.createElement("span");
        label.textContent = `${relation} · ${typeof otherId === "string" ? otherId : "unknown"}`;
        item.append(label);
        if (typeof otherId === "string") {
          const open = document.createElement("button");
          open.type = "button";
          open.className = "secondary";
          open.dataset.detailRecordId = otherId;
          open.textContent = copy.openRecord;
          item.append(open);
        }
        recordDetailRelationshipList.append(item);
      }
    }
    const evidence = allRecords.filter((candidate) => !candidate.deleted && ((candidate.owner === "platform.evidence" && (candidate.data.subjectId === record.id || candidate.data.sourceId === record.id)) || (candidate.owner === "platform.annotate" && candidate.data.sourceId === record.id)));
    recordDetailEvidenceList.replaceChildren();
    if (evidence.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.noRecordEvidence;
      recordDetailEvidenceList.append(empty);
    } else {
      for (const evidenceRecord of evidence) {
        const item = document.createElement("li");
        item.className = "record-item";
        const text = document.createElement("span");
        text.textContent = `${evidenceRecord.owner} · ${recordText(evidenceRecord)}`;
        item.append(text);
        recordDetailEvidenceList.append(item);
      }
    }
    const entries = await historyWithDiffs(store, record.id);
    recordDetailHistoryList.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement("li");
      const changes = entry.changesFromPrevious.length > 0 ? entry.changesFromPrevious.map((change) => change.path).join(", ") : "initial";
      item.textContent = copy.historyEntry(entry.revision, formatDateTime(presentation.locale, entry.recordedAt), changes);
      recordDetailHistoryList.append(item);
    }
    setRecordDetailSegment("overview");
    recordDetailDialog.showModal();
  };
  const renderActiveLens = async (): Promise<void> => {
    activeLensHeading.textContent = PRESENTATION_LENS_DEFINITIONS[presentation.activeLens].label;
    activeLensStatus.textContent = presentation.lensPins.includes(presentation.activeLens) ? copy.lensPinned : copy.lensActive;
    activeLensHint.textContent = copy.lensHint;
    const records = projectLensRecords(await store.list(), presentation.activeLens).slice(0, 20);
    activeLensRecords.replaceChildren();
    if (records.length === 0) {
      const empty = document.createElement("li");
      empty.className = "record-item";
      empty.textContent = copy.lensNoRecords;
      activeLensRecords.append(empty);
      return;
    }
    for (const record of records) {
      const item = document.createElement("li");
      item.className = "record-item";
      const text = document.createElement("span");
      text.textContent = `${record.recordType} - ${recordText(record).slice(0, 160)}`;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary";
      open.dataset.lensRecordId = record.id;
      open.textContent = copy.openRecord;
      item.append(text, open);
      activeLensRecords.append(item);
    }
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
    renderLensPins();
  };
  const readOptionOrder = <T extends string>(container: HTMLElement): T[] => [...container.children].map((row) => row.getAttribute("data-presentation-option")).filter((value): value is T => typeof value === "string") ;
  const readOptionVisibility = <T extends string>(container: HTMLElement): T[] => [...container.querySelectorAll<HTMLInputElement>("input[data-presentation-visibility]:checked")].map((input) => input.value as T);
  const readLensPins = (): PresentationLensId[] => [...lensPinOptions.querySelectorAll<HTMLInputElement>("input[data-presentation-lens-pin]:checked")].map((input) => input.value as PresentationLensId);
  const isStandaloneDisplayMode = (): boolean => window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let primaryNavDisclosureInitialized = false;
  let reviewDisclosureChoice: boolean | undefined;
  let recordsDisclosureChoice: boolean | undefined;
  const applyPresentationProfile = (): void => {
    root.dataset.theme = presentation.theme;
    root.dataset.family = presentation.family;
    root.dataset.density = presentation.density;
    root.dataset.typeface = presentation.typeface;
    root.dataset.iconography = presentation.iconography;
    root.dataset.accessibilityProfile = presentation.accessibility.profile;
    root.dataset.textScale = String(presentation.accessibility.textScale);
    root.dataset.targetSize = presentation.accessibility.targetSize;
    root.dataset.reducedMotion = String(presentation.accessibility.reducedMotion);
    document.documentElement.dataset.theme = presentation.theme;
    document.documentElement.dataset.family = presentation.family;
    document.documentElement.dataset.typeface = presentation.typeface;
    document.documentElement.dataset.accessibilityProfile = presentation.accessibility.profile;
    document.documentElement.dataset.textScale = String(presentation.accessibility.textScale);
    document.documentElement.dataset.targetSize = presentation.accessibility.targetSize;
    document.documentElement.dataset.reducedMotion = String(presentation.accessibility.reducedMotion);
    document.title = `${presentation.productName} - ${copy.productHeading}`;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || (presentation.theme === "dark" ? "#000000" : "#f7f8fa");
    productLabel.textContent = `${presentation.productName} ${copy.foundation}`;
    productTagline.textContent = presentation.tagline || copy.lede;
    productName.value = presentation.productName;
    taglineInput.value = presentation.tagline;
    familyInput.value = presentation.family;
    localeInput.value = presentation.locale;
    densityInput.value = presentation.density;
    typefaceInput.value = presentation.typeface;
    iconographyInput.value = presentation.iconography;
    accessibilityProfileInput.value = presentation.accessibility.profile;
    accessibilityTextScaleInput.value = String(presentation.accessibility.textScale);
    accessibilityTargetSizeInput.value = presentation.accessibility.targetSize;
    accessibilityReducedMotionInput.checked = presentation.accessibility.reducedMotion;
    homeLabelInput.value = presentation.labels.home;
    captureLabelInput.value = presentation.labels.capture;
    recordsLabelInput.value = presentation.labels.records;
    homeLabel.textContent = presentation.labels.home || copy.home;
    captureLabel.textContent = presentation.labels.capture || copy.capture;
    recordsLabel.textContent = presentation.labels.records || copy.canonicalRecords;
    for (const [button, label] of [[editHomeLabel, homeLabel.textContent], [editCaptureLabel, captureLabel.textContent], [editRecordsLabel, recordsLabel.textContent]] as const) {
      button.setAttribute("aria-label", `${copy.editLabel}: ${label}`);
      button.setAttribute("title", `${copy.editLabel}: ${label}`);
    }
    themeToggle.textContent = presentation.theme === "dark" ? copy.themeLight : copy.themeDark;
    themeToggle.setAttribute("aria-pressed", String(presentation.theme === "dark"));
    presentationHostStatus.textContent = getInstalledMetadataStatus(presentation.locale, isStandaloneDisplayMode());
    renderPresentationOptions();
    renderLensNavigation();
    void renderActiveLens();
    if (!primaryNavDisclosureInitialized) {
      primaryNavMenu.open = !window.matchMedia("(max-width: 560px)").matches;
      primaryNavDisclosureInitialized = true;
    }
    primaryNavList.replaceChildren();
    const visible = new Set(presentation.navigation.visible);
    for (const id of presentation.navigation.order) {
      if (!visible.has(id)) continue;
      const item = document.createElement("li");
      item.className = "primary-nav-item";
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = sectionLabel(id);
      link.dataset.navIcon = sectionIcon(id);
      item.append(link);
      primaryNavList.append(item);
    }
    quickDensity.textContent = `${copy.density}: ${presentation.density === "compact" ? copy.compact : copy.comfortable}`;
    quickDensity.setAttribute("aria-label", `${copy.density}: ${presentation.density === "compact" ? copy.compact : copy.comfortable}`);
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
  const persistPresentation = async (next: PresentationProfile, status: string): Promise<void> => {
    await store.setSetting("presentation", next);
    presentation = next;
    applyPresentationProfile();
    presentationStatus.textContent = status;
  };
  let editingPresentationLabel: keyof PresentationProfile["labels"] | undefined;
  const editPresentationLabel = (key: keyof PresentationProfile["labels"], current: string): void => {
    editingPresentationLabel = key;
    presentationLabelInput.value = current;
    presentationLabelDialogStatus.textContent = "";
    presentationLabelDialog.showModal();
    presentationLabelInput.focus();
    presentationLabelInput.select();
  };
  const activateLens = async (id: PresentationLensId): Promise<void> => {
    try {
      await persistPresentation(parsePresentationProfile({ ...presentation, activeLens: id }), copy.savedName(PRESENTATION_LENS_DEFINITIONS[id].label));
      if (lensOverflowDialog.open) lensOverflowDialog.close();
      activeLensDisclosure.open = true;
      activeLensDisclosure.scrollIntoView({ block: "start" });
    } catch (error) {
      lensNavStatus.textContent = describeError(error, "Lens selection was not saved; canonical data was not changed.");
    }
  };
  for (const container of [navigationOptions, homeWidgetOptions]) container.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-direction]");
    if (button) movePresentationRow(container, button);
  });
  primaryNavList.addEventListener("click", (event) => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#']");
    const sectionId = link?.getAttribute("href")?.slice(1) as PresentationSectionId | undefined;
    if (sectionId) root.querySelector<HTMLDetailsElement>(`#${sectionId}[data-section-disclosure]`)?.setAttribute("open", "");
    if (window.matchMedia("(max-width: 560px)").matches) primaryNavMenu.open = false;
  });
  lensNavList.addEventListener("click", (event) => {
    const id = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-lens-id]")?.dataset.lensId as PresentationLensId | undefined;
    if (id) void activateLens(id);
  });
  lensOverflowGrid.addEventListener("click", (event) => {
    const id = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-lens-id]")?.dataset.lensId as PresentationLensId | undefined;
    if (id) void activateLens(id);
  });
  activeLensRecords.addEventListener("click", (event) => {
    const recordId = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-lens-record-id]")?.dataset.lensRecordId;
    if (recordId) void openRecordDetail(recordId, presentation.activeLens);
  });
  recordDetailSegments.addEventListener("click", (event) => {
    const segment = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-detail-segment]")?.dataset.detailSegment;
    if (segment) setRecordDetailSegment(segment);
  });
  recordDetailEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const detail = activeRecordDetail;
    if (!detail) return;
    try {
      const updated = await commands.updateText(detail.recordId, recordDetailEditText.value, detail.revision);
      const healthAfterEdit = await store.health();
      const message = copy.recordEditSaved(updated.revision, healthAfterEdit.searchIndexValid ? copy.healthy : copy.degraded);
      recordDetailDialog.close();
      await renderRecords(searchQuery.value);
      await openRecordDetail(updated.id, detail.lensId);
      recordDetailEditStatus.textContent = message;
    } catch (error) {
      recordDetailEditStatus.textContent = describeError(error, "Canonical text was not changed.");
    }
  });
  recordDetailDialog.addEventListener("click", (event) => {
    const recordId = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-detail-record-id]")?.dataset.detailRecordId;
    if (recordId) void openRecordDetail(recordId, presentation.activeLens);
  });
  recordDetailClose.addEventListener("click", () => recordDetailDialog.close());
  lensOverflowToggle.addEventListener("click", () => lensOverflowDialog.showModal());
  lensOverflowClose.addEventListener("click", () => lensOverflowDialog.close());
  accessibilityProfileInput.addEventListener("change", () => {
    const profile = accessibilityProfileInput.value as PresentationAccessibilityProfile;
    if (profile === "custom") return;
    const preset = accessibilityPreset(profile);
    accessibilityTextScaleInput.value = String(preset.textScale);
    accessibilityTargetSizeInput.value = preset.targetSize;
    accessibilityReducedMotionInput.checked = preset.reducedMotion;
  });
  for (const input of [accessibilityTextScaleInput, accessibilityTargetSizeInput, accessibilityReducedMotionInput]) input.addEventListener("change", () => {
    if (accessibilityProfileInput.value !== "custom") accessibilityProfileInput.value = "custom";
  });
  applyPresentationProfile();

  const rememberDisclosureChoice = (details: HTMLDetailsElement, setChoice: (choice: boolean) => void): void => {
    details.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("summary")) setChoice(!details.open);
    });
  };
  rememberDisclosureChoice(reviewDisclosure, (choice) => { reviewDisclosureChoice = choice; });
  rememberDisclosureChoice(recordsDisclosure, (choice) => { recordsDisclosureChoice = choice; });

  quickDensity.addEventListener("click", () => {
    const nextDensity = presentation.density === "compact" ? "comfortable" : "compact";
    void persistPresentation(parsePresentationProfile({ ...presentation, density: nextDensity }), copy.savedName(nextDensity)).catch((error: unknown) => {
      presentationStatus.textContent = describeError(error, "Density preference was not saved; canonical data was not changed.");
    });
  });
  editHomeLabel.addEventListener("click", () => void editPresentationLabel("home", homeLabel.textContent || copy.home));
  editCaptureLabel.addEventListener("click", () => void editPresentationLabel("capture", captureLabel.textContent || copy.capture));
  editRecordsLabel.addEventListener("click", () => void editPresentationLabel("records", recordsLabel.textContent || copy.canonicalRecords));
  presentationLabelCancel.addEventListener("click", () => {
    editingPresentationLabel = undefined;
    presentationLabelDialog.close();
  });
  presentationLabelDialogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = editingPresentationLabel;
    if (!key) return;
    const value = presentationLabelInput.value.trim().slice(0, 40);
    if (!value) {
      presentationLabelDialogStatus.textContent = copy.labelRequired;
      presentationLabelInput.focus();
      return;
    }
    try {
      await persistPresentation(parsePresentationProfile({ ...presentation, labels: { ...presentation.labels, [key]: value } }), copy.savedName(value));
      editingPresentationLabel = undefined;
      presentationLabelDialog.close();
    } catch (error) {
      presentationLabelDialogStatus.textContent = describeError(error, "Presentation label was not saved; canonical data was not changed.");
    }
  });

  const applyHomeFocusMode = (): void => {
    const homeSummary = root.querySelector<HTMLElement>("#home-summary");
    if (!homeSummary) return;
    homeSummary.dataset.focusMode = homeFocusMode ? "true" : "false";
    homeFocusToggle.setAttribute("aria-pressed", String(homeFocusMode));
    homeFocusToggle.textContent = homeFocusMode ? timeCopy.focusModeActive : timeCopy.focusMode;
  };
  applyHomeFocusMode();
  insightsDisclosure.querySelector("summary")?.addEventListener("click", () => {
    insightsDisclosure.dataset.userControlled = "true";
  });
  homeFocusToggle.addEventListener("click", async () => {
    const next = !homeFocusMode;
    try {
      await store.setSetting("home.focusMode", next);
      homeFocusMode = next;
      applyHomeFocusMode();
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Home focus mode could not be changed; canonical data was not changed.");
    }
  });

  onboardingDismiss.addEventListener("click", async () => {
    try {
      await store.setSetting("onboarding.dismissed", true);
      onboardingPanel.hidden = true;
      onboardingPanel.open = false;
      onboardingShow.hidden = false;
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "The getting-started guide could not be dismissed; canonical data was not changed.");
    }
  });
  onboardingShow.addEventListener("click", () => {
    onboardingPanel.hidden = false;
    onboardingPanel.open = true;
    onboardingShow.hidden = true;
    onboardingDismiss.focus();
  });

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

  const cleanupRecipe = (): CleanupRecipe => {
    const operations: CleanupRecipe["operations"] = [];
    if (cleanupTrim.checked) operations.push({ kind: "TRIM_TEXT" });
    if (cleanupWhitespace.checked) operations.push({ kind: "NORMALIZE_WHITESPACE" });
    if (operations.length === 0) throw new Error("Choose at least one cleanup operation");
    return { schemaVersion: 1, recipeId: "acquire.safe-text-v1", name: "Acquire safe text cleanup", operations };
  };

  const cleanupInputRecords = async (): Promise<Awaited<ReturnType<CanonicalStore["list"]>>> => {
    const records = await store.list();
    return records.filter((record) => record.owner !== "platform.space" && !isCleanupHistoryRecord(record) && (!cleanupImportedOnly.checked || record.provenance.source === "IMPORT"));
  };

  const cleanupProposalLabel = (kind: CleanupPreview["proposals"][number]["kind"]): string => kind === "TRANSFORM" ? copy.cleanupTransform : kind === "EXACT_DUPLICATE" ? copy.cleanupDuplicate : copy.cleanupAmbiguous;

  const renderCleanupPreview = async (preview: CleanupPreview): Promise<void> => {
    const records = await store.list(true);
    const recordsById = new Map(records.map((record) => [record.id, record]));
    cleanupPreviewOutput.hidden = false;
    cleanupSummary.textContent = copy.cleanupStatus(preview.recordIds.length, preview.sourceGroups.length, preview.proposals.length);
    cleanupSources.replaceChildren();
    for (const source of preview.sourceGroups) {
      const item = document.createElement("li");
      item.className = "record-item";
      item.textContent = `${source.sourceId}: ${source.recordIds.length} record(s)`;
      cleanupSources.append(item);
    }
    cleanupProposals.replaceChildren();
    if (preview.proposals.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.cleanupEmpty;
      cleanupProposals.append(empty);
    }
    for (const proposal of preview.proposals) {
      const item = document.createElement("li");
      item.className = "record-item";
      item.dataset.cleanupProposalId = proposal.proposalId;
      item.dataset.cleanupProposalKind = proposal.kind;
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${cleanupProposalLabel(proposal.kind)} - ${proposal.recordIds.join(", ")}`;
      const reason = document.createElement("p");
      reason.textContent = proposal.reason;
      const sources = document.createElement("small");
      sources.textContent = `Source(s): ${proposal.sourceIds.join(", ")}`;
      content.append(title, reason, sources);
      item.append(content);
      if (proposal.kind === "TRANSFORM") {
        const label = document.createElement("label");
        label.className = "check-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.dataset.cleanupTransform = proposal.proposalId;
        label.append(input, document.createTextNode(`${proposal.beforeText ?? ""} -> ${proposal.afterText ?? ""}`));
        item.append(label);
      } else if (proposal.kind === "EXACT_DUPLICATE") {
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = copy.cleanupArchive;
        fieldset.append(legend);
        for (const recordId of proposal.recordIds) {
          const label = document.createElement("label");
          label.className = "check-row";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.dataset.cleanupArchiveId = recordId;
          const sourceRecord = recordsById.get(recordId);
          label.append(input, document.createTextNode(`${recordId}: ${sourceRecord ? recordText(sourceRecord) : "record unavailable"}`));
          fieldset.append(label);
        }
        item.append(fieldset);
      } else {
        const label = document.createElement("label");
        label.className = "check-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.dataset.cleanupReview = proposal.proposalId;
        label.append(input, document.createTextNode(copy.cleanupMarkReview));
        item.append(label);
      }
      cleanupProposals.append(item);
    }
    cleanupApplyButton.disabled = preview.proposals.length === 0;
  };

  const readCleanupDecisions = (): CleanupDecision[] => {
    const decisions: CleanupDecision[] = [];
    cleanupProposals.querySelectorAll<HTMLInputElement>("input[data-cleanup-transform]:checked").forEach((input) => decisions.push({ proposalId: input.dataset.cleanupTransform ?? "", action: "APPLY_TRANSFORM" }));
    cleanupProposals.querySelectorAll<HTMLElement>('[data-cleanup-proposal-kind="EXACT_DUPLICATE"]').forEach((item) => {
      const proposalId = item.dataset.cleanupProposalId ?? "";
      const archiveRecordIds = [...item.querySelectorAll<HTMLInputElement>("input[data-cleanup-archive-id]:checked")].map((input) => input.dataset.cleanupArchiveId).filter((id): id is string => Boolean(id));
      if (archiveRecordIds.length > 0) decisions.push({ proposalId, action: "ARCHIVE_EXACT_DUPLICATE", archiveRecordIds });
    });
    cleanupProposals.querySelectorAll<HTMLInputElement>("input[data-cleanup-review]:checked").forEach((input) => decisions.push({ proposalId: input.dataset.cleanupReview ?? "", action: "MARK_REVIEW" }));
    return decisions;
  };

  const renderCleanupHistory = async (): Promise<void> => {
    const records = await store.list(true);
    const groups = new Map<string, typeof records>();
    for (const record of records.filter(isCleanupHistoryRecord)) {
      const historyId = typeof record.data.historyId === "string" ? record.data.historyId : record.id;
      const group = groups.get(historyId) ?? [];
      group.push(record);
      groups.set(historyId, group);
    }
    cleanupHistoryList.replaceChildren();
    cleanupHistoryEmpty.hidden = groups.size > 0;
    for (const group of [...groups.values()].sort((left, right) => String(right[0]?.data.acceptedAt ?? "").localeCompare(String(left[0]?.data.acceptedAt ?? "")))) {
      const first = group[0];
      if (!first) continue;
      const historyId = typeof first.data.historyId === "string" ? first.data.historyId : first.id;
      const item = document.createElement("li");
      item.className = "record-item";
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = copy.cleanupHistoryEntry(String(first.data.recipeId ?? "recipe"), String(first.data.acceptedAt ?? ""), Number(first.data.inputCount ?? 0), Number(first.data.updatedCount ?? 0), Number(first.data.archivedCount ?? 0), Number(first.data.reviewCount ?? 0), Number(first.data.chunkCount ?? group.length));
      details.append(summary);
      const payload = reconstructCleanupHistory(records, historyId);
      const fingerprint = document.createElement("p");
      fingerprint.className = "hint";
      fingerprint.textContent = payload ? `Replay fingerprint: ${payload.receipt.replayFingerprint}` : "Receipt is incomplete or invalid; source records were not silently changed by this view.";
      details.append(fingerprint);
      item.append(details);
      cleanupHistoryList.append(item);
    }
  };

  const scopedRecords = async (includeDeleted = false): Promise<Awaited<ReturnType<CanonicalStore["list"]>>> => {
    const records = await store.list(includeDeleted);
    const visible = activeSpace ? await spaceService.project(records, activeSpace) : records;
    return visible.filter((record) => record.owner !== "platform.space" && !isCleanupHistoryRecord(record));
  };

  const refreshCapabilityStatus = (): void => {
    const degradedCapabilities = (capabilityRuntime?.snapshot() ?? []).filter((status) => status.state === "DEGRADED");
    capabilityStatus.textContent = degradedCapabilities.length === 0 ? copy.local : `${copy.local} - ${degradedCapabilities.length} degraded`;
    capabilityStatus.title = degradedCapabilities.length === 0 ? "Core capabilities are ready." : degradedCapabilities.map((status) => `${status.id}: ${status.reason ?? "degraded"}`).join("; ");
  };
  const projectHealthTelemetry = (health: Awaited<ReturnType<CanonicalStore["health"]>>): ReturnType<typeof projectTelemetry> => {
    const input = telemetryPreviewMode ? makeTelemetryPreviewInput(telemetryPreviewMode) : {
      replication: { enabled: false },
      backup: "UNKNOWN" as const,
      pendingEffects: health.pendingEffects,
      degradedCapabilities: capabilityRuntime ? capabilityRuntime.snapshot().filter((status) => status.state === "DEGRADED").map((status) => status.id) : "UNKNOWN" as const,
      unresolvedConflicts: "UNKNOWN" as const,
      storagePressure: health.storage?.pressure ?? "UNKNOWN" as const
    };
    const snapshot = projectTelemetry({ ...input, thresholds: telemetryThresholds });
    if (!telemetryPreviewMode) return snapshot;
    return {
      ...snapshot,
      facts: snapshot.facts.map((fact) => ({ ...fact, evidence: [...fact.evidence, `synthetic loopback preview: ${telemetryPreviewMode}`] }))
    };
  };
  const formatHealth = (health: Awaited<ReturnType<CanonicalStore["health"]>>): string => {
    const telemetry = projectHealthTelemetry(health);
    const status = telemetry.facts.map((fact) => fact.status);
    const previewNotice = telemetryPreviewMode ? ` Telemetry preview ${telemetryPreviewMode}: synthetic loopback state; canonical data unchanged.` : "";
    return `${copy.healthMessage(health.activeRecords, health.archivedRecords, health.historyEntries, health.artifactPayloads, health.searchIndexValid ? copy.healthy : copy.degraded, health.storage?.pressure)} ${copy.telemetryMessage(status[0] ?? "UNKNOWN", status[1] ?? "UNKNOWN", status[2] ?? "UNKNOWN", status[3] ?? "UNKNOWN", status[4] ?? "UNKNOWN", status[5] ?? "UNKNOWN")} ${getStoragePersistenceNotice(presentation.locale, health.storage?.persistence ?? "UNAVAILABLE")}${previewNotice}`;
  };
  refreshCapabilityStatus();

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
        if (!await requestConfirmation(copy.removeSpaceConfirmation(space.name), copy.removeSpace)) return;
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
    const records = (await store.list()).filter((record) => record.owner !== "platform.space" && !isCleanupHistoryRecord(record));
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
        if (!await requestConfirmation(copy.removeMembershipConfirmation(recordText(source), spaceLabel(membership.data.space)), copy.removeMembership)) return;
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
    if (view.space) records = (await spaceService.project(await store.list(), view.space)).filter((record) => record.owner !== "platform.space" && !isCleanupHistoryRecord(record));
    const scopedIds = new Set(records.map((record) => record.id));
    if (view.searchQuery) {
      const parsedQuery = parseSearchQuery(view.searchQuery);
      const candidates = parsedQuery.text ? await store.search(parsedQuery.text, scopedIds) : records;
      records = candidates.filter((record) => scopedIds.has(record.id) && matchesSearchFacets(record, parsedQuery.facets));
    }
    const viewForProjection = structuredClone(view);
    delete viewForProjection.space;
    delete viewForProjection.searchQuery;
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

  const renderTelemetryThresholdEditor = (): HTMLDetailsElement => {
    const details = document.createElement("details");
    details.className = "telemetry-thresholds";
    const summary = document.createElement("summary");
    summary.textContent = timeCopy.telemetryThresholds;
    details.append(summary);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = timeCopy.telemetryThresholdHint;
    details.append(hint);
    const form = document.createElement("form");
    form.className = "form-row telemetry-threshold-form";
    const backupAge = document.createElement("input");
    backupAge.type = "number";
    backupAge.min = "1";
    backupAge.max = "365";
    backupAge.step = "1";
    backupAge.required = true;
    backupAge.value = String(Math.max(1, Math.round(telemetryThresholds.backupMaxAgeMs / (24 * 60 * 60 * 1000))));
    backupAge.setAttribute("aria-label", timeCopy.telemetryBackupAge);
    const backupLabel = document.createElement("label");
    backupLabel.textContent = timeCopy.telemetryBackupAge;
    backupLabel.append(backupAge);
    const outbox = document.createElement("input");
    outbox.type = "number";
    outbox.min = "1";
    outbox.max = "100000";
    outbox.step = "1";
    outbox.required = true;
    outbox.value = String(telemetryThresholds.pendingEffects);
    outbox.setAttribute("aria-label", timeCopy.telemetryOutboxThreshold);
    const outboxLabel = document.createElement("label");
    outboxLabel.textContent = timeCopy.telemetryOutboxThreshold;
    outboxLabel.append(outbox);
    const conflicts = document.createElement("input");
    conflicts.type = "number";
    conflicts.min = "1";
    conflicts.max = "100000";
    conflicts.step = "1";
    conflicts.required = true;
    conflicts.value = String(telemetryThresholds.unresolvedConflicts);
    conflicts.setAttribute("aria-label", timeCopy.telemetryConflictThreshold);
    const conflictsLabel = document.createElement("label");
    conflictsLabel.textContent = timeCopy.telemetryConflictThreshold;
    conflictsLabel.append(conflicts);
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "secondary";
    save.textContent = timeCopy.telemetrySaveThresholds;
    const status = document.createElement("span");
    status.className = "hint";
    status.setAttribute("role", "status");
    form.append(backupLabel, outboxLabel, conflictsLabel, save, status);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const next = parseTelemetryThresholds({
        backupMaxAgeMs: Number(backupAge.value) * 24 * 60 * 60 * 1000,
        pendingEffects: Number(outbox.value),
        unresolvedConflicts: Number(conflicts.value)
      });
      try {
        telemetryThresholds = next;
        await store.setSetting(TELEMETRY_THRESHOLDS_SETTING, next);
        status.textContent = timeCopy.telemetryThresholdsSaved;
        await renderRecords(searchQuery.value);
      } catch (error) {
        status.textContent = describeError(error, "Telemetry thresholds could not be saved; durable state was not changed.");
      }
    });
    details.append(form);
    return details;
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
    const finance = projectFinanceState(records, { changedIds: financeChangedIds });
    const appendFinanceInsight = (label: string, value: string): void => {
      const card = document.createElement("div");
      card.className = "summary-item";
      const labelElement = document.createElement("span");
      labelElement.textContent = label;
      const valueElement = document.createElement("strong");
      valueElement.textContent = value;
      card.append(labelElement, valueElement);
      insightsGrid.append(card);
    };
    const allocationConflicts = finance.financeAllocationResults.reduce((total, entry) => total + entry.result.conflictIds.length, 0);
    const goalConflicts = finance.financeGoalPlans.filter((entry) => entry.plan.fundingConflict).length;
    const goalProgress = finance.financeGoalPlans.map((entry) => copy.financeGoalProgress(finance.financeGraph.nodes.find((node) => node.id === entry.recordId)?.label ?? entry.recordId, formatMoney(entry.plan.funded, presentation.locale), formatMoney(entry.plan.target, presentation.locale), formatMoney(entry.plan.remaining, presentation.locale), entry.plan.fundingConflict)).join(" ");
    const funding = finance.financeFundingAnalysis;
    const fundingAlternative = funding?.alternatives[0];
    const fundingStatus = funding?.fundingConflict ? copy.financeFundingStatus(formatMoney(funding.aggregateShortfall, presentation.locale), Object.keys(fundingAlternative?.shortfallByGoal ?? {}).length || finance.financeGoalPlans.length, funding.alternatives.length, funding.hardConstraintConflict) : "";
    const crossDomainStatus = finance.crossDomain.travelPlans.length > 0 || finance.crossDomain.compensationChanges.length > 0 || finance.crossDomain.limitations.length > 0
      ? copy.financeCrossDomainStatus(finance.crossDomain.travelPlans.length, finance.crossDomain.compensationChanges.length, Object.keys(finance.crossDomain.cashFlowByMonth).length, finance.crossDomain.affectedFinanceIds.length, finance.crossDomain.limitations.length)
      : "";
    const fireStatus = finance.fireScenarios.length > 0 || finance.fireScenarioLimitations.length > 0
      ? copy.financeFireStatus(finance.fireScenarios.length, finance.fireScenarioLimitations.length)
      : "";
    const appendFundingReview = (analysis: NonNullable<typeof funding>): void => {
      if (!analysis.fundingConflict || analysis.alternatives.length === 0) return;
      const goalEntries = new Map(finance.financeGoalPlans.map((entry) => [entry.recordId, entry]));
      const details = document.createElement("details");
      details.className = "finance-funding-review";
      const summary = document.createElement("summary");
      summary.textContent = copy.financeFundingReview(analysis.alternatives.length);
      details.append(summary);
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = copy.financeFundingReviewHint;
      details.append(hint);
      const alternatives = document.createElement("ul");
      alternatives.className = "finance-funding-alternatives";
      for (const alternative of analysis.alternatives) {
        const item = document.createElement("li");
        item.className = "finance-funding-alternative";
        const heading = document.createElement("strong");
        heading.textContent = copy.financeFundingAlternative(alternative.label, formatMoney(alternative.totalMonthlyContribution, presentation.locale), Object.keys(alternative.shortfallByGoal).length);
        item.append(heading);
        const contributions = document.createElement("ul");
        contributions.className = "finance-funding-contributions";
        for (const [goalId, amount] of Object.entries(alternative.monthlyContributions).sort(([left], [right]) => left.localeCompare(right))) {
          const contribution = document.createElement("li");
          const goal = goalEntries.get(goalId);
          contribution.textContent = copy.financeFundingContribution(finance.financeGraph.nodes.find((node) => node.id === goalId)?.label ?? goalId, formatMoney(amount, presentation.locale), goal?.hardConstraint ?? false);
          contributions.append(contribution);
        }
        item.append(contributions);
        const shortfallEntries = Object.entries(alternative.shortfallByGoal).sort(([left], [right]) => left.localeCompare(right));
        if (shortfallEntries.length > 0) {
          const shortfalls = document.createElement("ul");
          shortfalls.className = "finance-funding-shortfalls";
          for (const [goalId, amount] of shortfallEntries) {
            const shortfall = document.createElement("li");
            shortfall.textContent = copy.financeFundingShortfall(finance.financeGraph.nodes.find((node) => node.id === goalId)?.label ?? goalId, formatMoney(amount, presentation.locale));
            shortfalls.append(shortfall);
          }
          item.append(shortfalls);
        }
        alternatives.append(item);
      }
      details.append(alternatives);
      insightsGrid.append(details);
    };
    if (finance.summary) {
      appendFinanceInsight(`${copy.financeDashboard} · ${finance.summary.currency} · ${copy.financeIncome}`, formatMoney(finance.summary.postedIncome, presentation.locale));
      appendFinanceInsight(copy.financeSpending, formatMoney(finance.summary.postedSpending, presentation.locale));
      appendFinanceInsight(copy.financeNet, formatMoney(finance.summary.netCashFlow, presentation.locale));
      appendFinanceInsight(copy.financePending, formatMoney(finance.summary.pendingNet, presentation.locale));
      const financeStatus = document.createElement("p");
      financeStatus.className = "hint";
      financeStatus.textContent = `${copy.financeQuality(finance.quality.status, finance.quality.limitations.length)} ${copy.financeReviewCases(finance.reviewCases.length)} ${copy.financeGraphStatus(finance.financeGraph.nodes.length, finance.financeGraph.edges.length, finance.invalidatedFinanceIds.length)} ${copy.financeAllocationConflicts(allocationConflicts)} ${copy.financeGoalStatus(finance.financeGoalPlans.length, goalConflicts)} ${copy.financeTransferStatus(finance.transferAnalysis.matches.length, finance.transferAnalysis.unmatchedTransactionIds.length)} ${crossDomainStatus} ${fundingStatus} ${fireStatus} ${goalProgress}`;
      insightsGrid.append(financeStatus);
      if (funding) appendFundingReview(funding);
    } else if (finance.transactionCount === 0 && finance.financeGraph.nodes.length === 0) {
      const financeStatus = document.createElement("p");
      financeStatus.className = "hint";
      financeStatus.textContent = `${copy.financeNoData} ${crossDomainStatus}`;
      insightsGrid.append(financeStatus);
    } else {
      const financeStatus = document.createElement("p");
      financeStatus.className = "hint";
      financeStatus.textContent = `${copy.financeNoData} ${copy.financeGraphStatus(finance.financeGraph.nodes.length, finance.financeGraph.edges.length, finance.invalidatedFinanceIds.length)} ${copy.financeAllocationConflicts(allocationConflicts)} ${copy.financeGoalStatus(finance.financeGoalPlans.length, goalConflicts)} ${copy.financeTransferStatus(finance.transferAnalysis.matches.length, finance.transferAnalysis.unmatchedTransactionIds.length)} ${crossDomainStatus} ${fundingStatus} ${fireStatus} ${goalProgress}`;
      insightsGrid.append(financeStatus);
      if (funding) appendFundingReview(funding);
    }
    if (insightsDisclosure.dataset.userControlled !== "true") {
      insightsDisclosure.open = openTasks > 0 || finance.reviewCases.length > 0 || allocationConflicts > 0 || goalConflicts > 0 || Boolean(funding?.fundingConflict);
    }
    const considerations = projectDueReminderConsiderations(records);
    attentionPanel.replaceChildren();
    if (considerations.length > 0) {
      const list = document.createElement("ul");
      list.className = "attention-list";
      for (const consideration of considerations) {
        const item = document.createElement("li");
        item.className = "consideration-item";
        const title = document.createElement("strong");
        title.textContent = consideration.title;
        const source = document.createElement("p");
        source.className = "consideration-detail";
        const sourceLabel = document.createElement("span");
        sourceLabel.textContent = `${timeCopy.sourceEvidence}: ${consideration.evidenceCount} `;
        const sourceLink = document.createElement("a");
        sourceLink.href = "#records";
        sourceLink.textContent = timeCopy.reminders;
        sourceLink.title = consideration.recordId;
        source.append(sourceLabel, sourceLink);
        const uncertainty = document.createElement("p");
        uncertainty.className = "consideration-detail";
        uncertainty.textContent = `${timeCopy.uncertainty}: ${consideration.uncertainty}`;
        const why = document.createElement("p");
        why.className = "consideration-detail";
        why.textContent = `${timeCopy.whyAppeared}: ${timeCopy.whyDueOnResume} ${timeCopy.deliveryLimited}`;
        const actions = document.createElement("div");
        actions.className = "consideration-actions";
        const snooze = document.createElement("button");
        snooze.type = "button";
        snooze.className = "secondary";
        snooze.textContent = timeCopy.snooze;
        snooze.addEventListener("click", async () => {
          const current = await commands.get(consideration.recordId);
          if (!current) return;
          try {
            await commands.update(current.id, { ...current.data, dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), status: "OPEN" }, current.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            healthStatus.textContent = describeError(error, "The consideration could not be snoozed; canonical data was not changed.");
          }
        });
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "icon-button";
        dismiss.textContent = timeCopy.dismiss;
        dismiss.addEventListener("click", async () => {
          const current = await commands.get(consideration.recordId);
          if (!current) return;
          try {
            await commands.update(current.id, { ...current.data, status: "DONE" }, current.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            healthStatus.textContent = describeError(error, "The consideration could not be dismissed; canonical data was not changed.");
          }
        });
        actions.append(snooze, dismiss);
        item.append(title, source, uncertainty, why, actions);
        list.append(item);
      }
      attentionPanel.append(list);
    }
    const telemetryItems = projectTelemetryConsiderations(projectHealthTelemetry(await store.health()), telemetryDispositions);
    if (telemetryItems.length > 0) {
      const telemetryList = document.createElement("ul");
      telemetryList.className = "attention-list telemetry-list";
      for (const item of telemetryItems) {
        const entry = document.createElement("li");
        entry.className = "consideration-item telemetry-item";
        entry.dataset.telemetryFact = item.fact.id;
        entry.dataset.disposition = item.disposition;
        const title = document.createElement("strong");
        title.textContent = `${timeCopy.telemetry}: ${item.fact.id}`;
        const state = document.createElement("p");
        state.className = "consideration-detail";
        state.textContent = timeCopy.telemetryState(item.fact.id, item.fact.status);
        const evidence = document.createElement("p");
        evidence.className = "consideration-detail";
        evidence.textContent = `${timeCopy.telemetryEvidence}: ${item.fact.evidence.join("; ")}`;
        const disposition = document.createElement("p");
        disposition.className = "consideration-detail";
        disposition.textContent = item.disposition === "DISMISSED" ? timeCopy.telemetryDismiss : timeCopy.considerations;
        const action = document.createElement("button");
        action.type = "button";
        action.className = item.disposition === "DISMISSED" ? "secondary" : "icon-button";
        action.textContent = item.disposition === "DISMISSED" ? timeCopy.telemetryRestore : timeCopy.telemetryDismiss;
        action.addEventListener("click", async () => {
          try {
            const next = { ...telemetryDispositions };
            if (item.disposition === "DISMISSED") delete next[item.fact.id];
            else next[item.fact.id] = { fingerprint: item.fingerprint, state: "DISMISSED", changedAt: new Date().toISOString() };
            telemetryDispositions = parseTelemetryDispositions(next);
            await store.setSetting(TELEMETRY_DISPOSITIONS_SETTING, telemetryDispositions);
            await renderRecords(searchQuery.value);
          } catch (error) {
            healthStatus.textContent = describeError(error, "Telemetry disposition could not be saved; durable state was not changed.");
          }
        });
        const actions = document.createElement("div");
        actions.className = "consideration-actions";
        actions.append(action);
        entry.append(title, state, evidence, disposition, actions);
        telemetryList.append(entry);
      }
      attentionPanel.append(telemetryList);
    }
    if (considerations.length === 0 && telemetryItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = timeCopy.noDue;
      attentionPanel.append(empty);
    }
    attentionPanel.append(renderTelemetryThresholdEditor());
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

  const syncTriageBatchControls = (): void => {
    const visibleIds = [...visibleTriageRecords.keys()];
    for (const id of selectedTriageIds) if (!visibleTriageRecords.has(id)) selectedTriageIds.delete(id);
    const selectedCount = selectedTriageIds.size;
    triageBatch.hidden = visibleIds.length === 0;
    triageSelected.textContent = copy.triageSelected(selectedCount);
    triageBatchReview.disabled = selectedCount === 0;
    triageBatchDefer.disabled = selectedCount === 0;
    triageSelectAll.checked = visibleIds.length > 0 && selectedCount === visibleIds.length;
    triageSelectAll.indeterminate = selectedCount > 0 && selectedCount < visibleIds.length;
    if (!triageBatchDeferUntil.value) triageBatchDeferUntil.value = new Date(Date.now() + 24 * 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
  };

  const renderReviewTemplates = async (): Promise<void> => {
    const stored = await store.getSetting<unknown>(REVIEW_SESSION_SETTING);
    reviewSession = isReviewSession(stored) ? stored : undefined;
    reviewTemplates.open = reviewSessionOpen && Boolean(reviewSession);
    reviewTemplateButtons.replaceChildren();
    for (const template of REVIEW_TEMPLATES) {
      const start = document.createElement("button");
      start.type = "button";
      start.className = "secondary";
      start.textContent = `${copy.reviewStart}: ${copy.reviewTemplateName(template.id)}`;
      start.addEventListener("click", async () => {
        reviewSession = makeReviewSession(template.id);
        reviewSessionOpen = true;
        await store.setSetting(REVIEW_SESSION_SETTING, reviewSession);
        await renderReviewTemplates();
      });
      reviewTemplateButtons.append(start);
    }
    if (reviewSession && reviewSession.stepIndex < getReviewTemplate(reviewSession.templateId).stepCount) {
      const resume = document.createElement("button");
      resume.type = "button";
      resume.className = "secondary";
      resume.textContent = `${copy.reviewResume}: ${copy.reviewTemplateName(reviewSession.templateId)}`;
      resume.addEventListener("click", async () => {
        reviewSessionOpen = true;
        await renderReviewTemplates();
      });
      reviewTemplateButtons.append(resume);
    }
    reviewStepper.hidden = !reviewSessionOpen || !reviewSession;
    if (!reviewSessionOpen || !reviewSession) return;
    const session = reviewSession;
    const template = getReviewTemplate(session.templateId);
    const complete = session.stepIndex >= template.stepCount;
    reviewStepperHeading.textContent = copy.reviewTemplateName(template.id);
    reviewStepperProgress.textContent = copy.reviewStep(Math.min(session.stepIndex + 1, template.stepCount), template.stepCount);
    reviewStepperMotivation.textContent = copy.reviewMotivation;
    reviewStepperRecords.replaceChildren();
    reviewStepperSkip.hidden = complete;
    reviewStepperNext.disabled = complete;
    reviewStepperNext.textContent = session.stepIndex === template.stepCount - 1 ? copy.reviewFinish : copy.reviewNext;
    if (complete) {
      reviewStepperPrompt.textContent = copy.reviewCompleted;
      reviewStepperStatus.textContent = copy.reviewCompleted;
      return;
    }
    reviewStepperPrompt.textContent = copy.reviewPrompt(template.promptKeys[session.stepIndex] ?? "next");
    reviewStepperStatus.textContent = copy.reviewPartial;
    const motivating = (await scopedRecords()).filter((record) => !record.deleted && record.recordType !== "relationship").slice(0, 3);
    if (motivating.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.reviewNoRecords;
      reviewStepperRecords.append(empty);
      return;
    }
    for (const record of motivating) {
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = typeLabel(record.recordType);
      const text = document.createElement("p");
      text.textContent = recordText(record);
      const meta = document.createElement("small");
      meta.textContent = `${record.owner} - revision ${record.revision}`;
      content.append(title, text, meta);
      const actions = document.createElement("div");
      actions.className = "triage-actions";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary";
      open.textContent = copy.reviewOpenRecord;
      open.addEventListener("click", () => { void openRecordDetail(record.id); });
      actions.append(open);
      if (recordTriageStatus(record) !== "REVIEWED") {
        const review = document.createElement("button");
        review.type = "button";
        review.className = "icon-button";
        review.textContent = copy.reviewMarkReviewed;
        review.addEventListener("click", async () => {
          try {
            const current = await commands.get(record.id);
            if (!current || current.deleted) throw new Error("The motivating record is no longer available");
            const { triageDisposition: _previousDisposition, triageDeferredUntil: _previousDeferredUntil, ...dataWithoutTriage } = current.data;
            await commands.update(current.id, { ...dataWithoutTriage, triageStatus: "REVIEWED" }, current.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            reviewStepperStatus.textContent = describeError(error, "Review update failed; canonical data was not changed.");
          }
        });
        actions.append(review);
      }
      if (record.recordType === "task" && !isCompletedTask(record)) {
        const completeTask = document.createElement("button");
        completeTask.type = "button";
        completeTask.className = "icon-button complete-button";
        completeTask.textContent = copy.reviewCompleteTask;
        completeTask.addEventListener("click", async () => {
          try {
            const current = await commands.get(record.id);
            if (!current || current.deleted || current.recordType !== "task") throw new Error("The motivating task is no longer available");
            await commands.update(current.id, { ...current.data, status: "DONE" }, current.revision);
            await renderRecords(searchQuery.value);
          } catch (error) {
            reviewStepperStatus.textContent = describeError(error, "Task completion failed; canonical data was not changed.");
          }
        });
        actions.append(completeTask);
      }
      item.append(content, actions);
      reviewStepperRecords.append(item);
    }
  };

  reviewStepperNext.addEventListener("click", async () => {
    const session = reviewSession;
    if (!session) return;
    reviewSession = advanceReviewSession(session);
    await store.setSetting(REVIEW_SESSION_SETTING, reviewSession);
    await renderReviewTemplates();
  });
  reviewStepperSkip.addEventListener("click", async () => {
    const session = reviewSession;
    if (!session) return;
    reviewSession = advanceReviewSession(session, true);
    await store.setSetting(REVIEW_SESSION_SETTING, reviewSession);
    await renderReviewTemplates();
  });
  reviewStepperAbandon.addEventListener("click", async () => {
    reviewSessionOpen = false;
    await renderReviewTemplates();
  });

  const renderReview = async (): Promise<void> => {
    const scoped = await scopedRecords();
    const now = Date.now();
    const records = scoped.filter((record) => {
      if (recordTriageStatus(record) === "REVIEWED") return false;
      const deferredUntil = recordTriageDeferredUntil(record);
      return !deferredUntil || Date.parse(deferredUntil) <= now;
    });
    visibleTriageRecords = new Map(records.map((record) => [record.id, record]));
    const linkTargets = scoped.filter((record) => record.recordType !== "relationship");
    reviewList.replaceChildren();
    reviewCount.textContent = formatNumber(presentation.locale, records.length);
    reviewEmpty.hidden = records.length > 0;
    if (reviewDisclosureChoice === undefined && records.length > 0) reviewDisclosure.open = true;
    for (const record of [...records].reverse()) {
      const item = document.createElement("li");
      item.className = "record-item";
      const selectLabel = document.createElement("label");
      selectLabel.className = "check-row triage-select-row";
      const select = document.createElement("input");
      select.type = "checkbox";
      select.checked = selectedTriageIds.has(record.id);
      select.setAttribute("aria-label", copy.triageSelectItem(recordText(record)));
      select.addEventListener("change", () => {
        if (select.checked) selectedTriageIds.add(record.id);
        else selectedTriageIds.delete(record.id);
        syncTriageBatchControls();
      });
      selectLabel.append(select, copy.triageSelectItem(recordText(record)));
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
      const details = document.createElement("details");
      const detailsSummary = document.createElement("summary");
      detailsSummary.textContent = copy.triageDetails;
      const provenance = document.createElement("p");
      provenance.className = "hint";
      const sourceId = record.provenance.sourceId ? `; source ${record.provenance.sourceId}` : "";
      provenance.textContent = `${copy.triageProvenance(record.provenance.source, record.provenance.capturedAt, record.owner, record.revision)}${sourceId}`;
      details.append(detailsSummary, provenance, proposalText);
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
          startArchiveUndo(record.id);
        } catch (error) {
          triageStatusMessage.textContent = describeError(error, "Triage archive failed; canonical data was not changed.");
        }
      });
      actions.append(archive);
      item.append(selectLabel, text, details, actions);
      reviewList.append(item);
    }
    syncTriageBatchControls();
  };

  const updateTypedRelationshipControls = (): void => {
    const typed = relateKind.value !== "REFERENCE";
    relateScenario.disabled = !typed;
    relateScenario.required = relateKind.value === "FEEDBACK";
    relateAllocationMode.disabled = relateKind.value !== "ALLOCATION";
    relateAllocationAmount.disabled = relateKind.value !== "ALLOCATION";
    relateAllocationCurrency.disabled = relateKind.value !== "ALLOCATION";
  };

  relateKind.addEventListener("change", updateTypedRelationshipControls);
  updateTypedRelationshipControls();

  const updateFinancePlanControls = (): void => {
    const goal = financePlanKind.value === "goal";
    financePlanDate.disabled = !goal;
    financePlanSurplus.disabled = !goal;
    financePlanHardConstraint.disabled = !goal;
    if (!goal) financePlanHardConstraint.checked = false;
  };
  financePlanKind.addEventListener("change", updateFinancePlanControls);
  updateFinancePlanControls();

  const renderRelationshipChoices = async (): Promise<void> => {
    const records = (await store.list()).filter((record) => record.recordType !== "relationship" && !isCleanupHistoryRecord(record));
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
    const records = (await store.list()).filter((record) => record.owner !== "platform.space" && !isCleanupHistoryRecord(record));
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
    for (const record of records.filter((candidate) => !isCleanupHistoryRecord(candidate))) {
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
    contextExportButton.disabled = !hasSelection || !shareGrant.value;
    contextExportRerunButton.disabled = !savedContextProfile || !shareGrant.value;
  };

  const renderShareChoices = async (): Promise<void> => {
    const selected = new Set(selectedShareIds());
    const records = (await store.list()).filter((record) => record.owner !== "platform.space" && record.owner !== "platform.share" && !isCleanupHistoryRecord(record));
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
          if (!await requestConfirmation(`${copy.effectCancel}?`, copy.effectOutboxHeading)) return;
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

  const runEffectRevocationPreview = async (): Promise<void> => {
    if (!effectRevocationPreviewMode) return;
    const phaseSetting = "effect.preview.revocation.phase";
    const phase = await store.getSetting<string>(phaseSetting);
    if (phase === undefined) {
      const broker = new CredentialKeyBroker();
      const metadata = broker.issue("fixture-material", { provider: "qualification", scope: ["effect.execute"], audience: "local-preview" });
      const operation = {
        ...createExternalEffect({
          destination: "http://localhost:1/__omnevum/credential-revocation",
          purpose: "browser credential revocation qualification",
          payloadOrReference: { fixture: "credential-revocation", phase: "preview" },
          authorization: { authority: "local-user", permission: "effect.execute", space: "personal", disclosureClass: "PRIVATE", schema: "effect-json-v1" }
        }),
        credentialHandle: metadata.handleId
      };
      await store.enqueueEffect(operation);
      await store.setSetting(phaseSetting, "PENDING_AFTER_RELOAD");
      effectStageStatus.textContent = copy.effectQueued;
      await renderEffects();
      return;
    }
    if (phase !== "PENDING_AFTER_RELOAD") return;
    const broker = new CredentialKeyBroker();
    let executorCalls = 0;
    const results = await new EffectRunner(store, {
      supports: () => true,
      execute: async () => {
        executorCalls += 1;
        return { outcome: "SUCCEEDED" as const };
      }
    }, createEffectRevalidationGuard({
      authority: "local-user",
      allowedPermissions: ["effect.execute"],
      availableSpaces: async () => new Set((await spaceService.listSpaces()).map((space) => space.id)),
      allowedDisclosureClasses: ["PRIVATE"],
      supportedSchemas: ["effect-json-v1"],
      credentialBroker: broker
    })).runAvailable();
    const cancelled = results.find((result) => result.purpose === "browser credential revocation qualification");
    if (!cancelled || cancelled.status !== "CANCELLED" || executorCalls !== 0) throw new Error("Credential revocation preview did not cancel before executor use");
    await store.setSetting(phaseSetting, "CANCELLED_AFTER_REVALIDATION");
    effectRunStatus.textContent = copy.effectCancelled;
    await renderEffects();
  };

  const runEffectCredentialedPreview = async (): Promise<void> => {
    if (!effectCredentialedPreviewMode) return;
    const endpointValue = new URLSearchParams(window.location.search).get("effectEndpoint")?.trim();
    if (!endpointValue) throw new Error("Credentialed effect preview requires effectEndpoint");
    let endpointUrl: URL;
    try { endpointUrl = new URL(endpointValue); } catch { throw new Error("Credentialed effect preview endpoint is invalid"); }
    if (endpointUrl.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(endpointUrl.hostname) || endpointUrl.username || endpointUrl.password || endpointUrl.origin !== window.location.origin || endpointUrl.pathname !== "/__omnevum/effect/action") throw new Error("Credentialed effect preview is restricted to the same-origin repository-owned loopback fixture");
    const endpoint = endpointUrl.href;
    const phaseSetting = "effect.preview.credentialed.phase";
    if (await store.getSetting<string>(phaseSetting) !== undefined) return;
    const broker = new CredentialKeyBroker();
    const metadata = broker.issue("qualification-fixture-secret", { provider: "qualification", scope: ["effect.execute"], audience: "loopback-fixture" });
    const operation = {
      ...createExternalEffect({
        destination: endpoint,
        purpose: "browser credentialed connector qualification",
        payloadOrReference: { fixture: "credentialed-effect", phase: "preview" },
        authorization: { authority: "local-user", permission: "effect.execute", space: "personal", disclosureClass: "PRIVATE", schema: "effect-json-v1" }
      }),
      credentialHandle: metadata.handleId
    };
    if (JSON.stringify(operation).includes("qualification-fixture-secret")) throw new Error("Credentialed preview leaked secret into the durable operation");
    await store.enqueueEffect(operation);
    const guard = createEffectRevalidationGuard({
      authority: "local-user",
      allowedPermissions: ["effect.execute"],
      availableSpaces: async () => new Set((await spaceService.listSpaces()).map((space) => space.id)),
      allowedDisclosureClasses: ["PRIVATE"],
      supportedSchemas: ["effect-json-v1"],
      credentialBroker: broker
    });
    const results = await new EffectRunner(store, new JsonEndpointEffectExecutor(endpoint, undefined, broker), guard).runAvailable();
    const completed = results.find((result) => result.operationId === operation.operationId);
    const persisted = await store.getEffect(operation.operationId);
    if (!completed || completed.status !== "SUCCEEDED" || !persisted || JSON.stringify(persisted).includes("qualification-fixture-secret")) throw new Error(`Credentialed effect preview did not complete without persisting secret material (result ${completed?.status ?? "MISSING"}; persisted ${persisted?.status ?? "MISSING"})`);
    await store.setSetting(phaseSetting, "SUCCEEDED_WITH_SESSION_BROKER");
    effectRunStatus.textContent = "Credentialed connector effect succeeded; secret remained in session memory.";
    await renderEffects();
  };

  const runEffectCredentialedRestartPreview = async (): Promise<void> => {
    if (!effectCredentialedRestartPreviewMode) return;
    const endpointValue = new URLSearchParams(window.location.search).get("effectEndpoint")?.trim();
    if (!endpointValue) throw new Error("Credentialed restart preview requires effectEndpoint");
    let endpointUrl: URL;
    try { endpointUrl = new URL(endpointValue); } catch { throw new Error("Credentialed restart preview endpoint is invalid"); }
    if (endpointUrl.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(endpointUrl.hostname) || endpointUrl.username || endpointUrl.password || endpointUrl.origin !== window.location.origin || endpointUrl.pathname !== "/__omnevum/effect/action") throw new Error("Credentialed restart preview is restricted to the same-origin repository-owned loopback fixture");

    const endpoint = endpointUrl.href;
    const phaseSetting = "effect.preview.credentialed.restart.phase";
    const contextSetting = "effect.preview.credentialed.restart.context";
    const phase = await store.getSetting<string>(phaseSetting);
    const fixtureSecret = "qualification-fixture-secret";
    const metadataInput = { provider: "qualification", scope: ["effect.execute"], audience: "loopback-fixture", recoveryReference: "qualification-restart-reference" };

    if (phase === undefined) {
      const broker = new CredentialKeyBroker();
      const metadata = broker.issue(fixtureSecret, metadataInput);
      const operation = {
        ...createExternalEffect({
          destination: endpoint,
          purpose: "browser credentialed restart qualification",
          payloadOrReference: { fixture: "credentialed-restart-effect", phase: "before-reload" },
          authorization: { authority: "local-user", permission: "effect.execute", space: "personal", disclosureClass: "PRIVATE", schema: "effect-json-v1" }
        }),
        credentialHandle: metadata.handleId
      };
      if (JSON.stringify(operation).includes(fixtureSecret)) throw new Error("Credentialed restart preview leaked secret into the durable operation");
      await store.enqueueEffect(operation);
      await store.setSetting(contextSetting, { handleId: metadata.handleId, ...metadataInput, endpoint });
      await store.setSetting(phaseSetting, "PENDING_AFTER_RESTART");
      effectStageStatus.textContent = copy.effectQueued;
      await renderEffects();
      return;
    }
    if (phase !== "PENDING_AFTER_RESTART") return;

    const context = await store.getSetting<unknown>(contextSetting);
    if (!context || typeof context !== "object") throw new Error("Credentialed restart context is unavailable");
    const persistedContext = context as Record<string, unknown>;
    if (persistedContext.endpoint !== endpoint || typeof persistedContext.handleId !== "string" || typeof persistedContext.recoveryReference !== "string" || !Array.isArray(persistedContext.scope)) throw new Error("Credentialed restart context is invalid");
    const broker = new CredentialKeyBroker();
    const restored = broker.restoreSession(persistedContext.handleId, fixtureSecret, {
      provider: String(persistedContext.provider ?? ""),
      scope: persistedContext.scope.filter((value): value is string => typeof value === "string"),
      audience: String(persistedContext.audience ?? ""),
      recoveryReference: persistedContext.recoveryReference
    });
    if (restored.storageClass !== "SESSION_MEMORY" || restored.recoveryReference !== persistedContext.recoveryReference) throw new Error("Credentialed restart preview did not restore an opaque session handle");

    const guard = createEffectRevalidationGuard({
      authority: "local-user",
      allowedPermissions: ["effect.execute"],
      availableSpaces: async () => new Set((await spaceService.listSpaces()).map((space) => space.id)),
      allowedDisclosureClasses: ["PRIVATE"],
      supportedSchemas: ["effect-json-v1"],
      credentialBroker: broker
    });
    const runner = new EffectRunner(store, new JsonEndpointEffectExecutor(endpoint, undefined, broker), guard);
    const firstRun = await runner.runAvailable();
    const reconciliation = await runner.runAvailable();
    const completed = reconciliation.find((operation) => operation.purpose === "browser credentialed restart qualification");
    const persistedOperation = completed ? await store.getEffect(completed.operationId) : undefined;
    if (!firstRun.some((operation) => operation.status === "RECONCILE") || !completed || completed.status !== "SUCCEEDED" || !persistedOperation || JSON.stringify({ persistedContext, persistedOperation, restored }).includes(fixtureSecret)) throw new Error("Credentialed restart preview did not restore, reconcile, and complete without durable secret material");
    await store.setSetting(phaseSetting, "SUCCEEDED_AFTER_SESSION_RESTORE");
    effectRunStatus.textContent = "Credentialed connector effect restored after browser restart and reconciled successfully; secret remained in session memory.";
    await renderEffects();
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

  const renderPackageAutomationChoices = (records: CanonicalRecord[]): void => {
    const current = packageAutomationRecord.value;
    packageAutomationRecord.replaceChildren();
    for (const record of records.filter((candidate) => !candidate.deleted && candidate.owner !== "platform.space" && !isCleanupHistoryRecord(candidate)).sort((left, right) => recordText(left).localeCompare(recordText(right)))) {
      const option = document.createElement("option");
      option.value = record.id;
      option.textContent = `${recordText(record)} (${record.id.slice(0, 12)})`;
      packageAutomationRecord.append(option);
    }
    if (current && [...packageAutomationRecord.options].some((option) => option.value === current)) packageAutomationRecord.value = current;
    if (!packageAutomationRecord.value && packageAutomationRecord.options[0]) packageAutomationRecord.value = packageAutomationRecord.options[0].value;
    if (packageAutomationRecord.value && !packageAutomationDocument.value.trim()) {
      packageAutomationDocument.value = makePackageAutomationDocument(packageAutomationRecord.value);
      packageAutomationDocument.dataset.generated = "true";
    }
    packageAutomationPreviewButton.disabled = !packageAutomationRecord.value || !packageAutomationRuntime;
  };

  const renderPackageAutomationRules = (): void => {
    packageAutomationList.replaceChildren();
    const rules = packageAutomationRuntime?.list(CORE_AUTOMATION_PACKAGE.packageId) ?? [];
    if (rules.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.automationNoRules;
      packageAutomationList.append(empty);
      return;
    }
    for (const rule of rules) {
      const item = document.createElement("li");
      item.className = "record-item";
      const text = document.createElement("span");
      text.textContent = `${rule.ruleId} · ${rule.trigger} · ${rule.status}${rule.disabledReason ? ` (${rule.disabledReason})` : ""}`;
      const actions = document.createElement("span");
      actions.className = "form-row";
      const lifecycle = document.createElement("button");
      lifecycle.type = "button";
      lifecycle.className = "icon-button";
      lifecycle.textContent = rule.status === "ENABLED" ? copy.automationDisable : copy.automationEnable;
      lifecycle.addEventListener("click", async () => {
        try {
          if (rule.status === "ENABLED") await packageAutomationRuntime?.disable(rule.ruleId, "disabled by local user");
          else await packageAutomationRuntime?.enable(rule.ruleId);
          packageAutomationStatus.textContent = `Automation rule ${rule.status === "ENABLED" ? "disabled" : "enabled"}.`;
          packageAutomationProposalsState = [];
          renderPackageAutomationRules();
          renderPackageAutomationProposals();
        } catch (error) {
          packageAutomationStatus.textContent = describeError(error, "Automation lifecycle change failed; durable state was not changed.");
        }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.textContent = copy.automationRemove;
      remove.addEventListener("click", async () => {
        if (!await requestConfirmation(`Remove ${rule.ruleId}? Its Vault state will no longer restore this rule.`, copy.automationHeading)) return;
        try {
          await packageAutomationRuntime?.remove(rule.ruleId);
          packageAutomationStatus.textContent = "Automation rule removed; canonical records were not changed.";
          packageAutomationProposalsState = [];
          renderPackageAutomationRules();
          renderPackageAutomationProposals();
        } catch (error) {
          packageAutomationStatus.textContent = describeError(error, "Automation rule removal failed; durable state was not changed.");
        }
      });
      actions.append(lifecycle, remove);
      item.append(text, actions);
      packageAutomationList.append(item);
    }
  };

  const renderPackageAutomationProposals = (): void => {
    packageAutomationProposals.replaceChildren();
    if (packageAutomationProposalsState.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = copy.automationNoProposals;
      packageAutomationProposals.append(empty);
      return;
    }
    for (const proposal of packageAutomationProposalsState) {
      const item = document.createElement("li");
      item.className = "record-item";
      const summary = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${proposal.command} · ${proposal.ruleId}`;
      const details = document.createElement("small");
      details.textContent = JSON.stringify(proposal.arguments);
      summary.append(title, details);
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "icon-button";
      apply.textContent = copy.automationApply;
      apply.addEventListener("click", async () => {
        const selectedId = packageAutomationRecord.value;
        if (!selectedId || !packageAutomationRuntime) return;
        if (!await requestConfirmation(`Apply ${proposal.command} from ${proposal.ruleId} to the selected record? The proposal will use the normal permission and CommandBus path.`, copy.automationHeading, copy.automationApply)) return;
        try {
          await packageAutomationRuntime.apply(commands, proposal, { confirmed: true, allowedRecordIds: new Set([selectedId]) });
          packageAutomationStatus.textContent = copy.automationApplied;
          packageAutomationProposalsState = packageAutomationProposalsState.filter((candidate) => candidate !== proposal);
          renderPackageAutomationProposals();
          await renderRecords(searchQuery.value);
        } catch (error) {
          packageAutomationStatus.textContent = describeError(error, "The proposal was not applied; canonical state was not changed.");
        }
      });
      item.append(summary, apply);
      packageAutomationProposals.append(item);
    }
  };

  const previewPackageAutomation = async (trigger: string): Promise<void> => {
    if (!packageAutomationRuntime) {
      packageAutomationStatus.textContent = "Package automation runtime is unavailable; no rule was evaluated.";
      return;
    }
    const record = await commands.get(packageAutomationRecord.value);
    if (!record || record.deleted) {
      packageAutomationStatus.textContent = "Choose an active record before previewing a proposal.";
      return;
    }
    packageAutomationProposalsState = packageAutomationRuntime.preview(trigger, { record: { ...record.data, id: record.id, recordType: record.recordType, owner: record.owner, revision: record.revision } });
    packageAutomationStatus.textContent = `${packageAutomationProposalsState.length} proposal(s) generated; no canonical state changed.`;
    renderPackageAutomationProposals();
  };

  packageAutomationDocument.addEventListener("input", () => { packageAutomationDocument.dataset.generated = "false"; });
  packageAutomationRecord.addEventListener("change", () => {
    if (packageAutomationDocument.dataset.generated === "true") packageAutomationDocument.value = makePackageAutomationDocument(packageAutomationRecord.value);
    packageAutomationPreviewButton.disabled = !packageAutomationRecord.value || !packageAutomationRuntime;
  });
  packageAutomationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!packageAutomationRuntime) return;
    try {
      const installed = await packageAutomationRuntime.install(CORE_AUTOMATION_PACKAGE.packageId, packageAutomationDocument.value.trim());
      packageAutomationStatus.textContent = copy.automationInstalled(installed.ruleId);
      renderPackageAutomationRules();
    } catch (error) {
      packageAutomationStatus.textContent = describeError(error, "The automation rule was rejected; no durable state was changed.");
    }
  });
  packageAutomationPreviewButton.addEventListener("click", () => { void previewPackageAutomation("MANUAL"); });
  renderPackageAutomationRules();
  renderPackageAutomationProposals();

  const renderRecords = async (query = ""): Promise<number> => {
    const renderRevision = ++recordsRenderRevision;
    const isCurrentRender = (): boolean => renderRevision === recordsRenderRevision;
    const parsedQuery = parseSearchQuery(query);
    syncSearchFacetControls(parsedQuery);
    const allRecords = await store.list();
    renderPackageAutomationChoices(allRecords);
    if (activeSpace) {
      const availableSpaces = await spaceService.listSpaces();
      if (!availableSpaces.some((space) => space.id === activeSpace)) {
        const revokedSpace = spaceLabel(activeSpace);
        activeSpace = undefined;
        spaceStatus.textContent = copy.spaceAccessRevoked(revokedSpace);
      }
    }
    searchScopeStatus.textContent = copy.searchScope(activeSpace ? spaceLabel(activeSpace) : copy.allSpaces);
    if (!isCurrentRender()) return 0;
    const allowedIds = activeSpace ? new Set((await spaceService.project(allRecords, activeSpace)).map((record) => record.id)) : undefined;
    const candidateRecords = parsedQuery.text ? await store.search(parsedQuery.text, allowedIds) : allRecords;
    const records = candidateRecords.filter((record) => record.owner !== "platform.space" && !isCleanupHistoryRecord(record) && (!allowedIds || allowedIds.has(record.id)) && matchesSearchFacets(record, parsedQuery.facets));
    if (!isCurrentRender()) return 0;
    recordList.replaceChildren();
    recordCount.textContent = formatNumber(presentation.locale, records.length);
    emptyState.hidden = records.length > 0;
    emptyState.textContent = query.trim() ? copy.noMatching : copy.nothingCaptured;
    if (recordsDisclosureChoice === undefined && records.length > 0) recordsDisclosure.open = true;

    const groupedRecords = new Map<PresentationLensId, CanonicalRecord[]>();
    for (const record of records) {
      const groupId = parsedQuery.facets.lens ?? lensIdsForRecord(record)[0] ?? "direction";
      const group = groupedRecords.get(groupId) ?? [];
      group.push(record);
      groupedRecords.set(groupId, group);
    }
    for (const [groupId, groupRecords] of groupedRecords) {
      if (!isCurrentRender()) return 0;
      const groupHeading = document.createElement("li");
      groupHeading.className = "search-group-heading";
      groupHeading.textContent = copy.searchGroup(PRESENTATION_LENS_DEFINITIONS[groupId].label);
      recordList.append(groupHeading);
      for (const record of [...groupRecords].reverse()) {
      if (!isCurrentRender()) return 0;
      const item = document.createElement("li");
      item.className = "record-item";
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = isCompletedTask(record) ? copy.taskDone : `${spaceLabel(recordSpace(record))} - ${typeLabel(record.recordType)}`;
      const text = document.createElement("p");
      text.textContent = recordText(record);
      const meta = document.createElement("small");
      meta.textContent = `${record.owner} - revision ${record.revision}. ${copy.searchMatch(record.owner, PRESENTATION_LENS_DEFINITIONS[groupId].label)}`;
      content.append(title, text, meta);
      const history = await renderHistory(record);
      if (!isCurrentRender()) return 0;
      if (history) content.append(history);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary";
      open.textContent = copy.openRecord;
      open.addEventListener("click", () => { void openRecordDetail(record.id); });
      content.append(open);
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
          startArchiveUndo(record.id);
        } catch (error) {
          healthStatus.textContent = describeError(error, "Archive failed; canonical data was not changed.");
        }
      });
      item.append(content, archive);
      recordList.append(item);
      }
    }
    if (!isCurrentRender()) return 0;
    await renderSpaceChoices();
    await renderDocumentFinishChoices();
    await renderSummary();
    await renderReview();
    await renderReviewTemplates();
    await renderComposeView();
    await renderRelationshipChoices();
    await renderKnowledgeChoices();
    await renderKnowledgeStatus();
    await renderShareChoices();
    await renderShareGrants();
    await renderCleanupHistory();
    await renderActiveLens();
    const healthAfter = await store.health();
    healthStatus.textContent = formatHealth(healthAfter);
    await renderEffects();
    if (!archivePanel.hidden) await renderArchived();
    return records.length;
  };

  const runSelectedTriageBatch = async (action: TriageBatchAction): Promise<void> => {
    const selected = [...selectedTriageIds].map((recordId) => visibleTriageRecords.get(recordId)).filter((record): record is CanonicalRecord => record !== undefined);
    if (selected.length === 0) {
      triageStatusMessage.textContent = copy.triageNoSelection;
      return;
    }
    try {
      const deferredUntil = action === "DEFER" ? new Date(triageBatchDeferUntil.value).toISOString() : undefined;
      const outcomes = await runTriageBatch(commands, selected.map((record) => ({ recordId: record.id, expectedRevision: record.revision })), action, deferredUntil);
      const labels = new Map(selected.map((record) => [record.id, recordText(record)]));
      const successes = outcomes.filter((outcome) => outcome.ok).length;
      const failures = outcomes.length - successes;
      const successLabel = action === "REVIEW" ? copy.markReviewed : copy.defer;
      triageStatusMessage.textContent = `${copy.triageBatchResult(successes, failures)} ${outcomes.map((outcome) => copy.triageBatchOutcome(labels.get(outcome.recordId) ?? outcome.recordId, outcome.ok ? successLabel : outcome.message)).join(" ")}`;
      selectedTriageIds.clear();
      await renderRecords(searchQuery.value);
    } catch (error) {
      triageStatusMessage.textContent = describeError(error, "Triage batch failed; canonical records were not changed.");
    }
  };

  triageSelectAll.addEventListener("change", () => {
    if (triageSelectAll.checked) for (const id of visibleTriageRecords.keys()) selectedTriageIds.add(id);
    else selectedTriageIds.clear();
    for (const input of reviewList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) input.checked = triageSelectAll.checked;
    syncTriageBatchControls();
  });
  triageBatchReview.addEventListener("click", () => { void runSelectedTriageBatch("REVIEW"); });
  triageBatchDefer.addEventListener("click", () => { void runSelectedTriageBatch("DEFER"); });

  undoArchive.addEventListener("click", async () => {
    const state = archiveUndoState;
    if (!state || state.expiresAt <= Date.now()) {
      clearArchiveUndo();
      return;
    }
    try {
      await commands.undo(state.recordId);
      const remaining = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000));
      clearArchiveUndo();
      healthStatus.textContent = copy.undoAvailable(remaining);
      await renderRecords(searchQuery.value);
    } catch (error) {
      healthStatus.textContent = describeError(error, "Undo failed; the archived record was not changed.");
    }
  });

  captureForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = captureText.value.trim();
    if (!text) return;
    try {
      const selectedKind = CAPTURE_KINDS.includes(captureType.value as CaptureKind) ? captureType.value as CaptureKind : "note";
      const recordType = recordTypeForCaptureKind(selectedKind);
      const space = (captureSpace.value === "household" || captureSpace.value === "work" ? captureSpace.value : "personal") satisfies SpaceId;
      const created = await commands.create({ recordType, owner: selectedKind === "event" ? "platform.time" : "core.capture", data: { text, kind: selectedKind, space, triageStatus: captureSafeRoute.checked ? "REVIEWED" : "INBOX", ...(recordType === "task" ? { status: "OPEN" } : {}) } });
      captureForm.reset();
      await renderRecords(searchQuery.value);
      if (packageAutomationRuntime) {
        const proposals = packageAutomationRuntime.preview("ON_CAPTURE", { record: { ...created.data, id: created.id, recordType: created.recordType, owner: created.owner, revision: created.revision } });
        if (proposals.length > 0) {
          packageAutomationProposalsState = proposals;
          packageAutomationStatus.textContent = `${proposals.length} proposal(s) generated for the new capture; no canonical state changed.`;
          renderPackageAutomationProposals();
        }
      }
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

  deviceShare.addEventListener("click", async () => {
    try {
      await deviceInput.shareText(`${presentation.productName}: ${copy.lede}`, window.location.href);
      deviceInputStatus.textContent = deviceCopy.shared;
    } catch (error) {
      deviceInputStatus.textContent = describeError(error, deviceCopy.manualFallback);
    }
  });

  deviceLocation.addEventListener("click", async () => {
    try {
      const position = await deviceInput.readLocation();
      placeLabel.value = deviceCopy.currentLocation;
      placeLatitude.value = String(position.coords.latitude);
      placeLongitude.value = String(position.coords.longitude);
      placeGeoJson.value = "";
      placeStatus.textContent = deviceCopy.locationStaged;
      deviceInputStatus.textContent = deviceCopy.locationStaged;
      placeLabel.focus();
    } catch (error) {
      deviceInputStatus.textContent = describeError(error, deviceCopy.manualFallback);
    }
  });

  const checkMedia = async (kind: "camera" | "microphone", label: string): Promise<void> => {
    try {
      await deviceInput.withMedia(kind, async () => undefined);
      deviceInputStatus.textContent = deviceCopy.mediaGranted(label);
    } catch (error) {
      deviceInputStatus.textContent = describeError(error, deviceCopy.manualFallback);
    }
  };
  deviceCamera.addEventListener("click", () => { void checkMedia("camera", deviceCopy.camera); });
  deviceMicrophone.addEventListener("click", () => { void checkMedia("microphone", deviceCopy.microphone); });

  deviceBarcodeInput.addEventListener("change", async () => {
    const file = deviceBarcodeInput.files?.[0];
    if (!file) return;
    try {
      const detections = await deviceInput.scanBarcode(file);
      if (detections.length === 0) {
        deviceInputStatus.textContent = `${deviceCopy.noDataRetained} No supported code was found.`;
        return;
      }
      const firstDetection = detections[0];
      if (!firstDetection) return;
      acquireText.value = firstDetection.rawValue;
      await stageAcquireText(firstDetection.rawValue);
      deviceInputStatus.textContent = deviceCopy.barcodeFound(detections.length);
    } catch (error) {
      deviceInputStatus.textContent = describeError(error, deviceCopy.manualFallback);
    } finally {
      deviceBarcodeInput.value = "";
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

  cleanupPreviewButton.addEventListener("click", async () => {
    try {
      const records = await cleanupInputRecords();
      const preview = previewCleanup(records, cleanupRecipe());
      cleanupPreviewState = preview;
      await renderCleanupPreview(preview);
      cleanupStatus.textContent = copy.cleanupStatus(preview.recordIds.length, preview.sourceGroups.length, preview.proposals.length);
    } catch (error) {
      cleanupPreviewState = undefined;
      cleanupApplyButton.disabled = true;
      cleanupStatus.textContent = describeError(error, "Cleanup preview failed; canonical data was not changed.");
    }
  });

  cleanupApplyButton.addEventListener("click", async () => {
    if (!cleanupPreviewState) return;
    const decisions = readCleanupDecisions();
    if (decisions.length === 0) {
      cleanupStatus.textContent = "Choose at least one explicit cleanup decision.";
      return;
    }
    if (!await requestConfirmation("Apply the selected cleanup decisions? Original source records remain in revision history; ambiguous entities are not merged.", copy.cleanupApply)) return;
    try {
      const historyRecords = await commands.applyCleanup(cleanupPreviewState, decisions);
      const first = historyRecords[0];
      cleanupStatus.textContent = copy.cleanupApplied(Number(first?.data.updatedCount ?? 0), Number(first?.data.archivedCount ?? 0), Number(first?.data.reviewCount ?? 0));
      cleanupPreviewState = undefined;
      cleanupApplyButton.disabled = true;
      await renderRecords(searchQuery.value);
    } catch (error) {
      cleanupStatus.textContent = describeError(error, "Cleanup was not applied; canonical data was not changed.");
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
      const created = await captureExpense(commands, { merchant: expenseMerchant.value, amount: expenseAmount.value, currency: expenseCurrency.value, space });
      financeChangedIds = [created.id];
      expenseForm.reset();
      expenseStatus.textContent = copy.expenseSaved;
      await renderRecords(searchQuery.value);
    } catch (error) {
      expenseStatus.textContent = error instanceof Error ? error.message : "Expense capture failed";
    }
  });

  financePlanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const space = (financePlanSpace.value === "household" || financePlanSpace.value === "work" ? financePlanSpace.value : "personal") satisfies SpaceId;
      const kind = financePlanKind.value === "goal" ? "goal" : "resource";
      const created = await captureFinancePlan(commands, { kind, label: financePlanLabel.value, amount: financePlanAmount.value, currency: financePlanCurrency.value, space, ...(kind === "goal" && financePlanDate.value ? { targetDate: financePlanDate.value } : {}), ...(kind === "goal" && financePlanSurplus.value.trim() ? { sustainableMonthlySurplus: financePlanSurplus.value } : {}), ...(kind === "goal" && financePlanHardConstraint.checked ? { hardConstraint: true } : {}) });
      financeChangedIds = [created.id];
      financePlanForm.reset();
      updateFinancePlanControls();
      financePlanStatus.textContent = copy.financePlanSaved(kind);
      await renderRecords(searchQuery.value);
    } catch (error) {
      financePlanStatus.textContent = describeError(error, "Finance plan was not saved; canonical records were not changed.");
    }
  });

  financeImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const file = financeImportFile.files?.[0];
      const accountId = financeImportAccount.value.trim().slice(0, 160);
      const currency = financeImportCurrency.value;
      if (!file || !accountId) throw new Error("Choose a statement file and enter an account identity");
      const inspection = await inspectArtifact(file, file.name, file.type || "text/csv");
      const sourceId = createFinanceSourceId(inspection.sha256, accountId, currency);
      const openingBalance = financeImportOpening.value.trim() ? parseMoney(financeImportOpening.value.trim(), currency) : undefined;
      const closingBalance = financeImportClosing.value.trim() ? parseMoney(financeImportClosing.value.trim(), currency) : undefined;
      const text = await file.text();
      const headerFields = (text.split(/\r?\n/u, 1)[0] ?? "").split(/,|\t/u).map((header) => header.trim());
      const classification = classifyFinanceSource(file.name, headerFields);
      const statementClass = classification.sourceClass === "CREDIT_CARD" || classification.sourceClass === "INVESTMENT" || classification.sourceClass === "INSURANCE" ? classification.sourceClass : undefined;
      const source: FinanceStatementSource = { sourceId, name: file.name, sha256: inspection.sha256, accountId, currency, ...(statementClass ? { sourceClass: statementClass } : {}), ...(openingBalance ? { openingBalance } : {}), ...(closingBalance ? { closingBalance } : {}) };
      let transactions: Awaited<ReturnType<typeof parseFinanceCsv>> = [];
      let statementFacts: FinanceStatementFacts | undefined;
      try {
        transactions = parseFinanceCsv(text, source);
        if (statementClass) statementFacts = extractFinanceStatementFacts(transactions, source, statementClass);
      } catch (error) {
        if (!statementClass) throw error;
        statementFacts = parseFinanceStatementFactsCsv(text, source, statementClass);
      }
      const deduplicated = deduplicateFinanceTransactions(transactions);
      const reconciliation = reconcileFinanceStatement(source, transactions);
      const summary = summarizeFinanceTransactions(transactions, currency);
      const preview = copy.financeImportResult(deduplicated.unique.length, 0, deduplicated.duplicates.length, deduplicated.conflicts.length, reconciliation.status);
      if (!await requestConfirmation(`${preview}\n\n${copy.financeImportHint}`, copy.financeImport)) return;
      const existingArtifact = (await commands.findBySourceId(sourceId)).find((record) => record.recordType === "artifact" && !record.deleted);
      const artifact = existingArtifact ?? await commands.createArtifact({ fileName: file.name, mimeType: file.type || "text/csv", blob: file, sourceId, adapter: inspection.adapter, metadata: inspection.metadata, ...(inspection.derivedText ? { derivedText: inspection.derivedText } : {}) });
      const sourceWithArtifact = { ...source, sourceArtifactId: artifact.id };
      if (statementFacts) await acceptFinanceStatementFacts(commands, sourceWithArtifact, statementFacts);
      const result = await acceptFinanceTransactions(commands, sourceWithArtifact, transactions);
      financeChangedIds = result.records.map((record) => record.id);
      financeImportForm.reset();
      const factsStatus = statementFacts ? ` Statement facts retained for ${statementFacts.sourceClass}; ${statementFacts.limitations.length} limitation(s) remain explicit.` : "";
      financeImportStatus.textContent = `${copy.financeImportResult(result.created, result.existing, result.duplicates, result.conflicts.length, reconciliation.status)} ${copy.financeAnalysisResult(formatMoney(summary.postedIncome, presentation.locale), formatMoney(summary.postedSpending, presentation.locale), formatMoney(summary.netCashFlow, presentation.locale), formatMoney(summary.pendingNet, presentation.locale), formatMoney(summary.feeSpending, presentation.locale))}${factsStatus}`;
      await renderRecords(searchQuery.value);
    } catch (error) {
      financeImportStatus.textContent = describeError(error, "Finance statement import failed; no statement rows were accepted.");
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

  searchSaveView.addEventListener("click", async () => {
    const query = searchQuery.value.trim();
    if (!query) {
      searchStatus.textContent = copy.searchViewQueryRequired;
      searchQuery.focus();
      return;
    }
    try {
      const view = makeSearchView(searchViewName.value || copy.defaultViewTitle, query, activeSpace);
      await viewRegistry.save(view);
      searchViewName.value = "";
      searchStatus.textContent = copy.searchViewSaved;
      await renderComposeView();
    } catch (error) {
      searchStatus.textContent = describeError(error, "Search view was not saved; canonical records were not changed.");
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
      const selectedKind = relateKind.value as DependencyEdgeKind | "REFERENCE";
      if (selectedKind === "REFERENCE") {
        await commands.relate(relateSource.value, relateTarget.value, relation);
        relateStatus.textContent = copy.linkCreated;
      } else {
        const scenarioId = relateScenario.value.trim() || undefined;
        if (selectedKind === "FEEDBACK" && !scenarioId) {
          relateStatus.textContent = copy.scenarioRequired;
          return;
        }
        const allocation = selectedKind === "ALLOCATION" && relateAllocationAmount.value.trim()
          ? parseMoney(relateAllocationAmount.value.trim(), relateAllocationCurrency.value)
          : undefined;
        const createdLink = await createDependencyLink(commands, {
          sourceId: relateSource.value,
          targetId: relateTarget.value,
          edgeKind: selectedKind,
          label: relation,
          ...(scenarioId ? { scenarioId } : {}),
          ...(selectedKind === "ALLOCATION" ? { allocationMode: relateAllocationMode.value === "ENABLING" ? "ENABLING" : "EXCLUSIVE" } : {}),
          ...(allocation ? { allocation } : {}),
          evidence: { truthClass: "USER_OBSERVATION", sourceIds: [relateSource.value, relateTarget.value], note: "Explicit user-created typed relationship." }
        });
        financeChangedIds = [relateSource.value, createdLink.id, relateTarget.value];
        relateStatus.textContent = copy.typedLinkCreated;
      }
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

  const makeContextProfileFromControls = (recordIds: string[]): ContextExportProfile => makeContextExportProfile({
    id: "saved-share-handoff",
    label: "Saved share handoff",
    format: contextExportFormat.value as ContextExportFormat,
    recordIds,
    purpose: sharePurpose.value.trim() || "Authorized context handoff",
    objective: contextExportObjective.value.trim(),
    ...(isSpaceId(shareSpace.value) ? { scope: shareSpace.value } : {}),
    detail: "FULL",
    maxBytes: Number(contextExportBudget.value),
    includePrivate: shareIncludePrivate.checked
  });

  contextExportButton.addEventListener("click", async () => {
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
      const allRecords = await store.list(true);
      const profile = makeContextProfileFromControls(recordIds);
      const artifact = exportAuthorizedContext(grant, allRecords, profile, allRecords);
      savedContextProfile = profile;
      await store.setSetting("context-export.profile", profile);
      const priorRaw = await store.getSetting<unknown>("context-export.snapshot");
      downloadText(artifact.fileName, artifact.content, artifact.mimeType);
      if (isContextExportSnapshot(priorRaw)) downloadJson("omnevum-context-delta.json", createContextDelta(priorRaw, artifact));
      await store.setSetting("context-export.snapshot", artifact.snapshot);
      updateShareActions();
      shareStatus.textContent = copy.contextExportSaved(artifact.package.manifest.recordCount, artifact.bytes, artifact.package.manifest.lossless);
    } catch (error) {
      shareStatus.textContent = describeError(error, "Context handoff failed; canonical records were not changed.");
    }
  });

  contextExportRerunButton.addEventListener("click", async () => {
    if (!savedContextProfile) {
      shareStatus.textContent = "Save a context handoff before rerunning it.";
      return;
    }
    try {
      const grant = shareGrant.value ? await commands.get(shareGrant.value) : undefined;
      if (!grant) {
        shareStatus.textContent = copy.grantRequired;
        updateShareActions();
        return;
      }
      const allRecords = await store.list(true);
      const artifact = exportAuthorizedContext(grant, allRecords, savedContextProfile, allRecords);
      const priorRaw = await store.getSetting<unknown>("context-export.snapshot");
      downloadText(artifact.fileName, artifact.content, artifact.mimeType);
      if (isContextExportSnapshot(priorRaw)) downloadJson("omnevum-context-delta.json", createContextDelta(priorRaw, artifact));
      await store.setSetting("context-export.snapshot", artifact.snapshot);
      shareStatus.textContent = copy.contextExportSaved(artifact.package.manifest.recordCount, artifact.bytes, artifact.package.manifest.lossless);
    } catch (error) {
      shareStatus.textContent = describeError(error, "Saved context rerun failed; canonical records were not changed.");
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
        family: familyInput.value,
        locale: nextLocale,
        density: densityInput.value,
        typeface: typefaceInput.value,
        iconography: iconographyInput.value,
        accessibility: {
          profile: accessibilityProfileInput.value,
          textScale: Number(accessibilityTextScaleInput.value) as PresentationTextScale,
          targetSize: accessibilityTargetSizeInput.value as PresentationTargetSize,
          reducedMotion: accessibilityReducedMotionInput.checked
        },
        labels: { home: homeLabelInput.value, capture: captureLabelInput.value, records: recordsLabelInput.value },
        navigation: {
          visible: readOptionVisibility<PresentationSectionId>(navigationOptions),
          order: readOptionOrder<PresentationSectionId>(navigationOptions)
        },
        lensPins: readLensPins(),
        homeWidgets: readOptionVisibility<PresentationHomeWidgetId>(homeWidgetOptions)
      });
      await store.setSetting("presentation", nextPresentation);
      presentation = nextPresentation;
      if (localeChanged) {
        await mountApp(root, store, commands, capabilityRuntime, packageAutomationRuntime);
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
        await mountApp(root, store, commands, capabilityRuntime, packageAutomationRuntime);
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
      if (capabilityRuntime) await capabilityRuntime.retry("core.search", undefined);
      refreshCapabilityStatus();
      recoveryStatus.textContent = copy.searchRepairMessage;
      await renderRecords(searchQuery.value);
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Search repair failed; canonical data was not changed.");
    }
  });

  requestPersistenceButton.addEventListener("click", async () => {
    try {
      const persistence = await store.requestPersistence();
      const health = await store.health();
      healthStatus.textContent = formatHealth(health);
      recoveryStatus.textContent = getStoragePersistenceNotice(presentation.locale, persistence);
    } catch (error) {
      recoveryStatus.textContent = describeError(error, "Persistent storage request failed; export a Vault for portability.");
    }
  });

  clearCanonicalButton.addEventListener("click", async () => {
    try {
      const impact = await store.getClearImpact();
      const message = `${recoveryCopy.clearConfirmation}\n\n${recoveryCopy.clearImpact(impact)}`;
      if (!await requestConfirmation(message, copy.confirmationHeading)) return;
      clearArchiveUndo();
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
      if (!await requestConfirmation(copy.importPreviewMessage(preview.recordCount, preview.historyEntries, preview.artifactPayloads, preview.imported, preview.skipped, preview.conflicts, preview.hasPresentation, preview.packageStates, preview.automationRules), copy.importVault)) {
        recoveryStatus.textContent = copy.importCancelled;
        return;
      }
      const result = await store.importVault(vault);
      await packageAutomationRuntime?.restore();
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
  await runEffectRevocationPreview();
  await runEffectCredentialedPreview();
  await runEffectCredentialedRestartPreview();
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

function downloadText(fileName: string, value: string, mimeType: string): void {
  const blob = new Blob([value], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function isContextExportSnapshot(value: unknown): value is ContextExportSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ContextExportSnapshot>;
  return typeof candidate.profileId === "string" && typeof candidate.exportId === "string" && Array.isArray(candidate.records) && candidate.records.every((record) => Boolean(record) && typeof record === "object" && typeof (record as { id?: unknown }).id === "string" && typeof (record as { revision?: unknown }).revision === "number" && typeof (record as { fingerprint?: unknown }).fingerprint === "string");
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

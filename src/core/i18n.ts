import type { PresentationLocale } from "./presentation";
import type { CaptureKind } from "./model";
import type { TriageStatus } from "./domain";
import type { CanonicalClearImpact } from "./storage";
import type { ReviewTemplateId } from "./review";
import type { TelemetryStatus } from "./telemetry";

export interface UiCopy {
  productHeading: string; foundation: string; lede: string; system: string; ready: string; local: string; healthInitial: string; healthy: string; degraded: string;
  home: string; currentPicture: string; activeRecordCount: string; visualize: string; signals: string; openTasks: string; completedTasks: string; focusMinutes: string; relationships: string; personalization: string; makeItYours: string; lenses: string; lensOverflow: string; lensHint: string; lensPinned: string; lensActive: string; lensNoRecords: string; openRecord: string; closeRecord: string; recordDetail: string; recordOverview: string; recordRelationships: string; recordEvidence: string; noRecordRelationships: string; noRecordEvidence: string; recordIdLabel: string; recordOwnerLabel: string; recordTruthLabel: string; recordSensitivityLabel: string; recordProvenanceLabel: string; recordEditLabel: string; recordEditHint: string; saveRecordEdit: string; recordEditSaved: (revision: number, index: string) => string; recordEditUnavailable: string; recordEditSegmentStatus: (label: string) => string; onboardingHeading: string; onboardingHint: string; onboardingCapture: string; onboardingReview: string; onboardingRecovery: string; onboardingStart: string; onboardingDismiss: string; onboardingShow: string;
  derivedStatus: (records: number, sourceIds: number, groups: number) => string;
  appName: string; language: string; english: string; french: string; save: string; presentationHint: string; tagline: string; density: string; comfortable: string; compact: string; typeface: string; systemTypeface: string; serifTypeface: string; monoTypeface: string; iconography: string; labelIconography: string; glyphIconography: string; homeLabel: string; captureLabel: string; recordsLabel: string; navigationSections: string; navigationHint: string; homeWidgets: string; homeWidgetsHint: string; resetPresentation: string; exportPresentationProfile: string; importPresentationProfile: string; presentationProfileExported: string; presentationProfileImported: string; editLabel: string; labelRequired: string; pinSection: (label: string) => string; unpinSection: (label: string) => string;
  capture: string; getItOut: string; kind: string; note: string; task: string; observation: string; space: string; acquireHeading: string; stageImport: string; acquireFile: string; readClipboard: string; acceptStaged: string; acquirePlaceholder: string; acquireHint: string; stagedMessage: (count: number, warnings: number) => string; cleanupHeading: string; cleanupHint: string; cleanupImportedOnly: string; cleanupTrim: string; cleanupWhitespace: string; cleanupPreview: string; cleanupApply: string; cleanupStatus: (records: number, sources: number, proposals: number) => string; cleanupEmpty: string; cleanupTransform: string; cleanupDuplicate: string; cleanupAmbiguous: string; cleanupArchive: string; cleanupMarkReview: string; cleanupApplied: (updated: number, archived: number, review: number) => string; cleanupHistory: string; cleanupHistoryEmpty: string; cleanupHistoryEntry: (recipe: string, acceptedAt: string, inputs: number, updated: number, archived: number, review: number, chunks: number) => string;
  personal: string; household: string; work: string; captureContent: string; capturePlaceholder: string;
  captureHint: string; safeDirectRoute: string; safeDirectRouteHint: string; saveCapture: string; searchExplore: string; findCaptures: string; searchTerms: string; searchFilters: string; searchFacetLens: string; searchFacetType: string; searchFacetSpace: string; searchFacetArtifact: string; searchAll: string; searchHasArtifact: string; searchScope: (scope: string) => string; searchMatch: (owner: string, lens: string) => string; searchSaveView: string; searchViewName: string; searchViewSaved: string; searchViewQueryRequired: string; searchFacetChip: (key: string, value: string) => string; searchGroup: (lens: string) => string;
  scopeWithoutCopying: string; spaceName: string; createSpace: string; spaceCreated: (space: string) => string; removeSpace: string; removeSpaceConfirmation: (space: string) => string; assignToSpace: string; filterSpace: string; allSpaces: string; addMembership: string; membershipCreated: (space: string) => string; activeMemberships: string; removeMembership: string; removeMembershipConfirmation: (record: string, space: string) => string; membershipRemoved: (space: string) => string; spaceRemoved: (space: string) => string; spaceAccessRevoked: (space: string) => string;
  compose: string; composeHeading: string; viewTitle: string; viewFields: string; viewSpace: string; defaultViewTitle: string; saveView: string; viewSaved: string; viewEmpty: string; chartLabel: string; tableLabel: string;
  searchPlaceholder: string; search: string; clear: string; triage: string; reviewInbox: string; inboxCount: string;
  inboxClear: string; markReviewed: string; defer: string; deferUntil: string; clarify: string; reference: string; route: string; split: string; splitKind: string; splitParts: string; splitHint: string; splitSaved: (count: number) => string; delete: string; triageStatus: (status: TriageStatus) => string; triageProposal: (owners: string, types: string, actions: string) => string; triageDetails: string; triageProvenance: (source: string, capturedAt: string, owner: string, revision: number) => string; triageSelectAll: string; triageSelectItem: (text: string) => string; triageSelected: (count: number) => string; triageBatchReview: string; triageBatchDefer: string; triageBatchDeferUntil: string; triageNoSelection: string; triageBatchResult: (successes: number, failures: number) => string; triageBatchOutcome: (label: string, outcome: string) => string; reviewHint: string; reviewTemplates: string; reviewTemplateName: (id: ReviewTemplateId) => string; reviewStart: string; reviewResume: string; reviewSkip: string; reviewAbandon: string; reviewNext: string; reviewFinish: string; reviewCompleted: string; reviewPartial: string; reviewStep: (current: number, total: number) => string; reviewNoRecords: string; reviewPrompt: (key: string) => string; reviewMotivation: string; reviewOpenRecord: string; reviewMarkReviewed: string; reviewCompleteTask: string; relate: string; connectWithoutCopying: string; sourceRecord: string;
  targetRecord: string; relationship: string; createLink: string; relationshipHint: string; typedRelationshipKind: string; typedReference: string; dependency: string; allocation: string; synergy: string; conflict: string; feedback: string; relationshipScenario: string; allocationMode: string; allocationAmount: string; allocationCurrency: string; exclusive: string; enabling: string; typedRelationshipHint: string; typedLinkCreated: string; scenarioRequired: string; timeObserve: string; track: string; trackHeading: string; metricName: string; value: string; unit: string; trackPlaceholder: string; saveObservation: string; trackHint: string; trackSaved: (name: string) => string;
  domains: string; financeHeading: string; merchant: string; currency: string; saveExpense: string; financeHint: string; financePlanHeading: string; financePlanKind: string; financeResource: string; financeGoal: string; financePlanLabel: string; financePlanAmount: string; financeGoalDate: string; financeMonthlySurplus: string; financePlanHint: string; saveFinancePlan: string; financePlanSaved: (kind: string) => string; financeGoalStatus: (goals: number, conflicts: number) => string; financeGoalProgress: (label: string, funded: string, target: string, remaining: string, conflict: boolean) => string; financeImportHeading: string; financeFile: string; financeAccount: string; financeOpening: string; financeClosing: string; financeImport: string; financeImportHint: string; financeImportResult: (created: number, existing: number, duplicates: number, conflicts: number, reconciliation: "MATCH" | "MISMATCH" | "INCOMPLETE") => string; financeAnalysisResult: (income: string, spending: string, net: string, pending: string, fees: string) => string; financeDashboard: string; financeNoData: string; financeIncome: string; financeSpending: string; financeNet: string; financePending: string; financeQuality: (status: string, limitations: number) => string; financeReviewCases: (count: number) => string; financeGraphStatus: (nodes: number, edges: number, invalidated: number) => string; financeAllocationConflicts: (count: number) => string; financeTransferStatus: (matched: number, unresolved: number) => string; healthHeading: string; subject: string; optionalNote: string; saveMeasurement: string; healthHint: string; expenseSaved: string; measurementSaved: string;
  focusHeading: string; focusHint: string; startFocus: string; stopFocus: string; noActiveSession: string;
  sources: string; sourcesHeading: string; evidenceHeading: string; subjectRecord: string; evidenceRelation: string; supports: string; contradicts: string; qualifies: string; derivesFrom: string; claim: string; uncertainty: string; createEvidence: string; evidenceSaved: string; annotationHeading: string; annotationQuote: string; annotationNote: string; createAnnotation: string; annotationSaved: string; quoteMissing: string; placeHeading: string; placeLabel: string; latitude: string; longitude: string; optionalGeoJson: string; savePlace: string; placeSaved: (label: string) => string; knowledgeStatus: (evidence: number, annotations: number, active: number, stale: number, orphaned: number, places: number) => string; sourceRequired: string;
  sharing: string; sharingHeading: string; shareRecipient: string; sharePurpose: string; shareExpiry: string; shareGrant: string; selectGrant: string; selectRecords: string; includePrivate: string; createGrant: string; exportProjection: string; sharingHint: string; grantSaved: string; grantRevoked: string; grantRequired: string; grantSpaceMismatch: string; projectionSaved: (included: number, omitted: number) => string; shareSelectionRequired: string; revoke: string; contextExportFormat: string; contextExportObjective: string; contextExportBudget: string; contextExport: string; contextExportRerun: string; contextExportHint: string; contextExportSaved: (records: number, bytes: number, lossless: boolean) => string;
  syncHeading: string; syncEndpoint: string; syncRun: string; syncHint: string; syncResult: (imported: number, skipped: number, conflicts: number, tombstones: number) => string; syncPartial: (imported: number, skipped: number, conflicts: number, tombstones: number) => string;
  canonicalRecords: string; recentCaptures: string; recordCount: string; nothingCaptured: string; noMatching: string; historyHeading: string; historyEntry: (revision: number, time: string, changes: string) => string; undoAvailable: (seconds: number) => string;
  taskDone: string; complete: string; undo: string; revertToRevision: (revision: number) => string; archive: string; archivedRecords: string; showArchived: string;
  hideArchived: string; noArchived: string; restore: string; recovery: string; keepPortable: string; effectOutboxHeading: string; effectOutboxHint: string; effectNoMaterial: string; effectCancel: string; effectRetry: string; effectCancelled: string; effectRetryQueued: string;
  effectStageHeading: string; effectDestination: string; effectPurpose: string; effectPayload: string; effectScope: string; effectStageHint: string; effectQueue: string; effectQueued: string; effectRunHeading: string; effectRunEndpoint: string; effectRunHint: string; effectRun: string; effectRunConfirmation: string; effectRunCancel: string; effectRunConfirm: string; effectRunResult: (processed: number, succeeded: number, attention: number) => string;
  confirmationHeading: string; confirm: string;
  automationHeading: string; automationHint: string; automationPackage: string; automationRecord: string; automationDocument: string; automationInstall: string; automationPreview: string; automationRules: string; automationNoRules: string; automationDisable: string; automationEnable: string; automationRemove: string; automationProposals: string; automationNoProposals: string; automationApply: string; automationInstalled: (ruleId: string) => string; automationApplied: string;
  factoryPreview: string; factoryAppHeading: string; factoryAppHint: string; factoryAppSave: string; factoryAppComplete: string; factoryAppSaved: (title: string) => string; factoryAppEmpty: string; factoryGameHeading: string; factoryGameHint: string; factoryGameMove: string; factoryGameCollect: string; factoryGamePause: string; factoryGameResume: string; factoryGameSave: string; factoryGameLoad: string; factoryGameStatus: (position: number, energy: number, stars: number, tick: number) => string; factoryGameSaved: string; factoryGameLoaded: string;
  recoveryHint: string; exportVault: string; exportDiagnostics: string; repairSearch: string; importVault: string;
  attachArtifact: string; documentFinishHeading: string; documentFinishSource: string; documentFinishTerms: string; documentFinishReplacement: string; documentFinishSubmit: string; documentFinishHint: string; documentFinishSaved: (name: string, count: number) => string; footerPhase0: string; footerOptional: string; themeLight: string; themeDark: string;
  capturePicture: string; atLeastTwo: string; linkCreated: string; showingAll: string; exportMessage: (count: number) => string;
  diagnosticsMessage: string; searchRepairMessage: string; savedName: (name: string) => string;
  importedMessage: (imported: number, skipped: number, conflicts: number) => string;
  importPreviewMessage: (records: number, history: number, artifacts: number, imported: number, skipped: number, conflicts: number, hasPresentation: boolean, packageStates: number, automationRules: number) => string;
  importCancelled: string;
  attachedMessage: (name: string, size: number) => string; artifactInspectionMessage: (adapter: string, status: string, ocr: string, warnings: number) => string; startedMessage: (time: string) => string;
  savedFocusMessage: (minutes: number) => string; healthMessage: (active: number, archived: number, history: number, artifacts: number, index: string, pressure?: "NORMAL" | "ELEVATED") => string; telemetryMessage: (replication: TelemetryStatus, backup: TelemetryStatus, outbox: TelemetryStatus, capability: TelemetryStatus, conflict: TelemetryStatus, storage: TelemetryStatus) => string;
  resultMessage: (count: number, index: string) => string;
}

const reviewTemplateLabelsEnglish: Record<ReviewTemplateId, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  project: "Project",
  decision: "Decision",
  intervention: "Intervention",
  domain: "Domain",
  system: "System"
};

const reviewPromptsEnglish: Record<string, string> = {
  capture: "What deserves a place in the canonical record?",
  attention: "What deserves attention now?",
  next: "What is the smallest admitted next action?",
  wins: "What moved forward?",
  open: "What remains unresolved?",
  evidence: "Which source or relationship should you review?",
  pattern: "What pattern changed?",
  commitments: "Which commitment needs a clear owner?",
  resources: "What resource or capacity constraint matters?",
  outcome: "What outcome is this project serving?",
  risk: "What risk needs an explicit decision?",
  question: "What question remains open?",
  change: "What intervention changed the state?",
  signal: "What signal supports the next choice?",
  signals: "Which domain signal is material?",
  exceptions: "Which exception should be clarified?",
  health: "Is the local system healthy?",
  recovery: "Is a portable recovery path current?",
  boundaries: "Which scope or permission boundary needs review?"
};

const reviewTemplateLabelsFrench: Record<ReviewTemplateId, string> = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  monthly: "Mensuelle",
  project: "Projet",
  decision: "Decision",
  intervention: "Intervention",
  domain: "Domaine",
  system: "Systeme"
};

const reviewPromptsFrench: Record<string, string> = {
  capture: "Qu'est-ce qui merite une place dans le dossier canonique?",
  attention: "Qu'est-ce qui merite votre attention maintenant?",
  next: "Quelle est la plus petite prochaine action admise?",
  wins: "Qu'est-ce qui a avance?",
  open: "Qu'est-ce qui reste non resolu?",
  evidence: "Quelle source ou relation devriez-vous revoir?",
  pattern: "Quel motif a change?",
  commitments: "Quel engagement a besoin d'un proprietaire clair?",
  resources: "Quelle contrainte de ressource ou de capacite compte?",
  outcome: "Quel resultat ce projet sert-il?",
  risk: "Quel risque exige une decision explicite?",
  question: "Quelle question reste ouverte?",
  change: "Quelle intervention a change l'etat?",
  signal: "Quel signal soutient le prochain choix?",
  signals: "Quel signal du domaine est important?",
  exceptions: "Quelle exception devrait etre clarifiee?",
  health: "Le systeme local est-il sain?",
  recovery: "Une voie de recuperation portable est-elle a jour?",
  boundaries: "Quelle limite de portee ou de permission doit etre revue?"
};

const onboardingEnglish: Pick<UiCopy, "onboardingHeading" | "onboardingHint" | "onboardingCapture" | "onboardingReview" | "onboardingRecovery" | "onboardingStart" | "onboardingDismiss" | "onboardingShow"> = {
  onboardingHeading: "Start with a small step",
  onboardingHint: "No account is required. Begin locally, keep meaning in canonical records, and export a Vault when you want a portable recovery copy.",
  onboardingCapture: "Capture a thought, task, or observation.",
  onboardingReview: "Review the proposal-only inbox, then search and revisit what you kept.",
  onboardingRecovery: "Use Vault export in Recovery before changing origins or browsers.",
  onboardingStart: "Go to Capture",
  onboardingDismiss: "Dismiss guide",
  onboardingShow: "Show getting-started guide"
};

const onboardingFrench: Pick<UiCopy, "onboardingHeading" | "onboardingHint" | "onboardingCapture" | "onboardingReview" | "onboardingRecovery" | "onboardingStart" | "onboardingDismiss" | "onboardingShow"> = {
  onboardingHeading: "Commencez par un petit pas",
  onboardingHint: "Aucun compte n'est requis. Commencez localement, gardez le sens dans les dossiers canoniques et exportez un Vault pour une copie de recuperation portable.",
  onboardingCapture: "Capturez une pensee, une tache ou une observation.",
  onboardingReview: "Revoyez la boite de propositions, puis recherchez et revisitez ce que vous gardez.",
  onboardingRecovery: "Utilisez l'export Vault dans Recuperation avant de changer d'origine ou de navigateur.",
  onboardingStart: "Aller a Capture",
  onboardingDismiss: "Masquer le guide",
  onboardingShow: "Afficher le guide de demarrage"
};

interface CleanupCopy {
  cleanupHeading: string;
  cleanupHint: string;
  cleanupImportedOnly: string;
  cleanupTrim: string;
  cleanupWhitespace: string;
  cleanupPreview: string;
  cleanupApply: string;
  cleanupStatus: (records: number, sources: number, proposals: number) => string;
  cleanupEmpty: string;
  cleanupTransform: string;
  cleanupDuplicate: string;
  cleanupAmbiguous: string;
  cleanupArchive: string;
  cleanupMarkReview: string;
  cleanupApplied: (updated: number, archived: number, review: number) => string;
  cleanupHistory: string;
  cleanupHistoryEmpty: string;
  cleanupHistoryEntry: (recipe: string, acceptedAt: string, inputs: number, updated: number, archived: number, review: number, chunks: number) => string;
}

const cleanupEnglish: CleanupCopy = {
  cleanupHeading: "Clean imported data",
  cleanupHint: "Preview safe transforms and review duplicate/entity matches before changing canonical records. Original source and provenance stay available; no fuzzy merge is offered.",
  cleanupImportedOnly: "Imported records only",
  cleanupTrim: "Trim text",
  cleanupWhitespace: "Normalize whitespace",
  cleanupPreview: "Preview cleanup",
  cleanupApply: "Apply selected decisions",
  cleanupStatus: (records, sources, proposals) => `${records} input record(s), ${sources} source group(s), ${proposals} proposal(s).`,
  cleanupEmpty: "No cleanup proposals for this input.",
  cleanupTransform: "Transform",
  cleanupDuplicate: "Exact duplicate",
  cleanupAmbiguous: "Ambiguous entity",
  cleanupArchive: "Archive selected duplicate(s)",
  cleanupMarkReview: "Keep unresolved for review",
  cleanupApplied: (updated, archived, review) => `Cleanup applied: ${updated} transformed, ${archived} archived, ${review} marked for review.`,
  cleanupHistory: "Cleanup history",
  cleanupHistoryEmpty: "No accepted cleanup recipe is stored yet.",
  cleanupHistoryEntry: (recipe, acceptedAt, inputs, updated, archived, review, chunks) => `${recipe} at ${acceptedAt}: ${inputs} input(s), ${updated} transformed, ${archived} archived, ${review} review marker(s), ${chunks} receipt chunk(s).`
};

const cleanupFrench: CleanupCopy = {
  cleanupHeading: "Nettoyer les donnees importees",
  cleanupHint: "Previsualisez les transformations sures et verifiez les doublons/entites avant de modifier les dossiers canoniques. La source et la provenance restent disponibles; aucune fusion floue n'est offerte.",
  cleanupImportedOnly: "Dossiers importes seulement",
  cleanupTrim: "Rogner le texte",
  cleanupWhitespace: "Normaliser les espaces",
  cleanupPreview: "Previsualiser le nettoyage",
  cleanupApply: "Appliquer les decisions choisies",
  cleanupStatus: (records, sources, proposals) => `${records} dossier(s) d'entree, ${sources} groupe(s) source, ${proposals} proposition(s).`,
  cleanupEmpty: "Aucune proposition de nettoyage pour cette entree.",
  cleanupTransform: "Transformation",
  cleanupDuplicate: "Doublon exact",
  cleanupAmbiguous: "Entite ambigue",
  cleanupArchive: "Archiver les doublons choisis",
  cleanupMarkReview: "Garder l'ambiguite pour revue",
  cleanupApplied: (updated, archived, review) => `Nettoyage applique: ${updated} transforme(s), ${archived} archive(s), ${review} marque(s) pour revue.`,
  cleanupHistory: "Historique du nettoyage",
  cleanupHistoryEmpty: "Aucune recette de nettoyage acceptee n'est encore stockee.",
  cleanupHistoryEntry: (recipe, acceptedAt, inputs, updated, archived, review, chunks) => `${recipe} a ${acceptedAt}: ${inputs} entree(s), ${updated} transformee(s), ${archived} archivee(s), ${review} marque(s) pour revue, ${chunks} bloc(s) de recu.`
};

const presentationQuickEnglish: Pick<UiCopy, "editLabel" | "labelRequired" | "pinSection" | "unpinSection"> = {
  editLabel: "Edit this label",
  labelRequired: "Enter a non-empty label.",
  pinSection: (label) => `Pin ${label}`,
  unpinSection: (label) => `Unpin ${label}`
};

const presentationQuickFrench: Pick<UiCopy, "editLabel" | "labelRequired" | "pinSection" | "unpinSection"> = {
  editLabel: "Modifier ce libelle",
  labelRequired: "Entrez un libelle non vide.",
  pinSection: (label) => `Epingler ${label}`,
  unpinSection: (label) => `Desepingler ${label}`
};

const presentationLensEnglish: Pick<UiCopy, "lenses" | "lensOverflow" | "lensHint" | "lensPinned" | "lensActive" | "lensNoRecords" | "openRecord" | "closeRecord" | "recordDetail" | "recordOverview" | "recordRelationships" | "recordEvidence" | "noRecordRelationships" | "noRecordEvidence" | "recordIdLabel" | "recordOwnerLabel" | "recordTruthLabel" | "recordSensitivityLabel" | "recordProvenanceLabel" | "recordEditLabel" | "recordEditHint" | "saveRecordEdit" | "recordEditSaved" | "recordEditUnavailable" | "recordEditSegmentStatus"> = {
  lenses: "Lenses",
  lensOverflow: "All lenses",
  lensHint: "Lenses are projection paths over canonical records; pinning changes presentation only.",
  lensPinned: "Pinned lenses",
  lensActive: "Active from overflow",
  lensNoRecords: "No records are currently projected here. Capture or retrieve a canonical record to populate this lens.",
  openRecord: "Open record",
  closeRecord: "Close record",
  recordDetail: "Canonical record detail",
  recordOverview: "Overview",
  recordRelationships: "Relationships",
  recordEvidence: "Evidence",
  noRecordRelationships: "No linked relationship records are available.",
  noRecordEvidence: "No linked evidence or annotation records are available.",
  recordIdLabel: "Canonical ID",
  recordOwnerLabel: "Owner",
  recordTruthLabel: "Truth class",
  recordSensitivityLabel: "Sensitivity",
  recordProvenanceLabel: "Provenance",
  recordEditLabel: "Editable text",
  recordEditHint: "This change uses the owning command and creates a new canonical revision. Derived Search state is not rebuilt automatically.",
  saveRecordEdit: "Save canonical text",
  recordEditSaved: (revision, index) => `Saved canonical revision ${revision}; derived Search remains ${index}. Repair the index from Recovery before searching.`,
  recordEditUnavailable: "This record has no editable text field in the current owner contract.",
  recordEditSegmentStatus: (label) => `${label} section shown.`
};

const presentationLensFrench: Pick<UiCopy, "lenses" | "lensOverflow" | "lensHint" | "lensPinned" | "lensActive" | "lensNoRecords" | "openRecord" | "closeRecord" | "recordDetail" | "recordOverview" | "recordRelationships" | "recordEvidence" | "noRecordRelationships" | "noRecordEvidence" | "recordIdLabel" | "recordOwnerLabel" | "recordTruthLabel" | "recordSensitivityLabel" | "recordProvenanceLabel" | "recordEditLabel" | "recordEditHint" | "saveRecordEdit" | "recordEditSaved" | "recordEditUnavailable" | "recordEditSegmentStatus"> = {
  lenses: "Lentilles",
  lensOverflow: "Toutes les lentilles",
  lensHint: "Les lentilles sont des projections des dossiers canoniques; l'epinglage ne change que la presentation.",
  lensPinned: "Lentilles epinglees",
  lensActive: "Active depuis le debordement",
  lensNoRecords: "Aucun dossier n'est actuellement projete ici. Capturez ou retrouvez un dossier canonique pour remplir cette lentille.",
  openRecord: "Ouvrir le dossier",
  closeRecord: "Fermer le dossier",
  recordDetail: "Detail du dossier canonique",
  recordOverview: "Apercu",
  recordRelationships: "Relations",
  recordEvidence: "Preuves",
  noRecordRelationships: "Aucune relation liee n'est disponible.",
  noRecordEvidence: "Aucune preuve ou annotation liee n'est disponible.",
  recordIdLabel: "Identifiant canonique",
  recordOwnerLabel: "Proprietaire",
  recordTruthLabel: "Classe de verite",
  recordSensitivityLabel: "Sensibilite",
  recordProvenanceLabel: "Provenance",
  recordEditLabel: "Texte modifiable",
  recordEditHint: "Cette modification utilise la commande proprietaire et cree une nouvelle revision canonique. L'etat derive de recherche n'est pas reconstruit automatiquement.",
  saveRecordEdit: "Enregistrer le texte canonique",
  recordEditSaved: (revision, index) => `Revision canonique ${revision} enregistree; la recherche derivee reste ${index}. Reparez l'index depuis Recuperation avant de rechercher.`,
  recordEditUnavailable: "Ce dossier n'a pas de champ texte modifiable dans le contrat actuel du proprietaire.",
  recordEditSegmentStatus: (label) => `Section ${label} affichee.`
};

const financeEnglish: Pick<UiCopy, "financeImportHeading" | "financeFile" | "financeAccount" | "financeOpening" | "financeClosing" | "financeImport" | "financeImportHint" | "financeImportResult" | "financeAnalysisResult"> = {
  financeImportHeading: "Import a statement",
  financeFile: "CSV statement",
  financeAccount: "Account identity",
  financeOpening: "Opening balance (optional)",
  financeClosing: "Closing balance (optional)",
  financeImport: "Import statement",
  financeImportHint: "Statements stay local. The original file is preserved as an Artifact; review reconciliation and exceptions before acceptance.",
  financeImportResult: (created, existing, duplicates, conflicts, reconciliation) => `Finance import: ${created} created, ${existing} already present, ${duplicates} duplicate(s), ${conflicts} conflict(s); reconciliation ${reconciliation.toLowerCase()}.`,
  financeAnalysisResult: (income, spending, net, pending, fees) => `Derived position: income ${income}; spending ${spending}; net cash flow ${net}; pending ${pending}; identified fees ${fees}.`
};

const financeFrench: Pick<UiCopy, "financeImportHeading" | "financeFile" | "financeAccount" | "financeOpening" | "financeClosing" | "financeImport" | "financeImportHint" | "financeImportResult" | "financeAnalysisResult"> = {
  financeImportHeading: "Importer un releve",
  financeFile: "Releve CSV",
  financeAccount: "Identite du compte",
  financeOpening: "Solde d'ouverture (facultatif)",
  financeClosing: "Solde de cloture (facultatif)",
  financeImport: "Importer le releve",
  financeImportHint: "Les releves restent locaux. Le fichier original est preserve comme artefact; verifiez le rapprochement et les exceptions avant l'acceptation.",
  financeImportResult: (created, existing, duplicates, conflicts, reconciliation) => `Import financier: ${created} cree(s), ${existing} deja present(s), ${duplicates} doublon(s), ${conflicts} conflit(s); rapprochement ${reconciliation.toLowerCase()}.`,
  financeAnalysisResult: (income, spending, net, pending, fees) => `Position derivee: revenus ${income}; depenses ${spending}; flux net ${net}; en attente ${pending}; frais identifies ${fees}.`
};

const financePlanEnglish: Pick<UiCopy, "financePlanHeading" | "financePlanKind" | "financeResource" | "financeGoal" | "financePlanLabel" | "financePlanAmount" | "financeGoalDate" | "financeMonthlySurplus" | "financePlanHint" | "saveFinancePlan" | "financePlanSaved" | "financeGoalStatus" | "financeGoalProgress"> = {
  financePlanHeading: "Plan a Finance resource or goal",
  financePlanKind: "Plan type",
  financeResource: "Shared resource",
  financeGoal: "Goal",
  financePlanLabel: "Label",
  financePlanAmount: "Amount",
  financeGoalDate: "Target date (optional)",
  financeMonthlySurplus: "Sustainable monthly surplus (optional)",
  financePlanHint: "Resources remain exact-money observations. Goals remain labelled assumptions and receive funding only through explicit typed allocations.",
  saveFinancePlan: "Save Finance plan",
  financePlanSaved: (kind) => `Saved a Finance ${kind}; it remains a canonical domain.finance record.`,
  financeGoalStatus: (goals, conflicts) => `Finance goals: ${goals}; ${conflicts} funding conflict(s) require review.`,
  financeGoalProgress: (label, funded, target, remaining, conflict) => `${label}: funded ${funded} of ${target}; remaining ${remaining}${conflict ? "; funding conflict requires review" : ""}.`
};

const financePlanFrench: Pick<UiCopy, "financePlanHeading" | "financePlanKind" | "financeResource" | "financeGoal" | "financePlanLabel" | "financePlanAmount" | "financeGoalDate" | "financeMonthlySurplus" | "financePlanHint" | "saveFinancePlan" | "financePlanSaved" | "financeGoalStatus" | "financeGoalProgress"> = {
  financePlanHeading: "Planifier une ressource ou un objectif financier",
  financePlanKind: "Type de plan",
  financeResource: "Ressource partagee",
  financeGoal: "Objectif",
  financePlanLabel: "Libelle",
  financePlanAmount: "Montant",
  financeGoalDate: "Date cible (facultatif)",
  financeMonthlySurplus: "Surplus mensuel durable (facultatif)",
  financePlanHint: "Les ressources restent des observations monetaires exactes. Les objectifs restent des hypotheses etiquetees et ne sont finances que par des allocations typees explicites.",
  saveFinancePlan: "Enregistrer le plan financier",
  financePlanSaved: (kind) => `Plan financier ${kind} enregistre; il reste un dossier canonique domain.finance.`,
  financeGoalStatus: (goals, conflicts) => `Objectifs financiers: ${goals}; ${conflicts} conflit(s) de financement exigent une revue.`,
  financeGoalProgress: (label, funded, target, remaining, conflict) => `${label}: finance ${funded} sur ${target}; restant ${remaining}${conflict ? "; conflit de financement a revoir" : ""}.`
};

const financeDashboardEnglish: Pick<UiCopy, "financeDashboard" | "financeNoData" | "financeIncome" | "financeSpending" | "financeNet" | "financePending" | "financeQuality" | "financeReviewCases" | "financeGraphStatus" | "financeAllocationConflicts" | "financeTransferStatus"> = {
  financeDashboard: "Finance projection",
  financeNoData: "No canonical Finance transactions are available yet.",
  financeIncome: "Income",
  financeSpending: "Spending",
  financeNet: "Net cash flow",
  financePending: "Pending",
  financeQuality: (status, limitations) => `Data quality: ${status.toLowerCase()}${limitations ? `; ${limitations} limitation(s)` : ""}.`,
  financeReviewCases: (count) => `${count} review signal(s) require explicit human review; no fraud or coercion claim is made.`,
  financeGraphStatus: (nodes, edges, invalidated) => `Typed Finance graph: ${nodes} node(s), ${edges} propagation/explanatory edge(s), ${invalidated} derived node(s) invalidated by the latest change.`,
  financeAllocationConflicts: (count) => `${count} allocation conflict(s) require review; no automatic reallocation was performed.`,
  financeTransferStatus: (matched, unresolved) => `Transfers/card payments: ${matched} pair(s) excluded from aggregate income/spending; ${unresolved} unmatched candidate(s) remain unresolved.`
};

const financeDashboardFrench: Pick<UiCopy, "financeDashboard" | "financeNoData" | "financeIncome" | "financeSpending" | "financeNet" | "financePending" | "financeQuality" | "financeReviewCases" | "financeGraphStatus" | "financeAllocationConflicts" | "financeTransferStatus"> = {
  financeDashboard: "Projection financiere",
  financeNoData: "Aucune transaction financiere canonique n'est encore disponible.",
  financeIncome: "Revenus",
  financeSpending: "Depenses",
  financeNet: "Flux de tresorerie net",
  financePending: "En attente",
  financeQuality: (status, limitations) => `Qualite des donnees: ${status.toLowerCase()}${limitations ? `; ${limitations} limitation(s)` : ""}.`,
  financeReviewCases: (count) => `${count} signal(s) exigent une revue humaine explicite; aucune fraude ou coercition n'est affirmee.`,
  financeGraphStatus: (nodes, edges, invalidated) => `Graphe financier type: ${nodes} noeud(s), ${edges} arete(s) de propagation/explicative, ${invalidated} noeud(s) derive(s) invalide(s) par le dernier changement.`,
  financeAllocationConflicts: (count) => `${count} conflit(s) d'allocation exigent une revue; aucune reallocation automatique n'a ete faite.`,
  financeTransferStatus: (matched, unresolved) => `Transferts/paiements de carte: ${matched} paire(s) exclue(s) des revenus/depenses agreges; ${unresolved} candidat(s) non apparies restent non resolus.`
};

const searchEnglish: Pick<UiCopy, "searchFilters" | "searchFacetLens" | "searchFacetType" | "searchFacetSpace" | "searchFacetArtifact" | "searchAll" | "searchHasArtifact" | "searchScope" | "searchMatch" | "searchSaveView" | "searchViewName" | "searchViewSaved" | "searchViewQueryRequired" | "searchFacetChip" | "searchGroup"> = {
  searchFilters: "Filters",
  searchFacetLens: "Lens",
  searchFacetType: "Record type",
  searchFacetSpace: "Space",
  searchFacetArtifact: "Artifact",
  searchAll: "All",
  searchHasArtifact: "Has an Artifact",
  searchScope: (scope) => `Scope: ${scope}. Results remain canonical and uncopied.`,
  searchMatch: (owner, lens) => `Match reason: ${owner} record projected through ${lens}.`,
  searchSaveView: "Save filtered view",
  searchViewName: "View name",
  searchViewSaved: "Saved a search view; it stores the query only and does not copy canonical records.",
  searchViewQueryRequired: "Enter search text or choose a facet before saving a view.",
  searchFacetChip: (key, value) => `${key}: ${value} ×`,
  searchGroup: (lens) => `${lens} lens results`
};

const searchFrench: Pick<UiCopy, "searchFilters" | "searchFacetLens" | "searchFacetType" | "searchFacetSpace" | "searchFacetArtifact" | "searchAll" | "searchHasArtifact" | "searchScope" | "searchMatch" | "searchSaveView" | "searchViewName" | "searchViewSaved" | "searchViewQueryRequired" | "searchFacetChip" | "searchGroup"> = {
  searchFilters: "Filtres",
  searchFacetLens: "Lentille",
  searchFacetType: "Type de dossier",
  searchFacetSpace: "Espace",
  searchFacetArtifact: "Artefact",
  searchAll: "Tous",
  searchHasArtifact: "Avec artefact",
  searchScope: (scope) => `Portee: ${scope}. Les resultats restent canoniques et non copies.`,
  searchMatch: (owner, lens) => `Raison: dossier ${owner} projete par ${lens}.`,
  searchSaveView: "Enregistrer la vue filtree",
  searchViewName: "Nom de la vue",
  searchViewSaved: "Vue de recherche enregistree; seule la requete est stockee, sans copie canonique.",
  searchViewQueryRequired: "Entrez du texte ou choisissez un filtre avant d'enregistrer une vue.",
  searchFacetChip: (key, value) => `${key}: ${value} ×`,
  searchGroup: (lens) => `Resultats de la lentille ${lens}`
};

const typedRelationshipEnglish: Pick<UiCopy, "typedRelationshipKind" | "typedReference" | "dependency" | "allocation" | "synergy" | "conflict" | "feedback" | "relationshipScenario" | "allocationMode" | "allocationAmount" | "allocationCurrency" | "exclusive" | "enabling" | "typedRelationshipHint" | "typedLinkCreated" | "scenarioRequired"> = {
  typedRelationshipKind: "Relationship type", typedReference: "Reference (existing)", dependency: "Dependency", allocation: "Allocation", synergy: "Synergy", conflict: "Conflict", feedback: "Feedback loop", relationshipScenario: "Scenario ID (optional)", allocationMode: "Allocation mode", allocationAmount: "Allocation amount (optional)", allocationCurrency: "Allocation currency", exclusive: "Exclusive", enabling: "Enabling", typedRelationshipHint: "Typed edges are canonical relationship records. Only Dependency and Allocation propagate; Synergy and Conflict are explanatory; Feedback requires an explicit scenario ID.", typedLinkCreated: "Created a typed relationship without copying either record.", scenarioRequired: "Feedback loops require an explicit scenario ID."
};

const typedRelationshipFrench: Pick<UiCopy, "typedRelationshipKind" | "typedReference" | "dependency" | "allocation" | "synergy" | "conflict" | "feedback" | "relationshipScenario" | "allocationMode" | "allocationAmount" | "allocationCurrency" | "exclusive" | "enabling" | "typedRelationshipHint" | "typedLinkCreated" | "scenarioRequired"> = {
  typedRelationshipKind: "Type de relation", typedReference: "Reference (existante)", dependency: "Dependance", allocation: "Allocation", synergy: "Synergie", conflict: "Conflit", feedback: "Boucle de retroaction", relationshipScenario: "ID de scenario (facultatif)", allocationMode: "Mode d'allocation", allocationAmount: "Montant alloue (facultatif)", allocationCurrency: "Devise de l'allocation", exclusive: "Exclusive", enabling: "Activante", typedRelationshipHint: "Les aretes typees sont des relations canoniques. Seules Dependance et Allocation se propagent; Synergie et Conflit sont explicatives; Retroaction exige un ID de scenario explicite.", typedLinkCreated: "Relation typee creee sans copier les dossiers.", scenarioRequired: "Les boucles de retroaction exigent un ID de scenario explicite."
};

const english: UiCopy = {
  ...typedRelationshipEnglish,
  ...searchEnglish,
  ...financeEnglish,
  ...financePlanEnglish,
  ...financeDashboardEnglish,
  ...presentationQuickEnglish,
  ...presentationLensEnglish,
  ...onboardingEnglish,
  ...cleanupEnglish,
  documentFinishHeading: "Finish a text Artifact locally",
  documentFinishSource: "Source Artifact",
  documentFinishTerms: "Terms to redact (comma-separated)",
  documentFinishReplacement: "Replacement",
  documentFinishSubmit: "Create redacted Artifact",
  documentFinishHint: "Bounded text/inert HTML only. The source payload stays unchanged; this is not a legal or cryptographic signature.",
  documentFinishSaved: (name, count) => `Created ${name}; redacted ${count} occurrence(s) as a derived Artifact.`,
  revertToRevision: (revision) => `Revert to revision ${revision}`,
  safeDirectRoute: "Safe direct route (explicit)", safeDirectRouteHint: "Use only when this capture is unambiguous; checked records bypass the inbox.", delete: "Delete",
  sources: "Sources / meaning", sourcesHeading: "Keep claims, annotations, and places linked", evidenceHeading: "Link evidence to a claim", subjectRecord: "Claim or subject record", evidenceRelation: "Evidence relation", supports: "Supports", contradicts: "Contradicts", qualifies: "Qualifies", derivesFrom: "Derived from", claim: "Claim", uncertainty: "Uncertainty (optional)", createEvidence: "Save evidence link", evidenceSaved: "Evidence link saved.", annotationHeading: "Annotate a source", annotationQuote: "Quoted source text", annotationNote: "Annotation", createAnnotation: "Save annotation", annotationSaved: "Annotation saved.", quoteMissing: "The quoted text must be present in the selected source.", placeHeading: "Capture a place", placeLabel: "Place label", latitude: "Latitude", longitude: "Longitude", optionalGeoJson: "GeoJSON Point (optional)", savePlace: "Save place", placeSaved: (label) => `Saved ${label} as a place.`, knowledgeStatus: (evidence, annotations, active, stale, orphaned, places) => `${evidence} evidence link(s), ${annotations} annotation(s), ${places} place(s); anchors: ${active} active, ${stale} stale, ${orphaned} orphaned.`, sourceRequired: "Choose a source record.",
  sharing: "Share / disclose", sharingHeading: "Export a bounded projection", shareRecipient: "Recipient or audience", sharePurpose: "Purpose", shareExpiry: "Expiry (optional)", shareGrant: "Active authorization", selectGrant: "Select an active grant", selectRecords: "Selected records", includePrivate: "Include selected private records", createGrant: "Create share grant", exportProjection: "Export bounded snapshot", sharingHint: "Only selected records authorized by the active grant are considered; private records stay out unless you explicitly include them.", grantSaved: "Share grant saved and can be revoked below.", grantRevoked: "Share grant revoked.", grantRequired: "Select an active grant that authorizes every selected record.", grantSpaceMismatch: "Every selected record must belong to the grant's declared Space.", projectionSaved: (included, omitted) => `Exported ${included} record(s); omitted ${omitted} selected record(s) by disclosure policy.`, shareSelectionRequired: "Select at least one record.", revoke: "Revoke", contextExportFormat: "Context handoff format", contextExportObjective: "User objective / instructions (optional)", contextExportBudget: "Context budget (bytes)", contextExport: "Export context handoff", contextExportRerun: "Rerun saved context", contextExportHint: "The handoff is a local, read-only projection. Source text is untrusted; credentials, permissions, and write authority never leave Omnevum.", contextExportSaved: (records, bytes, lossless) => `Context handoff exported: ${records} record(s), ${bytes} bytes${lossless ? "" : "; omissions or safe transformations are listed in the manifest"}.`,
  syncHeading: "Synchronize a bounded replica", syncEndpoint: "Owner-controlled HTTPS endpoint", syncRun: "Sync now", syncHint: "Optional provider-neutral sync. The endpoint must be HTTPS or localhost; credentials stay outside this form. Manual Vault remains the portable baseline.", syncResult: (imported, skipped, conflicts, tombstones) => `Sync completed: ${imported} imported, ${skipped} skipped, ${conflicts} conflict(s), ${tombstones} tombstone(s) preserved.`, syncPartial: (imported, skipped, conflicts, tombstones) => `Local merge completed (${imported} imported, ${skipped} skipped, ${conflicts} conflict(s), ${tombstones} tombstone(s) preserved), but remote push failed. Review local records before retrying.`,
  scopeWithoutCopying: "Bound records to a Space", spaceName: "New Space name", createSpace: "Create Space", spaceCreated: (space) => `Created ${space}; records remain canonical and uncopied.`, removeSpace: "Remove Space", removeSpaceConfirmation: (space) => `Remove ${space}? Canonical records will remain, but its memberships will be removed.`, assignToSpace: "Record", filterSpace: "View Space", allSpaces: "All Spaces", addMembership: "Add to Space", membershipCreated: (space) => `Record added to ${space}; the canonical record was not copied.`, activeMemberships: "Active memberships", removeMembership: "Remove membership", removeMembershipConfirmation: (record, space) => `Remove this record from ${space}? The canonical record will remain.\n\n${record}`, membershipRemoved: (space) => `Membership removed from ${space}; the canonical record remains.`, spaceRemoved: (space) => `Removed ${space}; canonical records remain.`, spaceAccessRevoked: (space) => `${space} is no longer available; showing all Spaces.`, historyHeading: "Revision history", historyEntry: (revision, time, changes) => `Revision ${revision} - ${time}; changed: ${changes}`, undoAvailable: (seconds) => `Archive undone within the ${seconds}-second recovery window.`,
  compose: "Compose / View", composeHeading: "Shape a reusable dashboard", viewTitle: "View title", viewFields: "Safe fields (comma-separated)", viewSpace: "Scope this view", defaultViewTitle: "My dashboard", saveView: "Save view", viewSaved: "Saved a reusable view; canonical records were not changed.", viewEmpty: "Save a view to preview a list, table, and descriptive chart.", chartLabel: "Descriptive record-type chart", tableLabel: "Table projection",
  derivedStatus: (records, sourceIds, groups) => `Derived Data projection: ${records} active record(s), ${sourceIds} source ID(s), ${groups} group(s). Descriptive only; no causal claim.`,
  telemetryMessage: (replication, backup, outbox, capability, conflict, storage) => { const label = (status: TelemetryStatus) => ({ READY: "ready", DISABLED: "disabled", CURRENT: "current", STALE: "stale", CLEAR: "clear", BACKLOGGED: "backlogged", DEGRADED: "degraded", UNRESOLVED: "unresolved", NORMAL: "normal", ELEVATED: "elevated", UNKNOWN: "unknown" }[status] ?? "unknown"); return `Telemetry: replication ${label(replication)}, backup ${label(backup)}, outbox ${label(outbox)}, capability ${label(capability)}, conflicts ${label(conflict)}, storage ${label(storage)}.`; },
  productHeading: "Life, in context.", foundation: "foundation", lede: "A private, local-first place to capture what matters.", system: "System", ready: "Local foundation ready", local: "LOCAL", healthInitial: "Canonical records stay in this browser until you export them.", healthy: "healthy", degraded: "degraded", home: "Home", currentPicture: "Your current picture", activeRecordCount: "active record count", visualize: "Visualize / Analyze", signals: "Shared signals", openTasks: "Open tasks", completedTasks: "Completed tasks", focusMinutes: "Focus minutes", relationships: "Relationships", personalization: "Personalization", makeItYours: "Make it yours", appName: "App name", language: "Language", english: "English (Canada)", french: "French (Canada)", save: "Save", presentationHint: "Presentation settings are inert and do not change canonical IDs.", tagline: "Tagline", density: "Layout density", comfortable: "Comfortable", compact: "Compact", typeface: "Typeface", systemTypeface: "System", serifTypeface: "Serif", monoTypeface: "Monospace", iconography: "Icon treatment", labelIconography: "Text labels", glyphIconography: "Text plus symbols", homeLabel: "Home label", captureLabel: "Capture label", recordsLabel: "Records label", navigationSections: "Navigation sections", navigationHint: "Check sections to keep visible; move rows to change order. Recovery and Personalization stay reachable.", homeWidgets: "Home surfaces", homeWidgetsHint: "Choose and reorder the summary surfaces. These settings only change presentation.", resetPresentation: "Reset presentation", exportPresentationProfile: "Export profile", importPresentationProfile: "Import profile", presentationProfileExported: "Exported presentation profile.", presentationProfileImported: "Imported presentation profile; canonical data was not changed.", capture: "Capture", getItOut: "Get it out of your head", kind: "Kind", note: "Note", task: "Task", observation: "Observation", space: "Space", acquireHeading: "Stage an import", stageImport: "Stage source", acquireFile: "Choose file", readClipboard: "Read clipboard", acceptStaged: "Accept staged records", acquirePlaceholder: "Paste text, JSON, CSV, or a URL", acquireHint: "Review candidates before canonical records are created; repeated source candidates are skipped.", stagedMessage: (count, warnings) => `Staged ${count} candidate(s)${warnings ? ` with ${warnings} warning(s)` : ""}.`, personal: "Personal", household: "Household", work: "Work", captureContent: "Capture content", capturePlaceholder: "Capture a thought, task, observation, or question.", captureHint: "Stored locally as one canonical record; new captures enter Review.", saveCapture: "Save capture", searchExplore: "Search / Explore", findCaptures: "Find across your captures", searchTerms: "Search terms", searchPlaceholder: "Try a word or phrase", search: "Search", clear: "Clear", triage: "Triage / Clarify", reviewInbox: "Review your inbox", inboxCount: "inbox count", inboxClear: "Your capture inbox is clear.", markReviewed: "Mark reviewed", defer: "Defer", clarify: "Clarify", triageStatus: (status) => status === "DEFERRED" ? "deferred" : status === "CLARIFY" ? "needs clarification" : "in inbox", triageProposal: (owners, types, actions) => `Proposal only - possible owner(s): ${owners}; type(s): ${types}; action(s): ${actions}. No canonical state changed.`, relate: "Relate", connectWithoutCopying: "Connect without copying", sourceRecord: "Source record", targetRecord: "Target record", relationship: "Relationship", createLink: "Create link", relationshipHint: "Links are reference records; the source records stay single-owner.", typedRelationshipKind: "Relationship type", typedReference: "Reference (existing)", dependency: "Dependency", allocation: "Allocation", synergy: "Synergy", conflict: "Conflict", feedback: "Feedback loop", relationshipScenario: "Scenario ID (optional)", allocationMode: "Allocation mode", exclusive: "Exclusive", enabling: "Enabling", typedRelationshipHint: "Typed edges are canonical relationship records. Only Dependency and Allocation propagate; Synergy and Conflict are explanatory; Feedback requires an explicit scenario ID.", typedLinkCreated: "Created a typed relationship without copying either record.", scenarioRequired: "Feedback loops require an explicit scenario ID.", timeObserve: "Time / Observe", track: "Track / Observe", trackHeading: "Record a measurement", metricName: "Metric name", value: "Value", unit: "Unit", trackPlaceholder: "For example: sleep quality", saveObservation: "Save observation", trackHint: "Numbers remain source observations and can be reused by views without a second owner.", trackSaved: (name) => `Saved ${name} as an observation.`, domains: "Domains", financeHeading: "Capture an expense", merchant: "Merchant", currency: "Currency", saveExpense: "Save expense", financeHint: "Money is stored as exact minor units with an explicit currency.", healthHeading: "Capture a health measurement", subject: "Subject identity", optionalNote: "Note (optional)", saveMeasurement: "Save measurement", healthHint: "Health observations require explicit subject identity and remain user observations.", expenseSaved: "Expense saved.", measurementSaved: "Measurement saved.", focusHeading: "Record a focus session", focusHint: "The session becomes a canonical observation when you stop it. No background tracking is used.", startFocus: "Start focus", stopFocus: "Stop focus", noActiveSession: "No active session.", canonicalRecords: "Canonical records", recentCaptures: "Recent captures", recordCount: "record count", nothingCaptured: "Nothing captured yet.", noMatching: "No matching captures.", taskDone: "task - done", complete: "Complete", undo: "Undo", archive: "Archive", archivedRecords: "Archived records", showArchived: "Show archived", hideArchived: "Hide archived", noArchived: "No archived records.", restore: "Restore", recovery: "Recovery", keepPortable: "Keep a portable copy", recoveryHint: "Vault export is the first off-origin recovery path. Import validates the format before writing.", exportVault: "Export Vault", exportDiagnostics: "Export diagnostics", repairSearch: "Repair search index", importVault: "Import Vault", attachArtifact: "Attach artifact", footerPhase0: "Phase 0 foundation", footerOptional: "AI remains optional; bounded provider-neutral sync and manual Vault portability are available.", themeLight: "Light theme", themeDark: "AMOLED dark", capturePicture: "Capture something to start your picture.", atLeastTwo: "Capture at least two records before creating a link.", linkCreated: "Created a reference link without duplicating either record.", showingAll: "Showing all active records.", exportMessage: (count) => `Exported ${count} record(s).`, diagnosticsMessage: "Exported privacy-minimized diagnostics; canonical content and credentials are excluded.", searchRepairMessage: "Rebuilt the derived search index; canonical records were not changed.", savedName: (name) => `Saved ${name}. Canonical identities are unchanged.`, importedMessage: (imported, skipped, conflicts) => `Imported ${imported} record(s); skipped ${skipped}${conflicts ? `, conflicts ${conflicts}` : ""}.`, attachedMessage: (name, size) => `Attached ${name} (${size} bytes).`, artifactInspectionMessage: (adapter, status, ocr, warnings) => `Adapter ${adapter} (${status}); OCR ${ocr.toLowerCase()}${warnings ? `; ${warnings} warning(s)` : ""}.`, startedMessage: (time) => `Started ${time}.`, savedFocusMessage: (minutes) => `Saved a ${minutes}-minute focus observation.`, healthMessage: (active, archived, history, artifacts, index, pressure) => `${active} active, ${archived} archived, ${history} revision snapshot(s), ${artifacts} artifact payload(s); search index ${index}.${pressure === "ELEVATED" ? " Storage pressure is elevated; export a Vault and replaceable state may be reclaimed." : ""}`, resultMessage: (count, index) => `${count} result(s); derived index ${index}.`,
  triageDetails: "Full provenance and proposal", triageProvenance: (source, capturedAt, owner, revision) => `Source ${source}; captured ${capturedAt}; owner ${owner}; revision ${revision}.`, triageSelectAll: "Select all visible inbox items", triageSelectItem: (text) => `Select triage item: ${text}`, triageSelected: (count) => `${count} selected`, triageBatchReview: "Mark selected reviewed", triageBatchDefer: "Defer selected", triageBatchDeferUntil: "Defer selected until", triageNoSelection: "Select at least one inbox item.", triageBatchResult: (successes, failures) => `Batch complete: ${successes} succeeded; ${failures} failed. Failed items remain in the inbox.`, triageBatchOutcome: (label, outcome) => `${label}: ${outcome}`,
  reviewHint: "Use a bounded reflection path when useful. Progress is local, resumable, and pressure-free; no reminders, streaks, or background tracking are created.", reviewTemplates: "Review templates", reviewTemplateName: (id) => reviewTemplateLabelsEnglish[id], reviewStart: "Start", reviewResume: "Resume", reviewSkip: "Skip step", reviewAbandon: "Close for now", reviewNext: "Next step", reviewFinish: "Finish review", reviewCompleted: "Review completed. Start again to create a fresh session.", reviewPartial: "Progress is saved locally; you can stop without completing the review.", reviewStep: (current, total) => `Step ${current} of ${total}`, reviewNoRecords: "No motivating records are available in this Space yet.", reviewPrompt: (key) => reviewPromptsEnglish[key] ?? key, reviewMotivation: "These existing records are context only. Open or change one explicitly; the review itself never creates a duplicate record.", reviewOpenRecord: "Open record", reviewMarkReviewed: "Mark reviewed", reviewCompleteTask: "Complete task",
  importPreviewMessage: (records, history, artifacts, imported, skipped, conflicts, hasPresentation, packageStates, automationRules) => `Vault preview: ${records} record(s), ${history} history entr${history === 1 ? "y" : "ies"}, ${artifacts} artifact payload(s); ${imported} will import, ${skipped} will skip${conflicts ? `, ${conflicts} conflict(s)` : ""}${hasPresentation ? "; presentation settings included" : ""}${packageStates ? `; ${packageStates} package state(s) included` : ""}${automationRules ? `; ${automationRules} automation rule(s) included` : ""}. Proceed?`,
  importCancelled: "Vault import cancelled; canonical data was not changed.",
  deferUntil: "Defer until",
  reference: "Keep as reference",
  route: "Route",
  split: "Split",
  splitKind: "Part type",
  splitParts: "Split parts",
  splitHint: "One part per line; the original source is retained as an archived provenance record.",
  splitSaved: (count) => `Split into ${count} canonical record(s); the staging source was archived.`,
  confirmationHeading: "Confirm action", confirm: "Confirm", automationHeading: "Declarative package automation", automationHint: "Rules are bounded data-only proposals. They have no direct credentials, network, storage, or effect authority; every accepted proposal uses the normal permission, confirmation, and CommandBus path.", automationPackage: "Package", automationRecord: "Authorized record", automationDocument: "Rule JSON", automationInstall: "Install rule", automationPreview: "Preview MANUAL", automationRules: "Installed rules", automationNoRules: "No package automation rules installed.", automationDisable: "Disable", automationEnable: "Enable", automationRemove: "Remove", automationProposals: "Pending proposals", automationNoProposals: "No proposals are pending.", automationApply: "Confirm and apply", automationInstalled: (ruleId) => `Installed ${ruleId}; it remains proposal-only until explicit confirmation.`, automationApplied: "Proposal applied through the normal command path.", factoryPreview: "Factory qualification", factoryAppHeading: "Generated Reading Log", factoryAppHint: "Opt-in qualification surface: this form and list are generated from a declarative package schema and use the canonical command path.", factoryAppSave: "Save generated record", factoryAppComplete: "Complete", factoryAppSaved: (title) => `Saved ${title} through the generated app contract.`, factoryAppEmpty: "No generated records yet.", factoryGameHeading: "Generated Constellation", factoryGameHint: "Deterministic game contract surface: keyboard and touch-safe buttons drive semantic actions; saves stay local to this browser.", factoryGameMove: "Move right", factoryGameCollect: "Collect star", factoryGamePause: "Pause", factoryGameResume: "Resume", factoryGameSave: "Save game", factoryGameLoad: "Load game", factoryGameStatus: (position, energy, stars, tick) => `Position ${position}; energy ${energy}; stars ${stars}; tick ${tick}.`, factoryGameSaved: "Game save persisted locally.", factoryGameLoaded: "Game save loaded locally.", effectOutboxHeading: "External effects / Outbox", effectOutboxHint: "Inspect durable effect state without exposing payloads or credentials. A retryable item can be re-queued; ambiguous items require reconciliation before replay.", effectNoMaterial: "No pending or failed external effects.", effectCancel: "Stop replay", effectRetry: "Re-queue retryable effect", effectCancelled: "Effect marked cancelled; no future replay will be attempted.", effectRetryQueued: "Retryable effect re-queued; an external adapter is still required to execute it.", effectStageHeading: "Stage an external connector action", effectDestination: "Connector endpoint", effectPurpose: "Action purpose", effectPayload: "JSON payload or stable reference", effectScope: "Authorization Space", effectStageHint: "Queueing is local-only and does not contact the endpoint. Credentials are not accepted here; the durable operation stores no raw secret. Replay revalidates authority, Space, disclosure, and schema.", effectQueue: "Queue action", effectQueued: "External action queued locally; no request was sent.", effectRunHeading: "Run configured external effects", effectRunEndpoint: "Endpoint to run", effectRunHint: "Running is explicit. Only operations with this exact destination are considered; ambiguous results are reconciled before any retry.", effectRun: "Run matching effects", effectRunConfirmation: "Run the matching external effects for", effectRunCancel: "Cancel", effectRunConfirm: "Run effects", effectRunResult: (processed, succeeded, attention) => `Processed ${processed} effect(s): ${succeeded} succeeded; ${attention} still need attention.`
};

const french: UiCopy = {
  ...typedRelationshipFrench,
  ...english,
  telemetryMessage: (replication, backup, outbox, capability, conflict, storage) => { const label = (status: TelemetryStatus) => ({ READY: "pret", DISABLED: "desactive", CURRENT: "actuelle", STALE: "perimee", CLEAR: "vide", BACKLOGGED: "en attente", DEGRADED: "degradee", UNRESOLVED: "non resolu", NORMAL: "normale", ELEVATED: "elevee", UNKNOWN: "inconnue" }[status] ?? "inconnue"); return `Telemetrie: replication ${label(replication)}, sauvegarde ${label(backup)}, effets ${label(outbox)}, capacite ${label(capability)}, conflits ${label(conflict)}, stockage ${label(storage)}.`; },
  ...searchFrench,
  ...financeFrench,
  ...financePlanFrench,
  ...financeDashboardFrench,
  ...presentationQuickFrench,
  ...presentationLensFrench,
  ...onboardingFrench,
  ...cleanupFrench,
  documentFinishHeading: "Finaliser localement un artefact texte",
  documentFinishSource: "Artefact source",
  documentFinishTerms: "Termes a redacter (separes par des virgules)",
  documentFinishReplacement: "Remplacement",
  documentFinishSubmit: "Creer l artefact redige",
  documentFinishHint: "Texte/HTML inerte limite seulement. Le payload source reste inchange; ce n est pas une signature legale ou cryptographique.",
  documentFinishSaved: (name, count) => `${name} cree; ${count} occurrence(s) redactee(s) dans un artefact derive.`,
  revertToRevision: (revision) => `Revenir a la revision ${revision}`,
  exportPresentationProfile: "Exporter le profil", importPresentationProfile: "Importer le profil", presentationProfileExported: "Profil de presentation exporte.", presentationProfileImported: "Profil de presentation importe; les donnees canoniques n'ont pas change.",
  safeDirectRoute: "Route directe sure (explicite)", safeDirectRouteHint: "Utilisez-la seulement si la capture est non ambigue; une capture cochee contourne la boite.", delete: "Supprimer",
  triageProposal: (owners, types, actions) => `Proposition seulement - proprietaire(s) possible(s): ${owners}; type(s): ${types}; action(s): ${actions}. Aucun etat canonique modifie.`,
  defer: "Reporter", clarify: "Clarifier", triageStatus: (status) => status === "DEFERRED" ? "reporte" : status === "CLARIFY" ? "a clarifier" : "dans la boite", sources: "Sources / sens", sourcesHeading: "Relier les claims, annotations et lieux", evidenceHeading: "Relier une preuve a un claim", subjectRecord: "Dossier du claim ou sujet", evidenceRelation: "Relation de preuve", supports: "Soutient", contradicts: "Contredit", qualifies: "Qualifie", derivesFrom: "Derive de", claim: "Claim", uncertainty: "Incertitude (facultatif)", createEvidence: "Enregistrer le lien de preuve", evidenceSaved: "Lien de preuve enregistre.", annotationHeading: "Annoter une source", annotationQuote: "Texte cite", annotationNote: "Annotation", createAnnotation: "Enregistrer l'annotation", annotationSaved: "Annotation enregistree.", quoteMissing: "Le texte cite doit etre present dans la source choisie.", placeHeading: "Capturer un lieu", placeLabel: "Nom du lieu", latitude: "Latitude", longitude: "Longitude", optionalGeoJson: "Point GeoJSON (facultatif)", savePlace: "Enregistrer le lieu", placeSaved: (label) => `${label} enregistre comme lieu.`, knowledgeStatus: (evidence, annotations, active, stale, orphaned, places) => `${evidence} lien(s) de preuve, ${annotations} annotation(s), ${places} lieu(x); ancres: ${active} actives, ${stale} anciennes, ${orphaned} orphelines.`, sourceRequired: "Choisissez un dossier source.",
  sharing: "Partager / divulguer", sharingHeading: "Exporter une projection limitee", shareRecipient: "Destinataire ou audience", sharePurpose: "But", shareExpiry: "Expiration (facultatif)", shareGrant: "Autorisation active", selectGrant: "Choisir une autorisation active", selectRecords: "Dossiers selectionnes", includePrivate: "Inclure les dossiers prives selectionnes", createGrant: "Creer l'autorisation de partage", exportProjection: "Exporter un instantane limite", sharingHint: "Seuls les dossiers autorises par l'autorisation active sont consideres; les dossiers prives restent exclus sauf inclusion explicite.", grantSaved: "Autorisation enregistree et retractable ci-dessous.", grantRevoked: "Autorisation de partage retractee.", grantRequired: "Choisissez une autorisation active qui couvre chaque dossier selectionne.", grantSpaceMismatch: "Chaque dossier selectionne doit appartenir a l'espace declare de l'autorisation.", projectionSaved: (included, omitted) => `${included} dossier(s) exporte(s); ${omitted} dossier(s) selectionne(s) omis selon la politique.`, shareSelectionRequired: "Selectionnez au moins un dossier.", revoke: "Retracter", contextExportFormat: "Format de remise de contexte", contextExportObjective: "Objectif / instructions de l'utilisateur (facultatif)", contextExportBudget: "Budget de contexte (octets)", contextExport: "Exporter la remise de contexte", contextExportRerun: "Relancer le contexte enregistre", contextExportHint: "La remise est une projection locale en lecture seule. Le texte source n'est pas une instruction; identifiants, permissions et autorite d'ecriture restent dans Omnevum.", contextExportSaved: (records, bytes, lossless) => `Remise de contexte exportee: ${records} dossier(s), ${bytes} octets${lossless ? "" : "; omissions ou transformations sures dans le manifeste"}.`,
  syncHeading: "Synchroniser une replique limitee", syncEndpoint: "Point de terminaison HTTPS controle", syncRun: "Synchroniser", syncHint: "Synchronisation facultative et neutre au fournisseur. Le point de terminaison doit etre HTTPS ou localhost; les identifiants restent hors de ce formulaire. Le Vault manuel demeure la base portable.", syncResult: (imported, skipped, conflicts, tombstones) => `Synchronisation terminee: ${imported} importe(s), ${skipped} ignore(s), ${conflicts} conflit(s), ${tombstones} tombstone(s) conserve(s).`, syncPartial: (imported, skipped, conflicts, tombstones) => `Fusion locale terminee (${imported} importe(s), ${skipped} ignore(s), ${conflicts} conflit(s), ${tombstones} tombstone(s) conserve(s)), mais l'envoi distant a echoue. Verifiez les dossiers locaux avant de recommencer.`,
  acquireFile: "Choisir un fichier", readClipboard: "Lire le presse-papiers",
  scopeWithoutCopying: "Associer des dossiers a un espace", spaceName: "Nom du nouvel espace", createSpace: "Creer l'espace", spaceCreated: (space) => `${space} cree; les dossiers restent canoniques et non copies.`, removeSpace: "Supprimer l'espace", removeSpaceConfirmation: (space) => `Supprimer ${space}? Les dossiers canoniques resteront, mais ses appartenances seront retirees.`, assignToSpace: "Dossier", filterSpace: "Voir l'espace", allSpaces: "Tous les espaces", addMembership: "Ajouter a l'espace", membershipCreated: (space) => `Dossier ajoute a ${space}; le dossier canonique n'a pas ete copie.`, activeMemberships: "Appartenances actives", removeMembership: "Retirer l'appartenance", removeMembershipConfirmation: (record, space) => `Retirer ce dossier de ${space}? Le dossier canonique restera.\n\n${record}`, membershipRemoved: (space) => `Appartenance retiree de ${space}; le dossier canonique reste.`, spaceRemoved: (space) => `${space} supprime; les dossiers canoniques restent.`, spaceAccessRevoked: (space) => `${space} n'est plus disponible; tous les espaces sont affiches.`, historyHeading: "Historique des revisions", historyEntry: (revision, time, changes) => `Revision ${revision} - ${time}; changements: ${changes}`, undoAvailable: (seconds) => `Archivage annule dans la fenetre de recuperation de ${seconds} secondes.`,
  compose: "Composer / Vue", composeHeading: "Creer un tableau de bord reutilisable", viewTitle: "Titre de la vue", viewFields: "Champs surs (separes par des virgules)", viewSpace: "Limiter cette vue a l'espace", defaultViewTitle: "Mon tableau de bord", saveView: "Enregistrer la vue", viewSaved: "Vue reutilisable enregistree; les dossiers canoniques n'ont pas change.", viewEmpty: "Enregistrez une vue pour previsualiser une liste, un tableau et un graphique descriptif.", chartLabel: "Graphique descriptif par type", tableLabel: "Projection tabulaire",
  derivedStatus: (records, sourceIds, groups) => `Projection de donnees derivee: ${records} dossier(s) actif(s), ${sourceIds} identifiant(s) source, ${groups} groupe(s). Descriptif seulement; aucune causalite.`,
  productHeading: "La vie, en contexte.", foundation: "fondation", lede: "Un espace prive et local pour noter ce qui compte.", system: "Systeme", ready: "Fondation locale prete", local: "LOCAL", healthInitial: "Les donnees canoniques restent dans ce navigateur jusqu'a leur exportation.", healthy: "sain", degraded: "degrade", home: "Accueil", currentPicture: "Votre situation actuelle", activeRecordCount: "nombre de dossiers actifs", visualize: "Visualiser / Analyser", signals: "Signaux partages", openTasks: "Taches ouvertes", completedTasks: "Taches terminees", focusMinutes: "Minutes de concentration", relationships: "Relations", personalization: "Personnalisation", makeItYours: "Faites-le votre", appName: "Nom de l'application", language: "Langue", english: "Anglais (Canada)", french: "Francais (Canada)", save: "Enregistrer", presentationHint: "Les reglages de presentation ne modifient pas les identifiants canoniques.", tagline: "Slogan", density: "Densite de mise en page", comfortable: "Confortable", compact: "Compacte", typeface: "Police", systemTypeface: "Systeme", serifTypeface: "Serif", monoTypeface: "Monospace", iconography: "Traitement des icones", labelIconography: "Libelles texte", glyphIconography: "Texte et symboles", homeLabel: "Libelle Accueil", captureLabel: "Libelle Capture", recordsLabel: "Libelle Dossiers", navigationSections: "Sections de navigation", navigationHint: "Cochez les sections visibles et deplacez les lignes pour changer l ordre. Recuperation et Personnalisation restent accessibles.", homeWidgets: "Surfaces Accueil", homeWidgetsHint: "Choisissez et reordonnez les surfaces de synthese. Ces reglages ne changent que la presentation.", resetPresentation: "Reinitialiser la presentation", capture: "Capture", getItOut: "Sortez-le de votre tete", kind: "Type", note: "Note", task: "Tache", observation: "Observation", space: "Espace", personal: "Personnel", household: "Menage", work: "Travail", captureContent: "Contenu", capturePlaceholder: "Note, tache, observation ou question.", captureHint: "Stocke localement comme un dossier canonique; les nouvelles captures vont au triage.", saveCapture: "Enregistrer", searchExplore: "Recherche / Exploration", findCaptures: "Trouvez vos captures", searchTerms: "Termes de recherche", searchPlaceholder: "Essayez un mot ou une phrase", search: "Rechercher", clear: "Effacer", triage: "Triage / Clarification", reviewInbox: "Revoir votre boite", inboxCount: "nombre dans la boite", inboxClear: "Votre boite de capture est vide.", markReviewed: "Marquer revue", relate: "Relier", connectWithoutCopying: "Relier sans copier", sourceRecord: "Dossier source", targetRecord: "Dossier cible", relationship: "Relation", createLink: "Creer le lien", relationshipHint: "Les liens sont des references; les dossiers gardent un seul proprietaire.", timeObserve: "Temps / Observation", track: "Suivi / Observation", trackHeading: "Enregistrer une mesure", metricName: "Nom de la mesure", value: "Valeur", unit: "Unite", trackPlaceholder: "Par exemple: qualite du sommeil", saveObservation: "Enregistrer l'observation", trackHint: "Les nombres restent des observations sources et peuvent etre reutilises sans second proprietaire.", trackSaved: (name) => `${name} enregistre comme observation.`, domains: "Domaines", financeHeading: "Enregistrer une depense", merchant: "Marchand", currency: "Devise", saveExpense: "Enregistrer la depense", financeHint: "L'argent est stocke en unites mineures exactes avec une devise explicite.", healthHeading: "Enregistrer une mesure de sante", subject: "Identite du sujet", optionalNote: "Note (facultatif)", saveMeasurement: "Enregistrer la mesure", healthHint: "Les observations de sante exigent une identite de sujet explicite et restent des observations utilisateur.", expenseSaved: "Depense enregistree.", measurementSaved: "Mesure de sante enregistree.", focusHeading: "Enregistrer une session de concentration", focusHint: "La session devient une observation canonique a l'arret. Aucun suivi en arriere-plan.", startFocus: "Commencer", stopFocus: "Arreter", noActiveSession: "Aucune session active.", canonicalRecords: "Dossiers canoniques", recentCaptures: "Captures recentes", recordCount: "nombre de dossiers", nothingCaptured: "Aucune capture.", noMatching: "Aucune capture correspondante.", taskDone: "tache - terminee", complete: "Terminer", undo: "Annuler", archive: "Archiver", archivedRecords: "Dossiers archives", showArchived: "Afficher les archives", hideArchived: "Masquer les archives", noArchived: "Aucun dossier archive.", restore: "Restaurer", recovery: "Recuperation", keepPortable: "Garder une copie portable", recoveryHint: "L'export Vault est la premiere voie de recuperation hors origine. L'import valide le format avant l'ecriture.", exportVault: "Exporter le Vault", exportDiagnostics: "Exporter le diagnostic", repairSearch: "Reparer l'index", importVault: "Importer un Vault", attachArtifact: "Joindre un artefact", footerPhase0: "Fondation Phase 0", footerOptional: "L'IA reste facultative; la synchronisation neutre et la portabilite Vault sont disponibles.", themeLight: "Theme clair", themeDark: "AMOLED dark", capturePicture: "Ajoutez une capture pour commencer.", atLeastTwo: "Capturez au moins deux dossiers avant de creer un lien.", linkCreated: "Lien de reference cree sans dupliquer les dossiers.", showingAll: "Tous les dossiers actifs sont affiches.", exportMessage: (count) => `${count} dossier(s) exporte(s).`, diagnosticsMessage: "Diagnostic minimise exporte; le contenu canonique et les identifiants secrets sont exclus.", searchRepairMessage: "Index de recherche derive reconstruit; les dossiers canoniques n'ont pas change.", savedName: (name) => `${name} enregistre. Les identites canoniques sont inchangees.`, importedMessage: (imported, skipped, conflicts) => `${imported} dossier(s) importe(s); ${skipped} ignore(s)${conflicts ? `, conflits ${conflicts}` : ""}.`, attachedMessage: (name, size) => `${name} joint (${size} octets).`, startedMessage: (time) => `Commence a ${time}.`, savedFocusMessage: (minutes) => `Observation de concentration de ${minutes} minute(s) enregistree.`, healthMessage: (active, archived, history, artifacts, index, pressure) => `${active} actif(s), ${archived} archive(s), ${history} revision(s), ${artifacts} artefact(s); index ${index}.${pressure === "ELEVATED" ? " La pression de stockage est elevee; exportez un Vault et des donnees remplacables peuvent etre recuperees." : ""}`, resultMessage: (count, index) => `${count} resultat(s); index derive ${index}.`,
  triageDetails: "Provenance et proposition completes", triageProvenance: (source, capturedAt, owner, revision) => `Source ${source}; capture ${capturedAt}; proprietaire ${owner}; revision ${revision}.`, triageSelectAll: "Selectionner tous les elements visibles", triageSelectItem: (text) => `Selectionner l'element de triage: ${text}`, triageSelected: (count) => `${count} selectionne(s)`, triageBatchReview: "Marquer les selections comme revues", triageBatchDefer: "Reporter les selections", triageBatchDeferUntil: "Reporter les selections jusqu'a", triageNoSelection: "Selectionnez au moins un element de la boite.", triageBatchResult: (successes, failures) => `Lot termine: ${successes} reussi(s); ${failures} echec(s). Les echecs restent dans la boite.`, triageBatchOutcome: (label, outcome) => `${label}: ${outcome}`,
  reviewHint: "Utilisez un parcours de reflexion limite au besoin. La progression est locale, reprenable et sans pression; aucun rappel, aucune serie et aucun suivi en arriere-plan ne sont crees.", reviewTemplates: "Modeles de revue", reviewTemplateName: (id) => reviewTemplateLabelsFrench[id], reviewStart: "Commencer", reviewResume: "Reprendre", reviewSkip: "Passer l'etape", reviewAbandon: "Fermer pour maintenant", reviewNext: "Etape suivante", reviewFinish: "Terminer la revue", reviewCompleted: "Revue terminee. Recommencez pour creer une nouvelle session.", reviewPartial: "La progression est enregistree localement; vous pouvez vous arreter sans terminer la revue.", reviewStep: (current, total) => `Etape ${current} sur ${total}`, reviewNoRecords: "Aucun dossier de contexte n'est encore disponible dans cet espace.", reviewPrompt: (key) => reviewPromptsFrench[key] ?? key, reviewMotivation: "Ces dossiers existants servent seulement de contexte. Ouvrez-en ou modifiez-en un explicitement; la revue ne cree jamais de doublon.", reviewOpenRecord: "Ouvrir le dossier", reviewMarkReviewed: "Marquer comme revu", reviewCompleteTask: "Terminer la tache",
  importPreviewMessage: (records, history, artifacts, imported, skipped, conflicts, hasPresentation, packageStates, automationRules) => `Apercu du Vault: ${records} dossier(s), ${history} entree(s) d'historique, ${artifacts} artefact(s); ${imported} seront importes, ${skipped} ignores${conflicts ? `, ${conflicts} conflit(s)` : ""}${hasPresentation ? "; reglages de presentation inclus" : ""}${packageStates ? `; ${packageStates} etat(s) de paquet inclus` : ""}${automationRules ? `; ${automationRules} regle(s) d'automatisation incluses` : ""}. Continuer?`,
  importCancelled: "Importation du Vault annulee; les donnees canoniques n'ont pas change.",
  deferUntil: "Reporter jusqu'a",
  reference: "Garder comme reference",
  route: "Router",
  split: "Diviser",
  splitKind: "Type de partie",
  splitParts: "Parties a diviser",
  splitHint: "Une partie par ligne; la source originale reste archivee comme provenance.",
  splitSaved: (count) => `Divise en ${count} dossier(s) canoniques; la source de triage est archivee.`,
  confirmationHeading: "Confirmer l'action", confirm: "Confirmer", factoryPreview: "Qualification de la fabrique", factoryAppHeading: "Journal de lecture genere", factoryAppHint: "Surface de qualification facultative: ce formulaire et cette liste sont generes depuis un schema de paquet declaratif et utilisent le chemin de commandes canonique.", factoryAppSave: "Enregistrer le dossier genere", factoryAppComplete: "Terminer", factoryAppSaved: (title) => `${title} enregistre par le contrat d'application genere.`, factoryAppEmpty: "Aucun dossier genere pour le moment.", factoryGameHeading: "Constellation genere", factoryGameHint: "Surface du contrat de jeu deterministe: les boutons accessibles pilotent des actions semantiques; les sauvegardes restent locales a ce navigateur.", factoryGameMove: "Avancer a droite", factoryGameCollect: "Recueillir l'etoile", factoryGamePause: "Mettre en pause", factoryGameResume: "Reprendre", factoryGameSave: "Sauvegarder le jeu", factoryGameLoad: "Charger le jeu", factoryGameStatus: (position, energy, stars, tick) => `Position ${position}; energie ${energy}; etoiles ${stars}; cycle ${tick}.`, factoryGameSaved: "Sauvegarde du jeu conservee localement.", factoryGameLoaded: "Sauvegarde du jeu chargee localement.", effectOutboxHeading: "Effets externes / Outbox", effectOutboxHint: "Inspectez l'etat durable des effets sans exposer les payloads ni les identifiants. Un effet reessayable peut etre remis en file; les effets ambigus exigent une reconciliation avant la reprise.", effectNoMaterial: "Aucun effet externe en attente ou en echec.", effectCancel: "Arreter la reprise", effectRetry: "Remettre l'effet en file", effectCancelled: "Effet annule; aucune reprise future ne sera tentee.", effectRetryQueued: "Effet reessayable remis en file; un adaptateur externe reste requis pour l'executer.", effectStageHeading: "Preparer une action de connecteur externe", effectDestination: "Point de terminaison du connecteur", effectPurpose: "But de l'action", effectPayload: "Payload JSON ou reference stable", effectScope: "Espace d'autorisation", effectStageHint: "La mise en file est locale et ne contacte pas le point de terminaison. Les identifiants ne sont pas acceptes ici; l'operation durable ne stocke aucun secret brut. La reprise revalide l'autorite, l'espace, la divulgation et le schema.", effectQueue: "Mettre l'action en file", effectQueued: "Action externe mise en file localement; aucune requete envoyee.", effectRunHeading: "Executer les effets externes configures", effectRunEndpoint: "Point de terminaison a executer", effectRunHint: "L'execution est explicite. Seules les operations avec cette destination exacte sont considerees; les resultats ambigus sont reconcilies avant toute reprise.", effectRun: "Executer les effets correspondants", effectRunConfirmation: "Executer les effets externes correspondants pour", effectRunCancel: "Annuler", effectRunConfirm: "Executer les effets", effectRunResult: (processed, succeeded, attention) => `${processed} effet(s) traite(s): ${succeeded} reussi(s); ${attention} necessitent encore une attention.`
};

export function getUiCopy(locale: PresentationLocale): UiCopy {
  return locale === "fr-CA" ? french : english;
}

export function getInstalledMetadataStatus(locale: PresentationLocale, standalone: boolean): string {
  if (locale === "fr-CA") {
    return standalone
      ? "PLATFORM_LIMITED: cette installation peut avoir capture le nom, l'icone et l'ecran de demarrage controles par le navigateur ou le systeme. Si ces metadonnees restent anciennes, utilisez le parcours de rafraichissement, de re-ajout ou de reinstallation pris en charge par l'hote; ce profil ne modifie ni les donnees canoniques ni l'identite technique d'installation."
      : "PLATFORM_LIMITED: le navigateur ou le systeme peut capturer le nom, l'icone et l'ecran de demarrage au moment de l'installation. Pour une future installation, utilisez le parcours pris en charge par l'hote; ce profil ne modifie ni les donnees canoniques ni l'identite technique d'installation.";
  }
  return standalone
    ? "PLATFORM_LIMITED: this installation may have captured the browser/OS-controlled name, icon, and splash at install time. If those metadata stay stale, use the host-supported refresh, re-add, or reinstall path; this profile changes neither canonical data nor technical install identity."
    : "PLATFORM_LIMITED: the browser/OS may capture the name, icon, and splash at install time. For a future install, use the host-supported path; this profile changes neither canonical data nor technical install identity.";
}

export function localeDirection(locale: PresentationLocale): "ltr" | "rtl" {
  return locale === "fr-CA" ? "ltr" : "ltr";
}

export function formatNumber(locale: PresentationLocale, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDateTime(locale: PresentationLocale, value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : value;
}

const captureKindLabels: Record<PresentationLocale, Record<CaptureKind, string>> = {
  "en-CA": { note: "Note", task: "Task", observation: "Observation", expense: "Expense", measurement: "Measurement", workout: "Workout", event: "Event", person: "Person", goal: "Goal", decision: "Decision", url: "URL", voice: "Voice transcript", file: "File reference", image: "Image reference", source: "Source" },
  "fr-CA": { note: "Note", task: "Tache", observation: "Observation", expense: "Depense", measurement: "Mesure", workout: "Entrainement", event: "Evenement", person: "Personne", goal: "Objectif", decision: "Decision", url: "URL", voice: "Transcription vocale", file: "Reference de fichier", image: "Reference d'image", source: "Source" }
};

export function captureKindLabel(locale: PresentationLocale, kind: CaptureKind): string {
  return captureKindLabels[locale][kind];
}

export interface RecoveryCopy {
  password: string;
  passwordHint: string;
  exportEncrypted: string;
  encryptedExported: string;
  passwordRequired: string;
  requestPersistence: string;
  safePresentation: string;
  safePresentationActive: string;
  safePresentationHint: string;
  clearCanonical: string;
  clearConfirmation: string;
  clearImpact: (impact: CanonicalClearImpact) => string;
  clearedCanonical: string;
}

const recoveryCopy: Record<PresentationLocale, RecoveryCopy> = {
  "en-CA": { password: "Optional Vault password", passwordHint: "Used only for this action; it is never stored.", exportEncrypted: "Export encrypted Vault", encryptedExported: "Exported an integrity-protected encrypted Vault.", passwordRequired: "Enter an 8-character Vault password for encrypted recovery.", requestPersistence: "Request persistent storage", safePresentation: "Use Safe Presentation Mode", safePresentationActive: "Exit Safe Presentation Mode", safePresentationHint: "Safe mode uses a known-good built-in presentation for this session and preserves the stored profile.", clearCanonical: "Clear canonical data", clearConfirmation: "Clear all canonical records, history, artifacts, effect operations, and package saves? Export a Vault first if you may need recovery.", clearImpact: (impact) => `Hard clear impact: ${impact.canonicalRecords} canonical record(s), ${impact.relationships} relationship record(s), ${impact.historyEntries} history entr${impact.historyEntries === 1 ? "y" : "ies"}, ${impact.artifactPayloads} artifact payload(s), all ${impact.effectOperations} effect operation(s) including ${impact.pendingEffects} pending/uncertain one(s), ${impact.packageStates} package save(s), and ${impact.automationRules} automation rule(s) will be removed. ${impact.orphanedRelationships > 0 ? `Graph impact is UNKNOWN for ${impact.orphanedRelationships} relationship(s) with unresolved endpoints. ` : "Graph impact is fully enumerated. "}Preserved relationships: ${impact.preservedRelationships}; recovery window: ${impact.reversibilityWindowSeconds} seconds (no undo). Export and verify a Vault first.`, clearedCanonical: "Canonical data cleared. Presentation settings remain available." },
  "fr-CA": { password: "Mot de passe Vault facultatif", passwordHint: "Utilise seulement pour cette action; il n'est jamais stocke.", exportEncrypted: "Exporter le Vault chiffre", encryptedExported: "Vault chiffre et protege par integrite exporte.", passwordRequired: "Entrez un mot de passe Vault de 8 caracteres pour la recuperation chiffre.", requestPersistence: "Demander la persistance du stockage", safePresentation: "Utiliser le mode de presentation securise", safePresentationActive: "Quitter le mode de presentation securise", safePresentationHint: "Le mode securise utilise une presentation integree fiable pour cette session et preserve le profil stocke.", clearCanonical: "Effacer les donnees canoniques", clearConfirmation: "Effacer tous les dossiers canoniques, l'historique, les artefacts, les operations d'effet et les sauvegardes de paquets? Exportez d'abord un Vault si vous pourriez avoir besoin d'une recuperation.", clearImpact: (impact) => `Impact de l'effacement: ${impact.canonicalRecords} dossier(s), ${impact.relationships} relation(s), ${impact.historyEntries} entree(s) d'historique, ${impact.artifactPayloads} artefact(s), les ${impact.effectOperations} operation(s) d'effet dont ${impact.pendingEffects} en attente/incertaine(s), ${impact.packageStates} sauvegarde(s) de paquet et ${impact.automationRules} regle(s) d'automatisation seront supprimes. ${impact.orphanedRelationships > 0 ? `Impact du graphe INCONNU pour ${impact.orphanedRelationships} relation(s) sans extremites resolues. ` : "Impact du graphe entierement enumere. "}Relations preservees: ${impact.preservedRelationships}; fenetre de recuperation: ${impact.reversibilityWindowSeconds} seconde(s) (aucune annulation). Exportez et verifiez un Vault d'abord.`, clearedCanonical: "Donnees canoniques effacees. Les reglages de presentation restent disponibles." }
};

export function getRecoveryCopy(locale: PresentationLocale): RecoveryCopy {
  return recoveryCopy[locale];
}

export interface TimeCopy {
  reminders: string;
  considerations: string;
  considerationsHeading: string;
  focusMode: string;
  focusModeActive: string;
  noDue: string;
  dueOnResume: string;
  deliveryLimited: string;
  sourceEvidence: string;
  uncertainty: string;
  whyAppeared: string;
  whyDueOnResume: string;
  snooze: string;
  dismiss: string;
  reminderHeading: string;
  reminderTitle: string;
  reminderDueAt: string;
  saveReminder: string;
  reminderSaved: string;
  reminderHint: string;
  telemetry: string;
  telemetryThresholds: string;
  telemetryThresholdHint: string;
  telemetryBackupAge: string;
  telemetryOutboxThreshold: string;
  telemetryConflictThreshold: string;
  telemetrySaveThresholds: string;
  telemetryThresholdsSaved: string;
  telemetryEvidence: string;
  telemetryDismiss: string;
  telemetryRestore: string;
  telemetryState: (fact: string, status: TelemetryStatus) => string;
}

const timeCopy: Record<PresentationLocale, TimeCopy> = {
  "en-CA": { reminders: "Attention / reminders", considerations: "Considerations", considerationsHeading: "What deserves consideration?", focusMode: "Focus mode", focusModeActive: "Exit focus mode", noDue: "Nothing deserves attention.", dueOnResume: "Due on resume", deliveryLimited: "Delivery is opportunistic; the reminder remains canonical.", sourceEvidence: "Source/evidence", uncertainty: "Uncertainty", whyAppeared: "Why this appeared", whyDueOnResume: "The due time was reached and this reminder was reconciled on resume.", snooze: "Snooze 24 hours", dismiss: "Dismiss", reminderHeading: "Create a reminder", reminderTitle: "Reminder title", reminderDueAt: "Due date and time", saveReminder: "Save reminder", reminderSaved: "Reminder saved.", reminderHint: "The due state remains canonical; exact closed-app delivery is not promised.", telemetry: "Runtime telemetry", telemetryThresholds: "Telemetry thresholds", telemetryThresholdHint: "Thresholds are local, inspectable, and used only for explicit Home escalation; no background notification is created.", telemetryBackupAge: "Backup stale after days", telemetryOutboxThreshold: "Outbox attention at pending effects", telemetryConflictThreshold: "Conflict attention at unresolved conflicts", telemetrySaveThresholds: "Save thresholds", telemetryThresholdsSaved: "Telemetry thresholds saved locally.", telemetryEvidence: "Evidence", telemetryDismiss: "Dismiss item", telemetryRestore: "Restore item", telemetryState: (fact, status) => `Telemetry ${fact}: ${status}.` },
  "fr-CA": { reminders: "Attention / rappels", considerations: "Considerations", considerationsHeading: "Qu'est-ce qui merite votre attention?", focusMode: "Mode concentration", focusModeActive: "Quitter le mode concentration", noDue: "Rien ne merite votre attention.", dueOnResume: "Du a la reprise", deliveryLimited: "La livraison est opportuniste; le rappel reste canonique.", sourceEvidence: "Source/preuve", uncertainty: "Incertitude", whyAppeared: "Pourquoi cet element apparait", whyDueOnResume: "L'echeance est atteinte et ce rappel a ete reconcilie a la reprise.", snooze: "Reporter de 24 heures", dismiss: "Ignorer", reminderHeading: "Creer un rappel", reminderTitle: "Titre du rappel", reminderDueAt: "Date et heure d'echeance", saveReminder: "Enregistrer le rappel", reminderSaved: "Rappel enregistre.", reminderHint: "L'etat d'echeance reste canonique; aucune livraison exacte hors application n'est promise.", telemetry: "Telemetrie d'execution", telemetryThresholds: "Seuils de telemetrie", telemetryThresholdHint: "Les seuils sont locaux et inspectables; ils servent seulement a une escalade explicite sur l'Accueil, sans notification en arriere-plan.", telemetryBackupAge: "Sauvegarde perimee apres jours", telemetryOutboxThreshold: "Attention Outbox a partir des effets en attente", telemetryConflictThreshold: "Attention conflit a partir des conflits non resolus", telemetrySaveThresholds: "Enregistrer les seuils", telemetryThresholdsSaved: "Seuils de telemetrie enregistres localement.", telemetryEvidence: "Preuve", telemetryDismiss: "Ignorer l'element", telemetryRestore: "Restaurer l'element", telemetryState: (fact, status) => `Telemetrie ${fact} : ${status}.` }
};

export function getTimeCopy(locale: PresentationLocale): TimeCopy {
  return timeCopy[locale];
}

export interface DeviceInputCopy {
  heading: string;
  hint: string;
  capabilities: string;
  share: string;
  location: string;
  camera: string;
  microphone: string;
  barcode: string;
  manualFallback: string;
  noDataRetained: string;
  ready: string;
  shared: string;
  locationStaged: string;
  mediaGranted: (kind: string) => string;
  barcodeFound: (count: number) => string;
  currentLocation: string;
}

const deviceInputCopy: Record<PresentationLocale, DeviceInputCopy> = {
  "en-CA": {
    heading: "Device / Input",
    hint: "Access is requested only after an explicit action. Captured values route through Acquire or Place; camera and microphone streams are released immediately.",
    capabilities: "Available capabilities",
    share: "Share app link",
    location: "Use current location",
    camera: "Check camera",
    microphone: "Check microphone",
    barcode: "Scan image / QR",
    manualFallback: "Use the manual or file fallback when this capability is unavailable.",
    noDataRetained: "No device data was retained by this check.",
    ready: "Device/Input broker ready.",
    shared: "Share sheet opened; no canonical data changed.",
    locationStaged: "Location staged in the Place form; review and save it explicitly.",
    mediaGranted: (kind) => `${kind} access granted and released; no media was retained.`,
    barcodeFound: (count) => `Found ${count} code(s); the first result was staged through Acquire.`,
    currentLocation: "Current location"
  },
  "fr-CA": {
    heading: "Appareil / entree",
    hint: "L'acces est demande seulement apres une action explicite. Les valeurs passent par Acquisition ou Lieu; les flux camera et microphone sont liberes immediatement.",
    capabilities: "Capacites disponibles",
    share: "Partager le lien de l'application",
    location: "Utiliser la position actuelle",
    camera: "Verifier la camera",
    microphone: "Verifier le microphone",
    barcode: "Scanner une image / QR",
    manualFallback: "Utilisez le remplacement manuel ou fichier quand cette capacite est indisponible.",
    noDataRetained: "Aucune donnee de l'appareil n'a ete conservee par cette verification.",
    ready: "Le courtier Appareil/entree est pret.",
    shared: "La feuille de partage est ouverte; aucune donnee canonique n'a change.",
    locationStaged: "La position est preparee dans le formulaire Lieu; verifiez-la et enregistrez-la explicitement.",
    mediaGranted: (kind) => `Acces ${kind} accorde puis libere; aucun media n'a ete conserve.`,
    barcodeFound: (count) => `${count} code(s) trouve(s); le premier resultat est passe par Acquisition.`,
    currentLocation: "Position actuelle"
  }
};

export function getDeviceInputCopy(locale: PresentationLocale): DeviceInputCopy {
  return deviceInputCopy[locale];
}

export type StoragePersistenceState = "GRANTED" | "DENIED" | "UNAVAILABLE";

export function getStoragePersistenceNotice(locale: PresentationLocale, state: StoragePersistenceState): string {
  if (locale === "fr-CA") {
    return state === "GRANTED"
      ? "Persistance du stockage : accordee."
      : `Persistance du stockage : ${state === "DENIED" ? "refusee" : "indisponible"}; exportez un Vault pour la portabilite.`;
  }
  return state === "GRANTED"
    ? "Storage persistence: granted."
    : `Storage persistence: ${state.toLowerCase()}; export a Vault for portability.`;
}

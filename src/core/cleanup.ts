import type { CanonicalRecord } from "./model";

export const MAX_CLEANUP_RECORDS = 10_000;
export const MAX_CLEANUP_OPERATIONS = 8;
export const MAX_CLEANUP_CLUSTERS = 2_000;

export type CleanupOperation =
  | { kind: "TRIM_TEXT" }
  | { kind: "NORMALIZE_WHITESPACE" };

export interface CleanupRecipe {
  schemaVersion: 1;
  recipeId: string;
  name: string;
  operations: CleanupOperation[];
}

export type CleanupProposalKind = "TRANSFORM" | "EXACT_DUPLICATE" | "AMBIGUOUS_MATCH";
export type CleanupProposalDisposition = "APPLY_TRANSFORM" | "REVIEW_REQUIRED";

export interface CleanupProposal {
  proposalId: string;
  kind: CleanupProposalKind;
  disposition: CleanupProposalDisposition;
  recordIds: string[];
  sourceIds: string[];
  reason: string;
  beforeText?: string;
  afterText?: string;
}

export interface CleanupSourceGroup {
  sourceId: string;
  recordIds: string[];
}

export interface CleanupPreview {
  recipe: CleanupRecipe;
  recordIds: string[];
  sourceGroups: CleanupSourceGroup[];
  proposals: CleanupProposal[];
  replayFingerprint: string;
}

export type CleanupDecisionAction = "APPLY_TRANSFORM" | "ARCHIVE_EXACT_DUPLICATE" | "KEEP" | "MARK_REVIEW";

export interface CleanupDecision {
  proposalId: string;
  action: CleanupDecisionAction;
  archiveRecordIds?: string[];
}

export interface CleanupApplyPlan {
  updates: Array<{ recordId: string; data: Record<string, unknown> }>;
  archiveRecordIds: string[];
  reviewRecordIds: string[];
  receipt: CleanupReceipt;
}

export interface CleanupReceipt {
  schemaVersion: 1;
  recipe: CleanupRecipe;
  inputRecordIds: string[];
  decisions: CleanupDecision[];
  replayFingerprint: string;
}

interface TransformedRecord {
  record: CanonicalRecord;
  data: Record<string, unknown>;
  beforeText?: string;
  afterText?: string;
}

export function previewCleanup(records: CanonicalRecord[], recipe: CleanupRecipe): CleanupPreview {
  validateRecipe(recipe);
  if (records.length > MAX_CLEANUP_RECORDS) throw new Error("Cleanup input exceeds the bounded 10,000-record limit");

  const activeRecords = records.filter((record) => !record.deleted);
  const transformed = activeRecords.map((record) => transformRecord(record, recipe));
  const proposals: CleanupProposal[] = [];
  const sourceGroups = new Map<string, string[]>();

  for (const item of transformed) {
    const sourceId = item.record.provenance.sourceId ?? `record:${item.record.id}`;
    const ids = sourceGroups.get(sourceId) ?? [];
    ids.push(item.record.id);
    sourceGroups.set(sourceId, ids);
    if (item.beforeText !== item.afterText) {
      proposals.push({
        proposalId: `cleanup:transform:${item.record.id}`,
        kind: "TRANSFORM",
        disposition: "APPLY_TRANSFORM",
        recordIds: [item.record.id],
        sourceIds: [sourceId],
        reason: "Deterministic text transformation is available for explicit acceptance.",
        ...(item.beforeText !== undefined ? { beforeText: item.beforeText } : {}),
        ...(item.afterText !== undefined ? { afterText: item.afterText } : {})
      });
    }
  }

  const clusters = new Map<string, TransformedRecord[]>();
  for (const item of transformed) {
    const text = item.afterText?.trim();
    if (!text) continue;
    const key = `${item.record.recordType}|${item.record.owner}|${normalizeIdentityText(text)}`;
    const bucket = clusters.get(key) ?? [];
    bucket.push(item);
    clusters.set(key, bucket);
  }

  const entityClusters = new Map<string, TransformedRecord[]>();
  for (const item of transformed) {
    const entityKey = stableEntityKey(item.record);
    if (!entityKey) continue;
    const key = `${item.record.recordType}|${item.record.owner}|${entityKey}`;
    const bucket = entityClusters.get(key) ?? [];
    bucket.push(item);
    entityClusters.set(key, bucket);
  }

  for (const bucket of clusters.values()) {
    if (bucket.length < 2) continue;
    const recordIds = bucket.map((item) => item.record.id).sort();
    const sourceIds = uniqueSourceIds(bucket);
    proposals.push({
      proposalId: `cleanup:duplicate:${recordIds.join(",")}`,
      kind: "EXACT_DUPLICATE",
      disposition: "REVIEW_REQUIRED",
      recordIds,
      sourceIds,
      reason: "Records share the same owner, type, and normalized text; choose explicitly which duplicate(s), if any, to archive."
    });
  }

  for (const bucket of entityClusters.values()) {
    if (bucket.length < 2) continue;
    const normalizedTexts = new Set(bucket.map((item) => normalizeIdentityText(item.afterText ?? "")));
    if (normalizedTexts.size < 2) continue;
    const recordIds = bucket.map((item) => item.record.id).sort();
    proposals.push({
      proposalId: `cleanup:ambiguous:${recordIds.join(",")}`,
      kind: "AMBIGUOUS_MATCH",
      disposition: "REVIEW_REQUIRED",
      recordIds,
      sourceIds: uniqueSourceIds(bucket),
      reason: "The same stable imported entity key has different content; no fuzzy merge or overwrite is permitted."
    });
  }

  if (proposals.filter((proposal) => proposal.kind !== "TRANSFORM").length > MAX_CLEANUP_CLUSTERS) throw new Error("Cleanup produced too many review clusters");
  const normalizedRecipe = structuredClone(recipe);
  const inputRecordIds = activeRecords.map((record) => record.id).sort();
  const normalizedProposals = proposals.sort((left, right) => left.proposalId.localeCompare(right.proposalId));
  return {
    recipe: normalizedRecipe,
    recordIds: inputRecordIds,
    sourceGroups: [...sourceGroups.entries()].map(([sourceId, recordIds]) => ({ sourceId, recordIds: [...recordIds].sort() })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    proposals: normalizedProposals,
    replayFingerprint: fingerprint({ recipe: normalizedRecipe, recordIds: inputRecordIds, proposals: normalizedProposals })
  };
}

export function replayCleanup(records: CanonicalRecord[], recipe: CleanupRecipe): CleanupPreview {
  return previewCleanup(records, recipe);
}

export function applyCleanupDecisions(records: CanonicalRecord[], preview: CleanupPreview, decisions: CleanupDecision[]): CleanupApplyPlan {
  const byId = new Map(records.map((record) => [record.id, record]));
  const proposals = new Map(preview.proposals.map((proposal) => [proposal.proposalId, proposal]));
  const updates = new Map<string, Record<string, unknown>>();
  const archiveRecordIds = new Set<string>();
  const reviewRecordIds = new Set<string>();

  for (const decision of decisions) {
    const proposal = proposals.get(decision.proposalId);
    if (!proposal) throw new Error("Cleanup decision references an unknown proposal");
    if (decision.action === "APPLY_TRANSFORM") {
      if (proposal.kind !== "TRANSFORM") throw new Error("Only transform proposals can be applied as transforms");
      const record = byId.get(proposal.recordIds[0] ?? "");
      if (!record) throw new Error("Cleanup transform record is missing");
      updates.set(record.id, transformRecord(record, preview.recipe).data);
    } else if (decision.action === "ARCHIVE_EXACT_DUPLICATE") {
      if (proposal.kind !== "EXACT_DUPLICATE") throw new Error("Only exact-duplicate proposals can be archived");
      const selected = decision.archiveRecordIds ?? [];
      if (selected.length === 0 || selected.some((id) => !proposal.recordIds.includes(id)) || new Set(selected).size !== selected.length || selected.length >= proposal.recordIds.length) throw new Error("Choose one or more, but not all, exact duplicates to archive");
      selected.forEach((id) => archiveRecordIds.add(id));
    } else if (decision.action === "MARK_REVIEW") {
      decision.archiveRecordIds?.forEach((id) => { if (!proposal.recordIds.includes(id)) throw new Error("Review marker references an unrelated record"); });
      (decision.archiveRecordIds?.length ? decision.archiveRecordIds : proposal.recordIds).forEach((id) => reviewRecordIds.add(id));
    } else if (decision.action !== "KEEP") {
      throw new Error("Unsupported cleanup decision");
    }
  }

  return {
    updates: [...updates.entries()].map(([recordId, data]) => ({ recordId, data })).sort((left, right) => left.recordId.localeCompare(right.recordId)),
    archiveRecordIds: [...archiveRecordIds].sort(),
    reviewRecordIds: [...reviewRecordIds].sort(),
    receipt: { schemaVersion: 1, recipe: structuredClone(preview.recipe), inputRecordIds: [...preview.recordIds], decisions: structuredClone(decisions), replayFingerprint: preview.replayFingerprint }
  };
}

function validateRecipe(recipe: CleanupRecipe): void {
  if (recipe.schemaVersion !== 1 || !/^[a-z][a-z0-9._-]{1,80}$/.test(recipe.recipeId) || !recipe.name.trim() || recipe.name.length > 160 || !Array.isArray(recipe.operations) || recipe.operations.length === 0 || recipe.operations.length > MAX_CLEANUP_OPERATIONS) throw new Error("Cleanup recipe is invalid");
  const kinds = new Set<string>();
  for (const operation of recipe.operations) {
    if (!operation || (operation.kind !== "TRIM_TEXT" && operation.kind !== "NORMALIZE_WHITESPACE") || kinds.has(operation.kind)) throw new Error("Cleanup recipe operation is invalid or duplicated");
    kinds.add(operation.kind);
  }
}

function transformRecord(record: CanonicalRecord, recipe: CleanupRecipe): TransformedRecord {
  const data = structuredClone(record.data);
  const beforeText = typeof data.text === "string" ? data.text : undefined;
  let afterText = beforeText;
  for (const operation of recipe.operations) {
    if (afterText === undefined) break;
    if (operation.kind === "TRIM_TEXT") afterText = afterText.trim();
    if (operation.kind === "NORMALIZE_WHITESPACE") afterText = afterText.normalize("NFKC").replace(/\s+/gu, " ").trim();
  }
  if (afterText !== undefined) data.text = afterText;
  return { record, data, ...(beforeText !== undefined ? { beforeText } : {}), ...(afterText !== undefined ? { afterText } : {}) };
}

function stableEntityKey(record: CanonicalRecord): string | undefined {
  const fields = record.data.sourceFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  const sourceFields = fields as Record<string, unknown>;
  for (const key of ["externalId", "external_id", "entityId", "entity_id", "email", "accountId", "account_id"]) {
    const value = sourceFields[key];
    if (typeof value === "string" && value.trim()) return `${key}:${normalizeIdentityText(value)}`;
  }
  return undefined;
}

function uniqueSourceIds(items: TransformedRecord[]): string[] {
  return [...new Set(items.map((item) => item.record.provenance.sourceId ?? `record:${item.record.id}`))].sort();
}

function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-CA");
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, child) => {
    if (!child || typeof child !== "object" || Array.isArray(child)) return child;
    return Object.fromEntries(Object.entries(child as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
  });
}

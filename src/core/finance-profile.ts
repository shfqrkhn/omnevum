import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import type { FinanceSourceClass, FinanceStatementSource } from "./finance";

export const FINANCE_PARSER_PROFILE_KIND = "finance-parser-profile" as const;
const PROFILE_SCHEMA_VERSION = 1 as const;
const PROFILE_OWNER = "domain.finance" as const;
const MAX_HEADERS = 128;
const MAX_PROFILE_REASON_LENGTH = 240;

export type FinanceParserFormat = "CSV";
export type FinanceParserSignConvention = "SIGNED_AMOUNT" | "DEBIT_CREDIT";
export type FinanceParserField = "postedAt" | "description" | "amount" | "debit" | "credit" | "currency" | "sourceTransactionId" | "status" | "essential" | "category";

export interface FinanceParserProfileScope {
  accountId: string;
  sourceClass: FinanceSourceClass;
  format: FinanceParserFormat;
  sourceKey?: string;
}

export type FinanceParserColumnMap = Partial<Record<FinanceParserField, string>> & Pick<Record<FinanceParserField, string>, "postedAt" | "description">;

export interface FinanceParserProfileProvenance {
  sourceId: string;
  sourceSha256: string;
  sourceArtifactId?: string;
  capturedAt: string;
}

export interface FinanceParserProfileDraft {
  scope: FinanceParserProfileScope;
  delimiter: "," | "\t";
  headers: readonly string[];
  columnMap: FinanceParserColumnMap;
  signConvention: FinanceParserSignConvention;
  provenance: FinanceParserProfileProvenance;
}

export interface FinanceParserProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  profileId: string;
  profileRevision: number;
  scope: FinanceParserProfileScope;
  delimiter: "," | "\t";
  headers: string[];
  headerFingerprint: string;
  columnMap: FinanceParserColumnMap;
  signConvention: FinanceParserSignConvention;
  fingerprint: string;
  provenance: FinanceParserProfileProvenance;
  priorProfileFingerprints?: string[];
  priorProvenance?: FinanceParserProfileProvenance[];
  admission: "INITIAL" | "EXPLICIT_REVIEW";
  review?: { reviewedAt: string; reason: string };
}

export interface FinanceParserProfileObservation {
  accountId: string;
  sourceClass: FinanceSourceClass;
  format: FinanceParserFormat;
  sourceKey?: string;
  delimiter: "," | "\t";
  headers: readonly string[];
  signConvention: FinanceParserSignConvention;
}

export type FinanceParserProfileAssessmentStatus = "STABLE" | "DRIFT" | "OUT_OF_SCOPE" | "INVALID";

export interface FinanceParserProfileAssessment {
  status: FinanceParserProfileAssessmentStatus;
  canApply: boolean;
  reasons: string[];
  observedHeaderFingerprint?: string;
}

export interface FinanceParserProfileApproval {
  expectedPreviousFingerprint: string;
  reason: string;
}

export interface FinanceParserProfileSaveResult {
  record: CanonicalRecord;
  profile: FinanceParserProfile;
  created: boolean;
  changed: boolean;
  idempotent: boolean;
}

export class FinanceParserProfileValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "FinanceParserProfileValidationError";
  }
}

export class FinanceParserProfileReviewRequiredError extends Error {
  public constructor(message = "Finance parser profile change requires explicit review before application") {
    super(message);
    this.name = "FinanceParserProfileReviewRequiredError";
  }
}

export function createFinanceParserProfileDraft(source: FinanceStatementSource, input: Omit<FinanceParserProfileDraft, "scope" | "provenance"> & { sourceKey?: string }): FinanceParserProfileDraft {
  const sourceClass = source.sourceClass ?? "UNKNOWN";
  return {
    ...input,
    scope: { accountId: source.accountId, sourceClass, format: "CSV", ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}) },
    provenance: { sourceId: source.sourceId, sourceSha256: source.sha256, ...(source.sourceArtifactId ? { sourceArtifactId: source.sourceArtifactId } : {}), capturedAt: new Date().toISOString() }
  };
}

export function createFinanceParserProfile(draft: FinanceParserProfileDraft): FinanceParserProfile {
  const normalized = normalizeDraft(draft);
  const content = profileContent(normalized);
  const fingerprint = stableFingerprint(content);
  const scope = normalized.scope;
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId: profileIdForScope(scope),
    profileRevision: 1,
    scope,
    delimiter: normalized.delimiter,
    headers: normalized.headers,
    headerFingerprint: stableFingerprint(normalized.headers),
    columnMap: normalized.columnMap,
    signConvention: normalized.signConvention,
    fingerprint,
    provenance: normalized.provenance,
    admission: "INITIAL"
  };
}

export function fingerprintFinanceParserProfile(profile: FinanceParserProfile): string {
  assertFinanceParserProfile(profile);
  return stableFingerprint(profileContent(profile));
}

export function assessFinanceParserProfile(profile: unknown, observation: FinanceParserProfileObservation): FinanceParserProfileAssessment {
  try {
    assertFinanceParserProfile(profile);
    const normalizedObservation = normalizeObservation(observation);
    const reasons: string[] = [];
    if (profile.scope.accountId !== normalizedObservation.accountId || profile.scope.sourceClass !== normalizedObservation.sourceClass || profile.scope.format !== normalizedObservation.format || (profile.scope.sourceKey ?? undefined) !== (normalizedObservation.sourceKey ?? undefined)) {
      return { status: "OUT_OF_SCOPE", canApply: false, reasons: ["source or format scope does not match the persisted Finance parser profile"] };
    }
    const observedHeaderFingerprint = stableFingerprint(normalizedObservation.headers);
    if (profile.headerFingerprint !== observedHeaderFingerprint) reasons.push("header structure fingerprint changed");
    if (profile.delimiter !== normalizedObservation.delimiter) reasons.push("delimiter changed");
    if (profile.signConvention !== normalizedObservation.signConvention) reasons.push("amount sign convention changed");
    return { status: reasons.length > 0 ? "DRIFT" : "STABLE", canApply: reasons.length === 0, reasons, observedHeaderFingerprint };
  } catch (error) {
    return { status: "INVALID", canApply: false, reasons: [error instanceof Error ? error.message : "Finance parser profile is invalid"] };
  }
}

export function requireFinanceParserProfileApplicable(profile: unknown, observation: FinanceParserProfileObservation): asserts profile is FinanceParserProfile {
  assertFinanceParserProfile(profile);
  const assessment = assessFinanceParserProfile(profile, observation);
  if (!assessment.canApply) throw new FinanceParserProfileValidationError(`Finance parser profile cannot be applied: ${assessment.reasons.join("; ")}`);
}

export async function loadFinanceParserProfile(commands: CommandBus, scope: FinanceParserProfileScope): Promise<FinanceParserProfile | undefined> {
  const normalizedScope = normalizeScope(scope);
  const profiles = (await commands.list(true))
    .filter((record) => !record.deleted && record.owner === PROFILE_OWNER && record.data.kind === FINANCE_PARSER_PROFILE_KIND)
    .map(readProfileRecord);
  const matches = profiles.filter((profile) => sameScope(profile.scope, normalizedScope));
  if (matches.length > 1) throw new FinanceParserProfileValidationError("Multiple Finance parser profiles match the same account/source/format scope");
  return matches[0];
}

export async function saveFinanceParserProfile(commands: CommandBus, draft: FinanceParserProfileDraft, approval?: FinanceParserProfileApproval): Promise<FinanceParserProfileSaveResult> {
  const candidate = createFinanceParserProfile(draft);
  const existing = await loadFinanceParserProfile(commands, candidate.scope);
  if (!existing) {
    const record = await commands.create({
      id: candidate.profileId,
      recordType: "observation",
      owner: PROFILE_OWNER,
      truthClass: "DERIVED",
      provenance: { source: "IMPORT", sourceId: candidate.provenance.sourceId, capturedAt: candidate.provenance.capturedAt },
      data: profileRecordData(candidate)
    });
    return { record, profile: candidate, created: true, changed: false, idempotent: false };
  }
  if (existing.fingerprint === candidate.fingerprint) {
    const record = await commands.get(existing.profileId, true);
    if (!record || record.deleted) throw new FinanceParserProfileValidationError("Persisted Finance parser profile disappeared during idempotent reload");
    return { record, profile: existing, created: false, changed: false, idempotent: true };
  }
  if (!approval) throw new FinanceParserProfileReviewRequiredError();
  if (approval.expectedPreviousFingerprint !== existing.fingerprint) throw new FinanceParserProfileReviewRequiredError("Finance parser profile approval is stale; reload the current profile before approving the change");
  const reason = approval.reason.trim().slice(0, MAX_PROFILE_REASON_LENGTH);
  if (!reason) throw new FinanceParserProfileValidationError("Explicit Finance parser profile review requires a reason");
  const reviewed: FinanceParserProfile = {
    ...candidate,
    profileRevision: existing.profileRevision + 1,
    provenance: candidate.provenance,
    priorProfileFingerprints: [...new Set([...(existing.priorProfileFingerprints ?? []), existing.fingerprint])],
    priorProvenance: [...(existing.priorProvenance ?? []), existing.provenance].filter((provenance, index, all) => all.findIndex((candidate) => candidate.sourceId === provenance.sourceId && candidate.sourceSha256 === provenance.sourceSha256) === index),
    admission: "EXPLICIT_REVIEW",
    review: { reviewedAt: new Date().toISOString(), reason }
  };
  const currentRecord = await commands.get(existing.profileId, true);
  if (!currentRecord || currentRecord.deleted) throw new FinanceParserProfileValidationError("Persisted Finance parser profile disappeared before review could be applied");
  const record = await commands.update(existing.profileId, profileRecordData(reviewed), currentRecord.revision);
  return { record, profile: reviewed, created: false, changed: true, idempotent: false };
}

function profileRecordData(profile: FinanceParserProfile): Record<string, unknown> {
  return { kind: FINANCE_PARSER_PROFILE_KIND, profile: structuredClone(profile) };
}

function readProfileRecord(record: CanonicalRecord): FinanceParserProfile {
  if (!record.data.profile || typeof record.data.profile !== "object") throw new FinanceParserProfileValidationError("Persisted Finance parser profile is missing its profile payload");
  assertFinanceParserProfile(record.data.profile);
  if (record.id !== record.data.profile.profileId) throw new FinanceParserProfileValidationError("Persisted Finance parser profile identity does not match its canonical record");
  return structuredClone(record.data.profile);
}

export function assertFinanceParserProfile(value: unknown): asserts value is FinanceParserProfile {
  if (!isRecord(value)) throw new FinanceParserProfileValidationError("Finance parser profile must be an object");
  if (value.schemaVersion !== PROFILE_SCHEMA_VERSION || typeof value.profileId !== "string" || typeof value.profileRevision !== "number" || !Number.isSafeInteger(value.profileRevision) || value.profileRevision < 1 || !isRecord(value.scope) || (value.delimiter !== "," && value.delimiter !== "\t") || !Array.isArray(value.headers) || typeof value.headerFingerprint !== "string" || !isRecord(value.columnMap) || (value.signConvention !== "SIGNED_AMOUNT" && value.signConvention !== "DEBIT_CREDIT") || typeof value.fingerprint !== "string" || !isRecord(value.provenance) || (value.admission !== "INITIAL" && value.admission !== "EXPLICIT_REVIEW")) {
    throw new FinanceParserProfileValidationError("Finance parser profile shape is invalid");
  }
  const profileId = value.profileId as string;
  const delimiter = value.delimiter as "," | "\t";
  const headers = value.headers as string[];
  const headerFingerprint = value.headerFingerprint as string;
  const signConvention = value.signConvention as FinanceParserSignConvention;
  const fingerprint = value.fingerprint as string;
  const scope = value.scope as unknown as FinanceParserProfileScope;
  const columnMap = value.columnMap as Record<string, unknown>;
  const provenanceValue = value.provenance as unknown as FinanceParserProfileProvenance;
  const normalizedScope = normalizeScope(scope);
  if (profileId !== profileIdForScope(normalizedScope)) throw new FinanceParserProfileValidationError("Finance parser profile ID is not stable for its scope");
  const normalizedHeaders = normalizeHeaders(headers);
  if (stableFingerprint(normalizedHeaders) !== headerFingerprint || normalizedHeaders.join("|") !== headers.join("|")) throw new FinanceParserProfileValidationError("Finance parser profile headers are not normalized or their fingerprint is invalid");
  const normalizedMap = normalizeColumnMap(columnMap, normalizedHeaders, signConvention);
  if (stableSerialize(normalizedMap) !== stableSerialize(columnMap)) throw new FinanceParserProfileValidationError("Finance parser profile column mapping is not normalized");
  const provenance = normalizeProvenance(provenanceValue);
  if (stableSerialize(provenance) !== stableSerialize(provenanceValue)) throw new FinanceParserProfileValidationError("Finance parser profile provenance is not normalized");
  const expectedFingerprint = stableFingerprint(profileContent({ scope: normalizedScope, delimiter, headers: normalizedHeaders, columnMap: normalizedMap, signConvention }));
  if (fingerprint !== expectedFingerprint) throw new FinanceParserProfileValidationError("Finance parser profile fingerprint is invalid");
  if (value.priorProfileFingerprints !== undefined && (!Array.isArray(value.priorProfileFingerprints) || value.priorProfileFingerprints.some((historyFingerprint) => typeof historyFingerprint !== "string" || !historyFingerprint))) throw new FinanceParserProfileValidationError("Finance parser profile history is invalid");
  if (value.priorProvenance !== undefined) {
    if (!Array.isArray(value.priorProvenance)) throw new FinanceParserProfileValidationError("Finance parser profile provenance history is invalid");
    const normalizedPriorProvenance = value.priorProvenance.map((provenance) => normalizeProvenance(provenance as unknown as FinanceParserProfileProvenance));
    if (stableSerialize(normalizedPriorProvenance) !== stableSerialize(value.priorProvenance)) throw new FinanceParserProfileValidationError("Finance parser profile provenance history is not normalized");
  }
  if (value.admission === "EXPLICIT_REVIEW") {
    if (!isRecord(value.review) || typeof value.review.reviewedAt !== "string" || !Number.isFinite(Date.parse(value.review.reviewedAt)) || typeof value.review.reason !== "string" || !value.review.reason.trim()) throw new FinanceParserProfileValidationError("Explicitly reviewed Finance parser profile is missing review evidence");
  } else if (value.review !== undefined) throw new FinanceParserProfileValidationError("Initial Finance parser profile cannot carry change-review evidence");
  Object.assign(value, { scope: normalizedScope, headers: normalizedHeaders, columnMap: normalizedMap, provenance });
}

function normalizeDraft(draft: FinanceParserProfileDraft): Omit<FinanceParserProfile, "schemaVersion" | "profileId" | "profileRevision" | "headerFingerprint" | "fingerprint" | "priorProfileFingerprints" | "admission" | "review"> {
  const scope = normalizeScope(draft.scope);
  const headers = normalizeHeaders(draft.headers);
  const columnMap = normalizeColumnMap(draft.columnMap, headers, draft.signConvention);
  const provenance = normalizeProvenance(draft.provenance);
  return { scope, delimiter: draft.delimiter, headers, columnMap, signConvention: draft.signConvention, provenance };
}

function normalizeObservation(observation: FinanceParserProfileObservation): FinanceParserProfileObservation {
  const scope = normalizeScope({ accountId: observation.accountId, sourceClass: observation.sourceClass, format: observation.format, ...(observation.sourceKey ? { sourceKey: observation.sourceKey } : {}) });
  return { ...scope, delimiter: observation.delimiter, headers: normalizeHeaders(observation.headers), signConvention: observation.signConvention };
}

function normalizeScope(scope: FinanceParserProfileScope): FinanceParserProfileScope {
  if (!isRecord(scope) || typeof scope.accountId !== "string" || !scope.accountId.trim() || scope.accountId.trim().length > 160 || !isSourceClass(scope.sourceClass) || scope.format !== "CSV" || (scope.sourceKey !== undefined && (typeof scope.sourceKey !== "string" || !scope.sourceKey.trim() || scope.sourceKey.trim().length > 160))) throw new FinanceParserProfileValidationError("Finance parser profile source/format scope is invalid");
  return { accountId: scope.accountId.trim(), sourceClass: scope.sourceClass, format: scope.format, ...(scope.sourceKey ? { sourceKey: scope.sourceKey.trim() } : {}) };
}

function normalizeHeaders(headers: readonly string[]): string[] {
  if (!Array.isArray(headers) || headers.length === 0 || headers.length > MAX_HEADERS) throw new FinanceParserProfileValidationError("Finance parser profile headers are invalid");
  const normalized = headers.map((header) => typeof header === "string" ? header.replace(/^\uFEFF/u, "").toLocaleLowerCase("en-CA").replace(/[^a-z0-9]/g, "").slice(0, 80) : "");
  if (normalized.some((header) => !header) || new Set(normalized).size !== normalized.length) throw new FinanceParserProfileValidationError("Finance parser profile headers must be non-empty and unique");
  if (normalized.some((header) => /authorization|credential|password|secret|token|routingnumber|accountnumber/u.test(header))) throw new FinanceParserProfileValidationError("Finance parser profile cannot map credential-shaped headers");
  return normalized;
}

export function normalizeFinanceParserHeaders(headers: readonly string[]): string[] {
  return normalizeHeaders(headers);
}

function normalizeColumnMap(columnMap: Record<string, unknown>, headers: readonly string[], signConvention: FinanceParserSignConvention): FinanceParserColumnMap {
  if (!isRecord(columnMap) || (signConvention !== "SIGNED_AMOUNT" && signConvention !== "DEBIT_CREDIT")) throw new FinanceParserProfileValidationError("Finance parser profile column mapping is invalid");
  const allowed = new Set<FinanceParserField>(["postedAt", "description", "amount", "debit", "credit", "currency", "sourceTransactionId", "status", "essential", "category"]);
  const mapped: Partial<Record<FinanceParserField, string>> = {};
  for (const [key, value] of Object.entries(columnMap)) {
    if (!allowed.has(key as FinanceParserField) || typeof value !== "string" || !headers.includes(value) || mapped[key as FinanceParserField] !== undefined) throw new FinanceParserProfileValidationError("Finance parser profile column mapping contains an unknown or unmapped field");
    mapped[key as FinanceParserField] = value;
  }
  if (!mapped.postedAt || !mapped.description) throw new FinanceParserProfileValidationError("Finance parser profile requires date and description columns");
  if (signConvention === "SIGNED_AMOUNT" && !mapped.amount) throw new FinanceParserProfileValidationError("Signed-amount Finance parser profile requires an amount column");
  if (signConvention === "DEBIT_CREDIT" && !mapped.debit && !mapped.credit) throw new FinanceParserProfileValidationError("Debit/credit Finance parser profile requires a debit or credit column");
  if (new Set(Object.values(mapped)).size !== Object.values(mapped).length) throw new FinanceParserProfileValidationError("Finance parser profile cannot map one source column to multiple semantic fields");
  return mapped as FinanceParserColumnMap;
}

function normalizeProvenance(provenance: FinanceParserProfileProvenance): FinanceParserProfileProvenance {
  if (!isRecord(provenance) || typeof provenance.sourceId !== "string" || !provenance.sourceId.trim() || !/^[a-f0-9]{64}$/iu.test(String(provenance.sourceSha256)) || typeof provenance.capturedAt !== "string" || !Number.isFinite(Date.parse(provenance.capturedAt)) || (provenance.sourceArtifactId !== undefined && (typeof provenance.sourceArtifactId !== "string" || !provenance.sourceArtifactId.trim()))) throw new FinanceParserProfileValidationError("Finance parser profile provenance is invalid");
  return { sourceId: provenance.sourceId.trim(), sourceSha256: String(provenance.sourceSha256).toLowerCase(), ...(provenance.sourceArtifactId ? { sourceArtifactId: provenance.sourceArtifactId.trim() } : {}), capturedAt: new Date(provenance.capturedAt).toISOString() };
}

function profileContent(value: Pick<FinanceParserProfileDraft, "scope" | "delimiter" | "headers" | "columnMap" | "signConvention">): Record<string, unknown> {
  return { scope: value.scope, delimiter: value.delimiter, headers: value.headers, columnMap: value.columnMap, signConvention: value.signConvention };
}

function profileIdForScope(scope: FinanceParserProfileScope): string {
  return `finance-parser-profile:${stableFingerprint(scope)}`;
}

function sameScope(left: FinanceParserProfileScope, right: FinanceParserProfileScope): boolean {
  return left.accountId === right.accountId && left.sourceClass === right.sourceClass && left.format === right.format && (left.sourceKey ?? undefined) === (right.sourceKey ?? undefined);
}

function isSourceClass(value: unknown): value is FinanceSourceClass {
  return value === "TRANSACTION_ACCOUNT" || value === "CREDIT_CARD" || value === "INVESTMENT" || value === "DEBT" || value === "INCOME" || value === "INSURANCE" || value === "TAX_BENEFIT" || value === "RECEIPT" || value === "UNKNOWN";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableFingerprint(value: unknown): string {
  let hash = 14695981039346656037n;
  for (const character of stableSerialize(value)) hash = BigInt.asUintN(64, (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n);
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  throw new FinanceParserProfileValidationError("Finance parser profile contains an unsupported value");
}

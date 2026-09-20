import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { assessFinanceParserProfile, createFinanceParserProfile, createFinanceParserProfileDraft, fingerprintFinanceParserProfile, loadFinanceParserProfile, requireFinanceParserProfileApplicable, saveFinanceParserProfile, FinanceParserProfileReviewRequiredError, type FinanceParserProfileDraft } from "./finance-profile";
import { inspectFinanceCsvProfile, parseFinanceCsvWithProfile } from "./finance";
import { CanonicalStore } from "./storage";

const source = { sourceId: "source:profile-1", name: "checking.csv", sha256: "a".repeat(64), accountId: "checking-1", currency: "CAD", sourceClass: "TRANSACTION_ACCOUNT" as const };

function draft(overrides: Partial<FinanceParserProfileDraft> = {}): FinanceParserProfileDraft {
  return {
    scope: { accountId: "checking-1", sourceClass: "TRANSACTION_ACCOUNT", format: "CSV", sourceKey: "bank-checking" },
    delimiter: ",",
    headers: ["date", "description", "amount", "id"],
    columnMap: { postedAt: "date", description: "description", amount: "amount", sourceTransactionId: "id" },
    signConvention: "SIGNED_AMOUNT",
    provenance: { sourceId: "source:profile-1", sourceSha256: "a".repeat(64), capturedAt: "2026-01-01T00:00:00.000Z" },
    ...overrides
  };
}

describe("durable Finance parser profiles", () => {
  it("creates a stable account/source/format-scoped fingerprint and rejects ambiguous mappings", () => {
    const first = createFinanceParserProfile(draft());
    const second = createFinanceParserProfile({ ...draft(), provenance: { ...draft().provenance, sourceId: "source:profile-renamed", sourceSha256: "b".repeat(64) } });
    expect(first.profileId).toBe(second.profileId);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.profileRevision).toBe(1);
    expect(fingerprintFinanceParserProfile(first)).toBe(first.fingerprint);
    expect(() => createFinanceParserProfile(draft({ columnMap: { postedAt: "date", description: "description", amount: "date" } })).toString()).toThrow("one source column");
  });

  it("derives a profile draft from the existing Finance source identity and preserves source provenance", () => {
    const created = createFinanceParserProfile(createFinanceParserProfileDraft(source, { delimiter: ",", headers: ["Date", "Description", "Amount"], columnMap: { postedAt: "date", description: "description", amount: "amount" }, signConvention: "SIGNED_AMOUNT" }));
    expect(created.scope).toEqual({ accountId: "checking-1", sourceClass: "TRANSACTION_ACCOUNT", format: "CSV" });
    expect(created.provenance).toMatchObject({ sourceId: source.sourceId, sourceSha256: source.sha256 });
    expect(created.headers).toEqual(["date", "description", "amount"]);
  });

  it("persists and reloads through CommandBus as one canonical Finance owner, idempotently", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-profile-persist`);
    await store.open();
    const commands = new CommandBus(store);
    const first = await saveFinanceParserProfile(commands, draft());
    const second = await saveFinanceParserProfile(commands, { ...draft(), provenance: { ...draft().provenance, sourceId: "source:profile-renamed", sourceSha256: "b".repeat(64) } });
    const loaded = await loadFinanceParserProfile(commands, draft().scope);
    expect(first).toMatchObject({ created: true, changed: false, idempotent: false });
    expect(second).toMatchObject({ created: false, changed: false, idempotent: true });
    expect(loaded).toEqual(first.profile);
    expect((await store.history(first.record.id)).map((entry) => entry.revision)).toEqual([1]);
    expect((await store.list()).filter((record) => record.owner === "domain.finance" && record.data.kind === "finance-parser-profile")).toHaveLength(1);
    store.close();
  });

  it("fails closed on structural drift and requires explicit review before changing the durable profile", async () => {
    const store = new CanonicalStore(`omnevum-test-${Date.now()}-finance-profile-review`);
    await store.open();
    const commands = new CommandBus(store);
    const initial = await saveFinanceParserProfile(commands, draft());
    const drift = assessFinanceParserProfile(initial.profile, { accountId: "checking-1", sourceClass: "TRANSACTION_ACCOUNT", format: "CSV", sourceKey: "bank-checking", delimiter: ",", headers: ["date", "description", "debit", "credit"], signConvention: "DEBIT_CREDIT" });
    expect(drift).toMatchObject({ status: "DRIFT", canApply: false });
    await expect(saveFinanceParserProfile(commands, { ...draft(), headers: ["date", "description", "debit", "credit"], columnMap: { postedAt: "date", description: "description", debit: "debit", credit: "credit" }, signConvention: "DEBIT_CREDIT", provenance: { ...draft().provenance, sourceId: "source:profile-2", sourceSha256: "b".repeat(64) } })).rejects.toBeInstanceOf(FinanceParserProfileReviewRequiredError);
    expect((await loadFinanceParserProfile(commands, draft().scope))?.profileRevision).toBe(1);
    const changed = await saveFinanceParserProfile(commands, { ...draft(), headers: ["date", "description", "debit", "credit"], columnMap: { postedAt: "date", description: "description", debit: "debit", credit: "credit" }, signConvention: "DEBIT_CREDIT", provenance: { ...draft().provenance, sourceId: "source:profile-2", sourceSha256: "b".repeat(64) } }, { expectedPreviousFingerprint: initial.profile.fingerprint, reason: "User reviewed the bank export column change" });
    expect(changed.profile).toMatchObject({ profileRevision: 2, admission: "EXPLICIT_REVIEW", priorProfileFingerprints: [initial.profile.fingerprint], priorProvenance: [initial.profile.provenance], review: { reason: "User reviewed the bank export column change" } });
    expect((await store.history(initial.record.id)).map((entry) => entry.revision)).toEqual([1, 2]);
    store.close();
  });

  it("fails closed for invalid and ambiguous persisted profiles", async () => {
    const invalidStore = new CanonicalStore(`omnevum-test-${Date.now()}-finance-profile-invalid`);
    await invalidStore.open();
    const invalidCommands = new CommandBus(invalidStore);
    const valid = createFinanceParserProfile(draft());
    await invalidCommands.create({ id: valid.profileId, recordType: "observation", owner: "domain.finance", truthClass: "DERIVED", provenance: { source: "IMPORT", sourceId: valid.provenance.sourceId, capturedAt: valid.provenance.capturedAt }, data: { kind: "finance-parser-profile", profile: { ...valid, fingerprint: "fnv1a64:invalid" } } });
    await expect(loadFinanceParserProfile(invalidCommands, valid.scope)).rejects.toThrow("fingerprint is invalid");
    invalidStore.close();

    const ambiguousStore = new CanonicalStore(`omnevum-test-${Date.now()}-finance-profile-ambiguous`);
    await ambiguousStore.open();
    const ambiguousCommands = new CommandBus(ambiguousStore);
    await ambiguousCommands.create({ id: valid.profileId, recordType: "observation", owner: "domain.finance", truthClass: "DERIVED", provenance: { source: "IMPORT", sourceId: valid.provenance.sourceId, capturedAt: valid.provenance.capturedAt }, data: { kind: "finance-parser-profile", profile: valid } });
    await ambiguousCommands.create({ recordType: "observation", owner: "domain.finance", truthClass: "DERIVED", provenance: { source: "IMPORT", sourceId: valid.provenance.sourceId, capturedAt: valid.provenance.capturedAt }, data: { kind: "finance-parser-profile", profile: { ...valid, profileId: `${valid.profileId}-duplicate` } } });
    await expect(loadFinanceParserProfile(ambiguousCommands, valid.scope)).rejects.toThrow("ID is not stable");
    ambiguousStore.close();
  });

  it("does not permit an invalid or out-of-scope profile to reach the parser", () => {
    const profile = createFinanceParserProfile(draft());
    expect(assessFinanceParserProfile(profile, { accountId: "other-account", sourceClass: "TRANSACTION_ACCOUNT", format: "CSV", delimiter: ",", headers: profile.headers, signConvention: "SIGNED_AMOUNT" })).toMatchObject({ status: "OUT_OF_SCOPE", canApply: false });
    expect(() => requireFinanceParserProfileApplicable(profile, { accountId: "other-account", sourceClass: "TRANSACTION_ACCOUNT", format: "CSV", delimiter: ",", headers: profile.headers, signConvention: "SIGNED_AMOUNT" })).toThrow("cannot be applied");
  });

  it("binds stable profile identity to parsed lineage and rejects structural drift before rows are accepted", () => {
    const profileSource = { ...source, sourceClass: "TRANSACTION_ACCOUNT" as const };
    const text = "Date,Description,Amount,Id\n2026-01-01,Payroll,1000,txn-1\n";
    const input = inspectFinanceCsvProfile(text);
    const profile = createFinanceParserProfile(createFinanceParserProfileDraft(profileSource, input));
    const parsed = parseFinanceCsvWithProfile(text, profileSource, profile);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.lineage).toMatchObject({ parserProfile: "PERSISTED_PROFILE_V1", parserProfileId: profile.profileId, parserProfileRevision: 1, parserProfileFingerprint: profile.fingerprint });
    const drifted = "Date,Description,Debit,Credit,Id\n2026-01-01,Payroll,0,1000,txn-1\n";
    expect(() => parseFinanceCsvWithProfile(drifted, profileSource, profile)).toThrow("cannot be applied");
  });
});

import type { AutomationProposal, RuleScalar } from "./automation";
import { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";

export interface ProposalAuthorization {
  confirmed: boolean;
  allowedRecordIds: ReadonlySet<string>;
}

export type ProposalCommandResult = CanonicalRecord | CanonicalRecord[] | void;

/**
 * Applies only an explicitly confirmed, scope-bound proposal through existing
 * CommandBus owners. Unhandled admitted commands remain proposals until a
 * specialized normal command handler is added.
 */
export async function applyConfirmedProposal(commands: CommandBus, proposal: AutomationProposal, authorization: ProposalAuthorization): Promise<ProposalCommandResult> {
  if (proposal.requiresNormalCommandPath !== true || authorization.confirmed !== true) throw new Error("Proposal requires explicit confirmation through the normal command path");
  const args = proposal.arguments;
  switch (proposal.command) {
    case "record.update": {
      const recordId = requireString(args, "recordId");
      requireAllowedRecord(authorization, recordId);
      const field = requireSafeDataField(args, "field");
      if (!("value" in args) || !isRuleScalar(args.value)) throw new Error("Proposal update value is invalid");
      const current = await commands.get(recordId, true);
      if (!current || current.deleted) throw new Error("Proposal record is unavailable");
      return commands.update(recordId, { ...current.data, [field]: args.value }, optionalRevision(args));
    }
    case "triage.defer": {
      const sourceId = requireString(args, "sourceId");
      requireAllowedRecord(authorization, sourceId);
      return commands.deferTriage(sourceId, requireString(args, "deferredUntil"), optionalRevision(args));
    }
    case "triage.link": {
      const sourceId = requireString(args, "sourceId");
      const targetId = requireString(args, "targetId");
      requireAllowedRecord(authorization, sourceId);
      requireAllowedRecord(authorization, targetId);
      return commands.linkTriage(sourceId, targetId, optionalString(args, "relation") ?? "related", optionalRevision(args));
    }
    case "triage.route": {
      const sourceId = requireString(args, "sourceId");
      requireAllowedRecord(authorization, sourceId);
      const target = requireString(args, "target");
      if (target !== "note" && target !== "task") throw new Error("Proposal route target is invalid");
      return commands.routeTriage(sourceId, target, optionalRevision(args));
    }
    case "triage.delete": {
      const sourceId = requireString(args, "sourceId");
      requireAllowedRecord(authorization, sourceId);
      await commands.deleteTriage(sourceId, optionalRevision(args));
      return;
    }
    default:
      throw new Error(`Proposal command requires a specialized normal handler: ${proposal.command}`);
  }
}

function requireAllowedRecord(authorization: ProposalAuthorization, recordId: string): void {
  if (!authorization.allowedRecordIds.has(recordId)) throw new Error("Proposal record is outside the authorized context");
}

function requireString(args: Record<string, RuleScalar>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Proposal argument ${key} is required`);
  return value;
}

function optionalString(args: Record<string, RuleScalar>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Proposal argument ${key} is invalid`);
  return value;
}

function optionalRevision(args: Record<string, RuleScalar>): number | undefined {
  const value = args.expectedRevision;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Proposal revision is invalid");
  return value;
}

function requireSafeDataField(args: Record<string, RuleScalar>, key: string): string {
  const field = requireString(args, key);
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,80}$/.test(field) || field.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part)) || /^(?:id|owner|sensitivity|truthClass|provenance|deleted|revision|schemaVersion|createdAt|modifiedAt)$/i.test(field)) throw new Error("Proposal cannot update canonical authority fields");
  return field;
}

function isRuleScalar(value: RuleScalar | undefined): value is RuleScalar {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

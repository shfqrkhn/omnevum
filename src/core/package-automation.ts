import { assertAutomationRule, proposeRuleActions, type AutomationProposal, type AutomationRule } from "./automation";
import type { PackageManifest } from "./package-contract";

export const MAX_AUTOMATION_DOCUMENT_BYTES = 32_000;

export interface PackageAutomationAdapter {
  readonly packageId: string;
  readonly rule: AutomationRule;
  preview(context: Record<string, unknown>): AutomationProposal[];
}

/**
 * Binds a declarative rule to a package without granting it execution, storage,
 * credential, or network authority. Returned proposals must still traverse the
 * normal command, permission, and confirmation path.
 */
export function createPackageAutomationAdapter(manifest: PackageManifest, rule: AutomationRule): PackageAutomationAdapter {
  if (manifest.trustClass === "EXECUTABLE_UNQUALIFIED") throw new Error("Executable package automation isolation is not qualified");
  if (!manifest.permissions.includes("automation.proposal")) throw new Error("Package lacks automation proposal permission");
  assertAutomationRule(rule);
  if (!rule.ruleId.startsWith(`${manifest.packageId}.`)) throw new Error("Automation rule ID must be package-scoped");
  if (rule.actions.some((action) => !manifest.commands.consumes.includes(action.command))) throw new Error("Automation command is not declared by the package");
  const frozenRule = structuredClone(rule);
  return {
    packageId: manifest.packageId,
    rule: frozenRule,
    preview: (context) => proposeRuleActions(frozenRule, structuredClone(context)).map((proposal) => ({ ...proposal, arguments: structuredClone(proposal.arguments) }))
  };
}

export function parsePackageAutomationDocument(manifest: PackageManifest, document: string): PackageAutomationAdapter {
  if (new TextEncoder().encode(document).byteLength > MAX_AUTOMATION_DOCUMENT_BYTES) throw new Error("Automation document exceeds its size budget");
  let parsed: unknown;
  try {
    parsed = JSON.parse(document) as unknown;
  } catch {
    throw new Error("Automation document must be valid JSON");
  }
  assertAutomationRule(parsed);
  return createPackageAutomationAdapter(manifest, parsed);
}

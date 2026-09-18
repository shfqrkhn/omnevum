import type { CanonicalRecord } from "./model";
import { scrubSensitiveValue } from "./safety";
import { isAdmittedSemanticCommand } from "./semantic-command";

export type AiOperation = "SUMMARIZE" | "EXTRACT" | "COMPARE" | "CLASSIFY" | "EXPLAIN" | "DRAFT" | "SUGGEST" | "TRANSLATE" | "RELATE" | "SEARCH";
export type AiDisclosureClass = "PRIVATE" | "SHARED" | "PUBLIC";
export type AiCostClass = "LOCAL_NO_MARGINAL_COST" | "SUBSCRIPTION_INCLUDED" | "FREE_QUOTA" | "METERED_CREDIT" | "METERED_API" | "UNKNOWN";
export type AiRouteStatus = "ENABLED" | "DISABLED" | "TERMS_BLOCKED" | "STALE" | "PLATFORM_LIMITED";

export interface AiRouteDescriptor {
  id: string;
  label: string;
  operations: AiOperation[];
  costClass: AiCostClass;
  status: AiRouteStatus;
  provider?: string;
  model?: string;
}

export interface AiContextRequest {
  purpose: string;
  recordIds: string[];
  operation: AiOperation;
  routeId: string;
  disclosureClass: AiDisclosureClass;
  expectedOutput: "TEXT" | "JSON" | "PROPOSAL";
  language?: string;
}

export interface AiContext {
  purpose: string;
  operation: AiOperation;
  disclosureClass: AiDisclosureClass;
  records: Array<{ id: string; recordType: CanonicalRecord["recordType"]; owner: string; truthClass: CanonicalRecord["truthClass"]; data: Record<string, unknown> }>;
}

export interface AiResult {
  output: string | Record<string, unknown>;
  truthClass: "DERIVED";
  provenance: { routeId: string; provider?: string; model?: string; executedAt: string; sourceIds: string[] };
}

export interface AiProvider {
  run(operation: AiOperation, context: AiContext, expectedOutput: AiContextRequest["expectedOutput"]): Promise<string | Record<string, unknown>>;
}

export interface AiActionProposal {
  kind: "PROPOSAL";
  command: string;
  arguments: Record<string, unknown>;
  sourceIds: string[];
  requiresNormalCommandPath: true;
}

export class AiRouteRegistry {
  private readonly routes = new Map<string, AiRouteDescriptor>();

  public register(route: AiRouteDescriptor): void {
    if (!/^[a-z][a-z0-9._-]{1,80}$/.test(route.id) || !route.label.trim() || route.label.length > 240 || route.operations.length === 0 || route.operations.length > 20 || new Set(route.operations).size !== route.operations.length) throw new Error("AI route identity and operations are required");
    this.routes.set(route.id, { ...route, operations: [...route.operations] });
  }

  public get(id: string): AiRouteDescriptor | undefined {
    const route = this.routes.get(id);
    return route ? { ...route, operations: [...route.operations] } : undefined;
  }

  public choose(id: string, operation: AiOperation): AiRouteDescriptor {
    const route = this.routes.get(id);
    if (!route || route.status !== "ENABLED" || !route.operations.includes(operation)) throw new Error("AI route is unavailable for this operation");
    if (route.costClass === "METERED_API" || route.costClass === "METERED_CREDIT") throw new Error("Metered AI routes require an explicit external policy");
    return route;
  }
}

export class ContextBroker {
  public project(request: AiContextRequest, records: CanonicalRecord[]): AiContext {
    if (!request.purpose.trim() || request.purpose.length > 500 || request.recordIds.length === 0 || request.recordIds.length > 500) throw new Error("AI purpose and an explicit source set are required");
    const selected = new Set(request.recordIds);
    const sourceRecords = records.filter((record) => selected.has(record.id) && !record.deleted);
    if (sourceRecords.length !== selected.size) throw new Error("AI context contains an unavailable source record");
    if (request.disclosureClass === "PUBLIC" && sourceRecords.some((record) => record.sensitivity !== "SHARED")) throw new Error("Private records cannot enter a public AI disclosure class");
    return {
      purpose: request.purpose.trim().slice(0, 500),
      operation: request.operation,
      disclosureClass: request.disclosureClass,
      records: sourceRecords.map((record) => ({ id: record.id, recordType: record.recordType, owner: record.owner, truthClass: record.truthClass, data: scrubSensitiveValue(record.data) as Record<string, unknown> }))
    };
  }
}

export class AiBroker {
  public constructor(private readonly registry: AiRouteRegistry, private readonly contextBroker = new ContextBroker()) {}

  public async run(request: AiContextRequest, records: CanonicalRecord[], provider: AiProvider): Promise<AiResult> {
    const route = this.registry.choose(request.routeId, request.operation);
    const context = this.contextBroker.project(request, records);
    const output = await provider.run(request.operation, context, request.expectedOutput);
    return { output: boundedOutput(output), truthClass: "DERIVED", provenance: { routeId: route.id, ...(route.provider ? { provider: route.provider } : {}), ...(route.model ? { model: route.model } : {}), executedAt: new Date().toISOString(), sourceIds: context.records.map((record) => record.id) } };
  }

  public proposal(request: AiContextRequest, context: AiContext, proposal: unknown): AiActionProposal {
    return validateAiProposal(request, context, proposal);
  }
}

export function validateAiProposal(request: AiContextRequest, context: AiContext, proposal: unknown): AiActionProposal {
  if (request.expectedOutput !== "PROPOSAL" || request.operation !== "SUGGEST") throw new Error("AI request is not a proposal operation");
  if (typeof proposal !== "object" || proposal === null) throw new Error("Invalid AI action proposal");
  const candidate = proposal as Record<string, unknown>;
  if (typeof candidate.command !== "string" || !isAdmittedSemanticCommand(candidate.command) || typeof candidate.arguments !== "object" || candidate.arguments === null || Array.isArray(candidate.arguments) || Object.keys(candidate.arguments).length > 50) throw new Error("Invalid AI action proposal");
  const contextIds = new Set(context.records.map((record) => record.id));
  const argumentsValue = candidate.arguments as Record<string, unknown>;
  for (const [key, value] of Object.entries(argumentsValue)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,80}$/.test(key) || /^(?:context|disclosureClass|provider|routeId|model|credential|credentials|secret|token|network|permission|permissions|scope|sourceIds)$/i.test(key)) throw new Error("AI proposal cannot carry authority controls");
    if (/(?:^|\.)(?:record|source|target|subject|artifact)(?:Id|Ids)$/i.test(key)) {
      const ids = Array.isArray(value) ? value : [value];
      if (!ids.every((id) => typeof id === "string" && contextIds.has(id))) throw new Error("AI proposal cannot widen its source context");
    }
  }
  return { kind: "PROPOSAL", command: candidate.command, arguments: scrubSensitiveValue(argumentsValue) as Record<string, unknown>, sourceIds: [...contextIds], requiresNormalCommandPath: true };
}

function boundedOutput(value: string | Record<string, unknown>): string | Record<string, unknown> {
  if (typeof value === "string") return value.slice(0, 1_000_000);
  return scrubSensitiveValue(value) as Record<string, unknown>;
}

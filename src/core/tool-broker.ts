import { ContextBroker, validateAiProposal, type AiActionProposal, type AiContext, type AiContextRequest } from "./ai";
import type { CanonicalRecord } from "./model";
import { isAdmittedSemanticCommand } from "./semantic-command";

export type ToolStatus = "ENABLED" | "DISCONNECTED" | "TERMS_BLOCKED" | "DISABLED";

export interface ToolDescriptor {
  id: string;
  label: string;
  status: ToolStatus;
  declaredCommands: string[];
}

export interface BrowserToolEndpoint {
  describe(): Promise<ToolDescriptor[]>;
  propose(toolId: string, context: AiContext): Promise<unknown>;
}

export type ToolBrokerOutcome =
  | { status: "PROPOSAL"; toolId: string; proposal: AiActionProposal }
  | { status: "UNAVAILABLE"; toolId: string; reason: string };

export class ToolBroker {
  public constructor(private readonly endpoint: BrowserToolEndpoint, private readonly contextBroker = new ContextBroker()) {}

  public async propose(request: AiContextRequest, records: CanonicalRecord[], toolId: string): Promise<ToolBrokerOutcome> {
    if (request.operation !== "SUGGEST" || request.expectedOutput !== "PROPOSAL") throw new Error("Tool broker only emits proposal operations");
    let descriptors: ToolDescriptor[];
    try {
      descriptors = await this.endpoint.describe();
    } catch {
      return { status: "UNAVAILABLE", toolId, reason: "tool endpoint unavailable" };
    }
    const descriptor = descriptors.find((candidate) => candidate.id === toolId);
    if (!descriptor || descriptor.status !== "ENABLED" || !isValidDescriptor(descriptor)) return { status: "UNAVAILABLE", toolId, reason: "tool is not admitted" };
    const context = this.contextBroker.project(request, records);
    try {
      const rawProposal = await this.endpoint.propose(toolId, context);
      return { status: "PROPOSAL", toolId, proposal: validateAiProposal(request, context, rawProposal) };
    } catch (error) {
      return { status: "UNAVAILABLE", toolId, reason: error instanceof Error ? error.message.slice(0, 240) : "tool proposal rejected" };
    }
  }
}

function isValidDescriptor(descriptor: ToolDescriptor): boolean {
  return /^[a-z][a-z0-9._-]{1,80}$/.test(descriptor.id) && descriptor.label.trim().length > 0 && descriptor.label.length <= 240 && descriptor.declaredCommands.length > 0 && descriptor.declaredCommands.length <= 50 && new Set(descriptor.declaredCommands).size === descriptor.declaredCommands.length && descriptor.declaredCommands.every(isAdmittedSemanticCommand);
}

export type CapabilityState = "READY" | "DEGRADED" | "DISABLED";

export interface CapabilityModule<Context> {
  id: string;
  critical?: boolean;
  start: (context: Context) => void | Promise<void>;
}

export interface CapabilityStatus {
  id: string;
  critical: boolean;
  state: CapabilityState;
  reason?: string;
}

const MAX_MODULES = 100;
const MAX_REASON_LENGTH = 240;

/**
 * Keeps independently replaceable capabilities from sharing a failure boundary.
 * A module may report degraded while core and unrelated modules continue.
 */
export class CapabilityRuntime<Context> {
  private readonly modules: CapabilityModule<Context>[];
  private readonly statuses = new Map<string, CapabilityStatus>();

  public constructor(modules: CapabilityModule<Context>[]) {
    if (modules.length > MAX_MODULES || new Set(modules.map((module) => module.id)).size !== modules.length || modules.some((module) => !isModuleId(module.id))) {
      throw new Error("Capability module registry is invalid");
    }
    this.modules = modules.map((module) => ({ ...module }));
    for (const module of this.modules) this.statuses.set(module.id, { id: module.id, critical: module.critical === true, state: "DISABLED", reason: "not started" });
  }

  public async start(context: Context): Promise<CapabilityStatus[]> {
    for (const module of this.modules) {
      try {
        await module.start(context);
        this.statuses.set(module.id, { id: module.id, critical: module.critical === true, state: "READY" });
      } catch (error) {
        this.statuses.set(module.id, { id: module.id, critical: module.critical === true, state: "DEGRADED", reason: safeReason(error) });
      }
    }
    return this.snapshot();
  }

  public async run<T>(id: string, operation: () => T | Promise<T>): Promise<T> {
    const status = this.statuses.get(id);
    if (!status || status.state !== "READY") throw new Error(`Capability ${id} is unavailable`);
    try {
      return await operation();
    } catch (error) {
      this.statuses.set(id, { ...status, state: "DEGRADED", reason: safeReason(error) });
      throw error;
    }
  }

  public disable(id: string, reason = "disabled by policy"): void {
    const status = this.statuses.get(id);
    if (!status) throw new Error(`Capability ${id} is unknown`);
    this.statuses.set(id, { ...status, state: "DISABLED", reason: safeReason(reason) });
  }

  public snapshot(): CapabilityStatus[] {
    return this.modules.map((module) => {
      const status = this.statuses.get(module.id);
      return status ? { ...status } : { id: module.id, critical: module.critical === true, state: "DISABLED" as const, reason: "not started" };
    });
  }
}

function isModuleId(value: string): boolean {
  return typeof value === "string" && /^[a-z][a-z0-9._-]{1,80}$/.test(value);
}

function safeReason(error: unknown): string {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : "capability failure";
  const scrubbed = raw
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|authorization|cookie|session[_-]?token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b(?:access[_-]?token|refresh[_-]?token|password|secret|private[_-]?key|authorization|cookie|session[_-]?token)\s*[:=]\s*[^\s,;]+/gi, (match) => `${match.slice(0, match.search(/[:=]/))}=[redacted]`);
  return scrubbed.replace(/[\u0000\r\n]+/g, " ").trim().slice(0, MAX_REASON_LENGTH) || "capability failure";
}

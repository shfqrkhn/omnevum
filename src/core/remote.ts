import type { CanonicalRecord } from "./model";
import type { SyncTransport } from "./sync";
import { isCanonicalRecord } from "./validation";
import type { CredentialKeyBroker } from "./credential";
import type { EffectExecutionResult } from "./effect-runner";
import type { EffectOperation } from "./effect";

export const MAX_REMOTE_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MAX_REMOTE_RECORDS = 10_000;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class JsonEndpointTransport implements SyncTransport {
  private readonly endpoint: URL;

  public constructor(endpoint: string, private readonly request: FetchLike = (input, init) => fetch(input, init)) {
    this.endpoint = parseRemoteEndpoint(endpoint);
  }

  public async pull(): Promise<CanonicalRecord[]> {
    const response = await this.request(this.endpoint, { method: "GET", headers: { Accept: "application/json" } });
    return parseRemoteRecords(await boundedResponseText(response));
  }

  public async push(records: CanonicalRecord[]): Promise<void> {
    if (records.length > MAX_REMOTE_RECORDS) throw new Error("Remote sync batch exceeds the bounded record limit");
    const response = await this.request(this.endpoint, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ format: "OMNEVUM_REPLICA", version: 1, records }) });
    if (!response.ok) throw new Error(`Remote sync push failed with HTTP ${response.status}`);
  }
}

export class JsonEndpointEffectExecutor {
  private readonly endpoint: URL;

  public constructor(endpoint: string, private readonly request: FetchLike = (input, init) => fetch(input, init), private readonly broker?: CredentialKeyBroker) {
    this.endpoint = parseRemoteEndpoint(endpoint);
  }

  public supports(operation: EffectOperation): boolean {
    return operation.destination === this.endpoint.href;
  }

  public async execute(operation: EffectOperation): Promise<EffectExecutionResult> {
    return this.send(operation, { method: "POST", body: JSON.stringify({
      operationId: operation.operationId,
      purpose: operation.purpose,
      destination: operation.destination,
      payloadOrReference: operation.payloadOrReference,
      idempotencyKey: operation.idempotencyKey
    }) });
  }

  public async reconcile(operation: EffectOperation): Promise<EffectExecutionResult> {
    const endpoint = new URL(this.endpoint.href);
    endpoint.searchParams.set("idempotencyKey", operation.idempotencyKey);
    return this.send(operation, { method: "GET", endpoint });
  }

  private async send(operation: EffectOperation, input: { method: "GET" | "POST"; body?: string; endpoint?: URL }): Promise<EffectExecutionResult> {
    const headers = new Headers({ Accept: "application/json" });
    if (input.body !== undefined) headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", operation.idempotencyKey);
    const request = async (secret?: string): Promise<Response> => {
      if (secret) headers.set("Authorization", `Bearer ${secret}`);
      return this.request(input.endpoint ?? this.endpoint, { method: input.method, headers, ...(input.body !== undefined ? { body: input.body } : {}) });
    };
    let response: Response;
    try {
      if (operation.credentialHandle) {
        if (!this.broker) return { outcome: "FAILED_TERMINAL", evidence: ["credential-broker-unavailable"] };
        if (!this.broker.metadata(operation.credentialHandle)) return { outcome: "FAILED_TERMINAL", evidence: ["credential-handle-unavailable"] };
        response = await this.broker.withSecret(operation.credentialHandle, operation.purpose, request);
      } else {
        response = await request();
      }
    } catch {
      return { outcome: "OUTCOME_UNKNOWN", evidence: ["remote-response-ambiguous"] };
    }
    const text = await boundedResponseTextAllowingErrors(response);
    if (text === undefined) return { outcome: "FAILED_TERMINAL", evidence: ["remote-response-too-large"] };
    const parsed = parseEffectResponse(text);
    if (input.method === "GET" && response.status === 404) return { outcome: "OUTCOME_UNKNOWN", evidence: ["reconcile-not-found"] };
    if (!response.ok) {
      if (response.status === 408 || response.status === 429 || response.status >= 500) return { outcome: "FAILED_RETRYABLE", evidence: [`remote-http-${response.status}`] };
      return { outcome: "FAILED_TERMINAL", evidence: [`remote-http-${response.status}`] };
    }
    if (!parsed) return text.trim() ? { outcome: "OUTCOME_UNKNOWN", evidence: ["remote-outcome-unrecognized"] } : { outcome: "SUCCEEDED", evidence: ["remote-http-success"] };
    return { outcome: parsed.outcome, evidence: ["remote-outcome-confirmed"], ...(parsed.remoteIdentity ? { remoteIdentity: parsed.remoteIdentity } : {}) };
  }
}

export function parseRemoteEndpoint(value: string): URL {
  let endpoint: URL;
  try { endpoint = new URL(value); } catch { throw new Error("Remote sync endpoint is invalid"); }
  if (endpoint.protocol !== "https:" && !(endpoint.hostname === "localhost" && endpoint.protocol === "http:")) throw new Error("Remote sync requires HTTPS except for localhost");
  return endpoint;
}

async function boundedResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error("Remote sync response exceeds the bounded 5 MiB limit");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REMOTE_RESPONSE_BYTES) throw new Error("Remote sync response exceeds the bounded 5 MiB limit");
  if (!response.ok) throw new Error(`Remote sync pull failed with HTTP ${response.status}`);
  return text;
}

async function boundedResponseTextAllowingErrors(response: Response): Promise<string | undefined> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_RESPONSE_BYTES) return undefined;
  const text = await response.text();
  return new TextEncoder().encode(text).byteLength > MAX_REMOTE_RESPONSE_BYTES ? undefined : text;
}

function parseEffectResponse(text: string): { outcome: EffectExecutionResult["outcome"]; remoteIdentity?: string } | undefined {
  if (!text.trim()) return undefined;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return undefined; }
  if (typeof value !== "object" || value === null) return undefined;
  const object = value as Record<string, unknown>;
  const rawOutcome = object.outcome ?? object.status;
  if (rawOutcome !== "SUCCEEDED" && rawOutcome !== "FAILED_RETRYABLE" && rawOutcome !== "FAILED_TERMINAL" && rawOutcome !== "OUTCOME_UNKNOWN") return undefined;
  const remoteIdentity = typeof object.remoteIdentity === "string" && object.remoteIdentity.length <= 500 ? object.remoteIdentity : undefined;
  return { outcome: rawOutcome, ...(remoteIdentity ? { remoteIdentity } : {}) };
}

function parseRemoteRecords(text: string): CanonicalRecord[] {
  const value: unknown = JSON.parse(text);
  const records = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).records) ? (value as { records: unknown[] }).records : undefined;
  if (!records || records.length > MAX_REMOTE_RECORDS || !records.every(isCanonicalRecord)) throw new Error("Remote sync response is not a valid bounded replica");
  return records;
}

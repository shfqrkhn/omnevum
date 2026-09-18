import type { CanonicalRecord } from "./model";
import type { SyncTransport } from "./sync";
import { isCanonicalRecord } from "./validation";

export const MAX_REMOTE_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MAX_REMOTE_RECORDS = 10_000;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class JsonEndpointTransport implements SyncTransport {
  private readonly endpoint: URL;

  public constructor(endpoint: string, private readonly request: FetchLike = fetch) {
    this.endpoint = parseEndpoint(endpoint);
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

function parseEndpoint(value: string): URL {
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

function parseRemoteRecords(text: string): CanonicalRecord[] {
  const value: unknown = JSON.parse(text);
  const records = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).records) ? (value as { records: unknown[] }).records : undefined;
  if (!records || records.length > MAX_REMOTE_RECORDS || !records.every(isCanonicalRecord)) throw new Error("Remote sync response is not a valid bounded replica");
  return records;
}

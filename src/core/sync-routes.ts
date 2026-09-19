import type { CredentialKeyBroker } from "./credential";
import type { CanonicalRecord } from "./model";
import type { SyncTransport } from "./sync";
import { JsonEndpointTransport } from "./remote";

export type SyncRouteStatus = "SUPPORTED_WITH_LIMITS" | "MANUAL_ONLY" | "PLATFORM_LIMITED" | "TERMS_BLOCKED" | "UNKNOWN";

export interface SyncRouteDescriptor {
  routeId: string;
  provider: "MANUAL_VAULT" | "WEBDAV" | "NEXTCLOUD" | "GOOGLE_DRIVE" | "ONEDRIVE";
  status: SyncRouteStatus;
  auth: "NONE" | "PUBLIC_CLIENT" | "BROKER_HANDLE";
  notes: string;
}

export interface PublicClientConfig {
  provider: "GOOGLE_DRIVE" | "ONEDRIVE";
  clientId: string;
  redirectOrigin: string;
}

export type ReplicaTransportKind = "VENDOR_FILE" | "OPEN_ENDPOINT";

export interface ReplicaTransportBinding {
  logicalVaultId: string;
  canonicalRecordIds: string[];
  transport: ReplicaTransportKind;
  adapterId: string;
  providerObjectId?: string;
}

export interface LocalReplicaAvailability {
  logicalVaultId: string;
  canonicalRecordIds: string[];
  localCoreUsable: true;
  remoteState: "AVAILABLE" | "UNREACHABLE";
}

export function rebindReplicaTransport(binding: ReplicaTransportBinding, transport: ReplicaTransportKind, adapterId: string, providerObjectId?: string): ReplicaTransportBinding {
  if (!binding.logicalVaultId.trim() || !adapterId.trim() || binding.canonicalRecordIds.some((id) => !id.trim())) throw new Error("Replica identity is incomplete");
  return { logicalVaultId: binding.logicalVaultId, canonicalRecordIds: [...new Set(binding.canonicalRecordIds)].sort(), transport, adapterId, ...(providerObjectId?.trim() ? { providerObjectId: providerObjectId.trim() } : {}) };
}

export function markReplicaEndpointUnavailable(binding: ReplicaTransportBinding): LocalReplicaAvailability {
  return { logicalVaultId: binding.logicalVaultId, canonicalRecordIds: [...binding.canonicalRecordIds].sort(), localCoreUsable: true, remoteState: "UNREACHABLE" };
}

export class SyncRouteRegistry {
  private readonly routes = new Map<string, SyncRouteDescriptor>();

  public register(route: SyncRouteDescriptor): void {
    if (!/^[a-z][a-z0-9._-]{1,80}$/.test(route.routeId) || !route.notes.trim()) throw new Error("Sync route identity and notes are required");
    this.routes.set(route.routeId, { ...route });
  }

  public get(routeId: string): SyncRouteDescriptor | undefined {
    const route = this.routes.get(routeId);
    return route ? { ...route } : undefined;
  }

  public list(): SyncRouteDescriptor[] {
    return [...this.routes.values()].map((route) => ({ ...route })).sort((left, right) => left.routeId.localeCompare(right.routeId));
  }

  public usable(routeId: string): SyncRouteDescriptor {
    const route = this.routes.get(routeId);
    if (!route || route.status !== "SUPPORTED_WITH_LIMITS") throw new Error("Sync route is unavailable for this profile");
    return { ...route };
  }
}

export function validatePublicClientConfig(config: PublicClientConfig): PublicClientConfig {
  if (!config.clientId.trim() || config.clientId.length > 300) throw new Error("A bounded public client identifier is required");
  let origin: URL;
  try { origin = new URL(config.redirectOrigin); } catch { throw new Error("Redirect origin is invalid"); }
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("Connector redirect origin must be HTTPS except for localhost");
  return { provider: config.provider, clientId: config.clientId.trim(), redirectOrigin: origin.origin };
}

export function createBrokeredJsonTransport(endpoint: string, broker: CredentialKeyBroker, handleId: string): SyncTransport {
  const request = async (input: string | URL, init?: RequestInit): Promise<Response> => broker.withSecret(handleId, "sync transport request", async (secret) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${secret}`);
    return fetch(input, { ...init, headers });
  });
  return new JsonEndpointTransport(endpoint, request);
}

export function manualVaultRoute(): SyncRouteDescriptor {
  return { routeId: "manual-vault", provider: "MANUAL_VAULT", status: "SUPPORTED_WITH_LIMITS", auth: "NONE", notes: "Portable Vault is the zero-required-payment off-origin baseline; no remote endpoint is required." };
}

export function defaultSyncRoutes(): SyncRouteDescriptor[] {
  return [
    manualVaultRoute(),
    { routeId: "webdav-endpoint", provider: "WEBDAV", status: "SUPPORTED_WITH_LIMITS", auth: "BROKER_HANDLE", notes: "Owner-controlled HTTPS JSON replica endpoint; server-specific WebDAV discovery/auth remains adapter-qualified." },
    { routeId: "nextcloud-endpoint", provider: "NEXTCLOUD", status: "PLATFORM_LIMITED", auth: "BROKER_HANDLE", notes: "Requires current instance CORS/auth qualification; manual Vault remains available." },
    { routeId: "google-drive-public-client", provider: "GOOGLE_DRIVE", status: "PLATFORM_LIMITED", auth: "PUBLIC_CLIENT", notes: "Requires a public client registered for the exact fork origin; no client secret belongs in the static bundle." },
    { routeId: "onedrive-public-client", provider: "ONEDRIVE", status: "PLATFORM_LIMITED", auth: "PUBLIC_CLIENT", notes: "Requires a public client registered for the exact fork origin; no client secret belongs in the static bundle." }
  ];
}

export function replicaIdentity(records: CanonicalRecord[]): string[] {
  return records.map((record) => record.id).sort();
}

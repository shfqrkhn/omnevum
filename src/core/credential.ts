import { createOpaqueId } from "./id";
import type { EffectOperation } from "./effect";

export interface CredentialMetadata {
  handleId: string;
  provider: string;
  scope: string[];
  audience: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  storageClass: "SESSION_MEMORY";
  recoveryReference?: string;
}

type CredentialIssueInput = Omit<CredentialMetadata, "handleId" | "createdAt" | "storageClass" | "revokedAt">;

export class CredentialKeyBroker {
  private readonly secrets = new Map<string, { secret: string; metadata: CredentialMetadata }>();

  public issue(secret: string, input: CredentialIssueInput): CredentialMetadata {
    return this.register(createOpaqueId("credential"), secret, input);
  }

  public restoreSession(handleId: string, secret: string, input: CredentialIssueInput): CredentialMetadata {
    if (!/^credential_[A-Za-z0-9_-]{8,}$/.test(handleId)) throw new Error("Credential handle is invalid for session restoration");
    if (!input.recoveryReference?.trim()) throw new Error("Credential recovery reference is required for session restoration");
    if (this.secrets.has(handleId)) throw new Error("Credential handle is already active");
    return this.register(handleId, secret, input);
  }

  private register(handleId: string, secret: string, input: CredentialIssueInput): CredentialMetadata {
    if (!secret) throw new Error("Credential material cannot be empty");
    if (!input.provider.trim() || !input.audience.trim() || !Array.isArray(input.scope) || input.scope.length === 0 || input.scope.length > 50 || input.scope.some((scope) => !/^[a-z][a-z0-9._:-]{0,120}$/.test(scope))) throw new Error("Credential metadata scope is invalid");
    const recoveryReference = input.recoveryReference?.trim().slice(0, 240);
    const metadata: CredentialMetadata = { ...input, ...(recoveryReference ? { recoveryReference } : {}), provider: input.provider.trim().slice(0, 160), audience: input.audience.trim().slice(0, 240), scope: input.scope.map((scope) => scope.trim()), handleId, createdAt: new Date().toISOString(), storageClass: "SESSION_MEMORY" };
    this.secrets.set(handleId, { secret, metadata });
    return { ...metadata };
  }

  public metadata(handleId: string): CredentialMetadata | undefined {
    const entry = this.secrets.get(handleId);
    return entry ? { ...entry.metadata, scope: [...entry.metadata.scope] } : undefined;
  }

  public async withSecret<T>(handleId: string, purpose: string, callback: (secret: string) => Promise<T>): Promise<T> {
    if (!purpose.trim()) throw new Error("Credential purpose is required");
    const entry = this.secrets.get(handleId);
    if (!entry || entry.metadata.revokedAt) throw new Error("Credential handle is unavailable");
    return callback(entry.secret);
  }

  public authorizeEffect(operation: Pick<EffectOperation, "credentialHandle" | "purpose" | "destination">): void {
    if (!operation.credentialHandle) return;
    const metadata = this.metadata(operation.credentialHandle);
    if (!metadata || metadata.revokedAt || (metadata.expiresAt !== undefined && Date.parse(metadata.expiresAt) <= Date.now())) throw new Error("Credential handle is revoked, expired, or unavailable");
    if (!operation.purpose.trim() || !operation.destination.trim()) throw new Error("Credential-bound effect purpose and destination are required");
  }

  public revoke(handleId: string): void {
    const entry = this.secrets.get(handleId);
    if (entry) entry.metadata = { ...entry.metadata, revokedAt: new Date().toISOString() };
  }

  public clear(): void {
    this.secrets.clear();
  }
}

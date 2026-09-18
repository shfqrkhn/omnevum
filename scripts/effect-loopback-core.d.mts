export interface EffectLoopbackState {
  identities: Map<string, string>;
  created: number;
  posts: number;
  reconciliations: number;
  authorizedRequests: number;
  credentialFailures: number;
}

export function createEffectLoopbackState(): EffectLoopbackState;
export function createEffectLoopbackHandler(state: EffectLoopbackState, options?: { basePath?: string; requiredBearer?: string; ambiguousFirstPost?: boolean; log?: (event: Record<string, unknown>) => void }): (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<void>;

import type { CredentialKeyBroker } from "./credential";
import type { EffectDisclosureClass, EffectOperation } from "./effect";
import type { EffectExecutionGuard } from "./effect-runner";

export interface EffectRevalidationContext {
  authority: string;
  allowedPermissions?: readonly string[];
  availableSpaces?: () => Promise<ReadonlySet<string>> | ReadonlySet<string>;
  allowedDisclosureClasses?: readonly EffectDisclosureClass[];
  supportedSchemas?: readonly string[];
  credentialBroker?: CredentialKeyBroker;
}

export function createEffectRevalidationGuard(context: EffectRevalidationContext): EffectExecutionGuard {
  return {
    authorize: async (operation: EffectOperation): Promise<void> => {
      const authorization = operation.authorization;
      if (authorization) {
        if (authorization.authority !== context.authority) throw new Error("Effect authority is no longer current");
        if (context.allowedPermissions && !context.allowedPermissions.includes(authorization.permission)) throw new Error("Effect permission is no longer allowed");
        if (context.supportedSchemas && !context.supportedSchemas.includes(authorization.schema)) throw new Error("Effect schema is no longer supported");
        if (context.allowedDisclosureClasses && !context.allowedDisclosureClasses.includes(authorization.disclosureClass)) throw new Error("Effect disclosure class is no longer allowed");
        if (authorization.space && context.availableSpaces) {
          const availableSpaces = await context.availableSpaces();
          if (!availableSpaces.has(authorization.space)) throw new Error("Effect Space is no longer available");
        }
      }
      if (operation.credentialHandle) {
        if (!context.credentialBroker) throw new Error("Effect credential broker is unavailable");
        context.credentialBroker.authorizeEffect(operation);
      }
    }
  };
}

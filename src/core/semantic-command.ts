export const ADMITTED_SEMANTIC_COMMANDS = ["record.create", "record.update", "triage.defer", "triage.link", "triage.route", "triage.split", "triage.delete"] as const;

export type AdmittedSemanticCommand = typeof ADMITTED_SEMANTIC_COMMANDS[number];

export function isAdmittedSemanticCommand(value: string): value is AdmittedSemanticCommand {
  return ADMITTED_SEMANTIC_COMMANDS.includes(value as AdmittedSemanticCommand);
}

import { ADMITTED_SEMANTIC_COMMANDS } from "./semantic-command";

export type RuleScalar = string | number | boolean | null;
export type RuleValue = { kind: "literal"; value: RuleScalar } | { kind: "path"; path: string };
export type RuleExpression =
  | { op: "and" | "or"; args: RuleExpression[] }
  | { op: "not"; arg: RuleExpression }
  | { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains"; left: RuleValue; right: RuleValue }
  | { op: "exists"; path: string };

export interface AutomationAction {
  command: string;
  arguments: Record<string, RuleScalar>;
}

export interface AutomationRule {
  schemaVersion: 1;
  ruleId: string;
  version: number;
  trigger: "ON_CAPTURE" | "ON_OPEN" | "ON_DUE" | "MANUAL";
  when: RuleExpression;
  actions: AutomationAction[];
  enabled: boolean;
}

export interface AutomationProposal {
  command: string;
  arguments: Record<string, RuleScalar>;
  ruleId: string;
  requiresNormalCommandPath: true;
}

export const ADMITTED_AUTOMATION_COMMANDS = ADMITTED_SEMANTIC_COMMANDS;

const MAX_RULE_NODES = 1000;
const MAX_RULE_DEPTH = 64;
const MAX_RULE_ACTIONS = 20;
const MAX_RULE_ARGUMENTS = 50;
const MAX_RULE_TEXT = 5000;

export function assertAutomationRule(value: unknown): asserts value is AutomationRule {
  if (!isAutomationRule(value)) throw new Error("Invalid declarative automation rule");
}

export function isAutomationRule(value: unknown): value is AutomationRule {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schemaVersion === 1 && typeof candidate.ruleId === "string" && /^[a-z][a-z0-9._-]{1,80}$/.test(candidate.ruleId) && typeof candidate.version === "number" && Number.isSafeInteger(candidate.version) && candidate.version > 0 && ["ON_CAPTURE", "ON_OPEN", "ON_DUE", "MANUAL"].includes(String(candidate.trigger)) && isRuleExpression(candidate.when) && Array.isArray(candidate.actions) && candidate.actions.length <= MAX_RULE_ACTIONS && candidate.actions.every(isAction) && typeof candidate.enabled === "boolean";
}

export function evaluateRule(expression: RuleExpression, context: Record<string, unknown>, maxNodes = MAX_RULE_NODES): boolean {
  let nodes = 0;
  const evaluate = (candidate: RuleExpression, depth = 0): boolean => {
    if (++nodes > maxNodes || depth > MAX_RULE_DEPTH) throw new Error("Automation rule exceeded its evaluation budget");
    if (candidate.op === "and") return candidate.args.every((item) => evaluate(item, depth + 1));
    if (candidate.op === "or") return candidate.args.some((item) => evaluate(item, depth + 1));
    if (candidate.op === "not") return !evaluate(candidate.arg, depth + 1);
    if (candidate.op === "exists") return resolvePath(context, candidate.path) !== undefined;
    const comparison = candidate as Extract<RuleExpression, { op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" }>;
    const left = resolveValue(comparison.left, context);
    const right = resolveValue(comparison.right, context);
    if (comparison.op === "eq") return left === right;
    if (comparison.op === "neq") return left !== right;
    if (comparison.op === "contains") return typeof left === "string" && typeof right === "string" ? left.includes(right) : Array.isArray(left) && left.includes(right);
    if (typeof left !== "number" || typeof right !== "number") return false;
    if (comparison.op === "gt") return left > right;
    if (comparison.op === "gte") return left >= right;
    if (comparison.op === "lt") return left < right;
    return left <= right;
  };
  return evaluate(expression);
}

export function proposeRuleActions(rule: AutomationRule, context: Record<string, unknown>): AutomationProposal[] {
  assertAutomationRule(rule);
  if (!rule.enabled || !evaluateRule(rule.when, context)) return [];
  return rule.actions.map((action) => ({ command: action.command, arguments: { ...action.arguments }, ruleId: rule.ruleId, requiresNormalCommandPath: true }));
}

function resolveValue(value: RuleValue, context: Record<string, unknown>): RuleScalar | unknown {
  return value.kind === "literal" ? value.value : resolvePath(context, value.path);
}

function resolvePath(context: Record<string, unknown>, path: string): unknown {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,200}$/.test(path) || path.split(".").some((part) => part === "__proto__" || part === "prototype" || part === "constructor")) return undefined;
  let current: unknown = context;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isRuleExpression(value: unknown, depth = 0, state = { nodes: 0 }): value is RuleExpression {
  if (++state.nodes > MAX_RULE_NODES || depth > MAX_RULE_DEPTH) return false;
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.op === "and" || candidate.op === "or") return Array.isArray(candidate.args) && candidate.args.length <= 100 && candidate.args.every((item) => isRuleExpression(item, depth + 1, state));
  if (candidate.op === "not") return isRuleExpression(candidate.arg, depth + 1, state);
  if (candidate.op === "exists") return typeof candidate.path === "string" && candidate.path.length <= 200;
  return ["eq", "neq", "gt", "gte", "lt", "lte", "contains"].includes(String(candidate.op)) && isRuleValue(candidate.left) && isRuleValue(candidate.right);
}

function isRuleValue(value: unknown): value is RuleValue {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "literal" ? candidate.value === null || (typeof candidate.value === "string" && candidate.value.length <= MAX_RULE_TEXT) || (typeof candidate.value === "number" && Number.isFinite(candidate.value)) || typeof candidate.value === "boolean" : candidate.kind === "path" && typeof candidate.path === "string" && candidate.path.length <= 200;
}

function isAction(value: unknown): value is AutomationAction {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const argumentsValue = candidate.arguments;
  return typeof candidate.command === "string" && ADMITTED_AUTOMATION_COMMANDS.includes(candidate.command as typeof ADMITTED_AUTOMATION_COMMANDS[number]) && typeof argumentsValue === "object" && argumentsValue !== null && !Array.isArray(argumentsValue) && Object.keys(argumentsValue).length <= MAX_RULE_ARGUMENTS && Object.entries(argumentsValue as Record<string, unknown>).every(([key, item]) => /^[a-zA-Z][a-zA-Z0-9_.-]{0,80}$/.test(key) && (item === null || (typeof item === "string" && item.length <= MAX_RULE_TEXT) || (typeof item === "number" && Number.isFinite(item)) || typeof item === "boolean"));
}

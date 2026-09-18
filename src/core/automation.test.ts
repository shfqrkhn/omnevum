import { describe, expect, it } from "vitest";
import { evaluateRule, proposeRuleActions, type AutomationRule, type RuleExpression } from "./automation";

const rule: AutomationRule = { schemaVersion: 1, ruleId: "review.task", version: 1, trigger: "ON_CAPTURE", when: { op: "and", args: [{ op: "eq", left: { kind: "path", path: "record.kind" }, right: { kind: "literal", value: "task" } }, { op: "gt", left: { kind: "path", path: "record.priority" }, right: { kind: "literal", value: 2 } }] }, actions: [{ command: "record.update", arguments: { field: "priority" } }], enabled: true };

describe("bounded declarative automation", () => {
  it("evaluates data-only rules and emits proposals", () => {
    expect(evaluateRule(rule.when, { record: { kind: "task", priority: 3 } })).toBe(true);
    expect(proposeRuleActions(rule, { record: { kind: "task", priority: 3 } })[0]).toMatchObject({ command: "record.update", requiresNormalCommandPath: true });
  });

  it("rejects commands outside the admitted semantic-command set", () => {
    expect(() => proposeRuleActions({ ...rule, actions: [{ command: "network.fetch", arguments: {} }] }, { record: { kind: "task", priority: 3 } })).toThrow("Invalid declarative automation rule");
  });

  it("does not evaluate executable payloads or prototype paths", () => {
    expect(evaluateRule({ op: "exists", path: "constructor.prototype" }, {})).toBe(false);
    expect(() => evaluateRule({ op: "and", args: Array.from({ length: 1100 }, () => ({ op: "exists", path: "ok" })) } as RuleExpression, { ok: true })).toThrow("evaluation budget");
  });
});

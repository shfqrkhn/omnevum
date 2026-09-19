import { describe, expect, it } from "vitest";
import type { CanonicalRecord } from "./model";
import { CommandBus } from "./commands";
import { CanonicalStore } from "./storage";
import { recordText } from "./domain";
import { acceptDeterministicDependencyLinks, analyzeDependencyGraph, createDependencyLink, discoverDependencyLinks, projectDependencyGraph, projectDependencyImpact, type DependencyGraph } from "./dependency-graph";

function record(id: string, data: Record<string, unknown> = {}, sensitivity: "PRIVATE" | "SHARED" = "PRIVATE"): CanonicalRecord {
  const now = new Date().toISOString();
  return { id, recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity, revision: 1, deleted: false, data };
}

function graph(): DependencyGraph {
  return {
    nodes: ["a", "b", "c", "d"],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", edgeKind: "DEPENDENCY", status: "ACTIVE", label: "a feeds b" },
      { id: "bc", sourceId: "b", targetId: "c", edgeKind: "DEPENDENCY", status: "ACTIVE", label: "b feeds c" },
      { id: "cb", sourceId: "c", targetId: "b", edgeKind: "DEPENDENCY", status: "ACTIVE", label: "c feeds b" },
      { id: "ad", sourceId: "a", targetId: "d", edgeKind: "DEPENDENCY", status: "ACTIVE", label: "scenario", scenarioId: "plan-downside" },
      { id: "ac", sourceId: "a", targetId: "c", edgeKind: "SYNERGY", status: "ACTIVE", label: "explains" },
      { id: "da", sourceId: "d", targetId: "a", edgeKind: "FEEDBACK", status: "ACTIVE", label: "model loop", scenarioId: "plan-downside" }
    ]
  };
}

describe("typed dependency and synergy graph", () => {
  it("quarantines accidental cycles and propagates only safe downstream impact", () => {
    const analysis = analyzeDependencyGraph(graph());
    expect(analysis.cycles).toEqual([["b", "c"]]);
    expect(analysis.quarantinedEdgeIds).toEqual(["bc", "cb"]);
    expect(analysis.scenarioEdges).toEqual([]);
    const impact = projectDependencyImpact(graph(), ["a"]);
    expect(impact.affectedIds).toEqual(["a", "b"]);
    expect(impact.invalidatedDerivedIds).toEqual(["b"]);
    expect(impact.explanation).toMatch(/quarantined cycle/iu);
  });

  it("keeps scenario edges out of baseline and admits them only by scenario identity", () => {
    const baseline = analyzeDependencyGraph(graph());
    const scenario = analyzeDependencyGraph(graph(), "plan-downside");
    expect(baseline.baseEdges.map((edge) => edge.id)).toEqual(["ab", "bc", "cb", "ac"]);
    expect(scenario.scenarioEdges.map((edge) => edge.id)).toEqual(["ad", "da"]);
    expect(projectDependencyImpact(graph(), ["a"]).affectedIds).not.toContain("d");
    expect(projectDependencyImpact(graph(), ["a"], "plan-downside").affectedIds).toContain("d");
  });

  it("keeps explanatory and modeled feedback edges out of ordinary propagation", () => {
    const baseline = projectDependencyImpact(graph(), ["a"]);
    const scenario = projectDependencyImpact(graph(), ["a"], "plan-downside");
    expect(baseline.affectedIds).not.toContain("c");
    expect(scenario.affectedIds).toEqual(["a", "b", "d"]);
  });

  it("does not propagate through invalid endpoints or non-node relationship records", () => {
    const malformed: DependencyGraph = {
      nodes: ["a", "b"],
      edges: [
        { id: "a-missing", sourceId: "a", targetId: "missing", edgeKind: "DEPENDENCY", status: "ACTIVE", label: "invalid" },
        { id: "a-b-synergy", sourceId: "a", targetId: "b", edgeKind: "SYNERGY", status: "ACTIVE", label: "descriptive" }
      ]
    };
    expect(analyzeDependencyGraph(malformed).invalidNodeIds).toEqual(["a", "missing"]);
    expect(projectDependencyImpact(malformed, ["a"]).affectedIds).toEqual(["a"]);
    const relationship = record("relationship", { dependsOn: ["b"] });
    relationship.recordType = "relationship";
    expect(discoverDependencyLinks([relationship, record("b")]).deterministic).toEqual([]);
  });

  it("persists one typed edge through the platform dependency owner and deduplicates retries", async () => {
    const store = new CanonicalStore("omnevum-test-" + Date.now() + "-dependency-graph");
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", sensitivity: "SHARED", data: { text: "savings" } });
    const target = await commands.create({ recordType: "note", owner: "core.capture", sensitivity: "SHARED", data: { text: "retirement goal" } });
    const first = await createDependencyLink(commands, { sourceId: source.id, targetId: target.id, edgeKind: "ALLOCATION", allocationMode: "EXCLUSIVE", allocation: { amountMinor: "125000", currency: "CAD" }, label: "funds", evidence: { truthClass: "USER_OBSERVATION", sourceIds: [source.id] } });
    const retry = await createDependencyLink(commands, { sourceId: source.id, targetId: target.id, edgeKind: "ALLOCATION", allocationMode: "EXCLUSIVE", label: "funds" });
    expect(retry.id).toBe(first.id);
    expect(first.owner).toBe("platform.dependency");
    expect(first.sensitivity).toBe("SHARED");
    const projected = projectDependencyGraph(await commands.list());
    expect(projected.nodes).toEqual([source.id, target.id].sort());
    expect(projected.edges).toMatchObject([{ sourceId: source.id, targetId: target.id, edgeKind: "ALLOCATION", allocationMode: "EXCLUSIVE", allocation: { amountMinor: "125000", currency: "CAD" } }]);
    expect(recordText(first)).toContain("ALLOCATION: funds");
    store.close();
  });

  it("requires explicit scenario identity for feedback and keeps authority out of edge data", async () => {
    const store = new CanonicalStore("omnevum-test-" + Date.now() + "-dependency-feedback");
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "source" } });
    const target = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "target" } });
    await expect(createDependencyLink(commands, { sourceId: source.id, targetId: target.id, edgeKind: "FEEDBACK", label: "loop" })).rejects.toThrow(/scenario/iu);
    const edge = await createDependencyLink(commands, { sourceId: source.id, targetId: target.id, edgeKind: "FEEDBACK", scenarioId: "bounded-loop", label: "loop", evidence: { truthClass: "DERIVED", sourceIds: [source.id], note: "model only" } });
    expect(edge.data.scenarioId).toBe("bounded-loop");
    expect(edge.data).not.toHaveProperty("permission");
    expect(edge.data).not.toHaveProperty("credentials");
    const scenarioDependency = await createDependencyLink(commands, { sourceId: source.id, targetId: target.id, edgeKind: "DEPENDENCY", scenarioId: "downside", label: "scenario dependency" });
    expect(scenarioDependency.data.scenarioId).toBe("downside");
    store.close();
  });

  it("discovers explicit high-confidence, ambiguous proposal, and prohibited/out-of-scope references", () => {
    const records = [record("a", { dependsOn: ["b"], possibleRelatedIds: ["c", "private"] }), record("b"), record("c"), record("private", {}, "PRIVATE")];
    const result = discoverDependencyLinks(records, ["a", "b", "c"]);
    expect(result.deterministic).toMatchObject([{ sourceId: "a", targetId: "b", confidence: "HIGH", reversible: true }]);
    expect(result.proposals).toMatchObject([{ sourceId: "a", targetId: "c", confidence: "AMBIGUOUS" }]);
    expect(result.excluded).toMatchObject([{ sourceId: "a", targetId: "private" }]);
  });

  it("auto-accepts only deterministic reversible candidates through normal commands", async () => {
    const store = new CanonicalStore("omnevum-test-" + Date.now() + "-dependency-discovery");
    await store.open();
    const commands = new CommandBus(store);
    const source = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "source" } });
    const target = await commands.create({ recordType: "note", owner: "core.capture", data: { text: "target" } });
    const [link] = await acceptDeterministicDependencyLinks(commands, [{ sourceId: source.id, targetId: target.id, edgeKind: "DEPENDENCY", confidence: "HIGH", origin: "EXPLICIT_REFERENCE", reversible: true }]);
    expect(link?.owner).toBe("platform.dependency");
    await expect(acceptDeterministicDependencyLinks(commands, [{ sourceId: source.id, targetId: target.id, edgeKind: "SYNERGY", confidence: "AMBIGUOUS", origin: "POSSIBLE_REFERENCE", reversible: true }])).rejects.toThrow(/high-confidence/iu);
    store.close();
  });
});

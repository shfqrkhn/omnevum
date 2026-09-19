import type { CommandBus } from "./commands";
import type { CanonicalRecord } from "./model";
import { parseMoney, type MoneyValue } from "./money";
import { scrubSensitiveValue } from "./safety";

export type DependencyEdgeKind = "DEPENDENCY" | "ALLOCATION" | "SYNERGY" | "CONFLICT" | "FEEDBACK";
export type DependencyEdgeStatus = "ACTIVE" | "PROPOSED" | "REVOKED";

export interface DependencyEdgeData {
  kind: "dependency-link";
  version: 1;
  sourceId: string;
  targetId: string;
  edgeKind: DependencyEdgeKind;
  status: DependencyEdgeStatus;
  label: string;
  scenarioId?: string;
  allocationMode?: "EXCLUSIVE" | "ENABLING";
  allocation?: MoneyValue;
  evidence?: { truthClass: CanonicalRecord["truthClass"]; sourceIds: string[]; note?: string };
  text: string;
}

export interface DependencyEdge {
  id: string;
  sourceId: string;
  targetId: string;
  edgeKind: DependencyEdgeKind;
  status: DependencyEdgeStatus;
  label: string;
  scenarioId?: string;
  allocationMode?: "EXCLUSIVE" | "ENABLING";
  allocation?: MoneyValue;
  evidence?: DependencyEdgeData["evidence"];
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
}

export interface DependencyGraphAnalysis {
  graph: DependencyGraph;
  baseEdges: DependencyEdge[];
  scenarioEdges: DependencyEdge[];
  cycles: string[][];
  quarantinedEdgeIds: string[];
  invalidNodeIds: string[];
}

export interface DependencyImpact {
  changedIds: string[];
  affectedIds: string[];
  depthById: Record<string, number>;
  quarantinedCycleIds: string[][];
  invalidatedDerivedIds: string[];
  explanation: string;
}

export interface DependencyDiscoveryCandidate {
  sourceId: string;
  targetId: string;
  edgeKind: "DEPENDENCY" | "SYNERGY" | "CONFLICT";
  confidence: "HIGH" | "AMBIGUOUS";
  origin: "EXPLICIT_REFERENCE" | "POSSIBLE_REFERENCE";
  reversible: true;
}

export interface DependencyDiscoveryResult {
  deterministic: DependencyDiscoveryCandidate[];
  proposals: DependencyDiscoveryCandidate[];
  excluded: Array<{ sourceId: string; targetId: string; reason: string }>;
}

const EDGE_KINDS = new Set<DependencyEdgeKind>(["DEPENDENCY", "ALLOCATION", "SYNERGY", "CONFLICT", "FEEDBACK"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

export async function createDependencyLink(commands: CommandBus, input: {
  sourceId: string;
  targetId: string;
  edgeKind: DependencyEdgeKind;
  label: string;
  scenarioId?: string;
  allocationMode?: "EXCLUSIVE" | "ENABLING";
  allocation?: MoneyValue;
  evidence?: { truthClass: CanonicalRecord["truthClass"]; sourceIds: string[]; note?: string };
  status?: DependencyEdgeStatus;
}): Promise<CanonicalRecord> {
  if (!ID.test(input.sourceId) || !ID.test(input.targetId) || input.sourceId === input.targetId) throw new Error("Dependency endpoints must be distinct bounded record IDs");
  if (!EDGE_KINDS.has(input.edgeKind) || !input.label.trim() || input.label.length > 240) throw new Error("Dependency edge kind and label are required");
  if (input.edgeKind === "FEEDBACK" && (!input.scenarioId || !ID.test(input.scenarioId))) throw new Error("Feedback edges require an explicit scenario ID");
  if (input.edgeKind !== "ALLOCATION" && input.allocationMode) throw new Error("Allocation mode is reserved for allocation edges");
  if (input.edgeKind !== "ALLOCATION" && input.allocation) throw new Error("Allocation amount is reserved for allocation edges");
  const allocation = input.allocation ? normalizeAllocation(input.allocation) : undefined;
  const [source, target] = await Promise.all([commands.get(input.sourceId), commands.get(input.targetId)]);
  if (!source || !target) throw new Error("Both dependency endpoints must be active canonical records");
  const existing = (await commands.list()).find((record) => isDependencyLink(record) && record.data.status === "ACTIVE" && record.data.sourceId === input.sourceId && record.data.targetId === input.targetId && record.data.edgeKind === input.edgeKind && record.data.scenarioId === input.scenarioId);
  if (existing) return existing;
  const data: DependencyEdgeData = {
    kind: "dependency-link",
    version: 1,
    sourceId: input.sourceId,
    targetId: input.targetId,
    edgeKind: input.edgeKind,
    status: input.status ?? "ACTIVE",
    label: input.label.trim().slice(0, 240),
    ...(input.scenarioId ? { scenarioId: input.scenarioId } : {}),
    ...(input.allocationMode ? { allocationMode: input.allocationMode } : {}),
    ...(allocation ? { allocation } : {}),
    ...(input.evidence ? { evidence: { ...input.evidence, sourceIds: [...new Set(input.evidence.sourceIds.filter((id) => ID.test(id)))].slice(0, 100), ...(input.evidence.note?.trim() ? { note: input.evidence.note.trim().slice(0, 500) } : {}) } } : {}),
    text: input.sourceId + " -> " + input.targetId + ": " + input.label.trim().slice(0, 240)
  };
  return commands.create({ recordType: "relationship", owner: "platform.dependency", truthClass: input.status === "PROPOSED" ? "DERIVED" : "USER_OBSERVATION", sensitivity: source.sensitivity === "SHARED" && target.sensitivity === "SHARED" ? "SHARED" : "PRIVATE", data: data as unknown as Record<string, unknown> });
}

export function isDependencyLink(record: CanonicalRecord): record is CanonicalRecord & { data: DependencyEdgeData } {
  const data = record.data;
  return record.recordType === "relationship" && record.owner === "platform.dependency" && data.kind === "dependency-link" && data.version === 1 && typeof data.sourceId === "string" && ID.test(data.sourceId) && typeof data.targetId === "string" && ID.test(data.targetId) && data.sourceId !== data.targetId && typeof data.label === "string" && Boolean(data.label.trim()) && data.label.length <= 240 && EDGE_KINDS.has(data.edgeKind as DependencyEdgeKind) && ["ACTIVE", "PROPOSED", "REVOKED"].includes(String(data.status)) && (data.scenarioId === undefined || (typeof data.scenarioId === "string" && ID.test(data.scenarioId))) && (data.allocation === undefined || (data.edgeKind === "ALLOCATION" && isValidAllocation(data.allocation)));
}

export function projectDependencyGraph(records: CanonicalRecord[]): DependencyGraph {
  const nodeIds = new Set(records.filter((record) => !record.deleted && record.recordType !== "relationship" && !isDependencyLink(record)).map((record) => record.id));
  const edges = records.filter((record): record is CanonicalRecord & { data: DependencyEdgeData } => !record.deleted && isDependencyLink(record) && record.data.status === "ACTIVE" && nodeIds.has(record.data.sourceId) && nodeIds.has(record.data.targetId)).map((record) => ({ id: record.id, sourceId: record.data.sourceId, targetId: record.data.targetId, edgeKind: record.data.edgeKind, status: record.data.status, label: record.data.label, ...(record.data.scenarioId ? { scenarioId: record.data.scenarioId } : {}), ...(record.data.allocationMode ? { allocationMode: record.data.allocationMode } : {}), ...(record.data.allocation ? { allocation: record.data.allocation } : {}), ...(record.data.evidence ? { evidence: scrubSensitiveValue(record.data.evidence) as DependencyEdgeData["evidence"] } : {}) })).sort(compareEdges);
  return { nodes: [...nodeIds].sort(), edges };
}

export function analyzeDependencyGraph(graph: DependencyGraph, scenarioId?: string): DependencyGraphAnalysis {
  const scenarioEdges = graph.edges.filter((edge) => edge.scenarioId !== undefined && edge.scenarioId === scenarioId);
  const baseEdges = graph.edges.filter((edge) => edge.scenarioId === undefined);
  const activeEdges = [...baseEdges, ...scenarioEdges];
  const cycles = findCycles(graph.nodes, activeEdges.filter(isPropagationEdge));
  const cycleNodes = new Set(cycles.flat());
  const quarantinedEdgeIds = activeEdges.filter((edge) => isPropagationEdge(edge) && cycleNodes.has(edge.sourceId) && cycleNodes.has(edge.targetId)).map((edge) => edge.id).sort();
  const invalidNodeIds = graph.edges.filter((edge) => !graph.nodes.includes(edge.sourceId) || !graph.nodes.includes(edge.targetId)).flatMap((edge) => [edge.sourceId, edge.targetId]).filter((id, index, ids) => ids.indexOf(id) === index).sort();
  return { graph, baseEdges, scenarioEdges, cycles, quarantinedEdgeIds, invalidNodeIds };
}

export function projectDependencyImpact(graph: DependencyGraph, changedIds: string[], scenarioId?: string): DependencyImpact {
  const analysis = analyzeDependencyGraph(graph, scenarioId);
  const changed = [...new Set(changedIds.filter((id) => graph.nodes.includes(id)))].sort();
  const quarantined = new Set(analysis.quarantinedEdgeIds);
  const depthById: Record<string, number> = Object.fromEntries(changed.map((id) => [id, 0]));
  const queue = [...changed];
  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    const sourceDepth = depthById[sourceId] ?? 0;
    for (const edge of [...analysis.baseEdges, ...analysis.scenarioEdges].filter((candidate) => isPropagationEdge(candidate) && candidate.sourceId === sourceId && graph.nodes.includes(candidate.targetId) && !quarantined.has(candidate.id)).sort(compareEdges)) {
      const nextDepth = sourceDepth + 1;
      if (depthById[edge.targetId] === undefined || nextDepth < depthById[edge.targetId]!) {
        depthById[edge.targetId] = nextDepth;
        queue.push(edge.targetId);
      }
    }
  }
  const affectedIds = Object.keys(depthById).sort((left, right) => (depthById[left]! - depthById[right]!) || left.localeCompare(right));
  return { changedIds: changed, affectedIds, depthById, quarantinedCycleIds: analysis.cycles, invalidatedDerivedIds: affectedIds.filter((id) => !changed.includes(id)), explanation: analysis.cycles.length > 0 ? "Ordinary propagation skipped quarantined cycle edges; affected derived projections require recomputation or explicit invalidation." : "Affected projections are ordered by typed dependency depth; edge creation grants no permission." };
}

export function discoverDependencyLinks(records: CanonicalRecord[], authorizedIds: Iterable<string> = records.filter((record) => !record.deleted).map((record) => record.id)): DependencyDiscoveryResult {
  const available = new Set(records.filter(isGraphNodeRecord).map((record) => record.id));
  const authorized = new Set(authorizedIds);
  const deterministic: DependencyDiscoveryCandidate[] = [];
  const proposals: DependencyDiscoveryCandidate[] = [];
  const excluded: DependencyDiscoveryResult["excluded"] = [];
  for (const record of records.filter(isGraphNodeRecord).sort(compareRecords)) {
    const explicit = [...stringIds(record.data.dependsOn), ...stringIds(record.data.supportsIds)];
    for (const targetId of explicit) addCandidate({ sourceId: record.id, targetId, edgeKind: "DEPENDENCY", confidence: "HIGH", origin: "EXPLICIT_REFERENCE", reversible: true });
    for (const targetId of stringIds(record.data.possibleRelatedIds)) addCandidate({ sourceId: record.id, targetId, edgeKind: "SYNERGY", confidence: "AMBIGUOUS", origin: "POSSIBLE_REFERENCE", reversible: true });
  }
  return { deterministic: dedupeCandidates(deterministic), proposals: dedupeCandidates(proposals), excluded };

  function addCandidate(candidate: DependencyDiscoveryCandidate): void {
    if (!available.has(candidate.targetId) || !authorized.has(candidate.sourceId) || !authorized.has(candidate.targetId)) {
      excluded.push({ sourceId: candidate.sourceId, targetId: candidate.targetId, reason: "Source or target is unavailable or outside the authorized projection." });
      return;
    }
    (candidate.confidence === "HIGH" ? deterministic : proposals).push(candidate);
  }
}

export async function acceptDeterministicDependencyLinks(commands: CommandBus, candidates: DependencyDiscoveryCandidate[]): Promise<CanonicalRecord[]> {
  if (candidates.some((candidate) => candidate.confidence !== "HIGH" || !candidate.reversible)) throw new Error("Only high-confidence reversible dependency candidates can be auto-accepted");
  return Promise.all(candidates.map((candidate) => createDependencyLink(commands, { sourceId: candidate.sourceId, targetId: candidate.targetId, edgeKind: candidate.edgeKind, label: candidate.edgeKind === "DEPENDENCY" ? "deterministic dependency" : candidate.edgeKind.toLowerCase(), evidence: { truthClass: "DERIVED", sourceIds: [candidate.sourceId, candidate.targetId], note: "Accepted from an explicit bounded reference; reversible relationship only." } })));
}

function findCycles(nodes: string[], edges: DependencyEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node, []);
  for (const edge of edges) adjacency.get(edge.sourceId)?.push(edge.targetId);
  for (const values of adjacency.values()) values.sort();
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      if (index >= 0) cycles.push([...stack.slice(index), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) visit(next);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of [...nodes].sort()) visit(node);
  return cycles.map((cycle) => cycle.slice(0, -1)).sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}

function isPropagationEdge(edge: DependencyEdge): boolean {
  return edge.edgeKind === "DEPENDENCY" || edge.edgeKind === "ALLOCATION";
}

function isGraphNodeRecord(record: CanonicalRecord): boolean {
  return !record.deleted && record.recordType !== "relationship";
}

function normalizeAllocation(value: MoneyValue): MoneyValue {
  const currency = parseMoney("0", value.currency).currency;
  if (!/^-?\d+$/.test(value.amountMinor)) throw new Error("Allocation amount must use exact minor units");
  const amount = BigInt(value.amountMinor);
  if (amount < 0n || amount > 2n ** 63n - 1n) throw new Error("Allocation amount must be non-negative and bounded");
  return { amountMinor: amount.toString(), currency };
}

function isValidAllocation(value: unknown): value is MoneyValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.amountMinor !== "string" || typeof candidate.currency !== "string" || !/^-?\d+$/.test(candidate.amountMinor)) return false;
  try {
    return BigInt(candidate.amountMinor) >= 0n && BigInt(candidate.amountMinor) <= 2n ** 63n - 1n && parseMoney("0", candidate.currency).currency === candidate.currency;
  } catch {
    return false;
  }
}

function stringIds(value: unknown): string[] { return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && ID.test(id)) : typeof value === "string" && ID.test(value) ? [value] : []; }
function dedupeCandidates(candidates: DependencyDiscoveryCandidate[]): DependencyDiscoveryCandidate[] { return candidates.filter((candidate, index, all) => all.findIndex((other) => other.sourceId === candidate.sourceId && other.targetId === candidate.targetId && other.edgeKind === candidate.edgeKind) === index).sort((left, right) => (left.sourceId + ":" + left.targetId + ":" + left.edgeKind).localeCompare(right.sourceId + ":" + right.targetId + ":" + right.edgeKind)); }
function compareRecords(left: CanonicalRecord, right: CanonicalRecord): number { return left.id.localeCompare(right.id); }
function compareEdges(left: DependencyEdge, right: DependencyEdge): number { return (left.sourceId + ":" + left.targetId + ":" + left.edgeKind + ":" + left.id).localeCompare(right.sourceId + ":" + right.targetId + ":" + right.edgeKind + ":" + right.id); }

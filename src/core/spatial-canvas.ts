export const SPATIAL_CANVAS_VERSION = 1 as const;
export const MAX_CANVAS_NODES = 500;
export const MAX_CANVAS_POINTS = 10_000;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasNodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface CanvasNode {
  id: string;
  kind: "RECORD_REFERENCE" | "DRAWING" | "TEXT";
  position: CanvasPoint;
  size: { width: number; height: number };
  style: CanvasNodeStyle;
  recordId?: string;
  path?: CanvasPoint[];
  text?: string;
  groupId?: string;
}

export interface CanvasConnection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
}

export interface SpatialCanvasDocument {
  format: "OMNEVUM_SPATIAL_CANVAS";
  version: typeof SPATIAL_CANVAS_VERSION;
  canvasId: string;
  title: string;
  engineId: string;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: { x: number; y: number; zoom: number };
}

export interface CanvasArtifactExport {
  format: "OMNEVUM_CANVAS_ARTIFACT";
  version: 1;
  fileName: string;
  mimeType: "application/json";
  sourceCanvasId: string;
  referencedRecordIds: string[];
  text: string;
}

export function createSpatialCanvas(input: { canvasId: string; title: string; engineId?: string; nodes?: CanvasNode[]; connections?: CanvasConnection[] }): SpatialCanvasDocument {
  assertIdentity(input.canvasId, "Canvas ID");
  if (!input.title.trim() || input.title.length > 240) throw new Error("Canvas title is invalid");
  const nodes = (input.nodes ?? []).map((node) => normalizeNode(node));
  const connections = (input.connections ?? []).map((connection) => normalizeConnection(connection));
  assertGraph(nodes, connections);
  return { format: "OMNEVUM_SPATIAL_CANVAS", version: SPATIAL_CANVAS_VERSION, canvasId: input.canvasId.trim(), title: input.title.trim(), engineId: normalizeEngineId(input.engineId ?? "engine-neutral"), nodes, connections, viewport: { x: 0, y: 0, zoom: 1 } };
}

export function moveCanvasNode(canvas: SpatialCanvasDocument, nodeId: string, position: CanvasPoint): SpatialCanvasDocument {
  const node = requireNode(canvas, nodeId);
  const normalized = normalizePoint(position);
  return { ...cloneCanvas(canvas), nodes: canvas.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, position: normalized } : candidate) };
}

export function styleCanvasNode(canvas: SpatialCanvasDocument, nodeId: string, style: CanvasNodeStyle): SpatialCanvasDocument {
  const node = requireNode(canvas, nodeId);
  return { ...cloneCanvas(canvas), nodes: canvas.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, style: normalizeStyle(style) } : candidate) };
}

export function groupCanvasNodes(canvas: SpatialCanvasDocument, groupId: string, nodeIds: readonly string[]): SpatialCanvasDocument {
  assertIdentity(groupId, "Canvas group ID");
  const selected = new Set(nodeIds);
  if (selected.size === 0 || [...selected].some((nodeId) => !canvas.nodes.some((node) => node.id === nodeId))) throw new Error("Canvas group references an unknown node");
  return { ...cloneCanvas(canvas), nodes: canvas.nodes.map((node) => selected.has(node.id) ? { ...node, groupId: groupId.trim() } : node) };
}

export function connectCanvasNodes(canvas: SpatialCanvasDocument, sourceNodeId: string, targetNodeId: string, label?: string): SpatialCanvasDocument {
  requireNode(canvas, sourceNodeId);
  requireNode(canvas, targetNodeId);
  if (sourceNodeId === targetNodeId) throw new Error("A Canvas connection must have distinct endpoints");
  const id = `connection:${sourceNodeId}:${targetNodeId}`;
  if (canvas.connections.some((connection) => connection.id === id)) return cloneCanvas(canvas);
  return { ...cloneCanvas(canvas), connections: [...canvas.connections, { id, sourceNodeId, targetNodeId, ...(label?.trim() ? { label: label.trim().slice(0, 240) } : {}) }] };
}

export function setCanvasViewport(canvas: SpatialCanvasDocument, viewport: { x: number; y: number; zoom: number }): SpatialCanvasDocument {
  return { ...cloneCanvas(canvas), viewport: { ...normalizePoint(viewport), zoom: normalizeZoom(viewport.zoom) } };
}

export function replaceCanvasEngine(canvas: SpatialCanvasDocument, engineId: string): SpatialCanvasDocument {
  return { ...cloneCanvas(canvas), engineId: normalizeEngineId(engineId) };
}

export function exportCanvasArtifact(canvas: SpatialCanvasDocument, fileName = "omnevum-canvas.json"): CanvasArtifactExport {
  assertCanvas(canvas);
  const referencedRecordIds = [...new Set(canvas.nodes.flatMap((node) => node.recordId ? [node.recordId] : []))].sort();
  return { format: "OMNEVUM_CANVAS_ARTIFACT", version: 1, fileName: fileName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").slice(0, 180) || "omnevum-canvas.json", mimeType: "application/json", sourceCanvasId: canvas.canvasId, referencedRecordIds, text: JSON.stringify(canvas, null, 2) };
}

export function parseCanvasArtifact(text: string): SpatialCanvasDocument {
  if (new TextEncoder().encode(text).byteLength > 8 * 1024 * 1024) throw new Error("Canvas Artifact exceeds the bounded 8 MiB limit");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Canvas Artifact is not valid JSON"); }
  assertCanvas(parsed);
  return cloneCanvas(parsed);
}

function assertCanvas(value: unknown): asserts value is SpatialCanvasDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Canvas document is invalid");
  const canvas = value as Partial<SpatialCanvasDocument>;
  if (canvas.format !== "OMNEVUM_SPATIAL_CANVAS" || canvas.version !== SPATIAL_CANVAS_VERSION || typeof canvas.canvasId !== "string" || typeof canvas.title !== "string" || typeof canvas.engineId !== "string" || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.connections) || canvas.nodes.length > MAX_CANVAS_NODES) throw new Error("Canvas document is invalid");
  const nodes = canvas.nodes.map((node) => normalizeNode(node));
  const connections = canvas.connections.map((connection) => normalizeConnection(connection));
  assertGraph(nodes, connections);
  if (!canvas.viewport || typeof canvas.viewport !== "object") throw new Error("Canvas viewport is invalid");
}

function assertGraph(nodes: CanvasNode[], connections: CanvasConnection[]): void {
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || connections.some((connection) => !ids.has(connection.sourceNodeId) || !ids.has(connection.targetNodeId))) throw new Error("Canvas graph contains invalid references");
  const connectionIds = new Set(connections.map((connection) => connection.id));
  if (connectionIds.size !== connections.length) throw new Error("Canvas connection IDs must be unique");
}

function normalizeNode(node: CanvasNode): CanvasNode {
  if (!node || typeof node !== "object" || !["RECORD_REFERENCE", "DRAWING", "TEXT"].includes(node.kind) || !node.id.trim()) throw new Error("Canvas node is invalid");
  const normalized: CanvasNode = { id: node.id.trim(), kind: node.kind, position: normalizePoint(node.position), size: { width: boundedPositive(node.size.width, "Canvas node width"), height: boundedPositive(node.size.height, "Canvas node height") }, style: normalizeStyle(node.style), ...(node.recordId?.trim() ? { recordId: node.recordId.trim() } : {}), ...(node.text?.trim() ? { text: node.text.trim().slice(0, 20_000) } : {}), ...(node.groupId?.trim() ? { groupId: node.groupId.trim() } : {}) };
  if (node.kind === "DRAWING") {
    if (!Array.isArray(node.path) || node.path.length < 2 || node.path.length > MAX_CANVAS_POINTS) throw new Error("Drawing nodes require a bounded path");
    normalized.path = node.path.map(normalizePoint);
  }
  if (node.kind === "RECORD_REFERENCE" && !normalized.recordId) throw new Error("Record-reference nodes require a canonical record ID");
  if (node.kind === "TEXT" && !normalized.text) throw new Error("Text nodes require bounded text");
  return normalized;
}

function normalizeConnection(connection: CanvasConnection): CanvasConnection {
  if (!connection || typeof connection !== "object" || !connection.id.trim() || !connection.sourceNodeId.trim() || !connection.targetNodeId.trim()) throw new Error("Canvas connection is invalid");
  return { id: connection.id.trim(), sourceNodeId: connection.sourceNodeId.trim(), targetNodeId: connection.targetNodeId.trim(), ...(connection.label?.trim() ? { label: connection.label.trim().slice(0, 240) } : {}) };
}

function normalizeStyle(style: CanvasNodeStyle): CanvasNodeStyle {
  if (!style || typeof style !== "object") throw new Error("Canvas style is invalid");
  const result: CanvasNodeStyle = {};
  for (const key of ["fill", "stroke"] as const) if (style[key]?.trim()) result[key] = style[key]!.trim().slice(0, 80);
  if (style.strokeWidth !== undefined) result.strokeWidth = boundedPositive(style.strokeWidth, "Canvas stroke width");
  if (style.opacity !== undefined) { if (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1) throw new Error("Canvas opacity is invalid"); result.opacity = style.opacity; }
  return result;
}

function normalizePoint(point: CanvasPoint): CanvasPoint {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000) throw new Error("Canvas point is outside the supported bound");
  return { x: point.x, y: point.y };
}

function normalizeZoom(value: number): number {
  if (!Number.isFinite(value) || value < 0.1 || value > 8) throw new Error("Canvas zoom is outside the supported bound");
  return value;
}

function boundedPositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) throw new Error(`${label} is invalid`);
  return value;
}

function normalizeEngineId(value: string): string {
  if (!/^[a-z][a-z0-9._-]{1,80}$/u.test(value.trim())) throw new Error("Canvas engine identity is invalid");
  return value.trim();
}

function assertIdentity(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value.trim())) throw new Error(`${label} is invalid`);
}

function requireNode(canvas: SpatialCanvasDocument, nodeId: string): CanvasNode {
  assertCanvas(canvas);
  const node = canvas.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error("Canvas node was not found");
  return node;
}

function cloneCanvas(canvas: SpatialCanvasDocument): SpatialCanvasDocument {
  return structuredClone(canvas);
}

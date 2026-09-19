import { describe, expect, it } from "vitest";
import { connectCanvasNodes, createSpatialCanvas, exportCanvasArtifact, groupCanvasNodes, moveCanvasNode, parseCanvasArtifact, replaceCanvasEngine, styleCanvasNode } from "./spatial-canvas";

function canvas() {
  return createSpatialCanvas({
    canvasId: "canvas-1",
    title: "Research map",
    nodes: [
      { id: "record-node", kind: "RECORD_REFERENCE", recordId: "record-1", position: { x: 0, y: 0 }, size: { width: 120, height: 80 }, style: {} },
      { id: "drawing-node", kind: "DRAWING", position: { x: 200, y: 0 }, size: { width: 160, height: 100 }, style: {}, path: [{ x: 200, y: 0 }, { x: 240, y: 40 }] }
    ]
  });
}

describe("engine-neutral spatial Compose/View canvas", () => {
  it("moves, styles, groups, and connects view nodes without changing record references", () => {
    const initial = canvas();
    const changed = connectCanvasNodes(groupCanvasNodes(styleCanvasNode(moveCanvasNode(initial, "record-node", { x: 40, y: 50 }), "record-node", { fill: "#fff", opacity: 0.8 }), "group-1", ["record-node", "drawing-node"]), "record-node", "drawing-node", "supports");
    expect(changed.nodes.find((node) => node.id === "record-node")).toMatchObject({ recordId: "record-1", position: { x: 40, y: 50 }, groupId: "group-1" });
    expect(changed.connections).toHaveLength(1);
    expect(initial.nodes.find((node) => node.id === "record-node")).toMatchObject({ recordId: "record-1", position: { x: 0, y: 0 }, style: {} });
  });

  it("exports and restores a standalone drawing and canonical references as an Artifact projection", () => {
    const artifact = exportCanvasArtifact(canvas(), "research-map.json");
    const restored = parseCanvasArtifact(artifact.text);
    expect(artifact).toMatchObject({ format: "OMNEVUM_CANVAS_ARTIFACT", sourceCanvasId: "canvas-1", referencedRecordIds: ["record-1"], fileName: "research-map.json" });
    expect(restored.nodes.find((node) => node.id === "drawing-node")?.path).toHaveLength(2);
    expect(restored.nodes.find((node) => node.id === "record-node")?.recordId).toBe("record-1");
  });

  it("replaces the engine through a bounded seam without canonical migration", () => {
    const changed = replaceCanvasEngine(canvas(), "qualified-engine-v2");
    expect(changed.engineId).toBe("qualified-engine-v2");
    expect(changed.nodes.map((node) => node.recordId).filter(Boolean)).toEqual(["record-1"]);
    expect(() => replaceCanvasEngine(canvas(), "bad engine")).toThrow("engine");
  });
});

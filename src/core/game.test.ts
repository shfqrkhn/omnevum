import { describe, expect, it } from "vitest";
import { GameSession, type GameManifest } from "./game";

const manifest: GameManifest = { packageId: "counter.game", version: "1.0.0", displayName: "Counter", trustClass: "FIRST_PARTY", frameworkApi: "omnevum-sdk-1", entrypoints: ["game"], ownedCanonicalTypes: ["game-save"], commands: { consumes: [], provides: [] }, capabilities: { required: ["game-save"], optional: [] }, permissions: [], externalEffects: [], dataSchema: "game-1", migrations: [], lifecycle: { offline: "full", recovery: "restore-save", rollback: "save-compatible", uninstall: "retain-save", retirement: "stop" }, accessibility: "keyboard-touch", inputProfile: ["touch", "keyboard"], localization: ["en-CA"], archetype: "GAME", runtimeAdapter: "counter", saveSchemaVersion: 1, inputActions: ["increment"], budgets: { frameMs: 16, memoryMb: 128, assetBytes: 1000 } };

describe("deterministic game lifecycle", () => {
  it("supports input, pause/resume, save, and load", () => {
    const session = new GameSession(manifest, { step: (state, action) => ({ ...state, tick: state.tick + 1, payload: { count: Number(state.payload.count ?? 0) + (action === "increment" ? 1 : 0) } }) }, 42);
    session.dispatch("increment");
    const saved = session.save();
    session.pause();
    session.dispatch("increment");
    expect(session.snapshot().payload.count).toBe(1);
    session.resume();
    expect(session.load(saved).payload.count).toBe(1);
    expect(session.snapshot().seed).toBe(42);
  });

  it("rejects undeclared actions and incompatible saves", () => {
    const session = new GameSession(manifest, { step: (state) => state });
    expect(() => session.dispatch("network")).toThrow("not declared");
    expect(() => session.load(JSON.stringify({ schemaVersion: 2, seed: 1, tick: 0, paused: false, payload: {} }))).toThrow("incompatible");
  });
});

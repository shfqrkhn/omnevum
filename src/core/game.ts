import { isPackageManifest, type PackageManifest } from "./package-contract";

export interface GameManifest extends PackageManifest {
  archetype: "GAME";
  runtimeAdapter: string;
  saveSchemaVersion: number;
  inputActions: string[];
  budgets: { frameMs: number; memoryMb: number; assetBytes: number };
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  tick: number;
  paused: boolean;
  payload: Record<string, unknown>;
}

export interface GameRuntimeAdapter {
  step(state: GameState, action?: string): GameState;
}

export function assertGameManifest(value: unknown): asserts value is GameManifest {
  if (!isGameManifest(value)) throw new Error("Invalid game manifest");
}

export function isGameManifest(value: unknown): value is GameManifest {
  if (!isPackageManifest(value)) return false;
  const candidate = value as unknown as Record<string, unknown>;
  const budgets = candidate.budgets;
  const inputActions = candidate.inputActions;
  const budget = typeof budgets === "object" && budgets !== null && !Array.isArray(budgets) ? budgets as Record<string, unknown> : undefined;
  const frameMs = budget?.frameMs;
  const memoryMb = budget?.memoryMb;
  const assetBytes = budget?.assetBytes;
  return candidate.archetype === "GAME" && typeof candidate.runtimeAdapter === "string" && candidate.runtimeAdapter.length <= 160 && typeof candidate.saveSchemaVersion === "number" && Number.isSafeInteger(candidate.saveSchemaVersion) && candidate.saveSchemaVersion > 0 && Array.isArray(inputActions) && inputActions.length <= 100 && inputActions.every((action) => typeof action === "string" && /^[a-z][a-z0-9._-]{0,80}$/.test(action)) && typeof frameMs === "number" && Number.isFinite(frameMs) && frameMs > 0 && typeof memoryMb === "number" && Number.isFinite(memoryMb) && memoryMb > 0 && typeof assetBytes === "number" && Number.isFinite(assetBytes) && assetBytes > 0;
}

export class GameSession {
  private state: GameState;

  public constructor(private readonly manifest: GameManifest, private readonly adapter: GameRuntimeAdapter, seed = 1) {
    assertGameManifest(manifest);
    if (!Number.isSafeInteger(seed)) throw new Error("Game seed must be a safe integer");
    this.state = { schemaVersion: manifest.saveSchemaVersion, seed, tick: 0, paused: false, payload: {} };
  }

  public dispatch(action: string): GameState {
    if (!this.manifest.inputActions.includes(action)) throw new Error("Game action is not declared");
    if (this.state.paused) return this.snapshot();
    this.state = assertNextState(this.adapter.step(this.snapshot(), action), this.manifest.saveSchemaVersion);
    return this.snapshot();
  }

  public tick(): GameState {
    if (!this.state.paused) this.state = assertNextState(this.adapter.step(this.snapshot()), this.manifest.saveSchemaVersion);
    return this.snapshot();
  }

  public pause(): void { this.state = { ...this.state, paused: true }; }
  public resume(): void { this.state = { ...this.state, paused: false }; }
  public snapshot(): GameState { return structuredClone(this.state); }
  public save(): string { return JSON.stringify(this.state); }
  public load(serialized: string): GameState {
    let parsed: unknown;
    try { parsed = JSON.parse(serialized); } catch { throw new Error("Game save schema is incompatible"); }
    if (!isGameState(parsed) || parsed.schemaVersion !== this.manifest.saveSchemaVersion) throw new Error("Game save schema is incompatible");
    this.state = structuredClone(parsed);
    return this.snapshot();
  }
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.schemaVersion === "number" && Number.isInteger(candidate.schemaVersion) && typeof candidate.seed === "number" && Number.isSafeInteger(candidate.seed) && typeof candidate.tick === "number" && Number.isInteger(candidate.tick) && candidate.tick >= 0 && typeof candidate.paused === "boolean" && isGamePayload(candidate.payload);
}

function isGamePayload(value: unknown, depth = 0): value is Record<string, unknown> {
  if (depth > 8 || typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length > 100) return false;
  return Object.entries(value).every(([key, child]) => key.length <= 120 && (child === null || (typeof child === "string" && child.length <= 20_000) || (typeof child === "number" && Number.isFinite(child)) || typeof child === "boolean" || (Array.isArray(child) && child.length <= 100) || (typeof child === "object" && isGamePayload(child, depth + 1))));
}

function assertNextState(value: GameState, schemaVersion: number): GameState {
  if (!isGameState(value) || value.schemaVersion !== schemaVersion) throw new Error("Game runtime returned an invalid state");
  return structuredClone(value);
}

import { createGameDefinition, type FactoryField } from "./factory";
import type { GameManifest, GameRuntimeAdapter, GameState } from "./game";
import type { PackageManifest } from "./package-contract";

/**
 * A deliberately small, deterministic package used only by the opt-in
 * `factory-preview=1` qualification surface. It exercises the same factory
 * contracts that third-party declarative packages receive; it is not a
 * second application owner.
 */
export const FACTORY_PREVIEW_MANIFEST: PackageManifest = {
  packageId: "preview.reading-log",
  version: "1.0.0",
  displayName: "Reading Log",
  trustClass: "DECLARATIVE",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: ["preview.reading-entry"],
  commands: { consumes: ["record.create", "record.update"], provides: [] },
  capabilities: { required: ["record", "vault"], optional: ["search"] },
  permissions: [],
  externalEffects: [],
  dataSchema: "preview-reading-entry-v1",
  migrations: [],
  lifecycle: { offline: "full", recovery: "vault", rollback: "schema-compatible", uninstall: "retain-export", retirement: "stop" },
  accessibility: "WCAG-2.2-AA",
  inputProfile: ["keyboard", "touch"],
  localization: ["en-CA", "fr-CA"]
};

export const FACTORY_PREVIEW_FIELDS: FactoryField[] = [
  { id: "title", type: "text", required: true, labels: { "en-CA": "Title", "fr-CA": "Titre" } },
  { id: "minutes", type: "number", labels: { "en-CA": "Minutes", "fr-CA": "Minutes" } },
  { id: "tags", type: "tags", labels: { "en-CA": "Tags", "fr-CA": "Étiquettes" } }
];

export const FACTORY_PREVIEW_APP_TITLE = { "en-CA": "Reading Log", "fr-CA": "Journal de lecture" };

export const FACTORY_PREVIEW_GAME_MANIFEST: GameManifest = {
  packageId: "preview.constellation",
  version: "1.0.0",
  displayName: "Constellation",
  trustClass: "FIRST_PARTY",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["game"],
  ownedCanonicalTypes: ["preview.game-save"],
  commands: { consumes: [], provides: [] },
  capabilities: { required: ["game-save"], optional: [] },
  permissions: [],
  externalEffects: [],
  dataSchema: "preview-constellation-save-v1",
  migrations: [],
  lifecycle: { offline: "full", recovery: "save", rollback: "save-compatible", uninstall: "retain-save", retirement: "stop" },
  accessibility: "keyboard-touch",
  inputProfile: ["keyboard", "touch"],
  localization: ["en-CA", "fr-CA"],
  archetype: "GAME",
  runtimeAdapter: "preview-constellation-v1",
  saveSchemaVersion: 1,
  inputActions: ["move.right", "collect", "pause"],
  budgets: { frameMs: 16, memoryMb: 128, assetBytes: 100_000 }
};

export interface FactoryPreviewGamePayload {
  position: number;
  energy: number;
  stars: number;
  visited: number[];
}

export const factoryPreviewGameAdapter: GameRuntimeAdapter = {
  step: (state: GameState, action?: string): GameState => {
    const payload = state.payload as Partial<FactoryPreviewGamePayload>;
    const position = payload.position ?? 0;
    const energy = payload.energy ?? 4;
    const stars = payload.stars ?? 0;
    const visited = payload.visited ?? [0];
    if (action === "move.right" && energy > 0) {
      const nextPosition = position + 1;
      return { ...state, tick: state.tick + 1, payload: { position: nextPosition, energy: energy - 1, stars, visited: [...visited, nextPosition] } };
    }
    if (action === "collect" && position > 0 && position % 2 === 0 && !visited.includes(position * 100)) {
      return { ...state, tick: state.tick + 1, payload: { position, energy, stars: stars + 1, visited: [...visited, position * 100] } };
    }
    return { ...state, tick: state.tick + 1, payload: { position, energy, stars, visited } };
  }
};

export const FACTORY_PREVIEW_GAME = createGameDefinition(FACTORY_PREVIEW_GAME_MANIFEST);

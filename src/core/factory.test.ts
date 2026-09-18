import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { createGameDefinition, createRecordAppDefinition, type FactoryField } from "./factory";
import type { GameManifest } from "./game";
import { CanonicalStore } from "./storage";
import type { PackageManifest } from "./package-contract";

const readingManifest: PackageManifest = {
  packageId: "benchmark.reading-log",
  version: "1.0.0",
  displayName: "Reading log",
  trustClass: "DECLARATIVE",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["declarative"],
  ownedCanonicalTypes: ["benchmark.reading-entry"],
  commands: { consumes: ["record.create", "record.update"], provides: [] },
  capabilities: { required: ["record", "vault"], optional: ["search"] },
  permissions: [],
  externalEffects: [],
  dataSchema: "reading-entry-v1",
  migrations: [],
  lifecycle: { offline: "full", recovery: "vault", rollback: "schema-compatible", uninstall: "retain-export", retirement: "stop" },
  accessibility: "WCAG-2.2-AA",
  inputProfile: ["keyboard", "touch"],
  localization: ["en-CA", "fr-CA"]
};

const readingFields: FactoryField[] = [
  { id: "title", type: "text", required: true, labels: { "en-CA": "Title", "fr-CA": "Titre" } },
  { id: "minutes", type: "number", labels: { "en-CA": "Minutes", "fr-CA": "Minutes" } },
  { id: "tags", type: "tags", labels: { "en-CA": "Tags", "fr-CA": "Étiquettes" } }
];

const gameManifest: GameManifest = {
  packageId: "benchmark.constellation",
  version: "1.0.0",
  displayName: "Constellation",
  trustClass: "FIRST_PARTY",
  frameworkApi: "omnevum-sdk-1",
  entrypoints: ["game"],
  ownedCanonicalTypes: ["benchmark.game-save"],
  commands: { consumes: [], provides: [] },
  capabilities: { required: ["game-save"], optional: [] },
  permissions: [],
  externalEffects: [],
  dataSchema: "constellation-save-v1",
  migrations: [],
  lifecycle: { offline: "full", recovery: "save", rollback: "save-compatible", uninstall: "retain-save", retirement: "stop" },
  accessibility: "keyboard-touch",
  inputProfile: ["keyboard", "touch"],
  localization: ["en-CA", "fr-CA"],
  archetype: "GAME",
  runtimeAdapter: "constellation-v1",
  saveSchemaVersion: 1,
  inputActions: ["move.right", "collect", "pause"],
  budgets: { frameMs: 16, memoryMb: 128, assetBytes: 100_000 }
};

describe("factory benchmark contracts", () => {
  it("generates a localized baseline app and round-trips state through the canonical Vault", async () => {
    const definition = createRecordAppDefinition({ manifest: readingManifest, title: { "en-CA": "Reading log", "fr-CA": "Journal de lecture" }, fields: readingFields });
    expect(definition.baselineView).toMatchObject({ id: "benchmark.reading-log.baseline", source: "PACKAGE", widgets: [{ type: "form" }, { type: "list" }] });
    expect(definition.label("fr-CA")).toBe("Journal de lecture");

    const databaseName = `omnevum-factory-${Date.now()}`;
    const source = new CanonicalStore(databaseName);
    await source.open();
    const runtime = definition.createRuntime(new CommandBus(source));
    const first = await runtime.capture({ title: "Designing for calm", minutes: 25, tags: ["design", "focus"] });
    const second = await runtime.capture({ title: "Local-first systems", minutes: 40, tags: ["systems"] });
    const completed = await runtime.complete(first.id, first.revision);
    expect(completed.data.status).toBe("DONE");
    expect(await runtime.list()).toHaveLength(2);

    const vault = await source.exportVault();
    source.close();
    const restored = new CanonicalStore(`${databaseName}-restored`);
    await restored.open();
    await restored.importVault(vault);
    const restoredRuntime = definition.createRuntime(new CommandBus(restored));
    expect(new Set((await restoredRuntime.list()).map((record) => record.id))).toEqual(new Set([first.id, second.id]));
    expect((await restoredRuntime.list()).find((record) => record.id === first.id)?.data.status).toBe("DONE");
    restored.close();
  });

  it("rejects undeclared fields and keeps package ownership at the command boundary", async () => {
    const definition = createRecordAppDefinition({ manifest: readingManifest, title: { "en-CA": "Reading log" }, fields: readingFields });
    const store = new CanonicalStore(`omnevum-factory-validation-${Date.now()}`);
    await store.open();
    const runtime = definition.createRuntime(new CommandBus(store));
    await expect(runtime.capture({ title: "ok", privateBypass: true })).rejects.toThrow("undeclared field");
    store.close();
  });

  it("runs a nontrivial deterministic game across input, pause, responsive layout, save, and resume", () => {
    const definition = createGameDefinition(gameManifest);
    const adapter = {
      step: (state: ReturnType<ReturnType<typeof definition.createSession>["snapshot"]>, action?: string) => {
        const payload = state.payload as { position?: number; energy?: number; stars?: number; visited?: number[] };
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
    const session = definition.createSession(adapter, 42);
    session.dispatch("move.right");
    session.dispatch("move.right");
    session.dispatch("collect");
    expect(session.snapshot().payload).toMatchObject({ position: 2, stars: 1 });
    const checkpoint = session.save();
    const checkpointState = session.snapshot();
    session.pause();
    session.dispatch("move.right");
    expect(session.snapshot().payload.position).toBe(2);
    expect(definition.boardLayout(320)).toEqual({ columns: 1, compact: true });
    expect(definition.boardLayout(1024)).toEqual({ columns: 4, compact: false });

    const resumed = definition.createSession(adapter, 999);
    resumed.load(checkpoint);
    expect(resumed.snapshot()).toEqual(checkpointState);
    resumed.resume();
    resumed.dispatch("move.right");
    expect(resumed.snapshot().payload.position).toBe(3);
    expect(() => resumed.dispatch("network.fetch")).toThrow("not declared");
  });
});

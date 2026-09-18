import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { createRecordAppDefinition } from "./factory";
import { FACTORY_PREVIEW_APP_TITLE, FACTORY_PREVIEW_FIELDS, FACTORY_PREVIEW_GAME, FACTORY_PREVIEW_MANIFEST, factoryPreviewGameAdapter } from "./factory-preview";
import { CanonicalStore } from "./storage";

const phase = process.env.OMNEVUM_FACTORY_PHASE;
const checkpointPath = process.env.OMNEVUM_FACTORY_CHECKPOINT;

describe("factory interruption/resume benchmark", () => {
  it.skipIf(!phase || !checkpointPath)("creates a stateful app and game, then intentionally interrupts", async () => {
    if (!checkpointPath) throw new Error("Factory checkpoint path is required");
    if (phase === "create") {
      const definition = createRecordAppDefinition({ manifest: FACTORY_PREVIEW_MANIFEST, title: FACTORY_PREVIEW_APP_TITLE, fields: FACTORY_PREVIEW_FIELDS });
      const store = new CanonicalStore(`omnevum-interruption-${Date.now()}`);
      await store.open();
      const runtime = definition.createRuntime(new CommandBus(store));
      const first = await runtime.capture({ title: "Interrupted app state", minutes: 30, tags: ["resume"] });
      const second = await runtime.capture({ title: "Second app state", minutes: 15, tags: ["factory"] });
      const completed = await runtime.complete(first.id, first.revision);
      const game = FACTORY_PREVIEW_GAME.createSession(factoryPreviewGameAdapter, 42);
      game.dispatch("move.right");
      game.dispatch("move.right");
      game.dispatch("collect");
      writeFileSync(checkpointPath, JSON.stringify({ vault: await store.exportVault(), appIds: [first.id, second.id], completedId: completed.id, gameSave: game.save() }), "utf8");
      store.close();
      throw new Error("FACTORY_INTENTIONAL_INTERRUPTION");
    }
    if (phase !== "resume") throw new Error(`Unknown factory benchmark phase: ${phase}`);
    const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as { vault: Parameters<CanonicalStore["importVault"]>[0]; appIds: string[]; completedId: string; gameSave: string };
    const definition = createRecordAppDefinition({ manifest: FACTORY_PREVIEW_MANIFEST, title: FACTORY_PREVIEW_APP_TITLE, fields: FACTORY_PREVIEW_FIELDS });
    const store = new CanonicalStore(`omnevum-interruption-resumed-${Date.now()}`);
    await store.open();
    await store.importVault(checkpoint.vault);
    const records = await definition.createRuntime(new CommandBus(store)).list();
    expect(new Set(records.map((record) => record.id))).toEqual(new Set(checkpoint.appIds));
    expect(records.find((record) => record.id === checkpoint.completedId)?.data.status).toBe("DONE");
    const game = FACTORY_PREVIEW_GAME.createSession(factoryPreviewGameAdapter, 999);
    game.load(checkpoint.gameSave);
    expect(game.snapshot().payload).toMatchObject({ position: 2, stars: 1 });
    expect(game.snapshot().seed).toBe(42);
    store.close();
    console.log(`FACTORY_INTERRUPTION_RESUME_PASS records=${records.length} position=${game.snapshot().payload.position} stars=${game.snapshot().payload.stars}`);
  });
});

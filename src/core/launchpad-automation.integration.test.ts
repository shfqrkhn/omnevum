import { describe, expect, it } from "vitest";
import { CommandBus } from "./commands";
import { CORE_AUTOMATION_PACKAGE, PackageAutomationRuntime } from "./package-automation-runtime";
import { PackageAutomationRegistry } from "./package-automation-registry";
import { PackageRegistry } from "./package-contract";
import { CanonicalStore } from "./storage";

describe("v0.18 launchpad automation recovery", () => {
  it("persists a confirmed proposal and restores its rule through a Vault", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const source = new CanonicalStore(`omnevum-test-${suffix}-automation-source`);
    const destination = new CanonicalStore(`omnevum-test-${suffix}-automation-destination`);
    await source.open();
    await destination.open();
    try {
      const sourceCommands = new CommandBus(source);
      const target = await sourceCommands.create({ recordType: "note", owner: "core.knowledge", data: { text: "automation recovery target" } });
      const sourcePackages = new PackageRegistry();
      sourcePackages.install(CORE_AUTOMATION_PACKAGE);
      const sourceRuntime = new PackageAutomationRuntime(new PackageAutomationRegistry(sourcePackages), source);
      const document = JSON.stringify({
        schemaVersion: 1,
        ruleId: "omnevum.automation.launchpad-recovery",
        version: 1,
        trigger: "MANUAL",
        when: { op: "exists", path: "record.id" },
        actions: [{ command: "record.update", arguments: { recordId: target.id, field: "automationReviewed", value: true } }],
        enabled: true
      });

      await sourceRuntime.install(CORE_AUTOMATION_PACKAGE.packageId, document);
      const [proposal] = sourceRuntime.preview("MANUAL", { record: { id: target.id } });
      expect(proposal).toMatchObject({ packageId: CORE_AUTOMATION_PACKAGE.packageId, ruleId: "omnevum.automation.launchpad-recovery", command: "record.update" });
      const applied = await sourceRuntime.apply(sourceCommands, proposal!, { confirmed: true, allowedRecordIds: new Set([target.id]) });
      expect(applied).toMatchObject({ id: target.id, revision: 2, data: { automationReviewed: true } });

      const vault = await source.exportVault();
      expect(vault.automationRules).toHaveLength(1);
      expect(await destination.importVault(vault)).toEqual({ imported: 1, skipped: 0, conflicts: 0 });

      const destinationPackages = new PackageRegistry();
      destinationPackages.install(CORE_AUTOMATION_PACKAGE);
      const destinationRuntime = new PackageAutomationRuntime(new PackageAutomationRegistry(destinationPackages), destination);
      expect(await destinationRuntime.restore()).toEqual({ restored: 1, skipped: 0 });
      expect(destinationRuntime.list(CORE_AUTOMATION_PACKAGE.packageId)).toMatchObject([{ ruleId: "omnevum.automation.launchpad-recovery", status: "ENABLED" }]);
      expect(destinationRuntime.preview("MANUAL", { record: { id: target.id } })).toHaveLength(1);
      expect(await destination.get(target.id)).toMatchObject({ id: target.id, revision: 2, data: { automationReviewed: true } });
    } finally {
      source.close();
      destination.close();
    }
  });
});

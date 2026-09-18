import { describe, expect, it } from "vitest";
import { admitExtension } from "./extension-policy";

describe("extension admission", () => {
  it("admits declarative data and disables executable packages", () => {
    expect(admitExtension({ extensionId: "theme.dark", version: "1.0.0", kind: "DECLARATIVE", capabilities: ["theme"], source: "COMMUNITY" }).status).toBe("ADMITTED_DECLARATIVE");
    expect(admitExtension({ extensionId: "code.plugin", version: "1.0.0", kind: "EXECUTABLE", capabilities: ["network"], source: "COMMUNITY" })).toMatchObject({ status: "DISABLED_UNQUALIFIED" });
  });
});

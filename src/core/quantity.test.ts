import { describe, expect, it } from "vitest";
import { convertQuantity } from "./quantity";

describe("explicit measurement units", () => {
  it("converts only within a declared family", () => {
    expect(convertQuantity({ value: 1, unit: "h" }, "min")).toEqual({ value: 60, unit: "min" });
    expect(() => convertQuantity({ value: 1, unit: "h" }, "kg")).toThrow("Incompatible");
  });
});

import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, parseMoney, subtractMoney } from "./money";

describe("exact money semantics", () => {
  it("stores integer minor units with explicit currency", () => {
    const value = parseMoney("12.34", "cad");
    expect(value).toEqual({ amountMinor: "1234", currency: "CAD" });
    expect(addMoney(value, parseMoney("0.66", "CAD"))).toEqual({ amountMinor: "1300", currency: "CAD" });
    expect(subtractMoney(value, parseMoney("2.00", "CAD"))).toEqual({ amountMinor: "1034", currency: "CAD" });
    expect(formatMoney(value)).toContain("12.34");
  });

  it("rejects ambiguous precision or currency omission", () => {
    expect(() => parseMoney("1.001", "CAD")).toThrow("precision");
    expect(() => parseMoney("10", "")).toThrow("currency");
  });
});

import { describe, expect, it } from "vitest";
import { containsSensitiveKey, scrubSensitiveValue } from "./safety";

describe("untrusted and secret-shaped data safety", () => {
  it("removes reusable secret-shaped fields while retaining safe context", () => {
    const scrubbed = scrubSensitiveValue({ title: "safe", credentials: { password: "do-not-retain" }, nested: [{ accessToken: "hidden", value: 3 }] }) as Record<string, unknown>;
    expect(scrubbed).toEqual({ title: "safe", credentials: {}, nested: [{ value: 3 }] });
    expect(containsSensitiveKey({ nested: { authorization: "x" } })).toBe(true);
  });
});

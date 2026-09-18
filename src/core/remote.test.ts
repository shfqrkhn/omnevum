import { describe, expect, it } from "vitest";
import { JsonEndpointTransport } from "./remote";
import type { CanonicalRecord } from "./model";

function record(): CanonicalRecord {
  const now = new Date().toISOString();
  return { id: "remote", recordType: "note", owner: "core.capture", schemaVersion: 1, createdAt: now, modifiedAt: now, provenance: { source: "USER_INPUT", capturedAt: now }, truthClass: "USER_OBSERVATION", sensitivity: "PRIVATE", revision: 1, deleted: false, data: { text: "safe" } };
}

describe("bounded remote sync transport", () => {
  it("uses an explicit HTTPS endpoint and validates pulled records", async () => {
    let pushed = "";
    const expected = record();
    const transport = new JsonEndpointTransport("https://sync.example.test/replica", async (_input, init) => {
      if (init?.method === "PUT") { pushed = String(init.body); return new Response(null, { status: 204 }); }
      return new Response(JSON.stringify({ format: "OMNEVUM_REPLICA", version: 1, records: [expected] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await expect(transport.pull()).resolves.toEqual([expected]);
    await transport.push([expected]);
    expect(pushed).toContain("remote");
  });

  it("rejects insecure non-local endpoints and malformed replicas", async () => {
    expect(() => new JsonEndpointTransport("http://sync.example.test/replica")).toThrow("HTTPS");
    const transport = new JsonEndpointTransport("http://localhost/replica", async () => new Response(JSON.stringify({ records: [{ bad: true }] }), { status: 200 }));
    await expect(transport.pull()).rejects.toThrow("valid bounded replica");
  });
});

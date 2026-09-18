import { defineConfig, type Plugin } from "vitest/config";
import { createEffectLoopbackHandler, createEffectLoopbackState } from "./scripts/effect-loopback-core.mjs";

const effectLoopbackPreviewPlugin: Plugin = {
  name: "omnevum-effect-loopback-preview-fixture",
  configurePreviewServer(server) {
    if (process.env.OMNEVUM_EFFECT_FIXTURE !== "1") return;
    const state = createEffectLoopbackState();
    const fixture = createEffectLoopbackHandler(state, {
      basePath: "/__omnevum/effect",
      ...(process.env.OMNEVUM_EFFECT_FIXTURE_BEARER ? { requiredBearer: process.env.OMNEVUM_EFFECT_FIXTURE_BEARER } : {}),
      ambiguousFirstPost: process.env.OMNEVUM_EFFECT_FIXTURE_AMBIGUOUS_FIRST_POST === "1"
    });
    server.middlewares.use((request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== "/__omnevum/effect" && !pathname.startsWith("/__omnevum/effect/")) {
        next();
        return;
      }
      void fixture(request, response).catch(next);
    });
    console.log("EFFECT_PREVIEW_FIXTURE_READY /__omnevum/effect/action");
  }
};

export default defineConfig({
  base: "./",
  plugins: [effectLoopbackPreviewPlugin],
  build: {
    target: "es2022",
    sourcemap: true
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"]
  }
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Las funciones de Convex corren en un runtime tipo edge; convex-test lo simula en memoria.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
  },
});

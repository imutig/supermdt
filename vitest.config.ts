import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests unitaires (fonctions pures) + tests Convex (convex-test, runtime edge).
// Les tests sous convex/ tournent en environnement "edge-runtime" comme exigé
// par convex-test ; le reste tourne en Node.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["convex/**", "edge-runtime"]],
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
  },
});

import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});

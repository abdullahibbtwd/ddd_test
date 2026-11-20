import { defineConfig } from "orval";

export default defineConfig({
  ddcrm: {
    hooks: { afterAllFilesWrite: "prettier --write" },
    input: {
      // Regenerate with `pnpm api:client` from the repo root (runs `pnpm openapi` first).
      target: "../api/openapi.json",
    },
    output: {
      mode: "tags-split",
      target: "src/api/generated",
      schemas: "src/api/generated/model",
      client: "react-query",
      clean: true,
      override: {
        mutator: {
          path: "./src/api/mutator.ts",
          name: "apiFetch",
        },
      },
    },
  },
});

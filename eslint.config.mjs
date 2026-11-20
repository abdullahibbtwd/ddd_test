import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import react from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/routeTree.gen.ts",
      "**/src/generated/**",
      "**/src/api/generated/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Actor-context hybrid design: interactive tx / raw writes only via prisma helpers.
  {
    files: ["apps/api/**/*.{ts,tsx}"],
    ignores: [
      "apps/api/src/prisma/**",
      "apps/api/prisma/**",
      "apps/api/src/generated/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name='$transaction']",
          message:
            "Use PrismaService.transaction() / runAppTransaction() instead of $transaction (actor-context hybrid design).",
        },
        {
          selector: "MemberExpression[property.name='$executeRaw']",
          message:
            "Raw $executeRaw is restricted outside apps/api/src/prisma. Prefer the actor-aware helpers, or add an eslint-disable with a reason.",
        },
        {
          selector: "MemberExpression[property.name='$executeRawUnsafe']",
          message:
            "Raw $executeRawUnsafe is restricted outside apps/api/src/prisma. Add an eslint-disable with a reason if unavoidable.",
        },
        {
          selector: "MemberExpression[property.name='$queryRawUnsafe']",
          message:
            "Raw $queryRawUnsafe is restricted outside apps/api/src/prisma. Add an eslint-disable with a reason if unavoidable.",
        },
      ],
    },
  },
  // apps/web: every visible string must come from i18n (no literals in JSX).
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/**/*.test.{ts,tsx}", "apps/web/src/test/**"],
    plugins: { react },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "19" } },
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: [] },
      ],
    },
  },
);


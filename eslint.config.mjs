// CANONICAL — DO NOT EDIT IN VENDORED COPIES.
// Source-of-truth for the platform's shared ESLint 9 flat config.
// All Node services vendor a copy of this file at their repo root.
// When this file changes, propagation is manual (copy into each service in its next PR).
// See coding-conventions.md §22 + decomposition spec for the rationale.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/", "*.config.*"],
  },
];

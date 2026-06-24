/**
 * Flat config (ESLint 9+). Replaces the legacy .eslintrc.cjs / .eslintignore.
 * It relies on recommended configs out of the box for simplicity, but you can
 * and should modify this configuration to best suit your team's needs.
 */
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignores (replaces .eslintignore — no longer read by ESLint 9+)
  {
    ignores: [
      "node_modules/**",
      "build/**",
      "public/build/**",
      "extensions/*/dist/**",
      "**/*.d.ts",
      ".shopify/**",
      ".react-router/**",
    ],
  },

  // Base JS
  js.configs.recommended,

  // React + accessibility for all source files
  { ...react.configs.flat.recommended, files: ["**/*.{js,jsx,ts,tsx}"] },
  { ...react.configs.flat["jsx-runtime"], files: ["**/*.{js,jsx,ts,tsx}"] },
  jsxA11y.flatConfigs.recommended,

  // react-hooks: register manually. v7's bundled configs still use a legacy
  // `plugins: []` array (incompatible with flat config), and its recommended
  // set now enables the full React Compiler ruleset. Keep the two classic
  // rules that matched the previous `plugin:react-hooks/recommended`.
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Shared settings, globals, and rules for all source files
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        shopify: "readonly",
      },
    },
    settings: {
      react: { version: "detect" },
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
    },
    rules: {
      "react/no-unknown-property": ["error", { ignore: ["variant"] }],
    },
  },

  // TypeScript
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  { ...importPlugin.flatConfigs.recommended, files: ["**/*.{ts,tsx}"] },
  { ...importPlugin.flatConfigs.typescript, files: ["**/*.{ts,tsx}"] },
  {
    files: ["**/*.{ts,tsx}"],
    settings: {
      "import/internal-regex": "^~/",
      "import/resolver": {
        node: { extensions: [".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
  },

  // Node environment for config and server files
  {
    files: [
      "eslint.config.js",
      "vite.config.{js,ts}",
      ".graphqlrc.{js,ts}",
      "**/*.server.{js,ts}",
      "app/shopify.server.{js,ts}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);

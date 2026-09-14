import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import bbc from "./eslint-rules/index.mjs";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/graphify-out/**",
      "**/*.generated.*",
      "packages/ui/src/tokens.ts",
      "apps/mobile/tailwind.theme.js",
      // Snapshots stay under isolated/ until unpack (PR3/PR4). Not part of any package tsconfig.
      "isolated/**",
      // Config / tooling JS is not in the TS project service.
      "**/*.{js,cjs,mjs}",
      // Needs @bbc/db (wired in PR4).
      "scripts/seed-flags.ts",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },

  // ── promises: the betterauth-next bugs, forbidden ──────────────────────────
  {
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > MemberExpression[object.object.name='process'][object.property.name='env']",
          message: "process.env.X as string is forbidden — use loadEnv().",
        },
        {
          selector: "CallExpression[callee.property.name='forEach'] > ArrowFunctionExpression[async=true]",
          message: "forEach(async …) does not await. Use for…of.",
        },
        {
          selector: "CallExpression[callee.property.name='forEach'] > FunctionExpression[async=true]",
          message: "forEach(async …) does not await. Use for…of.",
        },
      ],
    },
  },

  // ── intra-module layering (eslint-plugin-boundaries) ───────────────────────
  {
    files: ["packages/modules/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "api", pattern: "packages/modules/*/*/src/api/**" },
        { type: "application", pattern: "packages/modules/*/*/src/application/**" },
        { type: "domain", pattern: "packages/modules/*/*/src/domain/**" },
        { type: "infrastructure", pattern: "packages/modules/*/*/src/infrastructure/**" },
        { type: "handlers", pattern: "packages/modules/*/*/src/handlers/**" },
        { type: "ports", pattern: "packages/modules/*/*/src/ports/**" },
        { type: "jobs", pattern: "packages/modules/*/*/src/jobs/**" },
        { type: "module", pattern: "packages/modules/*/*/src/module.ts" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "api", allow: ["application", "domain", "ports", "infrastructure"] },
            { from: "application", allow: ["domain", "ports", "infrastructure"] },
            { from: "domain", allow: ["domain"] },
            { from: "infrastructure", allow: ["domain", "ports"] },
            { from: "handlers", allow: ["application", "domain", "ports", "infrastructure"] },
            { from: "jobs", allow: ["application", "domain", "ports", "infrastructure"] },
            { from: "module", allow: ["api", "application", "domain", "ports", "infrastructure", "handlers", "jobs"] },
          ],
        },
      ],
    },
  },

  // ── contracts: the memberId rule ───────────────────────────────────────────
  {
    files: ["packages/shared/src/api/**/*.ts"],
    plugins: { bbc },
    rules: { "bbc/no-member-id-in-request-schemas": "error" },
  },

  // ── mobile: design system discipline + React Compiler ──────────────────────
  {
    files: ["apps/mobile/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    plugins: { bbc },
    rules: {
      "bbc/no-inline-color": "error",
      "bbc/require-test-id": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react-native", importNames: ["Animated", "Easing"], message: "Use react-native-reanimated." },
            {
              name: "react",
              importNames: ["useMemo", "useCallback", "memo"],
              message: "React Compiler is ON; manual memoization is forbidden.",
            },
            {
              name: "@react-native-async-storage/async-storage",
              message: "Use MMKV (cache) or SecureStore (secrets).",
            },
            { name: "react-native-fast-image", message: "Use expo-image." },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/ui/src/tokens.ts", "apps/mobile/src/constants/club.ts"],
    rules: { "bbc/no-inline-color": "off" },
  },
);

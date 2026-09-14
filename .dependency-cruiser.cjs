/** The architectural constitution, executable. `bun run arch:check` fails CI on any violation. */
const MOD = "^packages/modules";
const layer = (name) =>
  ({
    platform: `${MOD}/platform/`,
    core: `${MOD}/core/`,
    domain: `${MOD}/domain/`,
    intelligence: `${MOD}/intelligence/`,
    integration: `${MOD}/integration/`,
  })[name];

module.exports = {
  forbidden: [
    // ── 1. layers only downward ───────────────────────────────────────────────
    {
      name: "platform-imports-nothing",
      severity: "error",
      comment: "platform is the bottom layer",
      from: { path: layer("platform") },
      to: { path: `${MOD}/(core|domain|intelligence|integration)/` },
    },
    {
      name: "core-only-platform",
      severity: "error",
      from: { path: layer("core") },
      to: { path: `${MOD}/(domain|intelligence)/` },
    },
    {
      name: "domain-not-intelligence",
      severity: "error",
      comment: "domain asks intelligence through a port it defines; it never imports it",
      from: { path: layer("domain") },
      to: { path: layer("intelligence") },
    },
    {
      name: "integration-implements-ports-only",
      severity: "error",
      comment: "adapters may import only ports/ and types from the modules they serve",
      from: { path: layer("integration") },
      to: { path: `${MOD}/(core|domain|intelligence)/[^/]+/src/(application|domain|infrastructure|handlers)/` },
    },

    // ── 2. module boundary: only api/index.ts crosses ─────────────────────────
    {
      name: "no-cross-module-internals",
      severity: "error",
      comment: "import another module only through its api/index.ts (ports/ allowed for integration adapters)",
      from: { path: `${MOD}/(?<layer>[^/]+)/(?<mod>[^/]+)/` },
      to: {
        path: `${MOD}/(?<tolayer>[^/]+)/(?<tomod>[^/]+)/src/(application|domain|infrastructure|handlers)/`,
        pathNot: `${MOD}/$1/$2/`,
      },
    },
    {
      name: "only-integration-imports-foreign-ports",
      severity: "error",
      comment: "adapters implement ports declared by the module they serve; other layers use api/index.ts",
      from: { path: `${MOD}/(?!integration/)(?<layer>[^/]+)/(?<mod>[^/]+)/` },
      to: {
        path: `${MOD}/[^/]+/[^/]+/src/ports/`,
        pathNot: `${MOD}/$1/$2/`,
      },
    },
    {
      name: "integration-may-import-ports",
      severity: "info",
      comment:
        "adapters implement ports declared by the module they serve; only ports/, never application/ or infrastructure/",
      from: { path: `${MOD}/integration/` },
      to: { path: `${MOD}/(core|domain)/[^/]+/src/ports/` },
    },
    {
      name: "no-cross-module-schema",
      severity: "error",
      comment: "a table has one owner; read others through facades or events",
      from: { path: `${MOD}/(?<layer>[^/]+)/(?<mod>[^/]+)/` },
      to: { path: `${MOD}/[^/]+/[^/]+/src/infrastructure/schema\\.ts$`, pathNot: `${MOD}/$1/$2/` },
    },
    {
      name: "presentation-only-api",
      severity: "error",
      comment: "the BFF and the host see facades only",
      from: { path: "^apps/api/src/(presentation|index|registry|modules)" },
      to: { path: `${MOD}/[^/]+/[^/]+/src/(application|domain|infrastructure|handlers)/` },
    },

    // ── 3. shared is pure ─────────────────────────────────────────────────────
    {
      name: "shared-is-pure",
      severity: "error",
      comment: "contracts depend on zod only",
      from: { path: "^packages/shared/" },
      to: { path: "^(apps|packages/modules|packages/db|packages/ui)/" },
    },
    {
      name: "shared-no-runtime-libs",
      severity: "error",
      comment: "contracts stay free of ORM/RN/auth runtimes; hono is allowed for shared authz middleware only",
      from: { path: "^packages/shared/" },
      to: { path: "node_modules/(drizzle-orm|expo|react-native|react|better-auth)" },
    },

    // ── 4. mobile touches only shared + ui + its own code ────────────────────
    {
      name: "mobile-no-backend",
      severity: "error",
      from: { path: "^apps/mobile/" },
      to: { path: "^(apps/api|packages/modules|packages/db)/", pathNot: "^apps/api/src/index\\.ts$" },
    },

    // ── 5. hygiene ───────────────────────────────────────────────────────────
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: "\\.(d\\.ts|test\\.ts|md)$|scripts/|migrations/" },
      to: {},
    },
    { name: "no-test-in-prod", severity: "error", from: { pathNot: "(test|tests)/" }, to: { path: "(test|tests)/" } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "default"] },
    reporterOptions: { dot: { collapsePattern: "^(packages/modules/[^/]+/[^/]+|packages/[^/]+|apps/[^/]+)" } },
  },
};

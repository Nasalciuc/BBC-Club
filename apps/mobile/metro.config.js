const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// The app was moved into the monorepo rather than created in it, so Metro is told explicitly where the
// workspace root is: @bbc/shared and @bbc/ui live outside apps/mobile. APPEND to Expo's defaults — replacing
// them drops entries Expo relies on and fails `expo doctor` ("watchFolders does not contain all entries").
config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot])];
config.resolver.nodeModulesPaths = [
  ...new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, "node_modules"),
    path.resolve(monorepoRoot, "node_modules"),
  ]),
];

module.exports = config;

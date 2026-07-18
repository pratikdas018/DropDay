// Metro config for a pnpm workspace.
// Two things are required to consume @dropday/shared (raw TS, symlinked):
//   1. watchFolders must include the monorepo root so Metro sees packages/shared
//   2. nodeModulesPaths must include the root store so pnpm's symlinks resolve
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pnpm uses symlinks heavily; let Metro follow them rather than bailing out.
// Hierarchical lookup stays ON: pnpm does not hoist, so transitive deps (e.g.
// @babel/runtime helpers) must be found by walking up node_modules chains.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;

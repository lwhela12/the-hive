const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// One icon family, not nineteen.
//
// `@expo/vector-icons` has no side effects and Metro still cannot drop what it
// does not use: the package's index re-exports every family it ships, so asking
// for Ionicons pulled in MaterialCommunityIcons, three FontAwesome sets and the
// rest — about 1MB of glyph-map JSON welded into the main script, and eighteen
// typefaces listed as downloads.
//
// So the bare name resolves to lib/vectorIcons.ts, which hands back Ionicons.
// Doing it here rather than editing fifty import lines means a screen written
// next month gets the small version without anybody remembering to ask for it.
//
// A family added to lib/vectorIcons.ts is available everywhere immediately.
// Sub-path imports ('@expo/vector-icons/Ionicons') are untouched and still work.
// ---------------------------------------------------------------------------
const ICON_SHIM = path.resolve(__dirname, "lib/vectorIcons.ts");

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@expo/vector-icons") {
    return { type: "sourceFile", filePath: ICON_SHIM };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform
  );
};

module.exports = withNativeWind(config, { input: "./global.css" });

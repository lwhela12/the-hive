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

// ---------------------------------------------------------------------------
// Two libraries the web build carries without using. (2026-08-12)
//
// The web script was 4.0MB, and the source map said where it went:
//
// - react-native-reanimated + react-native-worklets: 707KB — 18% of the whole
//   script — reachable through exactly one import, the slide of Clive's
//   conversation drawer. On iOS the library runs animations on the UI thread
//   and earns its size; on web it runs them in plain JavaScript anyway, so
//   lib/lazyReanimatedWeb.tsx does the same job in a few hundred lines. That
//   file says what it covers and what it deliberately does not.
//
// - react-native-url-polyfill: ~60KB spent giving browsers a URL class they
//   were born with. lib/supabase.ts imports it for iOS, which has no URL.
//
// Both swaps are gated on `platform === "web"` so the iOS bundle is untouched.
// ---------------------------------------------------------------------------
const REANIMATED_WEB_SHIM = path.resolve(__dirname, "lib/lazyReanimatedWeb.tsx");
const URL_POLYFILL_WEB_STUB = path.resolve(__dirname, "lib/lazyUrlPolyfillWeb.ts");

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@expo/vector-icons") {
    return { type: "sourceFile", filePath: ICON_SHIM };
  }
  if (platform === "web") {
    if (moduleName === "react-native-reanimated") {
      return { type: "sourceFile", filePath: REANIMATED_WEB_SHIM };
    }
    if (
      moduleName === "react-native-url-polyfill" ||
      moduleName === "react-native-url-polyfill/auto"
    ) {
      return { type: "sourceFile", filePath: URL_POLYFILL_WEB_STUB };
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform
  );
};

module.exports = withNativeWind(config, { input: "./global.css" });

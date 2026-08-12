/**
 * react-native-url-polyfill, as the web build ships it: nothing.
 *
 * The polyfill exists because React Native's JavaScript engine has no URL
 * class. Every browser has had one for a decade — it is the thing being
 * polyfilled TOWARD — yet importing the package puts its whole implementation
 * (whatwg-url plus a Buffer shim, ~60KB) into the web script anyway, because
 * Metro bundles what is imported, used or not.
 *
 * metro.config.js resolves the package to this file on web only (2026-08-12).
 * iOS keeps the real polyfill, which it genuinely needs.
 */

/** The polyfill's named entry point, for anyone importing it directly. The
 * browser's own URL is already in place, so there is nothing to set up. */
export function setupURLPolyfill(): void {}

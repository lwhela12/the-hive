/**
 * The only icon family HIVE actually draws.
 *
 * `@expo/vector-icons` is a shop window: its index re-exports nineteen icon
 * families, and each one drags in a glyph map and a font file. Metro has no way
 * to know we only ever ask for one, so `import { Ionicons } from
 * '@expo/vector-icons'` was posting the whole catalogue to every member —
 * roughly 1MB of glyph-map JSON inside the main script, plus eighteen typefaces
 * we never draw a single character from (MaterialCommunityIcons alone is 1.3MB).
 *
 * Every one of the fifty-odd files that imports icons in this app imports
 * `Ionicons` and nothing else, checked 2026-08-06.
 *
 * `metro.config.js` points the bare name `@expo/vector-icons` at this file, so
 * the saving holds no matter which spelling a screen uses. That is deliberate:
 * fixing fifty import lines would have lasted until the fifty-first was written.
 *
 * Adding a second family is a real decision, not a typo — it costs another font
 * download. Add it here on purpose, and it becomes available app-wide.
 *
 * Two files point at this one and both are needed. `metro.config.js` decides
 * what ships; `tsconfig.json` ("paths") decides what compiles. Without the
 * tsconfig half, asking for a family HIVE does not bundle would typecheck
 * cleanly and then take the screen down at runtime with "element type is
 * invalid". With it, `npm run typecheck` names the missing family instead.
 */
export { default as Ionicons } from '@expo/vector-icons/Ionicons';

// The icon-set builders carry no font of their own, so they are free to keep.
// Nothing in HIVE uses them today; they are here so that a library reaching for
// them through the bare package name still finds them.
export { default as createIconSet } from '@expo/vector-icons/createIconSet';
export { default as createIconSetFromFontello } from '@expo/vector-icons/createIconSetFromFontello';
export { default as createIconSetFromIcoMoon } from '@expo/vector-icons/createIconSetFromIcoMoon';

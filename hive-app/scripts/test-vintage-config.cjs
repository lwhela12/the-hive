const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expo } = require('../app.json');
const profiles = {
  'legacy-2027': { name: 'Legacy HIVE 2027', slug: 'hive-legacy-2027', scheme: 'hivelegacy2027', bundle: 'com.lucaswhelan.hivelegacy2027', year: 2027 },
  'tech-hive': { name: 'Tech HIVE', slug: 'hive-tech', scheme: 'hivetech', bundle: 'com.lucaswhelan.hivetech', year: null },
};
const vintage = expo.extra.hiveVintage;
const expected = profiles[vintage.codeBranch];
test('branch has an explicit identity, not the 2026 identity', () => {
  assert.ok(expected, 'Unknown HIVE branch identity');
  assert.equal(expo.name, expected.name);
  assert.equal(expo.slug, expected.slug);
  assert.equal(expo.scheme, expected.scheme);
  assert.equal(expo.ios.bundleIdentifier, expected.bundle);
  assert.equal(expo.android.package, expected.bundle);
  assert.equal(expo.web.name, expected.name);
});
test('Legacy has a vintage year; Tech does not imply an annual reset', () => {
  assert.equal(vintage.year, expected.year);
});
test('2026 EAS project and update URL are not inherited', () => {
  assert.equal(expo.extra.eas, undefined);
  assert.equal(expo.updates.enabled, false);
  assert.equal(expo.updates.url, undefined);
});
test('configuration does not claim backend or member isolation', () => {
  assert.equal(vintage.backendConfigured, false);
  assert.equal(vintage.launchStatus, 'not-deployed');
});
test('original approved logo files remain referenced', () => {
  assert.equal(expo.icon, './assets/HIVE Logo Low Res.png');
  assert.equal(expo.web.favicon, './assets/hive-favicon.png');
});
test('non-live branch disables automatic Vercel Git deployment', () => {
  assert.equal(require('../vercel.json').git.deploymentEnabled, false);
  assert.equal(require('../../vercel.json').git.deploymentEnabled, false);
});

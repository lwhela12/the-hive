const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'lib', 'hiveWideIdentity.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText;

const runtimeModule = { exports: {} };
new Function('exports', 'module', 'require', '__filename', '__dirname', compiled)(
  runtimeModule.exports,
  runtimeModule,
  require,
  sourcePath,
  path.dirname(sourcePath),
);

const { getBoardAuthorIdentity, getHiveWideActivityAuthorName } = runtimeModule.exports;
const TECH = 'tech-hive';
const OG = 'og-hive';

const lucas = {
  id: 'lucas',
  name: 'Lucas Whelan',
  avatar_url: 'lucas.jpg',
  profile_scope: 'hive',
  community_memberships: [{ community_id: TECH }],
};
const ogOnly = {
  id: 'og-member',
  name: 'OG Member',
  avatar_url: 'og.jpg',
  profile_scope: 'hive',
  community_memberships: [{ community_id: OG }],
};
const nat = {
  id: 'nat',
  name: 'Nat Walstead',
  avatar_url: 'nat.jpg',
  profile_scope: 'all_hives',
  community_memberships: [{ community_id: OG }, { community_id: TECH }],
};

function expectAnonymous(actual, label) {
  assert.equal(actual.isAnonymous, true, `${label}: identity should be hidden`);
  assert.equal(actual.memberId, null, `${label}: profile link should be removed`);
  assert.equal(actual.name, 'HIVE member', `${label}: name should be generic`);
  assert.equal(actual.avatarUrl, null, `${label}: photo should become the bee`);
}

function expectVisible(actual, expected, label) {
  assert.equal(actual.isAnonymous, false, `${label}: identity should be visible`);
  assert.equal(actual.memberId, expected.id, `${label}: profile link should remain`);
  assert.equal(actual.name, expected.name, `${label}: name should remain`);
  assert.equal(actual.avatarUrl, expected.avatar_url, `${label}: photo should remain`);
}

// Same shared thread, different door.
expectAnonymous(getBoardAuthorIdentity(lucas, null), 'Lucas at HIVE-Wide');
expectVisible(getBoardAuthorIdentity(lucas, TECH), lucas, 'Lucas inside Tech HIVE');

// A private profile does not become recognizable inside somebody else's HIVE.
expectAnonymous(getBoardAuthorIdentity(lucas, OG), 'Lucas inside OG HIVE');
expectAnonymous(getBoardAuthorIdentity(ogOnly, TECH), 'OG-only member inside Tech HIVE');

// The profile-wide switch is the explicit override everywhere.
expectVisible(getBoardAuthorIdentity(nat, null), nat, 'Nat at HIVE-Wide');
expectVisible(getBoardAuthorIdentity(nat, TECH), nat, 'Nat inside Tech HIVE');

// Missing scope/membership data fails closed on contextual surfaces.
expectAnonymous(getBoardAuthorIdentity({ id: 'legacy', name: 'Legacy Member' }, null), 'legacy row at HIVE-Wide');
expectAnonymous(getBoardAuthorIdentity({ ...lucas, community_memberships: [] }, TECH), 'missing Tech membership join');

// Callers outside contextual HIVE surfaces keep their established treatment.
expectVisible(getBoardAuthorIdentity(lucas, undefined), lucas, 'ungated caller');

assert.equal(getHiveWideActivityAuthorName(lucas), 'HIVE member');
assert.equal(getHiveWideActivityAuthorName(nat), 'Nat Walstead');

console.log('HIVE-Wide identity: location, membership, profile sharing, links, replies, reactions, and search use one matrix.');

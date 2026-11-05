const assert = require('node:assert/strict');
const { test } = require('node:test');
const { groupWaitlistByHive, waitlistInterests } = require('../lib/waitlist.ts');

const hives = [{ id: 'og', slug: 'default' }, { id: 'tech', slug: 'tech' }, { id: 'production', slug: 'production' }];
const person = { email: 'sam@example.invalid', name: 'Sam', interested_in: 'tech', interest_slugs: ['default', 'tech'] };

test('a dual signup reaches both intended owner folders, once each', () => {
  const result = groupWaitlistByHive([person], hives, {}, {});
  assert.deepEqual(result, { og: [person], tech: [person], production: [] });
  assert.deepEqual(waitlistInterests({ ...person, interest_slugs: ['default', 'tech', 'default'] }), ['default', 'tech']);
});

test('joining or awaiting an invite in one HIVE leaves the other request actionable', () => {
  const joined = groupWaitlistByHive([person], hives, {
    tech: [{ id: 'member', email: ' SAM@EXAMPLE.INVALID ', name: 'Sam' }],
  }, {});
  assert.deepEqual(joined, { og: [person], tech: [], production: [] });
  const invited = groupWaitlistByHive([person], hives, {}, { og: [{ email: person.email }] });
  assert.deepEqual(invited, { og: [], tech: [person], production: [] });
});

test('a unique name still handles an alternate email in only the fulfilled HIVE', () => {
  const result = groupWaitlistByHive([person], hives, {
    tech: [{ id: 'member', email: 'sam-work@example.invalid', name: 'Sam' }],
  }, {});
  assert.deepEqual(result, { og: [person], tech: [], production: [] });
});

test('ambiguous names do not hide a request', () => {
  const result = groupWaitlistByHive([person], hives, { tech: [
    { id: 'one', email: 'one@example.invalid', name: 'Sam' },
    { id: 'two', email: 'two@example.invalid', name: 'Sam' },
  ] }, {});
  assert.deepEqual(result.tech, [person]);
});

test('legacy scalar-only rows retain their original target', () => {
  const legacy = { email: person.email, interested_in: 'tech' };
  assert.deepEqual(groupWaitlistByHive([legacy], hives, {}, {}), { og: [], tech: [legacy], production: [] });
});

test('general /join interests remain general until fulfilled anywhere', () => {
  const general = { email: person.email, name: person.name, interested_in: null, interest_slugs: [] };
  assert.deepEqual(groupWaitlistByHive([general], hives, {}, {}), {
    og: [general], tech: [general], production: [general],
  });
  assert.deepEqual(groupWaitlistByHive([general], hives, {}, { tech: [{ email: person.email }] }), {
    og: [], tech: [], production: [],
  });
  // One person present in two HIVEs still counts as a unique person.
  const member = { id: 'member', email: 'work@example.invalid', name: 'Sam' };
  assert.deepEqual(groupWaitlistByHive([general], hives, { og: [member], tech: [member] }, {}), {
    og: [], tech: [], production: [],
  });
});

test('unresolved slugs never broaden a specific request to every HIVE', () => {
  const unknown = { email: person.email, interested_in: 'future-hive', interest_slugs: ['future-hive'] };
  assert.deepEqual(groupWaitlistByHive([unknown], hives, {}, {}), { og: [], tech: [], production: [] });
});

test('admin grouping is limited to the caller’s HIVE folders', () => {
  assert.deepEqual(groupWaitlistByHive([person], [hives[0]], {}, {}), { og: [person] });
});

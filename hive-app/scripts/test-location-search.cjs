const assert = require('node:assert/strict');
const fs = require('node:fs');

const component = fs.readFileSync('components/ui/LocationSearchInput.tsx', 'utf8');
const edge = fs.readFileSync('supabase/functions/location-search/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

assert.match(component, /MIN_SEARCH_LENGTH = 3/);
assert.match(component, /SEARCH_DELAY_MS = 550/);
assert.match(component, /sessionToken/);
assert.match(component, /Places by Foursquare/);
assert.match(component, /Addresses by Geoapify/);
assert.match(component, /You can still type the location/);
assert.doesNotMatch(component, /ComposerBar|VoiceMicButton|attachment/i);

assert.match(edge, /verifySupabaseJwt/);
assert.match(edge, /FOURSQUARE_PLACES_API_KEY/);
assert.match(edge, /GEOAPIFY_API_KEY/);
assert.match(edge, /places-api\.foursquare\.com\/autocomplete/);
assert.match(edge, /api\.geoapify\.com\/v1\/geocode\/autocomplete/);
assert.match(edge, /X-Places-Api-Version/);
assert.match(edge, /LAS_VEGAS/);
assert.doesNotMatch(edge, /console\.log\([^)]*apiKey/);
assert.match(config, /\[functions\.location-search\]\s*verify_jwt = false/);

const surfaces = [
  'app/(app)/hive.tsx',
  'app/(app)/meetings.tsx',
  'app/(app)/monthly-tuneup.tsx',
  'components/meetings/ScheduleMeetingModal.tsx',
];
for (const file of surfaces) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /LocationSearchInput/, `${file} uses the shared place search`);
}

const locationComposer = /<ComposerBar[\s\S]{0,260}(?:label|placeholder)="Location/;
for (const file of surfaces) {
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), locationComposer, `${file} has no voice composer for search`);
}

const scheduleForm = fs.readFileSync('components/meetings/ScheduleMeetingModal.tsx', 'utf8');
const meetingsScreen = fs.readFileSync('app/(app)/meetings.tsx', 'utf8');
const scheduleEdge = fs.readFileSync('supabase/functions/schedule-meeting/index.ts', 'utf8');
const updateEdge = fs.readFileSync('supabase/functions/update-meeting/index.ts', 'utf8');
assert.match(scheduleForm, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
assert.match(scheduleForm, /timezone: userTimezone,[\s\S]{0,100}location: location\.trim\(\)/);
assert.match(meetingsScreen, /location: editForm\.location \|\| null/);
assert.match(meetingsScreen, /timezone: Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
assert.match(scheduleEdge, /start: \{ dateTime: startDateTime, timeZone \}/);
assert.match(scheduleEdge, /requestBody\.location = location/);
assert.match(updateEdge, /requestBody\.location = location/);
assert.match(updateEdge, /requestBody\.start = \{ dateTime: startDateTime, timeZone \}/);

console.log('PASS: one signed-in, debounced venue/address search with manual fallback, both attributions, protected provider keys, all location surfaces wired, and calendar location/timezone preserved.');

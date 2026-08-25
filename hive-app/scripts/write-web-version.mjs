import fs from 'node:fs';

const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.EXPO_PUBLIC_BUILD_ID || String(Date.now());
fs.writeFileSync('dist/version.json', JSON.stringify({ buildId }));

// Stamp the same build into the service worker.
//
// The worker's cache names are built from this, so a new build gives the file
// new bytes — and new bytes are the ONLY thing that makes a browser install a
// new worker and let `activate` throw the old caches away. A hand-written
// version string meant that only happened when somebody remembered to bump it;
// in between, a member could sit on a weeks-old app with no way out short of
// clearing their website data (Nat, 2026-08-25, who could not get today's fixes
// onto her phone by any normal means).
//
// Loud on failure on purpose: a silent miss here looks like a clean deploy and
// quietly turns auto-updating back off for everybody.
const swPath = 'dist/sw.js';
if (!fs.existsSync(swPath)) {
  throw new Error(`${swPath} is missing — the service worker did not reach the build output, so nobody would auto-update.`);
}
const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__HIVE_BUILD_ID__')) {
  throw new Error(`${swPath} has no __HIVE_BUILD_ID__ placeholder — its cache names would not change between deploys, and members would stop receiving updates.`);
}
fs.writeFileSync(swPath, sw.replaceAll('__HIVE_BUILD_ID__', buildId));

console.log(`Stamped web build ${buildId.slice(0, 12)} into version.json and sw.js`);

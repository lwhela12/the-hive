import fs from 'node:fs';

const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.EXPO_PUBLIC_BUILD_ID || String(Date.now());
fs.writeFileSync('dist/version.json', JSON.stringify({ buildId }));
console.log(`Stamped web build ${buildId.slice(0, 12)}`);

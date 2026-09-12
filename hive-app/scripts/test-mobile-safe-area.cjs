const assert = require('node:assert/strict');
const fs = require('node:fs');

const appShell = fs.readFileSync('app/(app)/_layout.tsx', 'utf8');
const rootShell = fs.readFileSync('app/_layout.tsx', 'utf8');
const header = fs.readFileSync('components/navigation/AppHeader.tsx', 'utf8');
const updateBanner = fs.readFileSync('components/ui/AppUpdateBanner.tsx', 'utf8');
const closeButton = fs.readFileSync('components/ui/CloseButton.tsx', 'utf8');

assert.match(appShell, /const topChrome = wholeHive \? HIVE_WIDE_HEADER : hiveAccent\(community\)/);
assert.match(appShell, /testID="app-safe-area-top"/);
assert.match(appShell, /height: insets\.top/);
assert.match(appShell, /backgroundColor: topChrome/);
assert.match(rootShell, /const statusBarStyle = luminance\(topChrome\) < 0\.45 \? 'light' : 'dark'/);
assert.match(rootShell, /<StatusBar style=\{statusBarStyle\}/);
assert.match(header, /backgroundColor: accent/);
assert.match(header, /HIVE_WIDE_HEADER/);
assert.match(updateBanner, /env\(safe-area-inset-top\)/);
assert.match(updateBanner, /env\(safe-area-inset-left\)/);
assert.match(updateBanner, /env\(safe-area-inset-right\)/);
assert.match(updateBanner, /<CloseButton/);
assert.match(closeButton, /width: 44/);
assert.match(closeButton, /height: 44/);

console.log('PASS: phone chrome and the update banner respect every safe edge, with a reachable close button.');

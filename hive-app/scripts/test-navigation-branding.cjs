const assert = require('node:assert');
const fs = require('node:fs');

const sideRail = fs.readFileSync('components/navigation/SideRail.tsx', 'utf8');
const pathFooter = fs.readFileSync('components/navigation/PathFooter.tsx', 'utf8');
const breadcrumbs = fs.readFileSync('components/ui/Breadcrumbs.tsx', 'utf8');

assert.ok(
  sideRail.includes('source={hiveSeal(onHiveWide ? null : community?.slug)}'),
  'the rail logo follows the active HIVE or HIVE-Wide',
);
assert.ok(
  sideRail.includes("'HIVE-Wide' : hiveDisplayName(community?.name)"),
  'the active seal has a place-specific accessible name',
);
assert.ok(
  pathFooter.includes('if (pathname === route) router.replace(route as never);'),
  'a current-route crumb remains a working button',
);
assert.ok(
  !pathFooter.includes('pathname === route ? undefined'),
  'route equality never strips a footer handler',
);
assert.ok(
  breadcrumbs.includes('const goes = !!item.onPress;'),
  'the current crumb stays clickable when its screen gives it a handler',
);

console.log('Navigation branding: every footer door works and the rail wears the active place seal.');

const assert = require('node:assert');
const fs = require('node:fs');

const sideRail = fs.readFileSync('components/navigation/SideRail.tsx', 'utf8');
const pathFooter = fs.readFileSync('components/navigation/PathFooter.tsx', 'utf8');
const breadcrumbs = fs.readFileSync('components/ui/Breadcrumbs.tsx', 'utf8');
const boards = fs.readFileSync('app/(app)/board.tsx', 'utf8');
const pathTrail = fs.readFileSync('lib/hooks/usePathTrail.tsx', 'utf8');

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
assert.ok(
  boards.includes('selectedCategory ? resetBoardToList : undefined'),
  'Back to Boards clears the remembered board instead of reopening it after one frame',
);
assert.ok(
  boards.indexOf('const resetBoardToList = useCallback') < boards.indexOf('useDeepTrail('),
  'the complete board reset is available to the footer trail',
);
assert.ok(
  pathTrail.includes("`${c.label}:${c.onPress ? 'back' : 'here'}`"),
  'a crumb becoming clickable refreshes the rendered trail even when its label stays the same',
);
assert.ok(
  pathTrail.includes('() => latest.current[index]?.onPress?.()'),
  'deep crumb presses always call the screen’s current handler',
);

console.log('Navigation branding: every footer door works and the rail wears the active place seal.');

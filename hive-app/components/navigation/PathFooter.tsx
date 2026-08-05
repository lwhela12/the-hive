import { View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Breadcrumbs, type Crumb } from '../ui/Breadcrumbs';
import { HiveMark } from '../ui/HiveMark';
import { WorldMark } from '../ui/WorldMark';
import { useAuth } from '../../lib/hooks/useAuth';
import { usePathTrail } from '../../lib/hooks/usePathTrail';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { usePageSkin } from '../../lib/pageSkin';
import { NAV_DESTINATIONS, ADMIN_DESTINATION, activeKeyForPath } from '../../lib/navigation';

/**
 * The thin strip along the bottom that always says where you are.
 *
 * Nat, 2026-08-05: *"What if we add a permanent nav footer? ... what if we just
 * add a little tiny footer that shows the pathway, the way that Finder does?
 * Like the footer here, just real thin like that too."*
 *
 * She is right on both counts, and the second reason is the better one. Putting
 * the trail inside each page meant every page had to find room for it, and on
 * the thread screen it landed in a huge empty gap — a horizontal scroller in
 * React Native grows to fill whatever space it is given, so the trail sat
 * marooned in the middle of it. A strip that belongs to the app rather than to
 * a page has one home, one size, and appears on screens nobody thought to add
 * it to.
 *
 * It also answers a complaint she made in the same breath: *"i already dont
 * like how low this is on the window."* The reply bar was flush against the
 * bottom edge of the browser. Now it has a floor to sit on.
 *
 * ## Where the path comes from
 *
 * Two halves. The route knows which HIVE you are in and which page you are on
 * — `lib/navigation.ts` already holds every page's name, so the footer reads
 * the same list the rail draws from and cannot disagree with it. Anything
 * deeper is only known to the screen, and it hands that over with
 * `useDeepTrail`.
 *
 * The first step wears its HIVE's own mark, the same hexagon and Earth the
 * badges use.
 */
export function PathFooter() {
  const pathname = usePathname();
  const router = useRouter();
  const { community, wholeHive } = useAuth();
  const deep = usePathTrail();
  const skin = usePageSkin();

  const activeKey = activeKeyForPath(pathname);
  const page = [...NAV_DESTINATIONS, ADMIN_DESTINATION].find((d) => d.key === activeKey);

  const place: Crumb = wholeHive
    ? {
        label: 'HIVE-Wide',
        mark: <WorldMark size={11} />,
        onPress: () => router.push('/hive-wide' as never),
      }
    : {
        label: hiveDisplayName(community?.name),
        mark: <HiveMark size={10} colour={hiveAccent(community)} />,
        onPress: () => router.push('/hive' as never),
      };

  const items: Crumb[] = [
    place,
    // Home IS the place, so naming it twice would read as a stutter.
    ...(page && page.key !== 'home'
      ? [{ label: page.label, onPress: () => router.push(page.route as never) }]
      : []),
    ...deep,
  ];

  // Nothing to say beyond which HIVE you are in — the rail already shows that,
  // and a strip that only ever repeats it is furniture.
  if (items.length < 2) return null;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: skin.border,
        // Cream inside a HIVE, space at HIVE-Wide. A hard-coded cream strip
        // would be a bright band across the bottom of the night sky.
        backgroundColor: skin.dark ? 'rgba(255,248,233,0.05)' : '#f4f0e6',
      }}
    >
      <Breadcrumbs items={items} compact dense tone={skin.dark ? 'dark' : 'light'} />
    </View>
  );
}

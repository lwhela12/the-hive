import { View, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Breadcrumbs, type Crumb } from '../ui/Breadcrumbs';
import { HiveMark } from '../ui/HiveMark';
import { WorldMark } from '../ui/WorldMark';
import { useAuth } from '../../lib/hooks/useAuth';
import { usePathTrail, usePagePress } from '../../lib/hooks/usePathTrail';
import { hiveDisplayName, hiveTagMark } from '../../lib/hiveBrand';
import { usePageSkin } from '../../lib/pageSkin';
import { useBottomInset } from '../../lib/safeAreaBottom';
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
  const pagePress = usePagePress();
  const skin = usePageSkin();
  /**
   * The strip sits on the bottom edge of the window, and on an iPhone added to
   * the home screen that edge is behind the home indicator — the app runs
   * `display: standalone` with a see-through status bar and `viewport-fit=cover`,
   * so the page really does reach the glass. Screens handle their own top edge
   * with `edges={['top']}`; this belongs to the shell around them, so it clears
   * its own (2026-08-06).
   */
  const insets = useSafeAreaInsets();
  // Capped, because the raw measurement comes back far larger than any real
  // home indicator on Nat's phone and every point of it is taken off the
  // bottom of the screen. The side rail needs the same number, so the rule
  // lives in one place — see lib/safeAreaBottom.ts.
  const bottomInset = useBottomInset();

  const activeKey = activeKeyForPath(pathname);
  const page = [...NAV_DESTINATIONS, ADMIN_DESTINATION].find((d) => d.key === activeKey);

  /**
   * A step only gets a handler when it leads somewhere you are not.
   *
   * The HIVE's own name and the word "Home" are the same door, so on Home the
   * first step was a button that put you back on the page you were already
   * reading — the nothing-happens bug the rail had, moved down to the footer.
   * Now it reads as a plain label there, which is the truth: you are in it.
   *
   * The same applies to a screen you are standing deep inside. Meetings stays
   * `/meetings` while you read June's summary, so a "Meetings" button here
   * could only push the route it is already on and change nothing on screen.
   * The way back up out of that depth belongs to the screen holding it — it is
   * the one that can put its own list back — and it hands it over as a crumb of
   * its own through `useDeepTrail`.
   */
  const stepTo = (route: string) => (
    pathname === route ? undefined : () => router.push(route as never)
  );

  const placeRoute = wholeHive ? '/hive-wide' : '/hive';
  const place: Crumb = wholeHive
    ? {
        label: 'HIVE-Wide',
        mark: <WorldMark size={11} />,
        onPress: stepTo(placeRoute),
      }
    : {
        label: hiveDisplayName(community?.name),
        mark: <HiveMark size={10} colour={hiveTagMark(community)} />,
        onPress: stepTo(placeRoute),
      };

  const items: Crumb[] = [
    place,
    // Home is named too. Leaving it out avoided a stutter and cost something
    // worth more: the strip vanished on the one page people land on first, so
    // it looked like a thing that comes and goes. Nat: "HIVE-Wide is missing a
    // nav footer on home... I think we should ALWAYS have the navigation
    // footers." A status bar that is sometimes absent is worse than one that
    // occasionally states the obvious.
    // A screen holding its own depth (Boards keeps the open board and thread in
    // state while the route stays `/board`) says what this crumb should do, so
    // tapping "Boards" from inside a thread actually shows you the boards.
    ...(page ? [{ label: page.label, onPress: pagePress ?? stepTo(page.route) }] : []),
    ...deep,
  ];

  if (items.length === 0) return null;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: skin.border,
        // Cream inside a HIVE, space at HIVE-Wide. A hard-coded cream strip
        // would be a bright band across the bottom of the night sky.
        // Opaque, not a wash.
        //
        // A 5% tint over the HIVE-Wide page put the trail on top of the bright
        // edge of the planet, where cream-on-white is unreadable — Nat, of the
        // strip along the bottom: "i cant read the navigational footer". A
        // status bar has to be legible over whatever the page happens to be
        // doing underneath it, so it stops being see-through.
        backgroundColor: skin.dark ? '#0B0B12' : '#f4f0e6',
        // The bar's colour carries on under the home indicator; the words stop
        // above it. The right edge is the landscape notch — the left one is
        // already taken care of by the rail standing in front of it.
        paddingBottom: bottomInset,
        paddingRight: insets.right,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Breadcrumbs items={items} compact dense tone={skin.dark ? 'dark' : 'light'} />
        </View>
        {/* Which version this screen is actually running, said out loud.
            2026-08-25 was spent shipping fixes to a phone while nobody —
            including the person holding it — could tell whether the phone had
            them yet. Every "did it update?" was a guess read off pixel
            measurements of screenshots. Seven quiet characters end that: the
            screen itself says which build it is, and "are you current" becomes
            a ten-second look instead of an afternoon. */}
        {BUILD_STAMP ? (
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 9,
              color: skin.dark ? 'rgba(255,248,233,0.28)' : 'rgba(49,49,48,0.26)',
              paddingRight: 10,
              paddingLeft: 6,
            }}
            accessibilityLabel={`App version ${BUILD_STAMP}`}
          >
            {BUILD_STAMP}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The running bundle's commit, shortened. Empty in local dev, which hides it. */
const BUILD_STAMP = (process.env.EXPO_PUBLIC_BUILD_ID ?? '').slice(0, 7);

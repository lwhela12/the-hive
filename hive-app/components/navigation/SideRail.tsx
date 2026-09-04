import { memo, useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions, Animated, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomInset } from '../../lib/safeAreaBottom';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { hiveAccent, hiveDisplayName, hiveOnDark, luminance } from '../../lib/hiveBrand';
import { HiveMark } from '../ui/HiveMark';
import { WorldMark } from '../ui/WorldMark';
import { ADMIN_DESTINATION, destinationsForPlace, activeKeyForPath } from '../../lib/navigation';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { resetHomeNavigationState } from '../../lib/homeNavigation';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Avatar } from '../ui/Avatar';
import { BounceScrollView } from '../ui/BounceScrollView';
import { QuickAdd } from './QuickAdd';
import { useOpenFeedback } from '../../lib/openFeedback';

/**
 * The side rail, borrowed from Jammin' Sprouts at Nat's request 2026-08-03.
 *
 * It reads top to bottom as zoom levels, then pages, then the god view — her
 * ordering, arrived at out loud after three false starts:
 *
 *   HIVE, and the line about a bee     what this is
 *   HIVE-Wide                          the most zoomed-out view
 *   My HIVE (+ each of yours, in its   the view you live in
 *            own colour, indented)
 *   ───────────────
 *   Home · Clive · Members · …         the pages of whichever view you're in
 *   Swap HIVEs · Log out
 *   ───────────────
 *   Admin                              god view; the newsletter tools are inside
 *
 * Green is HIVE-Wide's colour everywhere in the app, so it is green here too,
 * against the HIVE's own deepened accent.
 */

/** A Pressable that can be scaled — the rail dips a row you are already on. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * THREE SIZES (Nat 2026-08-06: "I see that the side nav bar still only has 2
 * sizes, instead of 3, was that ignored intentionally?").
 *
 * It was parked, and she has overruled that. Her three, in her words:
 *
 *   big     the full drawer — bee, "WELCOME Nat", her face, and every HIVE and
 *           page spelled out. What you want on day one.
 *   medium  a narrow rail: a picture with its name underneath. "As you get more
 *           familiar with the site, you won't need this version, which we'll
 *           call medium."
 *   small   "the way we had it yday, w just tiny icons & no text."
 *
 * Small was a problem the first time round for a reason worth keeping written
 * down: the tab bar came out on 2026-08-03, the rail became the only way to
 * move around, and on a phone it started as a column of unlabelled pictures —
 * 🏠 👥 📋 📰 📣 👋 down the left edge, with nothing to say where any of them
 * went. Nat's words for who is using this: "we have very very very very not
 * tech savvy people."
 *
 * What changed is not the pictures, it is who chose them. Small is now a thing
 * a person picks once they already know the app, never the state they are
 * dropped into — so the starting size is still big on a wide screen and medium
 * on a phone. Two rules follow from that and both are load-bearing:
 *
 *   - Small must be escapable. The one control that steps the size sits in the
 *     same spot in all three sizes, and from small it points OUT, at the big
 *     menu, so the way back is the button you got here with.
 *   - Small still has names, they are just not drawn. Every row carries its
 *     `accessibilityLabel`, and on the web it carries a hover tooltip too.
 */
export type RailSize = 'big' | 'medium' | 'small';

/** The full drawer. */
const RAIL_BIG = 212;
/**
 * The middle size: a picture with a small name under it.
 *
 * Eight pixels wider than the icons-only rail, which is the whole price of
 * every destination being readable. It shipped on 2026-08-06 as what a phone
 * did when the drawer was shut; it is a size anybody can choose now.
 */
const RAIL_MEDIUM = 64;
/** Pictures only. */
const RAIL_SMALL = 56;

/** One control, stepping the way familiarity goes: big → medium → small → big. */
const NEXT_SIZE: Record<RailSize, RailSize> = {
  big: 'medium',
  medium: 'small',
  small: 'big',
};

/**
 * What the control is about to do, said in words.
 *
 * A screen reader reads it, and on the web a mouse hovering the button sees the
 * same sentence — because "what happens if I press this?" is the whole question
 * a cycling button raises, and the chevron alone can only answer half of it.
 */
const SIZE_STEP: Record<RailSize, string> = {
  big: 'Menu size: big. Tap to make it medium — pictures with small names.',
  medium: 'Menu size: medium. Tap to make it small — pictures only.',
  small: 'Menu size: small. Tap for the big menu, with every name spelled out.',
};

/**
 * The size a person picked, kept for them.
 *
 * Same shape as `lib/hiveSelection.ts`: a value in memory so it survives every
 * screen change, with the browser's own store underneath so it survives a
 * reload. One deliberate difference — this uses `localStorage` where the chosen
 * HIVE uses `sessionStorage`.
 *
 * The reason for that difference: which HIVE you are standing in is a PLACE, and
 * a genuinely fresh arrival should start above the HIVEs rather than wherever
 * they were last week. How big you like the menu is not a place, it is a
 * preference that only gets truer the longer somebody uses the app — Nat's own
 * framing is that you outgrow medium. Forgetting it every time a tab closes
 * would ask the same question forever, which is the thing she is asking us to
 * stop doing.
 *
 * On the iOS app there is no browser store, so the value lives in memory for as
 * long as the app is running. Nearly everybody uses HIVE in a browser, and the
 * alternative — async storage — cannot answer before the first frame, so the
 * rail would visibly jump from one size to another on every launch.
 *
 * ON A PHONE, BIG IS NOT ONE OF THE REMEMBERED SIZES (2026-08-06).
 *
 * Nat, arriving on her iPhone having closed every tab and browser: "this was
 * where it dropped me first. Sloppy. That's hard to read, huh? Not a good first
 * impression." The whole 390-point screen was the open drawer — bee, WELCOME,
 * her face, three HIVE names, every page — with HIVE-Wide's title sliced in
 * half behind it. She had cycled through all three sizes while testing, so her
 * device had `big` written down, and closing tabs does not clear `localStorage`.
 *
 * Big is a genuine SIDEBAR on a wide screen: it sits beside the page and both
 * are readable, so it is remembered and honoured there exactly as before. On a
 * phone the same 212 points is a DRAWER over the page, and a phone already
 * treats it as one — `foldAwayOnPhone` puts it away the moment you pick a
 * destination. So on a phone it was never a size anybody could rest at; it only
 * got written down because the one size button writes on every tap. It is now
 * what it always behaved like: a menu you open, held for as long as it is open,
 * leaving the narrow size you actually rest at untouched underneath.
 *
 * Both halves are needed and both are here. `rememberRailSize` stops a phone
 * writing `big` down, and `openingRailSize` steps a phone past one that is
 * already written down — which is the only thing that helps the devices, like
 * Nat's, that are carrying one today.
 */
const SIZE_KEY = 'hive:railSize';

const isRailSize = (value: unknown): value is RailSize =>
  value === 'big' || value === 'medium' || value === 'small';

const sizeStore = (): Storage | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Private browsing can throw on access rather than on use.
    return null;
  }
};

/** What this browser has written down, if it has a store and anything in it. */
function storedRailSize(): RailSize | null {
  try {
    const stored = sizeStore()?.getItem(SIZE_KEY);
    if (isRailSize(stored)) return stored;
  } catch { /* no store to read */ }
  return null;
}

/**
 * The size the rail is at RIGHT NOW, for as long as the app stays loaded.
 *
 * Deliberately not filled in from the browser's store on the way past: it means
 * "somebody chose this, in this session", and `openingRailSize` leans on that
 * to tell arriving apart from remounting.
 */
let chosenSize: RailSize | null = null;

/**
 * The size to open at.
 *
 * `startBig` is the shell's opening offer for a device that has never chosen —
 * see `app/(app)/_layout.tsx`.
 */
export function openingRailSize({ phone, startBig }: { phone: boolean; startBig: boolean }): RailSize {
  // Mid-session, this is not an arrival. Somebody who tapped to big, walked to
  // another screen and came back must not find the menu folded under them, so
  // the size they are actually at wins here — big included, phone included.
  if (chosenSize) return chosenSize;

  const stored = storedRailSize();
  // Arriving is the case Nat hit. A phone opens at the fullest size that still
  // leaves the page readable beside it: medium, where every destination keeps
  // its name. The stored big is left alone rather than rewritten, because it is
  // the right answer on a wide screen and this device may be one tomorrow.
  if (stored === 'big' && phone) return 'medium';
  if (stored) return stored;
  return startBig ? 'big' : 'medium';
}

/**
 * Write down the size somebody just picked.
 *
 * `carriesOver` is false for a size this device can only hold for the session —
 * a phone's big drawer. It is still the size the rail IS; it just does not
 * overwrite the narrow size this person comes back to.
 */
export function rememberRailSize(next: RailSize, carriesOver = true): void {
  chosenSize = next;
  if (!carriesOver) return;
  try { sizeStore()?.setItem(SIZE_KEY, next); } catch { /* memory is enough */ }
}

/** HIVE-Wide's green — the one colour that never belongs to a single HIVE. */
const WIDE_BLACK = '#0B0B12';

/**
 * The rail sits in a deeper shade of the HIVE's own colour, because a rail and
 * a header on the exact same accent ran together into one L-shaped block
 * ("they bleed together like that", Nat 2026-08-03). Derived rather than
 * hard-coded, so a HIVE picking any accent still gets a rail that belongs to it.
 */
/**
 * A HIVE's rail is its own colour, darkened — but never darkened into the
 * near-black that HIVE-Wide owns.
 *
 * The September 2026 brand guidelines make a branch's DOMINANT colour the dark
 * environment itself (Circuit Navy #011F46, Stage Purple #1F0338), so darkening
 * it by another third put Tech's rail and Production's rail both within a few
 * points of `WIDE_BLACK` — three places that are meant to be told apart at a
 * glance, all reading as black. A colour that is already the environment is
 * left alone.
 */
function deepen(hex: string, amount = 0.32): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  // Already an environment colour? Then it IS the rail.
  if (luminance(hex) < 0.12) return hex;
  const to = (i: number) => {
    const v = parseInt(clean.slice(i, i + 2), 16);
    return Math.max(0, Math.round(v * (1 - amount)));
  };
  const pair = (n: number) => n.toString(16).padStart(2, '0');
  return `#${pair(to(0))}${pair(to(2))}${pair(to(4))}`;
}

export const SideRail = memo(function SideRail({
  startBig = true,
  unreadDMCount = 0,
}: {
  /**
   * The shell's opinion of where to START — true for the big sidebar, false for
   * the narrow rail. It seeds the size on the very first visit and nothing else:
   * once a person has picked a size, their pick wins.
   *
   * It was called `expanded` until 2026-08-06, which read as live state and is
   * not: changing it after the rail has mounted does nothing at all.
   */
  startBig?: boolean;
  unreadDMCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const openFeedback = useOpenFeedback();
  const { profile, community, communityId, communityRole, memberships, switchCommunity, wholeHive, enterWholeHive } = useAuth();
  const { width } = useWindowDimensions();
  /**
   * Narrow enough that the big rail stops being a sidebar and becomes a drawer
   * over the page. Read up here rather than further down because the very first
   * decision the rail makes — which size to open at — turns on it.
   */
  const isPhone = width < 768;
  /**
   * How much of the screen the phone's hardware is already using.
   *
   * The app is installed to the home screen as a standalone app
   * (`manifest.json`), and `public/index.html` asks iOS for a see-through status
   * bar with `viewport-fit=cover` — so the web page really does start at the top
   * of the glass, under the notch. Every SCREEN handles that with
   * `edges={['top']}`; the shell around them did not, so the rail drew under the
   * clock with its expand button hidden behind the time (2026-08-06).
   */
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();

  const [confirmingLogOut, setConfirmingLogOut] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  /**
   * Which of the three sizes the rail is at.
   *
   * The rail owns this rather than the shell, because it is now a choice with
   * three answers and the shell only ever had a yes/no to hold it in.
   * `openingRailSize` holds the whole arrival rule, including why a phone never
   * opens at the big drawer. Nobody ever LANDS on small — see the note above.
   */
  const [size, setSize] = useState<RailSize>(
    () => openingRailSize({ phone: isPhone, startBig })
  );
  const big = size === 'big';
  const medium = size === 'medium';
  const small = size === 'small';

  /**
   * Where the big drawer folds back to on a phone.
   *
   * On a phone the big drawer covers the page instead of sitting beside it, so
   * picking a destination has to put it away again. It goes back to the size the
   * person was actually at — somebody who chose small and opened the drawer to
   * find one page gets small back, not a size they did not ask for.
   */
  const narrowSize = useRef<RailSize>(size === 'big' ? 'medium' : size);

  const changeSize = useCallback((next: RailSize) => {
    if (next === size) return;
    if (next !== 'big') narrowSize.current = next;
    // On a phone, big is the drawer being open rather than a size to come back
    // to, so it is held for the session only and the narrow size underneath it
    // stays written down. See the long note above `SIZE_KEY`.
    rememberRailSize(next, !(isPhone && next === 'big'));
    setSize(next);
  }, [size, isPhone]);

  /**
   * A press that lands somewhere you already are still has to feel like a press.
   *
   * Nat, 2026-08-05: "Nothing happens when you click 'home' and i know that
   * we're already there, but they dont, so i think something should happen, like
   * a little bounce or something, so its obvious that you're already here, not
   * that the button is broken."
   *
   * The row does reload the page underneath — that was fixed the day before —
   * but a page that reloads into exactly the same thing looks identical to a
   * dead button. So the row dips and springs back, which reads as "yes, heard
   * you, and you are already here".
   *
   * The value lives here rather than inside `Row` because `Row` is redefined on
   * every render of this component, so anything it owned would be thrown away
   * halfway through the animation.
   */
  const bounce = useRef(new Animated.Value(0)).current;
  const [bouncingKey, setBouncingKey] = useState<string | null>(null);
  const playBounce = useCallback((key: string) => {
    setBouncingKey(key);
    bounce.setValue(0);
    Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.spring(bounce, { toValue: 0, friction: 3.2, tension: 150, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setBouncingKey(null);
    });
  }, [bounce]);
  const bounceScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });

  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const isOwner = profile?.is_owner === true;
  const canSeeAdmin = isAdmin || isOwner;
  const accent = hiveAccent(community);
  const activeKey = activeKeyForPath(pathname);
  // The rail used to add `|| activeKey === 'hive-wide'` here, patching around a
  // context that could disagree with the address bar. It covered exactly one
  // route and left every other HIVE-Wide page — Boards up here, Admin — drawing
  // the last HIVE's colour and page list. `wholeHive` is derived from the route
  // now (see `app/_layout.tsx`), so the patch is gone and the rail believes the
  // one answer everything else believes.
  const onHiveWide = wholeHive;
  // Standing above the HIVEs, the rail goes to space rather than wearing one
  // HIVE's colour — "it should be dark, like outer space" (Nat 2026-08-03).
  // It is the same black the globe hangs in, so the rail and the page agree.
  const railColour = onHiveWide ? WIDE_BLACK : deepen(accent);
  const destinations = destinationsForPlace({ isAdmin, isOwner, wholeHive: onHiveWide });

  /** Put the phone's full-height drawer away once it has been used. */
  const foldAwayOnPhone = useCallback(() => {
    if (isPhone && big) changeSize(narrowSize.current);
  }, [isPhone, big, changeSize]);

  // Pressing the page you are already on scrolls it back to the top and
  // reloads it, rather than doing nothing.
  //
  // Nat, 2026-08-04: "when you're already in HIVE-Wide and home & you click home
  // again, nothing happens, so you think the button is broken." Which is exactly
  // right — `router.push` to the route you are already on is a no-op, and a
  // button that does nothing is indistinguishable from a broken one. Expo
  // Router's `replace` re-runs the screen, so the page visibly refreshes and the
  // press is answered.
  const go = useCallback(
    (route: string, key?: string) => {
      // Boards has a HIVE-Wide door too (`/hive-wide-boards`), and pressing
      // "Boards" from inside a thread there was a silent no-op: the check here
      // used to read the route literally, so from the wide door it never
      // matched and the open thread's state never cleared — same route,
      // `router.replace` re-runs the screen, but nothing told it to forget
      // which post was open (Nat 2026-08-08: "it just did the little bounce").
      if (route === '/board' || route === '/hive-wide-boards') clearBoardNavigationState(communityId);
      if (route === '/hive') resetHomeNavigationState();
      const here = activeKeyForPath(pathname) === activeKeyForPath(route);
      // The reload is real but invisible when the page reloads into the same
      // thing, so the row itself answers the press (Nat 2026-08-05).
      if (here && key) playBounce(key);
      if (here) router.replace(route as never);
      else router.push(route as never);
      foldAwayOnPhone();
    },
    [router, pathname, playBounce, foldAwayOnPhone, communityId]
  );

  /**
   * Your own face opens your own profile, like every other face in the app.
   *
   * Nat, 2026-08-06: "nothing happens when you hit your own profile... should it
   * always just open your profile if you click on your profile bubble? thats
   * what it does everywhere else in the app, should we keep it consistent?"
   * Yes — an avatar is a door everywhere else, and one that isn't reads as a
   * broken one.
   *
   * At HIVE-Wide it steps down into your HIVE first. Profile is one of the six
   * pages that only mean something inside a HIVE (`atWholeHive: 'hidden'` in
   * `lib/navigation.ts`), and it is dressed for one: `app/(app)/profile.tsx`
   * never asks whether you are standing above the HIVEs, so opening it from up
   * there would hand you a black HIVE-Wide header and dark-mode tabs over a
   * cream page — the exact mismatch CLAUDE.md records from 2026-08-03. Stepping
   * down is not a silent move either: the rail goes from space-black to your
   * HIVE's colour under your thumb as the page opens, and the header names the
   * HIVE you have landed in.
   *
   * The HIVE it steps into is the one already selected underneath HIVE-Wide, so
   * it is where you were, not whichever HIVE happens to be first in a list.
   */
  const openMyProfile = useCallback(async () => {
    if (onHiveWide && communityId) {
      // Awaited so the switch finishes its own "stay on a page that still means
      // something" hop before we ask for Profile, rather than racing it.
      await switchCommunity(communityId);
    }
    go('/profile', 'profile');
  }, [onHiveWide, communityId, switchCommunity, go]);

  const railWidth = big ? RAIL_BIG : medium ? RAIL_MEDIUM : RAIL_SMALL;
  const divider = (
    <View
      style={{
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginVertical: 8,
        marginHorizontal: big ? 14 : 10,
      }}
    />
  );

  const Row = ({
    emoji,
    label,
    shortLabel,
    active,
    onPress,
    badge = 0,
    tint,
    markTint,
    indented,
    world,
    bounceKey,
  }: {
    /** Left off by the rows that draw a mark instead — HIVE-Wide, and a HIVE. */
    emoji?: string;
    label: string;
    /** A shorter name for the narrow rail, when the full one is long. */
    shortLabel?: string;
    active?: boolean;
    onPress: () => void;
    badge?: number;
    /** A colour of its own — HIVE-Wide's green, or a HIVE's accent. */
    tint?: string;
    /** What the HIVE's hexagon wears so it reads on the rail — the branch pair's light half. */
    markTint?: string;
    indented?: boolean;
    /** This row is HIVE-Wide, so it wears the Earth rather than a comb. */
    world?: boolean;
    /** Identifies this row, so only the one you pressed bounces. */
    bounceKey?: string;
  }) => (
    <AnimatedPressable
      onPress={onPress}
      // At the small size the name is not drawn, so a mouse gets it on hover
      // instead. Web only, and only where the name is missing — see the note at
      // the top about small keeping its names even when it stops showing them.
      {...(Platform.OS === 'web' && small ? ({ title: label } as object) : null)}
      // One thing to a screen reader, named by its label. Without this the
      // picture and the small name underneath are two separate stops on a
      // phone, and the first one is read out as "house".
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{
        transform: [{ scale: bounceKey && bounceKey === bouncingKey ? bounceScale : 1 }],
        // Picture over name at the medium size; picture beside name in the big
        // drawer, and picture alone at small.
        flexDirection: medium ? 'column' : 'row',
        alignItems: 'center',
        // An indented row's highlight hugs its own name instead of running the
        // full width of the rail (Nat 2026-08-03: "let's make the HIVE-Wide bar
        // very short"). A child sitting under My HIVEs is a smaller thing than
        // a page, and a full-width bar behind it claimed otherwise.
        alignSelf: big && indented ? 'flex-start' : 'auto',
        paddingRight: big && indented ? 16 : undefined,
        gap: medium ? 3 : 11,
        marginHorizontal: medium ? 3 : big ? 8 : 6,
        marginLeft: big && indented ? 20 : undefined,
        paddingVertical: medium ? 7 : 9,
        paddingHorizontal: big ? 8 : medium ? 2 : 0,
        justifyContent: big ? 'flex-start' : 'center',
        borderRadius: 10,
        backgroundColor: active ? 'rgba(255,255,255,0.22)' : 'transparent',
        borderWidth: tint && !indented ? 1 : 0,
        borderColor: tint ?? 'transparent',
      }}
    >
      <View>
        {/* A HIVE shows as its OWN colour, as a comb — the black ⬢ was invisible
            against the rail and told you nothing once collapsed (Nat 2026-08-03).

            HIVE-Wide gets the drawn `WorldMark`, and carries no emoji at all.
            It used to pass a globe emoji that never appeared: the comb branch
            only asked whether the row was indented and tinted, which HIVE-Wide
            also is, so it drew a near-black hexagon on a near-black rail.
            Hexagon means a HIVE, world means all of them — the same pair the
            badges use (`lib/scopeLook.ts`, Nat 2026-08-05). */}
        {indented && world ? (
          <WorldMark size={17} />
        ) : indented && tint ? (
          <HiveMark size={16} colour={markTint ?? tint} />
        ) : (
          // Monochrome symbols inherit text colour. Without an explicit rail ink,
          // Quick Add's ＋ rendered black: barely visible on Tech blue and fully
          // gone at HIVE-Wide. White is already the label colour and remains
          // readable across every deepened HIVE rail, in all three rail sizes.
          <Text style={{ fontSize: 19, lineHeight: 25, color: '#fff' }}>{emoji}</Text>
        )}
        {badge > 0 ? (
          <View
            style={{
              position: 'absolute', top: -3, right: -9, minWidth: 16, height: 16,
              paddingHorizontal: 4, borderRadius: 8, backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: railColour }}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      {/* The name. Full size beside the picture in the big drawer, small and
          underneath at medium, and drawn nowhere at small.

          Medium exists because of what happened when it didn't: the tab bar came
          out on 2026-08-03, the rail became the only navigation a phone had, and
          at 375px wide the whole of it was a column of pictures with nothing to
          tell you what any of them opened. Small is the same picture strip, and
          it is fine now for exactly one reason — a person chose it. */}
      {big || medium ? (
        <Text
          numberOfLines={medium ? 2 : 1}
          style={{
            flex: medium ? undefined : 1,
            textAlign: medium ? 'center' : 'left',
            fontFamily: active ? 'Lato_700Bold' : 'Lato_400Regular',
            fontSize: medium ? 9.5 : indented ? 12.5 : 14.5,
            lineHeight: medium ? 11.5 : undefined,
            color: medium ? 'rgba(255,255,255,0.92)' : '#fff',
          }}
        >
          {medium && shortLabel ? shortLabel : label}
        </Text>
      ) : null}
    </AnimatedPressable>
  );

  /**
   * A phone's big drawer really is an overlay, so it is dressed as one.
   *
   * It always covered the page — `position: absolute` below — but it did it
   * with no dimming and the page still bright and half-readable beside it,
   * which is why Nat's screenshot reads as a broken screen rather than as an
   * open menu. Two things make it legible as a menu instead: the page behind
   * goes dark, and the drawer casts a shadow onto it, so one is plainly in
   * front of the other.
   *
   * The dark part is also the way out. Tapping anywhere on the page puts the
   * drawer away — the gesture everybody already has for every menu on a phone,
   * and one more escape hatch on top of the size button. It folds back to the
   * size the person was actually at, the same as picking a destination does.
   */
  const phoneDrawer = isPhone && big;

  return (
    <>
      {phoneDrawer ? (
        <Pressable
          onPress={foldAwayOnPhone}
          accessibilityRole="button"
          accessibilityLabel="Close the menu"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            // Under the drawer, over everything else. The drawer is 40.
            zIndex: 39,
          }}
        />
      ) : null}
      <View
        style={{
          // The rail keeps its own width and the phone's hardware gets its own
          // strip beside it, so a landscape notch takes space from the edge
          // rather than from the menu.
          width: railWidth + insets.left,
          backgroundColor: railColour,
          // Clear of the clock at the top and the home bar at the bottom. The bee
          // and the size button live in the first 42 pixels of this rail, which
          // is exactly where an iPhone puts the time.
          paddingTop: 12 + insets.top,
          // Capped — the raw bottom measurement came back around 62pt on Nat's
          // iPhone, which pushed the rail's last icons off the end of a list
          // that had obvious empty space beneath it (2026-08-25). See
          // lib/safeAreaBottom.ts; PathFooter reads the same number.
          paddingBottom: 8 + bottomInset,
          paddingLeft: insets.left,
          ...(phoneDrawer
            ? {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                zIndex: 40,
                shadowColor: '#000',
                shadowOpacity: 0.45,
                shadowRadius: 18,
                shadowOffset: { width: 4, height: 0 },
                elevation: 16,
              }
            : null),
        }}
      >
        {/* The name sits at the very top with the size button beside it, rather
            than underneath a button that pushed it down the page (Nat 2026-08-03). */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingHorizontal: big ? 14 : 0,
            justifyContent: big ? 'space-between' : 'center',
            marginBottom: big ? 14 : 10,
          }}
        >
          {big ? (
            // Just the bee (Nat 2026-08-03). The wordmark and the line about being
            // a bee were saying the name and the motto to somebody already inside
            // the app, on every screen, forever. The mark alone says it once.
            //
            // Two false starts worth recording. The first used bee_favicon.png,
            // which is the SEAL — a gold sunburst ring with the bee inside it —
            // and at this size the whole thing collapsed into a dark smudge
            // ("hahaha what happened here"). The second would have been the plain
            // bee on its own, which Nat asked for and then talked herself out of
            // in the same breath: it is black, and so is this rail.
            //
            // So it sits on a cream coin. The bee is the brand's black and gold,
            // the coin is the brand's cream, and a light disc on a dark rail is
            // legible at any size — which the bee alone would not have been.
            // CENTRED now (Nat 2026-08-04): "maybe we center the bee? so it's not
            // confusing with the profile bubble." Both are light discs of nearly
            // the same size, and stacked hard against the left edge they read as
            // a pair — as if the bee were an account too. Moving the mark to the
            // middle of the rail breaks the column, and the two stop rhyming.
            <View style={{ flex: 1, paddingRight: 8, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: '#FFF8E9',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <Image
                  source={require('../../assets/BEE ONLY IN GOLD BG.png')}
                  style={{ width: 30, height: 30 }}
                  contentFit="contain"
                  accessibilityLabel="HIVE"
                />
              </View>
            </View>
          ) : null}
          {/* ONE control for three sizes, stepping big → medium → small → big.
              It replaced a two-state open/close toggle on 2026-08-06.

              Why one button and not two. The rail at its smallest is 56 pixels
              wide, and two buttons in there would be two more unlabelled pictures
              in the size that already has the least to go on. One button in one
              spot, identical in all three sizes, is a single thing to learn — and
              it is the same object Nat already knows, in the same place.

              The chevron never lies about direction: pointing back means the next
              press makes the menu smaller, pointing forward means it opens the
              big menu. The only jump in the cycle is small → big, which is the
              one that has to be obvious, because it is the way out. */}
          <Pressable
            onPress={() => changeSize(NEXT_SIZE[size])}
            {...(Platform.OS === 'web' ? ({ title: SIZE_STEP[size] } as object) : null)}
            accessibilityRole="button"
            accessibilityLabel={SIZE_STEP[size]}
            hitSlop={6}
            style={{
              width: 30, height: 30, borderRadius: 15,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <Ionicons name={small ? 'chevron-forward' : 'chevron-back'} size={16} color="#fff" />
          </Pressable>
        </View>

        {/* Who you are signed in as.
            Nat, 2026-08-04: "what if right here, on this side bar, we had a
            'welcome, User' … and maybe a profile bubble, so you could see which
            account you're signed in as?"

            It earns its space for a reason particular to this app: the two people
            who build it share screens constantly, and both have owner accounts, so
            "which of us is this?" is a real question asked several times a week —
            and the answer changes what you are allowed to see. Every other surface
            that could have told you is one tap away instead of in front of you.

            It is a door as of 2026-08-06 — see `openMyProfile` above for what it
            does at HIVE-Wide and why. It was a label until then, on the reasoning
            that Profile needs a HIVE; Nat's answer was that a face you can't press
            is the odd one out in an app where every other face opens somebody. */}
        {profile ? (
          <AnimatedPressable
            onPress={openMyProfile}
            {...(Platform.OS === 'web' && small
              ? ({ title: `Your profile, ${(profile.name ?? 'You').split(/\s+/)[0]}` } as object)
              : null)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Your profile, ${(profile.name ?? 'You').split(/\s+/)[0]}`}
            accessibilityState={{ selected: activeKey === 'profile' }}
            style={{
              transform: [{ scale: bouncingKey === 'profile' ? bounceScale : 1 }],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: big ? 14 : 0,
              justifyContent: big ? 'flex-start' : 'center',
              // Fixed height, all three sizes. Nat, 2026-08-04: the icons "shift
              // up and down, and i'd like them to just slide horizontally." Every
              // row below here was moving because the blocks ABOVE changed height
              // when the words disappeared — a 30px avatar became 26px, and the
              // two lines of name went from two lines to nothing. Reserving the
              // same height in every size is what turns a size change into a
              // purely horizontal move.
              height: 46,
              paddingBottom: 12,
              marginBottom: 4,
              // The line Nat pointed at: "see how there's a little line under my
              // profile bubble, before 'MY HIVES'?" It closes off who you are,
              // so the block underneath can be about where you are.
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <Avatar name={profile.name ?? 'You'} url={profile.avatar_url} size={30} />
            {big ? (
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 11,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.52)',
                  }}
                >
                  Welcome
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#fff' }}
                >
                  {(profile.name ?? 'You').split(/\s+/)[0]}
                </Text>
              </View>
            ) : null}
          </AnimatedPressable>
        ) : null}

        {/* The rubber-band at the end of the list, so a rail that has run out of
            rows says so rather than looking stuck (Nat 2026-08-06: "Any time we
            cant scroll, i want to have the bounce feature, so you can tell, oh,
            thats the end of the page, not 'is this broken?'").

            `BounceScrollView` sets the real iOS and Android props and draws the
            bounce itself in a browser, which is where the rail is nearly always
            read and where a plain ScrollView gives nothing. */}
        <BounceScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 14 }}
        >
          {canSeeAdmin ? (
            <>
              <Row
                emoji="＋"
                label="Quick Add"
                shortLabel="Add"
                onPress={() => {
                  setQuickAddOpen(true);
                  foldAwayOnPhone();
                }}
              />
              {divider}
            </>
          ) : null}
          {/* "My HIVEs" is Home, and HIVE-Wide is the first thing under it —
              not a second section with its own children.

              Nat's call, 2026-08-03: "we just move HIVE-Wide under My HIVEs, then
              we aren't trying to reinvent the wheel, it's just the same format as
              all the other ones." Which is right. HIVE-Wide is not a different
              KIND of place, it is one more place of the same kind, and the one
              page list below serves whichever of them you're standing in. */}
          {/* A heading, not a door (Nat 2026-08-04). It used to navigate to
              /hive as well as label the list beneath it, which is why Home
              appeared to be missing: a row with three indented children under it
              reads as a section title, and nobody presses a section title to go
              home. Home is now the first entry in the page list below, and this
              just says what the indented rows are. */}
          {/* The heading holds its line at every size rather than disappearing, so
              the HIVEs beneath it stay on the same rows however wide the rail is.
              No emoji: it names the list under it, and a heading with a picture on
              it reads as another button (Nat 2026-08-04, and there is no beehive
              in Unicode anyway). */}
          {big ? (
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 11,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: 6,
                height: 27,
              }}
            >
              My HIVEs
            </Text>
          ) : medium ? (
            // The medium rail says it too. The two rows under this heading are the
            // HIVE-Wide globe and your own HIVE's hexagon, and without a word
            // above them they are two coloured shapes (2026-08-06).
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 8.5,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.45)',
                paddingTop: 10,
                paddingBottom: 6,
                height: 27,
              }}
            >
              My HIVEs
            </Text>
          ) : (
            <View style={{ height: 27 }} />
          )}
          {/* HIVE-Wide shows for EVERYONE, not only people in more than one HIVE.
              Nearly every member is in exactly one, and the shared boards — HIVE
              Approved, Announcements, the Favourites — are where their own
              content now lives. Hiding this from them would have quietly deleted
              most of OG's boards from OG's view (caught before shipping,
              2026-08-03). */}
          <Row
            label="HIVE-Wide"
            indented
            world
            active={onHiveWide}
            tint={WIDE_BLACK}
            bounceKey="hive-wide"
            onPress={() => {
              if (onHiveWide) playBounce('hive-wide');
              enterWholeHive();
              foldAwayOnPhone();
            }}
          />
          {memberships.map((m) => (
            <Row
              key={m.community_id}
              emoji="⬢"
              label={hiveDisplayName(m.community?.name)}
              indented
              active={m.community_id === communityId && !onHiveWide}
              tint={hiveAccent(m.community)}
              markTint={hiveOnDark(m.community?.slug)}
              bounceKey={m.community_id}
              onPress={() => {
                if (m.community_id === communityId && !onHiveWide) playBounce(m.community_id);
                void switchCommunity(m.community_id);
                foldAwayOnPhone();
              }}
            />
          ))}

          {/* The line before Home, at every size (Nat 2026-08-06): "I think we
              need another one of those before 'Home' so you know that first you
              select your hive & then you look at those pages within that hive,
              otherwise it just looks confusing."

              She is naming the rail's actual grammar. Everything above this line
              answers WHICH PLACE AM I IN; everything below it answers WHAT DO I
              LOOK AT INSIDE IT. Without the rule, HIVE-Wide, your HIVEs and the
              eleven pages are one undifferentiated column and the two questions
              look like one list. It matters most at small, where the names are
              gone and the shapes are all the rail has left to group with. */}
          {divider}

          {/* One list, whichever place you picked. Pages that only mean something
              inside a single HIVE step out at HIVE-Wide rather than showing you
              one HIVE's answer while you're standing above all of them. */}
          {destinations.map((item) => (
            <Row
              key={item.key}
              emoji={item.emoji}
              label={item.label}
              shortLabel={item.shortLabel}
              active={activeKey === item.key}
              badge={item.badge === 'dms' ? unreadDMCount : 0}
              bounceKey={item.key}
              onPress={() => {
                if (item.key === 'feedback') {
                  openFeedback({ pathname });
                  foldAwayOnPhone();
                } else {
                  go(item.route, item.key);
                }
              }}
            />
          ))}
          {/* "Swap HIVEs" is gone (Nat 2026-08-03). Your HIVEs are already listed
              by name under My HIVEs, and tapping one swaps to it — so this was a
              button that opened a picker for a choice already on the screen. */}
          {/* It asks first (Nat 2026-08-04). Log out sits directly under the page
              list, so it is one slip away from every other row in the rail — and
              on a phone, where the big drawer is a full-height overlay, it is a
              slip away with a thumb rather than a cursor. */}
          <Row
            emoji="👋"
            label="Log out"
            onPress={() => setConfirmingLogOut(true)}
          />

          {/* Admin is in the rail from EVERYWHERE now (Nat 2026-08-04): "i said
              i only wanted admin from the HIVE-Wide, but i changed my mind, i
              actually want my admin permanently in the toolbar."

              The 08-03 reasoning still holds — Admin runs the whole operation
              rather than any one HIVE, so it should never look like OG's admin —
              and that is now handled by where it GOES rather than whether it
              shows. Pressing it steps up to HIVE-Wide first, so you always land
              on the one god view against the planet, whichever HIVE you set off
              from. */}
          {canSeeAdmin ? (
            <>
              {divider}
              <Row
                emoji={ADMIN_DESTINATION.emoji}
                label={ADMIN_DESTINATION.label}
                active={activeKey === 'admin'}
                bounceKey="admin"
                onPress={() => {
                  if (!onHiveWide) enterWholeHive();
                  go(ADMIN_DESTINATION.route, 'admin');
                }}
              />
            </>
          ) : null}
        </BounceScrollView>

        <ConfirmDialog
          visible={confirmingLogOut}
          title="Log out of the HIVE?"
          body="You’ll need to sign in again with Google to get back in."
          confirmLabel="Log out"
          cancelLabel="Stay"
          onConfirm={() => {
            setConfirmingLogOut(false);
            void supabase.auth.signOut({ scope: 'local' });
          }}
          onCancel={() => setConfirmingLogOut(false)}
        />
        <QuickAdd
          visible={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          onSaved={() => router.replace(pathname as never)}
        />
      </View>
    </>
  );
});

export const RAIL_WIDTHS: Record<RailSize, number> = {
  /** The full drawer: every HIVE and page spelled out. */
  big: RAIL_BIG,
  /** A picture with its name underneath. */
  medium: RAIL_MEDIUM,
  /** Pictures only. */
  small: RAIL_SMALL,
};

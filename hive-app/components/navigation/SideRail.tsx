import { memo, useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, Animated } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { HiveMark } from '../ui/HiveMark';
import { WorldMark } from '../ui/WorldMark';
import { ADMIN_DESTINATION, destinationsForPlace, activeKeyForPath } from '../../lib/navigation';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { resetHomeNavigationState } from '../../lib/homeNavigation';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Avatar } from '../ui/Avatar';

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

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 212;
/**
 * The collapsed rail on a phone, where it carries names as well as pictures.
 *
 * The tab bar came out on 2026-08-03 and this rail became the only way to move
 * around. On a phone it starts collapsed, so at 375px wide the whole of
 * navigation was 🏠 👥 📋 📰 📣 👋 down the left edge — a column of pictures with
 * nothing to tell you what any of them opened. Nat's words for who is using
 * this: "we have very very very very not tech savvy people."
 *
 * So a collapsed row on a phone puts a small name under its picture, and the
 * rail is eight pixels wider to hold one. Eight pixels is the whole price of
 * every destination being readable, and 56 pixels of unreadable pictures was
 * already the more expensive of the two.
 */
const RAIL_COLLAPSED_PHONE = 64;

/** HIVE-Wide's green — the one colour that never belongs to a single HIVE. */
const WIDE_BLACK = '#0B0B12';

/**
 * The rail sits in a deeper shade of the HIVE's own colour, because a rail and
 * a header on the exact same accent ran together into one L-shaped block
 * ("they bleed together like that", Nat 2026-08-03). Derived rather than
 * hard-coded, so a HIVE picking any accent still gets a rail that belongs to it.
 */
function deepen(hex: string, amount = 0.32): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const to = (i: number) => {
    const v = parseInt(clean.slice(i, i + 2), 16);
    return Math.max(0, Math.round(v * (1 - amount)));
  };
  const pair = (n: number) => n.toString(16).padStart(2, '0');
  return `#${pair(to(0))}${pair(to(2))}${pair(to(4))}`;
}

export const SideRail = memo(function SideRail({
  expanded,
  onToggle,
  unreadDMCount = 0,
}: {
  expanded: boolean;
  onToggle: () => void;
  unreadDMCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, community, communityId, communityRole, memberships, switchCommunity, wholeHive, enterWholeHive } = useAuth();
  const { width } = useWindowDimensions();
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

  const [confirmingLogOut, setConfirmingLogOut] = useState(false);

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

  const isPhone = width < 768;
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const isOwner = profile?.is_owner === true;
  const canSeeAdmin = isAdmin || isOwner;
  const accent = hiveAccent(community);
  const activeKey = activeKeyForPath(pathname);
  const onHiveWide = wholeHive || activeKey === 'hive-wide';
  // Standing above the HIVEs, the rail goes to space rather than wearing one
  // HIVE's colour — "it should be dark, like outer space" (Nat 2026-08-03).
  // It is the same black the globe hangs in, so the rail and the page agree.
  const railColour = onHiveWide ? WIDE_BLACK : deepen(accent);
  const destinations = destinationsForPlace({ isAdmin, isOwner, wholeHive: onHiveWide });

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
      if (route === '/board') clearBoardNavigationState();
      if (route === '/hive') resetHomeNavigationState();
      const here = activeKeyForPath(pathname) === activeKeyForPath(route);
      // The reload is real but invisible when the page reloads into the same
      // thing, so the row itself answers the press (Nat 2026-08-05).
      if (here && key) playBounce(key);
      if (here) router.replace(route as never);
      else router.push(route as never);
      if (isPhone && expanded) onToggle();
    },
    [router, pathname, isPhone, expanded, onToggle, playBounce]
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

  /**
   * The collapsed rail on a phone shows a name under every picture, so a person
   * who has never opened the app can read where each row goes without opening
   * the menu first. `tight` is that state: narrow, stacked, and labelled.
   */
  const tight = isPhone && !expanded;
  const railWidth = expanded ? RAIL_EXPANDED : tight ? RAIL_COLLAPSED_PHONE : RAIL_COLLAPSED;
  const divider = (
    <View
      style={{
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginVertical: 8,
        marginHorizontal: expanded ? 14 : 12,
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
    indented,
    world,
    bounceKey,
  }: {
    /** Left off by the rows that draw a mark instead — HIVE-Wide, and a HIVE. */
    emoji?: string;
    label: string;
    /** A shorter name for the phone's narrow rail, when the full one is long. */
    shortLabel?: string;
    active?: boolean;
    onPress: () => void;
    badge?: number;
    /** A colour of its own — HIVE-Wide's green, or a HIVE's accent. */
    tint?: string;
    indented?: boolean;
    /** This row is HIVE-Wide, so it wears the Earth rather than a comb. */
    world?: boolean;
    /** Identifies this row, so only the one you pressed bounces. */
    bounceKey?: string;
  }) => (
    <AnimatedPressable
      onPress={onPress}
      // One thing to a screen reader, named by its label. Without this the
      // picture and the small name underneath are two separate stops on a
      // phone, and the first one is read out as "house".
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{
        transform: [{ scale: bounceKey && bounceKey === bouncingKey ? bounceScale : 1 }],
        // Picture over name on the phone's narrow rail; picture beside name
        // everywhere else.
        flexDirection: tight ? 'column' : 'row',
        alignItems: 'center',
        // An indented row's highlight hugs its own name instead of running the
        // full width of the rail (Nat 2026-08-03: "let's make the HIVE-Wide bar
        // very short"). A child sitting under My HIVEs is a smaller thing than
        // a page, and a full-width bar behind it claimed otherwise.
        alignSelf: expanded && indented ? 'flex-start' : 'auto',
        paddingRight: expanded && indented ? 16 : undefined,
        gap: tight ? 3 : 11,
        marginHorizontal: tight ? 3 : expanded ? 8 : 6,
        marginLeft: expanded && indented ? 20 : undefined,
        paddingVertical: tight ? 7 : 9,
        paddingHorizontal: expanded ? 8 : tight ? 2 : 0,
        justifyContent: expanded ? 'flex-start' : 'center',
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
          <HiveMark size={16} colour={tint} />
        ) : (
          <Text style={{ fontSize: 19, lineHeight: 25 }}>{emoji}</Text>
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
      {/* The name. On a phone it shows in BOTH states — small and underneath
          when the rail is narrow, full size beside the picture when it is open
          — because the narrow rail is the only navigation a phone has and an
          unnamed picture is a quiz (2026-08-06). A wide screen keeps the plain
          icon strip: the mouse can open the rail, and there is a whole page
          beside it that the labels would eat into. */}
      {expanded || tight ? (
        <Text
          numberOfLines={tight ? 2 : 1}
          style={{
            flex: tight ? undefined : 1,
            textAlign: tight ? 'center' : 'left',
            fontFamily: active ? 'Lato_700Bold' : 'Lato_400Regular',
            fontSize: tight ? 9.5 : indented ? 12.5 : 14.5,
            lineHeight: tight ? 11.5 : undefined,
            color: tight ? 'rgba(255,255,255,0.92)' : '#fff',
          }}
        >
          {tight && shortLabel ? shortLabel : label}
        </Text>
      ) : null}
    </AnimatedPressable>
  );

  return (
    <View
      style={{
        // The rail keeps its own width and the phone's hardware gets its own
        // strip beside it, so a landscape notch takes space from the edge
        // rather than from the menu.
        width: railWidth + insets.left,
        backgroundColor: railColour,
        // Clear of the clock at the top and the home bar at the bottom. The bee
        // and the expand button live in the first 42 pixels of this rail, which
        // is exactly where an iPhone puts the time.
        paddingTop: 12 + insets.top,
        paddingBottom: 8 + insets.bottom,
        paddingLeft: insets.left,
        ...(isPhone && expanded
          ? { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 40 }
          : null),
      }}
    >
      {/* The name sits at the very top with the toggle beside it, rather than
          underneath a button that pushed it down the page (Nat 2026-08-03). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: expanded ? 14 : 0,
          justifyContent: expanded ? 'space-between' : 'center',
          marginBottom: expanded ? 14 : 10,
        }}
      >
        {expanded ? (
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
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse the menu' : 'Expand the menu'}
          hitSlop={6}
          style={{
            width: 30, height: 30, borderRadius: 15,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.16)',
          }}
        >
          <Ionicons name={expanded ? 'chevron-back' : 'chevron-forward'} size={16} color="#fff" />
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
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Your profile, ${(profile.name ?? 'You').split(/\s+/)[0]}`}
          accessibilityState={{ selected: activeKey === 'profile' }}
          style={{
            transform: [{ scale: bouncingKey === 'profile' ? bounceScale : 1 }],
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: expanded ? 14 : 0,
            justifyContent: expanded ? 'flex-start' : 'center',
            // Fixed height, both states. Nat, 2026-08-04: the icons "shift up
            // and down, and i'd like them to just slide horizontally." Every
            // row below here was moving because the blocks ABOVE changed height
            // when the words disappeared — a 30px avatar became 26px, and the
            // two lines of name went from two lines to nothing. Reserving the
            // same height in both states is what turns the collapse into a
            // purely horizontal move.
            height: 46,
            paddingBottom: 12,
            marginBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.10)',
          }}
        >
          <Avatar name={profile.name ?? 'You'} url={profile.avatar_url} size={30} />
          {expanded ? (
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

          `alwaysBounceVertical` is the one that bounces even when the rows
          already fit. It is real in the iOS app and `overScrollMode` is the
          Android glow; react-native-web keeps neither, so in a browser the
          bounce is whatever iOS Safari gives a box that has something to
          scroll. See the note in `components/chat/ChatInterface.tsx`. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 14 }}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
      >
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
        {/* The heading holds its line when collapsed rather than disappearing,
            so the HIVEs beneath it stay on the same rows in both states. No
            emoji: it names the list under it, and a heading with a picture on it
            reads as another button (Nat 2026-08-04, and there is no beehive in
            Unicode anyway). */}
        {expanded ? (
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
        ) : tight ? (
          // The phone's narrow rail says it too. The two rows under this
          // heading are the HIVE-Wide globe and your own HIVE's hexagon, and
          // without a word above them they are two coloured shapes (2026-08-06).
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
            if (isPhone && expanded) onToggle();
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
            bounceKey={m.community_id}
            onPress={() => {
              if (m.community_id === communityId && !onHiveWide) playBounce(m.community_id);
              void switchCommunity(m.community_id);
              if (isPhone && expanded) onToggle();
            }}
          />
        ))}

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
            onPress={() => go(item.route, item.key)}
          />
        ))}
        {/* "Swap HIVEs" is gone (Nat 2026-08-03). Your HIVEs are already listed
            by name under My HIVEs, and tapping one swaps to it — so this was a
            button that opened a picker for a choice already on the screen. */}
        {/* It asks first (Nat 2026-08-04). Log out sits directly under the page
            list, so it is one slip away from every other row in the rail — and
            on a phone, where the rail is a full-height overlay, it is a slip
            away with a thumb rather than a cursor. */}
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
      </ScrollView>

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
    </View>
  );
});

export const RAIL_WIDTHS = {
  collapsed: RAIL_COLLAPSED,
  /** Wider, because on a phone the collapsed rail carries names too. */
  collapsedPhone: RAIL_COLLAPSED_PHONE,
  expanded: RAIL_EXPANDED,
};

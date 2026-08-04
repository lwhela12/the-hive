import { memo, useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
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

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 212;

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

  const [confirmingLogOut, setConfirmingLogOut] = useState(false);

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

  const go = useCallback(
    (route: string) => {
      if (route === '/board') clearBoardNavigationState();
      if (route === '/hive') resetHomeNavigationState();
      router.push(route as never);
      if (isPhone && expanded) onToggle();
    },
    [router, isPhone, expanded, onToggle]
  );

  const railWidth = expanded ? RAIL_EXPANDED : RAIL_COLLAPSED;
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
    active,
    onPress,
    badge = 0,
    tint,
    indented,
  }: {
    emoji: string;
    label: string;
    active?: boolean;
    onPress: () => void;
    badge?: number;
    /** A colour of its own — HIVE-Wide's green, or a HIVE's accent. */
    tint?: string;
    indented?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        // An indented row's highlight hugs its own name instead of running the
        // full width of the rail (Nat 2026-08-03: "let's make the HIVE-Wide bar
        // very short"). A child sitting under My HIVEs is a smaller thing than
        // a page, and a full-width bar behind it claimed otherwise.
        alignSelf: expanded && indented ? 'flex-start' : 'auto',
        paddingRight: expanded && indented ? 16 : undefined,
        gap: 11,
        marginHorizontal: expanded ? 8 : 6,
        marginLeft: expanded && indented ? 20 : undefined,
        paddingVertical: 9,
        paddingHorizontal: expanded ? 8 : 0,
        justifyContent: expanded ? 'flex-start' : 'center',
        borderRadius: 10,
        backgroundColor: active ? 'rgba(255,255,255,0.22)' : 'transparent',
        borderWidth: tint && !indented ? 1 : 0,
        borderColor: tint ?? 'transparent',
      }}
    >
      <View>
        {/* A HIVE shows as its OWN colour, as a comb — the black ⬢ was invisible
            against the rail and told you nothing once collapsed (Nat 2026-08-03). */}
        {indented && tint ? (
          <Svg width={15} height={17} viewBox="0 0 15 17">
            <Polygon points="7.5,0 15,4.25 15,12.75 7.5,17 0,12.75 0,4.25" fill={tint} />
          </Svg>
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
      {expanded ? (
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: active ? 'Lato_700Bold' : 'Lato_400Regular',
            fontSize: indented ? 12.5 : 14.5,
            color: '#fff',
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={{
        width: railWidth,
        backgroundColor: railColour,
        paddingTop: 12,
        paddingBottom: 8,
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

          Deliberately NOT a link. Profile is hidden at HIVE-Wide (it needs a
          HIVE), so a tap here would either dead-end or silently move you to a
          different place than the one you're standing in. This is a label, and
          the action you actually want when it says the wrong name — Log out —
          is a few rows below it. */}
      {profile ? (
        <View
          style={{
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
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}>
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
          emoji="🌍"
          label="HIVE-Wide"
          indented
          active={onHiveWide}
          tint={WIDE_BLACK}
          onPress={() => {
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
            onPress={() => {
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
            active={activeKey === item.key}
            badge={item.badge === 'dms' ? unreadDMCount : 0}
            onPress={() => go(item.route)}
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

        {/* Admin only exists from HIVE-Wide (Nat 2026-08-03). It runs the whole
            operation rather than any one HIVE, so offering it from inside OG
            implied there was such a thing as OG's admin. God mode is reached
            from the god view. */}
        {canSeeAdmin && onHiveWide ? (
          <>
            {divider}
            <Row
              emoji={ADMIN_DESTINATION.emoji}
              label={ADMIN_DESTINATION.label}
              active={activeKey === 'admin'}
              onPress={() => go(ADMIN_DESTINATION.route)}
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

export const RAIL_WIDTHS = { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };

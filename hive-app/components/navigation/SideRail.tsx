import { memo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { NAV_DESTINATIONS, ADMIN_DESTINATION, HIVE_WIDE_ROUTE, activeKeyForPath } from '../../lib/navigation';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { resetHomeNavigationState } from '../../lib/homeNavigation';

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
const WIDE_GREEN = '#3F7D5C';

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
  const { profile, community, communityId, communityRole, memberships, openHivePicker, switchCommunity } = useAuth();
  const { width } = useWindowDimensions();

  const isPhone = width < 768;
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const isOwner = profile?.is_owner === true;
  const canSeeAdmin = isAdmin || isOwner;
  const accent = hiveAccent(community);
  const railColour = deepen(accent);
  const activeKey = activeKeyForPath(pathname);
  const onHiveWide = activeKey === 'hive-wide';
  const hasMoreThanOneHive = memberships.length > 1;

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
            fontSize: indented ? 13.5 : 14.5,
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
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text
              style={{
                fontFamily: 'LibreBaskerville_700Bold', fontSize: 17,
                color: '#fff', letterSpacing: 1.4,
              }}
              numberOfLines={1}
            >
              HIVE
            </Text>
            <Text
              style={{
                fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 16,
                color: 'rgba(255,255,255,0.7)', marginTop: 2,
              }}
            >
              Alone you&rsquo;re a bee.{'\n'}Together, we&rsquo;re the H.I.V.E.
            </Text>
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}>
        {/* Zoom levels. Furthest out first. */}
        <Row
          emoji="🌍"
          label="HIVE-Wide"
          active={onHiveWide}
          tint={WIDE_GREEN}
          onPress={() => go(HIVE_WIDE_ROUTE)}
        />
        <Row
          emoji="🏠"
          label={hasMoreThanOneHive ? 'My HIVEs' : hiveDisplayName(community?.name)}
          active={!onHiveWide && activeKey === 'home'}
          onPress={() => go('/hive')}
        />
        {/* Your HIVEs, indented under it, each wearing its own colour — so the
            one you're in is obvious and the others are one tap away. */}
        {hasMoreThanOneHive
          ? memberships.map((m) => (
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
            ))
          : null}

        {divider}

        {NAV_DESTINATIONS.map((item) => (
          <Row
            key={item.key}
            emoji={item.emoji}
            label={item.label}
            active={!onHiveWide && activeKey === item.key}
            badge={item.badge === 'dms' ? unreadDMCount : 0}
            onPress={() => go(item.route)}
          />
        ))}
        {hasMoreThanOneHive ? (
          <Row emoji="🔀" label="Swap HIVEs" onPress={openHivePicker} />
        ) : null}
        <Row
          emoji="👋"
          label="Log out"
          onPress={() => { void supabase.auth.signOut({ scope: 'local' }); }}
        />

        {canSeeAdmin ? (
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
    </View>
  );
});

export const RAIL_WIDTHS = { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };

import { memo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { visibleDestinations, activeKeyForPath } from '../../lib/navigation';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { resetHomeNavigationState } from '../../lib/homeNavigation';

/**
 * The side rail — HIVE's navigation, borrowed from Jammin' Sprouts at Nat's
 * request on 2026-08-03.
 *
 * It replaces seven tabs across the bottom, which had run out of room: seven
 * tabs on a phone is about 55px each, and every new feature made that worse.
 * A rail scrolls, so there is always space for the next thing.
 *
 * Collapsed it is icons only and stays out of the way; expanded it shows labels.
 * The same component on phone and desktop, which is the other half of why Nat
 * chose it — one shape to keep right instead of two that drift.
 */

const RAIL_COLLAPSED = 56;
const RAIL_EXPANDED = 212;

/**
 * The rail sits in a deeper shade of the HIVE's own colour.
 *
 * First pass had both the rail and the header on the accent exactly, and they
 * ran together into one L-shaped block — "they bleed together like that"
 * (Nat 2026-08-03). Two surfaces should look like two surfaces. Deriving the
 * shade rather than hard-coding one means a HIVE picking any accent gets a rail
 * that still belongs to it.
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
  const { profile, community, communityRole, memberships, openHivePicker } = useAuth();
  const { width } = useWindowDimensions();

  const isPhone = width < 768;
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const isOwner = profile?.is_owner === true;
  const accent = hiveAccent(community);
  const railColour = deepen(accent);
  const activeKey = activeKeyForPath(pathname);
  const items = visibleDestinations({ isAdmin, isOwner });
  const hasMoreThanOneHive = memberships.length > 1;

  // On a phone an expanded rail covers most of the screen, so going somewhere
  // should close it behind you. On a desktop it lives alongside and stays put.
  const go = useCallback(
    (route: string) => {
      if (route === '/board') clearBoardNavigationState();
      if (route === '/hive') resetHomeNavigationState();
      router.push(route as never);
      if (isPhone && expanded) onToggle();
    },
    [router, isPhone, expanded, onToggle]
  );

  const width_ = expanded ? RAIL_EXPANDED : RAIL_COLLAPSED;

  return (
    <View
      style={{
        width: width_,
        backgroundColor: railColour,
        paddingTop: 10,
        paddingBottom: 8,
        // On a phone the expanded rail sits over the page rather than squeezing
        // it into a column nobody can read.
        ...(isPhone && expanded
          ? { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 40 }
          : null),
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse the menu' : 'Expand the menu'}
        hitSlop={6}
        style={{
          alignSelf: expanded ? 'flex-end' : 'center',
          marginRight: expanded ? 10 : 0,
          marginBottom: 8,
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.16)',
        }}
      >
        <Ionicons name={expanded ? 'chevron-back' : 'chevron-forward'} size={17} color="#fff" />
      </Pressable>

      {/* The rail says what this IS; the header says where you ARE. First pass
          had both showing "OG HIVE", one above the other — "they double up on
          info" (Nat 2026-08-03). Swapping the HIVE is still here, because it is
          navigation, and it names the HIVE you're leaving so it isn't a guess. */}
      {expanded ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 17,
              color: '#fff',
              letterSpacing: 1.4,
            }}
            numberOfLines={1}
          >
            HIVE
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 11.5,
              lineHeight: 16,
              color: 'rgba(255,255,255,0.7)',
              marginTop: 2,
            }}
          >
            Alone you&rsquo;re a bee.{'\n'}Together, we&rsquo;re the H.I.V.E.
          </Text>
          {hasMoreThanOneHive ? (
            <Pressable onPress={openHivePicker} hitSlop={6} style={{ marginTop: 9 }}>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.9)',
                }}
              >
                🔀  Leave {hiveDisplayName(community?.name)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 14 }}
      >
        {items.map((item) => {
          const active = activeKey === item.key;
          const badge = item.badge === 'dms' ? unreadDMCount : 0;
          return (
            <View key={item.key}>
              {item.dividerBefore ? (
                <View
                  style={{
                    height: 1,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    marginVertical: 7,
                    marginHorizontal: expanded ? 14 : 12,
                  }}
                />
              ) : null}
              <Pressable
                onPress={() => go(item.route)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                  marginHorizontal: expanded ? 8 : 6,
                  paddingVertical: 9,
                  paddingHorizontal: expanded ? 8 : 0,
                  justifyContent: expanded ? 'flex-start' : 'center',
                  borderRadius: 10,
                  backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                }}
              >
                <View>
                  <Text style={{ fontSize: 19, lineHeight: 25 }}>{item.emoji}</Text>
                  {badge > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -9,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        backgroundColor: '#fff',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: accent }}>
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
                      fontSize: 14.5,
                      color: '#fff',
                    }}
                  >
                    {item.label}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
});

export const RAIL_WIDTHS = { collapsed: RAIL_COLLAPSED, expanded: RAIL_EXPANDED };

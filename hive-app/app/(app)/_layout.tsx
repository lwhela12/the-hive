import { useEffect, useRef, useState } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Text, View, ImageSourcePropType, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { useWebAppDisplayMode } from '../../lib/hooks/useWebAppDisplayMode';
import { AppUpdateBanner } from '../../components/ui/AppUpdateBanner';
import { CelebrationOverlay } from '../../components/ui/CelebrationOverlay';
import { HivePicker } from '../../components/hive/HivePicker';
import { SideRail } from '../../components/navigation';
import { getLastAppPathAsync, getLastAppTabName, saveLastAppPath } from '../../lib/navigationState';
import { currentReturnTo } from '../../lib/authReturnTo';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { resetHomeNavigationState } from '../../lib/homeNavigation';

function TabIcon({
  icon,
  imageSource,
  customIcon,
  label,
  focused,
  isCircular,
  badge = 0,
  compact,
}: {
  icon?: string;
  imageSource?: ImageSourcePropType;
  customIcon?: React.ReactNode;
  label: string;
  focused: boolean;
  isCircular?: boolean;
  badge?: number;
  compact?: boolean;
}) {
  const displayLabel = label;
  const iconSize = compact ? 22 : 28;
  const iconRadius = isCircular ? iconSize / 2 : 6;
  const tooltipProps = Platform.OS === 'web'
    ? ({ title: label } as any)
    : {};

  return (
    <View
      {...tooltipProps}
      accessibilityLabel={label}
      className={`items-center justify-center ${compact ? 'pt-1' : 'pt-2'}`}
    >
      <View>
        {customIcon ? (
          customIcon
        ) : imageSource ? (
          <Image
            source={imageSource}
            style={{ width: iconSize, height: iconSize, borderRadius: iconRadius }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text className={compact ? 'text-xl' : 'text-2xl'}>{icon}</Text>
        )}
        {badge > 0 ? (
          <View
            className="absolute -top-1 -right-2 bg-gold rounded-full min-w-[16px] h-4 px-1 items-center justify-center"
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-[10px]">
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: focused ? 'Lato_700Bold' : 'Lato_400Regular',
          fontSize: compact ? 9 : 12,
          lineHeight: compact ? 10 : 14,
          textAlign: 'center',
        }}
        className={`${compact ? 'mt-0.5' : 'mt-1'} ${
          focused ? 'text-gold' : 'text-charcoal/50'
        }`}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  const { session, communityId, communityRole, profile, loading, hivePickerOpen } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const { width, height } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;
  const useImmersiveProfileGarden = pathname === '/profile' && width > height && height < 540;
  const { isBrowserMode } = useWebAppDisplayMode();
  // The bottom bar is gone (2026-08-03) — the rail carries navigation now. The
  // per-screen tabBarIcon definitions below are left in place deliberately:
  // Tabs still owns routing, and they cost nothing while the bar is hidden.
  // Ripping them out is a separate tidy, not part of changing the furniture.
  const useBrowserCompactTabs = Platform.OS === 'web' && useMobileLayout && isBrowserMode;
  const tabIconSize = useMobileLayout ? (useBrowserCompactTabs ? 20 : 22) : 26;
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const restoredNativePathRef = useRef(false);

  // The rail starts OPEN on anything with room for it, and people collapse it
  // if they want to (Nat 2026-08-03). Icons alone are a quiz — the whole point
  // of the rail is that you can see where everything is without hunting.
  //
  // A phone still starts collapsed, because there the expanded rail covers the
  // page rather than sitting beside it, and opening onto a menu instead of the
  // app would be a worse first second.
  const [railExpanded, setRailExpanded] = useState(() => (
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  ));

  // Initialize push notification listeners and state (no permission prompt on load)
  useNotifications({ autoRequestPermission: false });

  useEffect(() => {
    if (Platform.OS !== 'web' && !restoredNativePathRef.current) return;

    if (!loading && session && communityId) {
      saveLastAppPath(pathname);
    }
  }, [loading, session, communityId, pathname]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (restoredNativePathRef.current || loading || !session || !communityId) return;
    restoredNativePathRef.current = true;

    let cancelled = false;
    getLastAppPathAsync().then((lastPath) => {
      if (cancelled || pathname !== '/hive' || lastPath === pathname) return;

      // lastPath is validated against the APP_PATHS whitelist in
      // navigationState.ts, so any non-home value can be restored directly —
      // including meeting tools like /monthly-tuneup (a half-finished
      // check-in must survive an app resume).
      if (lastPath === '/index') {
        router.replace('/');
      } else if (lastPath !== '/hive') {
        router.replace(lastPath as never);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [communityId, loading, pathname, router, session]);

  // Guard: redirect to login/join if auth resolves without a valid session.
  // This runs for any deep link that bypasses the index.tsx routing logic
  // (e.g., opening /board directly from a home screen bookmark).
  useEffect(() => {
    if (loading) return;
    if (!session) {
      // Carry the destination through login. A texted link lands here signed
      // out just as often as signed in, and dropping it sent people to Home.
      const returnTo = currentReturnTo(pathname);
      router.replace(
        returnTo
          ? ({ pathname: '/(auth)/login', params: { returnTo } } as never)
          : '/(auth)/login'
      );
    } else if (!communityId) {
      router.replace('/join');
    }
  }, [loading, session, communityId, pathname]);

  // Show a spinner while auth is resolving rather than flashing empty tabs
  if (loading || !session || !communityId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf8f3' }}>
        <ActivityIndicator size="large" color="#bd9348" />
      </View>
    );
  }

  // "Which hive?" stands in front of the whole app rather than living at its own
  // address, because the tabs underneath belong to whichever hive you pick — and
  // because the drawer's Clive link already owns the "/" route.
  if (hivePickerOpen) {
    return <HivePicker />;
  }

  return (
    <View style={{ flex: 1 }}>
      {/* "Fresh honey" bar — web only, shows on every tab when a new build ships */}
      <AppUpdateBanner />
      {/* The rail and the pages, side by side. The tab bar is hidden rather than
          removed: Tabs still owns the routing and the per-screen state, and
          fighting that would mean rebuilding navigation instead of re-dressing
          it (Nat 2026-08-03). */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
      {!useImmersiveProfileGarden ? (
        <SideRail
          expanded={railExpanded}
          onToggle={() => setRailExpanded((v) => !v)}
          unreadDMCount={totalUnreadDMs}
        />
      ) : null}
      <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName={getLastAppTabName()}
        screenOptions={{
          headerShown: false,
          // Seven tabs at about 55px each had run out of room, and every new
          // feature made it worse. The rail scrolls, so it never does.
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: useMobileLayout
            ? { minWidth: 0, paddingHorizontal: 0, paddingVertical: 0 }
            : undefined,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="hive"
          listeners={{
            tabPress: () => {
              resetHomeNavigationState();
            },
          }}
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="home-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Home"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        {/* Clive chat */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Clive',
            tabBarAccessibilityLabel: 'Clive',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="sparkles-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Clive"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Members',
            tabBarAccessibilityLabel: 'Members',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="people-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Members"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="board"
          listeners={{
            tabPress: () => {
              clearBoardNavigationState(communityId);
            },
          }}
          options={{
            title: 'Boards',
            tabBarAccessibilityLabel: 'Boards',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="grid-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Boards"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarAccessibilityLabel: 'Messages',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Messages"
                focused={focused}
                badge={totalUnreadDMs}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="meetings"
          options={{
            title: 'Meetings',
            tabBarAccessibilityLabel: 'Meetings',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="calendar-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Meetings"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            href: null,
            tabBarAccessibilityLabel: 'Profile',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                icon="👤"
                imageSource={profile?.avatar_url ? { uri: profile.avatar_url } : undefined}
                label="Profile"
                focused={focused}
                isCircular
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
        <Tabs.Screen
          name="honey-pot"
          options={{
            title: 'Honey Pot',
            href: null,
          }}
        />
        <Tabs.Screen
          name="hive-wide"
          options={{
            title: 'HIVE-Wide',
            href: null,
          }}
        />
        {/* The shared boards. Reached from the rail under HIVE-Wide, not from
            the tab bar — there is already a Boards tab and it means yours. */}
        <Tabs.Screen
          name="hive-wide-boards"
          options={{
            title: 'HIVE-Wide Boards',
            href: null,
          }}
        />
        <Tabs.Screen
          name="arrival-board"
          options={{
            title: 'Arrival Board',
            href: null,
          }}
        />
        <Tabs.Screen
          name="monthly-tuneup"
          options={{
            title: 'Monthly Tune-up',
            href: null,
          }}
        />
        <Tabs.Screen
          name="meeting-helper"
          options={{
            title: 'Meeting Helper',
            href: null,
          }}
        />
        <Tabs.Screen
          name="newsletter"
          options={{
            title: 'Newsletter Draft',
            href: null,
          }}
        />
        {/* The Buzz takes the slot Admin was using. Admin is two people and it
            lives one tap away in the menu; the newsletter is everybody, every
            month, and had no door at all (Nat 2026-08-01). */}
        <Tabs.Screen
          name="buzz"
          options={{
            title: 'Newsletter',
            tabBarAccessibilityLabel: 'Newsletter',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="newspaper-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Newsletter"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            href: null,
          }}
        />
      </Tabs>

      {/* Confetti for a granted wish, over every tab. Mounted once, and mounted
          INSIDE the content column rather than beside it (Nat 2026-08-04: "he's
          crooked, we should make him more centered").

          He was centred — on the WINDOW. Sitting outside this row, the overlay
          spanned the rail as well as the page, so its middle was half the rail's
          width to the left of the middle of what you are actually reading. The
          particle burst had the same lean, for the same reason. In here it fills
          the page and nothing else, so it centres on the page. */}
      <CelebrationOverlay />
      </View>
      </View>

      {/* The sliding menu is gone (2026-08-03). It held the same list the rail
          holds, so keeping it meant two ways to the same eleven places and two
          lists to keep in step — which is exactly how Admin went missing from
          one of them last week. The rail is always there; nothing needs opening. */}
    </View>
  );
}

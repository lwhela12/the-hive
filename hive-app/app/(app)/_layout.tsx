import { useEffect } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Text, View, ImageSourcePropType, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { useWebAppDisplayMode } from '../../lib/hooks/useWebAppDisplayMode';
import { getLastAppTabName, saveLastAppPath } from '../../lib/navigationState';
import { clearBoardNavigationState } from '../../lib/boardNavigation';

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
  const { session, communityId, communityRole, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const showAdminTab = isAdmin || communityRole === 'treasurer' || profile?.role === 'treasurer';
  const { width } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;
  const { isBrowserMode } = useWebAppDisplayMode();
  const useBrowserCompactTabs = Platform.OS === 'web' && useMobileLayout && isBrowserMode;
  const mobileTabHeight = useBrowserCompactTabs ? 62 : 78;
  const mobileTabPaddingBottom = useBrowserCompactTabs ? 6 : Platform.OS === 'ios' ? 14 : 8;
  const mobileTabPaddingTop = useBrowserCompactTabs ? 2 : 4;
  const tabIconSize = useMobileLayout ? (useBrowserCompactTabs ? 20 : 22) : 26;
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);

  // Initialize push notification listeners and state (no permission prompt on load)
  useNotifications({ autoRequestPermission: false });

  useEffect(() => {
    if (!loading && session && communityId) {
      saveLastAppPath(pathname);
    }
  }, [loading, session, communityId, pathname]);

  // Guard: redirect to login/join if auth resolves without a valid session.
  // This runs for any deep link that bypasses the index.tsx routing logic
  // (e.g., opening /board directly from a home screen bookmark).
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/(auth)/login');
    } else if (!communityId) {
      router.replace('/join');
    }
  }, [loading, session, communityId]);

  // Show a spinner while auth is resolving rather than flashing empty tabs
  if (loading || !session || !communityId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf8f3' }}>
        <ActivityIndicator size="large" color="#bd9348" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName={getLastAppTabName()}
        screenOptions={{
          headerShown: false,
          tabBarStyle: useMobileLayout
            ? {
                height: mobileTabHeight,
                paddingTop: mobileTabPaddingTop,
                paddingBottom: mobileTabPaddingBottom,
                backgroundColor: '#fff',
                borderTopColor: '#dec181',
              }
            : {
                height: 70,
                paddingBottom: 8,
                backgroundColor: '#fff',
                borderTopColor: '#dec181',
              },
          tabBarItemStyle: useMobileLayout
            ? { minWidth: 0, paddingHorizontal: 0, paddingVertical: 0 }
            : undefined,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="hive"
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
        <Tabs.Screen
          name="honey-pot"
          options={{
            title: 'Honey Pot',
            href: null,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            href: showAdminTab ? '/admin' : null,
            tabBarAccessibilityLabel: 'Admin',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="settings-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Admin"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
      </Tabs>

    </View>
  );
}

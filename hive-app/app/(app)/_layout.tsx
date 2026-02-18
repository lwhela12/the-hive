import { useState, useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Text, View, ImageSourcePropType, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { HexagonIcon } from '../../components/ui/HexagonIcon';

const beeIcon = require('../../assets/BEE ONLY IN GOLD BG.png');
const cliveIcon = require('../../assets/Clive_logo.png');

function TabIcon({ icon, imageSource, customIcon, label, focused, isCircular, badge }: { icon?: string; imageSource?: ImageSourcePropType; customIcon?: React.ReactNode; label: string; focused: boolean; isCircular?: boolean; badge?: number }) {
  return (
    <View className="items-center justify-center pt-2">
      <View>
        {customIcon ? (
          customIcon
        ) : imageSource ? (
          <Image source={imageSource} style={{ width: 28, height: 28, borderRadius: isCircular ? 14 : 6 }} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <Text className="text-2xl">{icon}</Text>
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
        style={{ fontFamily: focused ? 'Lato_700Bold' : 'Lato_400Regular' }}
        className={`text-xs mt-1 ${
          focused ? 'text-gold' : 'text-charcoal/50'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  const { session, communityId, communityRole, profile, loading } = useAuth();
  const router = useRouter();
  const isAdmin = communityRole === 'admin';
  const { width } = useWindowDimensions();
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);

  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;

  // Initialize push notification listeners and state (no permission prompt on load)
  useNotifications({ autoRequestPermission: false });

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
    <Tabs
      screenOptions={{
        headerShown: false,
        // Hide tab bar on mobile/narrow screens - navigation via sidebar
        tabBarStyle: useMobileLayout
          ? { display: 'none' }
          : {
              height: 70,
              paddingBottom: 8,
              backgroundColor: '#fff',
              borderTopColor: '#dec181',
            },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon imageSource={cliveIcon} label="Clive" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="hive"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon imageSource={beeIcon} label="HIVE" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="board"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📋" label="Board" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="💬" label="Chat" focused={focused} badge={totalUnreadDMs} />
          ),
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon customIcon={<HexagonIcon size={26} />} label="Meetings" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              icon="👤"
              imageSource={profile?.avatar_url ? { uri: profile.avatar_url } : undefined}
              label="Profile"
              focused={focused}
              isCircular
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: isAdmin ? '/admin' : undefined,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚙️" label="Admin" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

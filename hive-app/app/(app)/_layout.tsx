import { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Text, View, Image, ImageSourcePropType, Platform, useWindowDimensions } from 'react-native';
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
          <Image source={imageSource} style={{ width: 28, height: 28, borderRadius: isCircular ? 14 : 6 }} />
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
  const { communityRole, profile, communityId } = useAuth();
  const isAdmin = communityRole === 'admin';
  const { width } = useWindowDimensions();
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);

  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;

  // Initialize push notifications - this will request permission and save token
  useNotifications();

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
            <TabIcon imageSource={beeIcon} label="Hive" focused={focused} />
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

import { Tabs } from 'expo-router';
import { Text, View, Image, ImageSourcePropType } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';

const beeIcon = require('../../assets/BEE ONLY IN GOLD BG.png');

function TabIcon({ icon, imageSource, label, focused }: { icon?: string; imageSource?: ImageSourcePropType; label: string; focused: boolean }) {
  return (
    <View className="items-center justify-center pt-2">
      {imageSource ? (
        <Image source={imageSource} style={{ width: 28, height: 28, borderRadius: 6 }} />
      ) : (
        <Text className="text-2xl">{icon}</Text>
      )}
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
  const { communityRole } = useAuth();
  const isAdmin = communityRole === 'admin';

  // Initialize push notifications - this will request permission and save token
  useNotifications();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
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
            <TabIcon icon="💬" label="Chat" focused={focused} />
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
            <TabIcon icon="✉️" label="Messages" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          href: undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" label="Profile" focused={focused} />
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

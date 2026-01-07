import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View className="items-center justify-center pt-2">
      <Text className="text-2xl">{icon}</Text>
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
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

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
            <TabIcon icon="🐝" label="Hive" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="meetings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🎙️" label="Meetings" focused={focused} />
          ),
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
          href: isAdmin ? '/admin' : null,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚙️" label="Admin" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

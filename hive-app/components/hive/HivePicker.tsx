import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';

/**
 * "Which hive?" — shown on arrival to anyone who belongs to more than one, and
 * again whenever they pick Switch hive from the menu.
 *
 * Only real memberships are listed, so there is no way to walk into a hive you
 * aren't part of: the tap does nothing the database wouldn't already refuse.
 */
export function HivePicker() {
  const { memberships, communityId, switchCommunity, profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const choose = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await switchCommunity(id);
    } finally {
      setBusyId(null);
    }
  };

  const firstName = (profile?.name || '').trim().split(/\s+/)[0];

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
      >
        <View className="w-full max-w-[440px] self-center">
          <Text
            style={{ fontFamily: 'Lato_700Bold', fontSize: 12, letterSpacing: 2.2 }}
            className="text-gold text-center uppercase mb-3"
          >
            {firstName ? `Hello, ${firstName}` : 'Hello'}
          </Text>
          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 26, lineHeight: 34 }}
            className="text-charcoal text-center mb-2"
          >
            Which HIVE today?
          </Text>
          <Text
            style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 22 }}
            className="text-charcoal/60 text-center mb-8"
          >
            You can move between them any time from the menu.
          </Text>

          {memberships.map((m) => {
            const accent = hiveAccent(m.community);
            const name = hiveDisplayName(m.community?.name);
            const isCurrent = m.community_id === communityId;
            const isBusy = busyId === m.community_id;

            return (
              <Pressable
                key={m.community_id}
                onPress={() => choose(m.community_id)}
                disabled={!!busyId}
                accessibilityRole="button"
                accessibilityLabel={`Go into ${name}`}
                className="mb-3 rounded-2xl overflow-hidden active:opacity-80"
                style={{
                  borderWidth: 1.5,
                  borderColor: isCurrent ? accent : 'rgba(189,147,72,0.28)',
                  backgroundColor: '#fffdf5',
                  opacity: busyId && !isBusy ? 0.5 : 1,
                }}
              >
                {/* A band of the hive's own colour, so the choice is visual */}
                <View style={{ height: 6, backgroundColor: accent }} />
                <View className="flex-row items-center px-5 py-4">
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-4"
                    style={{ backgroundColor: accent }}
                  >
                    <Ionicons name="people" size={21} color="#fffdf5" />
                  </View>

                  <View className="flex-1">
                    <Text
                      style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17 }}
                      className="text-charcoal"
                    >
                      {name}
                    </Text>
                    <Text
                      style={{ fontFamily: 'Lato_400Regular', fontSize: 13 }}
                      className="text-charcoal/55 mt-0.5"
                    >
                      {m.role === 'member' ? 'Member' : m.role === 'admin' ? 'Admin' : 'Treasurer'}
                      {isCurrent ? ' · where you were' : ''}
                    </Text>
                  </View>

                  {isBusy ? (
                    <ActivityIndicator size="small" color={accent} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={accent} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

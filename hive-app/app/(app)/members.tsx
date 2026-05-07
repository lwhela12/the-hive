import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import type { Profile, UserRole } from '../../types';

interface MemberWithSkills extends Profile {
  skills: { id: string; description: string }[];
  wishes: { id: string; description: string; status: string }[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Member',
  admin: 'Admin',
  treasurer: 'Treasurer',
  historian: 'Historian',
};

function Avatar({ uri, name, size = 64 }: { uri?: string; name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  ) : (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-gold/20 items-center justify-center"
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: size * 0.35 }} className="text-gold">
        {initials}
      </Text>
    </View>
  );
}

function MemberDetailModal({
  member,
  onClose,
}: {
  member: MemberWithSkills;
  onClose: () => void;
}) {
  const publicWishes = member.wishes.filter(w => w.status === 'public');

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl" style={{ maxHeight: '85%' }}>
          {/* Handle bar */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-gray-200" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="px-6 pb-8">
            {/* Header */}
            <View className="items-center py-4">
              <View className="rounded-full border-2 border-gold/30 p-1 mb-3">
                <Avatar uri={member.avatar_url} name={member.name} size={88} />
              </View>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-2xl text-charcoal">
                {member.name}
              </Text>
              {member.role !== 'member' && (
                <View className="mt-1 bg-gold/10 px-3 py-0.5 rounded-full">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                    {ROLE_LABELS[member.role]}
                  </Text>
                </View>
              )}
              {member.queen_bee_month && (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mt-1">
                  👑 Queen Bee: {member.queen_bee_month}
                </Text>
              )}
            </View>

            {/* Skills */}
            {member.skills.length > 0 && (
              <View className="mb-5">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base mb-2">
                  ✨ Skills & Superpowers
                </Text>
                <View className="gap-2">
                  {member.skills.map(skill => (
                    <View key={skill.id} className="bg-cream rounded-xl px-4 py-3">
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal text-sm">
                        {skill.description}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Public wishes */}
            {publicWishes.length > 0 && (
              <View className="mb-5">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base mb-2">
                  🌟 Currently Wishing For
                </Text>
                <View className="gap-2">
                  {publicWishes.map(wish => (
                    <View key={wish.id} className="bg-gold/5 border border-gold/15 rounded-xl px-4 py-3">
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal text-sm">
                        {wish.description}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {member.skills.length === 0 && publicWishes.length === 0 && (
              <View className="items-center py-6">
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-sm text-center">
                  {member.name} hasn't added skills or wishes yet.{'\n'}Say hi at the next meeting! 🐝
                </Text>
              </View>
            )}

            <Pressable
              onPress={onClose}
              className="mt-2 bg-cream py-3 rounded-xl active:bg-gold/10"
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal">
                Close
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MembersScreen() {
  const { communityId, profile } = useAuth();
  const [members, setMembers] = useState<MemberWithSkills[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MemberWithSkills | null>(null);

  useEffect(() => {
    if (!communityId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('community_memberships')
        .select(`
          user:profiles(
            id, name, avatar_url, role, queen_bee_month,
            skills(id, description),
            wishes(id, description, status)
          )
        `)
        .eq('community_id', communityId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        const parsed = data
          .map((row: any) => row.user)
          .filter(Boolean) as MemberWithSkills[];
        // Put the current user first
        parsed.sort((a, b) => {
          if (a.id === profile?.id) return -1;
          if (b.id === profile?.id) return 1;
          return a.name.localeCompare(b.name);
        });
        setMembers(parsed);
      }
      setLoading(false);
    })();
  }, [communityId, profile?.id]);

  return (
    <SafeAreaView className="flex-1 bg-[#faf8f3]">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* Header */}
        <View className="mb-6">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-2xl text-charcoal">
            The Hive 🐝
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mt-1">
            {members.length} members · Tap to learn more
          </Text>
        </View>

        {loading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="large" color="#bd9348" />
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-4">
            {members.map(member => {
              const isMe = member.id === profile?.id;
              return (
                <Pressable
                  key={member.id}
                  onPress={() => setSelected(member)}
                  className="items-center active:opacity-70"
                  style={{ width: '28%' }}
                >
                  <View className={`rounded-full p-1 mb-2 ${isMe ? 'border-2 border-gold' : 'border border-gold/20'}`}>
                    <Avatar uri={member.avatar_url} name={member.name} size={72} />
                  </View>
                  <Text
                    style={{ fontFamily: isMe ? 'Lato_700Bold' : 'Lato_400Regular' }}
                    className="text-charcoal text-xs text-center"
                    numberOfLines={2}
                  >
                    {isMe ? `${member.name.split(' ')[0]} (you)` : member.name}
                  </Text>
                  {member.role !== 'member' && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-gold text-[10px] text-center mt-0.5">
                      {ROLE_LABELS[member.role]}
                    </Text>
                  )}
                  {member.skills.length > 0 && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/30 text-[10px] text-center mt-0.5">
                      {member.skills.length} skill{member.skills.length !== 1 ? 's' : ''}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {selected && (
        <MemberDetailModal member={selected} onClose={() => setSelected(null)} />
      )}
    </SafeAreaView>
  );
}

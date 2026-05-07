import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import type { UserRole } from '../../types';

interface MemberData {
  id: string;
  name: string;
  avatar_url?: string;
  role: UserRole;
  queen_bee_month?: string;
  skills: { id: string; description: string }[];
  wishes: { id: string; description: string; status: string }[];
  introPost?: { title: string; content: string } | null;
}

const ROLE_LABELS: Record<UserRole, string | null> = {
  member: null,
  admin: 'Admin',
  treasurer: 'Treasurer',
  historian: 'Historian',
};

function Avatar({ uri, name, size = 72 }: { uri?: string; name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  // Silhouette placeholder
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-charcoal/10 items-center justify-center overflow-hidden"
    >
      {/* Head */}
      <View
        style={{
          width: size * 0.38,
          height: size * 0.38,
          borderRadius: size * 0.19,
          backgroundColor: '#9ca3af',
          marginBottom: -size * 0.05,
        }}
      />
      {/* Body silhouette */}
      <View
        style={{
          width: size * 0.72,
          height: size * 0.5,
          borderTopLeftRadius: size * 0.36,
          borderTopRightRadius: size * 0.36,
          backgroundColor: '#9ca3af',
        }}
      />
    </View>
  );
}

function MemberDetailModal({ member, onClose }: { member: MemberData; onClose: () => void }) {
  const publicWishes = member.wishes.filter(w => w.status === 'public');
  const roleLabel = ROLE_LABELS[member.role];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl" style={{ maxHeight: '88%' }}>
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-gray-200" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="px-6 pb-8">
            {/* Profile header */}
            <View className="items-center py-5">
              <View className="rounded-full border-2 border-gold/40 p-1 mb-3">
                <Avatar uri={member.avatar_url} name={member.name} size={96} />
              </View>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-2xl text-charcoal">
                {member.name}
              </Text>
              {roleLabel && (
                <View className="mt-1.5 bg-gold/10 px-3 py-0.5 rounded-full">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                    {roleLabel}
                  </Text>
                </View>
              )}
              {member.queen_bee_month && (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-sm mt-1">
                  👑 Queen Bee: {member.queen_bee_month}
                </Text>
              )}
            </View>

            {/* Intro post */}
            {member.introPost && (
              <View className="mb-5">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base mb-2">
                  👋 Introduction
                </Text>
                <View className="bg-cream rounded-xl px-4 py-3">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm mb-1">
                    {member.introPost.title}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/70 text-sm leading-5">
                    {member.introPost.content.slice(0, 300)}{member.introPost.content.length > 300 ? '...' : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Skills */}
            {member.skills.length > 0 && (
              <View className="mb-5">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base mb-2">
                  ✨ Skills
                </Text>
                <View className="gap-2">
                  {member.skills.map(skill => (
                    <View key={skill.id} className="bg-cream rounded-xl px-4 py-2.5">
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
                    <View key={wish.id} className="bg-gold/5 border border-gold/15 rounded-xl px-4 py-2.5">
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal text-sm">
                        {wish.description}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!member.introPost && member.skills.length === 0 && publicWishes.length === 0 && (
              <View className="items-center py-8">
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-sm text-center">
                  {member.name.split(' ')[0]} hasn't shared anything yet.{'\n'}Say hi at the next meeting! 🐝
                </Text>
              </View>
            )}

            <Pressable onPress={onClose} className="mt-2 bg-cream py-3 rounded-xl active:bg-gold/10">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal">Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MembersScreen() {
  const { communityId, profile } = useAuth();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MemberData | null>(null);

  useEffect(() => {
    if (!communityId) return;
    (async () => {
      setLoading(true);

      // Fetch members + skills + wishes
      const { data: memberRows } = await supabase
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

      if (!memberRows) { setLoading(false); return; }

      const parsed: MemberData[] = memberRows
        .map((r: any) => r.user)
        .filter(Boolean)
        .map((u: any) => ({
          id: u.id,
          name: u.name,
          avatar_url: u.avatar_url,
          role: u.role,
          queen_bee_month: u.queen_bee_month,
          skills: u.skills ?? [],
          wishes: u.wishes ?? [],
          introPost: null,
        }));

      // Fetch intro posts for all members in one query
      const authorIds = parsed.map(m => m.id);
      const { data: introPosts } = await supabase
        .from('board_posts')
        .select('author_id, title, content, board_categories!inner(category_type)')
        .eq('community_id', communityId)
        .eq('board_categories.category_type', 'introductions')
        .in('author_id', authorIds);

      if (introPosts) {
        const introMap = new Map(introPosts.map((p: any) => [p.author_id, { title: p.title, content: p.content }]));
        parsed.forEach(m => { m.introPost = introMap.get(m.id) ?? null; });
      }

      // Current user first, then alphabetical
      parsed.sort((a, b) => {
        if (a.id === profile?.id) return -1;
        if (b.id === profile?.id) return 1;
        return a.name.localeCompare(b.name);
      });

      setMembers(parsed);
      setLoading(false);
    })();
  }, [communityId, profile?.id]);

  return (
    <SafeAreaView className="flex-1 bg-[#faf8f3]">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View className="mb-5">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-2xl text-charcoal">
            Members
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-sm mt-0.5">
            {members.length > 0 ? `${members.length} members · tap to learn more` : ''}
          </Text>
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color="#bd9348" />
          </View>
        ) : (
          /* 3-column grid */
          <View className="flex-row flex-wrap">
            {members.map((member, idx) => {
              const isMe = member.id === profile?.id;
              const roleLabel = ROLE_LABELS[member.role];
              // Add right margin to cols 0 and 1 (not 2)
              const col = idx % 3;
              return (
                <Pressable
                  key={member.id}
                  onPress={() => setSelected(member)}
                  style={{ width: '33.33%', paddingHorizontal: 6, marginBottom: 24 }}
                  className="items-center active:opacity-70"
                >
                  <View
                    className={`rounded-full mb-2.5 ${isMe ? 'border-2 border-gold p-0.5' : 'border border-gold/20 p-0.5'}`}
                    style={{ shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
                  >
                    <Avatar uri={member.avatar_url} name={member.name} size={76} />
                  </View>
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className="text-charcoal text-xs text-center leading-4"
                    numberOfLines={2}
                  >
                    {member.name}
                  </Text>
                  {roleLabel ? (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-gold text-[10px] text-center mt-0.5">
                      {roleLabel}
                    </Text>
                  ) : (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/30 text-[10px] text-center mt-0.5">
                      Member
                    </Text>
                  )}
                  {member.introPost && (
                    <View className="mt-1 w-1.5 h-1.5 rounded-full bg-gold/50" />
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

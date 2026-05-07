import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { UserRole } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';

interface MemberData {
  id: string;
  name: string;
  avatar_url?: string | null;
  role: UserRole;
  queen_bee_month?: string | null;
  skills: { id: string; description: string }[];
  wishes: { id: string; description: string; status: string }[];
  introPost?: { title: string; content: string } | null;
}

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  historian: 'Historian',
};

function SilhouetteAvatar({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e0d6', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
      {/* Head */}
      <View style={{ width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19, backgroundColor: '#c8bfb0', position: 'absolute', top: size * 0.15 }} />
      {/* Body */}
      <View style={{ width: size * 0.75, height: size * 0.42, borderTopLeftRadius: size * 0.375, borderTopRightRadius: size * 0.375, backgroundColor: '#c8bfb0' }} />
    </View>
  );
}

function Avatar({ uri, name, size }: { uri?: string | null; name: string; size: number }) {
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
  return <SilhouetteAvatar size={size} />;
}

function MemberDetailModal({ member, onClose }: { member: MemberData; onClose: () => void }) {
  const publicWishes = member.wishes.filter(w => w.status === 'public');
  const roleLabel = ROLE_LABELS[member.role];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
            {/* Header */}
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <View style={{ borderRadius: 56, borderWidth: 2, borderColor: '#dec181', padding: 3, marginBottom: 12, shadowColor: '#bd9348', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
                <Avatar uri={member.avatar_url} name={member.name} size={100} />
              </View>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 22, color: '#2d2d2d' }}>{member.name}</Text>
              {roleLabel && (
                <View style={{ marginTop: 6, backgroundColor: '#fdf3dc', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>{roleLabel}</Text>
                </View>
              )}
              {member.queen_bee_month && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                  👑 Queen Bee: {member.queen_bee_month}
                </Text>
              )}
            </View>

            {/* Intro post */}
            {member.introPost && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 8 }}>👋 Introduction</Text>
                <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', marginBottom: 4 }}>{member.introPost.title}</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4b5563', lineHeight: 22 }}>
                    {member.introPost.content.slice(0, 320)}{member.introPost.content.length > 320 ? '...' : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Skills */}
            {member.skills.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 8 }}>✨ Skills</Text>
                {member.skills.map(s => (
                  <View key={s.id} style={{ backgroundColor: '#faf8f3', borderRadius: 12, padding: 12, marginBottom: 6 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d' }}>{s.description}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Wishes */}
            {publicWishes.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 8 }}>🌟 Currently Wishing For</Text>
                {publicWishes.map(w => (
                  <View key={w.id} style={{ backgroundColor: '#fffbf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.3)', borderRadius: 12, padding: 12, marginBottom: 6 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d' }}>{w.description}</Text>
                  </View>
                ))}
              </View>
            )}

            {!member.introPost && member.skills.length === 0 && publicWishes.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                  {member.name.split(' ')[0]} hasn't shared anything yet.{'\n'}Say hi at the next meeting! 🐝
                </Text>
              </View>
            )}

            <Pressable onPress={onClose} style={{ backgroundColor: '#faf8f3', borderRadius: 14, paddingVertical: 14, marginTop: 4 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MembersScreen() {
  const { communityId, profile } = useAuth();
  const { width } = useWindowDimensions();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemberData | null>(null);

  useEffect(() => {
    if (!communityId) return;
    (async () => {
      setLoading(true);
      setError(null);

      // Step 1: fetch memberships + profiles + role from community_memberships
      const { data: memberships, error: membErr } = await supabase
        .from('community_memberships')
        .select('user_id, role, profiles(id, name, avatar_url, queen_bee_month)')
        .eq('community_id', communityId);

      if (membErr || !memberships) {
        setError('Could not load members.');
        setLoading(false);
        return;
      }

      const memberList: MemberData[] = memberships
        .map((m: any) => ({
          id: m.profiles?.id ?? m.user_id,
          name: m.profiles?.name ?? 'Unknown',
          avatar_url: m.profiles?.avatar_url ?? null,
          role: (m.role ?? 'member') as UserRole,
          queen_bee_month: m.profiles?.queen_bee_month ?? null,
          skills: [],
          wishes: [],
          introPost: null,
        }))
        .filter((m: MemberData) => m.name !== 'Unknown');

      const userIds = memberList.map(m => m.id);

      // Step 2: fetch skills + wishes + intro posts in parallel
      const [skillsRes, wishesRes, introRes] = await Promise.all([
        supabase.from('skills').select('user_id, id, description').in('user_id', userIds),
        supabase.from('wishes').select('user_id, id, description, status').in('user_id', userIds).eq('status', 'public'),
        supabase
          .from('board_posts')
          .select('author_id, title, content, board_categories!inner(category_type)')
          .eq('community_id', communityId)
          .eq('board_categories.category_type', 'introductions')
          .in('author_id', userIds),
      ]);

      // Map skills by user
      const skillsByUser = new Map<string, { id: string; description: string }[]>();
      (skillsRes.data ?? []).forEach((s: any) => {
        if (!skillsByUser.has(s.user_id)) skillsByUser.set(s.user_id, []);
        skillsByUser.get(s.user_id)!.push({ id: s.id, description: s.description });
      });

      // Map wishes by user
      const wishesByUser = new Map<string, { id: string; description: string; status: string }[]>();
      (wishesRes.data ?? []).forEach((w: any) => {
        if (!wishesByUser.has(w.user_id)) wishesByUser.set(w.user_id, []);
        wishesByUser.get(w.user_id)!.push({ id: w.id, description: w.description, status: w.status });
      });

      // Map intro posts by user (first one wins)
      const introByUser = new Map<string, { title: string; content: string }>();
      (introRes.data ?? []).forEach((p: any) => {
        if (!introByUser.has(p.author_id)) {
          introByUser.set(p.author_id, { title: p.title, content: p.content });
        }
      });

      memberList.forEach(m => {
        m.skills = skillsByUser.get(m.id) ?? [];
        m.wishes = wishesByUser.get(m.id) ?? [];
        m.introPost = introByUser.get(m.id) ?? null;
      });

      // Current user first, then alphabetical
      memberList.sort((a, b) => {
        if (a.id === profile?.id) return -1;
        if (b.id === profile?.id) return 1;
        return a.name.localeCompare(b.name);
      });

      setMembers(memberList);
      setLoading(false);
    })();
  }, [communityId, profile?.id]);

  // Responsive: 4 cols on wide screens, 3 on mobile
  const numCols = width >= 600 ? 4 : 3;
  const avatarSize = width >= 600 ? 88 : 76;
  const cellWidth = Math.floor(width / numCols);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#faf8f3' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 24, color: '#2d2d2d' }}>Members</Text>
          {!loading && members.length > 0 && (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
              {members.length} members · tap to learn more
            </Text>
          )}
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <ActivityIndicator size="large" color="#bd9348" />
          </View>
        ) : error ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontFamily: 'Lato_400Regular', color: '#ef4444', textAlign: 'center' }}>{error}</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {members.map(member => {
              const isMe = member.id === profile?.id;
              const roleLabel = ROLE_LABELS[member.role];
              return (
                <Pressable
                  key={member.id}
                  onPress={() => setSelected(member)}
                  style={{ width: cellWidth, alignItems: 'center', marginBottom: 28, paddingHorizontal: 4 }}
                >
                  {/* Circle with gold ring */}
                  <View
                    style={{
                      borderRadius: (avatarSize + 8) / 2,
                      borderWidth: isMe ? 2.5 : 1.5,
                      borderColor: isMe ? '#bd9348' : 'rgba(222,193,129,0.5)',
                      padding: 3,
                      marginBottom: 10,
                      shadowColor: '#000',
                      shadowOpacity: 0.1,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 3,
                      backgroundColor: 'white',
                    }}
                  >
                    <Avatar uri={member.avatar_url} name={member.name} size={avatarSize} />
                  </View>

                  {/* Name */}
                  <Text
                    style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', textAlign: 'center', lineHeight: 16 }}
                    numberOfLines={2}
                  >
                    {isMe ? `${member.name.split(' ')[0]} (you)` : member.name}
                  </Text>

                  {/* Role / title */}
                  <Text
                    style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: roleLabel ? '#bd9348' : '#9ca3af', textAlign: 'center', marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {roleLabel ?? 'Member'}
                  </Text>

                  {/* Gold dot = has intro post */}
                  {member.introPost && (
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#bd9348', marginTop: 4, opacity: 0.6 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {selected && <MemberDetailModal member={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}

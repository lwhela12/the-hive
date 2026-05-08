import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, useWindowDimensions, TextInput } from 'react-native';
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
  occupation?: string | null;
  bio?: string | null;
  current_project?: string | null;
  hometown?: string | null;
  favorite_book?: string | null;
  favorite_food?: string | null;
  favorite_hobby?: string | null;
  known_for?: string | null;
  fun_facts?: string[] | null;
  birthday?: string | null;
  skills: { id: string; description: string }[];
  wishes: { id: string; description: string; status: string }[];
  introPost?: { title: string; content: string } | null;
  questionAnswerCount: number;
}

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  historian: 'Historian',
};

function SilhouetteAvatar({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e0d6', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
      <View style={{ width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19, backgroundColor: '#c8bfb0', position: 'absolute', top: size * 0.15 }} />
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', width: 92 }}>{label}</Text>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#2d2d2d', flex: 1, lineHeight: 18 }}>{value}</Text>
    </View>
  );
}

function MemberDetailModal({ member, onClose }: { member: MemberData; onClose: () => void }) {
  const publicWishes = member.wishes.filter(w => w.status === 'public');
  const roleLabel = ROLE_LABELS[member.role];

  const hasFavorites = member.favorite_book || member.favorite_food || member.favorite_hobby;
  const hasDetails = member.bio || member.current_project || member.hometown || member.known_for || hasFavorites;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>
            {/* Header */}
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <View style={{ borderRadius: 56, borderWidth: 2, borderColor: '#dec181', padding: 3, marginBottom: 12, shadowColor: '#bd9348', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
                <Avatar uri={member.avatar_url} name={member.name} size={100} />
              </View>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d' }}>{member.name}</Text>
              {member.occupation && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#6b7280', marginTop: 3 }}>{member.occupation}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {roleLabel && (
                  <View style={{ backgroundColor: '#fdf3dc', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>{roleLabel}</Text>
                  </View>
                )}
                {member.hometown && (
                  <View style={{ backgroundColor: '#f5f3ee', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#6b7280' }}>📍 {member.hometown}</Text>
                  </View>
                )}
                {member.queen_bee_month && (
                  <View style={{ backgroundColor: '#fdf3dc', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#bd9348' }}>👑 Queen Bee: {member.queen_bee_month}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Bio */}
            {member.bio && (
              <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4b5563', lineHeight: 22 }}>
                  {member.bio}
                </Text>
              </View>
            )}

            {/* Known for */}
            {member.known_for && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 6 }}>KNOWN FOR</Text>
                <Text style={{ fontFamily: 'LibreBaskerville_400Regular', fontSize: 15, color: '#2d2d2d', fontStyle: 'italic', lineHeight: 22 }}>"{member.known_for}"</Text>
              </View>
            )}

            {/* Current project */}
            {member.current_project && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 6 }}>CURRENTLY WORKING ON</Text>
                <View style={{ backgroundColor: '#fffbf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.3)', borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', lineHeight: 20 }}>🚀 {member.current_project}</Text>
                </View>
              </View>
            )}

            {/* Fun facts */}
            {member.fun_facts && member.fun_facts.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 8 }}>FUN FACTS</Text>
                {member.fun_facts.map((fact, i) => (
                  <View key={i} style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <Text style={{ color: '#bd9348', marginRight: 8, fontSize: 14 }}>✦</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', flex: 1, lineHeight: 20 }}>{fact}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Favorites */}
            {hasFavorites && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 10 }}>FAVORITES</Text>
                <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16 }}>
                  <InfoRow label="📚 Book" value={member.favorite_book} />
                  <InfoRow label="🍽️ Food" value={member.favorite_food} />
                  <InfoRow label="🎯 Hobby" value={member.favorite_hobby} />
                </View>
              </View>
            )}

            {/* Skills */}
            {member.skills.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 10 }}>SKILLS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {member.skills.map((s) => {
                    const len = s.description.length;
                    const size = len <= 12 ? 'large' : len <= 22 ? 'medium' : 'small';
                    const styles = {
                      large:  { px: 18, py: 10, fontSize: 15, bg: '#fdf3dc', border: 'rgba(222,193,129,0.5)' },
                      medium: { px: 14, py: 8,  fontSize: 13, bg: '#faf8f3', border: 'rgba(222,193,129,0.3)' },
                      small:  { px: 10, py: 6,  fontSize: 11, bg: '#f5f3ee', border: 'rgba(200,190,170,0.3)' },
                    }[size];
                    return (
                      <View key={s.id} style={{ backgroundColor: styles.bg, borderWidth: 1, borderColor: styles.border, borderRadius: 24, paddingHorizontal: styles.px, paddingVertical: styles.py }}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: styles.fontSize, color: '#2d2d2d' }}>{s.description}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Wishes */}
            {publicWishes.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 8 }}>CURRENTLY WISHING FOR</Text>
                {publicWishes.map(w => (
                  <View key={w.id} style={{ backgroundColor: '#fffbf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.3)', borderRadius: 12, padding: 12, marginBottom: 6 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d' }}>🌟 {w.description}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Intro post */}
            {member.introPost && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 8 }}>INTRODUCTION POST</Text>
                <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', marginBottom: 4 }}>{member.introPost.title}</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4b5563', lineHeight: 22 }}>
                    {member.introPost.content.slice(0, 320)}{member.introPost.content.length > 320 ? '...' : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Question engagement */}
            {member.questionAnswerCount > 0 && (
              <View style={{ marginBottom: 20, alignItems: 'center', backgroundColor: '#faf8f3', borderRadius: 16, padding: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 22, color: '#bd9348' }}>{member.questionAnswerCount}</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>daily questions answered</Text>
              </View>
            )}

            {!hasDetails && !member.introPost && member.skills.length === 0 && publicWishes.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                  {member.name.split(' ')[0]} hasn't filled out their profile yet.{'\n'}Say hi at the next meeting! 🐝
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
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!communityId) return;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: memberships, error: membErr } = await supabase
        .from('community_memberships')
        .select('user_id, role, profiles(id, name, avatar_url, queen_bee_month, birthday, occupation, bio, current_project, hometown, favorite_book, favorite_food, favorite_hobby, known_for, fun_facts)')
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
          birthday: m.profiles?.birthday ?? null,
          occupation: m.profiles?.occupation ?? null,
          bio: m.profiles?.bio ?? null,
          current_project: m.profiles?.current_project ?? null,
          hometown: m.profiles?.hometown ?? null,
          favorite_book: m.profiles?.favorite_book ?? null,
          favorite_food: m.profiles?.favorite_food ?? null,
          favorite_hobby: m.profiles?.favorite_hobby ?? null,
          known_for: m.profiles?.known_for ?? null,
          fun_facts: m.profiles?.fun_facts ?? null,
          skills: [],
          wishes: [],
          introPost: null,
          questionAnswerCount: 0,
        }))
        .filter((m: MemberData) => m.name !== 'Unknown');

      const userIds = memberList.map(m => m.id);

      const [skillsRes, wishesRes, introRes, answersRes] = await Promise.all([
        supabase.from('skills').select('user_id, id, description').in('user_id', userIds),
        supabase.from('wishes').select('user_id, id, description, status').in('user_id', userIds).eq('status', 'public'),
        supabase
          .from('board_posts')
          .select('author_id, title, content, board_categories!inner(category_type)')
          .eq('community_id', communityId)
          .eq('board_categories.category_type', 'introductions')
          .in('author_id', userIds),
        supabase
          .from('daily_question_answers')
          .select('user_id')
          .in('user_id', userIds),
      ]);

      const skillsByUser = new Map<string, { id: string; description: string }[]>();
      (skillsRes.data ?? []).forEach((s: any) => {
        if (!skillsByUser.has(s.user_id)) skillsByUser.set(s.user_id, []);
        skillsByUser.get(s.user_id)!.push({ id: s.id, description: s.description });
      });

      const wishesByUser = new Map<string, { id: string; description: string; status: string }[]>();
      (wishesRes.data ?? []).forEach((w: any) => {
        if (!wishesByUser.has(w.user_id)) wishesByUser.set(w.user_id, []);
        wishesByUser.get(w.user_id)!.push({ id: w.id, description: w.description, status: w.status });
      });

      const introByUser = new Map<string, { title: string; content: string }>();
      (introRes.data ?? []).forEach((p: any) => {
        if (!introByUser.has(p.author_id)) {
          introByUser.set(p.author_id, { title: p.title, content: p.content });
        }
      });

      const answerCountByUser = new Map<string, number>();
      (answersRes.data ?? []).forEach((a: any) => {
        answerCountByUser.set(a.user_id, (answerCountByUser.get(a.user_id) ?? 0) + 1);
      });

      memberList.forEach(m => {
        m.skills = skillsByUser.get(m.id) ?? [];
        m.wishes = wishesByUser.get(m.id) ?? [];
        m.introPost = introByUser.get(m.id) ?? null;
        m.questionAnswerCount = answerCountByUser.get(m.id) ?? 0;
      });

      memberList.sort((a, b) => {
        if (a.id === profile?.id) return -1;
        if (b.id === profile?.id) return 1;
        return a.name.localeCompare(b.name);
      });

      setMembers(memberList);
      setLoading(false);
    })();
  }, [communityId, profile?.id]);

  const numCols = width >= 768 ? 4 : 3;
  const avatarSize = width >= 768 ? 88 : 76;
  const cellWidth = Math.floor(width / numCols);

  const filtered = search.trim()
    ? members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : members;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#faf8f3' }}>
      {/* Header */}
      <View style={{ backgroundColor: '#bd9348', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 16, color: '#ffffff' }}>Members</Text>
        {!loading && members.length > 0 && (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            {members.length} members · tap to learn more
          </Text>
        )}
      </View>

      {/* Search bar */}
      {!loading && members.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#faf8f3', borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.3)' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(222,193,129,0.35)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: '#9ca3af', marginRight: 8, fontSize: 15 }}>🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search members..."
              placeholderTextColor="#9ca3af"
              style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', flex: 1 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Text style={{ color: '#9ca3af', fontSize: 18, lineHeight: 20 }}>×</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
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
            {filtered.map(member => {
              const isMe = member.id === profile?.id;
              const roleLabel = ROLE_LABELS[member.role];
              const profileFilled = !!(member.bio || member.current_project || member.known_for);
              return (
                <Pressable
                  key={member.id}
                  onPress={() => setSelected(member)}
                  style={{ width: cellWidth, alignItems: 'center', marginBottom: 28, paddingHorizontal: 4 }}
                >
                  {/* Avatar ring */}
                  <View style={{
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
                  }}>
                    <Avatar uri={member.avatar_url} name={member.name} size={avatarSize} />
                  </View>

                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', textAlign: 'center', lineHeight: 16 }} numberOfLines={2}>
                    {isMe ? `${member.name.split(' ')[0]} (you)` : member.name}
                  </Text>

                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: roleLabel ? '#bd9348' : '#9ca3af', textAlign: 'center', marginTop: 2 }} numberOfLines={1}>
                    {roleLabel ?? 'Member'}
                  </Text>

                  {/* Indicators: gold dot = has intro, teal = profile filled */}
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                    {member.introPost && (
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#bd9348', opacity: 0.7 }} />
                    )}
                    {profileFilled && (
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#6b9e8a', opacity: 0.7 }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Legend */}
        {!loading && members.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8, opacity: 0.6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#bd9348' }} />
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: '#9ca3af' }}>has intro post</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#6b9e8a' }} />
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: '#9ca3af' }}>profile filled out</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {selected && <MemberDetailModal member={selected} onClose={() => setSelected(null)} />}
    </SafeAreaView>
  );
}

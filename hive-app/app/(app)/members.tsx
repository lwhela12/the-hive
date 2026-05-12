import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, useWindowDimensions, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { Skill, UserRole, Wish } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import { SKILL_CATEGORIES } from '../../lib/skillsList';

type MemberSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;
type MemberWish = Pick<Wish, 'id' | 'description' | 'status'> & Partial<Wish>;

interface MemberData {
  id: string;
  name: string;
  avatar_url?: string | null;
  role: UserRole;
  hiveTitle?: string | null;
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
  skills: MemberSkill[];
  wishes: MemberWish[];
  introPost?: { title: string; content: string } | null;
  questionAnswerCount: number;
}

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  historian: 'Historian',
};

const HIVE_CABINET = [
  {
    title: 'Founder & Apiarist',
    memberName: 'Nat',
    aliases: ['Natalie'],
    icon: '👑',
    description: 'Guides the HIVE vision, culture, and creative abundance.',
  },
  {
    title: 'Historian',
    memberName: 'Charlee',
    icon: '📚',
    description: 'Keeps the HIVE story, highlights, photos, and memory alive.',
  },
  {
    title: 'Treasurer',
    memberName: 'Ollie',
    aliases: ['Oliver'],
    icon: '🍯',
    description: 'Helps steward the Honey Pot and money flow.',
  },
  {
    title: 'Bee Keeper',
    memberName: 'Lucas',
    icon: '🐝',
    description: 'Tends the app, systems, and tech infrastructure.',
  },
  {
    title: 'People & Culture',
    memberName: 'Izzy',
    aliases: ['Isabelle'],
    icon: '🤝',
    description: 'Helps make sure every HIVE member is heard, welcomed, and connected.',
  },
];

const PROFILE_PROMPT_LIMITS = {
  name: 80,
  bio: 1000,
  short: 180,
  funFact: 220,
  skills: 700,
};

function getHiveTitle(name: string) {
  const normalized = name.toLowerCase();
  const match = HIVE_CABINET.find(role => {
    const names = [role.memberName, ...(role.aliases ?? [])];
    return names.some(alias => normalized.includes(alias.toLowerCase()));
  });
  return match?.title ?? null;
}

function getHiveTitleIcon(title?: string | null) {
  return HIVE_CABINET.find(role => role.title === title)?.icon ?? '✨';
}

function getHiveTitleRank(title?: string | null) {
  const index = HIVE_CABINET.findIndex(role => role.title === title);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}


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

function ProfilePromptInput({
  label,
  placeholder,
  value,
  onChangeText,
  multiline = false,
  maxLength = PROFILE_PROMPT_LIMITS.short,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const countColor = value.length > maxLength * 0.9 ? '#bd9348' : '#9ca3af';
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a8173' }}>{label}</Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: countColor }}>{value.length}/{maxLength}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#b5ad9f"
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.45)',
          borderRadius: 12,
          color: '#2d2d2d',
          fontFamily: 'Lato_400Regular',
          fontSize: 14,
          minHeight: multiline ? 92 : 44,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 8,
        }}
      />
    </View>
  );
}

function MemberDetailModal({
  member,
  onClose,
  onMemberUpdated,
  communityId,
}: {
  member: MemberData;
  onClose: () => void;
  onMemberUpdated: (member: MemberData) => void;
  communityId: string | null;
}) {
  const router = useRouter();
  const { profile, session } = useAuth();
  const currentAuthId = profile?.id ?? session?.user?.id ?? null;
  const isCurrentUser = !!currentAuthId && member.id === currentAuthId;
  const publicWishes = member.wishes.filter(w => w.status === 'public');
  const roleLabel = ROLE_LABELS[member.role];
  const [introExpanded, setIntroExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeeper, setShowDeeper] = useState(false);
  const [draftName, setDraftName] = useState(member.name ?? '');
  const [draftOccupation, setDraftOccupation] = useState(member.occupation ?? '');
  const [draftBirthday, setDraftBirthday] = useState(member.birthday ? isoToAmerican(member.birthday) : '');
  const [draftBio, setDraftBio] = useState(member.bio ?? '');
  const [draftCurrentProject, setDraftCurrentProject] = useState(member.current_project ?? '');
  const [draftHometown, setDraftHometown] = useState(member.hometown ?? '');
  const [draftKnownFor, setDraftKnownFor] = useState(member.known_for ?? '');
  const [draftFavBook, setDraftFavBook] = useState(member.favorite_book ?? '');
  const [draftFavFood, setDraftFavFood] = useState(member.favorite_food ?? '');
  const [draftFavHobby, setDraftFavHobby] = useState(member.favorite_hobby ?? '');
  const [draftFunFact1, setDraftFunFact1] = useState(member.fun_facts?.[0] ?? '');
  const [draftFunFact2, setDraftFunFact2] = useState(member.fun_facts?.[1] ?? '');
  const [draftFunFact3, setDraftFunFact3] = useState(member.fun_facts?.[2] ?? '');
  // Skill bubbles — array-based so we can add/remove individual chips
  const [draftSkillList, setDraftSkillList] = useState<string[]>(member.skills.map(s => s.description));
  const [newSkillInput, setNewSkillInput] = useState('');
  const [editingSkills, setEditingSkills] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [showWishesSheet, setShowWishesSheet] = useState(false);
  // Wishes management (for current user only)
  const [myWishes, setMyWishes] = useState<MemberWish[]>([]);
  const [wishesLoading, setWishesLoading] = useState(false);
  const [addingWish, setAddingWish] = useState(false);
  const [newWishInput, setNewWishInput] = useState('');
  const [wishActionLoading, setWishActionLoading] = useState<string | null>(null);

  const hasFavorites = member.favorite_book || member.favorite_food || member.favorite_hobby;
  const hasDetails = member.bio || member.current_project || member.hometown || member.known_for || hasFavorites;
  const introContent = member.introPost?.content ?? '';
  const introNeedsToggle = introContent.length > 320;
  const visibleIntro = introExpanded || !introNeedsToggle
    ? introContent
    : `${introContent.slice(0, 320).trimEnd()}...`;

  useEffect(() => {
    setIntroExpanded(false);
    setEditing(false);
    setSaveError(null);
    setShowDeeper(false);
    setDraftName(member.name ?? '');
    setDraftOccupation(member.occupation ?? '');
    setDraftBirthday(member.birthday ? isoToAmerican(member.birthday) : '');
    setDraftBio(member.bio ?? '');
    setDraftCurrentProject(member.current_project ?? '');
    setDraftHometown(member.hometown ?? '');
    setDraftKnownFor(member.known_for ?? '');
    setDraftFavBook(member.favorite_book ?? '');
    setDraftFavFood(member.favorite_food ?? '');
    setDraftFavHobby(member.favorite_hobby ?? '');
    setDraftFunFact1(member.fun_facts?.[0] ?? '');
    setDraftFunFact2(member.fun_facts?.[1] ?? '');
    setDraftFunFact3(member.fun_facts?.[2] ?? '');
    setDraftSkillList(member.skills.map(s => s.description));
    setNewSkillInput('');
    setEditingSkills(false);
    setShowSkillPicker(false);
    setSkillSearch('');
    setShowWishesSheet(false);
  }, [member]);

  // Fetch current user's own wishes (all statuses) when modal opens
  useEffect(() => {
    if (!isCurrentUser || !communityId) return;
    setWishesLoading(true);
    supabase
      .from('wishes')
      .select('id, description, status')
      .eq('user_id', member.id)
      .eq('community_id', communityId)
      .in('status', ['private', 'public'])
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setMyWishes(data ?? []);
        setWishesLoading(false);
      });
  }, [isCurrentUser, member.id, communityId]);

  const addSkillChip = () => {
    const trimmed = newSkillInput.trim();
    if (!trimmed || draftSkillList.length >= 30) return;
    if (!draftSkillList.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setDraftSkillList(prev => [...prev, trimmed]);
    }
    setNewSkillInput('');
  };

  const saveSkillsOnly = async () => {
    if (!communityId) return;
    setSavingSkills(true);
    const skillDescriptions = Array.from(new Set(draftSkillList.map(s => s.trim()).filter(Boolean)));
    try {
      const nextSkillSet = new Set(skillDescriptions.map(d => d.toLowerCase()));
      const existingSkillSet = new Set(member.skills.map(s => s.description.toLowerCase()));
      const idsToDelete = member.skills
        .filter(s => !nextSkillSet.has(s.description.toLowerCase()))
        .map(s => s.id)
        .filter(id => !id.startsWith('draft-skill-'));
      const toInsert = skillDescriptions.filter(d => !existingSkillSet.has(d.toLowerCase()));

      if (idsToDelete.length > 0) {
        await (supabase as any).from('skills').delete().in('id', idsToDelete).eq('user_id', member.id);
      }
      if (toInsert.length > 0) {
        await (supabase as any).from('skills').insert(toInsert.map(description => ({
          user_id: member.id, community_id: communityId, description, raw_input: description, extracted_from: 'manual',
        })));
      }
      onMemberUpdated({
        ...member,
        skills: skillDescriptions.map((description, i) => ({
          id: member.skills[i]?.id ?? `draft-skill-${i}`,
          description,
        })),
      });
      setEditingSkills(false);
    } catch (e) {
      console.warn('[Members] skills save failed', e);
    } finally {
      setSavingSkills(false);
    }
  };

  const publishWish = async (wishId: string) => {
    setWishActionLoading(wishId);
    await (supabase as any).from('wishes').update({ status: 'public', is_active: true }).eq('id', wishId);
    setMyWishes(prev => prev.map(w => w.id === wishId ? { ...w, status: 'public' } : w));
    setWishActionLoading(null);
  };

  const makeWishPrivate = async (wishId: string) => {
    setWishActionLoading(wishId);
    await (supabase as any).from('wishes').update({ status: 'private', is_active: false }).eq('id', wishId);
    setMyWishes(prev => prev.map(w => w.id === wishId ? { ...w, status: 'private' } : w));
    setWishActionLoading(null);
  };

  const deleteWish = async (wishId: string) => {
    Alert.alert('Delete wish', 'Remove this wish from your profile?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await (supabase as any).from('wishes').delete().eq('id', wishId);
          setMyWishes(prev => prev.filter(w => w.id !== wishId));
        },
      },
    ]);
  };

  const saveNewWish = async () => {
    const desc = newWishInput.trim();
    if (!desc || !communityId) return;
    const { data } = await (supabase as any)
      .from('wishes')
      .insert({ user_id: member.id, community_id: communityId, description: desc, raw_input: desc, status: 'private', is_active: false, extracted_from: 'manual' })
      .select('id, description, status')
      .single();
    if (data) setMyWishes(prev => [data, ...prev]);
    setNewWishInput('');
    setAddingWish(false);
  };

  const refineWithClive = (description: string) => {
    router.push({ pathname: '/', params: { refineWish: description } });
  };

  const saveProfilePrompts = async () => {
    setSaving(true);
    setSaveError(null);
    const cleanName = draftName.trim();
    const cleanBirthday = draftBirthday.trim();
    const birthdayIso = cleanBirthday ? parseAmericanDate(cleanBirthday) : null;
    const skillDescriptions = Array.from(new Set(draftSkillList.map(s => s.trim()).filter(Boolean)));

    if (!cleanName) {
      setSaveError('Please keep a name on your profile.');
      setSaving(false);
      return;
    }

    if (cleanBirthday && !birthdayIso) {
      setSaveError('Birthday should look like MM-DD-YYYY, like 10-12-1987.');
      setSaving(false);
      return;
    }

    if (skillDescriptions.length > 30) {
      setSaveError('Let’s keep skills to 30 bubbles or fewer for now.');
      setSaving(false);
      return;
    }

    try {
      const funFacts = [draftFunFact1, draftFunFact2, draftFunFact3]
        .map(fact => fact.trim())
        .filter(Boolean);
      const updates = {
        name: cleanName,
        occupation: draftOccupation.trim() || null,
        birthday: birthdayIso,
        bio: draftBio.trim() || null,
        current_project: draftCurrentProject.trim() || null,
        hometown: draftHometown.trim() || null,
        known_for: draftKnownFor.trim() || null,
        favorite_book: draftFavBook.trim() || null,
        favorite_food: draftFavFood.trim() || null,
        favorite_hobby: draftFavHobby.trim() || null,
        fun_facts: funFacts.length > 0 ? funFacts : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from('profiles')
        .update(updates)
        .eq('id', member.id);

      if (error) throw error;

      if (communityId) {
        const nextSkillLookup = new Set(skillDescriptions.map(description => description.toLowerCase()));
        const existingSkillLookup = new Set(member.skills.map(skill => skill.description.toLowerCase()));
        const skillIdsToDelete = member.skills
          .filter(skill => !nextSkillLookup.has(skill.description.toLowerCase()))
          .map(skill => skill.id)
          .filter(id => !id.startsWith('draft-skill-'));
        const skillsToInsert = skillDescriptions.filter(description => !existingSkillLookup.has(description.toLowerCase()));

        if (skillIdsToDelete.length > 0) {
          const { error: deleteSkillsError } = await (supabase as any)
            .from('skills')
            .delete()
            .in('id', skillIdsToDelete)
            .eq('user_id', member.id);

          if (deleteSkillsError) throw deleteSkillsError;
        }

        if (skillsToInsert.length > 0) {
          const { error: insertSkillsError } = await (supabase as any)
            .from('skills')
            .insert(skillsToInsert.map(description => ({
              user_id: member.id,
              community_id: communityId,
              description,
              raw_input: description,
              extracted_from: 'manual',
            })));

          if (insertSkillsError) throw insertSkillsError;
        }
      }

      onMemberUpdated({
        ...member,
        ...updates,
        hiveTitle: getHiveTitle(cleanName),
        skills: skillDescriptions.map((description, index) => ({
          id: member.skills[index]?.id ?? `draft-skill-${index}`,
          description,
        })),
      });
      setEditing(false);
    } catch (error: any) {
      console.warn('[Members] profile prompt save failed', error);
      const missingProfileFields = error?.message?.includes('does not exist') || error?.code === '42703';
      setSaveError(
        missingProfileFields
          ? 'These new profile fields are not installed in Supabase yet. We need to apply the profile fields migration once, then this will save.'
          : 'Could not save profile updates. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(event: any) => event.stopPropagation()}
          style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}
        >
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>

          {/* ── Skill Picker Sheet ── */}
          {showSkillPicker && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, zIndex: 10 }}>
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
              </View>
              <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: '#2d2d2d' }}>Pick your skills</Text>
                  <Pressable onPress={() => { setShowSkillPicker(false); setSkillSearch(''); }} style={{ padding: 6 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#9ca3af' }}>Done picking</Text>
                  </Pressable>
                </View>
                {/* Selected count */}
                {draftSkillList.length > 0 && (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#bd9348', marginBottom: 8 }}>
                    {draftSkillList.length} selected · tap any to remove
                  </Text>
                )}
                {/* Search */}
                <TextInput
                  value={skillSearch}
                  onChangeText={setSkillSearch}
                  placeholder="Search skills..."
                  placeholderTextColor="#b5ad9f"
                  style={{ backgroundColor: '#faf8f3', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', marginBottom: 4 }}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
                {/* Custom / type-your-own */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#9ca3af', letterSpacing: 0.7, marginBottom: 8 }}>✍️ TYPE YOUR OWN</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={newSkillInput}
                      onChangeText={setNewSkillInput}
                      onSubmitEditing={addSkillChip}
                      placeholder="Something unique to you..."
                      placeholderTextColor="#b5ad9f"
                      returnKeyType="done"
                      style={{ flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 12, color: '#2d2d2d', fontFamily: 'Lato_400Regular', fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 }}
                    />
                    <Pressable onPress={addSkillChip} style={{ backgroundColor: '#bd9348', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: 'white' }}>+ Add</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Category sections */}
                {SKILL_CATEGORIES.map(cat => {
                  const filtered = skillSearch.trim()
                    ? cat.skills.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase()))
                    : cat.skills;
                  if (filtered.length === 0) return null;
                  return (
                    <View key={cat.label} style={{ marginBottom: 20 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#9ca3af', letterSpacing: 0.7, marginBottom: 10 }}>
                        {cat.emoji} {cat.label.toUpperCase()}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {filtered.map(skill => {
                          const selected = draftSkillList.some(s => s.toLowerCase() === skill.toLowerCase());
                          return (
                            <Pressable
                              key={skill}
                              onPress={() => {
                                if (selected) {
                                  setDraftSkillList(prev => prev.filter(s => s.toLowerCase() !== skill.toLowerCase()));
                                } else if (draftSkillList.length < 30) {
                                  setDraftSkillList(prev => [...prev, skill]);
                                }
                              }}
                              style={{
                                backgroundColor: selected ? '#bd9348' : '#faf8f3',
                                borderWidth: 1,
                                borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.4)',
                                borderRadius: 24,
                                paddingHorizontal: 14,
                                paddingVertical: 8,
                              }}
                            >
                              <Text style={{ fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 13, color: selected ? 'white' : '#2d2d2d' }}>
                                {selected ? '✓ ' : ''}{skill}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              {/* Save bar */}
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: 'rgba(222,193,129,0.3)', padding: 20, paddingBottom: 32, flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => { setShowSkillPicker(false); setDraftSkillList(member.skills.map(s => s.description)); setSkillSearch(''); }}
                  style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#6b7280', textAlign: 'center' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={async () => { await saveSkillsOnly(); setShowSkillPicker(false); setSkillSearch(''); }}
                  disabled={savingSkills}
                  style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: savingSkills ? 0.6 : 1 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center' }}>
                    {savingSkills ? 'Saving...' : `Save ${draftSkillList.length} skill${draftSkillList.length !== 1 ? 's' : ''}`}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Wishes Sheet ── */}
          {showWishesSheet && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, zIndex: 10 }}>
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 12 }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: '#2d2d2d' }}>My Wishes 🌟</Text>
                <Pressable onPress={() => setShowWishesSheet(false)} style={{ padding: 6 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#9ca3af' }}>Close</Text>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', marginBottom: 16, lineHeight: 18 }}>
                  Private wishes are just for you. Share with the HIVE when you're ready — someone might know exactly how to help.
                </Text>
                {wishesLoading ? (
                  <ActivityIndicator size="small" color="#bd9348" style={{ marginVertical: 20 }} />
                ) : (
                  <>
                    {myWishes.map(wish => (
                      <View key={wish.id} style={{
                        backgroundColor: wish.status === 'public' ? '#fffbf0' : '#faf8f3',
                        borderWidth: 1,
                        borderColor: wish.status === 'public' ? 'rgba(222,193,129,0.5)' : 'rgba(200,190,170,0.3)',
                        borderRadius: 16, padding: 16, marginBottom: 12,
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: wish.status === 'public' ? '#22c55e' : '#d1d5db', marginRight: 8 }} />
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: wish.status === 'public' ? '#16a34a' : '#9ca3af' }}>
                            {wish.status === 'public' ? 'Shared with the HIVE' : 'Private'}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', lineHeight: 21, marginBottom: 12 }}>
                          {wish.description}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {wish.status === 'private' ? (
                            <Pressable
                              onPress={() => publishWish(wish.id)}
                              disabled={wishActionLoading === wish.id}
                              style={{ backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, opacity: wishActionLoading === wish.id ? 0.5 : 1 }}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: 'white' }}>Share with HIVE</Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => makeWishPrivate(wish.id)}
                              disabled={wishActionLoading === wish.id}
                              style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, opacity: wishActionLoading === wish.id ? 0.5 : 1 }}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#6b7280' }}>Make private</Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => refineWithClive(wish.description)}
                            style={{ backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>Refine with Clive ✨</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => deleteWish(wish.id)}
                            style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}
                          >
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#ef4444' }}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                    {myWishes.length === 0 && !addingWish && (
                      <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 24, alignItems: 'center' }}>
                        <Text style={{ fontSize: 32, marginBottom: 10 }}>🌟</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 6 }}>No wishes yet</Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 18 }}>
                          Add something below, or chat with Clive to discover what you really want.
                        </Text>
                      </View>
                    )}
                    {addingWish && (
                      <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16, marginBottom: 12 }}>
                        <TextInput
                          value={newWishInput}
                          onChangeText={setNewWishInput}
                          placeholder="Describe what you're wishing for..."
                          placeholderTextColor="#b5ad9f"
                          multiline
                          autoFocus
                          style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', minHeight: 80, textAlignVertical: 'top', marginBottom: 10 }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable onPress={() => { setAddingWish(false); setNewWishInput(''); }} style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 10 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#6b7280', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                          <Pressable onPress={saveNewWish} disabled={!newWishInput.trim()} style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center', fontSize: 13 }}>Save as private</Text>
                          </Pressable>
                          <Pressable onPress={() => refineWithClive(newWishInput)} style={{ flex: 2, backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 10, paddingVertical: 10 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', textAlign: 'center', fontSize: 13 }}>Refine with Clive ✨</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
              {/* Add wish bar */}
              {!addingWish && (
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: 'rgba(222,193,129,0.3)', padding: 20, paddingBottom: 32 }}>
                  <Pressable
                    onPress={() => setAddingWish(true)}
                    style={{ backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>+ Add a wish</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

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
                {member.hiveTitle && (
                  <View style={{ backgroundColor: '#fffaf0', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(222,193,129,0.55)' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>{getHiveTitleIcon(member.hiveTitle)} {member.hiveTitle}</Text>
                  </View>
                )}
                {isCurrentUser && (
                  <View style={{ backgroundColor: '#fffaf0', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>You</Text>
                  </View>
                )}
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

            {/* Current user quick-action bar — three equal cards */}
            {isCurrentUser && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                <Pressable
                  onPress={() => setEditing(e => !e)}
                  style={{ flex: 1, backgroundColor: '#faf8f3', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 3 }}
                >
                  <Text style={{ fontSize: 20 }}>✏️</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#2d2d2d', textAlign: 'center' }}>My Profile</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>Edit info</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowWishesSheet(true)}
                  style={{ flex: 1, backgroundColor: '#fdf3dc', borderWidth: 1.5, borderColor: '#bd9348', borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 3 }}
                >
                  <Text style={{ fontSize: 20 }}>🌟</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', textAlign: 'center' }}>My Wishes</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: '#9a7a3a', textAlign: 'center' }}>
                    {myWishes.length > 0 ? `${myWishes.length} wish${myWishes.length !== 1 ? 'es' : ''}` : 'Add one'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => { setDraftSkillList(member.skills.map(s => s.description)); setShowSkillPicker(true); }}
                  style={{ flex: 1, backgroundColor: '#f5f3ee', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 3 }}
                >
                  <Text style={{ fontSize: 20 }}>⚡️</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#2d2d2d', textAlign: 'center' }}>My Skills</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>
                    {member.skills.length > 0 ? `${member.skills.length} skill${member.skills.length !== 1 ? 's' : ''}` : 'Add some'}
                  </Text>
                </Pressable>
              </View>
            )}

            {isCurrentUser && editing && (
              <View style={{ backgroundColor: '#fffaf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 18, padding: 16, marginBottom: 20 }}>
                {(
                  <>
                    <ProfilePromptInput
                      label="Name"
                      placeholder="Your name"
                      value={draftName}
                      onChangeText={setDraftName}
                      maxLength={PROFILE_PROMPT_LIMITS.name}
                    />
                    <ProfilePromptInput
                      label="Title / what you do"
                      placeholder="Writer, artist, founder, coach..."
                      value={draftOccupation}
                      onChangeText={setDraftOccupation}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Birthday"
                      placeholder="MM-DD-YYYY"
                      value={draftBirthday}
                      onChangeText={setDraftBirthday}
                      maxLength={10}
                    />
                    <ProfilePromptInput
                      label="Tiny bio"
                      placeholder="A few sentences about who you are..."
                      value={draftBio}
                      onChangeText={setDraftBio}
                      maxLength={PROFILE_PROMPT_LIMITS.bio}
                      multiline
                    />
                    <ProfilePromptInput
                      label="Current project"
                      placeholder="What are you building, learning, or exploring?"
                      value={draftCurrentProject}
                      onChangeText={setDraftCurrentProject}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Ask me about"
                      placeholder="What should HIVE members come to you for?"
                      value={draftKnownFor}
                      onChangeText={setDraftKnownFor}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Hometown"
                      placeholder="Where are you from?"
                      value={draftHometown}
                      onChangeText={setDraftHometown}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Favorite book"
                      placeholder="A book you love or always recommend"
                      value={draftFavBook}
                      onChangeText={setDraftFavBook}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Favorite food"
                      placeholder="Comfort meal, snack, restaurant, anything"
                      value={draftFavFood}
                      onChangeText={setDraftFavFood}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Favorite hobby"
                      placeholder="What do you do when you feel most like yourself?"
                      value={draftFavHobby}
                      onChangeText={setDraftFavHobby}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Fun fact 1"
                      placeholder="Something delightful or unexpected"
                      value={draftFunFact1}
                      onChangeText={setDraftFunFact1}
                      maxLength={PROFILE_PROMPT_LIMITS.funFact}
                    />
                    <ProfilePromptInput
                      label="Fun fact 2"
                      placeholder="Optional"
                      value={draftFunFact2}
                      onChangeText={setDraftFunFact2}
                      maxLength={PROFILE_PROMPT_LIMITS.funFact}
                    />
                    <ProfilePromptInput
                      label="Fun fact 3"
                      placeholder="Optional"
                      value={draftFunFact3}
                      onChangeText={setDraftFunFact3}
                      maxLength={PROFILE_PROMPT_LIMITS.funFact}
                    />
                    {/* Skill bubble chip editor */}
                    <View style={{ marginBottom: 14 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a8173', marginBottom: 8 }}>Skills & what I'm good at</Text>
                      {draftSkillList.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                          {draftSkillList.map((skill, i) => (
                            <Pressable
                              key={i}
                              onPress={() => setDraftSkillList(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 24, paddingHorizontal: 12, paddingVertical: 7 }}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#2d2d2d', marginRight: 5 }}>{skill}</Text>
                              <Text style={{ fontSize: 15, color: '#bd9348', lineHeight: 18 }}>×</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TextInput
                          value={newSkillInput}
                          onChangeText={setNewSkillInput}
                          onSubmitEditing={addSkillChip}
                          placeholder="Add a skill..."
                          placeholderTextColor="#b5ad9f"
                          returnKeyType="done"
                          style={{ flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 12, color: '#2d2d2d', fontFamily: 'Lato_400Regular', fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 }}
                        />
                        <Pressable onPress={addSkillChip} style={{ backgroundColor: '#bd9348', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: 'white' }}>+ Add</Text>
                        </Pressable>
                      </View>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#b5a898', marginTop: 6 }}>
                        Tap any bubble to remove it. Up to 30 skills.
                      </Text>
                    </View>

                    {/* Go deeper toggle */}
                    <Pressable
                      onPress={() => setShowDeeper(v => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: showDeeper ? '#fdf3dc' : '#f5f3ee', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: showDeeper ? 12 : 16 }}
                    >
                      <View>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>Want to go deeper? 🐝</Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060', marginTop: 2 }}>A few more questions for the curious ones</Text>
                      </View>
                      <Text style={{ fontSize: 16, color: '#bd9348' }}>{showDeeper ? '▲' : '▼'}</Text>
                    </Pressable>

                    {showDeeper && (
                      <View style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.35)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#2d2d2d', marginBottom: 4 }}>
                          Deeper prompts are the next layer.
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18, color: '#6b7280' }}>
                          For now, use fun facts, favorites, skills, and wishes here. Once we choose the best deeper questions, we can make them permanent saved fields too.
                        </Text>
                      </View>
                    )}

                    {saveError && (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#ef4444', marginBottom: 10 }}>{saveError}</Text>
                    )}

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Pressable
                        disabled={saving}
                        onPress={() => setEditing(false)}
                        style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 12, paddingVertical: 12, opacity: saving ? 0.55 : 1 }}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', textAlign: 'center' }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        disabled={saving}
                        onPress={saveProfilePrompts}
                        style={{ flex: 1, backgroundColor: '#bd9348', borderRadius: 12, paddingVertical: 12, opacity: saving ? 0.55 : 1 }}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center' }}>
                          {saving ? 'Saving...' : 'Save'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}

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

            {/* Skills — inline editable for current user */}
            {(member.skills.length > 0 || isCurrentUser) && (
              <View style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6 }}>SKILLS</Text>
                  {isCurrentUser && (
                    <Pressable
                      onPress={() => { setDraftSkillList(member.skills.map(s => s.description)); setShowSkillPicker(true); }}
                      style={{ backgroundColor: '#fdf3dc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>Edit skills</Text>
                    </Pressable>
                  )}
                </View>

                {false ? null : (
                  /* View mode */
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {member.skills.length === 0 && isCurrentUser ? (
                      <Pressable
                        onPress={() => setEditingSkills(true)}
                        style={{ backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 9, borderStyle: 'dashed' }}
                      >
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#bd9348' }}>+ Add your skills</Text>
                      </Pressable>
                    ) : (
                      member.skills.map((s) => {
                        const len = s.description.length;
                        const size = len <= 12 ? 'large' : len <= 22 ? 'medium' : 'small';
                        const st = {
                          large:  { px: 18, py: 10, fontSize: 15, bg: '#fdf3dc', border: 'rgba(222,193,129,0.5)' },
                          medium: { px: 14, py: 8,  fontSize: 13, bg: '#faf8f3', border: 'rgba(222,193,129,0.3)' },
                          small:  { px: 10, py: 6,  fontSize: 11, bg: '#f5f3ee', border: 'rgba(200,190,170,0.3)' },
                        }[size];
                        return (
                          <View key={s.id} style={{ backgroundColor: st.bg, borderWidth: 1, borderColor: st.border, borderRadius: 24, paddingHorizontal: st.px, paddingVertical: st.py }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: st.fontSize, color: '#2d2d2d' }}>{s.description}</Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
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
                    {visibleIntro}
                  </Text>
                  {introNeedsToggle && (
                    <Pressable
                      onPress={() => setIntroExpanded(value => !value)}
                      style={{ alignSelf: 'flex-start', backgroundColor: '#fffaf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>
                        {introExpanded ? 'Show less' : 'Read full intro'}
                      </Text>
                    </Pressable>
                  )}
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

            {/* Wishes management — current user only */}
            {isCurrentUser && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6 }}>MY WISHES</Text>
                  <Pressable
                    onPress={() => setAddingWish(true)}
                    style={{ backgroundColor: '#fdf3dc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>+ New Wish</Text>
                  </Pressable>
                </View>

                {wishesLoading ? (
                  <ActivityIndicator size="small" color="#bd9348" style={{ marginVertical: 12 }} />
                ) : (
                  <>
                    {myWishes.map(wish => (
                      <View key={wish.id} style={{ backgroundColor: wish.status === 'public' ? '#fffbf0' : '#faf8f3', borderWidth: 1, borderColor: wish.status === 'public' ? 'rgba(222,193,129,0.4)' : 'rgba(200,190,170,0.3)', borderRadius: 14, padding: 14, marginBottom: 10 }}>
                        {/* Status badge */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: wish.status === 'public' ? '#22c55e' : '#9ca3af', marginRight: 7 }} />
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: wish.status === 'public' ? '#16a34a' : '#9ca3af' }}>
                            {wish.status === 'public' ? 'Shared with the HIVE' : 'Private'}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', lineHeight: 20, marginBottom: 10 }}>
                          {wish.description}
                        </Text>
                        {/* Actions */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {wish.status === 'private' && (
                            <Pressable
                              onPress={() => publishWish(wish.id)}
                              disabled={wishActionLoading === wish.id}
                              style={{ backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: wishActionLoading === wish.id ? 0.5 : 1 }}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: 'white' }}>Share with HIVE</Text>
                            </Pressable>
                          )}
                          {wish.status === 'public' && (
                            <Pressable
                              onPress={() => makeWishPrivate(wish.id)}
                              disabled={wishActionLoading === wish.id}
                              style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, opacity: wishActionLoading === wish.id ? 0.5 : 1 }}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#6b7280' }}>Make private</Text>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => refineWithClive(wish.description)}
                            style={{ backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>Refine with Clive ✨</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => deleteWish(wish.id)}
                            style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                          >
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#ef4444' }}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {myWishes.length === 0 && !addingWish && (
                      <View style={{ backgroundColor: '#faf8f3', borderRadius: 14, padding: 16, alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                          No wishes yet.{'\n'}Tap "+ New Wish" to add your first one, or chat with Clive to discover what you really want.
                        </Text>
                      </View>
                    )}

                    {/* Inline new wish composer */}
                    {addingWish && (
                      <View style={{ backgroundColor: '#fffbf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 14, padding: 14 }}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#2d2d2d', marginBottom: 8 }}>New wish</Text>
                        <TextInput
                          value={newWishInput}
                          onChangeText={setNewWishInput}
                          placeholder="What do you wish for? Describe it as specifically as you can..."
                          placeholderTextColor="#b5ad9f"
                          multiline
                          style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 10, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 12, paddingVertical: 10, minHeight: 80, marginBottom: 10, textAlignVertical: 'top' }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => { setAddingWish(false); setNewWishInput(''); }}
                            style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 10 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#6b7280', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={saveNewWish}
                            disabled={!newWishInput.trim()}
                            style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center', fontSize: 13 }}>Save as private</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => refineWithClive(newWishInput)}
                            style={{ flex: 2, backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 10, paddingVertical: 10 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', textAlign: 'center', fontSize: 13 }}>Refine with Clive ✨</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            <Pressable onPress={onClose} style={{ backgroundColor: '#faf8f3', borderRadius: 14, paddingVertical: 14, marginTop: 4 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Close</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function MembersScreen() {
  const { communityId, profile, session } = useAuth();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { width } = useWindowDimensions();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemberData | null>(null);
  const [search, setSearch] = useState('');
  const currentUserId = profile?.id ?? session?.user?.id ?? null;

  const loadMembers = useCallback(async (isRefresh = false) => {
    if (!communityId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);

      const { data: memberships, error: membErr } = await supabase
        .from('community_memberships')
        .select('user_id, role')
        .eq('community_id', communityId);

      if (membErr || !memberships) {
        console.warn('[Members] memberships load failed', membErr);
        setError('Could not load members.');
        if (isRefresh) setRefreshing(false); else setLoading(false);
        return;
      }

      const userIds = memberships.map((m: any) => m.user_id).filter(Boolean);
      if (userIds.length === 0) {
        setMembers([]);
        if (isRefresh) setRefreshing(false); else setLoading(false);
        return;
      }

      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profilesErr || !profilesData) {
        console.warn('[Members] profiles load failed', profilesErr);
        setError('Could not load members.');
        if (isRefresh) setRefreshing(false); else setLoading(false);
        return;
      }

      const profilesById = new Map<string, any>();
      profilesData.forEach((p: any) => profilesById.set(p.id, p));

      const memberList: MemberData[] = memberships.map((m: any) => {
        const memberProfile = profilesById.get(m.user_id);
        return {
          id: m.user_id,
          name: memberProfile?.name ?? 'Unknown member',
          avatar_url: memberProfile?.avatar_url ?? null,
          role: (m.role ?? memberProfile?.role ?? 'member') as UserRole,
          hiveTitle: getHiveTitle(memberProfile?.name ?? ''),
          queen_bee_month: memberProfile?.queen_bee_month ?? null,
          birthday: memberProfile?.birthday ?? null,
          occupation: memberProfile?.occupation ?? null,
          bio: memberProfile?.bio ?? null,
          current_project: memberProfile?.current_project ?? null,
          hometown: memberProfile?.hometown ?? null,
          favorite_book: memberProfile?.favorite_book ?? null,
          favorite_food: memberProfile?.favorite_food ?? null,
          favorite_hobby: memberProfile?.favorite_hobby ?? null,
          known_for: memberProfile?.known_for ?? null,
          fun_facts: Array.isArray(memberProfile?.fun_facts) ? memberProfile.fun_facts : null,
          skills: [],
          wishes: [],
          introPost: null,
          questionAnswerCount: 0,
        };
      });

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

      if (skillsRes.error) console.warn('[Members] skills load failed', skillsRes.error);
      if (wishesRes.error) console.warn('[Members] wishes load failed', wishesRes.error);
      if (introRes.error) console.warn('[Members] intro posts load failed', introRes.error);
      if (answersRes.error) console.warn('[Members] daily answers load failed', answersRes.error);

      const skillsByUser = new Map<string, MemberSkill[]>();
      (skillsRes.data ?? []).forEach((s: any) => {
        if (!skillsByUser.has(s.user_id)) skillsByUser.set(s.user_id, []);
        skillsByUser.get(s.user_id)!.push({ id: s.id, description: s.description });
      });

      const wishesByUser = new Map<string, MemberWish[]>();
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
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        const aCabinetRank = getHiveTitleRank(a.hiveTitle);
        const bCabinetRank = getHiveTitleRank(b.hiveTitle);
        if (aCabinetRank !== bCabinetRank) return aCabinetRank - bCabinetRank;
        return a.name.localeCompare(b.name);
      });

      setMembers(memberList);
      if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [communityId, currentUserId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Auto-open member detail when navigated here with a memberId param
  useEffect(() => {
    if (memberId && members.length > 0 && !selected) {
      const target = members.find(m => m.id === memberId);
      if (target) setSelected(target);
    }
  }, [memberId, members, selected]);

  const numCols = width >= 1100 ? 3 : width >= 720 ? 2 : 1;
  const avatarSize = width >= 768 ? 74 : 64;
  const cellWidth = `${100 / numCols}%`;
  const filtered = search.trim()
    ? members.filter(m => {
        const query = search.toLowerCase();
        return [
          m.name,
          m.hiveTitle,
          m.occupation,
          m.bio,
          m.current_project,
          m.hometown,
          m.known_for,
          m.favorite_book,
          m.favorite_food,
          m.favorite_hobby,
          ...m.skills.map(s => s.description),
          ...m.wishes.map(w => w.description),
        ].some(value => value?.toLowerCase().includes(query));
      })
    : members;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#faf8f3' }}>
      {/* Header */}
      <View style={{ backgroundColor: '#bd9348', paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 16, color: '#ffffff' }}>Members</Text>
        {!loading && members.length > 0 && (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            {members.length} members · search roles, skills, wishes, birthdays, and stories
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
              placeholder="Search members, skills, wishes..."
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

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMembers(true)} tintColor="#bd9348" />}
      >
        {loading ? (
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <ActivityIndicator size="large" color="#bd9348" />
          </View>
        ) : error ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontFamily: 'Lato_400Regular', color: '#ef4444', textAlign: 'center' }}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
              {filtered.map(member => {
                const isMe = member.id === currentUserId;
                const roleLabel = member.hiveTitle ?? ROLE_LABELS[member.role];
                const publicWishes = member.wishes.filter(w => w.status === 'public');
                const spotlight = member.known_for || member.current_project || member.bio || member.skills[0]?.description || publicWishes[0]?.description;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setSelected(member)}
                    style={{ width: cellWidth as any, paddingHorizontal: 6, marginBottom: 12 }}
                  >
                    <View style={{
                      backgroundColor: '#fffaf0',
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.55)',
                      borderRadius: 18,
                      padding: 14,
                      minHeight: 174,
                      shadowColor: '#000',
                      shadowOpacity: 0.08,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 2,
                    }}>
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <View style={{
                          borderRadius: (avatarSize + 8) / 2,
                          borderWidth: isMe ? 2.5 : 1.5,
                          borderColor: isMe ? '#bd9348' : 'rgba(222,193,129,0.7)',
                          padding: 3,
                          backgroundColor: 'white',
                        }}>
                          <Avatar uri={member.avatar_url} name={member.name} size={avatarSize} />
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 16, color: '#2d2d2d', lineHeight: 21 }} numberOfLines={2}>
                            {isMe ? `${member.name.split(' ')[0]} (you)` : member.name}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: roleLabel ? '#bd9348' : '#8a8173', marginTop: 3 }} numberOfLines={1}>
                            {member.hiveTitle ? `${getHiveTitleIcon(member.hiveTitle)} ${member.hiveTitle}` : roleLabel ?? member.occupation ?? 'HIVE member'}
                          </Text>
                          {member.birthday && (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#8a8173', marginTop: 3 }} numberOfLines={1}>
                              Birthday: {new Date(`${member.birthday}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </Text>
                          )}
                        </View>
                      </View>

                      {spotlight && (
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#4b5563', lineHeight: 19, marginTop: 12 }} numberOfLines={3}>
                          {spotlight}
                        </Text>
                      )}

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                        {member.skills.slice(0, 2).map(skill => (
                          <View key={skill.id} style={{ backgroundColor: '#f5ead1', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#8a6a2f' }} numberOfLines={1}>
                              {skill.description}
                            </Text>
                          </View>
                        ))}
                        {publicWishes.length > 0 && (
                          <View style={{ backgroundColor: '#f5ead1', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#8a6a2f' }}>
                              {publicWishes.length} wish{publicWishes.length === 1 ? '' : 'es'}
                            </Text>
                          </View>
                        )}
                        {member.questionAnswerCount > 0 && (
                          <View style={{ backgroundColor: '#f5ead1', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#8a6a2f' }}>
                              {member.questionAnswerCount} answers
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>

      {selected && (
        <MemberDetailModal
          member={selected}
          communityId={communityId}
          onClose={() => setSelected(null)}
          onMemberUpdated={(updatedMember) => {
            setSelected(updatedMember);
            setMembers(current => current.map(member => member.id === updatedMember.id ? updatedMember : member));
          }}
        />
      )}
    </SafeAreaView>
  );
}

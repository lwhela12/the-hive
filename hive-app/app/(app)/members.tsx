import { type ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, useWindowDimensions, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Skill, UserRole, Wish } from '../../types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { useChatRooms } from '../../lib/hooks/useChatRooms';
import { isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import { SKILL_CATEGORIES } from '../../lib/skillsList';
import { DAILY_QUESTIONS } from '../../lib/dailyQuestions';
import { notifyWishMentions } from '../../lib/wishMentions';
import { matchesMemberSearchText } from '../../lib/memberAliases';
import { setStoredItem } from '../../lib/webStorage';
import { SkillBubbleGarden } from '../../components/profile/SkillBubbleGarden';
import { ProfileHoneycombCluster } from '../../components/profile/ProfileHoneycombCluster';
import { BeeProgressArc } from '../../components/profile/BeeProgressArc';
import { MentionSuggestions } from '../../components/ui/MentionSuggestions';
import { LinkifiedText } from '../../components/ui/LinkifiedText';

type MemberSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;
type MemberWish = Pick<Wish, 'id' | 'description' | 'status'> & Partial<Wish>;

interface MemberData {
  id: string;
  name: string;
  avatar_url?: string | null;
  role: UserRole;
  queen_bee_month?: string | null;
  occupation?: string | null;
  profile_title?: string | null;
  bio?: string | null;
  current_project?: string | null;
  hometown?: string | null;
  favorite_book?: string | null;
  favorite_food?: string | null;
  favorite_hobby?: string | null;
  known_for?: string | null;
  miq_experiences?: string | null;
  miq_growth?: string | null;
  miq_contribution?: string | null;
  fun_facts?: string[] | null;
  birthday?: string | null;
  skills: MemberSkill[];
  wishes: MemberWish[];
  introPost?: { title: string; content: string } | null;
  questionAnswerCount: number;
  dailyAnswers: MemberDailyAnswer[];
  dailyMatchPercent?: number;
  dailyMatchSharedCount?: number;
  dailyMatchSimilarCount?: number;
}

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin: 'Admin access',
  treasurer: 'Treasurer access',
};

const memberHoneycombCell = require('../../assets/generated/member-honeycomb-cell.png');
const memberHoneycombCellMe = require('../../assets/generated/member-honeycomb-cell-me.png');

const PROFILE_PROMPT_LIMITS = {
  name: 80,
  bio: 1000,
  short: 180,
  funFact: 220,
  skills: 700,
};

type DailyAnswerRow = {
  user_id: string;
  question_index: number;
  question_date: string;
  answer: string;
  created_at?: string | null;
};

type MemberDailyAnswer = {
  questionIndex: number;
  questionDate: string;
  questionText: string;
  questionCategory: string;
  questionEmoji: string;
  answer: string;
  createdAt?: string | null;
};

type DailyMatchStats = {
  sharedCount: number;
  similarCount: number;
  score: number;
  percent: number;
};

type HoneycombPlacement = {
  item: MemberData;
  index: number;
  left: number;
  top: number;
};

type MemberViewMode = 'directory' | 'swarm';

const ANSWER_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'for', 'i', 'im', 'in', 'is',
  'it', 'me', 'my', 'of', 'on', 'or', 'so', 'that', 'the', 'to', 'was', 'with',
  'would', 'you',
]);

function answerWords(answer: string) {
  return new Set(
    answer
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !ANSWER_STOP_WORDS.has(word))
  );
}

function answerSimilarity(a: string, b: string) {
  const wordsA = answerWords(a);
  const wordsB = answerWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  }

  let shared = 0;
  wordsA.forEach(word => {
    if (wordsB.has(word)) shared += 1;
  });

  return shared / Math.max(1, Math.min(wordsA.size, wordsB.size));
}

function buildDailyMatchStats(userId: string | null, answers: DailyAnswerRow[]) {
  const stats = new Map<string, DailyMatchStats>();
  if (!userId) return stats;

  const myAnswers = new Map<string, string>();
  answers.forEach(row => {
    if (row.user_id === userId && row.question_date && row.answer) {
      myAnswers.set(row.question_date, row.answer);
    }
  });

  answers.forEach(row => {
    if (row.user_id === userId || !row.question_date || !row.answer) return;
    const mine = myAnswers.get(row.question_date);
    if (!mine) return;

    const existing = stats.get(row.user_id) ?? {
      sharedCount: 0,
      similarCount: 0,
      score: 0,
      percent: 0,
    };
    const similarity = answerSimilarity(mine, row.answer);
    existing.sharedCount += 1;
    existing.score += similarity;
    if (similarity >= 0.24 || mine.trim().toLowerCase() === row.answer.trim().toLowerCase()) {
      existing.similarCount += 1;
    }
    stats.set(row.user_id, existing);
  });

  stats.forEach(match => {
    const averageSimilarity = match.score / Math.max(1, match.sharedCount);
    const overlapStrength = match.sharedCount / Math.max(1, myAnswers.size);
    match.percent = Math.round((overlapStrength * 0.45 + averageSimilarity * 0.55) * 100);
  });

  return stats;
}

function getDailyAnswerPrompt(questionIndex: number) {
  return DAILY_QUESTIONS[questionIndex] ?? {
    text: `Daily question ${questionIndex + 1}`,
    category: 'daily question',
    emoji: '✨',
  };
}

function formatDailyAnswerDate(value: string) {
  if (!value) return '';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildHoneycombPlacements(
  items: MemberData[],
  columns: number,
  cellWidth: number,
  cellHeight: number
): HoneycombPlacement[] {
  const stepX = cellWidth * 0.75;
  const stepY = cellHeight;
  const columnDrop = cellHeight / 2;

  return items.map((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);

    return {
      item,
      index,
      left: col * stepX,
      top: row * stepY + (col % 2 === 1 ? columnDrop : 0),
    };
  });
}

function HoneycombCardShell({
  children,
  isMe,
  height,
  width,
}: {
  children: ReactNode;
  isMe: boolean;
  height: number;
  width: number;
}) {
  const compact = width < 240;
  const horizontalPadding = compact ? Math.max(22, width * 0.14) : Math.max(34, width * 0.18);
  const topPadding = compact ? Math.max(16, height * 0.08) : Math.max(22, height * 0.09);
  const bottomPadding = compact ? Math.max(18, height * 0.09) : Math.max(24, height * 0.1);

  return (
    <View
      style={{
        width,
        height,
        position: 'relative',
        shadowOpacity: 0,
        elevation: 0,
      }}
    >
      <Image
        source={isMe ? memberHoneycombCellMe : memberHoneycombCell}
        contentFit="fill"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View style={{ flex: 1, paddingHorizontal: horizontalPadding, paddingTop: topPadding, paddingBottom: bottomPadding, position: 'relative' }}>
        {children}
      </View>
    </View>
  );
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
        accessibilityLabel={`${name} profile photo`}
      />
    );
  }
  return (
    <View accessible accessibilityLabel={`${name} profile placeholder`}>
      <SilhouetteAvatar size={size} />
    </View>
  );
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
  const currentAuthId = session?.user?.id ?? profile?.id ?? null;
  const isCurrentUser = !!currentAuthId && member.id === currentAuthId;
  const publicWishes = member.wishes.filter(w => w.status === 'public');
  const roleLabel = ROLE_LABELS[member.role];
  const { getOrCreateDMRoom } = useChatRooms(communityId ?? undefined, currentAuthId ?? undefined);
  const [introExpanded, setIntroExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeeper, setShowDeeper] = useState(false);
  const [draftName, setDraftName] = useState(member.name ?? '');
  const [draftOccupation, setDraftOccupation] = useState(member.occupation ?? '');
  const [draftProfileTitle, setDraftProfileTitle] = useState(member.profile_title ?? '');
  const [draftBirthday, setDraftBirthday] = useState(member.birthday ? isoToAmerican(member.birthday) : '');
  const [draftBio, setDraftBio] = useState(member.bio ?? '');
  const [draftCurrentProject, setDraftCurrentProject] = useState(member.current_project ?? '');
  const [draftHometown, setDraftHometown] = useState(member.hometown ?? '');
  const [draftKnownFor, setDraftKnownFor] = useState(member.known_for ?? '');
  const [draftMiqExperiences, setDraftMiqExperiences] = useState(member.miq_experiences ?? '');
  const [draftMiqGrowth, setDraftMiqGrowth] = useState(member.miq_growth ?? '');
  const [draftMiqContribution, setDraftMiqContribution] = useState(member.miq_contribution ?? '');
  const [draftFavBook, setDraftFavBook] = useState(member.favorite_book ?? '');
  const [draftFavFood, setDraftFavFood] = useState(member.favorite_food ?? '');
  const [draftFavHobby, setDraftFavHobby] = useState(member.favorite_hobby ?? '');
  const [draftFunFact1, setDraftFunFact1] = useState(member.fun_facts?.[0] ?? '');
  const [draftFunFact2, setDraftFunFact2] = useState(member.fun_facts?.[1] ?? '');
  const [draftFunFact3, setDraftFunFact3] = useState(member.fun_facts?.[2] ?? '');
  // Skill bubbles — array-based so we can add/remove individual chips
  const [draftSkillList, setDraftSkillList] = useState<string[]>(member.skills.map(s => s.description));
  const [newSkillInput, setNewSkillInput] = useState('');
  const [savingSkills, setSavingSkills] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [showWishesSheet, setShowWishesSheet] = useState(false);
  const [showDailyAnswersSheet, setShowDailyAnswersSheet] = useState(false);
  // Wishes management (for current user only)
  const [myWishes, setMyWishes] = useState<MemberWish[]>([]);
  const [wishesLoading, setWishesLoading] = useState(false);
  const [addingWish, setAddingWish] = useState(false);
  const [newWishInput, setNewWishInput] = useState('');
  const [wishActionLoading, setWishActionLoading] = useState<string | null>(null);
  const [startingMessage, setStartingMessage] = useState(false);
  const { members: mentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(communityId);
  const wishMentionInput = useMentionInput({
    value: newWishInput,
    onChangeText: setNewWishInput,
    members: mentionableMembers,
    currentUserId: currentAuthId ?? undefined,
  });

  const hasFavorites = member.favorite_book || member.favorite_food || member.favorite_hobby;
  const hasDetails = member.profile_title || member.bio || member.current_project || member.hometown || member.known_for || member.miq_experiences || member.miq_growth || member.miq_contribution || hasFavorites;
  const introContent = member.introPost?.content ?? '';
  const introNeedsToggle = introContent.length > 320;
  const visibleIntro = introExpanded || !introNeedsToggle
    ? introContent
    : `${introContent.slice(0, 320).trimEnd()}...`;
  const dailyAnswers = member.dailyAnswers ?? [];

  useEffect(() => {
    setIntroExpanded(false);
    setEditing(false);
    setSaveError(null);
    setShowDeeper(false);
    setDraftName(member.name ?? '');
    setDraftOccupation(member.occupation ?? '');
    setDraftProfileTitle(member.profile_title ?? '');
    setDraftBirthday(member.birthday ? isoToAmerican(member.birthday) : '');
    setDraftBio(member.bio ?? '');
    setDraftCurrentProject(member.current_project ?? '');
    setDraftHometown(member.hometown ?? '');
    setDraftKnownFor(member.known_for ?? '');
    setDraftMiqExperiences(member.miq_experiences ?? '');
    setDraftMiqGrowth(member.miq_growth ?? '');
    setDraftMiqContribution(member.miq_contribution ?? '');
    setDraftFavBook(member.favorite_book ?? '');
    setDraftFavFood(member.favorite_food ?? '');
    setDraftFavHobby(member.favorite_hobby ?? '');
    setDraftFunFact1(member.fun_facts?.[0] ?? '');
    setDraftFunFact2(member.fun_facts?.[1] ?? '');
    setDraftFunFact3(member.fun_facts?.[2] ?? '');
    setDraftSkillList(member.skills.map(s => s.description));
    setNewSkillInput('');
    setShowSkillPicker(false);
    setSkillSearch('');
    setShowWishesSheet(false);
    setShowDailyAnswersSheet(false);
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

  const cancelNewWish = () => {
    setAddingWish(false);
    setNewWishInput('');
    wishMentionInput.resetMentionSelection();
  };

  const saveNewWish = async (makePublic = false) => {
    const desc = newWishInput.trim();
    if (!desc || !communityId) return;
    const { data, error } = await (supabase as any)
      .from('wishes')
      .insert({ user_id: member.id, community_id: communityId, description: desc, raw_input: desc, status: makePublic ? 'public' : 'private', is_active: makePublic, extracted_from: 'manual' })
      .select('id, description, status')
      .single();
    if (error) {
      console.warn('[Members] wish save failed', error);
      return;
    }
    if (data) {
      setMyWishes(prev => [data, ...prev]);
      if (makePublic) {
        notifyWishMentions({
          wishId: data.id,
          senderId: currentAuthId ?? member.id,
          communityId,
          content: desc,
          members: mentionableMembers,
          wishOwnerName: member.name,
        });
      }
    }
    setNewWishInput('');
    wishMentionInput.resetMentionSelection();
    setAddingWish(false);
  };

  const refineWithClive = (description: string) => {
    router.push({ pathname: '/(app)', params: { refineWish: description } });
  };

  const startDirectMessage = async () => {
    if (isCurrentUser || startingMessage) return;
    if (!currentAuthId || !communityId) {
      Alert.alert('Could not open message', 'Please refresh HIVE and try again.');
      return;
    }
    setStartingMessage(true);
    try {
      const room = await getOrCreateDMRoom(member.id);
      if (!room) throw new Error('No DM room returned');
      setStoredItem(`the-hive:last-chat-room:${communityId}`, room.id);
      onClose();
      router.push({ pathname: '/messages', params: { roomId: room.id } });
    } catch (error) {
      console.warn('[Members] start DM failed', error);
      Alert.alert('Could not open message', 'Please try again from Messages.');
    } finally {
      setStartingMessage(false);
    }
  };

  const renderNewWishMentions = () => (
    <>
      <MentionSuggestions
        active={wishMentionInput.mentionQuery !== null}
        query={wishMentionInput.mentionQuery}
        loading={mentionMembersLoading}
        suggestions={wishMentionInput.mentionSuggestions}
        onSelect={wishMentionInput.selectMention}
      />
      {wishMentionInput.mentionedMembers.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 10 }}>
          {wishMentionInput.mentionedMembers.map(mentionedMember => (
            <View key={mentionedMember.id} style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#1d4ed8', fontSize: 11 }}>
                Tagged {mentionedMember.name.split(/\s+/)[0]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  );

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
        profile_title: draftProfileTitle.trim() || null,
        birthday: birthdayIso,
        bio: draftBio.trim() || null,
        current_project: draftCurrentProject.trim() || null,
        hometown: draftHometown.trim() || null,
        known_for: draftKnownFor.trim() || null,
        miq_experiences: draftMiqExperiences.trim() || null,
        miq_growth: draftMiqGrowth.trim() || null,
        miq_contribution: draftMiqContribution.trim() || null,
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

  // Profile richness score — how filled-out is this member's profile?
  const memberRichness = (() => {
    if (isCurrentUser) return null;
    let score = 0;
    if (member.profile_title || member.occupation) score++;
    if (member.bio) score++;
    if (member.current_project) score++;
    if (member.hometown) score++;
    if (member.known_for) score++;
    if ((member.fun_facts ?? []).filter(Boolean).length > 0) score++;
    if (member.skills.length > 0) score++;
    if (publicWishes.length > 0) score++;
    return Math.round((score / 8) * 100);
  })();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(event: any) => event.stopPropagation()}
          style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}
        >
          {/* Handle + close */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4, position: 'relative' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close member profile"
              style={{ position: 'absolute', right: 18, top: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ee' }}
            >
              <Ionicons name="close" size={20} color="#6b7280" />
            </Pressable>
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
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
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
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 120 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', marginBottom: 16, lineHeight: 18 }}>
                  Private wishes are just for you. Share with HIVE when you're ready — someone might know exactly how to help.
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
                            {wish.status === 'public' ? 'Shared with HIVE' : 'Private'}
                          </Text>
                        </View>
                        <LinkifiedText
                          style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', lineHeight: 21, marginBottom: 12 }}
                          mentionStyle={{ color: '#1d4ed8', backgroundColor: 'rgba(37,99,235,0.1)' }}
                        >
                          {wish.description}
                        </LinkifiedText>
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
                          onChangeText={wishMentionInput.textInputMentionProps.onChangeText}
                          onSelectionChange={wishMentionInput.textInputMentionProps.onSelectionChange}
                          selection={wishMentionInput.textInputMentionProps.selection}
                          placeholder="Describe what you're wishing for..."
                          placeholderTextColor="#b5ad9f"
                          multiline
                          autoFocus
                          style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', minHeight: 80, textAlignVertical: 'top', marginBottom: 10 }}
                        />
                        {renderNewWishMentions()}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <Pressable onPress={cancelNewWish} style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 10 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#6b7280', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                          <Pressable onPress={() => saveNewWish(false)} disabled={!newWishInput.trim()} style={{ flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(189,147,72,0.5)', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', textAlign: 'center', fontSize: 13 }}>Keep private</Text>
                          </Pressable>
                          <Pressable onPress={() => saveNewWish(true)} disabled={!newWishInput.trim()} style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center', fontSize: 13 }}>Share with HIVE 🐝</Text>
                          </Pressable>
                        </View>
                        <Pressable onPress={() => refineWithClive(newWishInput)} disabled={!newWishInput.trim()} style={{ alignItems: 'center', paddingVertical: 6, opacity: newWishInput.trim() ? 1 : 0.4 }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', fontSize: 13 }}>Refine with Clive ✨</Text>
                        </Pressable>
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

          {/* ── Daily Answers Sheet ── */}
          {showDailyAnswersSheet && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, zIndex: 12 }}>
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 12 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: '#2d2d2d' }}>
                    {member.name.split(' ')[0]}'s Daily Answers
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    {dailyAnswers.length} question{dailyAnswers.length !== 1 ? 's' : ''} answered
                  </Text>
                </View>
                <Pressable onPress={() => setShowDailyAnswersSheet(false)} style={{ padding: 6 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#9ca3af' }}>Close</Text>
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
                {dailyAnswers.length === 0 ? (
                  <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 22, alignItems: 'center' }}>
                    <Text style={{ fontSize: 26, marginBottom: 8 }}>✨</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 19 }}>
                      No daily answers to peek at yet.
                    </Text>
                  </View>
                ) : (
                  dailyAnswers.map(answer => (
                    <View
                      key={`${answer.questionDate}-${answer.questionIndex}`}
                      style={{
                        backgroundColor: '#fffbf0',
                        borderWidth: 1,
                        borderColor: 'rgba(222,193,129,0.45)',
                        borderRadius: 18,
                        padding: 16,
                        marginBottom: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 16 }}>{answer.questionEmoji}</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {answer.questionCategory}
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#b5a898' }}>
                          {formatDailyAnswerDate(answer.questionDate)}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 14, lineHeight: 21, color: '#2d2d2d', marginBottom: 10 }}>
                        {answer.questionText}
                      </Text>
                      <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(222,193,129,0.25)' }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#4b5563' }}>
                          {answer.answer}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>
            {/* Header */}
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 16 }}>
              {/* Avatar — wrapped in BeeProgressArc for other members */}
              {!isCurrentUser && memberRichness !== null ? (
                <View style={{ alignItems: 'center' }}>
                  <BeeProgressArc profileCompletionPercent={memberRichness} size={200} />
                  <View style={{ marginTop: -34, alignItems: 'center', zIndex: 1 }}>
                    <View style={{ borderRadius: 50, borderWidth: 2.5, borderColor: '#dec181', padding: 3, backgroundColor: 'white', shadowColor: '#bd9348', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                      <Avatar uri={member.avatar_url} name={member.name} size={84} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ borderRadius: 56, borderWidth: 2, borderColor: '#dec181', padding: 3, marginBottom: 12, marginTop: 12, shadowColor: '#bd9348', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
                  <Avatar uri={member.avatar_url} name={member.name} size={100} />
                </View>
              )}
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginTop: 6 }}>{member.name}</Text>
              {(member.profile_title || member.occupation) && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#6b7280', marginTop: 3 }}>{member.profile_title || member.occupation}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
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
              {!isCurrentUser && (
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 14, width: '100%' }}>
                  <Pressable
                    onPress={startDirectMessage}
                    disabled={startingMessage}
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${member.name}`}
                    style={{
                      backgroundColor: '#bd9348',
                      borderRadius: 999,
                      paddingVertical: 8,
                      paddingHorizontal: 22,
                      minWidth: 148,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      opacity: startingMessage ? 0.6 : 1,
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="white" />
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: 'white' }}>
                      {startingMessage ? 'Opening...' : 'Message'}
                    </Text>
                  </Pressable>
                </View>
              )}
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
                      label="Self-appointed title"
                      placeholder="Founder, Tarot Reader, Spreadsheet Sorcerer..."
                      value={draftProfileTitle}
                      onChangeText={setDraftProfileTitle}
                      maxLength={PROFILE_PROMPT_LIMITS.short}
                    />
                    <ProfilePromptInput
                      label="Work / day job"
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
                      label="3MIQ: Experiences"
                      placeholder="What experiences would make life feel rich?"
                      value={draftMiqExperiences}
                      onChangeText={setDraftMiqExperiences}
                      maxLength={PROFILE_PROMPT_LIMITS.bio}
                      multiline
                    />
                    <ProfilePromptInput
                      label="3MIQ: Growth"
                      placeholder="Who do you want to become?"
                      value={draftMiqGrowth}
                      onChangeText={setDraftMiqGrowth}
                      maxLength={PROFILE_PROMPT_LIMITS.bio}
                      multiline
                    />
                    <ProfilePromptInput
                      label="3MIQ: Contribution"
                      placeholder="How do you want to help, serve, or create?"
                      value={draftMiqContribution}
                      onChangeText={setDraftMiqContribution}
                      maxLength={PROFILE_PROMPT_LIMITS.bio}
                      multiline
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

            {/* ── Profile Honeycomb — visual snapshot, shown before bio ── */}
            <ProfileHoneycombCluster
              size="compact"
              showEmptyCells
              items={[
                { label: 'Title', value: member.profile_title || member.occupation },
                { label: 'From', value: member.hometown },
                { label: 'Birthday', value: member.birthday ? new Date(`${member.birthday}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : null },
                { label: 'Project', value: member.current_project },
                { label: 'Book', value: member.favorite_book },
                { label: 'Food', value: member.favorite_food },
                { label: 'Hobby', value: member.favorite_hobby },
                ...(member.fun_facts ?? []).map((fact, i) => ({
                  label: `Fun Fact ${i + 1}`,
                  value: fact,
                })),
              ]}
            />

            {/* Skills Garden */}
            {(member.skills.length > 0 || isCurrentUser) && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6 }}>
                      SKILLS GARDEN 🌸
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#b5a898', marginTop: 2 }}>
                      {member.skills.filter(s => Number(s.enthusiasm_level ?? 0) > 0).length} skill flowers blooming
                    </Text>
                  </View>
                  {isCurrentUser && (
                    <Pressable
                      onPress={() => { setDraftSkillList(member.skills.map(s => s.description)); setShowSkillPicker(true); }}
                      style={{ backgroundColor: '#fdf3dc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>Edit</Text>
                    </Pressable>
                  )}
                </View>

                {member.skills.length === 0 && isCurrentUser ? (
                  <Pressable
                    onPress={() => {
                      setDraftSkillList(member.skills.map(s => s.description));
                      setShowSkillPicker(true);
                    }}
                    style={{ backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 9, borderStyle: 'dashed', alignSelf: 'flex-start' }}
                  >
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#bd9348' }}>+ Seed your Skills Garden 🌱</Text>
                  </Pressable>
                ) : member.skills.length === 0 ? (
                  <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>🌱</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                      No skills planted yet — garden coming soon!
                    </Text>
                  </View>
                ) : (
                  <SkillBubbleGarden skills={member.skills} />
                )}
              </View>
            )}

            {/* ── Bio ── */}
            {member.bio && (
              <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4b5563', lineHeight: 22 }}>
                  {member.bio}
                </Text>
              </View>
            )}

            {/* Ask me about */}
            {member.known_for && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 6 }}>ASK ME ABOUT</Text>
                <Text style={{ fontFamily: 'LibreBaskerville_400Regular', fontSize: 15, color: '#2d2d2d', fontStyle: 'italic', lineHeight: 22 }}>"{member.known_for}"</Text>
              </View>
            )}

            {(member.miq_experiences || member.miq_growth || member.miq_contribution) && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 10 }}>3 MOST IMPORTANT QUESTIONS</Text>
                <View style={{ backgroundColor: '#faf8f3', borderRadius: 16, padding: 16 }}>
                  <InfoRow label="Experiences" value={member.miq_experiences} />
                  <InfoRow label="Growth" value={member.miq_growth} />
                  <InfoRow label="Contribution" value={member.miq_contribution} />
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
              <Pressable
                onPress={() => setShowDailyAnswersSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={`View ${member.name}'s daily question answers`}
                style={{ marginBottom: 20, alignItems: 'center', backgroundColor: '#faf8f3', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(222,193,129,0.28)' }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 22, color: '#bd9348' }}>{member.questionAnswerCount}</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>daily questions answered</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>Read Q&A</Text>
                  <Ionicons name="chevron-forward" size={12} color="#bd9348" />
                </View>
              </Pressable>
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
                            {wish.status === 'public' ? 'Shared with HIVE' : 'Private'}
                          </Text>
                        </View>
                        <LinkifiedText
                          style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', lineHeight: 20, marginBottom: 10 }}
                          mentionStyle={{ color: '#1d4ed8', backgroundColor: 'rgba(37,99,235,0.1)' }}
                        >
                          {wish.description}
                        </LinkifiedText>
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
                          onChangeText={wishMentionInput.textInputMentionProps.onChangeText}
                          onSelectionChange={wishMentionInput.textInputMentionProps.onSelectionChange}
                          selection={wishMentionInput.textInputMentionProps.selection}
                          placeholder="What do you wish for? Describe it as specifically as you can..."
                          placeholderTextColor="#b5ad9f"
                          multiline
                          style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 10, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 12, paddingVertical: 10, minHeight: 80, marginBottom: 10, textAlignVertical: 'top' }}
                        />
                        {renderNewWishMentions()}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <Pressable
                            onPress={cancelNewWish}
                            style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 10 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#6b7280', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => saveNewWish(false)}
                            disabled={!newWishInput.trim()}
                            style={{ flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(189,147,72,0.5)', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', textAlign: 'center', fontSize: 13 }}>Keep private</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => saveNewWish(true)}
                            disabled={!newWishInput.trim()}
                            style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center', fontSize: 13 }}>Share with HIVE 🐝</Text>
                          </Pressable>
                        </View>
                        <Pressable
                          onPress={() => refineWithClive(newWishInput)}
                          disabled={!newWishInput.trim()}
                          style={{ alignItems: 'center', paddingVertical: 6, opacity: newWishInput.trim() ? 1 : 0.4 }}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', fontSize: 13 }}>Refine with Clive ✨</Text>
                        </Pressable>
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemberData | null>(null);
  const [search, setSearch] = useState('');
  const [memberViewMode, setMemberViewMode] = useState<MemberViewMode>('directory');
  const currentUserId = session?.user?.id ?? profile?.id ?? null;

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
          queen_bee_month: memberProfile?.queen_bee_month ?? null,
          birthday: memberProfile?.birthday ?? null,
          occupation: memberProfile?.occupation ?? null,
          profile_title: memberProfile?.profile_title ?? null,
          bio: memberProfile?.bio ?? null,
          current_project: memberProfile?.current_project ?? null,
          hometown: memberProfile?.hometown ?? null,
          favorite_book: memberProfile?.favorite_book ?? null,
          favorite_food: memberProfile?.favorite_food ?? null,
          favorite_hobby: memberProfile?.favorite_hobby ?? null,
          known_for: memberProfile?.known_for ?? null,
          miq_experiences: memberProfile?.miq_experiences ?? null,
          miq_growth: memberProfile?.miq_growth ?? null,
          miq_contribution: memberProfile?.miq_contribution ?? null,
          fun_facts: Array.isArray(memberProfile?.fun_facts) ? memberProfile.fun_facts : null,
          skills: [],
          wishes: [],
          introPost: null,
          questionAnswerCount: 0,
          dailyAnswers: [],
        };
      });

      const [skillsRes, wishesRes, introRes, answersRes] = await Promise.all([
        supabase
          .from('skills')
          .select('user_id, id, description, enthusiasm_level, display_x, display_y')
          .eq('community_id', communityId)
          .in('user_id', userIds),
        supabase
          .from('wishes')
          .select('user_id, id, description, status')
          .eq('community_id', communityId)
          .in('user_id', userIds)
          .eq('status', 'public'),
        supabase
          .from('board_posts')
          .select('author_id, title, content, board_categories!inner(category_type)')
          .eq('community_id', communityId)
          .eq('board_categories.category_type', 'introductions')
          .in('author_id', userIds),
        supabase
          .from('daily_question_answers')
          .select('user_id, question_index, question_date, answer, created_at')
          .eq('community_id', communityId)
          .in('user_id', userIds),
      ]);

      if (skillsRes.error) console.warn('[Members] skills load failed', skillsRes.error);
      if (wishesRes.error) console.warn('[Members] wishes load failed', wishesRes.error);
      if (introRes.error) console.warn('[Members] intro posts load failed', introRes.error);
      if (answersRes.error) console.warn('[Members] daily answers load failed', answersRes.error);

      const skillsByUser = new Map<string, MemberSkill[]>();
      (skillsRes.data ?? []).forEach((s: any) => {
        if (!skillsByUser.has(s.user_id)) skillsByUser.set(s.user_id, []);
        skillsByUser.get(s.user_id)!.push({
          id: s.id,
          description: s.description,
          enthusiasm_level: s.enthusiasm_level,
          display_x: s.display_x,
          display_y: s.display_y,
        });
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

      const answersByUser = new Map<string, MemberDailyAnswer[]>();
      (answersRes.data ?? []).forEach((a: any) => {
        if (!a.user_id) return;
        const questionIndex = Number(a.question_index ?? 0);
        const question = getDailyAnswerPrompt(questionIndex);
        if (!answersByUser.has(a.user_id)) answersByUser.set(a.user_id, []);
        answersByUser.get(a.user_id)!.push({
          questionIndex,
          questionDate: a.question_date,
          questionText: question.text,
          questionCategory: question.category,
          questionEmoji: question.emoji,
          answer: a.answer,
          createdAt: a.created_at,
        });
      });
      answersByUser.forEach(answers => {
        answers.sort((a, b) => {
          const dateDiff = (b.questionDate ?? '').localeCompare(a.questionDate ?? '');
          if (dateDiff !== 0) return dateDiff;
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
        });
      });
      const dailyMatches = buildDailyMatchStats(currentUserId, (answersRes.data ?? []) as DailyAnswerRow[]);

      memberList.forEach(m => {
        m.skills = skillsByUser.get(m.id) ?? [];
        m.wishes = wishesByUser.get(m.id) ?? [];
        m.introPost = introByUser.get(m.id) ?? null;
        m.dailyAnswers = answersByUser.get(m.id) ?? [];
        m.questionAnswerCount = m.dailyAnswers.length;
        const match = dailyMatches.get(m.id);
        if (match && match.sharedCount > 0) {
          m.dailyMatchPercent = match.percent;
          m.dailyMatchSharedCount = match.sharedCount;
          m.dailyMatchSimilarCount = match.similarCount;
        }
      });

      memberList.sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return a.name.localeCompare(b.name);
      });

      setMembers(memberList);
      if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [communityId, currentUserId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const openMemberProfile = useCallback((member: MemberData, isCurrentUser: boolean) => {
    if (isCurrentUser) {
      setSelected(null);
      router.push('/profile');
      return;
    }

    setSelected(member);
  }, [router]);

  // Auto-open member detail when navigated here with a memberId param
  useEffect(() => {
    if (memberId && members.length > 0 && !selected) {
      const target = members.find(m => m.id === memberId);
      if (!target) return;

      if (target.id === currentUserId) {
        router.replace('/profile');
        return;
      }

      setSelected(target);
    }
  }, [currentUserId, memberId, members, router, selected]);

  useEffect(() => {
    if (selected && currentUserId && selected.id === currentUserId) {
      setSelected(null);
      router.replace('/profile');
    }
  }, [currentUserId, router, selected]);

  const filtered = useMemo(() => {
    if (!search.trim()) return members;
    return members.filter(m => {
      return matchesMemberSearchText([
        m.name,
        m.role,
        ROLE_LABELS[m.role],
        m.profile_title,
        m.occupation,
        m.bio,
        m.current_project,
        m.hometown,
        m.known_for,
        m.miq_experiences,
        m.miq_growth,
        m.miq_contribution,
        m.favorite_book,
        m.favorite_food,
        m.favorite_hobby,
        ...m.skills.map(s => s.description),
        ...m.wishes.map(w => w.description),
      ], search);
    });
  }, [members, search]);
  const matchedMemberCount = filtered.filter(member =>
    member.id !== currentUserId &&
    typeof member.dailyMatchPercent === 'number' &&
    (member.dailyMatchSharedCount ?? 0) > 0
  ).length;
  const visibleMembers = useMemo(() => {
    if (memberViewMode === 'directory') return filtered;

    return [...filtered].sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;

      const aHasMatch = typeof a.dailyMatchPercent === 'number' && (a.dailyMatchSharedCount ?? 0) > 0;
      const bHasMatch = typeof b.dailyMatchPercent === 'number' && (b.dailyMatchSharedCount ?? 0) > 0;

      if (aHasMatch !== bHasMatch) return aHasMatch ? -1 : 1;
      if (aHasMatch && bHasMatch) {
        const percentDiff = (b.dailyMatchPercent ?? 0) - (a.dailyMatchPercent ?? 0);
        if (percentDiff !== 0) return percentDiff;
        const sharedDiff = (b.dailyMatchSharedCount ?? 0) - (a.dailyMatchSharedCount ?? 0);
        if (sharedDiff !== 0) return sharedDiff;
      }

      return a.name.localeCompare(b.name);
    });
  }, [currentUserId, filtered, memberViewMode]);
  const desiredHoneycombColumns = width >= 1500 ? 5 : width >= 1120 ? 4 : width >= 760 ? 3 : width >= 360 ? 2 : 1;
  const honeycombColumns = Math.max(1, Math.min(desiredHoneycombColumns, Math.max(1, visibleMembers.length)));
  const honeycombOuterGutter = width < 520 ? 12 : 32;
  const honeycombMaxWidth = Math.max(280, Math.min(width - honeycombOuterGutter, 1680));
  const honeycombCellWidth = honeycombColumns === 1
    ? Math.min(honeycombMaxWidth, 360)
    : Math.min(320, honeycombMaxWidth / (1 + 0.75 * (honeycombColumns - 1)));
  const honeycombCardHeight = Math.round(honeycombCellWidth * 0.866);
  const honeycombStepX = honeycombCellWidth * 0.75;
  const honeycombGridWidth = honeycombCellWidth + honeycombStepX * (honeycombColumns - 1);
  const honeycombPlacements = buildHoneycombPlacements(visibleMembers, honeycombColumns, honeycombCellWidth, honeycombCardHeight);
  const honeycombGridHeight = honeycombPlacements.length === 0
    ? 0
    : Math.max(...honeycombPlacements.map(placement => placement.top + honeycombCardHeight));
  const isCompactHoneycomb = honeycombCellWidth < 240;
  const honeycombAvatarSize = isCompactHoneycomb ? 42 : honeycombCellWidth < 300 ? 50 : 56;
  const honeycombNameFontSize = isCompactHoneycomb ? 12 : honeycombCellWidth < 300 ? 13.5 : 14.5;
  const honeycombNameLineHeight = isCompactHoneycomb ? 16 : honeycombCellWidth < 300 ? 18 : 19;
  const honeycombTextMaxWidth = Math.max(96, honeycombCellWidth - (isCompactHoneycomb ? 64 : 96));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#faf8f3' }} edges={['top']}>
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
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'center',
              backgroundColor: 'rgba(255,255,255,0.78)',
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.45)',
              padding: 3,
              marginTop: 10,
              gap: 3,
            }}
          >
            {([
              { mode: 'directory' as const, label: 'Directory' },
              { mode: 'swarm' as const, label: "Today's Swarm" },
            ]).map(option => {
              const active = memberViewMode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  onPress={() => setMemberViewMode(option.mode)}
                  style={{
                    borderRadius: 999,
                    backgroundColor: active ? '#bd9348' : 'transparent',
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    minWidth: width < 420 ? 108 : 128,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Lato_700Bold',
                      fontSize: 12,
                      color: active ? '#fffdf7' : '#8f7b55',
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {memberViewMode === 'swarm' && matchedMemberCount > 0 && (
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 10,
                color: '#9a8060',
                textAlign: 'center',
                marginTop: 6,
                letterSpacing: 0.2,
              }}
            >
              {matchedMemberCount} match{matchedMemberCount === 1 ? '' : 'es'} today
            </Text>
          )}
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
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View
                style={{
                  width: honeycombGridWidth,
                  height: honeycombGridHeight,
                  position: 'relative',
                }}
              >
                  {honeycombPlacements.map(({ item: member, index, left, top }) => {
                    const isMe = member.id === currentUserId;
                    const titleLine = member.profile_title || member.occupation;
                    const publicWishes = member.wishes.filter(w => w.status === 'public');
                    const spotlight = member.known_for || publicWishes[0]?.description || member.current_project || member.miq_experiences || member.skills[0]?.description || member.bio;
                    const spotlightLabel = member.known_for
                      ? 'Ask me about'
                      : publicWishes[0]?.description === spotlight
                        ? 'Wishing for'
                        : member.current_project
                          ? 'Building'
                          : member.miq_experiences
                            ? '3MIQ'
                            : member.skills[0]?.description === spotlight
                              ? 'Skill'
                              : 'Profile note';
                    const hasDailyMatch = !isMe && typeof member.dailyMatchPercent === 'number' && (member.dailyMatchSharedCount ?? 0) > 0;
                    const matchBadgeLeft = Math.round(
                      honeycombCellWidth / 2 + honeycombAvatarSize * (isCompactHoneycomb ? 0.2 : 0.3)
                    );
                    const matchBadgeTop = Math.round(honeycombCardHeight * (isCompactHoneycomb ? 0.11 : 0.12));
                    const wishChip = `${publicWishes.length} wish${publicWishes.length === 1 ? '' : 'es'}`;
                    const sharedAnswerCount = hasDailyMatch ? member.dailyMatchSharedCount ?? 0 : 0;
                    const connectionChip = sharedAnswerCount > 0
                      ? isCompactHoneycomb
                        ? `${sharedAnswerCount} shared`
                        : `${sharedAnswerCount} shared answer${sharedAnswerCount === 1 ? '' : 's'}`
                      : isCompactHoneycomb
                        ? '0 shared'
                        : '0 shared answers';
                    const visibleChips = [wishChip, connectionChip];
                    return (
                      <Pressable
                        key={member.id}
                        onPress={() => openMemberProfile(member, isMe)}
                        style={{
                          position: 'absolute',
                          left,
                          top,
                          width: honeycombCellWidth,
                          alignItems: 'center',
                          zIndex: isMe ? visibleMembers.length + 10 : visibleMembers.length - index,
                        }}
                      >
                        <HoneycombCardShell isMe={isMe} height={honeycombCardHeight} width={honeycombCellWidth}>
                          {hasDailyMatch && (
                            <View
                              accessible
                              accessibilityLabel={`${member.dailyMatchPercent}% daily question match with ${member.name}`}
                              style={{
                                position: 'absolute',
                                top: matchBadgeTop,
                                left: matchBadgeLeft,
                                backgroundColor: 'rgba(255,247,221,0.95)',
                                borderWidth: 1.25,
                                borderColor: 'rgba(189,147,72,0.46)',
                                borderRadius: 999,
                                paddingHorizontal: isCompactHoneycomb ? 6 : 8,
                                paddingVertical: isCompactHoneycomb ? 3 : 4,
                                alignItems: 'center',
                                minWidth: isCompactHoneycomb ? 42 : 50,
                                shadowColor: '#bd9348',
                                shadowOpacity: 0.16,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 3 },
                                zIndex: 5,
                              }}
                            >
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isCompactHoneycomb ? 10 : 11, color: '#bd9348', lineHeight: isCompactHoneycomb ? 12 : 13 }}>
                                {member.dailyMatchPercent}%
                              </Text>
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isCompactHoneycomb ? 7 : 8, color: '#9a8060', textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: isCompactHoneycomb ? 8 : 10 }}>
                                match
                              </Text>
                            </View>
                          )}
                          <View style={{ alignItems: 'center' }}>
                            <View style={{
                              borderRadius: (honeycombAvatarSize + 8) / 2,
                              borderWidth: isMe ? 2.5 : isCompactHoneycomb ? 1.25 : 1.5,
                              borderColor: isMe ? '#bd9348' : 'rgba(222,193,129,0.7)',
                              padding: isCompactHoneycomb ? 2 : 3,
                              backgroundColor: 'white',
                              shadowColor: '#bd9348',
                              shadowOpacity: 0.14,
                              shadowRadius: 10,
                              shadowOffset: { width: 0, height: 4 },
                            }}>
                              <Avatar uri={member.avatar_url} name={member.name} size={honeycombAvatarSize} />
                            </View>

                            <View style={{ minWidth: 0, alignItems: 'center', marginTop: isCompactHoneycomb ? 6 : 8, maxWidth: honeycombTextMaxWidth }}>
                              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: honeycombNameFontSize, color: '#2d2d2d', lineHeight: honeycombNameLineHeight, textAlign: 'center' }} numberOfLines={2}>
                                {isMe ? `${member.name.split(' ')[0]} (you)` : member.name}
                              </Text>
                              {titleLine && (
                                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isCompactHoneycomb ? 8.5 : 10, color: '#bd9348', marginTop: isCompactHoneycomb ? 2 : 3, textAlign: 'center' }} numberOfLines={1}>
                                  {titleLine}
                                </Text>
                              )}
                              {member.birthday && !isCompactHoneycomb && (
                                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10, color: '#8a8173', marginTop: 2, textAlign: 'center' }} numberOfLines={1}>
                                  Birthday: {new Date(`${member.birthday}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </Text>
                              )}
                            </View>
                          </View>

                          {spotlight && !isCompactHoneycomb && (
                            <View style={{ marginTop: 8, alignItems: 'center', maxWidth: honeycombTextMaxWidth }}>
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 8.5, color: '#bd9348', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 }} numberOfLines={1}>
                                {spotlightLabel}
                              </Text>
                              <Text style={{ fontFamily: member.known_for ? 'LibreBaskerville_400Regular' : 'Lato_400Regular', fontSize: member.known_for ? 10.8 : 10.5, color: '#4b5563', lineHeight: 14.5, textAlign: 'center', fontStyle: member.known_for ? 'italic' : 'normal' }} numberOfLines={2}>
                                {spotlight}
                              </Text>
                            </View>
                          )}

                          {visibleChips.length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isCompactHoneycomb ? 4 : 5, marginTop: isCompactHoneycomb ? 7 : 9, justifyContent: 'center' }}>
                              {visibleChips.slice(0, isCompactHoneycomb ? 1 : 2).map(chip => (
                                <View key={chip} style={{ backgroundColor: 'rgba(245,234,209,0.86)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }}>
                                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isCompactHoneycomb ? 8 : 9, color: '#8a6a2f' }} numberOfLines={1}>
                                    {chip}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </HoneycombCardShell>
                      </Pressable>
                    );
                  })}
              </View>
            </View>
          </>
        )}

      </ScrollView>

      {selected && selected.id !== currentUserId && (
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

import { type ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, useWindowDimensions, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Profile, Skill, UserRole, Wish, WishGranter } from '../../types';
import { supabase } from '../../lib/supabase';
import { invalidateWishQueries } from '../../lib/queryClient';
import { deleteWishById } from '../../lib/wishMutations';
import { useAuth } from '../../lib/hooks/useAuth';
import { usePageSkin } from '../../lib/pageSkin';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { AppHeader } from '../../components/navigation';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { EditButton } from '../../components/ui/EditButton';
import { FIELD_LOOK } from '../../components/ui/Input';

const memberHoneycombCell = require('../../assets/generated/member-honeycomb-cell.png');
const memberHoneycombCellMe = require('../../assets/generated/member-honeycomb-cell-me.png');
import { useChatRooms } from '../../lib/hooks/useChatRooms';
import { isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import { SKILL_CATEGORIES } from '../../lib/skillsList';
import { DAILY_QUESTIONS, deckForCommunity } from '../../lib/dailyQuestions';
import type { DailyQuestion } from '../../lib/dailyQuestions';
import { notifyWishMentions } from '../../lib/wishMentions';
import { matchesMemberSearchText } from '../../lib/memberAliases';
import { getStoredItem, setStoredItem } from '../../lib/webStorage';
import { SkillBubbleGarden } from '../../components/profile/SkillBubbleGarden';
import { ProfileShowcase } from '../../components/profile/ProfileShowcase';
import { BeeProgressArc } from '../../components/profile/BeeProgressArc';
import { WishCombCard } from '../../components/profile/WishCombCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { WishManageModal } from '../../components/wishes/WishManageModal';
import { HeaderTabs } from '../../components/ui/HeaderTabs';
import { getHdWishTabLabel, pickSpotlightWish, type HdWishTabKey } from '../../lib/wishDisplay';
import { useWishes } from '../../lib/hooks/useWishes';

import { ComposerBar } from '../../components/ui/ComposerBar';
import { showAlert } from '../../lib/showAlert';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
type MemberSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;
type MemberWish = Pick<Wish, 'id' | 'description' | 'status'> & Partial<Wish> & {
  granters?: (WishGranter & { granter?: Profile })[];
};
type WishStatusTabKey = HdWishTabKey;

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
  currently_reading?: string | null;
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


// `short` was 180 and `funFact` 220 — about a sentence and a half, which cut
// people off mid-answer on prompts like "what should HIVErs ask me about".
// Nat has already said once that a cap was too tight, so both grew. Everywhere
// these land on the profile card clamps with numberOfLines, so a long answer
// makes a longer read rather than a broken layout.
const PROFILE_PROMPT_LIMITS = {
  name: 80,
  bio: 1000,
  short: 300,
  funFact: 300,
  skills: 700,
};

const PROFILE_EMPTY_COPY = {
  knownFor: 'Not shared yet.',
  bio: 'No bio shared yet.',
  miq: '3MIQ answers are not shared yet.',
  wishes: 'No HD wishes shared yet.',
  skills: 'No skills planted yet — garden coming soon!',
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

type MemberSortKey = 'first-name' | 'next-birthday' | 'best-match' | 'most-wishes';

const MEMBER_SORT_OPTIONS: { key: MemberSortKey; label: string }[] = [
  { key: 'first-name', label: 'First name' },
  { key: 'next-birthday', label: 'Next birthday' },
  { key: 'best-match', label: 'Best match' },
  { key: 'most-wishes', label: 'Most wishes' },
];

function normalizeMemberSort(value: string | null): MemberSortKey {
  return MEMBER_SORT_OPTIONS.some(option => option.key === value)
    ? (value as MemberSortKey)
    : 'first-name';
}

function memberFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Birthdays are month/day — compute days until the next occurrence from today.
// Returns null when there is no parseable birthday so those members sort last.
function daysUntilNextBirthday(birthday?: string | null): number | null {
  if (!birthday) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthday);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!month || !day) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Feb 29 rolls to Mar 1 in non-leap years, which is close enough for ordering.
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next.getTime() < startOfToday.getTime()) {
    next = new Date(now.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - startOfToday.getTime()) / 86400000);
}

function countPublicMemberWishes(member: MemberData) {
  return member.wishes.filter(w => w.status === 'public' && w.is_active !== false).length;
}

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

function normalizeProfileStoryText(value?: string | null) {
  return (value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function getDailyAnswerPrompt(questionIndex: number, deck: DailyQuestion[] = DAILY_QUESTIONS) {
  return deck[questionIndex] ?? {
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

  // The original comb artwork — its tessellation geometry is baked into the
  // PNG and the placement math is tuned to it. A code-drawn brand re-skin was
  // tried 2026-07-23 and reverted (cells didn't interlock); if we try again,
  // reproduce the PNG's exact overlap geometry FIRST, then change materials.
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

/**
 * One profile question. Every answer here is words a member writes about
 * themselves, so it is the shared composer with the mic on the text's own line
 * — the same box they get in Clive and on the boards.
 *
 * `structured` is the exception: a birthday is typed as MM-DD-YYYY and nobody
 * dictates a date, so it keeps a plain field and only borrows the family's
 * cream fill, hairline and placeholder ink.
 */
function ProfilePromptInput({
  label,
  placeholder,
  value,
  onChangeText,
  multiline = false,
  maxLength = PROFILE_PROMPT_LIMITS.short,
  structured = false,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  structured?: boolean;
  keyboardType?: 'default' | 'numbers-and-punctuation';
}) {
  if (!structured) {
    return (
      <ComposerBar
        variant="form"
        containerClassName="mb-3"
        label={label}
        value={value}
        // The composer hands back either a string or an updater (dictation has
        // to read what is already in the box to append to it); this call site
        // only knows about strings, so resolve it here.
        onChangeText={(next) => onChangeText(typeof next === 'function' ? next(value) : next)}
        placeholder={placeholder}
        multiline={multiline}
        minHeight={multiline ? 92 : 44}
        maxLength={maxLength}
        counter="count"
      />
    );
  }

  const countColor = value.length > maxLength * 0.9 ? '#bd9348' : '#a09274';
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
        placeholderTextColor={FIELD_LOOK.placeholder}
        selectionColor={FIELD_LOOK.ink}
        maxLength={maxLength}
        keyboardType={keyboardType}
        textAlignVertical="center"
        // The one field look, read from the one place it is written down, so a
        // birthday cannot drift away from the prose boxes it sits between.
        style={{
          backgroundColor: FIELD_LOOK.fill,
          borderWidth: 1,
          borderColor: FIELD_LOOK.border,
          borderRadius: FIELD_LOOK.radius,
          color: FIELD_LOOK.ink,
          fontFamily: FIELD_LOOK.font,
          fontSize: FIELD_LOOK.fontSize,
          minHeight: 44,
          paddingHorizontal: FIELD_LOOK.paddingHorizontal,
          paddingVertical: FIELD_LOOK.paddingVertical,
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
  initialShowAnswers = false,
}: {
  member: MemberData;
  onClose: () => void;
  onMemberUpdated: (member: MemberData) => void;
  communityId: string | null;
  /** Open straight onto the Daily Answers sheet (comb chip deep link). */
  initialShowAnswers?: boolean;
}) {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const { profile, session, communityRole } = useAuth();
  const { grantWish } = useWishes();
  const currentAuthId = session?.user?.id ?? profile?.id ?? null;
  const isCurrentUser = !!currentAuthId && member.id === currentAuthId;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const canManageMemberWishes = isCurrentUser || isAdmin;
  const isPhoneProfile = viewportWidth < 640;
  const currentWishes = member.wishes.filter(w => w.status === 'public' && w.is_active !== false);
  const grantedWishes = member.wishes.filter(w => w.status === 'fulfilled');
  const allVisibleMemberWishes = [...currentWishes, ...grantedWishes].sort((a, b) => (
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  ));
  const memberWishPanelHeight = isPhoneProfile ? 500 : 520;
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
  const [selectedWish, setSelectedWish] = useState<(Wish & { user: Profile }) | null>(null);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [wishStatusTab, setWishStatusTab] = useState<WishStatusTabKey>('public');
  const [managingWish, setManagingWish] = useState<MemberWish | null>(null);
  // Wishes management (for current user only)
  const [myWishes, setMyWishes] = useState<MemberWish[]>([]);
  const [wishesLoading, setWishesLoading] = useState(false);
  const [addingWish, setAddingWish] = useState(false);
  const [newWishInput, setNewWishInput] = useState('');
  const [startingMessage, setStartingMessage] = useState(false);
  // Tagging with "@" used to be wired up by hand here. ComposerBar carries it
  // now — it tracks the "@", draws the suggestion list and the "Tagged Nat"
  // pills itself — so the composers below only have to hand it the members.
  const { members: mentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(communityId);

  const introContent = member.introPost?.content ?? '';
  const hasProfileBio = !!normalizeProfileStoryText(member.bio);
  const normalizedIntroContent = normalizeProfileStoryText(introContent);
  const showIntroPost = !!member.introPost && !!normalizedIntroContent && !hasProfileBio;
  const introNeedsToggle = introContent.length > 320;
  const visibleIntro = introExpanded || !introNeedsToggle
    ? introContent
    : `${introContent.slice(0, 320).trimEnd()}...`;
  const visibleMemberWishes = wishStatusTab === 'granted' ? grantedWishes : currentWishes;
  const myPublicWishes = myWishes.filter(w => w.status === 'public' && w.is_active !== false);
  const myGrantedWishes = myWishes.filter(w => w.status === 'fulfilled');
  const visibleMyWishes = wishStatusTab === 'granted' ? myGrantedWishes : myPublicWishes;
  const dailyAnswers = member.dailyAnswers ?? [];
  const memberHoneycombItems = [
    { label: 'Title', value: member.profile_title || member.occupation },
    { label: 'From', value: member.hometown },
    {
      label: 'Birthday',
      value: member.birthday
        ? new Date(`${member.birthday}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
        : null,
    },
    { label: 'Project', value: member.current_project },
    // From their monthly check-in, so it's current rather than aspirational.
    { label: 'Reading', value: member.currently_reading },
    { label: 'Book', value: member.favorite_book },
    { label: 'Food', value: member.favorite_food },
    { label: 'Hobby', value: member.favorite_hobby },
    ...(member.fun_facts ?? []).map((fact, i) => ({
      label: `Fun Fact ${i + 1}`,
      value: fact,
    })),
  ];

  useEffect(() => {
    setIntroExpanded(false);
    setEditing(false);
    setSaveError(null);
    setShowDeeper(false);
    setShowDailyAnswersSheet(initialShowAnswers);
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
    setSelectedWish(null);
    setWishToGrant(null);
    setEditingWish(null);
    setManagingWish(null);
    setWishStatusTab('public');
    setMyWishes(isCurrentUser ? allVisibleMemberWishes : []);
  }, [member]);

  // Fetch current user's own visible wishes when modal opens. Seed from
  // member.wishes first so this section never blanks out if the refresh query
  // hits an older schema while Home/member cards already have the rows.
  useEffect(() => {
    if (!isCurrentUser || !communityId) return;
    setWishesLoading(true);
    setMyWishes(allVisibleMemberWishes);

    const fetchVisibleWishes = async () => {
      let { data, error } = await (supabase as any)
        .from('wishes')
        .select('id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(*))')
        .eq('user_id', member.id)
        .eq('community_id', communityId)
        .in('status', ['public', 'fulfilled'])
        .order('created_at', { ascending: false });

      if (error && String(error.message ?? '').includes('title')) {
        const fallback = await (supabase as any)
          .from('wishes')
          .select('id, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(*))')
          .eq('user_id', member.id)
          .eq('community_id', communityId)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        data = (fallback.data ?? []).map((wish: any) => ({ ...wish, title: null }));
        error = fallback.error;
      }

      if (
        error &&
        (String(error.message ?? '').includes('wish_granters') ||
          String(error.message ?? '').includes('granter') ||
          String(error.message ?? '').includes('relationship') ||
          String(error.message ?? '').includes('schema cache'))
      ) {
        const fallback = await (supabase as any)
          .from('wishes')
          .select('id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
          .eq('user_id', member.id)
          .eq('community_id', communityId)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }

      if (error && String(error.message ?? '').includes('title')) {
        const fallback = await (supabase as any)
          .from('wishes')
          .select('id, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
          .eq('user_id', member.id)
          .eq('community_id', communityId)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        data = (fallback.data ?? []).map((wish: any) => ({ ...wish, title: null }));
        error = fallback.error;
      }

      if (error) {
        console.warn('[Members] my wishes refresh failed', error);
      } else if (data) {
        setMyWishes(data as MemberWish[]);
      }
      setWishesLoading(false);
    };

    void fetchVisibleWishes();
  }, [isCurrentUser, member.id, communityId]);

  const addSkillChip = () => {
    const trimmed = newSkillInput.trim();
    if (!trimmed) return;
    // At the cap this used to return without a word, so the Add button simply
    // stopped working and never said why.
    if (draftSkillList.length >= 30) {
      showAlert('That is a full set of skills', 'Skills are capped at 30. Remove one to make room for this.');
      return;
    }
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

  const normalizeMemberWish = (wish: MemberWish): Wish => ({
    ...wish,
    user_id: wish.user_id ?? member.id,
    community_id: wish.community_id ?? communityId ?? '',
    raw_input: wish.raw_input ?? wish.description,
    is_active: wish.is_active ?? wish.status === 'public',
    extracted_from: wish.extracted_from ?? 'manual',
    created_at: wish.created_at ?? new Date(0).toISOString(),
  } as Wish);

  const canGrantWish = (wish: MemberWish) => canManageMemberWishes && wish.status === 'public';
  const canEditWish = (wish: MemberWish) => canManageMemberWishes && wish.status !== 'fulfilled';
  const canArchiveWish = (wish: MemberWish) => (
    canManageMemberWishes && wish.status === 'public' && wish.is_active !== false
  );
  const canDeleteWish = (_wish: MemberWish) => canManageMemberWishes;
  const canRefineWish = (wish: MemberWish) => canManageMemberWishes && wish.status !== 'fulfilled';
  const canOpenWishActions = (wish: MemberWish) => (
    canGrantWish(wish) || canEditWish(wish) || canArchiveWish(wish) || canDeleteWish(wish) || canRefineWish(wish)
  );

  const applyMemberWishRows = (rows: MemberWish[]) => {
    const sortedRows = [...rows].sort((a, b) => (
      (b.created_at ?? '').localeCompare(a.created_at ?? '')
    ));
    if (isCurrentUser) setMyWishes(sortedRows);
    onMemberUpdated({ ...member, wishes: sortedRows });
  };

  const refreshManagedWishes = async () => {
    if (!communityId) return;

    let { data, error } = await (supabase as any)
      .from('wishes')
      .select('id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(*))')
      .eq('user_id', member.id)
      .eq('community_id', communityId)
      .in('status', ['public', 'fulfilled'])
      .order('created_at', { ascending: false });

    if (
      error &&
      (String(error.message ?? '').includes('wish_granters') ||
        String(error.message ?? '').includes('granter') ||
        String(error.message ?? '').includes('relationship') ||
        String(error.message ?? '').includes('schema cache'))
    ) {
      const fallback = await (supabase as any)
        .from('wishes')
        .select('id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
        .eq('user_id', member.id)
        .eq('community_id', communityId)
        .in('status', ['public', 'fulfilled'])
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error && String(error.message ?? '').includes('title')) {
      const fallback = await (supabase as any)
        .from('wishes')
        .select('id, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
        .eq('user_id', member.id)
        .eq('community_id', communityId)
        .in('status', ['public', 'fulfilled'])
        .order('created_at', { ascending: false });
      data = (fallback.data ?? []).map((wish: any) => ({ ...wish, title: null }));
      error = fallback.error;
    }

    if (error) {
      console.warn('[Members] managed wishes refresh failed', error);
      return;
    }

    applyMemberWishRows((data ?? []) as MemberWish[]);
  };

  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await refreshManagedWishes();
      setWishToGrant(null);
      if (selectedWish?.id === data.wishId) setSelectedWish(null);
    }
    return result;
  };

  const handleArchiveWish = (wish: MemberWish) => {
    if (!communityId || !canArchiveWish(wish)) return;

    const archiveWish = async () => {
      const { error } = await (supabase as any)
        .from('wishes')
        .update({ status: 'replaced', is_active: false, replaced_at: new Date().toISOString() })
        .eq('id', wish.id)
        .eq('user_id', member.id)
        .eq('community_id', communityId);

      if (error) {
        // Alert.alert does nothing on web, and nearly everybody is on web —
        // so this explanation used to be thrown away and the button just
        // looked broken.
        showAlert('Error', 'Failed to archive wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, member.id);
      await refreshManagedWishes();
      setManagingWish(null);
      if (selectedWish?.id === wish.id) setSelectedWish(null);
    };

    const message = `Archive this HD wish from Wishes?\n\n"${wish.description}"`;

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        archiveWish();
      }
      return;
    }

    Alert.alert('Archive HD Wish', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', onPress: archiveWish },
    ]);
  };

  const handleDeleteWish = (wish: MemberWish) => {
    if (!communityId || !canDeleteWish(wish)) return;

    const deleteWish = async () => {
      const { error } = await deleteWishById({
        wishId: wish.id,
        communityId,
        ownerId: member.id,
      });
      if (error) {
        showAlert('Error', 'Failed to delete wish. Please try again.');
        return;
      }
      await invalidateWishQueries(communityId, member.id);
      await refreshManagedWishes();
      setManagingWish(null);
      if (selectedWish?.id === wish.id) setSelectedWish(null);
    };

    const message = `Delete this wish?\n\n"${wish.description}"`;

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        deleteWish();
      }
      return;
    }

    Alert.alert('Delete Wish', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: deleteWish,
      },
    ]);
  };

  const handleWishSaved = async () => {
    await refreshManagedWishes();
    setEditingWish(null);
  };

  const cancelNewWish = () => {
    setAddingWish(false);
    setNewWishInput('');
  };

  const saveNewWish = async () => {
    const desc = newWishInput.trim();
    if (!desc || !communityId) return;
    const { data, error } = await (supabase as any)
      .from('wishes')
      .insert({ user_id: member.id, community_id: communityId, description: desc, raw_input: desc, status: 'public', is_active: true, extracted_from: 'manual' })
      .select('id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
      .single();
    if (error) {
      console.warn('[Members] wish save failed', error);
      return;
    }
    if (data) {
      setMyWishes(prev => [data, ...prev]);
      notifyWishMentions({
        wishId: data.id,
        senderId: currentAuthId ?? member.id,
        communityId,
        content: desc,
        members: mentionableMembers,
        wishOwnerName: member.name,
      });
      await invalidateWishQueries(communityId, member.id);
    }
    setNewWishInput('');
    setAddingWish(false);
    setWishStatusTab('public');
  };

  const refineWithClive = (description: string) => {
    router.push({ pathname: '/(app)', params: { refineWish: description } });
  };

  const startAddingWish = () => {
    setWishStatusTab('public');
    setAddingWish(true);
  };

  const openWishDetail = (wish: MemberWish) => {
    if (!communityId) return;

    setSelectedWish({
      ...normalizeMemberWish(wish),
      user: member as unknown as Profile,
    } as Wish & { user: Profile });
  };

  const startDirectMessage = async () => {
    if (startingMessage) return;
    if (isCurrentUser) {
      onClose();
      router.push('/messages');
      return;
    }
    if (!currentAuthId || !communityId) {
      showAlert('Could not open message', 'Please refresh HIVE and try again.');
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
      showAlert('Could not open message', 'Please try again from Messages.');
    } finally {
      setStartingMessage(false);
    }
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
    let score = 0;
    if (member.profile_title || member.occupation) score++;
    if (member.bio) score++;
    if (member.current_project) score++;
    if (member.hometown) score++;
    if (member.known_for) score++;
    if ((member.fun_facts ?? []).filter(Boolean).length > 0) score++;
    if (member.skills.length > 0) score++;
    if (currentWishes.length > 0) score++;
    return Math.round((score / 8) * 100);
  })();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close member profile backdrop"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
        <View
          style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', width: '100%', overflow: 'hidden', position: 'relative' }}
        >
          {/* Handle + close */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4, position: 'relative' }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>

          {selectedWish && (
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', zIndex: 30 }}>
              <WishDetail
                wish={selectedWish}
                onClose={() => setSelectedWish(null)}
                onGrant={handleGrantWish}
                canManage={canOpenWishActions(selectedWish)}
                onManage={() => {
                  const wish = selectedWish;
                  setSelectedWish(null);
                  setManagingWish(wish);
                }}
                onBeforeProfileNavigate={() => {
                  setSelectedWish(null);
                  onClose();
                }}
              />
            </View>
          )}

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
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#a09274' }}>Done picking</Text>
                  </Pressable>
                </View>
                {/* Selected count */}
                {draftSkillList.length > 0 && (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#bd9348', marginBottom: 8 }}>
                    {draftSkillList.length} selected · tap any to remove
                  </Text>
                )}
                {/* Search. Finding a word in a list is not writing one, so no
                    mic — but it wears the same fill, hairline and placeholder
                    ink as every other box in the app. It had a fill of its own
                    (#fffdf5, a shade nothing else uses) until 2026-08-05. */}
                <TextInput
                  value={skillSearch}
                  onChangeText={setSkillSearch}
                  placeholder="Search skills..."
                  placeholderTextColor={FIELD_LOOK.placeholder}
                  selectionColor={FIELD_LOOK.ink}
                  style={{
                    backgroundColor: FIELD_LOOK.fill,
                    borderWidth: 1,
                    borderColor: FIELD_LOOK.border,
                    borderRadius: FIELD_LOOK.radius,
                    paddingHorizontal: FIELD_LOOK.paddingHorizontal,
                    paddingVertical: FIELD_LOOK.paddingVertical,
                    fontFamily: FIELD_LOOK.font,
                    fontSize: FIELD_LOOK.fontSize,
                    color: FIELD_LOOK.ink,
                    marginBottom: 4,
                  }}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
                {/* Custom / type-your-own */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#a09274', letterSpacing: 0.7, marginBottom: 8 }}>✍️ TYPE YOUR OWN</Text>
                  {/* A skill is a phrase you write about yourself, so it is
                      words: the box, the mic and the Add button are one thing
                      now instead of a field with a button welded beside it. */}
                  <ComposerBar
                    variant="inlineEdit"
                    value={newSkillInput}
                    onChangeText={setNewSkillInput}
                    placeholder="Something unique to you..."
                    multiline={false}
                    onSubmit={addSkillChip}
                    submitLabel="+ Add"
                  />
                </View>

                {/* Category sections */}
                {SKILL_CATEGORIES.map(cat => {
                  const filtered = skillSearch.trim()
                    ? cat.skills.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase()))
                    : cat.skills;
                  if (filtered.length === 0) return null;
                  return (
                    <View key={cat.label} style={{ marginBottom: 20 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#a09274', letterSpacing: 0.7, marginBottom: 10 }}>
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
                                backgroundColor: selected ? '#bd9348' : '#fdf8ec',
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
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#8e7a5e', textAlign: 'center' }}>Cancel</Text>
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
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: '#2d2d2d' }}>My HD Wishes 🌟</Text>
                <Pressable onPress={() => setShowWishesSheet(false)} style={{ padding: 6 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#a09274' }}>Close</Text>
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
                <HeaderTabs
                  activeTab={wishStatusTab}
                  onChange={setWishStatusTab}
                  actionLabel="+ Wish"
                  onAction={startAddingWish}
                  compact={isPhoneProfile}
                  compactAction={false}
                  stretchTabs={false}
                  tabs={[
                    {
                      key: 'public',
                      label: getHdWishTabLabel('public'),
                      count: myPublicWishes.length,
                    },
                    {
                      key: 'granted',
                      label: getHdWishTabLabel('granted'),
                      count: myGrantedWishes.length,
                    },
                  ]}
                />

                {wishesLoading ? (
                  <View style={{
                    backgroundColor: '#fdf3dc',
                    borderRadius: 20,
                    borderTopLeftRadius: 0,
                    borderWidth: 1,
                    borderColor: 'rgba(222,193,129,0.7)',
                    height: memberWishPanelHeight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <ThinkingBee />
                  </View>
                ) : (
                  <>
                    <View style={{
                      backgroundColor: '#fdf3dc',
                      borderRadius: 20,
                      borderTopLeftRadius: 0,
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.7)',
                      shadowColor: '#bd9348',
                      shadowOpacity: 0.12,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 3,
                      height: memberWishPanelHeight,
                      overflow: 'hidden',
                    }}>
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={true}
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                          padding: 12,
                          paddingBottom: 12,
                          flexGrow: visibleMyWishes.length === 0 ? 1 : undefined,
                        }}
                      >
                        {visibleMyWishes.length === 0 ? (
                          <View style={{ backgroundColor: '#fffdf5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(222,193,129,0.32)' }}>
                            <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(45,45,45,0.48)', textAlign: 'center' }}>
                              {myWishes.length === 0
                                ? 'No HD wishes yet. Tap "+ Wish" to add your first one, or chat with Clive to discover what you really want.'
                                : wishStatusTab === 'granted'
                                  ? 'No granted HD wishes yet.'
                                  : 'No HD wishes yet.'}
                            </Text>
                          </View>
                        ) : (
                          visibleMyWishes.map(wish => (
                            <WishCombCard
                              key={wish.id}
                              wish={wish}
                              ownerId={member.id}
                              ownerName={member.name}
                              ownerAvatarUrl={member.avatar_url}
                              compact={isPhoneProfile}
                              onOpen={openWishDetail}
                              onManage={canOpenWishActions(wish) ? setManagingWish : undefined}
                            />
                          ))
                        )}
                      </ScrollView>
                    </View>

                    {addingWish && (
                      <View style={{ backgroundColor: '#fdf8ec', borderRadius: 16, padding: 16, marginTop: 12, marginBottom: 12 }}>
                        {/* A wish is prose, so it gets the shared box: mic on
                            the text's own line, "@" tagging built in. No
                            onSubmit — Enter still makes a new line here,
                            because the Add HD Wish button is right below. */}
                        <ComposerBar
                          variant="form"
                          containerClassName="mb-2.5"
                          value={newWishInput}
                          onChangeText={setNewWishInput}
                          placeholder="Describe what you're wishing for..."
                          minHeight={80}
                          autoFocus
                          mentionMembers={mentionableMembers}
                          mentionsLoading={mentionMembersLoading}
                          currentUserId={currentAuthId ?? undefined}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <Pressable onPress={cancelNewWish} style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 10 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#8e7a5e', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                          <Pressable onPress={saveNewWish} disabled={!newWishInput.trim()} style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center', fontSize: 13 }}>Add HD Wish</Text>
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
            </View>
          )}

          <WishManageModal
            visible={!!managingWish}
            wish={managingWish}
            onClose={() => setManagingWish(null)}
            canGrant={!!managingWish && canGrantWish(managingWish)}
            canEdit={!!managingWish && canEditWish(managingWish)}
            canArchive={!!managingWish && canArchiveWish(managingWish)}
            canDelete={!!managingWish && canDeleteWish(managingWish)}
            canRefine={!!managingWish && canRefineWish(managingWish)}
            onGrant={(wish) => {
              setWishToGrant({
                ...normalizeMemberWish(wish),
                user: member as unknown as Profile,
              });
            }}
            onEdit={(wish) => setEditingWish(normalizeMemberWish(wish))}
            onArchive={handleArchiveWish}
            onDelete={handleDeleteWish}
            onRefine={(wish) => refineWithClive(wish.description)}
          />

          {wishToGrant && (
            <GrantWishModal
              visible={!!wishToGrant}
              onClose={() => setWishToGrant(null)}
              wish={wishToGrant}
              communityId={communityId}
              onGrant={handleGrantWish}
            />
          )}

          <AddWishModal
            visible={!!editingWish}
            onClose={() => setEditingWish(null)}
            communityId={communityId}
            userId={currentAuthId ?? undefined}
            onSave={handleWishSaved}
            existingWish={editingWish}
            wishOwnerUserId={editingWish?.user_id}
            wishOwnerName={member.name}
          />

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
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#a09274', marginTop: 4 }}>
                    {dailyAnswers.length} question{dailyAnswers.length !== 1 ? 's' : ''} answered
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowDailyAnswersSheet(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close daily answers"
                  hitSlop={8}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ee' }}
                >
                  <Ionicons name="close" size={24} color="#8e7a5e" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
                {dailyAnswers.length === 0 ? (
                  <View style={{ backgroundColor: '#fdf8ec', borderRadius: 16, padding: 22, alignItems: 'center' }}>
                    <Text style={{ fontSize: 26, marginBottom: 8 }}>✨</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#a09274', textAlign: 'center', lineHeight: 19 }}>
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
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#5c5648' }}>
                          {answer.answer}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48, alignItems: 'center' }}
          >
            <View style={{ width: '100%', maxWidth: 1240 }}>
            {/* Header */}
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 16 }}>
              {/* Avatar + profile completion route */}
              <View style={{ alignItems: 'center' }}>
                <BeeProgressArc profileCompletionPercent={memberRichness} size={200} />
                <View style={{ marginTop: -34, alignItems: 'center', zIndex: 1 }}>
                  <View style={{ borderRadius: 50, borderWidth: 2.5, borderColor: '#dec181', padding: 3, backgroundColor: 'white', shadowColor: '#bd9348', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                    <Avatar uri={member.avatar_url} name={member.name} size={84} />
                  </View>
                </View>
              </View>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginTop: 6 }}>{member.name}</Text>
              {(member.profile_title || member.occupation) && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#8e7a5e', marginTop: 3 }}>{member.profile_title || member.occupation}</Text>
              )}
              {/* Self actions: the round pencil + one Tune-up pill. No "You"
                  chip (you know who you are), admin shows as a quiet chip —
                  so every profile header reads the same, member to member. */}
              {(roleLabel || member.queen_bee_month) && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {roleLabel && (
                    <View style={{ backgroundColor: '#fffaf0', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(222,193,129,0.35)' }}>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#8e7a5e' }}>{roleLabel}</Text>
                    </View>
                  )}
                  {member.queen_bee_month && (
                    <View style={{ backgroundColor: '#fffaf0', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(222,193,129,0.35)' }}>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#8e7a5e' }}>👑 Queen Bee: {member.queen_bee_month}</Text>
                    </View>
                  )}
                </View>
              )}
              {/* Stacked identity column: what you do → where you're from → your answers → message */}
              {member.hometown && (
                <View style={{ marginTop: 8, backgroundColor: '#f6f4e5', paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#8e7a5e' }}>📍 {member.hometown}</Text>
                </View>
              )}
              {member.questionAnswerCount > 0 && (
                <Pressable
                  onPress={() => setShowDailyAnswersSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${member.name}'s daily question answers`}
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, backgroundColor: '#f6f4e5', paddingHorizontal: 15, paddingVertical: 4, borderRadius: 20 }}
                >
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8e7a5e' }}>
                    ✨ {member.questionAnswerCount} daily Q&A{' '}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>›</Text>
                </Pressable>
              )}
              {/* One action at the bottom of the stack: others get Message;
                  you get the pencil — the single door to backstage, where the
                  check-in button lives. The card itself is pure audience view. */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12, width: '100%' }}>
                {isCurrentUser ? (
                  <EditButton
                    onPress={() => { onClose(); router.push('/profile'); }}
                    size={36}
                    accessibilityLabel="Edit your profile (opens your backstage)"
                  />
                ) : (
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
                )}
              </View>
            </View>

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
                      structured
                      keyboardType="numbers-and-punctuation"
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
                      label="HIVErs should ask me about"
                      placeholder="What should HIVErs come to you for?"
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
                      <ComposerBar
                        variant="inlineEdit"
                        value={newSkillInput}
                        onChangeText={setNewSkillInput}
                        placeholder="Add a skill..."
                        multiline={false}
                        onSubmit={addSkillChip}
                        submitLabel="+ Add"
                      />
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
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18, color: '#8e7a5e' }}>
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

            {/* Wishes — everyone (including you) sees the same member view.
                Managing your wishes lives backstage on the Profile tab. */}
            {true && (
              <View style={{ marginBottom: 20 }}>
                <HeaderTabs
                  activeTab={wishStatusTab}
                  onChange={setWishStatusTab}
                  compact={isPhoneProfile}
                  compactAction={false}
                  stretchTabs={false}
                  tabs={[
                    {
                      key: 'public',
                      label: getHdWishTabLabel('public'),
                      count: currentWishes.length,
                    },
                    {
                      key: 'granted',
                      label: getHdWishTabLabel('granted'),
                      count: grantedWishes.length,
                    },
                  ]}
                />

                <View style={{
                  backgroundColor: '#fdf3dc',
                  borderRadius: 20,
                  borderTopLeftRadius: 0,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.7)',
                  shadowColor: '#bd9348',
                  shadowOpacity: 0.12,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 3,
                  height: memberWishPanelHeight,
                  overflow: 'hidden',
                }}>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={true}
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                      padding: 12,
                      paddingBottom: 12,
                      flexGrow: visibleMemberWishes.length === 0 ? 1 : undefined,
                    }}
                  >
                    {visibleMemberWishes.length === 0 ? (
                      <View style={{ backgroundColor: '#fffdf5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(222,193,129,0.32)' }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(45,45,45,0.48)', textAlign: 'center' }}>
                          {wishStatusTab === 'granted' ? 'No granted HD wishes yet.' : PROFILE_EMPTY_COPY.wishes}
                        </Text>
                      </View>
                    ) : (
                      visibleMemberWishes.map(w => (
                        <WishCombCard
                          key={w.id}
                          wish={w}
                          ownerId={member.id}
                          ownerName={member.name}
                          ownerAvatarUrl={member.avatar_url}
                          compact={isPhoneProfile}
                          onOpen={openWishDetail}
                          onManage={canOpenWishActions(w) ? setManagingWish : undefined}
                        />
                      ))
                    )}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Wish management moved backstage (Profile tab) — the member card
                shows everyone the same view. Kept for reference; unreachable. */}
            {false && (
              <View style={{ marginBottom: 24 }}>
                <HeaderTabs
                  activeTab={wishStatusTab}
                  onChange={setWishStatusTab}
                  actionLabel="+ Wish"
                  onAction={startAddingWish}
                  compact={isPhoneProfile}
                  compactAction={false}
                  stretchTabs={false}
                  tabs={[
                    {
                      key: 'public',
                      label: getHdWishTabLabel('public'),
                      count: myPublicWishes.length,
                    },
                    {
                      key: 'granted',
                      label: getHdWishTabLabel('granted'),
                      count: myGrantedWishes.length,
                    },
                  ]}
                />

                <View style={{
                  backgroundColor: '#fdf3dc',
                  borderRadius: 20,
                  borderTopLeftRadius: 0,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.7)',
                  shadowColor: '#bd9348',
                  shadowOpacity: 0.12,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 5 },
                  elevation: 3,
                  height: memberWishPanelHeight,
                  overflow: 'hidden',
                }}>
                  {wishesLoading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <ThinkingBee />
                    </View>
                  ) : (
                    <ScrollView
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={true}
                      style={{ flex: 1 }}
                      contentContainerStyle={{
                        padding: 12,
                        paddingBottom: 12,
                        flexGrow: visibleMyWishes.length === 0 ? 1 : undefined,
                      }}
                    >
                      {visibleMyWishes.length === 0 ? (
                        <View style={{ backgroundColor: '#fffdf5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(222,193,129,0.32)' }}>
                          <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(45,45,45,0.48)', textAlign: 'center' }}>
                            {myWishes.length === 0
                              ? 'No HD wishes yet. Tap "+ Wish" to add your first one, or chat with Clive to discover what you really want.'
                              : wishStatusTab === 'granted'
                                ? 'No granted HD wishes yet.'
                                : 'No HD wishes yet.'}
                          </Text>
                        </View>
                      ) : (
                        visibleMyWishes.map(wish => (
                          <WishCombCard
                            key={wish.id}
                            wish={wish}
                            ownerId={member.id}
                            ownerName={member.name}
                            ownerAvatarUrl={member.avatar_url}
                            compact={isPhoneProfile}
                            onOpen={openWishDetail}
                            onManage={canOpenWishActions(wish) ? setManagingWish : undefined}
                          />
                        ))
                      )}
                    </ScrollView>
                  )}
                </View>

                {/* Inline new wish composer */}
                {addingWish && (
                  <View style={{ backgroundColor: '#fffbf0', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 14, padding: 14, marginTop: 12 }}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#2d2d2d', marginBottom: 8 }}>New HD wish</Text>
                        <ComposerBar
                          variant="form"
                          containerClassName="mb-2.5"
                          value={newWishInput}
                          onChangeText={setNewWishInput}
                          placeholder="What is the HD wish? Describe it as specifically as you can..."
                          minHeight={80}
                          mentionMembers={mentionableMembers}
                          mentionsLoading={mentionMembersLoading}
                          currentUserId={currentAuthId ?? undefined}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          <Pressable
                            onPress={cancelNewWish}
                            style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 10 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: '#8e7a5e', textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={saveNewWish}
                            disabled={!newWishInput.trim()}
                            style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 10, paddingVertical: 10, opacity: newWishInput.trim() ? 1 : 0.4 }}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', textAlign: 'center', fontSize: 13 }}>Add HD Wish</Text>
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
              </View>
            )}

            {/* Section headers carry their own pencil on your own card, so
                editing what you're looking at doesn't mean scrolling back to
                the top to find the one button (Nat 2026-07-26). They don't
                make the card editable — the card stays the audience view —
                they're shortcuts INTO backstage, landing on the right part. */}
            {isCurrentUser ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#a09274', letterSpacing: 0.6 }}>
                  ABOUT YOU
                </Text>
                <EditButton
                  size={30}
                  onPress={() => { onClose(); router.push({ pathname: '/profile', params: { focus: 'about' } }); }}
                  accessibilityLabel="Edit your bio and details"
                />
              </View>
            ) : null}

            <ProfileShowcase
              honeycombItems={memberHoneycombItems}
              knownFor={member.known_for}
              bio={member.bio}
              miq={{
                experiences: member.miq_experiences,
                growth: member.miq_growth,
                contribution: member.miq_contribution,
              }}
              style={{ marginBottom: 20 }}
              knownForPlaceholder={PROFILE_EMPTY_COPY.knownFor}
              bioPlaceholder={PROFILE_EMPTY_COPY.bio}
              miqPlaceholder={PROFILE_EMPTY_COPY.miq}
              showMiqWhenEmpty
              showEmptyCells
            />

            {/* Intro post */}
            {showIntroPost && member.introPost && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#a09274', letterSpacing: 0.6, marginBottom: 8 }}>INTRODUCTION POST</Text>
                <View style={{ backgroundColor: '#fdf8ec', borderRadius: 16, padding: 16 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', marginBottom: 4 }}>{member.introPost.title}</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#5c5648', lineHeight: 22 }}>
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

            {/* Skills Garden */}
            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#a09274', letterSpacing: 0.6 }}>
                    SKILLS GARDEN 🌸
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#b5a898', marginTop: 2 }}>
                    {member.skills.filter(s => Number(s.enthusiasm_level ?? 0) > 0).length} skill flowers blooming
                  </Text>
                </View>
                {/* Tending still happens backstage — this just takes you
                    straight to the garden instead of the top of the page. */}
                {isCurrentUser ? (
                  <EditButton
                    size={30}
                    onPress={() => { onClose(); router.push({ pathname: '/profile', params: { focus: 'garden' } }); }}
                    accessibilityLabel="Tend your Skills Garden"
                  />
                ) : null}
              </View>

              {member.skills.length === 0 && false ? (
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
                <View style={{ backgroundColor: '#fdf8ec', borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🌱</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#a09274', textAlign: 'center' }}>
                    {PROFILE_EMPTY_COPY.skills}
                  </Text>
                </View>
              ) : (
                <SkillBubbleGarden skills={member.skills} />
              )}
            </View>

            <Pressable onPress={onClose} style={{ backgroundColor: '#fdf8ec', borderRadius: 14, paddingVertical: 14, marginTop: 4 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Close</Text>
            </Pressable>
            </View>
          </ScrollView>
          {/* Hidden while an overlay sheet is up — it was floating over the
              Daily Answers header and colliding with that sheet's Close. */}
          {!selectedWish && !showDailyAnswersSheet && (
            <Pressable
              onPress={onClose}
              onPressIn={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close member profile"
              hitSlop={8}
              style={{ position: 'absolute', right: 18, top: 8, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f3ee', zIndex: 100, elevation: 100 }}
            >
              <Ionicons name="close" size={24} color="#8e7a5e" />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function MembersScreen() {
  const { communityId, profile, session, community, wholeHive, memberships: myHives } = useAuth();
  // Cream inside a HIVE, space at HIVE-Wide — "instead of cream it should
  // always be the world in space look, because we want to make sure you know
  // which one you're in" (Nat 2026-08-03).
  const skin = usePageSkin();
  // Every HIVE this person is in, for the HIVE-Wide view of who is around.
  const myHiveIds = useMemo(() => myHives.map((m) => m.community_id), [myHives]);
  const { memberId: routeMemberId, view: routeViewParam, open: routeOpenParam } = useLocalSearchParams<{ memberId?: string | string[]; view?: string | string[]; open?: string | string[] }>();
  const memberId = Array.isArray(routeMemberId) ? routeMemberId[0] : routeMemberId;
  const routeView = Array.isArray(routeViewParam) ? routeViewParam[0] : routeViewParam;
  // Nonce so a repeat trip to the same view re-fires the effect below even when
  // this tab never unmounted (the boards `open` pattern).
  const routeOpen = Array.isArray(routeOpenParam) ? routeOpenParam[0] : routeOpenParam;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemberData | null>(null);
  const [dismissedRouteMemberId, setDismissedRouteMemberId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [memberViewMode, setMemberViewMode] = useState<MemberViewMode>('directory');
  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const membersSortStorageKey = communityId && currentUserId
    ? `the-hive:members-sort:${communityId}:${currentUserId}`
    : null;
  const [memberSort, setMemberSort] = useState<MemberSortKey>(() =>
    normalizeMemberSort(membersSortStorageKey ? getStoredItem(membersSortStorageKey) : null)
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useEffect(() => {
    setMemberSort(normalizeMemberSort(membersSortStorageKey ? getStoredItem(membersSortStorageKey) : null));
  }, [membersSortStorageKey]);

  const selectMemberSort = (key: MemberSortKey) => {
    setMemberSort(key);
    setSortMenuOpen(false);
    if (membersSortStorageKey) setStoredItem(membersSortStorageKey, key);
  };

  const loadMembers = useCallback(async (isRefresh = false) => {
    if (!communityId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);

      // At HIVE-Wide this is everybody you share any HIVE with, once each —
      // somebody in two of your HIVEs is still one person (Nat 2026-08-03).
      const scopeIds = wholeHive && myHiveIds.length > 0 ? myHiveIds : [communityId];
      const { data: memberships, error: membErr } = await supabase
        .from('community_memberships')
        .select('user_id, role')
        .in('community_id', scopeIds);

      if (membErr || !memberships) {
        console.warn('[Members] memberships load failed', membErr);
        setError('Could not load members.');
        if (isRefresh) setRefreshing(false); else setLoading(false);
        return;
      }

      // One row per person. Across several HIVEs the same member comes back
      // once per HIVE they're in, and listing Lucas three times would be a bug
      // that looks like a design decision. Highest role they hold anywhere wins.
      const rank: Record<string, number> = { member: 0, treasurer: 1, admin: 2 };
      const byUser = new Map<string, any>();
      for (const m of (memberships as any[])) {
        if (!m.user_id) continue;
        const prev = byUser.get(m.user_id);
        if (!prev || (rank[m.role] ?? 0) > (rank[prev.role] ?? 0)) byUser.set(m.user_id, m);
      }
      const roster = Array.from(byUser.values());

      const userIds = roster.map((m: any) => m.user_id).filter(Boolean);
      if (userIds.length === 0) {
        setMembers([]);
        if (isRefresh) setRefreshing(false); else setLoading(false);
        return;
      }

      let profilesQuery = supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      // At HIVE-Wide, only the people who said yes to it.
      //
      // Nat 2026-08-03: "everyone's preferences default to a visibility of this
      // HIVE only, they'd have to go in and toggle on HIVE-Wide visibility in
      // order to populate here." Being in OG HIVE was never consent to be
      // listed to Tech and Production, so it starts off for everybody and this
      // list starts empty. That is correct, not broken.
      if (wholeHive) profilesQuery = profilesQuery.eq('visible_hive_wide', true);

      const { data: profilesData, error: profilesErr } = await profilesQuery;

      if (profilesErr || !profilesData) {
        console.warn('[Members] profiles load failed', profilesErr);
        setError('Could not load members.');
        if (isRefresh) setRefreshing(false); else setLoading(false);
        return;
      }

      const profilesById = new Map<string, any>();
      profilesData.forEach((p: any) => profilesById.set(p.id, p));

      // Somebody who has not opted in has no profile row here, and a membership
      // without one would render as "Unknown member" — which would leak the very
      // fact they chose to keep quiet.
      const listed = wholeHive ? roster.filter((m: any) => profilesById.has(m.user_id)) : roster;

      const memberList: MemberData[] = listed.map((m: any) => {
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
          .select('user_id, id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(*))')
          .eq('community_id', communityId)
          .in('user_id', userIds)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false }),
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

      let wishesData = (wishesRes.data ?? null) as any[] | null;
      let wishesError = wishesRes.error;
      if (wishesError && String(wishesError.message ?? '').includes('title')) {
        const fallback = await supabase
          .from('wishes')
          .select('user_id, id, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(*))')
          .eq('community_id', communityId)
          .in('user_id', userIds)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        wishesData = (fallback.data ?? []).map((wish: any) => ({ ...wish, title: null }));
        wishesError = fallback.error;
      }

      if (
        wishesError &&
        (String(wishesError.message ?? '').includes('wish_granters') ||
          String(wishesError.message ?? '').includes('granter') ||
          String(wishesError.message ?? '').includes('relationship') ||
          String(wishesError.message ?? '').includes('schema cache'))
      ) {
        const fallback = await supabase
          .from('wishes')
          .select('user_id, id, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
          .eq('community_id', communityId)
          .in('user_id', userIds)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        wishesData = fallback.data ?? [];
        wishesError = fallback.error;
      }

      if (wishesError && String(wishesError.message ?? '').includes('title')) {
        const fallback = await supabase
          .from('wishes')
          .select('user_id, id, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message')
          .eq('community_id', communityId)
          .in('user_id', userIds)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        wishesData = (fallback.data ?? []).map((wish: any) => ({ ...wish, title: null }));
        wishesError = fallback.error;
      }

      if (skillsRes.error) console.warn('[Members] skills load failed', skillsRes.error);
      if (wishesError) console.warn('[Members] wishes load failed', wishesError);
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
      (wishesData ?? []).forEach((w: any) => {
        if (!wishesByUser.has(w.user_id)) wishesByUser.set(w.user_id, []);
        wishesByUser.get(w.user_id)!.push({
          id: w.id,
          title: w.title,
          description: w.description,
          status: w.status,
          is_active: w.is_active,
          created_at: w.created_at,
          fulfilled_at: w.fulfilled_at,
          thank_you_message: w.thank_you_message,
          granters: w.granters ?? [],
        });
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
        const question = getDailyAnswerPrompt(questionIndex, deckForCommunity(community?.slug));
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
  }, [communityId, currentUserId, wholeHive, myHiveIds]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (routeView === 'swarm') {
      setMemberViewMode('swarm');
    }
  }, [routeView, routeOpen]);

  const [openAnswersOnSelect, setOpenAnswersOnSelect] = useState(false);
  const openMemberProfile = useCallback((member: MemberData, showAnswers = false) => {
    setOpenAnswersOnSelect(showAnswers);
    setSelected(member);
  }, []);

  const closeMemberProfile = useCallback(() => {
    setSelected(null);
    if (memberId) {
      setDismissedRouteMemberId(memberId);
      router.replace('/members');
    }
  }, [memberId, router]);

  useEffect(() => {
    if (!memberId) {
      setDismissedRouteMemberId(null);
    }
  }, [memberId]);

  // Keep member detail synced when links navigate between profiles.
  useEffect(() => {
    if (!memberId || memberId === dismissedRouteMemberId || members.length === 0) return;
    if (selected?.id === memberId) return;

    const target = members.find(m => m.id === memberId);
    if (!target) return;

    setSelected(target);
  }, [dismissedRouteMemberId, memberId, members, selected]);

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
    if (memberViewMode === 'directory') {
      return [...filtered].sort((a, b) => {
        // "You" leads only on the default view; picking a real sort
        // (birthday, match, wishes) shuffles you in with everyone else.
        if (memberSort === 'first-name') {
          if (a.id === currentUserId) return -1;
          if (b.id === currentUserId) return 1;
        }

        if (memberSort === 'next-birthday') {
          const aDays = daysUntilNextBirthday(a.birthday);
          const bDays = daysUntilNextBirthday(b.birthday);
          if (aDays !== bDays) {
            if (aDays === null) return 1;
            if (bDays === null) return -1;
            return aDays - bDays;
          }
        } else if (memberSort === 'best-match') {
          const aHasMatch = typeof a.dailyMatchPercent === 'number' && (a.dailyMatchSharedCount ?? 0) > 0;
          const bHasMatch = typeof b.dailyMatchPercent === 'number' && (b.dailyMatchSharedCount ?? 0) > 0;
          if (aHasMatch !== bHasMatch) return aHasMatch ? -1 : 1;
          if (aHasMatch && bHasMatch) {
            const percentDiff = (b.dailyMatchPercent ?? 0) - (a.dailyMatchPercent ?? 0);
            if (percentDiff !== 0) return percentDiff;
            const sharedDiff = (b.dailyMatchSharedCount ?? 0) - (a.dailyMatchSharedCount ?? 0);
            if (sharedDiff !== 0) return sharedDiff;
          }
        } else if (memberSort === 'most-wishes') {
          const wishDiff = countPublicMemberWishes(b) - countPublicMemberWishes(a);
          if (wishDiff !== 0) return wishDiff;
        }

        const firstNameDiff = memberFirstName(a.name).localeCompare(memberFirstName(b.name));
        if (firstNameDiff !== 0) return firstNameDiff;
        return a.name.localeCompare(b.name);
      });
    }

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
  }, [currentUserId, filtered, memberSort, memberViewMode]);
  const currentMember = useMemo(
    () => members.find(member => member.id === currentUserId) ?? null,
    [currentUserId, members]
  );
  const totalDailyAnswerCount = filtered.reduce((total, member) => total + member.questionAnswerCount, 0);
  const answeredMemberCount = filtered.filter(member => member.questionAnswerCount > 0).length;
  const bestMatch = visibleMembers.find(member =>
    member.id !== currentUserId &&
    typeof member.dailyMatchPercent === 'number' &&
    (member.dailyMatchSharedCount ?? 0) > 0
  );
  const busiestAnswerDay = useMemo(() => {
    const dayCounts = new Array(7).fill(0);
    filtered.forEach(member => {
      member.dailyAnswers.forEach(answer => {
        const date = new Date(`${answer.questionDate}T12:00:00`);
        if (!Number.isNaN(date.getTime())) dayCounts[date.getDay()] += 1;
      });
    });
    const max = Math.max(...dayCounts);
    if (max === 0) return null;
    const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    return names[dayCounts.indexOf(max)];
  }, [filtered]);

  const swarmThemeHighlights = useMemo(() => {
    const themes = new Map<string, { category: string; emoji: string; count: number }>();
    filtered.forEach(member => {
      member.dailyAnswers.forEach(answer => {
        const key = answer.questionCategory || 'daily question';
        const existing = themes.get(key) ?? {
          category: key,
          emoji: answer.questionEmoji || '✨',
          count: 0,
        };
        existing.count += 1;
        themes.set(key, existing);
      });
    });

    return Array.from(themes.values())
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
      .slice(0, 3);
  }, [filtered]);
  // Phone widths render "launcher mode": compact hexes ~3 across with avatar +
  // first name only, so the whole hive fits roughly one screen.
  const isPhoneHoneycomb = width < 768;
  const desiredHoneycombColumns = width >= 1500 ? 5 : width >= 1120 ? 4 : width >= 768 ? 3 : width >= 340 ? 3 : 2;
  const honeycombColumns = Math.max(1, Math.min(desiredHoneycombColumns, Math.max(1, visibleMembers.length)));
  const honeycombOuterGutter = width < 520 ? 12 : 32;
  const honeycombMaxWidth = Math.max(280, Math.min(width - honeycombOuterGutter, 1680));
  const honeycombCellCap = isPhoneHoneycomb ? 220 : 320;
  const honeycombCellWidth = honeycombColumns === 1
    ? Math.min(honeycombMaxWidth, 360)
    : Math.min(honeycombCellCap, honeycombMaxWidth / (1 + 0.75 * (honeycombColumns - 1)));
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
    <SafeAreaView style={{ flex: 1, backgroundColor: skin.page }} edges={['top']}>
      <SpaceBackdrop />
      {/* Header — just the name; the search bar below carries the detail.
          The tone follows the reader on its own now, so nothing is passed. */}
      <AppHeader title="Members" />

      {/* Nobody has opted in yet, and that is the honest answer rather than a
          failure. Says what would put a face here instead of leaving the page
          blank and letting it read as broken (Nat 2026-08-03). */}
      {!loading && wholeHive && members.length === 0 && (
        <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 64 }}>
          <Text style={{ fontSize: 34, marginBottom: 14 }}>🐝</Text>
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold', fontSize: 17,
              color: skin.ink, marginBottom: 8, textAlign: 'center',
            }}
          >
            Nobody is listed HIVE-Wide yet
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21,
              color: skin.inkSoft, textAlign: 'center', maxWidth: 380,
            }}
          >
            Everyone starts visible only inside their own HIVE. Turn on HIVE-Wide
            visibility in Settings, from inside one of your HIVEs, and you will
            show up here.
          </Text>
        </View>
      )}

      {/* Search bar */}
      {!loading && members.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: skin.page, borderBottomWidth: 1, borderBottomColor: skin.border }}>
          <View style={{ backgroundColor: skin.field, borderRadius: 12, borderWidth: 1, borderColor: skin.borderStrong, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: skin.inkSoft, marginRight: 8, fontSize: 15 }}>🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search members, skills, wishes..."
              placeholderTextColor={skin.inkSoft}
              style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: skin.ink, flex: 1 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Text style={{ color: '#a09274', fontSize: 18, lineHeight: 20 }}>×</Text>
              </Pressable>
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'center',
              backgroundColor: skin.card,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: skin.borderStrong,
              padding: 3,
              marginTop: 10,
              gap: 3,
            }}
          >
            {([
              { mode: 'directory' as const, label: 'Directory' },
              { mode: 'swarm' as const, label: 'Swarm Report' },
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
          {memberViewMode === 'directory' && (
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <Pressable
                onPress={() => setSortMenuOpen(open => !open)}
                accessibilityRole="button"
                accessibilityLabel={`Sort members, currently by ${MEMBER_SORT_OPTIONS.find(option => option.key === memberSort)?.label ?? 'First name'}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: '#fffdf5',
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.45)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Ionicons name="swap-vertical" size={12} color="#8f7b55" />
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8f7b55' }}>
                  Sort: {MEMBER_SORT_OPTIONS.find(option => option.key === memberSort)?.label ?? 'First name'}
                </Text>
                <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={11} color="#8f7b55" />
              </Pressable>
              {sortMenuOpen && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  {MEMBER_SORT_OPTIONS.map(option => {
                    const active = memberSort === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => selectMemberSort(option.key)}
                        accessibilityRole="button"
                        accessibilityLabel={`Sort members by ${option.label}`}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? '#bd9348' : 'rgba(222,193,129,0.45)',
                          backgroundColor: active ? '#bd9348' : 'rgba(255,255,255,0.78)',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: active ? '#fffdf7' : '#8f7b55' }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}
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
              {matchedMemberCount} connection{matchedMemberCount === 1 ? '' : 's'} with overlap
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
            <ThinkingBee />
          </View>
        ) : error ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ fontFamily: 'Lato_400Regular', color: '#ef4444', textAlign: 'center' }}>{error}</Text>
          </View>
        ) : (
          <>
            {memberViewMode === 'swarm' && (
              <View
                style={{
                  backgroundColor: '#fffdf5',
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.58)',
                  borderRadius: 18,
                  padding: width < 420 ? 14 : 16,
                  marginBottom: 18,
                  shadowColor: '#bd9348',
                  shadowOpacity: 0.08,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: width < 620 ? 'column' : 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: '#2d2d2d' }}>
                      Swarm Report
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8a8173', lineHeight: 18, marginTop: 4 }}>
                      Connection snapshot from Daily Questions.
                    </Text>
                  </View>

                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    ...(bestMatch ? [{
                      label: 'Strongest overlap',
                      value: `${bestMatch.name.split(' ')[0]} · ${bestMatch.dailyMatchPercent}%`,
                    }] : []),
                    ...(busiestAnswerDay ? [{ label: 'Busiest day', value: busiestAnswerDay }] : []),
                    { label: 'Deck', value: `${deckForCommunity(community?.slug).length} prompts` },
                    { label: 'HIVE answers', value: String(totalDailyAnswerCount) },
                    { label: 'Members joined', value: String(answeredMemberCount) },
                    { label: 'Your answers', value: String(currentMember?.questionAnswerCount ?? 0) },
                  ].map(stat => (
                    <View
                      key={stat.label}
                      style={{
                        backgroundColor: '#fdf8ec',
                        borderWidth: 1,
                        borderColor: 'rgba(222,193,129,0.42)',
                        borderRadius: 12,
                        paddingHorizontal: 11,
                        paddingVertical: 9,
                        minWidth: width < 420 ? '47%' : 118,
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {stat.label}
                      </Text>
                      <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 15, color: '#2d2d2d', marginTop: 3 }}>
                        {stat.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {swarmThemeHighlights.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#9a8060', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      Most answered themes
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {swarmThemeHighlights.map(theme => (
                        <Pressable
                          key={theme.category}
                          onPress={() => router.push({ pathname: '/hive', params: { catchup: '1', from: 'swarm' } } as any)}
                          accessibilityRole="button"
                          accessibilityLabel={`Answer more ${theme.category} questions in Catch up`}
                          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pressed ? '#fbf0d7' : '#fffdf5', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 })}
                        >
                          <Text style={{ fontSize: 12 }}>⭐</Text>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#2d2d2d' }}>
                            {theme.category}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>
                            {theme.count}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: 'rgba(189,147,72,0.6)' }}>›</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

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
                    const profileCurrentWishes = member.wishes.filter(w => w.status === 'public' && w.is_active !== false);
                    // The comb answers "what's everyone's focus right now" —
                    // this month's HD leads; Ask-me-about is the fallback.
                    const spotlightWish = pickSpotlightWish(profileCurrentWishes);
                    const activeWishSpotlight = spotlightWish
                      ? (spotlightWish.title?.trim() || spotlightWish.description)
                      : null;
                    const spotlight = activeWishSpotlight || member.known_for || member.current_project || member.miq_experiences || member.skills[0]?.description || member.bio;
                    const spotlightLabel = activeWishSpotlight
                      ? "This month's HD"
                      : member.known_for
                        ? 'Ask me about'
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
                    const wishChip = `${profileCurrentWishes.length} wish${profileCurrentWishes.length === 1 ? '' : 'es'}`;
                    const sharedAnswerCount = member.questionAnswerCount;
                    const connectionChip = sharedAnswerCount > 0
                      ? isCompactHoneycomb
                        ? `${sharedAnswerCount} shared`
                        : `${sharedAnswerCount} shared answer${sharedAnswerCount === 1 ? '' : 's'}`
                      : isCompactHoneycomb
                        ? '0 shared'
                        : '0 shared answers';
                    const visibleChips = [
                      { key: 'answers', label: connectionChip },
                      { key: 'wishes', label: wishChip },
                    ];
                    return (
                      <Pressable
                        key={member.id}
                        onPress={() => openMemberProfile(member)}
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
                          {isPhoneHoneycomb ? (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                              <View style={{ position: 'relative' }}>
                                <View style={{
                                  borderRadius: (honeycombAvatarSize + 8) / 2,
                                  borderWidth: isMe ? 2 : 1.25,
                                  borderColor: isMe ? '#bd9348' : 'rgba(222,193,129,0.7)',
                                  padding: 2,
                                  backgroundColor: 'white',
                                  shadowColor: '#bd9348',
                                  shadowOpacity: 0.14,
                                  shadowRadius: 8,
                                  shadowOffset: { width: 0, height: 3 },
                                }}>
                                  <Avatar uri={member.avatar_url} name={member.name} size={honeycombAvatarSize} />
                                </View>
                                {hasDailyMatch && (
                                  <View
                                    accessible
                                    accessibilityLabel={`${member.dailyMatchPercent}% daily question match with ${member.name}`}
                                    style={{
                                      position: 'absolute',
                                      top: -6,
                                      right: -20,
                                      backgroundColor: 'rgba(255,247,221,0.95)',
                                      borderWidth: 1,
                                      borderColor: 'rgba(189,147,72,0.46)',
                                      borderRadius: 999,
                                      paddingHorizontal: 5,
                                      paddingVertical: 2,
                                    }}
                                  >
                                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 9, color: '#bd9348', lineHeight: 11 }}>
                                      {member.dailyMatchPercent}%
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text
                                style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: honeycombCellWidth < 170 ? 11.5 : 12.5, color: '#2d2d2d', marginTop: 5, textAlign: 'center', maxWidth: honeycombTextMaxWidth }}
                                numberOfLines={1}
                              >
                                {isMe ? `${memberFirstName(member.name)} (you)` : memberFirstName(member.name)}
                              </Text>
                            </View>
                          ) : (
                          <>
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
                              <Text style={{ fontFamily: member.known_for ? 'LibreBaskerville_400Regular' : 'Lato_400Regular', fontSize: member.known_for ? 10.8 : 10.5, color: '#5c5648', lineHeight: 14.5, textAlign: 'center', fontStyle: member.known_for ? 'italic' : 'normal' }} numberOfLines={2}>
                                {spotlight}
                              </Text>
                            </View>
                          )}

                          {visibleChips.length > 0 && (
                            <View style={{ flexDirection: 'column', alignItems: 'center', gap: isCompactHoneycomb ? 3 : 4, marginTop: isCompactHoneycomb ? 7 : 9 }}>
                              {visibleChips.slice(0, isCompactHoneycomb ? 1 : 2).map(chip => (
                                <Pressable
                                  key={chip.key}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    openMemberProfile(member, chip.key === 'answers');
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel={chip.key === 'answers' ? `See ${member.name}'s shared answers` : `See ${member.name}'s wishes`}
                                  style={({ pressed }) => ({ backgroundColor: pressed ? 'rgba(222,193,129,0.7)' : 'rgba(245,234,209,0.86)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 })}
                                >
                                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isCompactHoneycomb ? 8 : 9, color: '#8a6a2f' }} numberOfLines={1}>
                                    {chip.label} ›
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                          </>
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

      {selected && (
        <MemberDetailModal
          member={selected}
          communityId={communityId}
          initialShowAnswers={openAnswersOnSelect}
          onClose={closeMemberProfile}
          onMemberUpdated={(updatedMember) => {
            setSelected(updatedMember);
            setMembers(current => current.map(member => member.id === updatedMember.id ? updatedMember : member));
          }}
        />
      )}
    </SafeAreaView>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaLibraryPermission } from '../../lib/imagePicker';
import { supabase } from '../../lib/supabase';
import { invalidateWishQueries } from '../../lib/queryClient';
import { deleteWishById } from '../../lib/wishMutations';
import { useAuth } from '../../lib/hooks/useAuth';
import { useWishes } from '../../lib/hooks/useWishes';
import { useSurveys, type Survey, type SurveyAnswers } from '../../lib/hooks/useSurveys';
import { useCarryForwardContext } from '../../lib/hooks/useCarryForwardContext';
import { Avatar } from '../../components/ui/Avatar';
import { BirthdayPicker } from '../../components/ui/DatePicker';
import { AppHeader } from '../../components/navigation';
import { clearLastAppPath } from '../../lib/navigationState';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import { getHdWishTabLabel, type HdWishTabKey } from '../../lib/wishDisplay';
import { fetchSkillWishMatches, type SkillWishMatch } from '../../lib/skillWishMatching';
import { FadeIn } from '../../components/ui/FadeIn';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { ListSectionSkeleton } from '../../components/profile/ProfileSkeleton';
import { BeeProgressArc } from '../../components/profile/BeeProgressArc';
import { SkillBubbleGarden } from '../../components/profile/SkillBubbleGarden';
import { ProfileShowcase } from '../../components/profile/ProfileShowcase';
import { WishCombCard } from '../../components/profile/WishCombCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { HeaderTabs } from '../../components/ui/HeaderTabs';
import { EditButton } from '../../components/ui/EditButton';
import { WorldMark } from '../../components/ui/WorldMark';
import { SWITCH_LOOK } from '../../components/ui/Switch';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { showAlert } from '../../lib/showAlert';
import { SurveyModal } from '../../components/surveys/SurveyModal';
import { SkillsManageModal } from '../../components/skills/SkillsManageModal';
import { PREDEFINED_SKILLS } from '../../components/skills/constants';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { WishManageModal } from '../../components/wishes/WishManageModal';
import { Ionicons } from '@expo/vector-icons';
import { formatDateLong, formatDateShort, isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import type { Skill, Wish, UserInsights, Profile } from '../../types';
import { EventScopeFields, type EventAudience } from '../../components/events/EventAudienceToggle';

import { ComposerBar } from '../../components/ui/ComposerBar';
import { FIELD_LOOK } from '../../components/ui/Input';
import { confirmAction } from '../../lib/showAlert';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
const CONTACT_OPTIONS = ['email', 'phone', 'text'] as const;

/**
 * The hairline every field in the app wears — the same value `ComposerBar` uses.
 *
 * Only one box on this page is not made of words (your phone number), so it does
 * not get a microphone. It still has to look like it belongs to the same set of
 * controls as everything around it, which is all this constant is for.
 */
const FIELD_BORDER = FIELD_LOOK.border;

// Format phone number as (XXX) XXX-XXXX
const formatPhoneNumber = (value: string): string => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');

  // Limit to 10 digits
  const limited = digits.slice(0, 10);

  // Format based on length
  if (limited.length === 0) return '';
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
};

const hasBloomingSkill = (skill: Partial<Skill>) => {
  const level = Number(skill.enthusiasm_level ?? 0);
  return Number.isFinite(level) && level > 0;
};

const hasProfileText = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0;

const hasProfileListItem = (value: unknown) =>
  Array.isArray(value) && value.some(item => hasProfileText(item));

const SKILLS_GARDEN_CAPACITY = 10;
const DEEP_PROFILE_STEPS = ['Basics', 'Now', 'Favorites', '3MIQ'] as const;
// The per-email switches moved to app/(app)/settings.tsx on 2026-08-03, along
// with the rest of the back-of-house. They grew from two to six there, so
// keeping a copy of the list in this file would only have gone stale.

const PROFILE_FORM_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Every room Profile can be closed back into, with the name that room goes by.
 *
 * A table rather than a chain of `if`s, and the same table `monthly-tuneup.tsx`
 * keeps, so a new way IN can be given a way OUT in one line. Whatever opened
 * this page names itself with `?from=`; anything that does not lands Home.
 *
 * There is deliberately no "wherever the browser thinks you were" entry here —
 * see `closeProfile`.
 */
const EXITS = {
  members: { route: '/members', label: 'Members' },
  meetings: { route: '/meetings', label: 'Meetings' },
  admin: { route: '/admin', label: 'Admin' },
  hive: { route: '/hive', label: 'Home' },
} as const;
type ExitKey = keyof typeof EXITS;

/**
 * The one mark that says whether a to-do on this page has been done.
 *
 * Nat, 2026-08-05, looking at a row reading "✅ Complete this month's check-in":
 * "this has a green check mark that looks like i've already done it. is it
 * asking me to do it? or showing that i've already done it?"
 *
 * It was asking. The tick was decoration — drawn the same whether or not the
 * thing had happened — so the only signal on the row said the opposite of what
 * the row meant. Now an empty ring means still waiting for you, a tick means
 * finished, and the two are told apart by shape alone, without reading a word.
 * A finished thing is also drawn quietly, because it no longer wants you.
 *
 * Nothing on this page may draw a tick on work that has not been done.
 */
function TodoMark({ done, size = 18 }: { done: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: done ? 0 : Math.max(1.4, size * 0.11),
        borderColor: 'rgba(45,45,45,0.32)',
        backgroundColor: done ? 'rgba(45,45,45,0.12)' : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {done ? <Ionicons name="checkmark" size={Math.round(size * 0.7)} color="#7f715f" /> : null}
    </View>
  );
}

type WishStatusTabKey = HdWishTabKey;

type ProfileFormDraftFields = {
  name: string;
  phone: string;
  birthday: string;
  occupation: string;
  profileTitle: string;
  preferredContact: string;
  bio: string;
  currentProject: string;
  hometown: string;
  favoriteBook: string;
  favoriteFood: string;
  favoriteHobby: string;
  knownFor: string;
  miqExperiences: string;
  miqGrowth: string;
  miqContribution: string;
  funFacts: string[];
};

type ProfileFormDraft = {
  activeSurface: 'edit' | 'deepQuiz' | null;
  deepQuizStep: number;
  fields: ProfileFormDraftFields;
  updatedAt: number;
};

export default function ProfileScreen() {
  const { profile, communityId, communityRole, refreshProfile } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { grantWish } = useWishes();
  const { availableSurveys, pendingSurveys, myResponses, submitResponse } = useSurveys(communityId ?? undefined, profile?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillWishMatches, setSkillWishMatches] = useState<SkillWishMatch[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [selectedWish, setSelectedWish] = useState<(Wish & { user: Profile }) | null>(null);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  /**
   * Whether the rest of the HIVEs can see you.
   *
   * Drawn straight from the signed-in profile rather than held in this screen's
   * own memory, so it opens showing what the database holds. `profile_scope` is
   * the one flag for this: it is what the security policy on `profiles` reads
   * when it decides whether somebody in another HIVE may see your row at all,
   * and it is what the HIVE-Wide members list filters on.
   *
   * There used to be a second column, `visible_hive_wide`, written by this
   * switch and by a second switch on Settings, and read by nothing that governs
   * access. Turning it on did nothing anybody could see, which is why Nat spent
   * two days flipping it: "I've been tryin to select 'HIVE wide' a billion
   * times, it never reflects that anywhere" (2026-08-04). One flag now
   * (2026-08-06).
   */
  const listedHiveWide = profile?.profile_scope === 'all_hives';
  const [savingHiveWideVisibility, setSavingHiveWideVisibility] = useState(false);
  const [hiveWideSaved, setHiveWideSaved] = useState(false);

  const toggleHiveWideVisibility = useCallback(async () => {
    if (!profile?.id || savingHiveWideVisibility) return;
    const next = !listedHiveWide;
    setSavingHiveWideVisibility(true);
    setHiveWideSaved(false);
    const { error } = await (supabase.from('profiles') as any)
      .update({ profile_scope: next ? 'all_hives' : 'hive' })
      .eq('id', profile.id);
    if (error) {
      console.warn('[Profile] HIVE-Wide visibility save failed', error);
      showAlert('That did not save', `${error.message ?? 'Your choice was not stored.'} Please try again.`);
      setSavingHiveWideVisibility(false);
      return;
    }
    // The pill is redrawn from the profile, so waiting for the refresh is what
    // makes the movement mean "stored" rather than "tapped".
    await refreshProfile();
    setSavingHiveWideVisibility(false);
    setHiveWideSaved(true);
  }, [profile?.id, savingHiveWideVisibility, listedHiveWide, refreshProfile]);

  // The "Saved" line is a receipt, so it goes once you have read it.
  useEffect(() => {
    if (!hiveWideSaved) return;
    const timer = setTimeout(() => setHiveWideSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [hiveWideSaved]);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [replantingGarden, setReplantingGarden] = useState(false);
  const [replantNotice, setReplantNotice] = useState<string | null>(null);
  const [addWishModalVisible, setAddWishModalVisible] = useState(false);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [managingWish, setManagingWish] = useState<Wish | null>(null);
  const [wishStatusTab, setWishStatusTab] = useState<WishStatusTabKey>('public');
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  // Section pencils on the member card deep-link here with ?focus=, so tapping
  // the one next to your garden lands on your garden rather than the top of
  // the page (Nat 2026-07-26).
  const { focus, from } = useLocalSearchParams<{ focus?: string; from?: string }>();
  const handledFocusRef = useRef<string | null>(null);
  const compactProfileLandscape = screenWidth > screenHeight && screenHeight < 540;
  const immersiveSkillsGarden = compactProfileLandscape;
  const skillsGardenY = useRef(0);
  const restoredProfileDraftRef = useRef(false);
  const profileFormDraftKey = profile?.id ? `the-hive:profile-form-draft:${profile.id}` : null;
  const activeSurveyStorageKey = profile?.id ? `the-hive:active-survey:${profile.id}` : null;
  const pendingSurveyIds = new Set(pendingSurveys.map((survey) => survey.id));
  const monthlyCheckInSurvey = availableSurveys.find((survey) => (
    `${survey.title} ${survey.description ?? ''}`.match(/monthly\s+check-?in/i)
  )) ?? availableSurveys[0] ?? null;
  const monthlyCheckInResponse = monthlyCheckInSurvey ? myResponses.get(monthlyCheckInSurvey.id) : undefined;
  const monthlyCheckInIsEditing = !!monthlyCheckInSurvey
    && !!monthlyCheckInResponse
    && !pendingSurveyIds.has(monthlyCheckInSurvey.id);
  const activeSurveyResponse = activeSurvey ? myResponses.get(activeSurvey.id) : undefined;
  const activeSurveyIsEditing = !!activeSurvey && !!activeSurveyResponse && !pendingSurveyIds.has(activeSurvey.id);
  const {
    items: carryForwardItems,
    loading: carryForwardLoading,
    error: carryForwardError,
  } = useCarryForwardContext({
    communityId,
    userId: profile?.id,
    survey: activeSurvey,
  });
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const canManageWish = useCallback((wish: Wish) => (
    !!profile && wish.user_id === profile.id
  ), [isAdmin, profile?.id]);
  const canGrantWish = useCallback((wish: Wish) => (
    wish.status === 'public' && canManageWish(wish)
  ), [canManageWish]);
  const canEditWish = useCallback((wish: Wish) => (
    wish.status !== 'fulfilled' && canManageWish(wish)
  ), [canManageWish]);
  const canArchiveWish = useCallback((wish: Wish) => (
    wish.status === 'public' && wish.is_active !== false && canManageWish(wish)
  ), [canManageWish]);
  const canDeleteWish = useCallback((wish: Wish) => canManageWish(wish), [canManageWish]);
  const canRefineWish = useCallback((wish: Wish) => (
    wish.status !== 'fulfilled' && canManageWish(wish)
  ), [canManageWish]);
  const canOpenWishActions = useCallback((wish: Wish) => (
    canGrantWish(wish) || canEditWish(wish) || canArchiveWish(wish) || canDeleteWish(wish) || canRefineWish(wish)
  ), [canArchiveWish, canDeleteWish, canEditWish, canGrantWish, canRefineWish]);

  // Editable profile fields
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  // How far a birthday travels (migration 164 — `profiles.birthday_visibility`
  // / `birthday_invited_scope`, the same 'members' | 'all_hives' | 'public'
  // ladder events use). Defaults to 'members' so a birthday never travels past
  // your own HIVE until you say so — matching the column's own DB default.
  const [editBirthdayVisibility, setEditBirthdayVisibility] = useState<EventAudience>('members');
  const [editBirthdayInvitedScope, setEditBirthdayInvitedScope] = useState<EventAudience>('members');
  const [editOccupation, setEditOccupation] = useState('');
  const [editProfileTitle, setEditProfileTitle] = useState('');
  const [editPreferredContact, setEditPreferredContact] = useState('email');
  const [editBio, setEditBio] = useState('');
  const [editCurrentProject, setEditCurrentProject] = useState('');
  const [editHometown, setEditHometown] = useState('');
  const [editFavBook, setEditFavBook] = useState('');
  const [editFavFood, setEditFavFood] = useState('');
  const [editFavHobby, setEditFavHobby] = useState('');
  const [editKnownFor, setEditKnownFor] = useState('');
  const [editMiqExperiences, setEditMiqExperiences] = useState('');
  const [editMiqGrowth, setEditMiqGrowth] = useState('');
  const [editMiqContribution, setEditMiqContribution] = useState('');
  const [editFunFacts, setEditFunFacts] = useState(['', '', '']);
  const [deepQuizVisible, setDeepQuizVisible] = useState(false);
  const [deepQuizStep, setDeepQuizStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile || !communityId) return;

    const [
      skillsResult,
      wishesResult,
      insightsResult,
    ] = await Promise.all([
      supabase
        .from('skills')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .order('created_at', { ascending: true }),
      supabase
        .from('wishes')
        .select('*, board_category:board_categories(id,name,topic_kind), granters:wish_granters(*, granter:profiles!granter_id(*))')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .order('created_at', { ascending: false }),
      // Use maybeSingle() to gracefully handle cases where no record exists yet
      supabase
        .from('user_insights')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .maybeSingle(),
    ]);

    let wishesData: Wish[] | null = (wishesResult.data as unknown as Wish[] | null) ?? null;
    let wishesError = wishesResult.error;
    if (
      wishesError &&
      (String(wishesError.message ?? '').includes('board_categories') ||
        String(wishesError.message ?? '').includes('wish_granters') ||
        String(wishesError.message ?? '').includes('granter') ||
        String(wishesError.message ?? '').includes('relationship') ||
        String(wishesError.message ?? '').includes('schema cache'))
    ) {
      const fallback = await supabase
        .from('wishes')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });
      wishesData = (fallback.data as unknown as Wish[] | null) ?? null;
      wishesError = fallback.error;
    }

    if (skillsResult.data) setSkills(skillsResult.data);
    if (wishesData) setWishes(wishesData);
    if (wishesError) console.error('Error fetching profile wishes:', wishesError);
    setUserInsights(insightsResult.data);
    setInitialLoading(false);

    // Garden bees: match my planted skills against other members' public
    // wishes. Fails silent (no bees) so the garden never blocks on this.
    if (skillsResult.data) {
      const matches = await fetchSkillWishMatches({
        skills: skillsResult.data,
        currentUserId: profile.id,
        communityId,
      });
      setSkillWishMatches(matches);
    }
  }, [profile?.id, communityId]);

  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData])
  );

  // Initialize edit fields when profile loads or changes
  useEffect(() => {
    if (isEditing || deepQuizVisible) return;

    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
      // Convert ISO date to American format for editing
      setEditBirthday(profile.birthday ? isoToAmerican(profile.birthday) : '');
      setEditBirthdayVisibility((((profile as any).birthday_visibility as EventAudience) || 'members'));
      setEditBirthdayInvitedScope((((profile as any).birthday_invited_scope as EventAudience) || 'members'));
      setEditOccupation(profile.occupation || '');
      setEditProfileTitle((profile as any).profile_title || '');
      setEditPreferredContact(profile.preferred_contact || 'email');
      setEditBio((profile as any).bio || '');
      setEditCurrentProject((profile as any).current_project || '');
      setEditHometown((profile as any).hometown || '');
      setEditFavBook((profile as any).favorite_book || '');
      setEditFavFood((profile as any).favorite_food || '');
      setEditFavHobby((profile as any).favorite_hobby || '');
      setEditKnownFor((profile as any).known_for || '');
      setEditMiqExperiences((profile as any).miq_experiences || '');
      setEditMiqGrowth((profile as any).miq_growth || '');
      setEditMiqContribution((profile as any).miq_contribution || '');
      setEditFunFacts(((profile as any).fun_facts as string[] | null) ?? ['', '', '']);
    }
  }, [deepQuizVisible, isEditing, profile]);

  const resetProfileDrafts = () => {
    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
      setEditBirthday(profile.birthday ? isoToAmerican(profile.birthday) : '');
      setEditBirthdayVisibility((((profile as any).birthday_visibility as EventAudience) || 'members'));
      setEditBirthdayInvitedScope((((profile as any).birthday_invited_scope as EventAudience) || 'members'));
      setEditOccupation(profile.occupation || '');
      setEditProfileTitle((profile as any).profile_title || '');
      setEditPreferredContact(profile.preferred_contact || 'email');
      setEditBio((profile as any).bio || '');
      setEditCurrentProject((profile as any).current_project || '');
      setEditHometown((profile as any).hometown || '');
      setEditFavBook((profile as any).favorite_book || '');
      setEditFavFood((profile as any).favorite_food || '');
      setEditFavHobby((profile as any).favorite_hobby || '');
      setEditKnownFor((profile as any).known_for || '');
      setEditMiqExperiences((profile as any).miq_experiences || '');
      setEditMiqGrowth((profile as any).miq_growth || '');
      setEditMiqContribution((profile as any).miq_contribution || '');
      setEditFunFacts(((profile as any).fun_facts as string[] | null) ?? ['', '', '']);
    }
  };

  const getProfileDraftFields = (): ProfileFormDraftFields => ({
    name: editName,
    phone: editPhone,
    birthday: editBirthday,
    occupation: editOccupation,
    profileTitle: editProfileTitle,
    preferredContact: editPreferredContact,
    bio: editBio,
    currentProject: editCurrentProject,
    hometown: editHometown,
    favoriteBook: editFavBook,
    favoriteFood: editFavFood,
    favoriteHobby: editFavHobby,
    knownFor: editKnownFor,
    miqExperiences: editMiqExperiences,
    miqGrowth: editMiqGrowth,
    miqContribution: editMiqContribution,
    funFacts: editFunFacts,
  });

  const applyProfileDraftFields = (fields: ProfileFormDraftFields) => {
    setEditName(fields.name);
    setEditPhone(fields.phone);
    setEditBirthday(fields.birthday);
    setEditOccupation(fields.occupation);
    setEditProfileTitle(fields.profileTitle);
    setEditPreferredContact(fields.preferredContact);
    setEditBio(fields.bio);
    setEditCurrentProject(fields.currentProject);
    setEditHometown(fields.hometown);
    setEditFavBook(fields.favoriteBook);
    setEditFavFood(fields.favoriteFood);
    setEditFavHobby(fields.favoriteHobby);
    setEditKnownFor(fields.knownFor);
    setEditMiqExperiences(fields.miqExperiences);
    setEditMiqGrowth(fields.miqGrowth);
    setEditMiqContribution(fields.miqContribution);
    setEditFunFacts(fields.funFacts.length > 0 ? fields.funFacts : ['', '', '']);
  };

  const readProfileFormDraft = (): ProfileFormDraft | null => {
    if (!profileFormDraftKey) return null;

    const rawDraft = getStoredItem(profileFormDraftKey);
    if (!rawDraft) return null;

    try {
      const draft = JSON.parse(rawDraft) as ProfileFormDraft;
      if (!draft?.fields || Date.now() - Number(draft.updatedAt ?? 0) > PROFILE_FORM_DRAFT_TTL_MS) {
        removeStoredItem(profileFormDraftKey);
        return null;
      }
      return draft;
    } catch {
      removeStoredItem(profileFormDraftKey);
      return null;
    }
  };

  const writeProfileFormDraft = (activeSurface: ProfileFormDraft['activeSurface'], step = deepQuizStep) => {
    if (!profileFormDraftKey) return;

    setStoredItem(profileFormDraftKey, JSON.stringify({
      activeSurface,
      deepQuizStep: step,
      fields: getProfileDraftFields(),
      updatedAt: Date.now(),
    } satisfies ProfileFormDraft));
  };

  const clearProfileFormDraft = () => {
    if (profileFormDraftKey) removeStoredItem(profileFormDraftKey);
  };

  const startEditing = () => {
    const savedDraft = readProfileFormDraft();
    if (savedDraft) {
      applyProfileDraftFields(savedDraft.fields);
    } else {
      resetProfileDrafts();
    }
    setIsEditing(true);
    setDeepQuizVisible(false);
  };

  // Acting on ?focus= waits for the profile to load, and runs once per value
  // so a re-render doesn't yank the page back or reopen the editor.
  useEffect(() => {
    if (!focus || !profile || handledFocusRef.current === focus) return;
    handledFocusRef.current = focus;

    if (focus === 'about') {
      startEditing();
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    if (focus === 'garden') {
      // The layout has to have happened for skillsGardenY to mean anything.
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, skillsGardenY.current - 16),
          animated: true,
        });
      }, 260);
      return () => clearTimeout(timer);
    }
  }, [focus, profile?.id]);

  const cancelEditing = () => {
    setIsEditing(false);
    resetProfileDrafts();
    clearProfileFormDraft();
  };

  const startDeepQuiz = (step = 0) => {
    const savedDraft = readProfileFormDraft();
    if (savedDraft) {
      applyProfileDraftFields(savedDraft.fields);
    } else {
      resetProfileDrafts();
    }
    setIsEditing(false);
    const nextStep = savedDraft?.activeSurface === 'deepQuiz'
      ? savedDraft.deepQuizStep
      : step;
    setDeepQuizStep(Math.max(0, Math.min(DEEP_PROFILE_STEPS.length - 1, nextStep)));
    setDeepQuizVisible(true);
  };

  const closeDeepQuiz = () => {
    writeProfileFormDraft(null);
    setDeepQuizVisible(false);
    setDeepQuizStep(0);
  };

  useEffect(() => {
    if (restoredProfileDraftRef.current || !profile || !profileFormDraftKey) return;

    restoredProfileDraftRef.current = true;
    const savedDraft = readProfileFormDraft();
    if (!savedDraft?.activeSurface) return;

    applyProfileDraftFields(savedDraft.fields);
    if (savedDraft.activeSurface === 'deepQuiz') {
      setIsEditing(false);
      setDeepQuizStep(Math.max(0, Math.min(DEEP_PROFILE_STEPS.length - 1, savedDraft.deepQuizStep)));
      setDeepQuizVisible(true);
    } else {
      setDeepQuizVisible(false);
      setIsEditing(true);
    }
  }, [profile?.id, profileFormDraftKey]);

  useEffect(() => {
    if (!profile || !profileFormDraftKey) return;

    if (isEditing) {
      writeProfileFormDraft('edit');
      return;
    }

    if (deepQuizVisible) {
      writeProfileFormDraft('deepQuiz');
    }
  }, [
    deepQuizStep,
    deepQuizVisible,
    editBio,
    editBirthday,
    editCurrentProject,
    editFavBook,
    editFavFood,
    editFavHobby,
    editFunFacts,
    editHometown,
    editKnownFor,
    editMiqContribution,
    editMiqExperiences,
    editMiqGrowth,
    editName,
    editOccupation,
    editPhone,
    editPreferredContact,
    editProfileTitle,
    isEditing,
    profile?.id,
    profileFormDraftKey,
  ]);

  useEffect(() => {
    if (!activeSurveyStorageKey || !activeSurvey) return;
    setStoredItem(activeSurveyStorageKey, activeSurvey.id);
  }, [activeSurvey, activeSurveyStorageKey]);

  useEffect(() => {
    if (!activeSurveyStorageKey || activeSurvey || pendingSurveys.length === 0) return;

    const savedSurveyId = getStoredItem(activeSurveyStorageKey);
    const savedSurvey = pendingSurveys.find((survey) => survey.id === savedSurveyId);
    if (savedSurvey) {
      setActiveSurvey(savedSurvey);
    } else if (savedSurveyId) {
      removeStoredItem(activeSurveyStorageKey);
    }
  }, [activeSurvey, activeSurveyStorageKey, pendingSurveys]);

  const buildProfileUpdate = () => {
    const cleanBirthday = editBirthday.trim();
    const birthdayIso = cleanBirthday ? parseAmericanDate(cleanBirthday) : null;
    const funFacts = editFunFacts.map(f => f.trim()).filter(Boolean);

    return {
      cleanBirthday,
      birthdayIso,
      payload: {
        name: editName.trim(),
        phone: editPhone.trim() || null,
        birthday: birthdayIso,
        birthday_visibility: editBirthdayVisibility,
        birthday_invited_scope: editBirthdayInvitedScope,
        occupation: editOccupation.trim() || null,
        profile_title: editProfileTitle.trim() || null,
        preferred_contact: editPreferredContact,
        bio: editBio.trim() || null,
        current_project: editCurrentProject.trim() || null,
        hometown: editHometown.trim() || null,
        favorite_book: editFavBook.trim() || null,
        favorite_food: editFavFood.trim() || null,
        favorite_hobby: editFavHobby.trim() || null,
        known_for: editKnownFor.trim() || null,
        miq_experiences: editMiqExperiences.trim() || null,
        miq_growth: editMiqGrowth.trim() || null,
        miq_contribution: editMiqContribution.trim() || null,
        fun_facts: funFacts.length > 0 ? funFacts : null,
        updated_at: new Date().toISOString(),
      },
    };
  };

  const saveProfileDraft = async (failureMessage: string) => {
    if (!profile) return false;

    const { cleanBirthday, birthdayIso, payload } = buildProfileUpdate();
    if (cleanBirthday && !birthdayIso) {
      showAlert('Birthday format', 'Please enter your birthday as MM-DD-YYYY, like 10-12-1987.');
      return false;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', profile.id);

      if (error) {
        showAlert('Error', failureMessage);
        return false;
      }

      await refreshProfile();
      return true;
    } finally {
      setIsSaving(false);
    }
  };

  const saveProfile = async () => {
    const saved = await saveProfileDraft('Failed to save profile. Please try again.');
    if (saved) {
      setIsEditing(false);
      clearProfileFormDraft();
    }
  };

  const saveDeepQuiz = async ({ closeAfterSave = true } = {}) => {
    const saved = await saveProfileDraft('Failed to save your deeper profile. Please try again.');
    if (saved && closeAfterSave) {
      setDeepQuizVisible(false);
      setDeepQuizStep(0);
      clearProfileFormDraft();
    }
    return saved;
  };

  const formatBirthdayForDisplay = (dateStr?: string) => {
    if (!dateStr) return '';
    return formatDateLong(dateStr);
  };

  const pickImage = async () => {
    // Request permission
    const hasPermission = await requestMediaLibraryPermission();
    if (!hasPermission) {
      return;
    }

    // Pick an image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!profile) return;

    setIsUploadingPhoto(true);

    try {
      // Get the file extension
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${profile.id}/avatar.${ext}`;

      // Fetch the image and convert to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true,
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Add cache-busting parameter
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (updateError) {
        throw updateError;
      }

      await refreshProfile();
    } catch (error) {
      console.error('Error uploading avatar:', error);
      showAlert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    await fetchData();
    setRefreshing(false);
  };

  /**
   * The one door out of Profile, and the name of the room on the other side.
   *
   * `from` is set by whoever opened it, so closing retraces your steps.
   * Anything that arrives without one — the rail, a link in an email, the
   * what's-new strip, a bookmark — goes Home.
   *
   * This used to be `if (router.canGoBack()) router.back()`. Back hands the
   * decision to the browser's history, and the browser's history remembers the
   * public the-hive.app from before you ever signed in. Nat was inside a wish
   * setting its "This HIVE only / HIVE-Wide" options on her phone, tapped the
   * X, *"and it dropped me allllll the way out, all the way to the public site,
   * instead of just out of that wish"* (2026-08-06). Closing something is a
   * move to a room this app knows the name of, always.
   *
   * `monthly-tuneup.tsx` carries the same table for the same reason. Two
   * screens, one shape, so neither one drifts on its own.
   */
  const exit = EXITS[String(from ?? '') as ExitKey] ?? EXITS.hive;
  const closeProfile = () => {
    router.replace(exit.route as never);
  };

  const performSignOut = async () => {
    clearLastAppPath();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      console.error('Sign out error:', error);
      showAlert('Error', 'Failed to sign out. Please try again.');
      return;
    }
    router.replace('/(auth)/login');
  };

  // One dialog, both platforms (Nat 2026-08-04). This used to ask on a phone via
  // `Alert.alert` and, on web, skip straight past the question — because
  // `Alert.alert` does nothing at all in a browser, so the code took the
  // shortcut rather than showing a prompt that would never appear. Since the
  // HIVE is mostly used in a browser, the confirmation existed everywhere
  // except where it was needed.
  const handleSignOut = () => setConfirmingSignOut(true);

  const handleArchiveWish = (wish: Wish) => {
    if (!profile || !communityId || !canArchiveWish(wish)) return;

    const archiveWish = async () => {
      let query = supabase
        .from('wishes')
        .update({ status: 'replaced', is_active: false, replaced_at: new Date().toISOString() } as any)
        .eq('id', wish.id)
        .eq('community_id', communityId);

      if (!isAdmin) {
        query = query.eq('user_id', profile.id);
      }

      const { error } = await query;

      if (error) {
        showAlert('Error', 'Failed to archive wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await fetchData();
      setManagingWish(null);
    };

    // The same WishManageModal is hosted by five screens; Archive worked on
    // three of them and was inert on these two, because only these two lacked
    // the web branch.
    confirmAction({
      title: 'Archive HD wish',
      message: `Archive this HD wish from Wishes?\n\n"${wish.description}"`,
      confirmLabel: 'Archive',
      onConfirm: archiveWish,
    });
  };

  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await fetchData();
      setWishToGrant(null);
    }
    return result;
  };

  const openGrantModal = (wish: Wish) => {
    if (!profile) return;
    setWishToGrant({ ...wish, user: (wish.user ?? profile) as Profile });
  };

  const openWishDetail = useCallback((wish: Wish) => {
    if (!profile) return;
    setSelectedWish({ ...wish, user: wish.user ?? profile });
  }, [profile]);

  const handleWishSaved = async () => {
    await fetchData();
    setEditingWish(null);
  };

  const handleSkillBubbleUpdate = async (
    skill: Pick<Skill, 'id' | 'description'> & Partial<Skill>,
    updates: Pick<Skill, 'enthusiasm_level' | 'display_x' | 'display_y'>
  ) => {
    if (!profile || !communityId) return;

    setSkills((current) =>
      current.map((item) => item.id === skill.id ? { ...item, ...updates } : item)
    );

    const { error } = await supabase
      .from('skills')
      .update(updates)
      .eq('id', skill.id)
      .eq('user_id', profile.id)
      .eq('community_id', communityId);

    if (error) {
      showAlert('Error', 'Failed to update that skill flower. Please try again.');
      await fetchData();
    }
  };

  const getSkillPlantPosition = (
    skillDescription: string,
    seedIndex: number,
    groupIndex = 0,
    groupSize = 1,
    slotIndex?: number
  ) => {
    if (slotIndex !== undefined) {
      const safeSlot = Math.min(SKILLS_GARDEN_CAPACITY - 1, Math.max(0, Math.round(slotIndex)));
      return {
        display_x: Number((safeSlot / Math.max(1, SKILLS_GARDEN_CAPACITY - 1)).toFixed(4)),
        display_y: Number((0.72 + (safeSlot % 2 === 0 ? 0.02 : -0.02)).toFixed(4)),
      };
    }

    const seedValue = Array.from(skillDescription).reduce(
      (sum, character) => sum + character.charCodeAt(0),
      seedIndex * 31
    );

    if (groupSize > 1) {
      const columns = Math.min(groupSize, Math.max(groupSize <= 5 ? groupSize : 3, Math.ceil(Math.sqrt(groupSize * 1.45))));
      const rows = Math.ceil(groupSize / columns);
      const row = Math.floor(groupIndex / columns);
      const column = groupIndex % columns;
      const rowOffset = rows > 1 && row % 2 === 1 ? 0.32 / columns : 0;
      const xJitter = (((seedValue * 17) % 100) / 100 - 0.5) * (0.2 / columns);
      const yJitter = (((seedValue * 29) % 100) / 100 - 0.5) * 0.045;

      return {
        display_x: Number(Math.min(0.92, Math.max(0.08, (column + 0.5) / columns + rowOffset + xJitter)).toFixed(4)),
        display_y: Number(Math.min(0.9, Math.max(0.52, 0.55 + (row / Math.max(1, rows - 1)) * 0.3 + yJitter)).toFixed(4)),
      };
    }

    return {
      display_x: Number((0.08 + ((seedValue * 17) % 84) / 100).toFixed(4)),
      display_y: Number((0.52 + ((seedValue * 29) % 36) / 100).toFixed(4)),
    };
  };

  const handlePlantSkill = async (
    skillDescription: string,
    options?: { enthusiasmLevel?: number; originSlot?: number }
  ) => {
    if (!profile || !communityId) return;

    const existingSkill = skills.find(
      (skill) => skill.description.trim().toLowerCase() === skillDescription.trim().toLowerCase()
    );
    if (existingSkill && hasBloomingSkill(existingSkill)) return;

    const bloomingCount = skills.filter(hasBloomingSkill).length;
    if (bloomingCount >= SKILLS_GARDEN_CAPACITY) return;

    const seedIndex = bloomingCount + 1;
    const position = getSkillPlantPosition(skillDescription, seedIndex, 0, 1, options?.originSlot);
    const updates = {
      enthusiasm_level: options?.enthusiasmLevel ?? 1,
      display_x: position.display_x,
      display_y: position.display_y,
    };

    if (existingSkill) {
      setSkills((current) =>
        current.map((item) => item.id === existingSkill.id ? { ...item, ...updates } : item)
      );

      const { error } = await supabase
        .from('skills')
        .update(updates)
        .eq('id', existingSkill.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        showAlert('Error', 'Failed to plant that skill. Please try again.');
        await fetchData();
      }
      return;
    }

    const { data, error } = await supabase
      .from('skills')
      .insert({
        user_id: profile.id,
        community_id: communityId,
        description: skillDescription,
        raw_input: skillDescription,
        extracted_from: 'manual',
        ...updates,
      })
      .select('*')
      .single();

    if (error) {
      showAlert('Error', 'Failed to plant that skill. Please try again.');
      return;
    }

    if (data) {
      setSkills((current) => [...current, data as Skill]);
    }
  };

  const handlePlantSkills = async (
    seeds: Array<{ description: string; enthusiasmLevel?: number; slotIndex?: number }>,
    options?: { mode?: 'fill' | 'replace' }
  ): Promise<number | null> => {
    if (!profile || !communityId || seeds.length === 0) return 0;

    const mode = options?.mode ?? 'fill';
    const activeNames = new Set(
      skills
        .filter(hasBloomingSkill)
        .map(skill => skill.description.trim().toLowerCase())
    );
    const bloomingCount = mode === 'replace' ? 0 : skills.filter(hasBloomingSkill).length;
    const openSlots = Math.max(0, SKILLS_GARDEN_CAPACITY - bloomingCount);
    if (openSlots === 0) return 0;

    const uniqueSeeds = seeds.filter((seed, index, all) => {
      const normalized = seed.description.trim().toLowerCase();
      return (mode === 'replace' || !activeNames.has(normalized)) &&
        all.findIndex(item => item.description.trim().toLowerCase() === normalized) === index;
    }).slice(0, openSlots);

    if (uniqueSeeds.length === 0) return 0;

    if (mode === 'replace') {
      const { error: resetError } = await supabase
        .from('skills')
        .update({
          enthusiasm_level: 0,
          display_x: null,
          display_y: null,
        })
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (resetError) {
        showAlert('Error', 'Failed to clear your current garden. Please try again.');
        return null;
      }

      setSkills((current) =>
        current.map((skill) => ({
          ...skill,
          enthusiasm_level: 0,
          display_x: null,
          display_y: null,
        }))
      );
    }

    const existingByName = new Map(
      skills.map(skill => [skill.description.trim().toLowerCase(), skill])
    );
    const updatedRows: Skill[] = [];
    const rowsToInsert: Array<{
      user_id: string;
      community_id: string;
      description: string;
      raw_input: string;
      extracted_from: 'manual';
      enthusiasm_level: number;
      display_x: number;
      display_y: number;
    }> = [];

    for (const [index, seed] of uniqueSeeds.entries()) {
      const position = getSkillPlantPosition(
        seed.description,
        bloomingCount + index + 1,
        index,
        uniqueSeeds.length,
        seed.slotIndex
      );
      const plantedSkill = {
        enthusiasm_level: seed.enthusiasmLevel ?? (mode === 'replace' ? 4 : 1),
        display_x: position.display_x,
        display_y: position.display_y,
      };
      const existingSkill = existingByName.get(seed.description.trim().toLowerCase());

      if (existingSkill) {
        const { data, error } = await supabase
          .from('skills')
          .update(plantedSkill)
          .eq('id', existingSkill.id)
          .eq('user_id', profile.id)
          .eq('community_id', communityId)
          .select('*')
          .single();

        if (error) {
          showAlert('Error', 'Failed to plant that garden. Please try again.');
          await fetchData();
          return null;
        }

        if (data) updatedRows.push(data as Skill);
      } else {
        rowsToInsert.push({
          ...plantedSkill,
          user_id: profile.id,
          community_id: communityId,
          description: seed.description,
          raw_input: seed.description,
          extracted_from: 'manual' as const,
        });
      }
    }

    let insertedRows: Skill[] = [];
    if (rowsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('skills')
        .insert(rowsToInsert)
        .select('*');

      if (error) {
        showAlert('Error', 'Failed to plant that garden. Please try again.');
        await fetchData();
        return null;
      }

      insertedRows = (data as Skill[] | null) ?? [];
    }

    const plantedRows = [...updatedRows, ...insertedRows];
    if (plantedRows.length > 0) {
      setSkills((current) => {
        const byId = new Map(current.map(skill => [skill.id, skill]));
        plantedRows.forEach(skill => byId.set(skill.id, skill));
        return Array.from(byId.values());
      });
    }

    return plantedRows.length;
  };

  const handleReplantGarden = async () => {
    if (replantingGarden) return;

    const unplantedSkills = skills.filter((skill) => !hasBloomingSkill(skill));
    if (unplantedSkills.length === 0) return;

    const openSlots = Math.max(0, SKILLS_GARDEN_CAPACITY - skills.filter(hasBloomingSkill).length);
    if (openSlots === 0) return;

    setReplantNotice(null);
    setReplantingGarden(true);
    try {
      const planted = await handlePlantSkills(
        unplantedSkills.map((skill) => ({ description: skill.description, enthusiasmLevel: 1 })),
        { mode: 'fill' }
      );

      if (planted === null) {
        setReplantNotice('Something went wrong while replanting — please try again.');
      } else if (unplantedSkills.length > openSlots) {
        setReplantNotice(
          `Planted ${planted} — the garden is full; ${unplantedSkills.length - planted} still saved.`
        );
      }
    } finally {
      setReplantingGarden(false);
    }
  };

  const handleDeleteSkill = (skill: Pick<Skill, 'id' | 'description'> & Partial<Skill>) => {
    if (!profile || !communityId) return;

    const deleteSkill = async () => {
      const { error } = await supabase
        .from('skills')
        .delete()
        .eq('id', skill.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        showAlert('Error', 'Failed to remove that skill. Please try again.');
        return;
      }

      setSkills((current) => current.filter((item) => item.id !== skill.id));
    };

    deleteSkill();
  };

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId || !canDeleteWish(wish)) return;

    const deleteWish = async () => {
      const { error } = await deleteWishById({
        wishId: wish.id,
        communityId,
        ownerId: isAdmin ? null : profile.id,
      });

      if (error) {
        showAlert('Error', 'Failed to delete wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await fetchData();
      setManagingWish(null);
    };

    // Same question, both platforms — this file had hand-rolled the browser
    // half a few lines above Archive, which had none at all.
    confirmAction({
      title: 'Delete wish',
      message: `Delete this wish?\n\n"${wish.description}"`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: deleteWish,
    });
  };

  const handleRefineWithClive = (roughWish: string) => {
    setAddWishModalVisible(false);
    // Navigate to chat with the rough wish as context
    router.push({
      pathname: '/(app)',
      params: { refineWish: roughWish },
    });
  };

  /**
   * Whether the 3MIQ already has anything in it.
   *
   * Read up here, above this file's `if (!profile) return null`, because the
   * Clive button below uses it for two things at once: the words on the button
   * and the message the button sends.
   */
  const hasProfileMiq = !!profile && [
    (profile as any).miq_experiences,
    (profile as any).miq_growth,
    (profile as any).miq_contribution,
  ].some(value => hasProfileText(value));
  /** "Refine" once there is something to refine, "Find" while it is blank. */
  const miq3ActionLabel = hasProfileMiq ? 'Refine with Clive' : 'Find with Clive';

  /**
   * Hand the 3MIQ to Clive — as a first draft or as a second one.
   *
   * Nat, 2026-08-06: *"if you've already filled it out, maybe this button can
   * swap to say 'refine with clive' and if you havent done it yet, maybe it can
   * say 'find with clive'?"* The words on the button change, and so does what
   * Clive is asked, because opening a chat that says "help me discover" to
   * somebody who answered all three months ago is the app not having read its
   * own page. `miq3ActionLabel` above is the label; this is the same fork.
   */
  const handleFind3MiqWithClive = () => {
    router.push({
      pathname: '/(app)',
      params: {
        prefill: hasProfileMiq
          ? 'Help me refine my 3 Most Important Questions. Read back what I have for experiences, growth and contribution, and help me make each one sharper.'
          : 'Help me discover my 3 Most Important Questions. I want one for experiences, one for growth, and one for contribution.',
      },
    });
  };

  const handleProfileStepPress = (label: string) => {
    if (label === 'Answer your 3MIQ') {
      handleFind3MiqWithClive();
      return;
    }
    if (label === 'Add a photo') {
      void pickImage();
      return;
    }
    if (label === 'Seed your Skills Garden' || label === 'Add a skill') {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, skillsGardenY.current - 16),
        animated: true,
      });
      return;
    }
    if (label === 'Share a wish') {
      setAddWishModalVisible(true);
      return;
    }
    if (label === "Complete this month's check-in") {
      // The unified tune-up flow is the front door for the monthly check-in.
      router.push({ pathname: '/monthly-tuneup', params: { from: 'profile' } } as any);
      return;
    }
    if (
      label === 'Choose your title'
      || label === 'Add your birthday'
      || label === 'Share what HIVErs should ask you about'
      || label === 'Add your hometown'
    ) {
      startDeepQuiz(0);
      return;
    }
    if (
      label === 'Write a bio'
      || label === 'Add your current focus'
    ) {
      startDeepQuiz(1);
      return;
    }
    if (
      label === 'Add favorites'
      || label === 'Add a fun fact'
    ) {
      startDeepQuiz(2);
      return;
    }
    startEditing();
  };

  if (!profile) return null;

  const isProfilePhone = screenWidth < 640;
  const profileWishPanelHeight = isProfilePhone ? 500 : 520;
  const bloomingSkillCount = skills.filter(hasBloomingSkill).length;
  const unplantedSkillCount = skills.length - bloomingSkillCount;
  const gardenOpenSlots = Math.max(0, SKILLS_GARDEN_CAPACITY - bloomingSkillCount);
  const deepQuizCanGoBack = deepQuizStep > 0;
  const deepQuizIsLastStep = deepQuizStep === DEEP_PROFILE_STEPS.length - 1;
  const deepQuizProgress = `${deepQuizStep + 1}/${DEEP_PROFILE_STEPS.length}`;
  const hasAny3MiqDraft = [
    editMiqExperiences,
    editMiqGrowth,
    editMiqContribution,
  ].some(value => value.trim().length > 0);
  const deepQuizPrimaryLabel = deepQuizIsLastStep
    ? hasAny3MiqDraft ? 'Save & finish' : 'Save without 3MIQ'
    : 'Save & continue';
  const profileHoneycombItems = [
    { label: 'Title', value: (profile as any).profile_title || profile.occupation },
    { label: 'From', value: (profile as any).hometown },
    { label: 'Birthday', value: formatBirthdayForDisplay(profile.birthday) },
    { label: 'Project', value: (profile as any).current_project },
    // Collected in the monthly check-in, not typed here — it changes too often
    // to survive as something you'd remember to come back and edit.
    { label: 'Reading', value: (profile as any).currently_reading },
    { label: 'Book', value: (profile as any).favorite_book },
    { label: 'Food', value: (profile as any).favorite_food },
    { label: 'Hobby', value: (profile as any).favorite_hobby },
    ...(((profile as any).fun_facts as string[] | null) ?? []).map((fact: string, idx: number) => ({
      label: `Fun Fact ${idx + 1}`,
      value: fact,
    })),
  ];
  const profileMiq = {
    experiences: (profile as any).miq_experiences as string | null | undefined,
    growth: (profile as any).miq_growth as string | null | undefined,
    contribution: (profile as any).miq_contribution as string | null | undefined,
  };
  const publicWishes = wishes.filter(wish => wish.status === 'public' && wish.is_active !== false);
  const grantedWishes = wishes.filter(wish => wish.status === 'fulfilled');
  const visibleProfileWishes = wishStatusTab === 'granted'
    ? grantedWishes
    : publicWishes;
  const profileWishEmptyText = wishes.length === 0
    ? 'No wishes yet. What do you need help with?'
    : wishStatusTab === 'granted'
      ? 'No granted HD wishes yet.'
      : 'No HD wishes yet.';
  const renderDeepQuizField = ({
    label,
    value,
    onChangeText,
    placeholder,
    multiline = false,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    multiline?: boolean;
  }) => (
    <View style={{ marginBottom: 14 }}>
      {/* The little gold caps stay — they are how this walk-through labels its
          steps. Only the box below changed: it is the shared one now, so the
          mic sits inside its own border on the field's line instead of hanging
          off the bottom on a strip of its own. */}
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#9a7a3a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </Text>
      <ComposerBar
        tone="light"
        variant="form"
        value={value}
        // The shared bar hands back either the new text or a function that
        // works out the new text from the old (which is what talking does).
        onChangeText={(next) => onChangeText(typeof next === 'function' ? next(value) : next)}
        placeholder={placeholder}
        multiline={multiline}
        minHeight={multiline ? 86 : 44}
        // Nothing here sends anything, so Enter should make a new line.
        submitOnEnterKey={false}
      />
    </View>
  );

  const renderDeepQuizBirthdayField = () => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#9a7a3a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Birthday
      </Text>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.55)',
          backgroundColor: '#fffdf7',
          paddingHorizontal: 12,
          paddingVertical: 12,
        }}
      >
        <BirthdayPicker
          value={editBirthday}
          onChange={setEditBirthday}
        />
      </View>
    </View>
  );

  const handleDeepQuizSaveAndContinue = () => {
    void (async () => {
      const saved = await saveDeepQuiz({ closeAfterSave: deepQuizIsLastStep });
      if (!saved || deepQuizIsLastStep) {
        return;
      }
      setDeepQuizStep(step => Math.min(DEEP_PROFILE_STEPS.length - 1, step + 1));
    })();
  };

  const handleDeepQuizSaveAndExit = () => {
    void saveDeepQuiz({ closeAfterSave: true });
  };

  const renderDeepQuizStep = () => {
    if (deepQuizStep === 0) {
      return (
        <>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
            Start with the visible you
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20, color: '#7d715f', marginBottom: 18 }}>
            These are the pieces people understand at a glance when they open your honeycomb.
          </Text>
          {renderDeepQuizField({
            label: 'Self-appointed title',
            value: editProfileTitle,
            onChangeText: setEditProfileTitle,
            placeholder: 'Founder, Tarot Reader, Spreadsheet Sorcerer...',
          })}
          {renderDeepQuizField({
            label: 'Hometown',
            value: editHometown,
            onChangeText: setEditHometown,
            placeholder: 'Olympia, WA',
          })}
          {renderDeepQuizBirthdayField()}
          {renderDeepQuizField({
            label: 'HIVErs should ask me about',
            value: editKnownFor,
            onChangeText: setEditKnownFor,
            placeholder: 'Digital organization, party planning, weirdly good pep talks...',
            multiline: true,
          })}
        </>
      );
    }

    if (deepQuizStep === 1) {
      return (
        <>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
            What is alive right now?
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20, color: '#7d715f', marginBottom: 18 }}>
            This gives HIVE a reason to know what to bring you, send you, or ask you about this month.
          </Text>
          {renderDeepQuizField({
            label: 'Current focus',
            value: editCurrentProject,
            onChangeText: setEditCurrentProject,
            placeholder: 'My biggest focus right now is...',
            multiline: true,
          })}
          {renderDeepQuizField({
            label: 'Bio',
            value: editBio,
            onChangeText: setEditBio,
            placeholder: 'A few sentences that help people feel like they actually know you.',
            multiline: true,
          })}
        </>
      );
    }

    if (deepQuizStep === 2) {
      return (
        <>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
            Add the texture
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20, color: '#7d715f', marginBottom: 18 }}>
            Favorites and tiny facts make a sparse profile feel human fast.
          </Text>
          {renderDeepQuizField({
            label: 'Favorite food',
            value: editFavFood,
            onChangeText: setEditFavFood,
            placeholder: 'Ramen, tacos, croissants...',
          })}
          {renderDeepQuizField({
            label: 'Favorite book',
            value: editFavBook,
            onChangeText: setEditFavBook,
            placeholder: 'The book you keep recommending lately',
          })}
          {renderDeepQuizField({
            label: 'Favorite hobby',
            value: editFavHobby,
            onChangeText: setEditFavHobby,
            placeholder: 'Crocheting, plants, chess...',
          })}
          {editFunFacts.map((fact, index) => (
            <View key={`deep-fun-fact-${index}`}>
              {renderDeepQuizField({
                label: `Fun fact ${index + 1}`,
                value: fact,
                onChangeText: (text) => {
                  const next = [...editFunFacts];
                  next[index] = text;
                  setEditFunFacts(next);
                },
                placeholder: index === 0 ? 'Something people would not guess at first glance' : 'Another tiny, delightful detail',
                multiline: true,
              })}
            </View>
          ))}
        </>
      );
    }

    return (
      <>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
          Your 3MIQ
        </Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20, color: '#7d715f', marginBottom: 14 }}>
          These can stay rough. They are meant to help Clive, the boards, and HIVE understand what matters most to you.
        </Text>
        <Pressable
          onPress={handleFind3MiqWithClive}
          style={{ alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(222,193,129,0.72)', backgroundColor: '#fffdf7', paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 }}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>
            {hasProfileMiq ? 'Refine these with Clive' : 'Find these with Clive'}
          </Text>
        </Pressable>
        {renderDeepQuizField({
          label: 'Experiences',
          value: editMiqExperiences,
          onChangeText: setEditMiqExperiences,
          placeholder: 'What do I want to experience in this lifetime?',
          multiline: true,
        })}
        {renderDeepQuizField({
          label: 'Growth',
          value: editMiqGrowth,
          onChangeText: setEditMiqGrowth,
          placeholder: 'How do I want to grow?',
          multiline: true,
        })}
        {renderDeepQuizField({
          label: 'Contribution',
          value: editMiqContribution,
          onChangeText: setEditMiqContribution,
          placeholder: 'How do I want to contribute?',
          multiline: true,
        })}
      </>
    );
  };

  const renderWishCard = (wish: Wish) => (
    <WishCombCard
      key={wish.id}
      wish={wish}
      ownerId={profile.id}
      ownerName={profile.name}
      ownerAvatarUrl={profile.avatar_url}
      compact={isProfilePhone}
      onOpen={(selectedWish) => openWishDetail(selectedWish as Wish)}
      onManage={canOpenWishActions(wish) ? (selectedWish) => setManagingWish(selectedWish as Wish) : undefined}
    />
  );

  const wishManageModal = (
    <WishManageModal
      visible={!!managingWish}
      wish={managingWish}
      onClose={() => setManagingWish(null)}
      canGrant={!!managingWish && canGrantWish(managingWish)}
      canEdit={!!managingWish && canEditWish(managingWish)}
      canArchive={!!managingWish && canArchiveWish(managingWish)}
      canDelete={!!managingWish && canDeleteWish(managingWish)}
      canRefine={!!managingWish && canRefineWish(managingWish)}
      onGrant={openGrantModal}
      onEdit={(wish) => setEditingWish(wish)}
      onArchive={handleArchiveWish}
      onDelete={handleDeleteWish}
      onRefine={(wish) => handleRefineWithClive(wish.description)}
    />
  );

  if (selectedWish) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
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
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={immersiveSkillsGarden ? [] : ['top']}>
      {!compactProfileLandscape && (
        <AppHeader
          title="Profile"
          rightElement={(
            <Pressable
              onPress={closeProfile}
              accessibilityRole="button"
              accessibilityLabel="Close profile"
              className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          )}
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <BounceScrollView
        ref={scrollViewRef}
        // The skills garden takes the whole screen and handles its own drags,
        // so scrolling is off there and the bounce goes with it.
        enabled={!immersiveSkillsGarden}
        className="flex-1"
        contentContainerClassName={immersiveSkillsGarden ? 'p-0' : compactProfileLandscape ? 'p-1' : 'p-4'}
        contentContainerStyle={immersiveSkillsGarden ? { flexGrow: 1 } : undefined}
        scrollEnabled={!immersiveSkillsGarden}
        refreshControl={!immersiveSkillsGarden
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
          : undefined}
      >
        {!immersiveSkillsGarden && (
        <>
        {/* Backstage marker — the one place that's yours alone. The member
            card on the Members tab is the audience view; this is the wings. */}
        <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 10 }}>
          <Text style={{ fontSize: 11 }}>🛠</Text>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', color: '#8e6f35' }}>
            Backstage · only you see this page
          </Text>
        </View>
        {/* Profile Header with Bee Progress Arc */}
        <FadeIn>
          {(() => {
            const seededSkillsGarden = skills.some(hasBloomingSkill);
            const checks = [
              { label: 'Add a photo', actionLabel: 'Photo', done: !!profile.avatar_url },
              { label: 'Choose your title', actionLabel: 'Title', done: hasProfileText((profile as any).profile_title) },
              { label: 'Add your birthday', actionLabel: 'Birthday', done: !!profile.birthday },
              { label: 'Add your phone', actionLabel: 'Phone', done: hasProfileText(profile.phone) },
              { label: 'Add your hometown', actionLabel: 'Hometown', done: hasProfileText((profile as any).hometown) },
              { label: 'Share what HIVErs should ask you about', actionLabel: 'Ask me about', done: hasProfileText((profile as any).known_for) },
              { label: 'Write a bio', actionLabel: 'Bio', done: hasProfileText((profile as any).bio) },
              { label: 'Add your current focus', actionLabel: 'Current focus', done: hasProfileText((profile as any).current_project) },
              {
                label: 'Add favorites',
                actionLabel: 'Favorites',
                done: ['favorite_food', 'favorite_book', 'favorite_hobby'].some(key => hasProfileText((profile as any)[key])),
              },
              { label: 'Add a fun fact', actionLabel: 'Fun fact', done: hasProfileListItem((profile as any).fun_facts) },
              { label: 'Answer your 3MIQ', actionLabel: '3MIQ', done: !!((profile as any).miq_experiences && (profile as any).miq_growth && (profile as any).miq_contribution) },
              { label: "Complete this month's check-in", actionLabel: 'Check-in', done: pendingSurveys.length === 0 },
              { label: 'Seed your Skills Garden', actionLabel: 'Skills Garden', done: seededSkillsGarden },
              { label: 'Share a wish', actionLabel: 'Wish', done: wishes.length > 0 },
            ];
          const done = checks.filter(c => c.done).length;
          const score = done / checks.length;
          const nextMissing = checks.find(c => !c.done);
          const isComplete = done === checks.length;
          const percent = Math.round(score * 100);
          const missing = checks.filter(c => !c.done);

          return (
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              {/* Bee route + avatar */}
              <View style={{ alignItems: 'center' }}>
                <BeeProgressArc profileCompletionPercent={percent} size={260} />
                <View style={{ marginTop: -44, alignItems: 'center', zIndex: 1 }}>
                  <Pressable onPress={pickImage} disabled={isUploadingPhoto} style={{ position: 'relative' }} className="active:opacity-80">
                    <Avatar name={profile.name} url={profile.avatar_url} size={80} />
                    {isUploadingPhoto ? (
                      <View className="absolute inset-0 bg-black/40 rounded-full items-center justify-center">
                        <ActivityIndicator size="small" color="#fffdf5" />
                      </View>
                    ) : (
                      <View className="absolute bottom-0 right-0 bg-gold w-6 h-6 rounded-full items-center justify-center border-2 border-cream">
                        <Text className="text-white text-xs">+</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>

              {/* Change photo */}
              <Pressable onPress={pickImage} disabled={isUploadingPhoto} style={{ marginTop: 8 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#bd9348' }}>
                  Change Photo
                </Text>
              </Pressable>

              {/* Name & info */}
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginTop: 6 }}>
                {profile.name}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d99' }}>
                {profile.email}
              </Text>
              {((profile as any).profile_title || profile.occupation) && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#2d2d2d80', marginTop: 2 }}>
                  {(profile as any).profile_title || profile.occupation}
                </Text>
              )}
              {communityRole && communityRole !== 'member' && (
                <View style={{ backgroundColor: '#fdf3dc', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', textTransform: 'capitalize' }}>
                    {communityRole}
                  </Text>
                </View>
              )}

              {/* Progress hint */}
              {isComplete ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#5ab85a', marginTop: 8 }}>
                  🎉 Profile complete!
                </Text>
              ) : nextMissing ? (
                <>
                  {/* A first-timer gets told what this IS, once.
                      Nat asked whether the welcome email should walk somebody
                      through setting up. It should not — an email walkthrough is
                      read once, in a different window from the thing it
                      describes, and cannot tick anything off. This checklist has
                      existed all along and simply never introduced itself, so a
                      new member met a percentage with no explanation. Below 35%
                      is, in practice, somebody who has just arrived. */}
                  {percent < 35 ? (
                    <Text
                      style={{
                        fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19,
                        color: '#8a6b30', marginTop: 10, textAlign: 'center',
                        paddingHorizontal: 16, maxWidth: 420,
                      }}
                    >
                      Welcome! This is your corner of the HIVE. Fill it in a bit at a time —
                      nothing has to be perfect, and every piece helps somebody find you.
                    </Text>
                  ) : null}
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', marginTop: 8 }}>
                    {percent}% filled out
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 3, textAlign: 'center', paddingHorizontal: 12 }}>
                    Tap one to fill it in — each moves your bee closer to the hive 🐝
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 10, maxWidth: Math.min(screenWidth - 28, 560) }}>
                    {/* Only the pieces you have NOT filled in appear here — a
                        finished one leaves the row rather than sitting about
                        looking like work. Each still wears the empty ring, so
                        this list and the check-in button below it say
                        "not done yet" the same way. */}
                    {/* The check-in has its own big button right below — no twin chip */}
                    {missing.filter(item => item.label !== "Complete this month's check-in").map(item => (
                      <Pressable
                        key={item.label}
                        onPress={() => handleProfileStepPress(item.label)}
                        className="active:opacity-70"
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          backgroundColor: '#fffaf0',
                          borderWidth: 1,
                          borderColor: 'rgba(222,193,129,0.65)',
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          shadowColor: '#bd9348',
                          shadowOpacity: 0.08,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 3 },
                        }}
                      >
                        <TodoMark done={false} size={11} />
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>{item.actionLabel}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {monthlyCheckInSurvey ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/monthly-tuneup', params: { from: 'profile' } } as any)}
                  className="active:opacity-75"
                  style={{
                    marginTop: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: monthlyCheckInIsEditing ? '#fffdf5' : '#fffaf0',
                    borderWidth: 1,
                    borderColor: monthlyCheckInIsEditing ? 'rgba(142,122,94,0.24)' : 'rgba(222,193,129,0.65)',
                    borderRadius: 14,
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                    maxWidth: Math.min(screenWidth - 28, 420),
                  }}
                >
                  {/* Once you have answered, the row recedes: the ring fills in
                      with a quiet tick, the words are struck through, and the
                      line underneath is what invites you back in. Before you
                      have answered it is an empty ring — a box nobody has
                      ticked. */}
                  <TodoMark done={monthlyCheckInIsEditing} size={18} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: 'Lato_700Bold',
                        fontSize: 12,
                        color: monthlyCheckInIsEditing ? '#8e7a5e' : '#bd9348',
                        textDecorationLine: monthlyCheckInIsEditing ? 'line-through' : 'none',
                      }}
                    >
                      {monthlyCheckInIsEditing ? "This month's check-in" : "Complete this month's check-in"}
                    </Text>
                    {monthlyCheckInIsEditing && monthlyCheckInResponse?.submitted_at ? (
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#8e7a5e', marginTop: 2 }}
                      >
                        Submitted {formatDateShort(monthlyCheckInResponse.submitted_at)} · tap to review or update
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ) : null}
            </View>
          );
        })()}
        </FadeIn>

        {/* Whether the rest of the HIVEs can see you.
            Nat, 2026-08-04: "I want to make my profile visible HIVE-Wide, but i
            dont see that option anywhere in here."

            It existed — on the Settings page. Which is a defensible place for
            it and the wrong one, because it is a fact about THIS page: it
            decides whether this profile shows up when somebody stands at
            HIVE-Wide and looks at who is around. So it lives here, where you
            are when you think of it. Settings keeps its copy and the HIVE-Wide
            members list has one too; all three write `profiles.profile_scope`,
            so they can't disagree.

            Nat, 2026-08-05: "i love this, i think its unnecessarily long, we
            can shorten it and center it." It was a full-width white bar with
            two sentences in it for a switch with two states, so it is now a
            small pill that sits in the middle of the page and says the state
            in three words. The globe emoji went with it: the drawn Earth is
            HIVE-Wide's mark everywhere else in the app, and an emoji globe
            beside it is a second planet. The padlock stays — a lock is the
            right opposite of a world. */}
        <FadeIn delay={90}>
        <View className="items-center mb-6">
        <Pressable
          onPress={() => void toggleHiveWideVisibility()}
          disabled={savingHiveWideVisibility}
          accessibilityRole="switch"
          accessibilityState={{ checked: listedHiveWide }}
          className="flex-row items-center bg-white active:opacity-80"
          style={{
            alignSelf: 'center',
            gap: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
            paddingLeft: 14,
            paddingRight: 8,
            paddingVertical: 7,
            opacity: savingHiveWideVisibility ? 0.6 : 1,
          }}
        >
          {/* Both marks live in the same 20-wide box so the words don't shuffle
              sideways when you flip the switch. */}
          <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
            {listedHiveWide ? <WorldMark size={20} /> : <Text style={{ fontSize: 15 }}>🔒</Text>}
          </View>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13 }} className="text-charcoal">
            {listedHiveWide ? 'Visible HIVE-Wide' : 'Only your HIVEs see you'}
          </Text>
          {/* The pill is drawn from `SWITCH_LOOK`, the same numbers
              `components/ui/Switch.tsx` uses, so this reads as the switch from
              Settings rather than a near-miss of it. It had drifted to 46×27
              with a 21 knob and its own grey, against the house 44×26/20 — close
              enough that nobody would call it wrong and far enough that the two
              never looked like one control. The row shape stays compact and
              centred, which is what Nat asked for on 2026-08-05; only the
              drawing of the switch itself is shared. */}
          <View
            style={{
              width: SWITCH_LOOK.trackWidth,
              height: SWITCH_LOOK.trackHeight,
              borderRadius: SWITCH_LOOK.trackHeight / 2,
              padding: SWITCH_LOOK.inset,
              backgroundColor: listedHiveWide ? '#bd9348' : 'rgba(49,49,48,0.18)',
              alignItems: listedHiveWide ? 'flex-end' : 'flex-start',
            }}
          >
            <View style={{ width: SWITCH_LOOK.knob, height: SWITCH_LOOK.knob, borderRadius: SWITCH_LOOK.knob / 2, backgroundColor: '#fffdf5' }} />
          </View>
        </Pressable>
        {/* The receipt. A pill that slides under your finger looks the same
            whether or not anything was stored, so it says so in words for a few
            seconds and then leaves. */}
        {hiveWideSaved && (
          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18,
              color: '#8e7a5e', marginTop: 8, textAlign: 'center',
            }}
          >
            {listedHiveWide
              ? 'Saved. You are in the HIVE-Wide members list now.'
              : 'Saved. You show up only inside your own HIVEs now.'}
          </Text>
        )}
        </View>
        </FadeIn>

        {/* Profile Information */}
        <FadeIn delay={100}>
        <View className="mb-6">
          {/* A title on the left, the pencil on the right, one line — the shape
              the Skills Garden below already uses.
              Nat, 2026-08-06: the pencil "floats above and right of the section
              title instead of sitting on the same line". It did: the row was
              `justify-end` with nothing in it but the button, so it hung in the
              air over "HIVErs should ask me about" with no line of its own.
              "Your Card" is her word for this block — of a member's profile,
              2026-08-06: "like we're pulling up their card". */}
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              Your Card
            </Text>
            {!isEditing ? (
              // The pencil, like everywhere else (Nat 2026-08-04: "all edit
              // buttons should be the same pencil"). This one said "Edit" in
              // gold text while the block directly above it used the honey
              // pencil, so one page had two vocabularies for one verb.
              <EditButton onPress={startEditing} accessibilityLabel="Edit your profile" />
            ) : (
              <View className="flex-row">
                <Pressable onPress={cancelEditing} className="px-3 py-1 mr-2 active:opacity-70">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/60">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveProfile}
                  disabled={isSaving}
                  className="px-3 py-1 active:opacity-70"
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">
                    {isSaving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {!isEditing ? (
            <View className="gap-4">
              <ProfileShowcase
                honeycombItems={profileHoneycombItems}
                knownFor={(profile as any).known_for}
                bio={(profile as any).bio}
                miq={profileMiq}
                knownForPlaceholder="Add the thing HIVErs should ask you about."
                bioPlaceholder="Add your bio here."
                miqPlaceholder="Experiences, growth, and contribution are still open. Clive can walk you through them."
                miqActionLabel={miq3ActionLabel}
                onMiqAction={handleFind3MiqWithClive}
                showMiqWhenEmpty
              />
            </View>
          ) : (
          <View className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Name */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Name</Text>
              {isEditing ? (
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your name"
                  multiline={false}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {profile.name}
                </Text>
              )}
            </View>

            {/* Email (read-only) */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Email</Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{profile.email}</Text>
            </View>

            {/* Phone */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Phone</Text>
              {isEditing ? (
                // The one box on this page that is not made of words, so it is
                // the one box with no microphone — reading a phone number aloud
                // to a speech recogniser is not a thing anybody wants. It wears
                // the same white fill, the same gold hairline and the same
                // corner as every field around it, so it still reads as part of
                // one set of controls.
                <TextInput
                  value={editPhone}
                  onChangeText={(text) => setEditPhone(formatPhoneNumber(text))}
                  style={{
                    fontFamily: FIELD_LOOK.font,
                    borderWidth: 1,
                    borderColor: FIELD_BORDER,
                    borderRadius: FIELD_LOOK.radius,
                    backgroundColor: FIELD_LOOK.fill,
                    outlineStyle: 'none',
                    caretColor: FIELD_LOOK.ink,
                  } as any}
                  className="text-charcoal text-base px-4 py-3"
                  placeholder="(555) 555-5555"
                  placeholderTextColor={FIELD_LOOK.placeholder}
                  selectionColor={FIELD_LOOK.ink}
                  keyboardType="phone-pad"
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {profile.phone ? formatPhoneNumber(profile.phone) : 'Not set'}
                </Text>
              )}
            </View>

            {/* Birthday */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Birthday</Text>
              {isEditing ? (
                <>
                  <BirthdayPicker
                    value={editBirthday}
                    onChange={setEditBirthday}
                  />
                  {/* Who gets to see it, and who it's for — the same ladder
                      events use (migration 164). Only shows once there's a
                      birthday to set it for. Nat, 2026-08-11: "I friggin love
                      my bday" — she wants hers travelling HIVE-Wide and
                      public, which used to be impossible; everyone else stays
                      on 'This HIVE only' until they say otherwise. Nobody but
                      the owner of this profile can ever reach this control. */}
                  {editBirthday.trim() ? (
                    <View style={{ marginTop: 14 }}>
                      <EventScopeFields
                        visibility={editBirthdayVisibility}
                        onVisibilityChange={setEditBirthdayVisibility}
                        invited={editBirthdayInvitedScope}
                        onInvitedChange={setEditBirthdayInvitedScope}
                      />
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {formatBirthdayForDisplay(profile.birthday) || 'Not set'}
                </Text>
              )}
            </View>

            {/* Self-appointed title */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Self-appointed title</Text>
              {isEditing ? (
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editProfileTitle}
                  onChangeText={setEditProfileTitle}
                  placeholder="Founder, Tarot Reader, Spreadsheet Sorcerer..."
                  multiline={false}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {(profile as any).profile_title || 'Not set'}
                </Text>
              )}
            </View>

            {/* Occupation */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Occupation</Text>
              {isEditing ? (
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editOccupation}
                  onChangeText={setEditOccupation}
                  placeholder="Your occupation"
                  multiline={false}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {profile.occupation || 'Not set'}
                </Text>
              )}
            </View>

            {/* Bio */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">About me</Text>
              {isEditing ? (
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="A few sentences about yourself..."
                  minHeight={86}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal leading-6">
                  {(profile as any).bio || 'Not set'}
                </Text>
              )}
            </View>

            {/* Current Project */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Current project</Text>
              {isEditing ? (
                // Prose here, same as the walk-through's version of this very
                // field. The two editors write the same column and used to
                // disagree about whether it was one line or several.
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editCurrentProject}
                  onChangeText={setEditCurrentProject}
                  placeholder="What are you working on right now?"
                  minHeight={86}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {(profile as any).current_project || 'Not set'}
                </Text>
              )}
            </View>

            {/* Hometown */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Hometown</Text>
              {isEditing ? (
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editHometown}
                  onChangeText={setEditHometown}
                  placeholder="Where are you from?"
                  multiline={false}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {(profile as any).hometown || 'Not set'}
                </Text>
              )}
            </View>

            {/* HIVE ask */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">HIVErs should ask me about</Text>
              {isEditing ? (
                <ComposerBar
                  tone="light"
                  variant="form"
                  value={editKnownFor}
                  onChangeText={setEditKnownFor}
                  placeholder="What should HIVErs come to you for?"
                  minHeight={86}
                  submitOnEnterKey={false}
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {(profile as any).known_for || 'Not set'}
                </Text>
              )}
            </View>

            {/* 3MIQ */}
            <View className="p-4 border-b border-cream">
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal/50">3 Most Important Questions</Text>
                <Pressable onPress={handleFind3MiqWithClive} className="bg-gold-light px-3 py-1 rounded-full active:opacity-70">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">{miq3ActionLabel}</Text>
                </Pressable>
              </View>
              {isEditing ? (
                <View>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">Experiences I want to have</Text>
                  <ComposerBar
                    tone="light"
                    variant="form"
                    containerClassName="mb-4"
                    value={editMiqExperiences}
                    onChangeText={setEditMiqExperiences}
                    placeholder="What experiences would make life feel rich?"
                    minHeight={86}
                    submitOnEnterKey={false}
                  />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">Ways I want to grow</Text>
                  <ComposerBar
                    tone="light"
                    variant="form"
                    containerClassName="mb-4"
                    value={editMiqGrowth}
                    onChangeText={setEditMiqGrowth}
                    placeholder="Who do I want to become?"
                    minHeight={86}
                    submitOnEnterKey={false}
                  />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">How I want to contribute</Text>
                  <ComposerBar
                    tone="light"
                    variant="form"
                    value={editMiqContribution}
                    onChangeText={setEditMiqContribution}
                    placeholder="How do I want to help, serve, or create?"
                    minHeight={86}
                    submitOnEnterKey={false}
                  />
                </View>
              ) : (
                <View className="gap-3">
                  {[
                    ['Experiences', (profile as any).miq_experiences],
                    ['Growth', (profile as any).miq_growth],
                    ['Contribution', (profile as any).miq_contribution],
                  ].map(([label, value]) => (
                    <View key={label as string}>
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-gold mb-1">{label as string}</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className={value ? 'text-charcoal leading-6' : 'text-charcoal/40'}>
                        {(value as string) || 'Not set'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Favorites */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal/50 mb-3">Favorites</Text>
              {(['favorite_book', 'favorite_food', 'favorite_hobby'] as const).map((field, idx) => {
                const labels = ['📚 Favorite book', '🍽️ Favorite food', '🎯 Favorite hobby'];
                const setters = [setEditFavBook, setEditFavFood, setEditFavHobby];
                const values = [editFavBook, editFavFood, editFavHobby];
                return (
                  <View key={field} className={idx < 2 ? 'mb-3' : ''}>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">{labels[idx]}</Text>
                    {isEditing ? (
                      <ComposerBar
                        tone="light"
                        variant="form"
                        value={values[idx]}
                        onChangeText={setters[idx]}
                        placeholder="Not set"
                        multiline={false}
                        submitOnEnterKey={false}
                      />
                    ) : (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                        {(profile as any)[field] || 'Not set'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Fun facts */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-3">3 fun facts about me</Text>
              {isEditing ? (
                editFunFacts.map((fact, idx) => (
                  <ComposerBar
                    tone="light"
                    key={idx}
                    variant="form"
                    containerClassName="mb-3"
                    value={fact}
                    // This one lives in a list, so it takes the new text — or
                    // works it out from the old, which is what talking does.
                    onChangeText={(next) => {
                      const updated = [...editFunFacts];
                      updated[idx] = typeof next === 'function' ? next(fact) : next;
                      setEditFunFacts(updated);
                    }}
                    placeholder={`Fun fact ${idx + 1}...`}
                    minHeight={86}
                    submitOnEnterKey={false}
                  />
                ))
              ) : (
                <View className="gap-2">
                  {(((profile as any).fun_facts as string[] | null) ?? []).length > 0
                    ? ((profile as any).fun_facts as string[]).map((fact: string, idx: number) => (
                        <View key={idx} className="flex-row items-start">
                          <Text className="text-gold mr-2">✦</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal flex-1">{fact}</Text>
                        </View>
                      ))
                    : <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40">Not set</Text>
                  }
                </View>
              )}
            </View>

            {/* Preferred Contact Method */}
            <View className="p-4">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-2">
                Preferred Contact Method
              </Text>
              {isEditing ? (
                <View className="flex-row flex-wrap gap-2">
                  {CONTACT_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setEditPreferredContact(option)}
                      className={`px-4 py-2 rounded-full ${
                        editPreferredContact === option
                          ? 'bg-gold'
                          : 'bg-cream'
                      }`}
                    >
                      <Text
                        style={{ fontFamily: 'Lato_700Bold' }}
                        className={`capitalize ${
                          editPreferredContact === option
                            ? 'text-white'
                            : 'text-charcoal'
                        }`}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View className="flex-row">
                  <View className="bg-gold-light px-3 py-1 rounded-full">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold capitalize">
                      {profile.preferred_contact || 'email'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
          )}
        </View>
        </FadeIn>
        </>
        )}

        {/* Loading skeletons for dynamic sections */}
        {!immersiveSkillsGarden && initialLoading && (
          <>
            <ListSectionSkeleton count={2} />
            <ListSectionSkeleton count={2} />
          </>
        )}

        {/* Personality Notes - How HIVE Sees You */}
        {!immersiveSkillsGarden && !initialLoading && userInsights?.personality_notes && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              How HIVE Sees You
            </Text>
            <View className="bg-white rounded-xl shadow-sm p-4">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal leading-6">
                {userInsights.personality_notes}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/40 mt-3">
                These notes are maintained by Clive based on your conversations. Only you can see them.
              </Text>
            </View>
          </View>
        )}

        {/* Wishes */}
        {!initialLoading && (
          <FadeIn delay={50}>
            {!immersiveSkillsGarden && (
              <View style={{ marginBottom: 24 }}>
                <HeaderTabs
                  activeTab={wishStatusTab}
                  onChange={setWishStatusTab}
                  actionLabel="+ Wish"
                  onAction={() => setAddWishModalVisible(true)}
                  compact={isProfilePhone}
                  compactAction={false}
                  stretchTabs={false}
                  tabs={[
                    {
                      key: 'public',
                      label: getHdWishTabLabel('public'),
                      count: publicWishes.length,
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
                  // A cap, not a height. Fixed at 520 this panel held a lake of
                  // empty cream under a single short wish (Nat 2026-07-26).
                  // Now it hugs its content and only starts scrolling once
                  // there's genuinely more than fits.
                  maxHeight: profileWishPanelHeight,
                  overflow: 'hidden',
                }}>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={{
                      padding: 12,
                      paddingBottom: 12,
                    }}
                  >
                    {visibleProfileWishes.length === 0 ? (
                      <View style={{ backgroundColor: '#fffdf5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(222,193,129,0.32)' }}>
                        <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(45,45,45,0.48)', textAlign: 'center' }}>
                          {profileWishEmptyText}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 12 }}>
                        {visibleProfileWishes.map(renderWishCard)}
                      </View>
                    )}
                  </ScrollView>
                </View>
              </View>
            )}
          </FadeIn>
        )}

        {/* Skills Garden */}
        {!initialLoading && (
          <FadeIn
            delay={50}
            style={immersiveSkillsGarden ? { flex: 1 } : undefined}
            // Measured HERE, on the direct child of the scroll content. On the
            // inner View this reported y = 0 (its offset within this wrapper),
            // so the Skills Garden chip scrolled to the top of the page — which
            // is where you already were, so it looked like a dead button
            // (Nat 2026-07-26: "nothing comes up").
            onLayout={(event) => {
              skillsGardenY.current = event.nativeEvent.layout.y;
            }}
          >
            <View
              className={immersiveSkillsGarden ? 'mb-0' : compactProfileLandscape ? 'mb-2' : 'mb-6'}
              style={immersiveSkillsGarden ? { flex: 1 } : undefined}
            >
              {!immersiveSkillsGarden && (
                <View className={compactProfileLandscape ? 'flex-row items-center justify-between mb-0 px-1' : 'flex-row items-center justify-between mb-1'}>
                  <View>
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold',
                        fontSize: compactProfileLandscape ? 14 : undefined,
                        lineHeight: compactProfileLandscape ? 18 : undefined,
                      }}
                      className={compactProfileLandscape ? 'text-charcoal' : 'text-lg text-charcoal'}
                    >
                      Skills Garden 🌸
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: compactProfileLandscape ? 9 : 11, color: '#a09274', marginTop: compactProfileLandscape ? 0 : 2 }}>
                      {bloomingSkillCount > 0
                        ? `${bloomingSkillCount} skill flower${bloomingSkillCount !== 1 ? 's' : ''} blooming`
                        : 'Seed your Skills Garden'}
                    </Text>
                  </View>
                  {/* Its own pencil (Nat 2026-08-04): "what's missing is an edit
                      button for the skills garden — if you want to edit the
                      garden, you have to scroll all the way up to the top."
                      Which was true: the only way in was the profile Edit
                      control a full page above, so the one block on this page
                      you actually fiddle with was the one block with no way to
                      open it from where you were standing. */}
                  <EditButton
                    onPress={() => setSkillsModalVisible(true)}
                    accessibilityLabel="Edit your Skills Garden"
                  />
                </View>
              )}
              {/* Replant helper — only rendered here on the user's own garden
                  (read-only gardens in members.tsx never show it) */}
              {(unplantedSkillCount > 0 || replantNotice) && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    backgroundColor: '#eef6ee',
                    borderWidth: 1,
                    borderColor: '#cfe3d2',
                    borderRadius: 14,
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular',
                      color: '#2f7147',
                      fontSize: 12.5,
                      lineHeight: 17,
                      flex: 1,
                      minWidth: 160,
                    }}
                  >
                    {replantNotice
                      ?? (gardenOpenSlots > 0
                        ? `🌱 ${unplantedSkillCount} skill${unplantedSkillCount === 1 ? '' : 's'} waiting to be replanted`
                        : `🌱 ${unplantedSkillCount} skill${unplantedSkillCount === 1 ? '' : 's'} still saved — the garden is full`)}
                  </Text>
                  {unplantedSkillCount > 0 && gardenOpenSlots > 0 && (
                    <Pressable
                      onPress={handleReplantGarden}
                      disabled={replantingGarden}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: replantingGarden }}
                      style={{
                        backgroundColor: '#315d4e',
                        borderRadius: 999,
                        paddingVertical: 6,
                        paddingHorizontal: 14,
                        opacity: replantingGarden ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 12 }}>
                        {replantingGarden ? 'Replanting…' : 'Replant all'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
              <SkillBubbleGarden
                skills={skills}
                editable
                onUpdateSkill={handleSkillBubbleUpdate}
                onDeleteSkill={handleDeleteSkill}
                seedSkills={PREDEFINED_SKILLS}
                onPlantSkill={handlePlantSkill}
                onPlantSkills={handlePlantSkills}
                onAddCustomSkill={() => setSkillsModalVisible(true)}
                draftKey={profile?.id ? `the-hive:skills-garden:${profile.id}` : null}
                wishMatches={skillWishMatches}
                onOpenWish={(wishId) => router.push({ pathname: '/hive', params: { openWishId: wishId } })}
              />
            </View>
          </FadeIn>
        )}

        {/* Settings and Sign out USED to live here and are now gone (Nat
            2026-08-04): "we dont need 'settings' or 'sign out' inside of
            profile any more, since we moved them to the side nav bar."

            Which is right, and is the second half of a change she started on
            08-03. Settings moved to its own page then, and this card was left
            behind as a door for muscle memory — but the rail now lists Settings
            and Log out on every screen, so the door leads somewhere you can
            already see, and Sign out was a second way to do a thing the rail
            does with a confirmation. Two of everything is how a page stops
            feeling like it is about you. */}
      </BounceScrollView>
      </KeyboardAvoidingView>

      {/* Grant Wish Modal */}
      {wishToGrant && (
        <GrantWishModal
          visible={!!wishToGrant}
          onClose={() => setWishToGrant(null)}
          wish={wishToGrant}
          communityId={communityId}
          onGrant={handleGrantWish}
        />
      )}

      {wishManageModal}

      {/* Skills Manage Modal */}
      <SkillsManageModal
        visible={skillsModalVisible}
        onClose={() => setSkillsModalVisible(false)}
        communityId={communityId}
        userId={profile?.id}
        existingSkills={skills}
        onSave={fetchData}
      />

      {/* Add Wish Modal */}
      <AddWishModal
        visible={addWishModalVisible}
        onClose={() => setAddWishModalVisible(false)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleWishSaved}
        onRefineWithClive={handleRefineWithClive}
      />
      <AddWishModal
        visible={!!editingWish}
        onClose={() => setEditingWish(null)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleWishSaved}
        existingWish={editingWish}
        wishOwnerUserId={editingWish?.user_id}
        wishOwnerName={editingWish?.user?.name}
      />

      {activeSurvey && (
        <SurveyModal
          survey={activeSurvey}
          initialAnswers={activeSurveyIsEditing ? activeSurveyResponse?.answers : undefined}
          isEditingResponse={activeSurveyIsEditing}
          carryForwardItems={carryForwardItems}
          carryForwardLoading={carryForwardLoading}
          carryForwardError={carryForwardError}
          onSubmit={async (answers: SurveyAnswers) => {
            const result = await submitResponse(activeSurvey.id, answers);
            if (!result.error && activeSurveyStorageKey) {
              removeStoredItem(activeSurveyStorageKey);
            }
            return result;
          }}
          onClose={() => {
            if (activeSurveyStorageKey) removeStoredItem(activeSurveyStorageKey);
            setActiveSurvey(null);
          }}
        />
      )}

      <Modal
        visible={deepQuizVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeepQuiz}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            backgroundColor: 'rgba(45,45,45,0.28)',
            justifyContent: 'center',
            padding: isProfilePhone ? 12 : 24,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 620,
              maxHeight: '92%',
              borderRadius: 28,
              backgroundColor: '#f8f4e8',
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.55)',
              overflow: 'hidden',
              shadowColor: '#2d2d2d',
              shadowOpacity: 0.18,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 14 },
            }}
          >
            <View
              style={{
                paddingHorizontal: isProfilePhone ? 18 : 24,
                paddingTop: 20,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(222,193,129,0.32)',
                backgroundColor: '#fff9e8',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    Let's get deeper
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8e7a5e', marginTop: 3 }}>
                    {DEEP_PROFILE_STEPS[deepQuizStep]} · {deepQuizProgress}
                  </Text>
                </View>
                <Pressable
                  onPress={closeDeepQuiz}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fffdf7',
                    borderWidth: 1,
                    borderColor: 'rgba(222,193,129,0.5)',
                  }}
                >
                  <Ionicons name="close" size={18} color="#9a7a3a" />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                {DEEP_PROFILE_STEPS.map((step, index) => (
                  <View
                    key={step}
                    style={{
                      flex: 1,
                      height: 5,
                      borderRadius: 999,
                      backgroundColor: index <= deepQuizStep ? '#bd9348' : 'rgba(189,147,72,0.18)',
                    }}
                  />
                ))}
              </View>
            </View>

            <BounceScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: isProfilePhone ? 18 : 26,
                paddingVertical: 22,
              }}
            >
              {renderDeepQuizStep()}
            </BounceScrollView>

            <View
              style={{
                flexDirection: isProfilePhone ? 'column' : 'row',
                gap: 10,
                paddingHorizontal: isProfilePhone ? 18 : 24,
                paddingVertical: 16,
                borderTopWidth: 1,
                borderTopColor: 'rgba(222,193,129,0.32)',
                backgroundColor: '#fff9e8',
              }}
            >
              <Pressable
                disabled={!deepQuizCanGoBack || isSaving}
                onPress={() => setDeepQuizStep(step => Math.max(0, step - 1))}
                style={{
                  flex: isProfilePhone ? undefined : 0.85,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.55)',
                  backgroundColor: '#fffdf7',
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: !deepQuizCanGoBack || isSaving ? 0.45 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9a7a3a' }}>Back</Text>
              </Pressable>
              <Pressable
                disabled={isSaving}
                onPress={handleDeepQuizSaveAndExit}
                style={{
                  flex: isProfilePhone ? undefined : 1.15,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(189,147,72,0.48)',
                  backgroundColor: '#fffdf7',
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: isSaving ? 0.62 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9a7a3a' }}>
                  {isSaving ? 'Saving...' : 'Save & exit'}
                </Text>
              </Pressable>
              <Pressable
                disabled={isSaving}
                onPress={handleDeepQuizSaveAndContinue}
                style={{
                  flex: isProfilePhone ? undefined : 1.45,
                  borderRadius: 999,
                  backgroundColor: '#bd9348',
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: isSaving ? 0.62 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#fffaf0' }}>
                  {isSaving ? 'Saving...' : deepQuizPrimaryLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={confirmingSignOut}
        title="Sign out of the HIVE?"
        body="You’ll need to sign in again with Google to get back in."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        onConfirm={() => {
          setConfirmingSignOut(false);
          void performSignOut();
        }}
        onCancel={() => setConfirmingSignOut(false)}
      />
    </SafeAreaView>
  );
}

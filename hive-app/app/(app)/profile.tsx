import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, TextInput, Platform, Linking, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaLibraryPermission } from '../../lib/imagePicker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useWishes } from '../../lib/hooks/useWishes';
import { useSurveys } from '../../lib/hooks/useSurveys';
import { Avatar } from '../../components/ui/Avatar';
import { BirthdayPicker } from '../../components/ui/DatePicker';
import { AppHeader } from '../../components/navigation';
import { clearLastAppPath } from '../../lib/navigationState';
import { FadeIn } from '../../components/ui/FadeIn';
import { ListSectionSkeleton } from '../../components/profile/ProfileSkeleton';
import { BeeProgressArc } from '../../components/profile/BeeProgressArc';
import { SkillBubbleGarden } from '../../components/profile/SkillBubbleGarden';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { SkillsManageModal } from '../../components/skills/SkillsManageModal';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { Ionicons } from '@expo/vector-icons';
import { formatDateLong, formatDateShort, isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import type { Skill, Wish, ActionItem, UserInsights, Profile } from '../../types';

const CONTACT_OPTIONS = ['email', 'phone', 'text'] as const;

type DailyQuestionMatch = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  sharedCount: number;
  similarCount: number;
  score: number;
  percent: number;
};

type DailyAnswerRow = {
  user_id: string;
  question_date: string;
  answer: string;
};

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

function buildDailyQuestionMatches(
  userId: string,
  answers: DailyAnswerRow[],
  members: any[]
): DailyQuestionMatch[] {
  const memberById = new Map<string, { name: string; avatar_url?: string | null }>();
  members.forEach((row: any) => {
    const member = row.profiles;
    if (member?.name) {
      memberById.set(row.user_id, {
        name: member.name,
        avatar_url: member.avatar_url ?? null,
      });
    }
  });

  const myAnswers = new Map<string, string>();
  answers.forEach(row => {
    if (row.user_id === userId && row.question_date && row.answer) {
      myAnswers.set(row.question_date, row.answer);
    }
  });

  const stats = new Map<string, DailyQuestionMatch>();
  answers.forEach(row => {
    if (row.user_id === userId || !row.question_date || !row.answer) return;
    const mine = myAnswers.get(row.question_date);
    if (!mine) return;

    const member = memberById.get(row.user_id);
    if (!member) return;

    const existing = stats.get(row.user_id) ?? {
      userId: row.user_id,
      name: member.name,
      avatarUrl: member.avatar_url,
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

  return [...stats.values()]
    .map(match => {
      const averageSimilarity = match.score / Math.max(1, match.sharedCount);
      const overlapStrength = match.sharedCount / Math.max(1, myAnswers.size);
      return {
        ...match,
        percent: Math.round((overlapStrength * 0.45 + averageSimilarity * 0.55) * 100),
      };
    })
    .sort((a, b) =>
      b.percent - a.percent ||
      b.similarCount - a.similarCount ||
      b.score - a.score ||
      b.sharedCount - a.sharedCount ||
      a.name.localeCompare(b.name)
    )
    .slice(0, 5);
}

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

export default function ProfileScreen() {
  const { profile, communityId, communityRole, refreshProfile } = useAuth();
  const { permissionStatus, requestPermissions } = useNotifications({ enableListeners: false });
  const { grantWish } = useWishes();
  const { pendingSurveys } = useSurveys(communityId ?? undefined, profile?.id);
  const isNotificationEnabled =
    permissionStatus === 'granted' || permissionStatus === 'provisional';
  const [refreshing, setRefreshing] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [addWishModalVisible, setAddWishModalVisible] = useState(false);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null);
  const [dailyAnswerCount, setDailyAnswerCount] = useState(0);
  const [dailyQuestionMatches, setDailyQuestionMatches] = useState<DailyQuestionMatch[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // Editable profile fields
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
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
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile || !communityId) return;

    const [
      { data: skillsData },
      { data: wishesData },
      { data: actionItemsData },
      { data: insightsData },
      { count: dailyAnswers },
      { data: dailyAnswerRows },
      { data: memberRows },
    ] = await Promise.all([
      supabase
        .from('skills')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .order('created_at', { ascending: false }),
      supabase
        .from('wishes')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .order('created_at', { ascending: false }),
      supabase
        .from('action_items')
        .select('*')
        .eq('assigned_to', profile.id)
        .eq('community_id', communityId)
        .eq('completed', false)
        .order('due_date', { ascending: true }),
      // Use maybeSingle() to gracefully handle cases where no record exists yet
      supabase
        .from('user_insights')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId)
        .maybeSingle(),
      supabase
        .from('daily_question_answers')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('community_id', communityId),
      supabase
        .from('daily_question_answers')
        .select('user_id, question_date, answer')
        .eq('community_id', communityId)
        .order('question_date', { ascending: false })
        .limit(600),
      supabase
        .from('community_memberships')
        .select('user_id, profiles(name, avatar_url)')
        .eq('community_id', communityId),
    ]);

    if (skillsData) setSkills(skillsData);
    if (wishesData) setWishes(wishesData);
    if (actionItemsData) setActionItems(actionItemsData);
    setUserInsights(insightsData);
    setDailyAnswerCount(dailyAnswers ?? 0);
    setDailyQuestionMatches(buildDailyQuestionMatches(
      profile.id,
      (dailyAnswerRows ?? []) as DailyAnswerRow[],
      memberRows ?? []
    ));
    setInitialLoading(false);
  }, [profile?.id, communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize edit fields when profile loads or changes
  useEffect(() => {
    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
      // Convert ISO date to American format for editing
      setEditBirthday(profile.birthday ? isoToAmerican(profile.birthday) : '');
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
  }, [profile]);

  const startEditing = () => {
    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
      // Convert ISO date to American format for editing
      setEditBirthday(profile.birthday ? isoToAmerican(profile.birthday) : '');
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
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    // Reset to original values
    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
      // Convert ISO date to American format for editing
      setEditBirthday(profile.birthday ? isoToAmerican(profile.birthday) : '');
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

  const saveProfile = async () => {
    if (!profile) return;

    // Convert American date format to ISO for storage
    const birthdayIso = editBirthday ? parseAmericanDate(editBirthday) : null;

    setIsSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: editName.trim(),
        phone: editPhone.trim() || null,
        birthday: birthdayIso,
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
        fun_facts: editFunFacts.map(f => f.trim()).filter(Boolean).length > 0
          ? editFunFacts.map(f => f.trim()).filter(Boolean)
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);

    setIsSaving(false);

    if (error) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } else {
      await refreshProfile();
      setIsEditing(false);
    }
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
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
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

  const performSignOut = async () => {
    clearLastAppPath();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      console.error('Sign out error:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
      return;
    }
    router.replace('/(auth)/login');
  };

  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      await performSignOut();
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: performSignOut,
      },
    ]);
  };

  const toggleActionItem = async (item: ActionItem) => {
    if (!communityId) return;

    const { error } = await supabase
      .from('action_items')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('community_id', communityId);

    if (!error) {
      setActionItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  };

  const handlePublishWish = (wish: Wish) => {
    if (!profile || !communityId) return;

    Alert.alert(
      'Share with the HIVE?',
      `This will make your wish visible to all HIVE members:\n\n"${wish.description}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            const { error } = await supabase
              .from('wishes')
              .update({ status: 'public', is_active: true })
              .eq('id', wish.id)
              .eq('user_id', profile.id)
              .eq('community_id', communityId);

            if (!error) {
              await fetchData();
            } else {
              Alert.alert('Error', 'Failed to share wish. Please try again.');
            }
          },
        },
      ]
    );
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
    // Create wish with user profile for the modal
    setWishToGrant({ ...wish, user: profile });
  };

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
      Alert.alert('Error', 'Failed to update that skill bubble. Please try again.');
      await fetchData();
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
        Alert.alert('Error', 'Failed to remove that skill. Please try again.');
        return;
      }

      setSkills((current) => current.filter((item) => item.id !== skill.id));
    };

    const message = `Remove "${skill.description}" from your skills?`;

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        deleteSkill();
      }
      return;
    }

    Alert.alert('Remove skill', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: deleteSkill },
    ]);
  };

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId || wish.user_id !== profile.id) return;

    const deleteWish = async () => {
      const { error } = await supabase
        .from('wishes')
        .delete()
        .eq('id', wish.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        Alert.alert('Error', 'Failed to delete wish. Please try again.');
        return;
      }

      await fetchData();
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
      { text: 'Delete', style: 'destructive', onPress: deleteWish },
    ]);
  };

  const handleRefineWithClive = (roughWish: string) => {
    setAddWishModalVisible(false);
    // Navigate to chat with the rough wish as context
    router.push({
      pathname: '/(app)',
      params: { refineWish: roughWish },
    });
  };

  const handleFind3MiqWithClive = () => {
    router.push({
      pathname: '/(app)',
      params: {
        prefill: 'Help me discover my 3 Most Important Questions. I want one for experiences, one for growth, and one for contribution.',
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
    if (label === 'Add a skill') {
      setSkillsModalVisible(true);
      return;
    }
    if (label === 'Share a wish') {
      setAddWishModalVisible(true);
      return;
    }
    if (label === "Complete this month's check-in") {
      router.push('/(app)/hive');
      return;
    }
    startEditing();
  };

  if (!profile) return null;

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <AppHeader title="Profile" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Profile Header with Bee Progress Arc */}
        <FadeIn>
        {(() => {
          const checks = [
            { label: 'Add a photo', done: !!profile.avatar_url },
            { label: 'Choose your title', done: !!(profile as any).profile_title },
            { label: 'Add your birthday', done: !!profile.birthday },
            { label: 'Add your phone', done: !!profile.phone },
            { label: 'Write a bio', done: !!(profile as any).bio },
            { label: 'Share what people should ask you about', done: !!(profile as any).known_for },
            { label: 'Answer your 3MIQ', done: !!((profile as any).miq_experiences && (profile as any).miq_growth && (profile as any).miq_contribution) },
            { label: "Complete this month's check-in", done: pendingSurveys.length === 0 },
            { label: 'Add a skill', done: skills.length > 0 },
            { label: 'Share a wish', done: wishes.length > 0 },
          ];
          const done = checks.filter(c => c.done).length;
          const score = done / checks.length;
          const nextMissing = checks.find(c => !c.done);
          const isComplete = done === checks.length;
          const percent = Math.round(score * 100);
          const missing = checks.filter(c => !c.done).slice(0, 3);

          return (
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              {/* Arc + avatar stacked */}
              <View style={{ alignItems: 'center' }}>
                <BeeProgressArc score={score} size={220} />
                {/* Avatar overlaps the base of the arc */}
                <View style={{ marginTop: -44, alignItems: 'center' }}>
                  <Pressable onPress={pickImage} disabled={isUploadingPhoto} style={{ position: 'relative' }} className="active:opacity-80">
                    <Avatar name={profile.name} url={profile.avatar_url} size={80} />
                    {isUploadingPhoto ? (
                      <View className="absolute inset-0 bg-black/40 rounded-full items-center justify-center">
                        <ActivityIndicator color="#fff" size="small" />
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
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', marginTop: 8 }}>
                    {percent}% filled out
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 3 }}>
                    Next: {nextMissing.label} to move your bee closer to the hive ✨
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                    {missing.map(item => (
                      <Pressable
                        key={item.label}
                        onPress={() => handleProfileStepPress(item.label)}
                        className="active:opacity-70"
                        style={{
                          backgroundColor: '#fffaf0',
                          borderWidth: 1,
                          borderColor: 'rgba(222,193,129,0.65)',
                          borderRadius: 999,
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          shadowColor: '#bd9348',
                          shadowOpacity: 0.08,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 3 },
                        }}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348' }}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          );
        })()}
        </FadeIn>

        {/* Profile Information */}
        <FadeIn delay={100}>
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              {isEditing ? 'Edit Profile' : 'Profile'}
            </Text>
            {!isEditing ? (
              <Pressable onPress={startEditing} className="px-3 py-1 active:opacity-70">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">Edit</Text>
              </Pressable>
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
              {(profile as any).bio && (
                <View className="bg-white rounded-xl shadow-sm p-4">
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal leading-6">
                    {(profile as any).bio}
                  </Text>
                </View>
              )}

              {(profile as any).known_for && (
                <View>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40 mb-2 tracking-wide">ASK ME ABOUT</Text>
                  <Text style={{ fontFamily: 'LibreBaskerville_400Regular' }} className="text-charcoal italic leading-6">
                    "{(profile as any).known_for}"
                  </Text>
                </View>
              )}

              {((profile as any).miq_experiences || (profile as any).miq_growth || (profile as any).miq_contribution) ? (
                <View className="bg-white rounded-xl shadow-sm p-4">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal/50">3 Most Important Questions</Text>
                    <Pressable onPress={handleFind3MiqWithClive} className="bg-gold-light px-3 py-1 rounded-full active:opacity-70">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">Find with Clive</Text>
                    </Pressable>
                  </View>
                  {[
                    ['Experiences', (profile as any).miq_experiences],
                    ['Growth', (profile as any).miq_growth],
                    ['Contribution', (profile as any).miq_contribution],
                  ].map(([label, value]) => (
                    <View key={label as string} className="mb-3 last:mb-0">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-gold mb-1">{label as string}</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className={value ? 'text-charcoal leading-6' : 'text-charcoal/40'}>
                        {(value as string) || 'Not set'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Pressable onPress={handleFind3MiqWithClive} className="bg-white rounded-xl shadow-sm p-4 active:opacity-80">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-1">Answer your 3MIQ</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 leading-5">
                        Experiences, growth, and contribution are still open. Clive can walk you through them.
                      </Text>
                    </View>
                    <View className="bg-gold-light px-3 py-2 rounded-full">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">Start</Text>
                    </View>
                  </View>
                </Pressable>
              )}

              <View className="bg-white rounded-xl shadow-sm overflow-hidden">
                <View className="p-4 border-b border-cream">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal/50 mb-1">Member Signals</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 leading-5">
                    These help Clive match members, shape HD boards, and feed newsletters without making the profile feel like homework.
                  </Text>
                </View>
                {[
                  {
                    label: 'Core profile',
                    value: (profile as any).bio && (profile as any).known_for ? 'Ready for members' : 'Add bio + ask-me-about',
                    done: !!((profile as any).bio && (profile as any).known_for),
                  },
                  {
                    label: 'Deeper profile',
                    value: ((profile as any).fun_facts?.length || (profile as any).favorite_book || (profile as any).favorite_food || (profile as any).favorite_hobby)
                      ? 'Optional details added'
                      : 'Optional',
                    done: !!(((profile as any).fun_facts?.length) || (profile as any).favorite_book || (profile as any).favorite_food || (profile as any).favorite_hobby),
                  },
                  {
                    label: 'Monthly check-in',
                    value: pendingSurveys.length === 0 ? 'Current' : pendingSurveys[0]?.title ?? 'Waiting for response',
                    done: pendingSurveys.length === 0,
                  },
                  {
                    label: '3MIQ',
                    value: ((profile as any).miq_experiences && (profile as any).miq_growth && (profile as any).miq_contribution) ? 'Answered' : 'Ready for Clive',
                    done: !!((profile as any).miq_experiences && (profile as any).miq_growth && (profile as any).miq_contribution),
                  },
                  {
                    label: 'Daily questions',
                    value: dailyAnswerCount > 0 ? `${dailyAnswerCount} answered` : 'Start with today',
                    done: dailyAnswerCount > 0,
                  },
                ].map(item => (
                  <View key={item.label} className="p-4 border-b border-cream last:border-b-0 flex-row items-center">
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                        backgroundColor: item.done ? '#eef6f0' : '#fffaf0',
                        borderWidth: 1,
                        borderColor: item.done ? 'rgba(115,154,136,0.45)' : 'rgba(222,193,129,0.55)',
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: item.done ? '#739a88' : '#bd9348' }}>
                        {item.done ? 'OK' : '!'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{item.label}</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 mt-1">{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {dailyAnswerCount > 0 && (
                <View className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <View className="p-4 border-b border-cream">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal/50 mb-1">Daily Question Matches</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 leading-5">
                      Based on the daily questions you have both answered.
                    </Text>
                  </View>
                  {dailyQuestionMatches.length > 0 ? (
                    dailyQuestionMatches.map(match => (
                      <Pressable
                        key={match.userId}
                        onPress={() => router.push({ pathname: '/(app)/members', params: { memberId: match.userId } })}
                        className="p-4 border-b border-cream last:border-b-0 flex-row items-center active:bg-cream"
                      >
                        <Avatar name={match.name} url={match.avatarUrl} size={44} />
                        <View className="flex-1 ml-3">
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{match.name}</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 mt-1">
                            {match.similarCount > 0
                              ? `${match.similarCount} similar answer${match.similarCount === 1 ? '' : 's'}`
                              : `${match.sharedCount} shared question${match.sharedCount === 1 ? '' : 's'}`}
                          </Text>
                        </View>
                        <View className="bg-gold-light px-3 py-1 rounded-full">
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                            {match.percent}%
                          </Text>
                        </View>
                      </Pressable>
                    ))
                  ) : (
                    <View className="p-4">
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 leading-5">
                        You have answered {dailyAnswerCount} question{dailyAnswerCount === 1 ? '' : 's'}. Once more members answer the same ones, your matches will show up here.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {((profile as any).current_project || (profile as any).hometown || profile.birthday) && (
                <View className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {(profile as any).current_project && (
                    <View className="p-4 border-b border-cream">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40 mb-1">CURRENTLY WORKING ON</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{(profile as any).current_project}</Text>
                    </View>
                  )}
                  {(profile as any).hometown && (
                    <View className="p-4 border-b border-cream">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40 mb-1">FROM</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{(profile as any).hometown}</Text>
                    </View>
                  )}
                  {profile.birthday && (
                    <View className="p-4">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40 mb-1">BIRTHDAY</Text>
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{formatBirthdayForDisplay(profile.birthday)}</Text>
                    </View>
                  )}
                </View>
              )}

              {(((profile as any).fun_facts as string[] | null) ?? []).length > 0 && (
                <View>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40 mb-2 tracking-wide">FUN FACTS</Text>
                  <View className="gap-2">
                    {((profile as any).fun_facts as string[]).map((fact: string, idx: number) => (
                      <View key={idx} className="flex-row items-start">
                        <Text className="text-gold mr-2">✦</Text>
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal flex-1 leading-5">{fact}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {((profile as any).favorite_book || (profile as any).favorite_food || (profile as any).favorite_hobby) && (
                <View className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {(['favorite_book', 'favorite_food', 'favorite_hobby'] as const).map((field, idx) => {
                    const labels = ['Book', 'Food', 'Hobby'];
                    const value = (profile as any)[field];
                    if (!value) return null;
                    return (
                      <View key={field} className="p-4 border-b border-cream last:border-b-0">
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40 mb-1">{labels[idx]}</Text>
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{value}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
          <View className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Name */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Name</Text>
              {isEditing ? (
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="Your name"
                  placeholderTextColor="#9CA3AF"
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
                <TextInput
                  value={editPhone}
                  onChangeText={(text) => setEditPhone(formatPhoneNumber(text))}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="(555) 555-5555"
                  placeholderTextColor="#9CA3AF"
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
                <BirthdayPicker
                  value={editBirthday}
                  onChange={setEditBirthday}
                />
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
                <TextInput
                  value={editProfileTitle}
                  onChangeText={setEditProfileTitle}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="Founder, Tarot Reader, Spreadsheet Sorcerer..."
                  placeholderTextColor="#9CA3AF"
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
                <TextInput
                  value={editOccupation}
                  onChangeText={setEditOccupation}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="Your occupation"
                  placeholderTextColor="#9CA3AF"
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
                <TextInput
                  value={editBio}
                  onChangeText={setEditBio}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="A few sentences about yourself..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
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
                <TextInput
                  value={editCurrentProject}
                  onChangeText={setEditCurrentProject}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="What are you working on right now?"
                  placeholderTextColor="#9CA3AF"
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
                <TextInput
                  value={editHometown}
                  onChangeText={setEditHometown}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="Where are you from?"
                  placeholderTextColor="#9CA3AF"
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {(profile as any).hometown || 'Not set'}
                </Text>
              )}
            </View>

            {/* Ask me about */}
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mb-1">Ask me about</Text>
              {isEditing ? (
                <TextInput
                  value={editKnownFor}
                  onChangeText={setEditKnownFor}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="What should people come to you for?"
                  placeholderTextColor="#9CA3AF"
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
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">Find with Clive</Text>
                </Pressable>
              </View>
              {isEditing ? (
                <View>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">Experiences I want to have</Text>
                  <TextInput
                    value={editMiqExperiences}
                    onChangeText={setEditMiqExperiences}
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal text-base p-0 mb-4"
                    placeholder="What experiences would make life feel rich?"
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">Ways I want to grow</Text>
                  <TextInput
                    value={editMiqGrowth}
                    onChangeText={setEditMiqGrowth}
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal text-base p-0 mb-4"
                    placeholder="Who do I want to become?"
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-1">How I want to contribute</Text>
                  <TextInput
                    value={editMiqContribution}
                    onChangeText={setEditMiqContribution}
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal text-base p-0"
                    placeholder="How do I want to help, serve, or create?"
                    placeholderTextColor="#9CA3AF"
                    multiline
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
                      <TextInput
                        value={values[idx]}
                        onChangeText={setters[idx]}
                        style={{ fontFamily: 'Lato_400Regular' }}
                        className="text-charcoal text-base p-0"
                        placeholder="Not set"
                        placeholderTextColor="#9CA3AF"
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
                  <TextInput
                    key={idx}
                    value={fact}
                    onChangeText={(text) => {
                      const updated = [...editFunFacts];
                      updated[idx] = text;
                      setEditFunFacts(updated);
                    }}
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal text-base p-0 mb-3"
                    placeholder={`Fun fact ${idx + 1}...`}
                    placeholderTextColor="#9CA3AF"
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

        {/* Loading skeletons for dynamic sections */}
        {initialLoading && (
          <>
            <ListSectionSkeleton count={2} />
            <ListSectionSkeleton count={2} />
          </>
        )}

        {/* Personality Notes - How the HIVE Sees You */}
        {!initialLoading && userInsights?.personality_notes && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              How the HIVE Sees You
            </Text>
            <View className="bg-white rounded-xl shadow-sm p-4">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal leading-6">
                {userInsights.personality_notes}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/40 mt-3">
                These notes are maintained by the HIVE assistant based on your conversations. Only you can see them.
              </Text>
            </View>
          </View>
        )}

        {/* Action Items */}
        {!initialLoading && actionItems.length > 0 && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              Your Action Items
            </Text>
            <View className="bg-white rounded-xl shadow-sm overflow-hidden">
              {actionItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => toggleActionItem(item)}
                  className="flex-row items-center p-4 border-b border-cream last:border-b-0 active:bg-cream"
                >
                  <View className="w-6 h-6 rounded-full border-2 border-gold mr-3" />
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{item.description}</Text>
                    {item.due_date && (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mt-1">
                        Due: {formatDateShort(item.due_date)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Skills */}
        {!initialLoading && <FadeIn delay={50}>
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              Your Skills ({skills.length})
            </Text>
            <Pressable
              onPress={() => setSkillsModalVisible(true)}
              className="w-8 h-8 rounded-full bg-gold items-center justify-center active:opacity-80"
            >
              <Ionicons name="add" size={20} color="white" />
            </Pressable>
          </View>
          {skills.length === 0 ? (
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                No skills recorded yet. Ask Clive to add some!
              </Text>
            </View>
          ) : (
            <SkillBubbleGarden
              skills={skills}
              editable
              onUpdateSkill={handleSkillBubbleUpdate}
              onDeleteSkill={handleDeleteSkill}
            />
          )}
        </View>

        {/* Wishes */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              Your Wishes ({wishes.length})
            </Text>
            <Pressable
              onPress={() => setAddWishModalVisible(true)}
              className="w-8 h-8 rounded-full bg-gold items-center justify-center active:opacity-80"
            >
              <Ionicons name="add" size={20} color="white" />
            </Pressable>
          </View>
          {wishes.length === 0 ? (
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                No wishes yet. What do you need help with?
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-xl shadow-sm overflow-hidden">
              {wishes.map((wish) => (
                <View
                  key={wish.id}
                  className="p-4 border-b border-cream last:border-b-0"
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center">
                      <View
                        className={`w-2 h-2 rounded-full mr-2 ${
                          wish.status === 'public'
                            ? 'bg-green-500'
                            : wish.status === 'fulfilled'
                            ? 'bg-gold'
                            : 'bg-charcoal/40'
                        }`}
                      />
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60 capitalize">
                        {wish.status === 'fulfilled' ? 'Granted' : wish.status}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      {wish.status !== 'fulfilled' && (
                        <>
                          <Pressable
                            onPress={() => setEditingWish(wish)}
                            className="w-8 h-8 rounded-full items-center justify-center active:bg-cream mr-1"
                            hitSlop={8}
                          >
                            <Ionicons name="pencil-outline" size={17} color="#4A4A4A" />
                          </Pressable>
                          <Pressable
                            onPress={() => handleDeleteWish(wish)}
                            className="w-8 h-8 rounded-full items-center justify-center active:bg-red-50 mr-1"
                            hitSlop={8}
                          >
                            <Ionicons name="trash-outline" size={17} color="#ef4444" />
                          </Pressable>
                        </>
                      )}
                      {wish.status === 'fulfilled' && (
                        <Pressable
                          onPress={() => handleDeleteWish(wish)}
                          className="w-8 h-8 rounded-full items-center justify-center active:bg-red-50 mr-1"
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={17} color="#ef4444" />
                        </Pressable>
                      )}
                      {wish.status === 'private' && (
                        <Pressable
                          onPress={() => handlePublishWish(wish)}
                          className="bg-gold-light px-3 py-1 rounded-full active:bg-gold/30"
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                            Share with HIVE
                          </Text>
                        </Pressable>
                      )}
                      {wish.status === 'public' && (
                        <Pressable
                          onPress={() => openGrantModal(wish)}
                          className="bg-gold px-3 py-1 rounded-full active:bg-gold/80"
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
                            Mark as Granted
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{wish.description}</Text>
                  {wish.status === 'fulfilled' && wish.thank_you_message && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm mt-1 italic">
                      "{wish.thank_you_message}"
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
        </FadeIn>}

        {/* Notification Settings */}
        {Platform.OS !== 'web' && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              Notifications
            </Text>
            <View className="bg-white rounded-xl shadow-sm p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                    Push Notifications
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/50 mt-1">
                    {isNotificationEnabled
                      ? 'Enabled - you will receive notifications'
                      : permissionStatus === 'denied'
                      ? 'Disabled - enable in Settings'
                      : 'Not yet enabled'}
                  </Text>
                </View>
                {!isNotificationEnabled && (
                  <Pressable
                    onPress={async () => {
                      if (permissionStatus === 'denied') {
                        // Open settings if permission was denied
                        Linking.openSettings();
                      } else {
                        await requestPermissions();
                      }
                    }}
                    className="bg-gold px-4 py-2 rounded-full active:opacity-80"
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm">
                      {permissionStatus === 'denied' ? 'Open Settings' : 'Enable'}
                    </Text>
                  </Pressable>
                )}
                {isNotificationEnabled && (
                  <View className="bg-green-100 px-3 py-1 rounded-full">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-green-700 text-sm">
                      Enabled
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Sign Out Button */}
        <Pressable
          onPress={handleSignOut}
          className="bg-red-50 p-4 rounded-xl items-center active:bg-red-100"
        >
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-600">Sign Out</Text>
        </Pressable>
      </ScrollView>
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
      />
    </SafeAreaView>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, TextInput, Platform, Linking, ActivityIndicator, KeyboardAvoidingView, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { requestMediaLibraryPermission } from '../../lib/imagePicker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useWishes } from '../../lib/hooks/useWishes';
import { useSurveys, type Survey } from '../../lib/hooks/useSurveys';
import { Avatar } from '../../components/ui/Avatar';
import { BirthdayPicker } from '../../components/ui/DatePicker';
import { AppHeader } from '../../components/navigation';
import { clearLastAppPath } from '../../lib/navigationState';
import { getLinkedBoardLabel } from '../../lib/boardWishLinks';
import { linkWishToHdBoard, unlinkWishFromBoard } from '../../lib/wishBoardLinking';
import { FadeIn } from '../../components/ui/FadeIn';
import { ListSectionSkeleton } from '../../components/profile/ProfileSkeleton';
import { BeeProgressArc } from '../../components/profile/BeeProgressArc';
import { SkillBubbleGarden } from '../../components/profile/SkillBubbleGarden';
import { ProfileHoneycombCluster } from '../../components/profile/ProfileHoneycombCluster';
import { WishCombCard } from '../../components/profile/WishCombCard';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { SurveyModal } from '../../components/surveys/SurveyModal';
import { SkillsManageModal } from '../../components/skills/SkillsManageModal';
import { PREDEFINED_SKILLS } from '../../components/skills/constants';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { Ionicons } from '@expo/vector-icons';
import { formatDateLong, isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import type { Skill, Wish, UserInsights, Profile } from '../../types';

const CONTACT_OPTIONS = ['email', 'phone', 'text'] as const;

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

const SKILLS_GARDEN_CAPACITY = 10;
const DEEP_PROFILE_STEPS = ['Basics', 'Now', 'Favorites', '3MIQ'] as const;

function ProfileHeaderActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexShrink: 0,
        paddingHorizontal: 12,
        paddingVertical: 7,
        marginBottom: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.72)',
        backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
      })}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { profile, communityId, communityRole, refreshProfile } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const { permissionStatus, requestPermissions } = useNotifications({ enableListeners: false });
  const { grantWish } = useWishes();
  const { pendingSurveys, submitResponse } = useSurveys(communityId ?? undefined, profile?.id);
  const isNotificationEnabled =
    permissionStatus === 'granted' || permissionStatus === 'provisional';
  const [refreshing, setRefreshing] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [addWishModalVisible, setAddWishModalVisible] = useState(false);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [managingWish, setManagingWish] = useState<Wish | null>(null);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const skillsGardenY = useRef(0);

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
        .select('*, board_category:board_categories(id,name,topic_kind)')
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

  const resetProfileDrafts = () => {
    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
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

  const startEditing = () => {
    resetProfileDrafts();
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    resetProfileDrafts();
  };

  const startDeepQuiz = () => {
    resetProfileDrafts();
    setIsEditing(false);
    setDeepQuizStep(0);
    setDeepQuizVisible(true);
  };

  const closeDeepQuiz = () => {
    setDeepQuizVisible(false);
    setDeepQuizStep(0);
    resetProfileDrafts();
  };

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
      Alert.alert('Birthday format', 'Please enter your birthday as MM-DD-YYYY, like 10-12-1987.');
      return false;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', profile.id);

      if (error) {
        Alert.alert('Error', failureMessage);
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
    }
  };

  const saveDeepQuiz = async ({ closeAfterSave = true } = {}) => {
    const saved = await saveProfileDraft('Failed to save your deeper profile. Please try again.');
    if (saved && closeAfterSave) {
      setDeepQuizVisible(false);
      setDeepQuizStep(0);
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

  const handlePublishWish = (wish: Wish) => {
    if (!profile || !communityId) return;

    Alert.alert(
      'Share with HIVE?',
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
              setManagingWish(null);
            } else {
              Alert.alert('Error', 'Failed to share wish. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleArchiveWish = (wish: Wish) => {
    if (!profile || !communityId) return;

    const archiveWish = async () => {
      const { error } = await supabase
        .from('wishes')
        .update({ status: 'private', is_active: false } as any)
        .eq('id', wish.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        Alert.alert('Error', 'Failed to archive wish. Please try again.');
        return;
      }

      await fetchData();
      setManagingWish(null);
    };

    Alert.alert(
      'Archive Wish',
      `Archive this wish from HD Wishes?\n\n"${wish.description}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', onPress: archiveWish },
      ]
    );
  };

  const handleLinkWishToBoard = async (wish: Wish) => {
    if (!profile || !communityId) return;

    try {
      await linkWishToHdBoard({
        wish: { ...wish, user: profile },
        communityId,
        actorId: profile.id,
      });
      await fetchData();
      setManagingWish(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to link wish: ${message}`);
    }
  };

  const handleUnlinkWishBoard = (wish: Wish) => {
    if (!communityId) return;

    const unlink = async () => {
      try {
        await unlinkWishFromBoard({ wishId: wish.id, communityId });
        await fetchData();
        setManagingWish(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to unlink wish: ${message}`);
      }
    };

    Alert.alert(
      'Unlink Wish',
      `Unlink this wish from its HD board?\n\n"${wish.description}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlink', onPress: unlink },
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
      Alert.alert('Error', 'Failed to update that skill flower. Please try again.');
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
        Alert.alert('Error', 'Failed to plant that skill. Please try again.');
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
      Alert.alert('Error', 'Failed to plant that skill. Please try again.');
      return;
    }

    if (data) {
      setSkills((current) => [...current, data as Skill]);
    }
  };

  const handlePlantSkills = async (
    seeds: Array<{ description: string; enthusiasmLevel?: number; slotIndex?: number }>,
    options?: { mode?: 'fill' | 'replace' }
  ) => {
    if (!profile || !communityId || seeds.length === 0) return;

    const mode = options?.mode ?? 'fill';
    const activeNames = new Set(
      skills
        .filter(hasBloomingSkill)
        .map(skill => skill.description.trim().toLowerCase())
    );
    const bloomingCount = mode === 'replace' ? 0 : skills.filter(hasBloomingSkill).length;
    const openSlots = Math.max(0, SKILLS_GARDEN_CAPACITY - bloomingCount);
    if (openSlots === 0) return;

    const uniqueSeeds = seeds.filter((seed, index, all) => {
      const normalized = seed.description.trim().toLowerCase();
      return (mode === 'replace' || !activeNames.has(normalized)) &&
        all.findIndex(item => item.description.trim().toLowerCase() === normalized) === index;
    }).slice(0, openSlots);

    if (uniqueSeeds.length === 0) return;

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
        Alert.alert('Error', 'Failed to clear your current garden. Please try again.');
        return;
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
          Alert.alert('Error', 'Failed to plant that garden. Please try again.');
          await fetchData();
          return;
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
        Alert.alert('Error', 'Failed to plant that garden. Please try again.');
        await fetchData();
        return;
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

    deleteSkill();
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
      setManagingWish(null);
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
      const nextSurvey = pendingSurveys[0];
      if (nextSurvey) {
        setActiveSurvey(nextSurvey);
      }
      return;
    }
    if (
      label === 'Choose your title'
      || label === 'Add your birthday'
      || label === 'Write a bio'
      || label === 'Share what people should ask you about'
    ) {
      startDeepQuiz();
      return;
    }
    startEditing();
  };

  if (!profile) return null;

  const isProfileDesktop = screenWidth >= 1240;
  const isProfilePhone = screenWidth < 640;
  const profileWishPanelHeight = isProfilePhone ? 500 : 520;
  const bloomingSkillCount = skills.filter(hasBloomingSkill).length;
  const profileKnownFor = ((profile as any).known_for as string | null | undefined)?.trim() || '';
  const profileBio = ((profile as any).bio as string | null | undefined)?.trim() || '';
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
    { label: 'Book', value: (profile as any).favorite_book },
    { label: 'Food', value: (profile as any).favorite_food },
    { label: 'Hobby', value: (profile as any).favorite_hobby },
    ...(((profile as any).fun_facts as string[] | null) ?? []).map((fact: string, idx: number) => ({
      label: `Fun Fact ${idx + 1}`,
      value: fact,
    })),
  ];
  const activeWishes = wishes.filter(wish => wish.status !== 'fulfilled');
  const grantedWishes = wishes.filter(wish => wish.status === 'fulfilled');
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
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#9a7a3a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#b8ad9f"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          minHeight: multiline ? 86 : 44,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.55)',
          backgroundColor: '#fffdf7',
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          fontFamily: 'Lato_400Regular',
          fontSize: 14,
          lineHeight: 20,
          color: '#2d2d2d',
        }}
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
            label: 'People should ask me about',
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
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>Find these with Clive</Text>
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
      linkedBoardLabel={
        wish.board_category_id || wish.source_board_post_id
          ? getLinkedBoardLabel(wish.board_category) || 'HD Board'
          : null
      }
      onManage={setManagingWish}
    />
  );

  const managingWishIsLinked = !!(managingWish?.board_category_id || managingWish?.source_board_post_id);
  const wishManageModal = (
    <Modal visible={!!managingWish} animationType="fade" transparent onRequestClose={() => setManagingWish(null)}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' }}
        onPress={() => setManagingWish(null)}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: '#fffdf5',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 22,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
          }}
        >
          <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.28)', borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d' }}>
            Manage Wish
          </Text>
          {managingWish ? (
            <Text
              numberOfLines={2}
              style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: '#8a7760', marginTop: 4, marginBottom: 10 }}
            >
              {managingWish.description}
            </Text>
          ) : null}

          {managingWish?.status === 'public' ? (
            <Pressable
              onPress={() => {
                const wish = managingWish;
                setManagingWish(null);
                if (wish) openGrantModal(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-gold/25 bg-gold/10 active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle-outline" size={18} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm ml-2">
                  Granted
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(189,147,72,0.55)" />
            </Pressable>
          ) : null}

          {managingWish?.status === 'private' ? (
            <Pressable
              onPress={() => {
                const wish = managingWish;
                setManagingWish(null);
                if (wish) handlePublishWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-gold/25 bg-gold/10 active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="megaphone-outline" size={18} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm ml-2">
                  Share with HIVE
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(189,147,72,0.55)" />
            </Pressable>
          ) : null}

          {managingWish && (managingWish.status !== 'fulfilled' || managingWishIsLinked) ? (
            <Pressable
              onPress={() => {
                const wish = managingWish;
                if (!wish) return;
                if (managingWishIsLinked) {
                  handleUnlinkWishBoard(wish);
                } else {
                  void handleLinkWishToBoard(wish);
                }
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-charcoal/10 bg-white active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name={managingWishIsLinked ? 'unlink-outline' : 'albums-outline'} size={18} color="rgba(49,49,48,0.66)" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
                  {managingWishIsLinked ? 'Unlink HD board' : 'Link to my HD board'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
            </Pressable>
          ) : null}

          {managingWish?.status !== 'fulfilled' ? (
            <Pressable
              onPress={() => {
                const wish = managingWish;
                setManagingWish(null);
                if (wish) setEditingWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-charcoal/10 bg-white active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="pencil-outline" size={18} color="rgba(49,49,48,0.66)" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
                  Edit
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
            </Pressable>
          ) : null}

          {managingWish?.status === 'public' ? (
            <Pressable
              onPress={() => {
                const wish = managingWish;
                setManagingWish(null);
                if (wish) handleArchiveWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-charcoal/10 bg-white active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="archive-outline" size={18} color="rgba(49,49,48,0.66)" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
                  Archive
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
            </Pressable>
          ) : null}

          {managingWish ? (
            <Pressable
              onPress={() => {
                const wish = managingWish;
                setManagingWish(null);
                if (wish) handleDeleteWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-red-100 bg-red-50 active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-500 text-sm ml-2">
                  Delete
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(239,68,68,0.45)" />
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <AppHeader title="Profile" />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Profile Header with Bee Progress Arc */}
        <FadeIn>
        {(() => {
          const seededSkillsGarden = skills.some(hasBloomingSkill);
          const checks = [
            { label: 'Add a photo', done: !!profile.avatar_url },
            { label: 'Choose your title', done: !!(profile as any).profile_title },
            { label: 'Add your birthday', done: !!profile.birthday },
            { label: 'Add your phone', done: !!profile.phone },
            { label: 'Write a bio', done: !!(profile as any).bio },
            { label: 'Share what people should ask you about', done: !!(profile as any).known_for },
            { label: 'Answer your 3MIQ', done: !!((profile as any).miq_experiences && (profile as any).miq_growth && (profile as any).miq_contribution) },
            { label: "Complete this month's check-in", done: pendingSurveys.length === 0 },
            { label: 'Seed your Skills Garden', done: seededSkillsGarden },
            { label: 'Share a wish', done: wishes.length > 0 },
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
                  <Pressable
                    onPress={startDeepQuiz}
                    className="active:opacity-80"
                    style={{
                      marginTop: 10,
                      borderRadius: 999,
                      backgroundColor: '#bd9348',
                      paddingHorizontal: 18,
                      paddingVertical: 9,
                      shadowColor: '#bd9348',
                      shadowOpacity: 0.16,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 5 },
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#fffaf0' }}>Let's get deeper</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          );
        })()}
        </FadeIn>

        {/* Profile Information */}
        <FadeIn delay={100}>
        <View className="mb-6">
          <View className="flex-row items-center justify-end mb-2">
            {!isEditing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={startDeepQuiz} className="px-3 py-1 active:opacity-70">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">Go deeper</Text>
                </Pressable>
                <Pressable onPress={startEditing} className="px-3 py-1 active:opacity-70">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">Edit</Text>
                </Pressable>
              </View>
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
              {isProfileDesktop ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                    gap: 18,
                    marginTop: 4,
                  }}
                >
                  <View
                    style={{
                      width: 290,
                      minHeight: 560,
                      borderRadius: 34,
                      backgroundColor: '#fffdf5',
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.35)',
                      paddingHorizontal: 24,
                      paddingVertical: 28,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: '#bd9348', marginBottom: 12 }}>
                      People should ask me about
                    </Text>
                    <Text style={{ fontFamily: 'LibreBaskerville_400Regular', fontSize: 18, lineHeight: 28, color: '#2d2d2d', fontStyle: 'italic' }}>
                      {profileKnownFor ? `"${profileKnownFor}"` : 'Add the one thing people should ask you about.'}
                    </Text>
                  </View>

                  <View style={{ width: 540, alignSelf: 'center' }}>
                    <ProfileHoneycombCluster
                      size="roomy"
                      preferredColumns={3}
                      items={profileHoneycombItems}
                    />
                  </View>

                  <View
                    style={{
                      width: 330,
                      minHeight: 560,
                      borderRadius: 34,
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: 'rgba(45,45,45,0.08)',
                      paddingHorizontal: 24,
                      paddingVertical: 28,
                      justifyContent: 'center',
                      shadowColor: '#2d2d2d',
                      shadowOpacity: 0.06,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 8 },
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 12 }}>
                      Bio
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 24, color: '#2d2d2d' }}>
                      {profileBio || 'Add your bio here.'}
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={{ paddingVertical: 2 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: '#bd9348', marginBottom: 8 }}>
                      People should ask me about
                    </Text>
                    <Text style={{ fontFamily: 'LibreBaskerville_400Regular', fontSize: isProfilePhone ? 19 : 20, lineHeight: isProfilePhone ? 28 : 30, color: '#2d2d2d', fontStyle: 'italic' }}>
                      {profileKnownFor ? `"${profileKnownFor}"` : 'Add the one thing people should ask you about.'}
                    </Text>
                  </View>

                  <ProfileHoneycombCluster
                    size="compact"
                    preferredColumns={isProfilePhone ? 3 : undefined}
                    items={profileHoneycombItems}
                  />

                  <View
                    style={{
                      borderRadius: 28,
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: 'rgba(45,45,45,0.08)',
                      padding: 18,
                      shadowColor: '#2d2d2d',
                      shadowOpacity: 0.05,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 5 },
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 8 }}>
                      Bio
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 23, color: '#2d2d2d' }}>
                      {profileBio || 'Add your bio here.'}
                    </Text>
                  </View>
                </>
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

        {/* Personality Notes - How HIVE Sees You */}
        {!initialLoading && userInsights?.personality_notes && (
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

        {/* Skills Garden */}
        {!initialLoading && <FadeIn delay={50}>
        <View
          className="mb-6"
          onLayout={(event) => {
            skillsGardenY.current = event.nativeEvent.layout.y;
          }}
        >
          <View className="flex-row items-center justify-between mb-1">
            <View>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
                Skills Garden 🌸
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {bloomingSkillCount > 0
                  ? `${bloomingSkillCount} skill flower${bloomingSkillCount !== 1 ? 's' : ''} blooming`
                  : 'Seed your Skills Garden'}
              </Text>
            </View>
          </View>
          <SkillBubbleGarden
            skills={skills}
            editable
            onUpdateSkill={handleSkillBubbleUpdate}
            onDeleteSkill={handleDeleteSkill}
            seedSkills={PREDEFINED_SKILLS}
            onPlantSkill={handlePlantSkill}
            onPlantSkills={handlePlantSkills}
            onAddCustomSkill={() => setSkillsModalVisible(true)}
          />
        </View>

        {/* Wishes */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ marginBottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ alignSelf: 'flex-start', flexShrink: 1, backgroundColor: '#fdf3dc', borderColor: 'rgba(222,193,129,0.7)', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingHorizontal: 14, paddingVertical: 7 }}>
              <Text numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', fontSize: isProfilePhone ? 16 : 17, color: '#2d2d2d' }}>
                Your HD Wishes ({wishes.length})
              </Text>
            </View>
            <ProfileHeaderActionPill label="+ Wish" onPress={() => setAddWishModalVisible(true)} />
          </View>

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
            height: profileWishPanelHeight,
            overflow: 'hidden',
          }}>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{
                padding: 12,
                paddingBottom: 12,
                flexGrow: wishes.length === 0 ? 1 : undefined,
              }}
            >
              {wishes.length === 0 ? (
                <View style={{ backgroundColor: '#fffdf5', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(222,193,129,0.32)' }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', color: 'rgba(45,45,45,0.48)', textAlign: 'center' }}>
                    No wishes yet. What do you need help with?
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {activeWishes.map(renderWishCard)}
                  {grantedWishes.length > 0 ? (
                    <View
                      key="granted-divider"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderTopWidth: activeWishes.length > 0 ? 1 : 0,
                        borderBottomWidth: 1,
                        borderColor: 'rgba(222,193,129,0.28)',
                        backgroundColor: '#fbf1dc',
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8e7a5e' }}>
                        Granted ({grantedWishes.length})
                      </Text>
                      <Ionicons name="sparkles-outline" size={14} color="#bd9348" />
                    </View>
                  ) : null}
                  {grantedWishes.map(renderWishCard)}
                </View>
              )}
            </ScrollView>
            </View>
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
      />

      {activeSurvey && (
        <SurveyModal
          survey={activeSurvey}
          onSubmit={(answers) => submitResponse(activeSurvey.id, answers)}
          onClose={() => setActiveSurvey(null)}
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

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: isProfilePhone ? 18 : 26,
                paddingVertical: 22,
              }}
            >
              {renderDeepQuizStep()}
            </ScrollView>

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
    </SafeAreaView>
  );
}

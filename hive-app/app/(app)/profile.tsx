import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, TextInput, Platform, Linking, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useWishes } from '../../lib/hooks/useWishes';
import { Avatar } from '../../components/ui/Avatar';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { SkillsManageModal } from '../../components/skills/SkillsManageModal';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { Ionicons } from '@expo/vector-icons';
import { formatDateLong, formatDateShort, isoToAmerican, parseAmericanDate } from '../../lib/dateUtils';
import type { Skill, Wish, ActionItem, UserInsights, Profile } from '../../types';

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

export default function ProfileScreen() {
  const { profile, communityId, communityRole, refreshProfile } = useAuth();
  const { permissionStatus, requestPermissions } = useNotifications();
  const { grantWish } = useWishes();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [addWishModalVisible, setAddWishModalVisible] = useState(false);
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null);

  // Editable profile fields
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editPreferredContact, setEditPreferredContact] = useState('email');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile || !communityId) return;

    // Fetch skills
    const { data: skillsData } = await supabase
      .from('skills')
      .select('*')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .order('created_at', { ascending: false });
    if (skillsData) setSkills(skillsData);

    // Fetch wishes
    const { data: wishesData } = await supabase
      .from('wishes')
      .select('*')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .order('created_at', { ascending: false });
    if (wishesData) setWishes(wishesData);

    // Fetch action items
    const { data: actionItemsData } = await supabase
      .from('action_items')
      .select('*')
      .eq('assigned_to', profile.id)
      .eq('community_id', communityId)
      .eq('completed', false)
      .order('due_date', { ascending: true });
    if (actionItemsData) setActionItems(actionItemsData);

    // Fetch user insights (personality notes)
    const { data: insightsData } = await supabase
      .from('user_insights')
      .select('*')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .single();
    setUserInsights(insightsData);
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
      setEditPreferredContact(profile.preferred_contact || 'email');
    }
  }, [profile]);

  const startEditing = () => {
    if (profile) {
      setEditName(profile.name || '');
      setEditPhone(formatPhoneNumber(profile.phone || ''));
      // Convert ISO date to American format for editing
      setEditBirthday(profile.birthday ? isoToAmerican(profile.birthday) : '');
      setEditOccupation(profile.occupation || '');
      setEditPreferredContact(profile.preferred_contact || 'email');
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
      setEditPreferredContact(profile.preferred_contact || 'email');
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
        preferred_contact: editPreferredContact,
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to change your profile photo.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
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
              .eq('user_id', profile?.id)
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

  const handleRefineWithClive = (roughWish: string) => {
    setAddWishModalVisible(false);
    // Navigate to chat with the rough wish as context
    router.push({
      pathname: '/(app)',
      params: { refineWish: roughWish },
    });
  };

  if (!profile) return null;

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout && (
        <AppHeader
          title="Profile"
          onMenuPress={() => setDrawerOpen(true)}
        />
      )}

      {/* Navigation Drawer */}
      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mode="navigation"
        />
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Profile Header */}
        <View className="items-center mb-6">
          <Pressable onPress={pickImage} disabled={isUploadingPhoto} className="relative active:opacity-80">
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
          <Pressable onPress={pickImage} disabled={isUploadingPhoto}>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-gold text-sm mt-2">
              Change Photo
            </Text>
          </Pressable>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal mt-2">
            {profile.name}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60">{profile.email}</Text>
          {profile.occupation && (
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 mt-1">
              {profile.occupation}
            </Text>
          )}
          {communityRole && communityRole !== 'member' && (
            <View className="bg-gold-light px-3 py-1 rounded-full mt-2">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold capitalize">
                {communityRole}
              </Text>
            </View>
          )}
        </View>

        {/* Profile Information */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
              Profile Information
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
                <TextInput
                  value={editBirthday}
                  onChangeText={setEditBirthday}
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base p-0"
                  placeholder="MM-DD-YYYY"
                  placeholderTextColor="#9CA3AF"
                />
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  {formatBirthdayForDisplay(profile.birthday) || 'Not set'}
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
        </View>

        {/* Personality Notes - How the Hive Sees You */}
        {userInsights?.personality_notes && (
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
        {actionItems.length > 0 && (
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
                No skills recorded yet. Chat with the HIVE assistant to add some!
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-xl shadow-sm overflow-hidden">
              {skills.map((skill) => (
                <View
                  key={skill.id}
                  className="p-4 border-b border-cream last:border-b-0"
                >
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{skill.description}</Text>
                </View>
              ))}
            </View>
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
                    {wish.status === 'private' && (
                      <Pressable
                        onPress={() => handlePublishWish(wish)}
                        className="bg-gold-light px-3 py-1 rounded-full active:bg-gold/30"
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                          Share with Hive
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
                    {permissionStatus === 'granted'
                      ? 'Enabled - you will receive notifications'
                      : permissionStatus === 'denied'
                      ? 'Disabled - enable in Settings'
                      : 'Not yet enabled'}
                  </Text>
                </View>
                {permissionStatus !== 'granted' && (
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
                {permissionStatus === 'granted' && (
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
        onSave={fetchData}
        onRefineWithClive={handleRefineWithClive}
      />
    </SafeAreaView>
  );
}

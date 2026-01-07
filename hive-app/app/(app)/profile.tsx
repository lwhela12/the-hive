import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import type { Skill, Wish, ActionItem } from '../../types';

export default function ProfileScreen() {
  const { profile, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);

  const fetchData = useCallback(async () => {
    if (!profile) return;

    // Fetch skills
    const { data: skillsData } = await supabase
      .from('skills')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (skillsData) setSkills(skillsData);

    // Fetch wishes
    const { data: wishesData } = await supabase
      .from('wishes')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (wishesData) setWishes(wishesData);

    // Fetch action items
    const { data: actionItemsData } = await supabase
      .from('action_items')
      .select('*')
      .eq('assigned_to', profile.id)
      .eq('completed', false)
      .order('due_date', { ascending: true });
    if (actionItemsData) setActionItems(actionItemsData);
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    await fetchData();
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
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
      .eq('id', item.id);

    if (!error) {
      setActionItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  };

  if (!profile) return null;

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Profile Header */}
        <View className="items-center mb-6">
          <Avatar name={profile.name} url={profile.avatar_url} size={80} />
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal mt-3">
            {profile.name}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60">{profile.email}</Text>
          {profile.role !== 'member' && (
            <View className="bg-gold-light px-3 py-1 rounded-full mt-2">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold capitalize">
                {profile.role}
              </Text>
            </View>
          )}
        </View>

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
                        Due:{' '}
                        {new Date(item.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
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
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
            Your Skills ({skills.length})
          </Text>
          {skills.length === 0 ? (
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                No skills recorded yet. Chat with the Hive assistant to add some!
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
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
            Your Wishes ({wishes.length})
          </Text>
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
                  <View className="flex-row items-center mb-1">
                    <View
                      className={`w-2 h-2 rounded-full mr-2 ${
                        wish.status === 'public'
                          ? 'bg-green-500'
                          : wish.status === 'fulfilled'
                          ? 'bg-blue-500'
                          : 'bg-charcoal/40'
                      }`}
                    />
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60 capitalize">
                      {wish.status}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">{wish.description}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Sign Out Button */}
        <Pressable
          onPress={handleSignOut}
          className="bg-red-50 p-4 rounded-xl items-center active:bg-red-100"
        >
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-600">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

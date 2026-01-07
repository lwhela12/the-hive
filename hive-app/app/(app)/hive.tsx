import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { QueenBeeCard } from '../../components/hive/QueenBeeCard';
import { WishCard } from '../../components/hive/WishCard';
import { HoneyPotDisplay } from '../../components/hive/HoneyPotDisplay';
import type { QueenBee, Wish, Event, Profile, Skill } from '../../types';

export default function HiveScreen() {
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [queenBee, setQueenBee] = useState<(QueenBee & { user: Profile }) | null>(null);
  const [publicWishes, setPublicWishes] = useState<(Wish & { user: Profile })[]>([]);
  const [matchingWishes, setMatchingWishes] = useState<(Wish & { user: Profile })[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [honeyPotBalance, setHoneyPotBalance] = useState(0);
  const [userSkills, setUserSkills] = useState<Skill[]>([]);

  const fetchData = useCallback(async () => {
    // Fetch current Queen Bee
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: qb } = await supabase
      .from('queen_bees')
      .select('*, user:profiles(*)')
      .eq('month', currentMonth)
      .single();
    if (qb) setQueenBee(qb as QueenBee & { user: Profile });

    // Fetch public wishes
    const { data: wishes } = await supabase
      .from('wishes')
      .select('*, user:profiles(*)')
      .eq('status', 'public')
      .eq('is_active', true)
      .neq('user_id', profile?.id)
      .order('created_at', { ascending: false });
    if (wishes) setPublicWishes(wishes as (Wish & { user: Profile })[]);

    // Fetch user's skills for matching
    if (profile) {
      const { data: skills } = await supabase
        .from('skills')
        .select('*')
        .eq('user_id', profile.id);
      if (skills) setUserSkills(skills);
    }

    // Fetch upcoming events
    const today = new Date().toISOString().split('T')[0];
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(3);
    if (events) setUpcomingEvents(events);

    // Fetch honey pot balance
    const { data: pot } = await supabase
      .from('honey_pot')
      .select('balance')
      .single();
    if (pot) setHoneyPotBalance(pot.balance);
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Header */}
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal mb-4">
          Check on the Hive 🐝
        </Text>

        {/* Queen Bee Section */}
        {queenBee && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              This Month's Queen Bee 👑
            </Text>
            <QueenBeeCard queenBee={queenBee} />
          </View>
        )}

        {/* Honey Pot */}
        <View className="mb-6">
          <HoneyPotDisplay balance={honeyPotBalance} />
        </View>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              Upcoming Events
            </Text>
            <View className="bg-white rounded-xl p-4 shadow-sm">
              {upcomingEvents.map((event) => (
                <View
                  key={event.id}
                  className="flex-row items-center py-2 border-b border-cream last:border-b-0"
                >
                  <Text className="text-2xl mr-3">
                    {event.event_type === 'birthday' ? '🎂' :
                     event.event_type === 'meeting' ? '📅' :
                     event.event_type === 'queen_bee' ? '👑' : '📌'}
                  </Text>
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{event.title}</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                      {new Date(event.event_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Public Wishes */}
        <View className="mb-6">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
            Community Wishes
          </Text>
          {publicWishes.length === 0 ? (
            <View className="bg-white rounded-xl p-6 shadow-sm items-center">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">No public wishes yet</Text>
            </View>
          ) : (
            publicWishes.map((wish) => (
              <WishCard key={wish.id} wish={wish} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

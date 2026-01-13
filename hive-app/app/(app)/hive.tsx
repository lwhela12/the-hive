import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Image, useWindowDimensions } from 'react-native';
import Svg, { Path, Text as SvgText, TextPath, Defs } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { QueenBeeCard } from '../../components/hive/QueenBeeCard';
import { WishCard } from '../../components/hive/WishCard';
import { HoneyPotDisplay } from '../../components/hive/HoneyPotDisplay';
import { ExpandableSection } from '../../components/hive/ExpandableSection';
import { AudioRecorder } from '../../components/meetings/AudioRecorder';
import { MeetingSummary } from '../../components/meetings/MeetingSummary';
import { formatDateShort } from '../../lib/dateUtils';
import type { QueenBee, Wish, Event, Profile, Skill, Meeting } from '../../types';

export default function HiveScreen() {
  const { profile, communityId } = useAuth();
  const { width } = useWindowDimensions();

  // Responsive seal sizing - smaller on mobile
  const sealSize = width < 500 ? Math.floor((width - 40) / 3) : 160;
  const arcStart = Math.floor(sealSize * 0.19);
  const arcEnd = sealSize - arcStart;
  const arcY = Math.floor(sealSize * 0.5);
  const arcRadius = Math.floor(sealSize * 0.31);
  const fontSize = width < 500 ? 11 : 13;
  const [refreshing, setRefreshing] = useState(false);
  const [queenBee, setQueenBee] = useState<(QueenBee & { user: Profile }) | null>(null);
  const [publicWishes, setPublicWishes] = useState<(Wish & { user: Profile })[]>([]);
  const [matchingWishes, setMatchingWishes] = useState<(Wish & { user: Profile })[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [honeyPotBalance, setHoneyPotBalance] = useState(0);
  const [userSkills, setUserSkills] = useState<Skill[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const fetchData = useCallback(async () => {
    if (!communityId) return;
    // Fetch current Queen Bee
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: qb } = await supabase
      .from('queen_bees')
      .select('*, user:profiles(*)')
      .eq('month', currentMonth)
      .eq('community_id', communityId)
      .single();
    if (qb) setQueenBee(qb as QueenBee & { user: Profile });

    // Fetch public wishes
    const { data: wishes } = await supabase
      .from('wishes')
      .select('*, user:profiles(*)')
      .eq('status', 'public')
      .eq('is_active', true)
      .eq('community_id', communityId)
      .neq('user_id', profile?.id)
      .order('created_at', { ascending: false });
    if (wishes) setPublicWishes(wishes as (Wish & { user: Profile })[]);

    // Fetch user's skills for matching
    if (profile) {
      const { data: skills } = await supabase
        .from('skills')
        .select('*')
        .eq('user_id', profile.id)
        .eq('community_id', communityId);
      if (skills) setUserSkills(skills);
    }

    // Fetch upcoming events
    const today = new Date().toISOString().split('T')[0];
    const { data: events } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', today)
      .eq('community_id', communityId)
      .order('event_date', { ascending: true })
      .limit(3);
    if (events) setUpcomingEvents(events);

    // Fetch honey pot balance
    const { data: pot } = await supabase
      .from('honey_pot')
      .select('balance')
      .eq('community_id', communityId)
      .single();
    if (pot) setHoneyPotBalance(pot.balance);

    // Fetch recent meetings
    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('*')
      .eq('community_id', communityId)
      .order('date', { ascending: false })
      .limit(5);
    if (meetingsData) setMeetings(meetingsData);
  }, [profile?.id, communityId]);

  const handleRecordingComplete = async (audioPath: string) => {
    if (!communityId) {
      Alert.alert('Error', 'No active community selected.');
      return;
    }
    try {
      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          date: new Date().toISOString().split('T')[0],
          audio_url: audioPath,
          recorded_by: profile?.id,
          processing_status: 'pending',
          community_id: communityId,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: transcribeError } = await supabase.functions.invoke('transcribe', {
        body: { meeting_id: meeting.id }
      });

      if (transcribeError) {
        console.error('Failed to start transcription:', transcribeError);
      }

      setShowRecorder(false);
      await fetchData();
      Alert.alert(
        'Meeting Recorded',
        'Your meeting has been saved and transcription has started.'
      );
    } catch (error) {
      console.error('Error saving meeting:', error);
      Alert.alert('Error', 'Failed to save meeting recording.');
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Show audio recorder fullscreen
  if (showRecorder) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <AudioRecorder
          onComplete={handleRecordingComplete}
          onCancel={() => setShowRecorder(false)}
        />
      </SafeAreaView>
    );
  }

  // Show meeting summary fullscreen
  if (selectedMeeting) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <MeetingSummary
          meeting={selectedMeeting}
          onBack={() => setSelectedMeeting(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Logo Header */}
      <View className="items-center" style={{ marginBottom: -20 }}>
        <Image
          source={require('../../assets/TEXT IN GOLD.png')}
          style={{ width: '100%', height: 180 }}
          resizeMode="contain"
        />
      </View>

      {/* Queen Bee Seals Row */}
      <View className="flex-row justify-evenly items-center px-2 pb-4 border-b border-gray-100">
        <View className="items-center" style={{ width: sealSize, height: sealSize }}>
          <Image
            source={require('../../assets/SIMPLIFIED SEAL 2.png')}
            style={{ width: sealSize, height: sealSize, position: 'absolute' }}
            resizeMode="contain"
          />
          <Svg width={sealSize} height={sealSize} style={{ position: 'absolute' }}>
            <Defs>
              <Path
                id="lastMonthArc"
                d={`M ${arcStart},${arcY} A ${arcRadius},${arcRadius} 0 0,0 ${arcEnd},${arcY}`}
              />
            </Defs>
            <SvgText fill="#333" fontSize={fontSize} fontWeight="bold">
              <TextPath href="#lastMonthArc" startOffset="50%" textAnchor="middle">
                Last Month
              </TextPath>
            </SvgText>
          </Svg>
        </View>
        <View className="items-center" style={{ width: sealSize, height: sealSize }}>
          <Image
            source={require('../../assets/SIMPLIFIED SEAL 2.png')}
            style={{ width: sealSize, height: sealSize, position: 'absolute' }}
            resizeMode="contain"
          />
          <Svg width={sealSize} height={sealSize} style={{ position: 'absolute' }}>
            <Defs>
              <Path
                id="currentArc"
                d={`M ${arcStart},${arcY} A ${arcRadius},${arcRadius} 0 0,0 ${arcEnd},${arcY}`}
              />
            </Defs>
            <SvgText fill="#333" fontSize={fontSize} fontWeight="bold">
              <TextPath href="#currentArc" startOffset="50%" textAnchor="middle">
                Current
              </TextPath>
            </SvgText>
          </Svg>
        </View>
        <View className="items-center" style={{ width: sealSize, height: sealSize }}>
          <Image
            source={require('../../assets/SIMPLIFIED SEAL 2.png')}
            style={{ width: sealSize, height: sealSize, position: 'absolute' }}
            resizeMode="contain"
          />
          <Svg width={sealSize} height={sealSize} style={{ position: 'absolute' }}>
            <Defs>
              <Path
                id="nextMonthArc"
                d={`M ${arcStart},${arcY} A ${arcRadius},${arcRadius} 0 0,0 ${arcEnd},${arcY}`}
              />
            </Defs>
            <SvgText fill="#333" fontSize={fontSize} fontWeight="bold">
              <TextPath href="#nextMonthArc" startOffset="50%" textAnchor="middle">
                Next Month
              </TextPath>
            </SvgText>
          </Svg>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >

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
                      {formatDateShort(event.event_date)}
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

        {/* Meetings Section */}
        <ExpandableSection title="Meetings" icon="🎙️">
          <View className="bg-white rounded-xl p-4 shadow-sm">
            <Pressable
              onPress={() => setShowRecorder(true)}
              className="bg-gold py-3 px-4 rounded-lg mb-4 items-center active:opacity-80"
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                Record Meeting
              </Text>
            </Pressable>

            {meetings.length === 0 ? (
              <View className="items-center py-4">
                <Text className="text-4xl mb-2">📝</Text>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                  No meetings recorded yet.
                </Text>
              </View>
            ) : (
              meetings.map((meeting) => (
                <Pressable
                  key={meeting.id}
                  onPress={() => setSelectedMeeting(meeting)}
                  className="flex-row items-center justify-between py-3 border-b border-cream last:border-b-0 active:opacity-70"
                >
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
                      {formatDateShort(meeting.date)}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                      {meeting.processing_status === 'complete'
                        ? 'Ready to view'
                        : meeting.processing_status === 'failed'
                        ? 'Processing failed'
                        : 'Processing...'}
                    </Text>
                  </View>
                  <Text className="text-xl">
                    {meeting.processing_status === 'complete'
                      ? '✓'
                      : meeting.processing_status === 'failed'
                      ? '✗'
                      : '⏳'}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </ExpandableSection>
      </ScrollView>
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import {
  getSurveyAvailableAt,
  getSurveyResponsePeriod,
  isMonthlyCheckInSurvey,
  type Survey,
  type SurveyAnswers,
  type SurveyResponse,
} from '../../lib/hooks/useSurveys';

const POLL_INTERVAL_MS = 20 * 1000;

type BoardMember = {
  id: string;
  name: string;
  avatar_url: string | null;
};

type BoardMeeting = {
  event_date: string;
  event_time: string | null;
  title: string;
};

function getTextAnswer(answers: SurveyAnswers, key: string) {
  const value = answers[key];
  return typeof value === 'string' ? value.trim() : '';
}

function getNumberAnswer(answers: SurveyAnswers, key: string) {
  const value = answers[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function getMonthNameFromPeriod(period?: string | null) {
  const match = (period ?? '').match(/^(\d{4})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
    : new Date();
  return date.toLocaleString('en-US', { month: 'long' });
}

function formatMeetingDate(meeting: BoardMeeting | null) {
  if (!meeting?.event_date) return '';
  const [year, month, day] = meeting.event_date.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  const date = new Date(year, month - 1, day);
  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return meeting.event_time ? `${dateLabel} · ${meeting.event_time}` : dateLabel;
}

// Energy is answered on a 1–10 scale; the board shows it as ⚡ dots out of 5.
function getEnergyDots(level: number) {
  return Math.min(5, Math.max(1, Math.round(level / 2)));
}

function getLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function ArrivalBoardScreen() {
  const router = useRouter();
  const { communityId } = useAuth();
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responsePeriod, setResponsePeriod] = useState<string | null>(null);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [responsesByUser, setResponsesByUser] = useState<Map<string, SurveyResponse>>(new Map());
  const [nextMeeting, setNextMeeting] = useState<BoardMeeting | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const loadingRef = useRef(false);

  const loadBoard = useCallback(async () => {
    if (!communityId || loadingRef.current) return;
    loadingRef.current = true;

    try {
      const today = getLocalIsoDate(new Date());
      const [surveysRes, membersRes, meetingRes] = await Promise.all([
        supabase
          .from('surveys')
          .select('*')
          .eq('community_id', communityId)
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('community_memberships')
          .select('profiles!user_id(id, name, avatar_url)')
          .eq('community_id', communityId),
        supabase
          .from('events')
          .select('event_date, event_time, title')
          .eq('community_id', communityId)
          .eq('event_type', 'meeting')
          .gte('event_date', today)
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .limit(1),
      ]);

      const activeCheckIn =
        ((surveysRes.data ?? []) as Survey[]).find(isMonthlyCheckInSurvey) ?? null;
      const period = activeCheckIn ? getSurveyResponsePeriod(activeCheckIn) : null;

      const memberRows = ((membersRes.data ?? []) as unknown as { profiles: BoardMember | BoardMember[] | null }[])
        .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
        .filter((member): member is BoardMember => !!member?.id && !!member.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      const byUser = new Map<string, SurveyResponse>();
      if (activeCheckIn && period) {
        const { data: responseRows } = await supabase
          .from('survey_responses')
          .select('*')
          .eq('survey_id', activeCheckIn.id)
          .eq('community_id', communityId);

        // Legacy responses may not carry a response_period; count them for this
        // period only if they were submitted after the check-in window opened.
        const windowOpenedAt = getSurveyAvailableAt(activeCheckIn);
        ((responseRows ?? []) as SurveyResponse[]).forEach((response) => {
          const matchesPeriod = response.response_period
            ? response.response_period === period
            : !windowOpenedAt || new Date(response.submitted_at) >= windowOpenedAt;
          if (!matchesPeriod) return;

          const existing = byUser.get(response.user_id);
          if (!existing || response.submitted_at > existing.submitted_at) {
            byUser.set(response.user_id, response);
          }
        });
      }

      setSurvey(activeCheckIn);
      setResponsePeriod(period);
      setMembers(memberRows);
      setResponsesByUser(byUser);
      setNextMeeting((meetingRes.data?.[0] as BoardMeeting | undefined) ?? null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.warn('Could not load the Arrival Board', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  // Simple + reliable live updates: poll every ~20 seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadBoard();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadBoard]);

  // Refresh whenever the browser tab regains focus (the TV use case).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onFocus = () => {
      void loadBoard();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadBoard]);

  // Ticker so the "updated just now" whisper stays honest between polls.
  useEffect(() => {
    const ticker = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(ticker);
  }, []);

  const updatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return '';
    const seconds = Math.max(0, Math.round((nowTick - lastUpdatedAt.getTime()) / 1000));
    if (seconds < 25) return 'updated just now';
    if (seconds < 90) return `updated ${seconds}s ago`;
    return `updated ${Math.round(seconds / 60)}m ago`;
  }, [lastUpdatedAt, nowTick]);

  // 10 members → 5×2 on a 1920×1080 TV, gracefully narrower on laptops/phones.
  const isTV = width >= 1400;
  const columns = width >= 1400 ? 5 : width >= 1024 ? 4 : width >= 760 ? 3 : width >= 480 ? 2 : 1;

  const monthName = getMonthNameFromPeriod(responsePeriod);
  const meetingLine = formatMeetingDate(nextMeeting);
  const checkedInCount = members.filter((member) => responsesByUser.has(member.id)).length;

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: isTV ? 36 : 16,
          paddingTop: isTV ? 20 : 12,
          paddingBottom: 32,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: isTV ? 22 : 14 }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/meetings'))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.55)',
              marginTop: isTV ? 8 : 2,
            })}
          >
            <Ionicons name="chevron-back" size={20} color="#8a6b30" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: 'LibreBaskerville_700Bold',
                fontSize: isTV ? 42 : 24,
                lineHeight: isTV ? 52 : 32,
                color: '#2d2d2d',
              }}
            >
              🐝 {monthName} Hummdinger — who's in the room
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: isTV ? 14 : 8, marginTop: isTV ? 8 : 4 }}>
              {meetingLine ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isTV ? 20 : 14, color: '#8a6b30' }}>
                  {meetingLine}
                </Text>
              ) : null}
              {survey ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: isTV ? 18 : 13, color: '#9a8060' }}>
                  {checkedInCount} of {members.length} checked in
                </Text>
              ) : null}
              {updatedLabel ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: isTV ? 15 : 11, color: 'rgba(154,128,96,0.6)' }}>
                  {updatedLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 80, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#bd9348" />
          </View>
        ) : !survey ? (
          <View
            style={{
              backgroundColor: '#fffdf5',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.5)',
              padding: 32,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🌙</Text>
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: isTV ? 26 : 18, color: '#2d2d2d', textAlign: 'center' }}>
              No monthly check-in is live right now
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: isTV ? 17 : 14, color: '#9a8060', textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
              Once the monthly check-in survey is active, arrivals will glow here.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: isTV ? -10 : -6 }}>
            {members.map((member) => {
              const response = responsesByUser.get(member.id);
              const answers = response?.answers ?? {};
              const checkedIn = !!response;
              const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
              const feeling = getTextAnswer(answers, 'q_feeling_today');
              const feelingNote = getTextAnswer(answers, 'q_feeling_note');
              const energyLevel = getNumberAnswer(answers, 'q_energy_level');
              const energyMode = getTextAnswer(answers, 'q_energy_mode');
              const energyDots = energyLevel !== null ? getEnergyDots(energyLevel) : null;

              return (
                <View key={member.id} style={{ width: `${100 / columns}%`, padding: isTV ? 10 : 6 }}>
                  <View
                    style={{
                      backgroundColor: checkedIn ? '#fffdf5' : 'rgba(255,253,245,0.55)',
                      borderRadius: isTV ? 26 : 18,
                      borderWidth: 1,
                      borderColor: checkedIn ? 'rgba(222,193,129,0.65)' : 'rgba(222,193,129,0.28)',
                      paddingVertical: isTV ? 26 : 18,
                      paddingHorizontal: isTV ? 18 : 14,
                      alignItems: 'center',
                      minHeight: isTV ? 340 : 220,
                      opacity: checkedIn ? 1 : 0.55,
                      shadowColor: '#bd9348',
                      shadowOpacity: checkedIn ? 0.12 : 0,
                      shadowRadius: 14,
                      shadowOffset: { width: 0, height: 6 },
                    }}
                  >
                    <Avatar name={member.name} url={member.avatar_url} size={isTV ? 88 : 56} />
                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: 'LibreBaskerville_700Bold',
                        fontSize: isTV ? 34 : 22,
                        lineHeight: isTV ? 42 : 28,
                        color: '#2d2d2d',
                        textAlign: 'center',
                        marginTop: isTV ? 14 : 10,
                      }}
                    >
                      {nameToday}
                    </Text>

                    {checkedIn ? (
                      <>
                        {feeling ? (
                          <Text
                            style={{
                              fontFamily: 'Lato_700Bold',
                              fontSize: isTV ? 20 : 15,
                              lineHeight: isTV ? 27 : 21,
                              color: '#8a6b30',
                              textAlign: 'center',
                              marginTop: isTV ? 12 : 8,
                            }}
                          >
                            {feeling}
                          </Text>
                        ) : null}
                        {feelingNote ? (
                          <Text
                            style={{
                              fontFamily: 'Lato_400Regular',
                              fontStyle: 'italic',
                              fontSize: isTV ? 16 : 12,
                              lineHeight: isTV ? 22 : 17,
                              color: '#9a8060',
                              textAlign: 'center',
                              marginTop: isTV ? 8 : 6,
                            }}
                          >
                            "{feelingNote}"
                          </Text>
                        ) : null}
                        {energyDots !== null || energyMode ? (
                          <View style={{ alignItems: 'center', marginTop: 'auto', paddingTop: isTV ? 14 : 10 }}>
                            {energyDots !== null ? (
                              <View style={{ flexDirection: 'row', gap: isTV ? 4 : 2 }}>
                                {[1, 2, 3, 4, 5].map((dot) => (
                                  <Text
                                    key={dot}
                                    style={{ fontSize: isTV ? 18 : 13, opacity: dot <= energyDots ? 1 : 0.2 }}
                                  >
                                    ⚡
                                  </Text>
                                ))}
                              </View>
                            ) : null}
                            {energyMode ? (
                              <Text
                                numberOfLines={1}
                                style={{
                                  fontFamily: 'Lato_400Regular',
                                  fontSize: isTV ? 14 : 11,
                                  color: '#9a8060',
                                  marginTop: 4,
                                }}
                              >
                                {energyMode}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <Text
                        style={{
                          fontFamily: 'Lato_400Regular',
                          fontSize: isTV ? 17 : 13,
                          color: '#9a8060',
                          textAlign: 'center',
                          marginTop: isTV ? 14 : 10,
                        }}
                      >
                        hasn't checked in yet 🌙
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

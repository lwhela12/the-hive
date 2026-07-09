import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  formatMeetingDate,
  getMonthNameFromPeriod,
  useArrivalBoard,
} from '../../lib/hooks/useArrivalBoard';
import { ArrivalMemberCard } from '../../components/meetings/ArrivalMemberCard';

const hiveBee = require('../../assets/HIVE Bee.png');

export default function ArrivalBoardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const {
    loading,
    survey,
    responsePeriod,
    members,
    responsesByUser,
    nextMeeting,
    lastUpdatedAt,
  } = useArrivalBoard();
  const [nowTick, setNowTick] = useState(Date.now());

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: isTV ? 14 : 8 }}>
              <Image
                source={hiveBee}
                style={{ width: isTV ? 52 : 30, height: isTV ? 52 : 30 }}
                contentFit="contain"
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: 'LibreBaskerville_700Bold',
                  fontSize: isTV ? 42 : 24,
                  lineHeight: isTV ? 52 : 32,
                  color: '#2d2d2d',
                }}
              >
                {monthName} Hummdinger — who's in the room
              </Text>
            </View>
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
            {members.map((member) => (
              <View key={member.id} style={{ width: `${100 / columns}%`, padding: isTV ? 10 : 6 }}>
                <ArrivalMemberCard
                  member={member}
                  response={responsesByUser.get(member.id)}
                  isTV={isTV}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

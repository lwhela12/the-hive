import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { CheckInHiveCard } from './CheckInHiveCard';
import { hiveAccent, hiveDisplayName, hiveSeal } from '../../lib/hiveBrand';
import type { MeetingPreview } from '../../lib/checkInPresentation';
import type { Community } from '../../types';

export function CheckInNextMeetings({ community, upcoming, onContinue, onBrowse, onDone }: {
  community?: Community | null;
  upcoming: { member: { community: Community }; event: MeetingPreview }[];
  onContinue: (event: MeetingPreview) => void;
  onBrowse: () => void;
  onDone: () => void;
}) {
  return <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 18, padding: 24 }}>
    <Image source={hiveSeal(community?.slug)} contentFit="contain" style={{ width: 72, height: 72, alignSelf: 'center' }} />
    <Text accessibilityRole="header" style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 23, color: '#2d2d2d', textAlign: 'center' }}>
      {hiveDisplayName(community?.name)} check-in saved ✓
    </Text>
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: '#5c5648', lineHeight: 22, textAlign: 'center' }}>
      {upcoming.length
        ? 'Your other HIVEs meet in the next seven days. Want to finish their check-ins now?'
        : 'No other check-ins to finish in the next seven days.'}
    </Text>
    {upcoming.map(({ member, event }) => <CheckInHiveCard key={event.id}
      community={member.community} event={event}
      status={`Check in for ${hiveDisplayName(member.community.name)}`}
      onPress={() => onContinue(event)} />)}
    {upcoming.length > 0 && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', lineHeight: 19 }}>
      Finish now and we won’t send another check-in reminder for those meetings.
    </Text>}
    <Pressable accessibilityRole="button" onPress={onDone}
      style={{ backgroundColor: hiveAccent(community), borderRadius: 14, padding: 15, alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>Done for now</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={onBrowse} style={{ padding: 10, alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#5c5648', textDecorationLine: 'underline' }}>Other upcoming meetings</Text>
    </Pressable>
  </View>;
}

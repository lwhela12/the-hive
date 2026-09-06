import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { hiveAccent, hiveDisplayName, hiveSeal } from '../../lib/hiveBrand';
import { meetingLabel, type MeetingPreview } from '../../lib/checkInPresentation';
import type { Community } from '../../types';
export function CheckInHiveCard({ community, event, status, onPress, disabled = false }: { community?: Community | null; event?: MeetingPreview; status: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ padding: 16, borderRadius: 14, borderWidth: 2, borderColor: hiveAccent(community), backgroundColor: '#fffdf5', flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.6 : 1 })}>
    <Image source={hiveSeal(community?.slug)} style={{ width: 56, height: 56 }} contentFit="contain" />
    <View style={{ flex: 1, gap: 5 }}><Text style={{ color: '#313130', fontFamily: 'Lato_700Bold', fontSize: 17 }}>{hiveDisplayName(community?.name)}</Text>
      <Text style={{ color: '#5c5648', fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20 }}>{meetingLabel(event)}</Text><Text style={{ color: '#5c5648', fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20 }}>{status}</Text></View>
  </Pressable>;
}

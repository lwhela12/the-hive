import { Pressable, Text, View } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

/** Shared end state: replace the questions only after the save succeeds. */
export function SurveyCompletion({ message, onDone, closeLabel = 'Done for now', accent,
  logo = require('../../assets/Clive_logo.png'), onReview,
}: {
  message: string;
  onDone: () => void;
  closeLabel?: string;
  accent: string;
  logo?: ImageProps['source'];
  onReview?: () => void;
}) {
  return <View style={{ alignItems: 'center', padding: 24, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
    <Image source={logo} style={{ width: 72, height: 72 }} contentFit="contain" />
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', textAlign: 'center' }}>All done!</Text>
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: '#5c5648', textAlign: 'center', lineHeight: 22 }}>{message}</Text>
    <Pressable accessibilityRole="button" onPress={onDone} style={{ backgroundColor: accent, borderRadius: 14, minHeight: 44, paddingHorizontal: 32, paddingVertical: 14 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>{closeLabel}</Text>
    </Pressable>
    {onReview && <Pressable accessibilityRole="button" onPress={onReview} style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#5c5648' }}>Review answers</Text>
    </Pressable>}
  </View>;
}

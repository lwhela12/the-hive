import { useEffect } from 'react';
import { Alert, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceInput } from '../../lib/hooks/useVoiceInput';
import { usePageSkin } from '../../lib/pageSkin';

interface Props {
  /** Called with the recognized transcript; append to your state as needed */
  onTranscript: (text: string) => void;
  /** Called while speech recognition is still guessing/correcting the current phrase */
  onInterimTranscript?: (text: string) => void;
  /** Called whenever listening state changes */
  onListeningChange?: (listening: boolean) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tap it, talk, tap it again — the words land in the box you were typing in.
 *
 * It reads the page skin ITSELF rather than taking colours as props, the same
 * call AppHeader and HeaderTabs make. It used to be a cream coin with gold on
 * it, which was right everywhere it lived at the time and wrong the moment one
 * of those screens went to space: a pale disc glowing on black looked like a
 * loading error. Per-screen opt-in is what caused the "colours don't stay with
 * me" bug; the fix is the same here.
 *
 * It renders nothing where speech recognition is unavailable — currently
 * anything that is not a browser. On a phone keyboard there is already a
 * dictation mic an inch below, so an inert button would be the worse answer.
 */
export function VoiceMicButton({ onTranscript, onInterimTranscript, onListeningChange, size = 22, style }: Props) {
  const skin = usePageSkin();
  const { isListening, toggle, isSupported } = useVoiceInput(onTranscript, (message) => {
    Alert.alert('Voice input', message);
  }, onInterimTranscript);

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  if (!isSupported) return null;

  return (
    <Pressable
      onPress={toggle}
      style={[
        {
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: skin.dark
            ? isListening
              ? 'rgba(224,190,118,0.24)'
              : 'rgba(255,255,255,0.08)'
            : isListening
              ? '#fff7df'
              : '#fdf3dc',
          borderWidth: isListening ? 2 : 0,
          borderColor: skin.gold,
          shadowColor: skin.gold,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isListening ? 0.45 : 0,
          shadowRadius: isListening ? 10 : 0,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={isListening ? 'Stop voice input' : 'Start voice input'}
    >
      <Ionicons
        name={isListening ? 'mic' : 'mic-outline'}
        size={size}
        color={skin.gold}
      />
      {isListening && (
        <View
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#ef4444',
          }}
        />
      )}
    </Pressable>
  );
}

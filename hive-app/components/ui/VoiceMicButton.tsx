import { Alert, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceInput } from '../../lib/hooks/useVoiceInput';

interface Props {
  /** Called with the recognized transcript; append to your state as needed */
  onTranscript: (text: string) => void;
  /** Called while speech recognition is still guessing/correcting the current phrase */
  onInterimTranscript?: (text: string) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function VoiceMicButton({ onTranscript, onInterimTranscript, size = 22, style }: Props) {
  const { isListening, toggle, isSupported } = useVoiceInput(onTranscript, (message) => {
    Alert.alert('Voice input', message);
  }, onInterimTranscript);

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
          backgroundColor: isListening ? '#fff7df' : '#fdf3dc',
          borderWidth: isListening ? 2 : 0,
          borderColor: '#bd9348',
          shadowColor: '#bd9348',
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
        color={isListening ? '#bd9348' : '#bd9348'}
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

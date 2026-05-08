import { Pressable, View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceInput } from '../../lib/hooks/useVoiceInput';

interface Props {
  /** Called with the recognized transcript; append to your state as needed */
  onTranscript: (text: string) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function VoiceMicButton({ onTranscript, size = 22, style }: Props) {
  const { isListening, toggle, isSupported } = useVoiceInput(onTranscript);

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
          backgroundColor: isListening ? '#fee2e2' : '#fdf3dc',
        },
        style,
      ]}
    >
      <Ionicons
        name={isListening ? 'mic' : 'mic-outline'}
        size={size}
        color={isListening ? '#ef4444' : '#bd9348'}
      />
    </Pressable>
  );
}

import { useState, memo } from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export const ChatInput = memo(function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim() || isLoading) return;
    onSend(inputText.trim());
    setInputText('');
  };

  const hasText = inputText.trim().length > 0;

  return (
    <View className="flex-row items-end p-4 border-t border-gold-light bg-white">
      <TextInput
        value={inputText}
        onChangeText={setInputText}
        placeholder="Type a message..."
        placeholderTextColor="#9CA3AF"
        multiline
        maxLength={2000}
        className="flex-1 bg-cream rounded-2xl px-4 py-3 mr-2 max-h-32 text-base text-charcoal"
        style={{ fontFamily: 'Lato_400Regular' }}
        editable={!isLoading}
      />
      <Pressable
        onPress={handleSend}
        disabled={!hasText || isLoading}
        className={`w-10 h-10 rounded-full items-center justify-center ${
          hasText && !isLoading
            ? 'bg-gold active:opacity-80'
            : 'bg-gray-200'
        }`}
      >
        <Text className="text-lg text-white">↑</Text>
      </Pressable>
    </View>
  );
});

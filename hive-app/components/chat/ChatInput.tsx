import { useState, memo } from 'react';
import { View, TextInput, Pressable, Text, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectedImage, pickMultipleImages } from '../../lib/imagePicker';

interface ChatInputProps {
  onSend: (message: string, images?: SelectedImage[]) => void;
  isLoading: boolean;
}

export const ChatInput = memo(function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);

  const handlePickImages = async () => {
    if (isLoading) return;
    const remainingSlots = 5 - selectedImages.length;
    if (remainingSlots <= 0) return;

    const images = await pickMultipleImages({ maxImages: remainingSlots });
    if (images.length > 0) {
      setSelectedImages((prev) => [...prev, ...images]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if ((!inputText.trim() && selectedImages.length === 0) || isLoading) return;
    onSend(inputText.trim(), selectedImages.length > 0 ? selectedImages : undefined);
    setInputText('');
    setSelectedImages([]);
  };

  const hasContent = inputText.trim().length > 0 || selectedImages.length > 0;

  return (
    <View className="px-4 py-3 bg-white">
      {/* Image previews */}
      {selectedImages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-2"
          contentContainerStyle={{ gap: 8 }}
        >
          {selectedImages.map((image, index) => (
            <View key={image.uri} className="relative">
              <Image
                source={{ uri: image.uri }}
                className="w-14 h-14 rounded-lg bg-gray-100"
                resizeMode="cover"
              />
              <Pressable
                onPress={() => handleRemoveImage(index)}
                className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
              >
                <Ionicons name="close" size={12} color="white" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <View className="flex-row items-end bg-cream rounded-2xl px-3 py-2">
        {/* Photo button */}
        <Pressable
          onPress={handlePickImages}
          disabled={selectedImages.length >= 5 || isLoading}
          className="p-1 mr-1"
        >
          <Ionicons
            name="image-outline"
            size={22}
            color={selectedImages.length >= 5 || isLoading ? '#ccc' : '#666'}
          />
          {selectedImages.length > 0 && (
            <View className="absolute -top-1 -right-1 bg-gold rounded-full w-4 h-4 items-center justify-center">
              <Text className="text-white text-xs font-bold">{selectedImages.length}</Text>
            </View>
          )}
        </Pressable>

        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message..."
          placeholderTextColor="#9CA3AF"
          selectionColor="#313130"
          multiline
          maxLength={2000}
          className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
          style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none', caretColor: '#313130' } as any}
          editable={!isLoading}
        />
        <Pressable
          onPress={handleSend}
          disabled={!hasContent || isLoading}
          className={`w-7 h-7 rounded-full items-center justify-center ml-2 ${
            hasContent && !isLoading
              ? 'bg-gold active:opacity-80'
              : 'bg-gray-300'
          }`}
        >
          <Text className="text-sm text-white" style={{ marginTop: -1 }}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
});

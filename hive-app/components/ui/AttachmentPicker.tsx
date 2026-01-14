import React from 'react';
import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectedImage, pickMultipleImages } from '../../lib/imagePicker';

const MAX_IMAGES = 5;

interface AttachmentPickerProps {
  selectedImages: SelectedImage[];
  onImagesChange: (images: SelectedImage[]) => void;
  maxImages?: number;
  disabled?: boolean;
  compact?: boolean;
}

export function AttachmentPicker({
  selectedImages,
  onImagesChange,
  maxImages = MAX_IMAGES,
  disabled = false,
  compact = false,
}: AttachmentPickerProps) {
  const remainingSlots = maxImages - selectedImages.length;
  const canAddMore = remainingSlots > 0 && !disabled;

  const handlePickImages = async () => {
    if (!canAddMore) return;

    const newImages = await pickMultipleImages({
      maxImages: remainingSlots,
    });

    if (newImages.length > 0) {
      onImagesChange([...selectedImages, ...newImages]);
    }
  };

  const handleRemoveImage = (index: number) => {
    const updated = [...selectedImages];
    updated.splice(index, 1);
    onImagesChange(updated);
  };

  if (compact) {
    // Compact mode: just a button, used in chat input
    return (
      <Pressable
        onPress={handlePickImages}
        disabled={!canAddMore}
        className={`p-2 rounded-full ${
          canAddMore ? 'bg-gray-100' : 'bg-gray-50'
        }`}
      >
        <Ionicons
          name="image-outline"
          size={22}
          color={canAddMore ? '#666' : '#ccc'}
        />
        {selectedImages.length > 0 && (
          <View className="absolute -top-1 -right-1 bg-gold rounded-full w-4 h-4 items-center justify-center">
            <Text className="text-white text-xs font-bold">
              {selectedImages.length}
            </Text>
          </View>
        )}
      </Pressable>
    );
  }

  // Full mode: button + image previews
  return (
    <View>
      {/* Add images button */}
      <Pressable
        onPress={handlePickImages}
        disabled={!canAddMore}
        className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${
          canAddMore ? 'bg-gray-100' : 'bg-gray-50'
        }`}
      >
        <Ionicons
          name="images-outline"
          size={20}
          color={canAddMore ? '#666' : '#ccc'}
        />
        <Text
          className={`text-sm ${canAddMore ? 'text-gray-600' : 'text-gray-400'}`}
        >
          {selectedImages.length === 0
            ? 'Add photos'
            : `${selectedImages.length}/${maxImages} photos`}
        </Text>
      </Pressable>

      {/* Image previews */}
      {selectedImages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {selectedImages.map((image, index) => (
            <View key={image.uri} className="relative">
              <Image
                source={{ uri: image.uri }}
                className="w-20 h-20 rounded-lg bg-gray-100"
                resizeMode="cover"
              />
              <Pressable
                onPress={() => handleRemoveImage(index)}
                className="absolute -top-2 -right-2 bg-charcoal rounded-full w-6 h-6 items-center justify-center"
              >
                <Ionicons name="close" size={14} color="white" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// Simple button variant for inline use (chat input)
interface AttachmentButtonProps {
  onPress: () => void;
  count?: number;
  disabled?: boolean;
  size?: number;
}

export function AttachmentButton({
  onPress,
  count = 0,
  disabled = false,
  size = 22,
}: AttachmentButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`p-2 rounded-full relative ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Ionicons
        name="image-outline"
        size={size}
        color={disabled ? '#ccc' : '#666'}
      />
      {count > 0 && (
        <View className="absolute -top-1 -right-1 bg-gold rounded-full min-w-[16px] h-4 items-center justify-center px-1">
          <Text className="text-white text-xs font-bold">{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

import React, { useState } from 'react';
import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectedImage, pickMultipleImages, takePhoto } from '../../lib/imagePicker';
import { SelectedFile, pickMultipleFiles } from '../../lib/filePicker';

const MAX_IMAGES = 5;
const MAX_FILES = 5;

interface AttachmentPickerProps {
  selectedImages: SelectedImage[];
  onImagesChange: (images: SelectedImage[]) => void;
  selectedFiles?: SelectedFile[];
  onFilesChange?: (files: SelectedFile[]) => void;
  maxImages?: number;
  maxFiles?: number;
  disabled?: boolean;
  compact?: boolean;
}

export function AttachmentPicker({
  selectedImages,
  onImagesChange,
  selectedFiles = [],
  onFilesChange,
  maxImages = MAX_IMAGES,
  maxFiles = MAX_FILES,
  disabled = false,
  compact = false,
}: AttachmentPickerProps) {
  const [showCompactMenu, setShowCompactMenu] = useState(false);
  const remainingSlots = maxImages - selectedImages.length;
  const canAddMore = remainingSlots > 0 && !disabled;
  const remainingFileSlots = maxFiles - selectedFiles.length;
  const canAddFiles = remainingFileSlots > 0 && !disabled && !!onFilesChange;

  const handlePickImages = async () => {
    if (!canAddMore) return;

    const newImages = await pickMultipleImages({
      maxImages: remainingSlots,
    });

    if (newImages.length > 0) {
      onImagesChange([...selectedImages, ...newImages]);
    }
  };

  const handlePickFiles = async () => {
    if (!canAddFiles || !onFilesChange) return;

    const newFiles = await pickMultipleFiles(remainingFileSlots);
    if (newFiles.length > 0) {
      onFilesChange([...selectedFiles, ...newFiles].slice(0, maxFiles));
    }
  };

  const handleTakePhoto = async () => {
    if (!canAddMore) return;

    const newImage = await takePhoto();
    if (newImage) {
      onImagesChange([...selectedImages, newImage].slice(0, maxImages));
    }
  };

  const handleRemoveImage = (index: number) => {
    const updated = [...selectedImages];
    updated.splice(index, 1);
    onImagesChange(updated);
  };

  const handleRemoveFile = (index: number) => {
    if (!onFilesChange) return;
    const updated = [...selectedFiles];
    updated.splice(index, 1);
    onFilesChange(updated);
  };

  const totalCount = selectedImages.length + selectedFiles.length;

  if (compact) {
    const compactDisabled = !canAddMore && !canAddFiles;

    return (
      <View className="relative flex-row items-center">
        {showCompactMenu && (
          <View
            className="absolute left-0 bottom-10 bg-white border border-gold/20 rounded-2xl shadow-lg overflow-hidden"
            style={{ minWidth: 178, zIndex: 50, elevation: 10 }}
          >
            <Pressable
              onPress={async () => {
                setShowCompactMenu(false);
                await handleTakePhoto();
              }}
              disabled={!canAddMore}
              className="flex-row items-center px-3 py-3 active:bg-cream"
            >
              <Ionicons name="camera-outline" size={18} color={canAddMore ? '#bd9348' : '#ccc'} />
              <Text className={`ml-2 text-sm ${canAddMore ? 'text-charcoal' : 'text-gray-400'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                Take photo
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                setShowCompactMenu(false);
                await handlePickImages();
              }}
              disabled={!canAddMore}
              className="flex-row items-center px-3 py-3 active:bg-cream border-t border-cream"
            >
              <Ionicons name="images-outline" size={18} color={canAddMore ? '#bd9348' : '#ccc'} />
              <Text className={`ml-2 text-sm ${canAddMore ? 'text-charcoal' : 'text-gray-400'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                Photo library
              </Text>
            </Pressable>
            {onFilesChange && (
              <Pressable
                onPress={async () => {
                  setShowCompactMenu(false);
                  await handlePickFiles();
                }}
                disabled={!canAddFiles}
                className="flex-row items-center px-3 py-3 active:bg-cream border-t border-cream"
              >
                <Ionicons name="document-attach-outline" size={18} color={canAddFiles ? '#bd9348' : '#ccc'} />
                <Text className={`ml-2 text-sm ${canAddFiles ? 'text-charcoal' : 'text-gray-400'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                  Doc
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <Pressable
          onPress={() => setShowCompactMenu((current) => !current)}
          disabled={compactDisabled}
          className="p-1 mr-1 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Add attachment"
        >
          <Ionicons name="attach-outline" size={22} color={!compactDisabled ? '#bd9348' : '#ccc'} />
          {totalCount > 0 && (
            <View className="absolute -top-1 -right-1 bg-gold rounded-full w-4 h-4 items-center justify-center">
              <Text className="text-white text-xs font-bold">{totalCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
    );
  }

  // Full mode: buttons + previews
  return (
    <View>
      <View className="flex-row gap-2">
        <Pressable
          onPress={handlePickImages}
          disabled={!canAddMore}
          className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${
            canAddMore ? 'bg-gray-100' : 'bg-gray-50'
          }`}
        >
          <Ionicons name="images-outline" size={20} color={canAddMore ? '#666' : '#ccc'} />
          <Text className={`text-sm ${canAddMore ? 'text-gray-600' : 'text-gray-400'}`}>
            {selectedImages.length === 0 ? 'Photos' : `${selectedImages.length}/${maxImages}`}
          </Text>
        </Pressable>
        {onFilesChange && (
          <Pressable
            onPress={handlePickFiles}
            disabled={!canAddFiles}
            className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${
              canAddFiles ? 'bg-gray-100' : 'bg-gray-50'
            }`}
          >
            <Ionicons name="attach-outline" size={20} color={canAddFiles ? '#666' : '#ccc'} />
            <Text className={`text-sm ${canAddFiles ? 'text-gray-600' : 'text-gray-400'}`}>
              {selectedFiles.length === 0 ? 'Files' : `${selectedFiles.length}/${maxFiles}`}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Image/file previews */}
      {totalCount > 0 && (
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
          {selectedFiles.map((file, index) => (
            <View key={`${file.uri}-${index}`} className="relative bg-white border border-gray-200 rounded-lg px-3 py-2 w-44">
              <View className="flex-row items-center">
                <Ionicons name="document-attach-outline" size={20} color="#bd9348" />
                <Text
                  className="text-charcoal text-xs ml-2 flex-1"
                  style={{ fontFamily: 'Lato_700Bold' }}
                  numberOfLines={2}
                >
                  {file.name}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemoveFile(index)}
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
        name="attach-outline"
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

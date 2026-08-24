import React, { useRef, useState } from 'react';
import { Alert, View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SelectedImage, pickMultipleImages, takePhoto } from '../../lib/imagePicker';
import { SelectedFile, pickMultipleFiles } from '../../lib/filePicker';
import { pickMultipleVideos, takeVideo } from '../../lib/videoPicker';
import { fileToSelectedFile, fileToSelectedImage, isTouchWebDevice, partitionWebAttachments } from '../../lib/webFileAttachments';
import { getShortVideoLimitLabel, partitionAllowedShortVideos } from '../../lib/mediaAttachments';
import { SelectedFilePreview } from './SelectedFilePreview';

const MAX_IMAGES = 5;
const MAX_FILES = 5;

interface AttachmentPickerProps {
  selectedImages: SelectedImage[];
  onImagesChange: (images: SelectedImage[]) => void;
  selectedFiles?: SelectedFile[];
  onFilesChange?: (files: SelectedFile[]) => void;
  maxImages?: number;
  maxFiles?: number;
  maxAttachments?: number;
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
  maxAttachments,
  disabled = false,
  compact = false,
}: AttachmentPickerProps) {
  const [showCompactMenu, setShowCompactMenu] = useState(false);
  const webAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const remainingTotalSlots = Math.max(0, (maxAttachments ?? Number.POSITIVE_INFINITY) - selectedImages.length - selectedFiles.length);
  const remainingSlots = Math.min(maxImages - selectedImages.length, remainingTotalSlots);
  const canAddMore = remainingSlots > 0 && !disabled;
  const remainingFileSlots = Math.min(maxFiles - selectedFiles.length, remainingTotalSlots);
  const canAddFiles = remainingFileSlots > 0 && !disabled && !!onFilesChange;
  const useNativeWebAttachmentPicker = compact && isTouchWebDevice();

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
    const { accepted, rejected } = partitionAllowedShortVideos(newFiles);
    if (rejected.length > 0) {
      Alert.alert('Video Too Large', `Please choose short clips: ${getShortVideoLimitLabel()}.`);
    }
    if (accepted.length > 0) {
      onFilesChange([...selectedFiles, ...accepted].slice(0, maxFiles));
    }
  };

  const handlePickVideos = async () => {
    if (!canAddFiles || !onFilesChange) return;

    const newVideos = await pickMultipleVideos({
      maxVideos: remainingFileSlots,
    });
    if (newVideos.length > 0) {
      onFilesChange([...selectedFiles, ...newVideos].slice(0, maxFiles));
    }
  };

  const handleTakeVideo = async () => {
    if (!canAddFiles || !onFilesChange) return;

    const newVideo = await takeVideo();
    if (newVideo) {
      onFilesChange([...selectedFiles, newVideo].slice(0, maxFiles));
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

  const handleWebAttachmentInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (files.length === 0 || disabled) return;

    const imageSlots = Math.max(0, Math.min(maxImages - selectedImages.length, remainingTotalSlots));
    const fileSlots = onFilesChange ? Math.max(0, maxFiles - selectedFiles.length) : 0;
    const { imageFiles, documentFiles } = partitionWebAttachments(
      files,
      imageSlots,
      fileSlots,
      remainingTotalSlots,
    );

    if (imageFiles.length > 0) {
      const images = await Promise.all(imageFiles.map(fileToSelectedImage));
      onImagesChange([...selectedImages, ...images].slice(0, maxImages));
    }

    if (documentFiles.length > 0 && onFilesChange) {
      const attachments = documentFiles.map(fileToSelectedFile);
      const { accepted, rejected } = partitionAllowedShortVideos(attachments);
      if (rejected.length > 0) {
        Alert.alert('Video Too Large', `Please choose short clips: ${getShortVideoLimitLabel()}.`);
      }
      if (accepted.length > 0) {
        onFilesChange([...selectedFiles, ...accepted].slice(0, maxFiles));
      }
    }
  };

  const handleCompactAttachmentPress = () => {
    if (useNativeWebAttachmentPicker) {
      setShowCompactMenu(false);
      webAttachmentInputRef.current?.click();
      return;
    }

    setShowCompactMenu((current) => !current);
  };

  const totalCount = selectedImages.length + selectedFiles.length;

  if (compact) {
    const compactDisabled = !canAddMore && !canAddFiles;

    return (
      <View className="relative flex-row items-center">
        {useNativeWebAttachmentPicker && React.createElement('input', {
          ref: webAttachmentInputRef,
          type: 'file',
          multiple: true,
          accept: onFilesChange ? '*/*' : 'image/*',
          tabIndex: -1,
          'aria-hidden': true,
          style: {
            position: 'absolute',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          },
          onChange: handleWebAttachmentInputChange,
        })}
        {showCompactMenu && !useNativeWebAttachmentPicker && (
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
              <Text className={`ml-2 text-sm ${canAddMore ? 'text-charcoal' : 'text-softink'}`} style={{ fontFamily: 'Lato_700Bold' }}>
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
              <Text className={`ml-2 text-sm ${canAddMore ? 'text-charcoal' : 'text-softink'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                Photo library
              </Text>
            </Pressable>
            {onFilesChange && (
              <>
                <Pressable
                  onPress={async () => {
                    setShowCompactMenu(false);
                    await handleTakeVideo();
                  }}
                  disabled={!canAddFiles}
                  className="flex-row items-center px-3 py-3 active:bg-cream border-t border-cream"
                >
                  <Ionicons name="videocam-outline" size={18} color={canAddFiles ? '#bd9348' : '#ccc'} />
                  <Text className={`ml-2 text-sm ${canAddFiles ? 'text-charcoal' : 'text-softink'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                    Record video
                  </Text>
                </Pressable>
                <Pressable
                  onPress={async () => {
                    setShowCompactMenu(false);
                    await handlePickVideos();
                  }}
                  disabled={!canAddFiles}
                  className="flex-row items-center px-3 py-3 active:bg-cream border-t border-cream"
                >
                  <Ionicons name="film-outline" size={18} color={canAddFiles ? '#bd9348' : '#ccc'} />
                  <Text className={`ml-2 text-sm ${canAddFiles ? 'text-charcoal' : 'text-softink'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                    Video clip
                  </Text>
                </Pressable>
              </>
            )}
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
                <Text className={`ml-2 text-sm ${canAddFiles ? 'text-charcoal' : 'text-softink'}`} style={{ fontFamily: 'Lato_700Bold' }}>
                  Doc
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <Pressable
          onPress={handleCompactAttachmentPress}
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
          <Text className={`text-sm ${canAddMore ? 'text-gray-600' : 'text-softink'}`}>
            {selectedImages.length === 0 ? 'Photos' : `${selectedImages.length}/${maxImages}`}
          </Text>
        </Pressable>
        {onFilesChange && (
          <Pressable
            onPress={handlePickVideos}
            disabled={!canAddFiles}
            className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${
              canAddFiles ? 'bg-gray-100' : 'bg-gray-50'
            }`}
          >
            <Ionicons name="film-outline" size={20} color={canAddFiles ? '#666' : '#ccc'} />
            <Text className={`text-sm ${canAddFiles ? 'text-gray-600' : 'text-softink'}`}>
              Video
            </Text>
          </Pressable>
        )}
        {onFilesChange && (
          <Pressable
            onPress={handlePickFiles}
            disabled={!canAddFiles}
            className={`flex-row items-center gap-2 px-3 py-2 rounded-lg ${
              canAddFiles ? 'bg-gray-100' : 'bg-gray-50'
            }`}
          >
            <Ionicons name="attach-outline" size={20} color={canAddFiles ? '#666' : '#ccc'} />
            <Text className={`text-sm ${canAddFiles ? 'text-gray-600' : 'text-softink'}`}>
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
            <SelectedFilePreview
              key={`${file.uri}-${index}`}
              file={file}
              onRemove={() => handleRemoveFile(index)}
              className="bg-white border border-gray-200"
              widthClassName="w-44"
            />
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

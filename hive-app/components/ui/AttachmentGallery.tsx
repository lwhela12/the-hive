import React, { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  Modal,
  Text,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Attachment } from '../../types';

interface AttachmentGalleryProps {
  attachments: Attachment[];
  maxWidth?: number;
}

export function AttachmentGallery({
  attachments,
  maxWidth,
}: AttachmentGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const galleryMaxWidth = maxWidth ?? screenWidth * 0.8;
  const safeAttachments = attachments ?? [];
  const imageAttachments = safeAttachments.filter((attachment) => attachment.mime_type?.startsWith('image/'));
  const fileAttachments = safeAttachments.filter((attachment) => !attachment.mime_type?.startsWith('image/'));
  const selectedImage = selectedIndex !== null ? imageAttachments[selectedIndex] : null;

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= imageAttachments.length) {
      setSelectedIndex(null);
    }
  }, [imageAttachments.length, selectedIndex]);

  if (safeAttachments.length === 0) {
    return null;
  }

  const getGridLayout = () => {
    const count = imageAttachments.length;
    const gap = 4;
    const imageWidth = galleryMaxWidth;

    switch (count) {
      case 1:
        return {
          columns: 1,
          itemWidth: imageWidth,
          itemHeight: imageWidth * 0.75,
        };
      case 2:
        return {
          columns: 2,
          itemWidth: (imageWidth - gap) / 2,
          itemHeight: (imageWidth - gap) / 2,
        };
      case 3:
        return {
          columns: 2,
          itemWidth: (imageWidth - gap) / 2,
          itemHeight: (imageWidth - gap) / 2,
          firstFull: true,
        };
      case 4:
        return {
          columns: 2,
          itemWidth: (imageWidth - gap) / 2,
          itemHeight: (imageWidth - gap) / 2,
        };
      default: // 5
        return {
          columns: 3,
          itemWidth: (imageWidth - gap * 2) / 3,
          itemHeight: (imageWidth - gap * 2) / 3,
          firstRowCols: 2,
        };
    }
  };

  const layout = getGridLayout();

  const renderImage = (
    attachment: Attachment,
    index: number,
    width: number,
    height: number
  ) => {
    return (
      <Pressable
        key={attachment.id}
        onPress={() => setSelectedIndex(index)}
        style={{ width, height }}
        className="overflow-hidden rounded-lg bg-gray-200"
      >
        <Image
          source={{ uri: attachment.url }}
          style={{ width, height, borderRadius: 8 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </Pressable>
    );
  };

  const renderGrid = () => {
    const count = imageAttachments.length;
    const gap = 4;

    if (count === 1) {
      return renderImage(
        imageAttachments[0],
        0,
        layout.itemWidth,
        layout.itemHeight
      );
    }

    if (count === 3) {
      // First image full width, then 2 below
      return (
        <View style={{ width: galleryMaxWidth, gap }}>
          {renderImage(imageAttachments[0], 0, galleryMaxWidth, galleryMaxWidth * 0.5)}
          <View style={{ flexDirection: 'row', gap }}>
            {renderImage(imageAttachments[1], 1, layout.itemWidth, layout.itemHeight)}
            {renderImage(imageAttachments[2], 2, layout.itemWidth, layout.itemHeight)}
          </View>
        </View>
      );
    }

    if (count === 5) {
      // 2 on top, 3 on bottom
      const topWidth = (galleryMaxWidth - gap) / 2;
      const bottomWidth = (galleryMaxWidth - gap * 2) / 3;
      return (
        <View style={{ width: galleryMaxWidth, gap }}>
          <View style={{ flexDirection: 'row', gap }}>
            {renderImage(imageAttachments[0], 0, topWidth, topWidth * 0.75)}
            {renderImage(imageAttachments[1], 1, topWidth, topWidth * 0.75)}
          </View>
          <View style={{ flexDirection: 'row', gap }}>
            {renderImage(imageAttachments[2], 2, bottomWidth, bottomWidth)}
            {renderImage(imageAttachments[3], 3, bottomWidth, bottomWidth)}
            {renderImage(imageAttachments[4], 4, bottomWidth, bottomWidth)}
          </View>
        </View>
      );
    }

    // 2 or 4 images - simple grid
    return (
      <View
        style={{
          width: galleryMaxWidth,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap,
        }}
      >
        {imageAttachments.map((attachment, index) =>
          renderImage(attachment, index, layout.itemWidth, layout.itemHeight)
        )}
      </View>
    );
  };

  const renderFiles = () => {
    if (fileAttachments.length === 0) return null;

    return (
      <View className="mt-2" style={{ gap: 6, maxWidth: galleryMaxWidth }}>
        {fileAttachments.map((attachment) => (
          <Pressable
            key={attachment.id}
            onPress={() => Linking.openURL(attachment.url)}
            className="flex-row items-center bg-cream border border-gold/20 rounded-lg px-3 py-2 active:opacity-70"
          >
            <Ionicons name="document-attach-outline" size={18} color="#bd9348" />
            <View className="ml-2 flex-1">
              <Text
                style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#313130' }}
                numberOfLines={1}
              >
                {attachment.filename}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(49,49,48,0.5)' }}>
                {attachment.mime_type || 'File'}
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color="rgba(49,49,48,0.42)" />
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <>
      {imageAttachments.length > 0 && <View className="mt-2">{renderGrid()}</View>}
      {renderFiles()}

      {/* Full-screen modal */}
      <Modal
        visible={!!selectedImage}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedIndex(null)}
      >
        <View className="flex-1 bg-black">
          {/* Close button */}
          <Pressable
            onPress={() => setSelectedIndex(null)}
            className="absolute top-12 right-4 z-10 p-2 bg-black/50 rounded-full"
          >
            <Ionicons name="close" size={28} color="white" />
          </Pressable>

          {/* Image */}
          {selectedImage && (
            <View className="flex-1 items-center justify-center">
              <Image
                source={{ uri: selectedImage.url }}
                style={{ width: screenWidth, height: screenHeight * 0.8 }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
          )}

          {/* Navigation dots */}
          {imageAttachments.length > 1 && (
            <View className="absolute bottom-12 left-0 right-0 flex-row justify-center gap-2">
              {imageAttachments.map((_, index) => (
                <Pressable
                  key={index}
                  onPress={() => setSelectedIndex(index)}
                  className={`w-2 h-2 rounded-full ${
                    index === selectedIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

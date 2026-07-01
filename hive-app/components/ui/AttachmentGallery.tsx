import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
  Pressable,
  Modal,
  Text,
  Linking,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { ResizeMode, Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Attachment } from '../../types';
import { formatFileSize, isVideoAttachment } from '../../lib/mediaAttachments';

interface AttachmentGalleryProps {
  attachments: Attachment[];
  maxWidth?: number;
}

export function AttachmentGallery({
  attachments,
  maxWidth,
}: AttachmentGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const imageScrollRef = useRef<ScrollView>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const galleryMaxWidth = maxWidth ?? screenWidth * 0.8;
  const safeAttachments = attachments ?? [];
  const imageAttachments = safeAttachments.filter((attachment) => attachment.mime_type?.startsWith('image/'));
  const videoAttachments = safeAttachments.filter(isVideoAttachment);
  const fileAttachments = safeAttachments.filter((attachment) =>
    !attachment.mime_type?.startsWith('image/') && !isVideoAttachment(attachment)
  );
  const selectedImage = selectedIndex !== null ? imageAttachments[selectedIndex] : null;

  const scrollToImage = useCallback((index: number, animated = true) => {
    imageScrollRef.current?.scrollTo({
      x: screenWidth * index,
      y: 0,
      animated,
    });
  }, [screenWidth]);

  const selectImage = useCallback((index: number, animated = true) => {
    if (imageAttachments.length === 0) return;

    const nextIndex = Math.min(Math.max(index, 0), imageAttachments.length - 1);
    setSelectedIndex(nextIndex);
    scrollToImage(nextIndex, animated);
  }, [imageAttachments.length, scrollToImage]);

  const handleModalScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (imageAttachments.length <= 1 || screenWidth <= 0) return;

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    setSelectedIndex(Math.min(Math.max(nextIndex, 0), imageAttachments.length - 1));
  }, [imageAttachments.length, screenWidth]);

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
        onPress={() => selectImage(index, false)}
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

  const renderVideos = () => {
    if (videoAttachments.length === 0) return null;

    const videoHeight = Math.max(150, Math.min(320, galleryMaxWidth * 0.5625));

    return (
      <View className="mt-2" style={{ gap: 8, maxWidth: galleryMaxWidth }}>
        {videoAttachments.map((attachment) => {
          const sizeLabel = formatFileSize(attachment.size);

          return (
            <View
              key={attachment.id}
              className="overflow-hidden rounded-lg bg-black border border-gold/20"
              style={{ width: galleryMaxWidth }}
            >
              <Video
                source={{ uri: attachment.url }}
                style={{ width: galleryMaxWidth, height: videoHeight }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay={false}
              />
              <Pressable
                onPress={() => Linking.openURL(attachment.url)}
                className="flex-row items-center bg-cream px-3 py-2 active:opacity-70"
              >
                <Ionicons name="videocam-outline" size={18} color="#bd9348" />
                <View className="ml-2 flex-1">
                  <Text
                    style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#313130' }}
                    numberOfLines={1}
                  >
                    {attachment.filename || 'Video clip'}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(49,49,48,0.5)' }}>
                    {sizeLabel ? `Video clip - ${sizeLabel}` : 'Video clip'}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color="rgba(49,49,48,0.42)" />
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <>
      {imageAttachments.length > 0 && <View className="mt-2">{renderGrid()}</View>}
      {renderVideos()}
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
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
          >
            <Ionicons name="close" size={28} color="white" />
          </Pressable>

          {/* Swipeable image viewer */}
          {selectedIndex !== null && (
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              bounces={false}
              decelerationRate="fast"
              snapToAlignment="center"
              snapToInterval={screenWidth}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={imageAttachments.length > 1}
              contentOffset={{ x: screenWidth * selectedIndex, y: 0 }}
              onMomentumScrollEnd={handleModalScrollEnd}
              onScrollEndDrag={handleModalScrollEnd}
              scrollEventThrottle={16}
              style={{ flex: 1 }}
            >
              {imageAttachments.map((attachment) => (
                <View
                  key={attachment.id}
                  style={{
                    width: screenWidth,
                    height: screenHeight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Image
                    source={{ uri: attachment.url }}
                    style={{ width: screenWidth, height: screenHeight * 0.8 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                </View>
              ))}
            </ScrollView>
          )}

          {imageAttachments.length > 1 && selectedIndex !== null && (
            <>
              {selectedIndex > 0 && (
                <Pressable
                  onPress={() => selectImage(selectedIndex - 1)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Previous image"
                  style={{
                    position: 'absolute',
                    top: screenHeight / 2 - 24,
                    left: 12,
                    zIndex: 10,
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="chevron-back" size={30} color="white" />
                </Pressable>
              )}

              {selectedIndex < imageAttachments.length - 1 && (
                <Pressable
                  onPress={() => selectImage(selectedIndex + 1)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Next image"
                  style={{
                    position: 'absolute',
                    top: screenHeight / 2 - 24,
                    right: 12,
                    zIndex: 10,
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="chevron-forward" size={30} color="white" />
                </Pressable>
              )}
            </>
          )}

          {/* Navigation dots */}
          {imageAttachments.length > 1 && (
            <View className="absolute bottom-12 left-0 right-0 flex-row justify-center gap-2">
              {imageAttachments.map((_, index) => (
                <Pressable
                  key={index}
                  onPress={() => selectImage(index)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Show image ${index + 1}`}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: index === selectedIndex ? 'white' : 'rgba(255,255,255,0.5)',
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

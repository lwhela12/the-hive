import React, { useState } from 'react';
import {
  View,
  Image,
  Pressable,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Attachment } from '../../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AttachmentGalleryProps {
  attachments: Attachment[];
  maxWidth?: number;
}

export function AttachmentGallery({
  attachments,
  maxWidth = SCREEN_WIDTH * 0.8,
}: AttachmentGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const getGridLayout = () => {
    const count = attachments.length;
    const gap = 4;
    const imageWidth = maxWidth;

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
          style={{ width, height }}
          className="rounded-lg"
          resizeMode="cover"
        />
      </Pressable>
    );
  };

  const renderGrid = () => {
    const count = attachments.length;
    const gap = 4;

    if (count === 1) {
      return renderImage(
        attachments[0],
        0,
        layout.itemWidth,
        layout.itemHeight
      );
    }

    if (count === 3) {
      // First image full width, then 2 below
      return (
        <View style={{ width: maxWidth, gap }}>
          {renderImage(attachments[0], 0, maxWidth, maxWidth * 0.5)}
          <View style={{ flexDirection: 'row', gap }}>
            {renderImage(attachments[1], 1, layout.itemWidth, layout.itemHeight)}
            {renderImage(attachments[2], 2, layout.itemWidth, layout.itemHeight)}
          </View>
        </View>
      );
    }

    if (count === 5) {
      // 2 on top, 3 on bottom
      const topWidth = (maxWidth - gap) / 2;
      const bottomWidth = (maxWidth - gap * 2) / 3;
      return (
        <View style={{ width: maxWidth, gap }}>
          <View style={{ flexDirection: 'row', gap }}>
            {renderImage(attachments[0], 0, topWidth, topWidth * 0.75)}
            {renderImage(attachments[1], 1, topWidth, topWidth * 0.75)}
          </View>
          <View style={{ flexDirection: 'row', gap }}>
            {renderImage(attachments[2], 2, bottomWidth, bottomWidth)}
            {renderImage(attachments[3], 3, bottomWidth, bottomWidth)}
            {renderImage(attachments[4], 4, bottomWidth, bottomWidth)}
          </View>
        </View>
      );
    }

    // 2 or 4 images - simple grid
    return (
      <View
        style={{
          width: maxWidth,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap,
        }}
      >
        {attachments.map((attachment, index) =>
          renderImage(attachment, index, layout.itemWidth, layout.itemHeight)
        )}
      </View>
    );
  };

  return (
    <>
      <View className="mt-2">{renderGrid()}</View>

      {/* Full-screen modal */}
      <Modal
        visible={selectedIndex !== null}
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
          {selectedIndex !== null && (
            <View className="flex-1 items-center justify-center">
              <Image
                source={{ uri: attachments[selectedIndex].url }}
                style={{
                  width: SCREEN_WIDTH,
                  height: SCREEN_HEIGHT * 0.8,
                }}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Navigation dots */}
          {attachments.length > 1 && (
            <View className="absolute bottom-12 left-0 right-0 flex-row justify-center gap-2">
              {attachments.map((_, index) => (
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

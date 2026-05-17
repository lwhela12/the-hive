import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SelectedFile } from '../../lib/filePicker';
import { getSelectedFileSubtitle, isSelectedVideoFile } from '../../lib/mediaAttachments';

interface SelectedFilePreviewProps {
  file: SelectedFile;
  onRemove: () => void;
  className?: string;
  widthClassName?: string;
}

export function SelectedFilePreview({
  file,
  onRemove,
  className = 'bg-cream border border-gold/20',
  widthClassName = 'w-48',
}: SelectedFilePreviewProps) {
  const isVideo = isSelectedVideoFile(file);
  const iconName = isVideo ? 'videocam-outline' : 'document-attach-outline';

  return (
    <View className={`relative rounded-lg px-3 py-2 ${widthClassName} ${className}`}>
      <View className="flex-row items-center">
        <Ionicons name={iconName} size={20} color="#bd9348" />
        <View className="ml-2 flex-1">
          <Text
            className="text-charcoal text-xs"
            style={{ fontFamily: 'Lato_700Bold' }}
            numberOfLines={1}
          >
            {file.name}
          </Text>
          <Text
            className="text-charcoal/45 text-[10px]"
            style={{ fontFamily: 'Lato_400Regular' }}
            numberOfLines={1}
          >
            {getSelectedFileSubtitle(file)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onRemove}
        className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
      >
        <Ionicons name="close" size={12} color="white" />
      </Pressable>
    </View>
  );
}

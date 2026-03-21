import { memo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { BoardCategory } from '../../types';

const EMOJI_MAP: Record<string, string> = {
  '1F4E2': '📢',
  '1F4AC': '💬',
  '1F451': '👑',
  '1F4DA': '📚',
  '1F44B': '👋',
  '1F4A1': '💡',
  '2753': '❓',
  '1F389': '🎉',
  '1F4DD': '📝',
  '1F3AF': '🎯',
  '1F4E6': '📦',
  '1F91D': '🤝',
  '1F4B0': '💰',
  '1F3E0': '🏠',
  '1F3A8': '🎨',
  '1F3B5': '🎵',
  '1F374': '🍴',
  '1F4AA': '💪',
  '2764': '❤️',
  '1F331': '🌱',
  '1F680': '🚀',
  '1F9E0': '🧠',
  '1F4C5': '📅',
};

interface CategoryStats {
  count: number;
  latestActivity: string | null;
}

interface BoardCategoryListProps {
  categories: BoardCategory[];
  onSelect: (category: BoardCategory) => void;
  postCounts?: Record<string, CategoryStats>;
}

export const BoardCategoryList = memo(function BoardCategoryList({
  categories,
  onSelect,
  postCounts,
}: BoardCategoryListProps) {
  return (
    <FlatList
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => {
        const emoji = item.icon ? EMOJI_MAP[item.icon] || item.icon : '📁';
        const isLast = index === categories.length - 1;
        const count = postCounts?.[item.id]?.count ?? 0;
        const countLabel = `${count} ${count === 1 ? 'post' : 'posts'}`;
        const subtitle = item.description ? `${item.description} · ${countLabel}` : countLabel;

        return (
          <Pressable
            onPress={() => onSelect(item)}
            className="bg-white active:opacity-70"
          >
            <View className={`flex-row items-center px-4 py-4 ${!isLast ? 'border-b border-cream' : ''}`}>
              <Text className="text-3xl mr-4">{emoji}</Text>
              <View className="flex-1">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-base"
                >
                  {item.name}
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/50 text-sm mt-0.5"
                  numberOfLines={1}
                >
                  {subtitle}
                </Text>
              </View>
              <Text className="text-charcoal/30 text-xl ml-2">›</Text>
            </View>
          </Pressable>
        );
      }}
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
});

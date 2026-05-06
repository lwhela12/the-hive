import { memo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  canManageCategories?: boolean;
  onEdit?: (category: BoardCategory) => void;
  onDelete?: (category: BoardCategory) => void;
}

export const BoardCategoryList = memo(function BoardCategoryList({
  categories,
  onSelect,
  postCounts,
  canManageCategories,
  onEdit,
  onDelete,
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
              {canManageCategories && !item.is_system ? (
                <View className="flex-row items-center ml-2">
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onEdit?.(item);
                    }}
                    className="w-9 h-9 items-center justify-center rounded-full active:bg-cream"
                    hitSlop={8}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#4A4A4A" />
                  </Pressable>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onDelete?.(item);
                    }}
                    className="w-9 h-9 items-center justify-center rounded-full active:bg-cream"
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>
              ) : (
                <Text className="text-charcoal/30 text-xl ml-2">›</Text>
              )}
            </View>
          </Pressable>
        );
      }}
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
});

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
  emptyLabel?: string;
}

export const BoardCategoryList = memo(function BoardCategoryList({
  categories,
  onSelect,
  postCounts,
  emptyLabel = 'No boards here yet.',
}: BoardCategoryListProps) {
  return (
    <FlatList
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => {
        const emoji = item.icon ? EMOJI_MAP[item.icon] || item.icon : '📁';
        const isLast = index === categories.length - 1;
        const count = postCounts?.[item.id]?.count ?? 0;
        const countLabel = `${count} ${count === 1 ? 'thread' : 'threads'}`;
        const taggedNames = (item.member_tags ?? [])
          .map((tag) => tag.member?.name?.split(' ')[0])
          .filter(Boolean);
        const ownerLabel = item.owner_user_id
          ? taggedNames[0] ? `for ${taggedNames[0]}` : 'for a member'
          : taggedNames.length > 0 ? `for ${taggedNames.join(', ')}` : '';
        const boardKindLabel = item.topic_kind === 'hd_board'
          ? item.goal_title
            ? `HD ask ${ownerLabel}`.trim()
            : `Member HD board ${ownerLabel}`.trim()
          : item.topic_kind === 'helper_log'
            ? '15min HIVE helper log'
            : item.audience === 'members' && taggedNames.length > 0
              ? `For ${taggedNames.join(', ')}`
              : 'Everyone';
        const goalLabel = item.topic_kind === 'hd_board' ? item.goal_title : null;
        const statusLabel = item.status === 'completed'
          ? 'Completed'
          : item.status === 'archived'
            ? 'Archived'
            : null;
        const subtitleParts = [statusLabel, boardKindLabel, goalLabel, item.description, countLabel].filter(Boolean);
        const subtitle = subtitleParts.join(' · ');
        const isCompleted = item.status === 'completed' || item.status === 'archived';

        return (
          <Pressable
            onPress={() => onSelect(item)}
            className={`bg-white active:opacity-70 ${isCompleted ? 'opacity-70' : ''}`}
          >
            <View className={`flex-row items-center px-4 py-4 ${!isLast ? 'border-b border-cream' : ''}`}>
              <Text className="text-3xl mr-4">{emoji}</Text>
              <View className="flex-1">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={`text-base ${isCompleted ? 'text-charcoal/60' : 'text-charcoal'}`}
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
      ListEmptyComponent={
        <View className="items-center justify-center px-8 py-16">
          <Ionicons name="search-outline" size={28} color="rgba(49,49,48,0.28)" />
          <Text
            style={{ fontFamily: 'Lato_400Regular' }}
            className="text-charcoal/50 text-sm text-center mt-3"
          >
            {emptyLabel}
          </Text>
        </View>
      }
      contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
    />
  );
});

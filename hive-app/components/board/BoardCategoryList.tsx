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
        const taggedNames = (item.member_tags ?? [])
          .map((tag) => tag.member?.name?.split(' ')[0])
          .filter(Boolean);
        const ownerLabel = item.owner_user_id
          ? taggedNames[0] ? `for ${taggedNames[0]}` : 'for a member'
          : taggedNames.length > 0 ? `for ${taggedNames.join(', ')}` : '';
        const boardKindLabel = item.topic_kind === 'hd_board'
          ? `HD board ${ownerLabel}`.trim()
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
      contentContainerStyle={{ paddingVertical: 8 }}
    />
  );
});

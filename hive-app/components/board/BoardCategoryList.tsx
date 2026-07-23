import { memo } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
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
  recentTitles?: string[];
}

export interface BoardCategorySearchMatchSummary {
  threadTitles: string[];
  replyMatchCount: number;
  archivedOnly: boolean;
}

interface BoardCategoryListProps {
  categories: BoardCategory[];
  onSelect: (category: BoardCategory) => void;
  postCounts?: Record<string, CategoryStats>;
  emptyLabel?: string;
  searchMatches?: Record<string, BoardCategorySearchMatchSummary>;
}

export const BoardCategoryList = memo(function BoardCategoryList({
  categories,
  onSelect,
  postCounts,
  emptyLabel = 'No boards here yet.',
  searchMatches,
}: BoardCategoryListProps) {
  // Boards render as actual boards — a grid of pinned bulletin cards
  // (mirrors the Boards nav icon). Column count follows the window, and the
  // cards stretch so the grid fills the screen instead of leaving dead space.
  const { width, height } = useWindowDimensions();
  const numColumns = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  const gridRows = Math.max(1, Math.ceil(categories.length / numColumns));
  // Roughly the space below header/search/toolbar and above the tab bar.
  const availableHeight = height - 300;
  const cardMinHeight = Math.min(420, Math.max(190, Math.floor(availableHeight / gridRows) - 12));

  return (
    <FlatList
      key={numColumns}
      numColumns={numColumns}
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const emoji = item.icon ? EMOJI_MAP[item.icon] || item.icon : '📁';
        const count = postCounts?.[item.id]?.count ?? 0;
        const recentTitles = postCounts?.[item.id]?.recentTitles ?? [];
        const countLabel = `${count} ${count === 1 ? 'thread' : 'threads'}`;
        const taggedNames = (item.member_tags ?? [])
          .map((tag) => tag.member?.name?.split(' ')[0])
          .filter(Boolean);
        const ownerLabel = item.owner_user_id
          ? taggedNames[0] ? `for ${taggedNames[0]}` : 'for a member'
          : taggedNames.length > 0 ? `for ${taggedNames.join(', ')}` : '';
        const boardKindLabel = item.topic_kind === 'hd_board'
          ? item.goal_title
            ? `Wish thread ${ownerLabel}`.trim()
            : `Member wishes ${ownerLabel}`.trim()
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
        const subtitleParts = [statusLabel, boardKindLabel, goalLabel, item.description].filter(Boolean);
        const subtitle = subtitleParts.join(' · ');
        const isCompleted = item.status === 'completed' || item.status === 'archived';
        const searchMatch = searchMatches?.[item.id];
        const titleMatches = searchMatch?.threadTitles ?? [];
        const titleMatchLabel = titleMatches.length > 0
          ? `Matches ${titleMatches.slice(0, 2).join(', ')}${titleMatches.length > 2 ? ` +${titleMatches.length - 2} more` : ''}`
          : null;
        const replyMatchLabel = searchMatch && searchMatch.replyMatchCount > 0
          ? `${searchMatch.replyMatchCount} matching ${searchMatch.replyMatchCount === 1 ? 'reply' : 'replies'}`
          : null;
        const matchLabel = [titleMatchLabel, replyMatchLabel, searchMatch?.archivedOnly ? 'archived threads' : null]
          .filter(Boolean)
          .join(' · ');

        return (
          <Pressable
            onPress={() => onSelect(item)}
            className={`active:opacity-80 ${isCompleted ? 'opacity-70' : ''}`}
            style={{ width: `${100 / numColumns}%`, padding: 6 }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: '#fffdf5',
                borderWidth: 1,
                borderColor: 'rgba(222,193,129,0.7)',
                borderRadius: 18,
                padding: 16,
                minHeight: cardMinHeight,
                shadowColor: '#bd9348',
                shadowOpacity: 0.14,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
              }}
            >
              <View className="flex-row items-start justify-between">
                <Text style={{ fontSize: 32, lineHeight: 36 }}>{emoji}</Text>
                <Text style={{ fontSize: 14, transform: [{ rotate: '18deg' }], opacity: 0.85 }}>📌</Text>
              </View>
              <Text
                style={{ fontFamily: 'Lato_700Bold', fontSize: 16, lineHeight: 21, marginTop: 8 }}
                className={isCompleted ? 'text-charcoal/60' : 'text-charcoal'}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              {subtitle ? (
                <Text
                  style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 16, color: '#8e7a5e', marginTop: 3 }}
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              ) : null}
              {/* Micro thread previews — the reason the boards are board-sized */}
              {recentTitles.length > 0 ? (
                <View
                  style={{
                    marginTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(222,193,129,0.32)',
                    paddingTop: 8,
                    gap: 5,
                    flexGrow: 1,
                  }}
                >
                  {recentTitles.map((title) => (
                    <View key={title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                      <Text style={{ fontSize: 10, lineHeight: 17, color: '#bd9348' }}>▪</Text>
                      <Text
                        style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 17, color: 'rgba(49,49,48,0.75)', flex: 1 }}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ flexGrow: 1 }} />
              )}
              <Text
                style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', marginTop: 10 }}
              >
                {countLabel}
              </Text>
              {matchLabel ? (
                <Text
                  style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8e6f35', marginTop: 3 }}
                  numberOfLines={2}
                >
                  {matchLabel}
                </Text>
              ) : null}
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
      contentContainerStyle={{ padding: 8, flexGrow: 1 }}
    />
  );
});

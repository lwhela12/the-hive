import { memo, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HiveIcon, type HiveIconName } from '../ui/HiveIcon';
import { HIVE_ICON_PREFIX } from './BoardTopicComposer';
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
  recentThreads?: { id: string; title: string }[];
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
  const { width } = useWindowDimensions();
  const numColumns = width >= 1100 ? 4 : width >= 760 ? 3 : 2;
  const compact = width < 760;
  // Fill the screen the way Home and Admin do: measure the space we actually
  // got, divide it by the number of rows, and let the CARD CONTENTS grow with
  // the card. Guessing at the height with `window.height - 300` was what left
  // acres of dead space below the grid; a short fixed tile just moved the dead
  // space instead of removing it (Nat 2026-07-24).
  const [gridHeight, setGridHeight] = useState(0);
  const gridRows = Math.max(1, Math.ceil(categories.length / numColumns));
  const fittedHeight = gridHeight > 0
    ? Math.floor(gridHeight / gridRows) - 12
    : 0;
  const cardMinHeight = compact
    ? 118
    : Math.max(150, Math.min(320, fittedHeight || 190));
  // Roomier card, roomier contents — otherwise a tall card is just a small
  // card with padding.
  const scale = Math.max(0, Math.min(1, (cardMinHeight - 150) / 140));
  const iconSize = Math.round(32 + scale * 14);
  const titleSize = Math.round(16 + scale * 5);
  const descLines = cardMinHeight > 250 ? 5 : cardMinHeight > 200 ? 4 : 2;

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => {
        const measured = Math.round(event.nativeEvent.layout.height);
        if (measured > 0 && measured !== gridHeight) setGridHeight(measured);
      }}
    >
    <FlatList
      key={numColumns}
      numColumns={numColumns}
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        // "hive:<name>" draws the family mark; anything else is a legacy emoji
        // (or a legacy unicode code point) and still renders as it always did.
        const hiveIconName = item.icon?.startsWith(HIVE_ICON_PREFIX)
          ? (item.icon.slice(HIVE_ICON_PREFIX.length) as HiveIconName)
          : null;
        const emoji = item.icon ? EMOJI_MAP[item.icon] || item.icon : '📁';
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
            ? `Wish thread ${ownerLabel}`.trim()
            : `Member wishes ${ownerLabel}`.trim()
          // Boards belong to the whole HIVE now, so "Everyone ·" was a prefix
          // on every single card saying nothing (Nat 2026-07-24).
          : null;
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
              {hiveIconName ? (
                <View style={{ height: iconSize + 4, justifyContent: 'center' }}>
                  <HiveIcon name={hiveIconName} size={iconSize} color="#bd9348" />
                </View>
              ) : (
                <Text style={{ fontSize: iconSize, lineHeight: iconSize + 4 }}>{emoji}</Text>
              )}
              <Text
                style={{ fontFamily: 'Lato_700Bold', fontSize: titleSize, lineHeight: titleSize + 5, marginTop: 8 }}
                className={isCompleted ? 'text-charcoal/60' : 'text-charcoal'}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              {subtitle && !compact ? (
                <Text
                  style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: '#8e7a5e', marginTop: 4 }}
                  numberOfLines={descLines}
                >
                  {subtitle}
                </Text>
              ) : null}
              <Text
                style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 11, color: '#a09274', marginTop: 3 }}
              >
                {countLabel}
              </Text>
              <View style={{ flexGrow: 1 }} />
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
    </View>
  );
});

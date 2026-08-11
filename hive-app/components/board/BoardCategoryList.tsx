import { memo, useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HiveIcon, type HiveIconName } from '../ui/HiveIcon';
import { HIVE_ICON_PREFIX } from './BoardTopicComposer';
import { ScopeBadge } from '../ui/ScopeBadge';
import { useEndBounce } from '../ui/BounceScrollView';
import { usePageSkin } from '../../lib/pageSkin';
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
  /** Tapping a thread preview jumps straight into that thread. */
  onSelectThread?: (category: BoardCategory, postId: string) => void;
  postCounts?: Record<string, CategoryStats>;
  emptyLabel?: string;
  searchMatches?: Record<string, BoardCategorySearchMatchSummary>;
}

export const BoardCategoryList = memo(function BoardCategoryList({
  categories,
  onSelect,
  onSelectThread,
  postCounts,
  emptyLabel = 'No boards here yet.',
  searchMatches,
}: BoardCategoryListProps) {
  // The same grid stands on a cream HIVE page and on the near-black HIVE-Wide
  // page, so every colour below comes from one place. Ink and card have to be
  // chosen together — a card that reads its background here and its text from a
  // constant is how you end up with grey words on black.
  const skin = usePageSkin();
  // The grid bounces at both ends, so a screen of boards that all fit reads as
  // "that's all of them" instead of "this is stuck" — the standing app-wide
  // rule (see BounceScrollView.tsx, Nat 2026-08-06).
  const gridBounceRef = useEndBounce();
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
  const descLines = 2;

  // Whatever room is left after the header goes to thread links — however many
  // happen to fit, no scrolling, no fade (Nat 2026-07-25: "you don't have to
  // make all 26 fit"). Wide screens only; on a phone this would be clutter.
  const THREAD_ROW_HEIGHT = 21;
  const headerHeight =
    32                    // card padding, top + bottom
    + 27                  // the scope badge row (sm chip ≈ 21) plus its margin
    + iconSize + 4        // the emoji
    + 8 + (titleSize + 5) * 2   // title, up to two lines
    + 4 + 18 * descLines  // description
    + 3 + 16              // the "N threads" line
    + 10;                 // the divider above the list
  const threadCapacity = compact
    ? 0
    : Math.max(0, Math.floor((cardMinHeight - headerHeight) / THREAD_ROW_HEIGHT));

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(event) => {
        const measured = Math.round(event.nativeEvent.layout.height);
        if (measured > 0 && measured !== gridHeight) setGridHeight(measured);
      }}
    >
    <FlatList
      ref={gridBounceRef}
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
        const recentThreads = (postCounts?.[item.id]?.recentThreads ?? []).slice(0, threadCapacity);
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
                backgroundColor: skin.card,
                borderWidth: 1,
                borderColor: skin.borderStrong,
                borderRadius: 18,
                padding: 16,
                minHeight: cardMinHeight,
                // A gold glow lifts a cream card off a cream page. On the black
                // page there is nothing to lift off, and the shadow only turns
                // the card's edge muddy, so it goes away.
                shadowColor: '#bd9348',
                shadowOpacity: skin.dark ? 0 : 0.14,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: skin.dark ? 0 : 2,
              }}
            >
              {/* Whose board it is, and how far it goes — a HIVE's own gold
                  hexagon for the boards that stay home, the near-black world
                  mark for the ones shared HIVE-Wide. Nat, viewing OG's boards:
                  "since these are all og HIVE, they should just have the amber
                  colored honey comb that denotes this group & should say 'OG
                  HIVE'." This floated in an absolute top-right corner until
                  2026-08-11, when Nat's iPhone showed a shared board wearing
                  BOTH chips ("OG HIVE" + "HIVE-Wide") — on a narrow card they
                  wrapped inside that floating box and landed on the emoji and
                  each other, one unreadable pile. A real row in the card's
                  flow pushes the content down instead of covering it; kept
                  right-aligned, which is her "upper right hand corner maybe"
                  on every width. */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 6 }}>
                <ScopeBadge scope={item.reach ?? 'hive'} communityId={item.community_id} size="sm" />
              </View>

              {/* Emoji only (Nat 2026-08-04). Checked before deleting: ZERO
                  boards store the old `hive:<name>` form, so nothing falls
                  through to render the literal text "hive:board". The picker
                  stopped offering the drawn marks some time ago; this was the
                  last way one could still appear. */}
              <Text style={{ fontSize: iconSize, lineHeight: iconSize + 4 }}>{emoji}</Text>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: titleSize,
                  lineHeight: titleSize + 5,
                  marginTop: 8,
                  color: isCompleted ? skin.inkSoft : skin.ink,
                }}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              {subtitle && !compact ? (
                <Text
                  style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: skin.inkSoft, marginTop: 4 }}
                  numberOfLines={descLines}
                >
                  {subtitle}
                </Text>
              ) : null}
              <Text
                style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 11, color: skin.inkFaint, marginTop: 3 }}
              >
                {countLabel}
              </Text>
              {recentThreads.length > 0 ? (
                <View
                  style={{
                    marginTop: 8,
                    paddingTop: 6,
                    borderTopWidth: 1,
                    borderTopColor: skin.border,
                  }}
                >
                  {recentThreads.map((thread) => (
                    <Pressable
                      key={thread.id}
                      onPress={(event) => {
                        if (onSelectThread) {
                          event.stopPropagation?.();
                          onSelectThread(item, thread.id);
                        } else {
                          onSelect(item);
                        }
                      }}
                      accessibilityRole="link"
                      accessibilityLabel={`Open thread: ${thread.title}`}
                      hitSlop={2}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 6,
                        borderRadius: 6,
                        paddingHorizontal: 3,
                        backgroundColor: pressed ? skin.cardPressed : 'transparent',
                      })}
                    >
                      <Text style={{ fontSize: 9, lineHeight: 21, color: skin.gold }}>▪</Text>
                      <Text
                        style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 21, color: skin.inkBody, flex: 1 }}
                        numberOfLines={1}
                      >
                        {thread.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={{ flexGrow: 1 }} />
              {matchLabel ? (
                <Text
                  style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: skin.gold, marginTop: 3 }}
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
          <Ionicons name="search-outline" size={28} color={skin.inkFaint} />
          <Text
            style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }}
            className="text-sm text-center mt-3"
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

import type { BoardCategory } from '../types';

export type BoardSortKey = 'alphabetical' | 'recent-activity' | 'oldest-activity' | 'most-threads';

export type BoardCategoryStats = {
  count: number;
  latestActivity: string | null;
};

export const BOARD_SORT_OPTIONS: { key: BoardSortKey; label: string }[] = [
  { key: 'alphabetical', label: 'A–Z' },
  { key: 'recent-activity', label: 'Recent activity' },
  { key: 'oldest-activity', label: 'Oldest activity' },
  { key: 'most-threads', label: 'Most threads' },
];

export function normalizeBoardSort(value: string | null): BoardSortKey {
  return BOARD_SORT_OPTIONS.some((option) => option.key === value)
    ? (value as BoardSortKey)
    : 'alphabetical';
}

// Punctuation is decoration. A board called "{Potential} Ideas" belongs under
// P, which is where a person looking down the grid expects to find it.
function getBoardSortName(name: string) {
  return name.replace(/^[^\p{L}\p{N}]+/u, '') || name;
}

export function sortCategoriesByBoardOrder(a: BoardCategory, b: BoardCategory) {
  return getBoardSortName(a.name).localeCompare(
    getBoardSortName(b.name),
    'en',
    { sensitivity: 'base' },
  );
}

function boardActivity(category: BoardCategory, stats: Record<string, BoardCategoryStats> | undefined) {
  // An empty board still has a meaningful place in the date sorts: the day it
  // was made. Once somebody posts or replies, the conversation's latest moment
  // becomes the useful date instead.
  return stats?.[category.id]?.latestActivity ?? category.created_at;
}

export function sortBoardCategories(
  categories: readonly BoardCategory[],
  sort: BoardSortKey,
  stats?: Record<string, BoardCategoryStats>,
) {
  return [...categories].sort((a, b) => {
    if (sort === 'recent-activity') {
      return boardActivity(b, stats).localeCompare(boardActivity(a, stats))
        || sortCategoriesByBoardOrder(a, b);
    }

    if (sort === 'oldest-activity') {
      return boardActivity(a, stats).localeCompare(boardActivity(b, stats))
        || sortCategoriesByBoardOrder(a, b);
    }

    if (sort === 'most-threads') {
      return (stats?.[b.id]?.count ?? 0) - (stats?.[a.id]?.count ?? 0)
        || sortCategoriesByBoardOrder(a, b);
    }

    return sortCategoriesByBoardOrder(a, b);
  });
}

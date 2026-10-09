/**
 * The Boards screen is a browser-like index: some people want the visual
 * bulletin-board tiles, while others want a compact scan of the same boards.
 * This is a display choice only; it never changes a board, its order, or who
 * can see it.
 */
export type BoardViewMode = 'tiles' | 'list';

export function normalizeBoardView(value: string | null): BoardViewMode {
  return value === 'list' ? 'list' : 'tiles';
}

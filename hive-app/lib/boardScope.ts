/**
 * Inside a HIVE, Boards normally shows everything a member can see: that
 * HIVE's boards plus boards shared HIVE-Wide. Some people want to concentrate
 * on home, so this is a display filter only. It never changes a board's reach.
 */
export type BoardScopeMode = 'all' | 'hive';

export function normalizeBoardScope(value: string | null): BoardScopeMode {
  return value === 'hive' ? 'hive' : 'all';
}

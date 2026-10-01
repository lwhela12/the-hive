/** A check-in board link owns Back only while its original board is open. */
export function shouldReturnToCheckIn(
  origin: string | null, targetCategoryId: string | null, selectedCategoryId: string | null,
  visitKey: string | null, visitActive: boolean,
): boolean {
  return origin === 'endofmonth' && !!visitKey && visitActive
    && !!targetCategoryId && selectedCategoryId === targetCategoryId;
}

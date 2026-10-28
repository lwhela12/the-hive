/** Check-in interest only: these choices are not an order or price quote. */
export const CLOTHING_INTEREST_KEY = 'q_oct_clothing_interests';
export const CLOTHING_INTEREST_OPTIONS = ['Hoodies', 'Pants', 'Shorts', 'T-shirts'] as const;

export function clothingInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const values = new Set(raw.filter((value): value is string => typeof value === 'string'));
  return CLOTHING_INTEREST_OPTIONS.filter(option => values.has(option));
}

export function toggleClothingInterest(raw: unknown, option: string): string[] {
  const selected = new Set(clothingInterests(raw));
  if (!CLOTHING_INTEREST_OPTIONS.some(value => value === option)) return [...selected];
  if (selected.has(option)) selected.delete(option); else selected.add(option);
  return CLOTHING_INTEREST_OPTIONS.filter(value => selected.has(value));
}

/** Counts each person's choice once, without showing individual answers. */
export function clothingInterestCounts(answers: Record<string, unknown>[]) {
  return CLOTHING_INTEREST_OPTIONS.map(option => ({
    option,
    count: answers.reduce((total, answer) => total + Number(clothingInterests(answer[CLOTHING_INTEREST_KEY]).includes(option)), 0),
  }));
}

/** The organizer summary includes only members of the current HIVE. */
export function clothingInterestCountsForMembers(
  members: { id: string }[],
  responses: ReadonlyMap<string, { answers?: Record<string, unknown> | null }>,
) {
  return clothingInterestCounts(members.map(member => responses.get(member.id)?.answers ?? {}));
}

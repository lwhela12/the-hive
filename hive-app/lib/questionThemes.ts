
export const QUESTION_THEMES = [
  'comfort',
  'home',
  'family',
  'food',
  'memory',
  'creativity',
  'craft',
  'work',
  'growth',
  'courage',
  'boundaries',
  'connection',
  'community',
  'play',
  'humour',
  'rest',
  'ambition',
  'identity',
  'values',
  'conflict',
  'learning',
  'place',
  'ritual',
  'generosity',
] as const;

export type QuestionTheme = (typeof QUESTION_THEMES)[number];

/** What each one is for, so tagging stays consistent between decks and people. */
export const THEME_NOTES: Record<QuestionTheme, string> = {
  comfort: 'What soothes you, what you reach for on a bad day.',
  home: 'Where you live and what you have made of it.',
  family: 'The people you came from, and the ones you chose.',
  food: 'Eating, cooking, feeding people.',
  memory: 'Looking back — childhood, a moment that stayed.',
  creativity: 'Making something that was not there.',
  craft: 'How you do the work, and what good looks like to you.',
  work: 'Your job, your projects, how you spend the day.',
  growth: 'Becoming — what changed, what you are working on.',
  courage: 'The brave thing, the thing that scared you.',
  boundaries: 'What you protect, what you decline.',
  connection: 'One-to-one closeness. Friendship, love, being known.',
  community: 'The group. Belonging, showing up, what we owe each other.',
  play: 'Silliness, games, joy for its own sake.',
  humour: 'What makes you laugh, and how you use it.',
  rest: 'Slowing down, quiet, recovery.',
  ambition: 'What you want next, the big one.',
  identity: 'Who you are, how you see yourself, contradictions.',
  values: 'What you believe and will not trade.',
  conflict: 'Disagreement, tension, repair.',
  learning: 'Curiosity, being a beginner, being taught.',
  place: 'Somewhere real — travel, a city, a room in the world.',
  ritual: 'The thing you do the same way every time.',
  generosity: 'Giving, helping, what you offer people.',
};

const VALID = new Set<string>(QUESTION_THEMES);

/** Keeps a typo out of the matcher, where it would silently match nobody. */
export function isQuestionTheme(value: string): value is QuestionTheme {
  return VALID.has(value);
}

/**
 * How much two questions have in common, 0–1, from their themes alone.
 *
 * Answering the very same question is worth more than answering two different
 * questions that reach for the same thing, and the matcher weights it that way
 * — this only measures the second, weaker kind of overlap.
 */
export function themeOverlap(a: readonly string[] | undefined, b: readonly string[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const setB = new Set(b);
  let shared = 0;
  a.forEach((theme) => {
    if (setB.has(theme)) shared += 1;
  });
  return shared / Math.max(1, Math.min(a.length, b.length));
}

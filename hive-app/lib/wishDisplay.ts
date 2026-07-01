import type { Wish } from '../types';

export type HdWishTabKey = 'public' | 'granted';

export const HD_WISH_TAB_LABELS: Record<HdWishTabKey, string> = {
  public: 'HD Wishes',
  granted: 'Granted',
};

export function getHdWishTabLabel(tab: HdWishTabKey) {
  return HD_WISH_TAB_LABELS[tab];
}

export function getHdWishStatusLabel(status: Wish['status']) {
  if (status === 'fulfilled') return getHdWishTabLabel('granted');
  if (status === 'public') return getHdWishTabLabel('public');
  return 'HD Wish';
}

const LEADING_WISH_PHRASES = /^(?:i\s+)?(?:wish(?:ed)?(?:\s+(?:to|for))?|want(?:ed)?(?:\s+to)?|would\s+like(?:\s+to)?|i['\u2019]d\s+like(?:\s+to)?|need(?:ed)?|have(?:\s+to)?|having|am\s+looking\s+for|i'm\s+looking\s+for|i\s+am\s+looking\s+for)\s+/i;
const TITLE_SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const COMPACT_TITLE_STOPS = [
  /\s+for\s+(?:me|us|my|our|lucas)\b/i,
  /\s+at\s+(?:the|my|our|his|her|their)\b/i,
  /\s+with\s+(?:me|us|my|our)\b/i,
  /,\s+(?:and|but|so|because)\b/i,
];

function cleanWishText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateAtWord(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, maxLength - 1).trim();
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = lastSpace > Math.floor(maxLength * 0.55)
    ? sliced.slice(0, lastSpace).trim()
    : sliced;
  return `${trimmed}...`;
}

function sentenceLead(value: string) {
  return value.split(/[.!?]/)[0]?.trim() || value;
}

function normalizeWishText(value?: string | null) {
  return cleanWishText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toTitleCase(value: string) {
  const words = cleanWishText(value).split(' ');
  return words.map((word, index) => {
    if (!word) return word;
    if (word === word.toUpperCase() || /\d/.test(word)) return word;

    const lower = word.toLowerCase();
    const isMiddleSmallWord = index > 0 && index < words.length - 1 && TITLE_SMALL_WORDS.has(lower);
    if (isMiddleSmallWord) return lower;
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }).join(' ');
}

function getCompactWishTitleSource(value: string) {
  let source = sentenceLead(value.replace(LEADING_WISH_PHRASES, '').trim());
  if (source.length < 4) source = value;

  for (const stopPattern of COMPACT_TITLE_STOPS) {
    const match = source.match(stopPattern);
    if (match?.index && match.index >= 6) {
      source = source.slice(0, match.index).trim();
      break;
    }
  }

  return source.replace(/[,:;\-]+$/g, '').trim();
}

export function getWishQuickTitle(
  wish: Pick<Wish, 'description'> & { title?: string | null },
  maxLength = 64
) {
  const savedTitle = cleanWishText(wish.title);
  const description = cleanWishText(wish.description);
  const source = savedTitle || description;
  if (!source) return 'Untitled wish';

  const titleSource = getCompactWishTitleSource(source) || source;
  return toTitleCase(truncateAtWord(titleSource, maxLength));
}

export function getWishBodyPreview(
  wish: Pick<Wish, 'description'> & { title?: string | null },
  maxLength = 160
) {
  return truncateAtWord(cleanWishText(wish.description), maxLength);
}

export function hasSeparateWishTitle(wish: Pick<Wish, 'description'> & { title?: string | null }) {
  const savedTitle = cleanWishText(wish.title);
  if (!savedTitle) return false;
  return normalizeWishText(savedTitle) !== normalizeWishText(wish.description);
}

export function shouldShowWishDescription(wish: Pick<Wish, 'description'> & { title?: string | null }) {
  const description = cleanWishText(wish.description);
  if (!description) return false;

  const titleSource = cleanWishText(wish.title) || description;
  const compactTitle = getCompactWishTitleSource(titleSource) || titleSource;
  return normalizeWishText(description) !== normalizeWishText(compactTitle);
}

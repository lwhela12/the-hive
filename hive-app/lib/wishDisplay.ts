import type { Wish } from '../types';

const LEADING_WISH_PHRASES = /^(?:i\s+)?(?:wish(?:ed)?(?:\s+(?:to|for))?|want(?:ed)?(?:\s+to)?|would\s+like(?:\s+to)?|i['\u2019]d\s+like(?:\s+to)?|need(?:ed)?|am\s+looking\s+for|i'm\s+looking\s+for|i\s+am\s+looking\s+for)\s+/i;

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

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

export function getWishQuickTitle(
  wish: Pick<Wish, 'description'> & { title?: string | null },
  maxLength = 64
) {
  const savedTitle = cleanWishText(wish.title);
  if (savedTitle) return truncateAtWord(savedTitle, maxLength);

  const description = cleanWishText(wish.description);
  if (!description) return 'Untitled wish';

  const withoutLead = description.replace(LEADING_WISH_PHRASES, '').trim();
  const titleSource = withoutLead.length >= 4 ? withoutLead : description;
  return capitalize(truncateAtWord(sentenceLead(titleSource), maxLength));
}

export function getWishBodyPreview(
  wish: Pick<Wish, 'description'> & { title?: string | null },
  maxLength = 160
) {
  return truncateAtWord(cleanWishText(wish.description), maxLength);
}

export function hasSeparateWishTitle(wish: Pick<Wish, 'description'> & { title?: string | null }) {
  return cleanWishText(wish.title).length > 0;
}

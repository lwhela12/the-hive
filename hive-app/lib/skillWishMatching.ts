import { supabase } from './supabase';
import { getWishQuickTitle } from './wishDisplay';
import type { Profile, Skill, Wish } from '../types';

// Deterministic client-side v1 of skill-to-wish matching. No AI call: a skill
// "matches" another member's active public wish when they share at least one
// meaningful token, or the full skill phrase appears inside the wish text.
// Precision over recall — a wrong bee is worse than a missing bee.

export type MatchedWish = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
};

export type SkillWishMatch = {
  skillId: string;
  wishes: MatchedWish[];
};

type MatchableSkill = Pick<Skill, 'id' | 'description'>;
type MatchableWish = Pick<Wish, 'id' | 'user_id' | 'description'> & {
  title?: string | null;
  user?: Pick<Profile, 'id' | 'name'> | null;
};

// Common words that carry no matching signal. Includes wish-speak
// ("want", "help", "teach") that would otherwise pair unrelated skills.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'them', 'they',
  'have', 'has', 'had', 'was', 'are', 'were', 'will', 'would', 'could',
  'should', 'can', 'not', 'but', 'you', 'your', 'our', 'her', 'his',
  'its', 'their', 'about', 'into', 'over', 'under', 'some', 'someone',
  'anything', 'something', 'more', 'most', 'much', 'many', 'very',
  'really', 'just', 'like', 'love', 'want', 'wants', 'wanting', 'wish',
  'wishing', 'need', 'needs', 'help', 'helping', 'learn', 'learning',
  'teach', 'teaching', 'know', 'knows', 'make', 'making', 'good',
  'great', 'better', 'best', 'been', 'being', 'get', 'getting', 'give',
  'find', 'finding', 'looking', 'time', 'week', 'month', 'year', 'day',
  'days', 'things', 'thing', 'people', 'person', 'when', 'where',
  'what', 'which', 'who', 'how', 'why', 'out', 'off', 'own', 'new',
]);

// Short words (< 4 chars) are dropped unless they carry clear meaning.
const SHORT_TOKEN_ALLOWLIST = new Set([
  'dog', 'cat', 'pet', 'art', 'van', 'gym', 'diy', 'tax', 'car', 'dj',
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(token =>
      token.length > 0 &&
      !STOPWORDS.has(token) &&
      (token.length >= 4 || SHORT_TOKEN_ALLOWLIST.has(token))
    );

  return new Set(tokens);
}

function skillMatchesWish(skillTokens: Set<string>, skillPhrase: string, wishText: string, wishTokens: Set<string>) {
  if (skillPhrase.length >= 4 && wishText.includes(skillPhrase)) return true;

  for (const token of skillTokens) {
    if (wishTokens.has(token)) return true;
  }

  return false;
}

/**
 * Pure matcher: returns, for each skill with at least one match, the wishes
 * it could help grant. Wishes are assumed to already belong to other members.
 */
export function matchSkillsToWishes(
  skills: MatchableSkill[],
  wishes: MatchableWish[]
): SkillWishMatch[] {
  if (skills.length === 0 || wishes.length === 0) return [];

  const preparedWishes = wishes.map(wish => {
    const wishText = `${wish.title ?? ''} ${wish.description ?? ''}`.toLowerCase();
    return {
      wish,
      wishText,
      wishTokens: tokenize(wishText),
    };
  });

  const matches: SkillWishMatch[] = [];

  skills.forEach(skill => {
    const skillPhrase = skill.description.trim().toLowerCase();
    const skillTokens = tokenize(skillPhrase);
    if (skillTokens.size === 0 && skillPhrase.length < 4) return;

    const matchedWishes = preparedWishes
      .filter(({ wishText, wishTokens }) => skillMatchesWish(skillTokens, skillPhrase, wishText, wishTokens))
      .map(({ wish }) => ({
        id: wish.id,
        title: getWishQuickTitle(wish),
        ownerId: wish.user_id,
        ownerName: wish.user?.name?.trim() || 'A HIVE member',
      }));

    if (matchedWishes.length > 0) {
      matches.push({ skillId: skill.id, wishes: matchedWishes });
    }
  });

  return matches;
}

/**
 * Fetches other members' active public wishes in the community and matches
 * them against the given skills. Fails silent (returns []) on query errors
 * so the garden simply shows no bees.
 */
export async function fetchSkillWishMatches({
  skills,
  currentUserId,
  communityId,
}: {
  skills: MatchableSkill[];
  currentUserId: string;
  communityId: string;
}): Promise<SkillWishMatch[]> {
  if (skills.length === 0) return [];

  try {
    // Same "active public" shape as useWishes: public status, is_active true
    // (or null for legacy rows), scoped to the community, excluding our own.
    const { data, error } = await supabase
      .from('wishes')
      .select('id, user_id, title, description, user:profiles(id, name)')
      .eq('status', 'public')
      .or('is_active.is.true,is_active.is.null')
      .eq('community_id', communityId)
      .neq('user_id', currentUserId);

    if (error || !data) return [];

    return matchSkillsToWishes(skills, data as unknown as MatchableWish[]);
  } catch {
    return [];
  }
}


/**
 * Who you have something in common with, and what it is.
 *
 * Nat, 2026-08-05: *"if all HIVEs are getting different questions, will this
 * swarm report still show who you match with, even across different hives &
 * different types of questions? how smart are the analytics?"*
 *
 * They were not smart. The old rule paired answers by **date** — everyone who
 * answered on the 5th was assumed to have answered the same question, which was
 * true when there was one HIVE and stopped being true the day there were three.
 * OG's deck has 365 questions, Tech's has 32, and their categories overlap in
 * zero places, so a cross-HIVE match would have compared an answer about a
 * childhood snack against one about a bad deploy, found the word "the" in both,
 * and reported a percentage. Confidently wrong is worse than blank.
 *
 * Three things changed, and they stack:
 *
 * 1. **Pairs are made by QUESTION, never by date.** Two people answering the
 *    same question a year apart still have something in common; two people
 *    answering different questions on the same morning do not.
 * 2. **Themes reach across decks.** You and somebody in Tech HIVE will never
 *    answer the same question, but you both lit up about COURAGE — and that is
 *    a real thing to share. Worth less than the same question, so it is scored
 *    lower rather than pretended to be equal.
 * 3. **Meaning, where we have it.** Each answer gets a small "gist" from Claude
 *    once, stored on the row: what it is ABOUT, and how the person feels about
 *    it. Word overlap thinks *pizza* and *pasta* have nothing in common and that
 *    "I love my dog" and "I hate my dog" are nearly the same sentence. Gists
 *    get both right. Where an answer has no gist yet, it falls back to words —
 *    the report works from the first night, and quietly sharpens.
 */

export type AnswerGist = {
  concepts?: string[];
  sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
  intensity?: number;
};

export type SwarmAnswer = {
  userId: string;
  communityId: string | null;
  questionIndex: number;
  answer: string;
  /** What the question underneath is reaching for. See `questionThemes.ts`. */
  themes?: readonly string[];
  gist?: AnswerGist | null;
};

export type SwarmMatch = {
  userId: string;
  /** 0–100. What the card shows. */
  percent: number;
  /** Questions you have both answered. The strongest kind of overlap. */
  sameQuestionCount: number;
  /** Different questions reaching for the same thing. */
  themeCount: number;
  /** The themes you keep meeting each other on, strongest first. */
  sharedThemes: string[];
  /** A couple of things you both talked about, for the "because…" line. */
  sharedConcepts: string[];
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for',
  'with', 'is', 'it', 'its', 'i', 'im', 'my', 'me', 'we', 'you', 'that', 'this',
  'so', 'be', 'was', 'are', 'as', 'if', 'not', 'just', 'about', 'really', 'very',
]);

function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/** The old measure, kept for answers that have not been distilled yet. */
function wordSimilarity(a: string, b: string): number {
  const wordsA = words(a);
  const wordsB = words(b);
  if (wordsA.size === 0 || wordsB.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  }
  let shared = 0;
  wordsA.forEach((word) => {
    if (wordsB.has(word)) shared += 1;
  });
  return shared / Math.max(1, Math.min(wordsA.size, wordsB.size));
}

/**
 * How much two people agree about how they FEEL, which is the half word
 * counting cannot see. Opposites are not a near miss — they are the clearest
 * possible signal that two people are not saying the same thing, so they are
 * scored well below strangers rather than slightly below.
 */
function sentimentAgreement(a?: AnswerGist | null, b?: AnswerGist | null): number {
  const left = a?.sentiment;
  const right = b?.sentiment;
  if (!left || !right) return 1;
  if (left === right) return 1;
  const opposed =
    (left === 'positive' && right === 'negative') ||
    (left === 'negative' && right === 'positive');
  if (opposed) return 0.15;
  return 0.75;
}

function conceptOverlap(a?: AnswerGist | null, b?: AnswerGist | null): number | null {
  const left = a?.concepts?.filter(Boolean) ?? [];
  const right = b?.concepts?.filter(Boolean) ?? [];
  if (left.length === 0 || right.length === 0) return null;
  const setRight = new Set(right.map((c) => c.toLowerCase().trim()));
  let shared = 0;
  left.forEach((concept) => {
    if (setRight.has(concept.toLowerCase().trim())) shared += 1;
  });
  return shared / Math.max(1, Math.min(left.length, right.length));
}

/** Meaning where we have it, words where we do not. */
function answerSimilarity(mine: SwarmAnswer, theirs: SwarmAnswer): number {
  const byConcept = conceptOverlap(mine.gist, theirs.gist);
  if (byConcept !== null) {
    return byConcept * sentimentAgreement(mine.gist, theirs.gist);
  }
  return wordSimilarity(mine.answer, theirs.answer);
}

/** Same deck, same slot — the only way two answers are to the same question. */
function questionKey(answer: SwarmAnswer): string {
  return `${answer.communityId ?? 'none'}#${answer.questionIndex}`;
}

/**
 * Answering the very same question is the real thing. Landing on the same theme
 * from two different questions is a genuine but weaker signal, and is scored as
 * such — pretending they are equal is how you get a 90% match with somebody you
 * have never overlapped with.
 */
const SAME_QUESTION_WEIGHT = 1;
const THEME_WEIGHT = 0.55;
/** Past this many thematic pairs per answer there is nothing left to learn. */
const MAX_THEME_PAIRS_PER_ANSWER = 3;

export function buildSwarmMatches(
  myUserId: string | null,
  answers: SwarmAnswer[],
): Map<string, SwarmMatch> {
  const out = new Map<string, SwarmMatch>();
  if (!myUserId) return out;

  const mine = answers.filter((a) => a.userId === myUserId && a.answer?.trim());
  if (mine.length === 0) return out;

  /**
   * A rare thing in common is worth more than a common one.
   *
   * The theme tagging came back with `identity` on 89 of OG's 365 questions and
   * `conflict` on 4. Weighted equally, everybody shares `identity` with
   * everybody and the number stops meaning anything — the loudest theme becomes
   * the noise floor. Two people who keep landing on CONFLICT have found each
   * other; two people who both answered an identity question have found a
   * Tuesday.
   *
   * Measured against YOUR OWN answers rather than the deck, so it adjusts to
   * the person: if half of what you have written is about identity, sharing it
   * tells us less about you specifically. It never falls below 0.4 — a common
   * theme is diluted, not dismissed.
   */
  const myThemeCounts = new Map<string, number>();
  mine.forEach((answer) => {
    (answer.themes ?? []).forEach((theme) => {
      myThemeCounts.set(theme, (myThemeCounts.get(theme) ?? 0) + 1);
    });
  });
  const commonest = Math.max(1, ...myThemeCounts.values());
  const rarity = (theme: string): number =>
    1 - 0.6 * ((myThemeCounts.get(theme) ?? 0) / commonest);

  /** Theme overlap, with each shared theme worth what it is actually worth. */
  const weightedOverlap = (a?: readonly string[], b?: readonly string[]): number => {
    if (!a?.length || !b?.length) return 0;
    const setB = new Set(b);
    let score = 0;
    a.forEach((theme) => {
      if (setB.has(theme)) score += rarity(theme);
    });
    return score / Math.max(1, Math.min(a.length, b.length));
  };

  const mineByQuestion = new Map<string, SwarmAnswer>();
  const mineByTheme = new Map<string, SwarmAnswer[]>();
  mine.forEach((answer) => {
    mineByQuestion.set(questionKey(answer), answer);
    (answer.themes ?? []).forEach((theme) => {
      if (!mineByTheme.has(theme)) mineByTheme.set(theme, []);
      mineByTheme.get(theme)!.push(answer);
    });
  });

  type Bucket = {
    weighted: number;
    weight: number;
    sameQuestionCount: number;
    themeCount: number;
    themes: Map<string, number>;
    concepts: Map<string, number>;
  };
  const buckets = new Map<string, Bucket>();
  const bucketFor = (userId: string): Bucket => {
    if (!buckets.has(userId)) {
      buckets.set(userId, {
        weighted: 0, weight: 0, sameQuestionCount: 0, themeCount: 0,
        themes: new Map(), concepts: new Map(),
      });
    }
    return buckets.get(userId)!;
  };

  const remember = (bucket: Bucket, a: SwarmAnswer, b: SwarmAnswer) => {
    (a.themes ?? []).forEach((theme) => {
      if ((b.themes ?? []).includes(theme)) {
        bucket.themes.set(theme, (bucket.themes.get(theme) ?? 0) + 1);
      }
    });
    const theirConcepts = new Set((b.gist?.concepts ?? []).map((c) => c.toLowerCase().trim()));
    (a.gist?.concepts ?? []).forEach((concept) => {
      const clean = concept.toLowerCase().trim();
      if (theirConcepts.has(clean)) {
        bucket.concepts.set(clean, (bucket.concepts.get(clean) ?? 0) + 1);
      }
    });
  };

  answers.forEach((theirs) => {
    if (theirs.userId === myUserId || !theirs.answer?.trim()) return;
    const bucket = bucketFor(theirs.userId);

    // 1. The same question, whenever either of you answered it.
    const twin = mineByQuestion.get(questionKey(theirs));
    if (twin) {
      bucket.weighted += answerSimilarity(twin, theirs) * SAME_QUESTION_WEIGHT;
      bucket.weight += SAME_QUESTION_WEIGHT;
      bucket.sameQuestionCount += 1;
      remember(bucket, twin, theirs);
      return;
    }

    // 2. A different question reaching for the same thing. This is the half
    //    that works across HIVEs, where the same question will never happen.
    const candidates = new Set<SwarmAnswer>();
    (theirs.themes ?? []).forEach((theme) => {
      (mineByTheme.get(theme) ?? []).forEach((answer) => candidates.add(answer));
    });
    if (candidates.size === 0) return;

    const scored = [...candidates]
      .map((answer) => ({
        answer,
        overlap: weightedOverlap(answer.themes, theirs.themes),
      }))
      .filter((pair) => pair.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap)
      .slice(0, MAX_THEME_PAIRS_PER_ANSWER);

    scored.forEach(({ answer, overlap }) => {
      const weight = THEME_WEIGHT * overlap;
      bucket.weighted += answerSimilarity(answer, theirs) * weight;
      bucket.weight += weight;
      bucket.themeCount += 1;
      remember(bucket, answer, theirs);
    });
  });

  buckets.forEach((bucket, userId) => {
    if (bucket.weight === 0) return;

    // Two people who have overlapped on three questions and agreed on all three
    // are not a 100% match — they are a promising one. `confidence` keeps a tiny
    // sample from shouting, and stops the report handing somebody a number it
    // cannot stand behind. It reaches full strength around a dozen pairs.
    const agreement = bucket.weighted / bucket.weight;
    const pairs = bucket.sameQuestionCount + bucket.themeCount;
    const confidence = Math.min(1, pairs / 12);
    const percent = Math.round(agreement * (0.55 + 0.45 * confidence) * 100);

    // Ranked by how much a shared theme is worth, not how often it turned up —
    // "you both light up about conflict" is a better sentence, and a truer one,
    // than "you both light up about identity".
    const rankThemes = (map: Map<string, number>) =>
      [...map.entries()]
        .sort((a, b) => b[1] * rarity(b[0]) - a[1] * rarity(a[0]) || a[0].localeCompare(b[0]))
        .map(([key]) => key);
    const rank = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key);

    out.set(userId, {
      userId,
      percent: Math.max(0, Math.min(100, percent)),
      sameQuestionCount: bucket.sameQuestionCount,
      themeCount: bucket.themeCount,
      sharedThemes: rankThemes(bucket.themes).slice(0, 3),
      sharedConcepts: rank(bucket.concepts).slice(0, 3),
    });
  });

  return out;
}

/**
 * The "because…" line. A number on its own invites you to believe it; a number
 * with a reason invites you to check it, which is the honest way round.
 */
export function describeMatch(match: SwarmMatch, theirName: string): string | null {
  const name = theirName.trim() || 'They';
  if (match.sharedConcepts.length > 0) {
    return `You have both talked about ${match.sharedConcepts.slice(0, 2).join(' and ')}.`;
  }
  if (match.sharedThemes.length > 0) {
    return `You both light up about ${match.sharedThemes.slice(0, 2).join(' and ')}.`;
  }
  if (match.sameQuestionCount > 0) {
    return `${name} has answered ${match.sameQuestionCount} of the same questions as you.`;
  }
  return null;
}

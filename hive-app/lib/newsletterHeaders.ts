/**
 * Nat's newsletter headers, wired to the sections they belong over.
 *
 * She drew these in the Wix days — gold serif, charcoal small-caps, a spill of
 * honeycomb either side, a couple of sparkles — and they are the reason the old
 * newsletters looked like a publication instead of an email. When the newsletter
 * moved into the app the art stayed behind in a Drive folder, and the sections
 * became a letterspaced line of text. Nat, 2026-08-03: "i was making & using
 * cute little headers like these... so when i try to generate the newsletter
 * tomorrow, it can pull in or make cute little headers and stuff?"
 *
 * MATCHED ON KEYWORDS, NOT ON EXACT TITLES. The draft function writes its own
 * section titles and Nat renames them freely — "Wishes granted 🌟" today,
 * "Granted wishes" next month — so an exact-title map would silently stop
 * matching the first time anybody edited a heading. Each piece of art declares
 * the words that mean it, and the first one that matches wins.
 *
 * A section with no matching art is NOT a failure: it falls back to a drawn
 * heading built from the same parts (gold serif, hairline, sparkle) so the page
 * still reads as one publication. That is deliberate — new sections will keep
 * appearing, and none of them should look broken for want of a PNG.
 */

export type NewsletterHeader = {
  key: string;
  /** The PNG, already cropped to the art band and sized for a phone. */
  source: number;
  /** Aspect ratio (width / height), so the image reserves the right space. */
  ratio: number;
  /** Lower-case words that mean this header. First match wins, in list order. */
  matches: string[];
  /** What the art says, for screen readers. */
  alt: string;
};

/**
 * Order matters — the most specific phrases sit above the general ones, so
 * "compliment corner" doesn't get eaten by "corner" or a stray "wins".
 */
export const NEWSLETTER_HEADERS: NewsletterHeader[] = [
  {
    key: 'queen-bee',
    source: require('../assets/newsletter/queen-bee.png'),
    ratio: 1000 / 320,
    matches: ['queen bee', 'spotlight', 'member of the month'],
    alt: 'Our Current Queen Bee',
  },
  {
    key: 'looking-ahead',
    source: require('../assets/newsletter/looking-ahead.png'),
    ratio: 1000 / 320,
    matches: ['coming up', 'looking ahead', 'upcoming', 'calendar', 'what’s next', "what's next", 'diary'],
    alt: 'Looking Ahead',
  },
  {
    key: 'keep-humming',
    source: require('../assets/newsletter/keep-humming.png'),
    ratio: 1000 / 320,
    matches: ['hive help', 'hang', 'humming', 'kindness', 'giving back', 'meetup'],
    alt: 'Keep the Hive Humming',
  },
  {
    key: 'highlights',
    source: require('../assets/newsletter/highlights.png'),
    ratio: 1000 / 320,
    matches: ['around the hive', 'app update', 'highlight', 'pardon our dust', 'expanding', 'what we built'],
    alt: 'HIVE Highlights',
  },
  {
    key: 'community-wins',
    source: require('../assets/newsletter/community-wins.png'),
    ratio: 1000 / 320,
    matches: [
      'compliment', 'shout-out', 'shout out', 'granted', 'wins', 'win',
      'celebrat', 'thank', 'kudos', 'good news',
    ],
    alt: 'Community Wins',
  },
  {
    key: 'buzz-so-far',
    source: require('../assets/newsletter/buzz-so-far.png'),
    ratio: 1000 / 320,
    matches: ['on the boards', 'board', 'buzz so far', 'conversation', 'threads', 'recap', 'this month'],
    alt: 'The Buzz So Far',
  },
  {
    key: 'important-links',
    source: require('../assets/newsletter/important-links.png'),
    ratio: 1000 / 320,
    matches: ['link', 'resource', 'where to find', 'sign up', 'rsvp'],
    alt: 'Important Links',
  },
];

/** The cover, for the top of a newsletter rather than over a section. */
export const NEWSLETTER_MASTHEAD = {
  source: require('../assets/newsletter/masthead.png'),
  ratio: 900 / 684,
  alt: 'H.I.V.E. Monthly Newsletter',
};

/**
 * The art for a section title, or null to draw the heading instead.
 *
 * Emoji and punctuation are stripped before matching, so "Compliment Corner 💐"
 * and "Compliment corner" reach the same piece of art.
 */
export function headerForSection(title: string): NewsletterHeader | null {
  const clean = (title ?? '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s’']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;

  for (const header of NEWSLETTER_HEADERS) {
    if (header.matches.some((word) => clean.includes(word))) return header;
  }
  return null;
}

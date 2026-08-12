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
 *
 * The "Our Current Queen Bee" header came out on 2026-08-06. Queen Bee — one
 * member a month getting the community's focus — was dissolved in April 2026 and
 * replaced by the Hummdinger session, where everyone's wish is live at once. Its
 * art matched the generic words "spotlight" and "member of the month" as well as
 * "queen bee", so an ordinary section title would have printed a gold banner
 * announcing a person the HIVE no longer picks.
 */
export const NEWSLETTER_HEADERS: NewsletterHeader[] = [
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
    alt: 'Keep the HIVE Humming',
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

/* ------------------------------------------------------------------------- *
 * Reading a letter back
 * ------------------------------------------------------------------------- */

/**
 * One piece of a newsletter, so a screen can give it the right typography.
 *
 * Every letter in the app is stored as PLAIN TEXT — the ones Nat imported from
 * the old Wix site and the ones the app drafts today. That is on purpose: a
 * newsletter gets copied into an email, and markdown syntax would land in the
 * email as literal asterisks and hashes. The cost is that nothing in the stored
 * text says "this line is a heading", so we work it out when we read it back.
 *
 * The imported Wix letters DO still have their paragraph breaks (checked against
 * production, 2026-08-05) — what they never had is any mark of what each line
 * was FOR. Rendered as one long `<Text>` they came out as an unbroken slab: a
 * section title, a date, a bullet and a sentence all in the same 15px Lato.
 */
export type LetterBlock =
  | { kind: 'heading'; text: string }
  /** A short line ending in a colon — Nat writes a lot of these. */
  | { kind: 'label'; text: string }
  /** "March 14: Nat's family in town" — the date and the thing, together. */
  | { kind: 'dated'; when: string; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; marker: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'attribution'; text: string }
  | { kind: 'paragraph'; text: string };

type Draft = {
  kind: LetterBlock['kind'];
  text: string;
  when?: string;
  marker?: string;
  isLink?: boolean;
  isDate?: boolean;
};

const BULLET_LINE = /^([-*•→▸])[ \t]+(.*)$/;
const NUMBERED_LINE = /^(\d{1,2})[.)][ \t]+(.*)$/;
const LINK_ONLY = /^(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+)$/i;
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
const DAY = '\\d{1,2}(?:st|nd|rd|th)?';
// "May 2nd:", "February 25th - March 4th:" — a date, then what happened.
const DATE_LINE = new RegExp(`^(${MONTH} ${DAY}(?:\\s*[-–—]\\s*(?:${MONTH} )?${DAY})?):\\s*(.*)$`);
const OPENS_QUOTE = /^[“"]/;
const CLOSES_QUOTE = /[”"][\s—–-]*$/;
// Trailing emoji, brackets and dashes hide the punctuation that ends a sentence.
const DECORATION = /[^\p{Letter}\p{Number}:;,.!?]+$/u;
const TITLE_MAX = 52;
const LABEL_MAX = 60;

/**
 * Turn a letter into blocks a screen can style.
 *
 * The tests are the ones a reader's eye uses, in plain terms:
 *
 * - A line that opens with a dash, an arrow or a number is a list item.
 * - A line that is nothing but a web address is a link, and never a heading.
 * - A SHORT line that doesn't finish a sentence is a title. Two extra guards
 *   keep that honest, because Wix broke every bold or linked phrase out onto
 *   its own line when Nat exported these: a title can't start mid-sentence (a
 *   lowercase first letter, a leading dash or arrow), and the line under it has
 *   to be something a title would introduce — a real paragraph, a list, or
 *   another title. That is what stops "Sort" and "Replant all" from becoming
 *   headings while "Around the HIVE" and "HIVE Help" still do.
 * - A short line ending in a colon is a label rather than a heading, so
 *   "Wishes granted in April:" sits quietly over the names it announces.
 * - Two or more short lines in a row under a label are that label's list, not a
 *   stack of headings ("General meeting reminders:" / "Bring a snack…").
 */
export function readLetter(text: string): LetterBlock[] {
  // Blank lines are the paragraph breaks; we redraw the air ourselves, so they
  // do not need to survive as empty blocks.
  const lines = (text ?? '')
    .split('\n')
    .map((line) => line.replace(/ /g, ' ').trim())
    .filter(Boolean);

  const blocks: Draft[] = lines.map((line) => {
    const numbered = NUMBERED_LINE.exec(line);
    if (numbered) return { kind: 'numbered', marker: numbered[1], text: numbered[2] };

    const bullet = BULLET_LINE.exec(line);
    if (bullet) return { kind: 'bullet', text: bullet[2] };

    const dated = DATE_LINE.exec(line);
    if (dated) {
      return dated[2]
        ? { kind: 'dated', when: dated[1], text: dated[2] }
        : { kind: 'label', text: dated[1], isDate: true };
    }

    if (LINK_ONLY.test(line)) return { kind: 'paragraph', text: line, isLink: true };
    if (OPENS_QUOTE.test(line) && CLOSES_QUOTE.test(line) && line.length > 24) {
      return { kind: 'quote', text: line };
    }
    return { kind: 'paragraph', text: line };
  });

  const isTitleish = (block: Draft | undefined, next: Draft | undefined): boolean => {
    if (!block || block.kind !== 'paragraph' || block.isLink) return false;
    const t = block.text;
    const limit = t.endsWith(':') ? LABEL_MAX : TITLE_MAX;
    if (t.length < 2 || t.length > limit) return false;
    if (!/\p{Letter}/u.test(t)) return false;
    // A colon in the middle means a sentence, not a title ("Contact Missy at: …").
    if (/:.+$/.test(t)) return false;
    // Starting lowercase or with a dash means this line finishes the one above it.
    if (/^[\p{Lowercase_Letter}—–→]/u.test(t)) return false;
    // A question mark does NOT disqualify a heading. "Not in a HIVE?" and
    // "So — what is HIVE?" are headings by any reader's eye, and this test
    // was throwing both away (Nat wrote them as headers, 2026-08-12). The
    // other guards still hold: it has to be short, start like a title, and be
    // followed by something a title would introduce — so a rhetorical
    // question inside a paragraph is still just a sentence.
    if (/[.!,;]$/.test(t.replace(DECORATION, ''))) return false;
    if (!next) return false;
    if (!next.isLink && next.kind === 'paragraph' && /^\p{Lowercase_Letter}/u.test(next.text)) {
      return false;
    }
    return true;
  };

  const introduces = (next: Draft | undefined): boolean => {
    if (!next) return false;
    if (next.kind === 'bullet' || next.kind === 'numbered' || next.kind === 'dated') return true;
    if (next.text.length >= 60) return true;
    return next.text.length >= 20 && next.text.endsWith(':');
  };

  const marks: (('heading' | 'label') | null)[] = blocks.map((block, i) => {
    if (!isTitleish(block, blocks[i + 1])) return null;
    if (block.text.endsWith(':')) return 'label';
    return introduces(blocks[i + 1]) ? 'heading' : null;
  });

  // A title sitting directly on top of another title is a title too — "HIVE
  // Help in May" over "Lucas Whelan". Not when a label already opened the
  // section, though: then these short lines are the label's contents.
  for (let i = blocks.length - 2; i >= 0; i--) {
    if (marks[i] || !marks[i + 1]) continue;
    if (marks[i - 1] === 'label' || marks[i - 1] === 'heading') continue;
    if (isTitleish(blocks[i], blocks[i + 1])) {
      marks[i] = blocks[i].text.endsWith(':') ? 'label' : 'heading';
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    if (marks[i] !== 'label') continue;
    let run = 0;
    for (let k = i + 1; k < blocks.length; k++) {
      const b = blocks[k];
      if (b.kind !== 'paragraph' || b.isLink) break;
      if (b.text.length > TITLE_MAX) break;
      if (/[.!?,;]$/.test(b.text.replace(DECORATION, ''))) break;
      run++;
    }
    if (run >= 2) for (let k = 0; k < run; k++) marks[i + 1 + k] = null;
  }

  marks.forEach((mark, i) => {
    if (mark) blocks[i].kind = mark;
  });

  const out: LetterBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];

    // "May 2nd:" with the event on the line below is one entry, not two.
    if (block.kind === 'label' && block.isDate && next?.kind === 'paragraph' && !next.isLink) {
      out.push({ kind: 'dated', when: block.text, text: next.text });
      i++;
      continue;
    }

    // Nat signs her quotes on the next line, sometimes with a dash in front.
    if (block.kind === 'quote' && next && next.kind !== 'quote') {
      const who = next.text.replace(/^[-–—•*]\s*/, '');
      if (who.length <= 40 && !/[.!?]$/.test(who)) {
        out.push({ kind: 'quote', text: block.text });
        out.push({ kind: 'attribution', text: who });
        i++;
        continue;
      }
    }

    if (block.kind === 'dated') out.push({ kind: 'dated', when: block.when ?? '', text: block.text });
    else if (block.kind === 'numbered') out.push({ kind: 'numbered', marker: block.marker ?? '', text: block.text });
    else out.push({ kind: block.kind, text: block.text } as LetterBlock);
  }
  return out;
}

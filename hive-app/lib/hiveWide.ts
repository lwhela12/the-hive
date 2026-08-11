/**
 * What HIVE-Wide is, said once.
 *
 * Nat asked for a welcome on the new landing page — who, what, why — and then
 * spotted that the same explanation is wanted in three places at once: the
 * landing page, the newsletter ("pardon our dust, we're expanding — here's what
 * that means for you"), and the what's-new banner at sign-in.
 *
 * So it lives here, once. Three surfaces, one set of words: change it and every
 * place that says it changes together, and nobody has to notice that the
 * newsletter has been describing an older version of the app for two months.
 * Same reasoning as lib/appNews.ts.
 *
 * HOUSE RULE, from Nat's brand guide: say what a thing IS. Never "it isn't X,
 * it's Y" — write the Y and stop.
 */

export type ScopeRung = {
  key: 'hive' | 'all_hives' | 'public';
  /** What a member sees on a badge. */
  label: string;
  /** One line, in the app. */
  meaning: string;
};

/** The ladder, in order. Everything in HIVE that can be shared sits on a rung. */
export const SCOPE_LADDER: ScopeRung[] = [
  {
    key: 'hive',
    label: 'This HIVE only',
    meaning: 'The people you joined with. Where everything starts.',
  },
  {
    key: 'all_hives',
    label: 'HIVE-Wide',
    meaning: 'Everyone in every HIVE, wherever they are.',
  },
  {
    key: 'public',
    label: 'Public',
    meaning: 'The newsletter and the-hive.app, where anyone can read it.',
  },
];

export type WelcomePanel = { heading: string; body: string };

/**
 * The welcome on the HIVE-Wide page.
 *
 * Used to answer what-am-I-looking-at, why-does-this-exist and what-does-it-
 * mean-for-me in four panels and a standfirst. Nat, 2026-08-08, looking at it
 * on her phone: "the explanation is in the title" — HIVE-Wide already says
 * what it is, so the first two panels were the page explaining itself to
 * itself. Cut to the one thing people actually want to know standing here:
 * what's visible, by default, and how do I change that.
 *
 * HIVE_WIDE_WELCOME_VERSION was deliberately NOT bumped for this rewrite —
 * see that constant below for why.
 */
export const HIVE_WIDE_WELCOME = {
  title: 'Welcome to HIVE-Wide',
  // The transitional note, not the FAQ — it says why you're standing here for
  // the first time rather than what this place permanently is. Nat, 2026-08-08:
  // "we're excited to announce that we now have multiple HIVEs so this is the
  // default landing page, but don't worry, your individual HIVEs are only a
  // click away." Unlike the panels below, this one is worth retiring once
  // everybody has actually met the new arrangement — it's an announcement, not
  // a fact about the app.
  announcement:
    'HIVE grew — there are multiple HIVEs now, so this is the front door '
    + 'everyone lands on first. Your own HIVE is still one click away, in the '
    + 'list on the left. Look around, and tell us what you think in App Feedback.',
  panels: [
    {
      heading: 'Visibility',
      body:
        'Everything you write stays in your own HIVE by default. You choose '
        + 'when something goes further — one wish, one thread at a time — and '
        + 'you can change your mind later. Your name and photo travel only if '
        + 'your profile allows it; otherwise a bee stands in for you.',
    },
  ] as WelcomePanel[],
};

/**
 * The newsletter version. Nat's framing, 2026-08-03: "Pardon our dust, we're in
 * the process of expanding. What does that mean for you and your privacy, or
 * your gregarious nature that can't wait to meet everyone?"
 *
 * Returned as plain paragraphs because the newsletter is plain text, and handed
 * to the draft as facts rather than prose — the letter writer puts it in Nat's
 * voice like everything else, so it never reads as a bolted-on notice.
 */
export const PARDON_OUR_DUST: string[] = [
  'HIVE is expanding. There are multiple HIVEs now where there was one, and the app '
    + 'grew a shared high street called HIVE-Wide to match.',
  'What that means if you like your privacy: nothing you have written has moved, '
    + 'and nothing moves on its own. Everything starts in your own HIVE and stays '
    + 'there until you decide otherwise, one thing at a time.',
  'What it means if you cannot wait to meet everybody: there is a switch on every '
    + 'wish, thread and kindness you log, and a setting on your profile that lets '
    + 'your name and face travel with what you share.',
  'Either way it is your call, on each thing, and you can change it whenever you like.',
];

/**
 * Bumped when the welcome changes enough that people should meet it again.
 * Stored per person (profiles.hive_wide_welcome_seen), so dismissing it on the
 * phone dismisses it on the laptop — read state follows the person, not the
 * device (migration 127).
 *
 * NOT bumped for the 2026-08-08 rewrite (shorter, visibility-first). Bumping
 * it does two things at once, and only one was wanted: it re-opens `firstVisit`
 * on `WayIntoYourHive` (the long hello) for every member who already arrived
 * once, not just re-flagging this one panel as unread. Cutting the word count
 * doesn't warrant greeting everybody like a stranger again.
 */
export const HIVE_WIDE_WELCOME_VERSION = '2026-08-03';

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
  /**
   * How far it looks. Your own HIVE wears its own colour; everything that
   * travels wears green, and gets more solid the further it goes — so reach
   * reads as weight before anybody reads a word.
   */
  treatment: 'hive-colour' | 'green-outline' | 'green-solid';
};

/** The ladder, in order. Everything in HIVE that can be shared sits on a rung. */
export const SCOPE_LADDER: ScopeRung[] = [
  {
    key: 'hive',
    label: 'This HIVE only',
    meaning: 'The people you joined with. Where everything starts.',
    treatment: 'hive-colour',
  },
  {
    key: 'all_hives',
    label: 'All HIVEs',
    meaning: 'Everyone in every HIVE, wherever they are.',
    treatment: 'green-outline',
  },
  {
    key: 'public',
    label: 'Public',
    meaning: 'The newsletter and the-hive.app, where anyone can read it.',
    treatment: 'green-solid',
  },
];

export type WelcomePanel = { heading: string; body: string };

/**
 * The welcome on the HIVE-Wide page. Deliberately answers the questions in the
 * order somebody actually asks them: what am I looking at, why does it exist,
 * and what does it mean for me.
 */
export const HIVE_WIDE_WELCOME = {
  title: 'Welcome to HIVE-Wide',
  standfirst:
    'The HIVEs share a high street, and this is it. Everything on this page is '
    + 'here because somebody chose to share it with all the HIVEs.',
  panels: [
    {
      heading: 'What you are looking at',
      body:
        'The month’s HIVE Focus, the boards we all share — HIVE Approved and '
        + 'Announcements — The Buzz, what’s new in the app, and a calendar with '
        + 'every HIVE’s meetings on it. Plus anything a member has opened up: a '
        + 'wish, a thread, a kindness they logged.',
    },
    {
      heading: 'Why it exists',
      body:
        'HIVE began as one group in Las Vegas. There are three now, and there '
        + 'will be more. HIVE-Wide is how they get to know each other while '
        + 'everybody keeps the room they joined for. Break down on Route 66 and a '
        + 'HIVEr lives nearby — that only works if the HIVEs can see one another.',
    },
    {
      heading: 'You are in control of all of it',
      body:
        'Everything you write starts in your own HIVE and stays there. When you '
        + 'want something to reach further you say so, one thing at a time, and '
        + 'you can change your mind. Your name and your face travel only if your '
        + 'profile says they can — keep it close and your recommendation still '
        + 'counts, with a little bee standing in for you.',
    },
    {
      heading: 'Your own HIVE is a tap away',
      body:
        'Boards, wishes, the Honey Pot, Compliment Corner, your meetings and your '
        + 'check-ins all live inside your HIVE, exactly where they were.',
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
  'HIVE is expanding. There are three HIVEs now where there was one, and the app '
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
 */
export const HIVE_WIDE_WELCOME_VERSION = '2026-08-03';

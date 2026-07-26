// What's new in the app.
//
// One list, read by three surfaces (Nat 2026-07-26): a dismissible strip on
// Home, the newsletter draft, and the meeting deck's News from Nat slide.
//
// It lives in code rather than in a table on purpose — the person who ships a
// feature is the person who knows it shipped, so adding the entry is part of
// making the change. No admin screen to remember to go and fill in.
//
// HOUSE RULES for entries:
//  - Say what a member can now DO, not what was built. "You can tap outside a
//    pop-up to close it" beats "refactored modal backdrops".
//  - One line. If it needs two, it's two entries or it's not news.
//  - Newest first. `date` is what gets shown; `id` must never be reused.

export type AppNewsEntry = {
  /** Stable, never reused — it's how "seen" is remembered. */
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  detail?: string;
};

export const APP_NEWS: AppNewsEntry[] = [
  {
    id: '2026-07-26-email-choices',
    date: '2026-07-26',
    title: 'Choose which emails you get',
    detail: 'Profile → Emails. Mute the ones you do not want; the rest keep coming.',
  },
  {
    id: '2026-07-26-currently-reading',
    date: '2026-07-26',
    title: 'Tell everyone what you are reading',
    detail: 'It is a question in the monthly check-in now, and it shows on your profile.',
  },
  {
    id: '2026-07-26-quarterly-profile',
    date: '2026-07-26',
    title: 'A quick profile look-over, four times a year',
    detail: 'The check-in shows what you already wrote so you can skip or tweak it.',
  },
  {
    id: '2026-07-26-tap-outside',
    date: '2026-07-26',
    title: 'Tap outside a pop-up to close it',
    detail: 'Works on all of them now, not just some.',
  },
  {
    id: '2026-07-26-skills-garden',
    date: '2026-07-26',
    title: 'The Skills Garden fills the space',
    detail: 'Fewer skills bloom bigger; more skills share the meadow.',
  },
];

/** Most recent first, which is also the order they should be shown in. */
export function getAppNews(limit = APP_NEWS.length): AppNewsEntry[] {
  return [...APP_NEWS]
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    .slice(0, limit);
}

/** Per-member key for the newest entry they've acknowledged. */
export function getAppNewsSeenKey(profileId: string) {
  return `the-hive:app-news-seen:${profileId}`;
}

/** Entries newer than whatever was last acknowledged. */
export function getUnseenAppNews(lastSeenId: string | null): AppNewsEntry[] {
  const ordered = getAppNews();
  if (!lastSeenId) return ordered;

  const seenIndex = ordered.findIndex((entry) => entry.id === lastSeenId);
  // An id we don't recognise means the entry was removed — treat it as if
  // nothing had been seen rather than silently hiding everything.
  return seenIndex === -1 ? ordered : ordered.slice(0, seenIndex);
}

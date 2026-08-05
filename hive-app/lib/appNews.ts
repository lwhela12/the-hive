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
  /** Where to go to actually try it. Omit when there's nowhere sensible. */
  href?: { pathname: string; params?: Record<string, string> };
  /** What the tap says it will do, e.g. "Open your emails". */
  action?: string;
};

export const APP_NEWS: AppNewsEntry[] = [
  {
    id: '2026-08-05-invited-vs-visible',
    date: '2026-08-05',
    title: 'Everyone can see the meeting. Not everyone is invited to it',
    detail: 'An event now asks two questions — who can see it is happening, and who is actually coming. Only the invited get the address and the joining link.',
    href: { pathname: '/hive' },
    action: 'Open the calendar',
  },
  {
    id: '2026-08-05-wish-paperclip',
    date: '2026-08-05',
    title: 'Show the thing you are wishing for',
    detail: 'The wish box has a paperclip now, so a picture can be part of the ask instead of a reply underneath it.',
  },
  {
    id: '2026-08-05-hive-wide-sticks',
    date: '2026-08-05',
    title: 'Choosing HIVE-Wide sticks',
    detail: 'It was being quietly set back to "This HIVE only" the moment you opened a wish. If you set something HIVE-Wide before today, it is worth checking.',
  },
  {
    id: '2026-08-05-hang-notes-read-out',
    date: '2026-08-05',
    title: 'What you write about a hang gets read out',
    detail: 'A note for each hang you went to, and they show on the meeting deck instead of just being counted.',
    href: { pathname: '/monthly-tuneup' },
    action: 'Open the check-in',
  },
  {
    id: '2026-08-05-manage-wish-tiles',
    date: '2026-08-05',
    title: 'Managing a wish takes one glance',
    detail: 'Grant, Edit, Archive, Refine and Delete are a row of coloured tiles rather than five long bars.',
  },
  {
    id: '2026-08-05-honest-ticks',
    date: '2026-08-05',
    title: 'A tick means you did it',
    detail: 'Your profile checklist was drawing a green tick on things you had not done yet.',
    href: { pathname: '/profile' },
    action: 'Open your profile',
  },
  {
    id: '2026-08-05-dark-fields',
    date: '2026-08-05',
    title: 'Writing boxes match the page they are on',
    detail: 'A white box on HIVE-Wide\u2019s night sky was the brightest thing on the screen.',
  },
  {
    id: '2026-08-05-path-footer',
    date: '2026-08-05',
    title: 'The bottom of every page tells you where you are',
    detail: 'A thin line, like the one at the bottom of a Finder window. Tap any step to go back to it.',
  },
  {
    id: '2026-08-05-mic-everywhere',
    date: '2026-08-05',
    title: 'Talk instead of typing, in every box you write in',
    detail: 'Ninety-five of them. If it is somewhere you write words, there is now a microphone in it.',
    href: { pathname: '/monthly-tuneup' },
    action: 'Try it on the check-in',
  },
  {
    id: '2026-08-05-scope-colours',
    date: '2026-08-05',
    title: 'You can see at a glance which HIVE something belongs to',
    detail: 'A hexagon in your HIVE\u2019s own colour. The Earth means it has gone HIVE-Wide.',
  },
  {
    id: '2026-08-05-hive-wide-welcome',
    date: '2026-08-05',
    title: 'HIVE-Wide explains itself when you arrive',
    detail: 'What it is, why it exists, and how far anything you write travels. Put it away once you have read it.',
    href: { pathname: '/hive-wide' },
    action: 'Go and see',
  },
  {
    id: '2026-08-05-buzz-letters',
    date: '2026-08-05',
    title: 'The old newsletters read like letters again',
    detail: 'The ones brought over from the old website had arrived as one long block of text.',
    href: { pathname: '/buzz' },
    action: 'Read the back issues',
  },
  {
    id: '2026-08-05-board-errors',
    date: '2026-08-05',
    title: 'The boards tell you when something has gone wrong',
    detail: 'Twenty-six failures used to happen in complete silence, so a post that did not save looked like a button that did nothing.',
  },
  {
    id: '2026-08-05-shared-boards-dark',
    date: '2026-08-05',
    title: 'The shared boards are readable on HIVE-Wide',
    detail: 'They were cream panels on a night sky.',
    href: { pathname: '/hive-wide-boards' },
    action: 'Open the shared boards',
  },
  {
    id: '2026-08-05-pending-invites',
    date: '2026-08-05',
    title: 'Owners can see who has been invited and not joined',
    detail: 'Including whether the invite has expired, and a way to take it back.',
  },
  {
    id: '2026-08-05-privacy-locks',
    date: '2026-08-05',
    title: 'A few more things locked down',
    detail: 'The newsletter list is owners-only, and nothing you write can be moved into a HIVE you are not in.',
  },
  {
    id: '2026-08-04-feedback-replies',
    date: '2026-08-04',
    title: 'App Feedback answers back',
    detail: 'Send a thought and you get a reply by email when it is looked at. You can attach a screenshot or record your voice.',
    href: { pathname: '/app-feedback' },
    action: 'Tell us something',
  },
  {
    id: '2026-08-04-hive-wide-wishes',
    date: '2026-08-04',
    title: 'Wishes shared HIVE-Wide have somewhere to land',
    detail: 'Marking a wish HIVE-Wide used to work and then go nowhere you could see.',
    href: { pathname: '/hive-wide' },
    action: 'See them',
  },
  {
    id: '2026-08-04-wish-scope-saves',
    date: '2026-08-04',
    title: 'Changing who can see a wish actually saves',
    detail: 'It was being set when the wish was created and quietly forgotten on every edit after.',
  },
  {
    id: '2026-08-04-thinking-bee',
    date: '2026-08-04',
    title: 'A bee flies while the app is thinking',
    detail: 'Instead of a grey spinner, in thirty-six places.',
  },
  {
    id: '2026-08-04-log-out-asks',
    date: '2026-08-04',
    title: 'Logging out asks first',
    detail: 'It sat directly under Admin, and there was no way back from a mis-tap.',
  },
  {
    id: '2026-08-04-one-og-chat',
    date: '2026-08-04',
    title: 'There is one OG HIVE chat, not two',
    detail: 'The same room was being drawn twice, and the empty-looking copy was the one people kept opening.',
    href: { pathname: '/messages' },
    action: 'Open Messages',
  },
  {
    id: '2026-08-04-board-icons',
    date: '2026-08-04',
    title: 'Six boards got their pictures back',
    detail: 'They had been showing a string of letters and numbers where the emoji should be.',
    href: { pathname: '/board' },
    action: 'Open Boards',
  },
  {
    id: '2026-08-04-attachments-private',
    date: '2026-08-04',
    title: 'Pictures you send are private',
    detail: 'Anything shared in a message or on a board is now only reachable by people in your HIVE.',
  },
  {
    id: '2026-08-03-hive-wide',
    date: '2026-08-03',
    title: 'HIVE-Wide is the view above all the HIVEs',
    detail: 'The world from orbit, with everyone\u2019s meetings, the shared boards and The Buzz. It sits with your own HIVEs in the menu.',
    href: { pathname: '/hive-wide' },
    action: 'Have a look',
  },
  {
    id: '2026-08-03-visible-hive-wide',
    date: '2026-08-03',
    title: 'You choose whether other HIVEs can see you',
    detail: 'Off to begin with. Your own HIVE always sees you either way.',
    href: { pathname: '/profile' },
    action: 'Open your profile',
  },
  {
    id: '2026-08-02-three-hives',
    date: '2026-08-02',
    title: 'There are three HIVEs now',
    detail: 'OG, Tech and Production. If you are in more than one, you can switch between them from the menu.',
  },
  {
    id: '2026-08-02-share-levels',
    date: '2026-08-02',
    title: 'You say how far each thing travels',
    detail: 'This HIVE only, HIVE-Wide, or public — one wish, thread or event at a time, and you can change your mind.',
  },
  {
    id: '2026-07-26-section-pencils',
    date: '2026-07-26',
    title: 'Edit from where you are',
    detail: 'Your own card has a pencil on each section, so you can change what you are looking at.',
    href: { pathname: '/members' },
    action: 'Open your card',
  },
  {
    id: '2026-07-26-fresh-honey',
    date: '2026-07-26',
    title: 'The app tells you when it has been updated',
    detail: 'A "fresh honey" bar appears up top when there is a newer version — tap it to refresh.',
  },
  {
    id: '2026-07-26-email-choices',
    date: '2026-07-26',
    title: 'Choose which emails you get',
    detail: 'Mute the ones you do not want; the rest keep coming.',
    href: { pathname: '/profile' },
    action: 'Open your email settings',
  },
  {
    id: '2026-07-26-currently-reading',
    date: '2026-07-26',
    title: 'Tell everyone what you are reading',
    detail: 'A new question in the monthly check-in — it shows on your profile.',
    href: { pathname: '/monthly-tuneup' },
    action: 'Go to the check-in',
  },
  {
    id: '2026-07-26-quarterly-profile',
    date: '2026-07-26',
    title: 'The check-in looks over your profile with you',
    detail: 'One page showing what you already wrote — skip it or tweak it.',
    href: { pathname: '/profile' },
    action: 'See your profile',
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
    href: { pathname: '/profile' },
    action: 'Visit your garden',
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

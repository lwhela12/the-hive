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
    // Nat read a real Production invite the morning of 8/14 and found the
    // letter explaining how Production differs from the other HIVEs before
    // anything had said what a HIVE is.
    id: '2026-08-14-invite-email-says-what-a-hive-is',
    date: '2026-08-14',
    title: 'The invite email introduces the HIVE properly now',
    detail: 'Our real logo up top, then what a HIVE is, then what your HIVE is — in that order. It also tells you about the little tour waiting on the other side of the button, and that you can skip it if you already know your way around.',
  },
  {
    // The bees have matched skills to wishes for a while and nobody was ever
    // told — Nat found out 2026-08-13 ("WHAT, OMG I didnt know it did this")
    // and asked how we let people know. This is how.
    id: '2026-08-13-garden-bees-explained',
    date: '2026-08-13',
    title: 'The bees in your garden are matchmakers',
    detail: 'When one of your skills matches somebody’s public wish, a bee lands on that bloom all by itself. Tap the bee and it shows whose wish you could help grant.',
    href: { pathname: '/profile' },
    action: 'Visit your garden',
  },
  {
    id: '2026-08-12-hive-wide-calendar',
    date: '2026-08-12',
    title: 'HIVE-Wide has a calendar now',
    detail: 'A month view with a coloured bee on every HIVE’s meeting day — all the HIVEs at once. Tap a day to see whose meeting it is, and step straight into your own HIVE’s.',
  },
  {
    id: '2026-08-12-garden-sunflowers',
    date: '2026-08-12',
    title: 'You can leave a 💛 on a bloom in someone’s garden',
    detail: 'Visiting a member’s skills garden and one of their blooms is lovely? Tap it and leave a little heart. They’ll find it next time they tend their garden — and see who it’s from.',
  },
  {
    id: '2026-08-12-quarter-and-year-checkins',
    date: '2026-08-12',
    title: 'Every HIVE gets a quarterly check-in now — and an end-of-year one',
    detail: 'Three days before the quarter ends, a five-minute look-back lands on Home: what happened, what you\'re proud of, what you want next. December\'s is the big one — the whole year. Short answers are perfect.',
  },
  {
    id: '2026-08-12-tag-a-whole-hive',
    date: '2026-08-12',
    title: 'You can tag a whole HIVE',
    detail: 'Writing @og or @tech in a shout-out or a post that travels HIVE-Wide reaches every member of that HIVE — each one gets their own little nudge, even if you\'re not in that HIVE yourself.',
  },
  {
    id: '2026-08-12-your-hives-own-questions',
    date: '2026-08-12',
    title: 'Each HIVE asks its own daily questions now',
    detail: 'Tech HIVE and Production HIVE each have a full year of their own — flavored to who they are. Your answers quietly show how you think and work, so you can find the people who work like you, and the ones who think exactly opposite.',
  },
  {
    id: '2026-08-12-one-answer-per-hive',
    date: '2026-08-12',
    title: 'In more than one HIVE? Answer them all',
    detail: 'Each of your HIVEs asks its own daily question, and you can now answer every one of them on the same day.',
  },
  {
    id: '2026-08-12-lighter-on-cellular',
    date: '2026-08-12',
    title: 'HIVE shows up faster on a slow connection',
    detail: 'There is about a fifth less to download before the bee appears, and the connection to your HIVE now starts while the rest is still arriving.',
  },
  {
    id: '2026-08-12-meeting-titles-follow-the-day',
    date: '2026-08-12',
    title: 'A meeting is named after the month it happens in',
    detail: 'Booking September\'s meeting in August used to call it "Aug" — the title was stamped with the day you booked it rather than the day you picked. It follows the date now, until you write your own.',
  },
  {
    id: '2026-08-12-home-remembers',
    date: '2026-08-12',
    title: 'Coming back to Home is quick now',
    detail: 'Home used to ask for everything again from scratch every single time you landed on it, even if you had only stepped away to Members for a second. It remembers now. Pull down when you want it to go and look again.',
  },
  {
    id: '2026-08-07-fetches-itself-again',
    date: '2026-08-07',
    title: 'If HIVE ever stops on the bee, it now goes and gets itself again',
    detail: 'It used to sit there, and then tell you something had tripped up. It fetches the newest version and carries on instead.',
  },
  {
    id: '2026-08-06-one-tap-sign-in',
    date: '2026-08-06',
    title: 'Signing in is one tap now',
    detail: 'The button names the account it is about to use, and then actually uses it — no list of accounts in between. "Use a different account" still opens the full list.',
  },
  {
    id: '2026-08-06-faster',
    date: '2026-08-06',
    title: 'HIVE opens a lot faster now',
    detail: 'It was quietly asking your phone to download the whole app again on every single visit. It keeps it now, and there is less of it to keep.',
  },
  {
    id: '2026-08-06-public-is-teal',
    date: '2026-08-06',
    title: 'Anything shared with the public wears its own teal badge',
    detail: 'It used to be the same near-black as HIVE-Wide, which is a very different audience to be mistaken for.',
  },
  {
    id: '2026-08-06-bounce',
    date: '2026-08-06',
    title: 'Pages give a little when you reach the end of them',
    detail: 'A screen that would not move used to look broken. Now it springs, the way the rest of your phone does.',
  },
  {
    id: '2026-08-06-buzz-shoutouts-in-place',
    date: '2026-08-06',
    title: 'Add a shout-out to the newsletter without leaving The Buzz',
    detail: 'It opens a box right there. What you have already added is waiting for you when you come back.',
    href: { pathname: '/buzz' },
    action: 'Open The Buzz',
  },
  {
    id: '2026-08-06-links-land-in-the-right-hive',
    date: '2026-08-06',
    title: 'A link to a thread now takes you to the HIVE it actually lives in',
    detail: 'And the trail along the bottom names the board it is really on, so going back puts you where you were.',
  },
  {
    id: '2026-08-06-hive-wide-switch-works',
    date: '2026-08-06',
    title: 'Being listed HIVE-Wide is one switch now, and it is on the Members page',
    detail: 'There used to be two switches in two places and you needed both. Flip it and watch yourself appear.',
    href: { pathname: '/members' },
    action: 'Open Members',
  },
  {
    id: '2026-08-06-your-photo-is-private',
    date: '2026-08-06',
    title: 'Your profile photo is behind the door now',
    detail: 'Member photos used to be reachable by anyone who knew where to look. They are signed out to members only.',
  },
  {
    id: '2026-08-06-things-say-when-they-fail',
    date: '2026-08-06',
    title: 'When something does not save, it tells you',
    detail: 'Ticking a task, adding skills, attaching a photo — these could all fail quietly and put themselves back. Now they say so, and keep what you typed.',
  },
  {
    id: '2026-08-06-phone-navigation',
    date: '2026-08-06',
    title: 'The menu on a phone has words under the pictures',
    detail: 'It also sits clear of the clock and the home bar. Add HIVE to your home screen and it behaves like an app.',
  },
  {
    id: '2026-08-06-show-me-hive-wide',
    date: '2026-08-05',
    title: 'Want the other HIVEs to be able to find you?',
    detail: 'One switch in your settings. It is off for everyone until they turn it on, which is why the HIVE-Wide member list looks empty.',
    href: { pathname: '/settings' },
    action: 'Open your settings',
  },
  {
    id: '2026-08-06-newsletter-actually-collects',
    date: '2026-08-05',
    title: 'What you add to the newsletter thread now reaches the newsletter',
    detail: 'It has been asking for shout-outs all along and quietly collecting none of them.',
  },
  {
    id: '2026-08-06-swarm-across-hives',
    date: '2026-08-05',
    title: 'The Swarm Report works across HIVEs now',
    detail: 'You and someone in another HIVE never answer the same question — but if you both light up about the same things, it finds that.',
    href: { pathname: '/members', params: { view: 'swarm' } },
    action: 'See who you match with',
  },
  {
    id: '2026-08-06-swarm-meaning',
    date: '2026-08-05',
    title: 'Matching understands what you meant',
    detail: 'It used to count shared words, so "pizza" and "pasta" had nothing in common and "I love my dog" nearly matched "I hate my dog".',
  },
  {
    id: '2026-08-06-swarm-why',
    date: '2026-08-05',
    title: 'Your match says why',
    detail: 'The card tells you what you keep meeting each other on, instead of just a number.',
  },
  {
    id: '2026-08-06-one-switch',
    date: '2026-08-05',
    title: 'Every setting works the same way',
    detail: 'Your preferences were asked in four different shapes. They are all the same switch now, in one column — and the sharing one shows you its own badge as you flip it.',
    href: { pathname: '/settings' },
    action: 'Open your settings',
  },
  {
    id: '2026-08-06-no-more-trapped',
    date: '2026-08-05',
    title: 'Pop-ups scroll instead of trapping you',
    detail: 'Sixteen of them could grow past the top of the screen and take their Save button with them.',
  },
  {
    id: '2026-08-06-tap-the-wish',
    date: '2026-08-05',
    title: 'Tapping a wish opens it',
    detail: 'A name link was stretched across the top of the card, so the tap that felt dead was landing on somebody\u2019s name.',
  },
  {
    id: '2026-08-06-meeting-marks',
    date: '2026-08-05',
    title: 'A meeting wears its own HIVE\u2019s colour',
    detail: 'And an event that everyone can see but only your HIVE is invited to now says both, instead of only the wider of the two.',
  },
  {
    id: '2026-08-06-where-weve-met',
    date: '2026-08-05',
    title: 'The location box remembers where you meet',
    detail: 'Start typing and the places your HIVE has used before come up to tap.',
  },
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

  // ---------------------------------------------------------------------
  // The back catalogue, written 2026-08-05 at Nat's request: "is it possible
  // to go through the code & add updates by date? retroactively?"
  //
  // Everything below was already live before this list existed on 2026-07-26,
  // and was read back out of the commit history. Dates are the real dates the
  // work landed. Only things a member would have noticed are here — the rest
  // of the history is plumbing and stays where it is.
  // ---------------------------------------------------------------------

  {
    id: '2026-07-25-summary-writes-itself',
    date: '2026-07-25',
    title: 'A meeting writes its own summary',
    detail: 'What was decided, what happens next and who is carrying it — in the same shape every time.',
    href: { pathname: '/meetings' },
    action: 'Open Meetings',
  },
  {
    id: '2026-07-25-newsletter-drafts',
    date: '2026-07-25',
    title: 'The newsletter drafts itself, and reads like a letter',
    detail: 'It gathers the month’s check-ins, compliments and meetings, then writes.',
    href: { pathname: '/newsletter' },
    action: 'See the draft',
  },
  {
    id: '2026-07-25-halfway-touch',
    date: '2026-07-25',
    title: 'Halfway through the month, HIVE asks how it is going',
    detail: 'Three short questions, and an email as well as a nudge in here.',
  },
  {
    id: '2026-07-24-one-help-focus',
    date: '2026-07-24',
    title: 'One HIVE Help focus at a time',
    detail: 'It changes when you meet, rather than when the month turns over.',
  },
  {
    id: '2026-07-23-boards-are-boards',
    date: '2026-07-23',
    title: 'The boards look like boards',
    detail: 'A grid of pinned cards you can read at a glance.',
    href: { pathname: '/board' },
    action: 'Open Boards',
  },
  {
    id: '2026-07-23-messages-split',
    date: '2026-07-23',
    title: 'Messages on a computer show the list and the conversation together',
    detail: 'Pick a room on the left, read it on the right.',
    href: { pathname: '/messages' },
    action: 'Open Messages',
  },
  {
    id: '2026-07-23-clive-posts',
    date: '2026-07-23',
    title: 'Clive can post to a board for you',
    detail: 'Under your name, and he shows you the words before he sends them.',
    href: { pathname: '/' },
    action: 'Ask Clive',
  },
  {
    id: '2026-07-22-compliment-corner',
    date: '2026-07-22',
    title: 'Compliment Corner opens every month',
    detail: 'A thread that collects the kind things all month, for the newsletter and the meeting.',
    href: { pathname: '/board' },
    action: 'Open Boards',
  },
  {
    id: '2026-07-22-voice-memo-meeting',
    date: '2026-07-22',
    title: 'Drop a voice memo of a meeting in and it comes back typed',
    detail: 'Drag the recording onto the page and read the notes it makes.',
    href: { pathname: '/meetings' },
    action: 'Open Meetings',
  },
  {
    id: '2026-07-22-rate-the-hangs',
    date: '2026-07-22',
    title: 'Say which hangs you went to, and how they were',
    detail: 'A honey score each, and the room sees the tally at the meeting.',
    href: { pathname: '/monthly-tuneup' },
    action: 'Open the check-in',
  },
  {
    id: '2026-07-21-two-month-calendar',
    date: '2026-07-21',
    title: 'The Meet Ups calendar shows two months at once',
    detail: 'And somebody away for a week rides across those days as their own face.',
  },
  {
    id: '2026-07-20-multi-day-events',
    date: '2026-07-20',
    title: 'An event can run for several days, or take a whole one',
    detail: 'Trips and all-day things say so instead of picking an hour.',
    href: { pathname: '/hive' },
    action: 'Open the calendar',
  },
  {
    id: '2026-07-09-meeting-helper',
    date: '2026-07-09',
    title: 'The meeting runs from inside HIVE',
    detail: 'The Meeting Helper walks the room through the night, and everyone can follow it on their own screen.',
    href: { pathname: '/meeting-helper' },
    action: 'Open the Meeting Helper',
  },
  {
    id: '2026-07-09-checkin-reminder',
    date: '2026-07-09',
    title: 'A reminder arrives three days before the meeting',
    detail: 'So the check-in is done before anybody sits down.',
  },
  {
    id: '2026-07-09-log-a-kindness',
    date: '2026-07-09',
    title: 'Log a kindness you have already done',
    detail: 'The HIVE Help you gave gets written down where the rest of us can see it.',
  },
  {
    id: '2026-07-08-tuneup-wizard',
    date: '2026-07-08',
    title: 'The monthly check-in became a guided walk-through',
    detail: 'One question at a time, and it keeps your place if you stop partway.',
    href: { pathname: '/monthly-tuneup' },
    action: 'Open the check-in',
  },
  {
    id: '2026-07-08-arrival-board',
    date: '2026-07-08',
    title: 'A meeting starts with everybody arriving',
    detail: 'You say you are here and how much you have got in the tank.',
    href: { pathname: '/arrival-board' },
    action: 'See the arrival board',
  },
  {
    id: '2026-07-08-linked-logins',
    date: '2026-07-08',
    title: 'One person can have more than one email address',
    detail: 'Add a second login and both doors open the same profile.',
    href: { pathname: '/profile' },
    action: 'Open your profile',
  },
  {
    id: '2026-07-08-honey-pot-cashapp',
    date: '2026-07-08',
    title: 'Pay into the Honey Pot from your phone',
    detail: 'A Cash App link sits on the pot itself.',
    href: { pathname: '/honey-pot' },
    action: 'Open the Honey Pot',
  },
  {
    id: '2026-07-08-bees-visit-blooms',
    date: '2026-07-08',
    title: 'Bees visit the flowers somebody actually needs',
    detail: 'A bloom in your garden that matches a live wish gets a visitor.',
    href: { pathname: '/profile' },
    action: 'Visit your garden',
  },
  {
    id: '2026-07-01-swarm-report',
    date: '2026-07-01',
    title: 'The Swarm Report tells you who you keep agreeing with',
    detail: 'Built out of everybody’s answers to the daily question.',
    href: { pathname: '/members', params: { view: 'swarm' } },
    action: 'See your matches',
  },
  {
    id: '2026-06-30-private-wishes',
    date: '2026-06-30',
    title: 'A wish you keep to yourself stays to yourself',
    detail: 'It stopped turning up in the places other people look.',
  },
  {
    id: '2026-06-11-approve-meeting-notes',
    date: '2026-06-11',
    title: 'Read the meeting notes before they turn into to-dos',
    detail: 'The proposed list comes to you first, and you can change any of it.',
    href: { pathname: '/meetings' },
    action: 'Open Meetings',
  },
  {
    id: '2026-06-10-monthly-checkin',
    date: '2026-06-10',
    title: 'There is a monthly check-in',
    detail: 'Answers are kept by the month you gave them, so you can look back at what you said.',
    href: { pathname: '/monthly-tuneup' },
    action: 'Open the check-in',
  },
  {
    id: '2026-06-10-board-search',
    date: '2026-06-10',
    title: 'Search the boards',
    detail: 'For the thread you half-remember.',
    href: { pathname: '/board' },
    action: 'Open Boards',
  },
  {
    id: '2026-05-27-reactions-everywhere',
    date: '2026-05-27',
    title: 'React with an emoji to anything',
    detail: 'The same set on a board post and in a message, sitting where iMessage puts them.',
  },
  {
    id: '2026-05-17-short-video',
    date: '2026-05-17',
    title: 'Send a short video',
    detail: 'It travels wherever a picture travels.',
    href: { pathname: '/messages' },
    action: 'Open Messages',
  },
  {
    id: '2026-05-17-clive-stays-out',
    date: '2026-05-17',
    title: 'Clive stays out of your private messages',
    detail: 'He reads the boards, the wishes and the meetings. Your rooms and DMs are yours.',
  },
  {
    id: '2026-05-16-honey-pot-ledger',
    date: '2026-05-16',
    title: 'The Honey Pot shows every penny',
    detail: 'What went in, what came out and when — open to everyone in the HIVE.',
    href: { pathname: '/honey-pot' },
    action: 'Open the Honey Pot',
  },
  {
    id: '2026-05-15-skills-garden',
    date: '2026-05-15',
    title: 'Your skills grow as a garden',
    detail: 'Plant one and it blooms on your profile.',
    href: { pathname: '/profile' },
    action: 'Visit your garden',
  },
  {
    id: '2026-05-14-clive-asks-first',
    date: '2026-05-14',
    title: 'Clive can do things, and asks before he does them',
    detail: 'He says what he is about to change and waits for your yes.',
    href: { pathname: '/' },
    action: 'Ask Clive',
  },
  {
    id: '2026-05-13-photo-notes',
    date: '2026-05-13',
    title: 'Photograph your handwritten meeting notes',
    detail: 'They come back typed, as to-dos and dates for you to approve.',
    href: { pathname: '/meetings' },
    action: 'Open Meetings',
  },
  {
    id: '2026-05-11-mentions',
    date: '2026-05-11',
    title: 'Mention somebody in a chat and they hear about it',
    detail: 'Type @ and pick a name.',
    href: { pathname: '/messages' },
    action: 'Open Messages',
  },
  {
    id: '2026-05-11-home-todos',
    date: '2026-05-11',
    title: 'Home carries your to-do list',
    detail: 'What you took on sits where you land.',
    href: { pathname: '/hive' },
    action: 'Go Home',
  },
  {
    id: '2026-05-08-daily-question',
    date: '2026-05-08',
    title: 'A question a day, with everybody’s answers underneath',
    detail: 'A year of them, so a new one arrives each morning.',
    href: { pathname: '/hive' },
    action: 'Answer today’s',
  },
  {
    id: '2026-05-08-talk-your-answer',
    date: '2026-05-08',
    title: 'Talk your answer instead of typing it',
    detail: 'The first microphone in HIVE, on the daily question.',
    href: { pathname: '/hive' },
    action: 'Try it',
  },
  {
    id: '2026-05-08-activity-feed',
    date: '2026-05-08',
    title: 'Home tells you what you have missed',
    detail: 'A running list of what happened, and tapping a line takes you to it.',
    href: { pathname: '/hive' },
    action: 'Go Home',
  },
  {
    id: '2026-05-07-members-page',
    date: '2026-05-07',
    title: 'There is a page with everybody on it',
    detail: 'Faces, what they do, and what they are working on.',
    href: { pathname: '/members' },
    action: 'Open Members',
  },
  {
    id: '2026-05-07-calendar-actions',
    date: '2026-05-07',
    title: 'Put a meeting in your own calendar, or join it, from Home',
    detail: 'Two buttons on the event itself.',
    href: { pathname: '/hive' },
    action: 'Open the calendar',
  },
  {
    id: '2026-05-06-clive-projects',
    date: '2026-05-06',
    title: 'Clive keeps your conversations in folders',
    detail: 'One for each thing you are working on.',
    href: { pathname: '/' },
    action: 'Ask Clive',
  },
  {
    id: '2026-03-12-iphone-app',
    date: '2026-03-12',
    title: 'HIVE runs on an iPhone',
    detail: 'The same account, signed in the same way.',
  },
  {
    id: '2026-03-12-push',
    date: '2026-03-12',
    title: 'Your phone can tell you when something happens',
    detail: 'A message, a reply on a board, a meeting about to start.',
  },
  {
    id: '2026-02-17-home-screen',
    date: '2026-02-17',
    title: 'Put HIVE on your phone’s home screen',
    detail: 'It opens straight up, like anything else on there.',
  },
  {
    id: '2026-01-15-group-messages',
    date: '2026-01-15',
    title: 'Start a message with several people at once',
    detail: 'Name the group, and rename it whenever you like.',
    href: { pathname: '/messages' },
    action: 'Open Messages',
  },
  {
    id: '2026-01-15-wish-refining',
    date: '2026-01-15',
    title: 'Write a wish and have Clive sharpen it',
    detail: 'He reads it back to you until it is something somebody could actually pick up.',
    href: { pathname: '/' },
    action: 'Ask Clive',
  },
  {
    id: '2026-01-15-message-attachments',
    date: '2026-01-15',
    title: 'Attach a picture to a message',
    detail: 'And copy out anything anybody wrote.',
    href: { pathname: '/messages' },
    action: 'Open Messages',
  },
  {
    id: '2026-01-07-transcription',
    date: '2026-01-07',
    title: 'A meeting recording gets typed up on its own',
    detail: 'The first thing HIVE ever did while nobody was watching.',
    href: { pathname: '/meetings' },
    action: 'Open Meetings',
  },
];

/** Most recent first, which is also the order they should be shown in. */
export function getAppNews(limit = APP_NEWS.length): AppNewsEntry[] {
  return [...APP_NEWS]
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    .slice(0, limit);
}

/**
 * Everything shipped since a given day — the meeting deck's window.
 *
 * The deck used to show "the newest 6" under a heading that said "this
 * month", which is two different claims and neither was checked. Nat,
 * 2026-08-12: *"Ideally this page will list all of the app updates from one
 * 1st thurs to the next."* So the deck asks for one meeting cycle, and gets
 * exactly that however many entries it turns out to be.
 *
 * `since` is the last meeting's date. Entries dated that day count as
 * belonging to the cycle that follows it — the meeting happens in the
 * evening, so anything shipped that day was news at the meeting, not after.
 */
export function getAppNewsSince(since: Date): AppNewsEntry[] {
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  return getAppNews().filter((entry) => entry.date > sinceIso);
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

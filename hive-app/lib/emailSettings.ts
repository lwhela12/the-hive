/**
 * The emails HIVE sends, and the one list that describes them.
 *
 * Moved out of `app/(app)/settings.tsx` on 2026-09-02. Nat, writing three
 * group texts by hand: *"a short cut to toggle off their email settings if
 * they want."* The halfway check-in is where people actually are when a link
 * lands in their pocket, so the switches have to be reachable from there as
 * well as from a Settings page nobody goes looking for — and two copies of a
 * list like this is how one of them quietly stops matching the mail.
 *
 * `scripts/lint-reach-mail.mjs` reads THIS file for its third half (a member
 * can turn it off), so a kind that sends mail with no row here still fails the
 * build.
 */

/**
 * One switch per email the HIVE actually sends.
 *
 * **The newsletter switch is here as of 2026-08-12, and the reason it was
 * absent is worth keeping.** It used to say: *"Nat still writes it in the app
 * and pastes it into Wix to send, so nothing in our code consults a member's
 * answer at send time — a switch would take the choice and quietly drop it."*
 * That was right, and it stopped being right the day `send-newsletter`
 * shipped, because that function reads `email_newsletter_enabled` to decide
 * who gets an issue.
 *
 * Nat found the gap from the other end, in the email itself: the footer told
 * members to "turn it off in Settings" and Settings had no such switch. A
 * promise pointing at nothing.
 *
 * **Replies and @s joined the list on 2026-09-01.** They used to be absent
 * with a note saying they "arrive as a nudge on your phone" — which was true
 * of the code and false of the world. Expo push reaches an installed app, and
 * HIVE is a browser tab, so those nudges had been landing where nobody was
 * standing since June. Nat: *"we don't have any means of pushing. It's not an
 * app. It's a web app... nobody knows any of those things. So I think an email
 * could be nice, because then people could know to go back into the HIVE web
 * app. And the usage has really fallen off."*
 *
 * The three new ones are email only, deliberately: *"the only thing we have
 * available to ourselves right now is email... When it is an app, then they can
 * toggle those on."* A push switch goes beside each the day there is an app to
 * push to.
 *
 * `scripts/lint-reach-mail.mjs` holds the three halves together — column,
 * sender, and a row on this page — so a switch can never govern nothing.
 */

export type EmailSetting = {
  /** The boolean column on profiles that carries this. */
  column: string;
  label: string;
  hint?: string;
};

/**
 * These three carry a line of explanation each, against this page's usual rule.
 *
 * Nat set that rule herself on 2026-08-11 — *"each bolded header is self
 * explanatory enough, we dont need to explain it, thats just too many words"* —
 * and made this exception on 2026-08-12: *"Normally, i dont like the extra
 * explainer text, but here, i think we can add a little more."* The difference
 * is that these three switch off an email a member has not received yet, so
 * the label alone is asking them to decide about something they cannot picture.
 */
export const EMAIL_SETTINGS: EmailSetting[] = [
  {
    column: 'email_meeting_checkin_enabled',
    label: 'Before-a-meeting check-in',
    hint: 'Three days before the meeting, an email walks you through getting ready — your wishes, your to-dos, and how you are doing.',
  },
  {
    column: 'email_midpoint_checkin_enabled',
    label: 'End of the month',
    hint: 'Roughly halfway between meetings. A quick pulse on how it is going, and your chance to put a shout-out or a plug in the next newsletter.',
  },
  {
    column: 'email_newsletter_enabled',
    label: 'The Buzz',
    hint: 'The monthly newsletter — what everyone worked on, what got granted, and what is coming up.',
  },
  {
    column: 'email_post_meeting_recap_enabled',
    label: 'Recap email if I miss a meeting',
    hint: 'After Wrap-Up confirms you were away, two direct ways to catch up: the sealed summary or Clive.',
  },
  {
    column: 'email_mention_enabled',
    label: 'When somebody writes my name',
    hint: 'An @mention on a board, in a room, or on a wish — with what they said and a way straight to it.',
  },
  {
    column: 'email_message_enabled',
    label: 'When a message lands for me',
    hint: 'One email per conversation, then quiet until you have opened it.',
  },
  {
    column: 'email_board_reply_enabled',
    label: 'When somebody replies to my post',
    hint: 'A reply on something you put on a board.',
  },
];

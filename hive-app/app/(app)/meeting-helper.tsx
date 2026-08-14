import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { hiveAccent } from '../../lib/hiveBrand';
import { EventAudienceToggle, type EventAudience } from '../../components/events/EventAudienceToggle';
import { useAuth } from '../../lib/hooks/useAuth';
import { CHECK_INS_COMING_SOON_MESSAGE, hasMeetingDeck } from '../../lib/checkIns';
import { useDeepTrail } from '../../lib/hooks/usePathTrail';
import { fetchHoneyPotLedger } from '../../lib/honeyPot';
import { getCycleStart } from '../../lib/meetingCycle';
import { EditButton } from '../../components/ui/EditButton';
import { getWishQuickTitle, pickSpotlightWish } from '../../lib/wishDisplay';
import { getAppNews, getAppNewsSince } from '../../lib/appNews';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';
import { parseFocusAnswer, focusAnswerDidIt, focusAnswerScore } from '../../components/surveys/SurveyQuestionField';
import { Avatar } from '../../components/ui/Avatar';
import { ArrivalMemberCard } from '../../components/meetings/ArrivalMemberCard';
import { ScheduleMeetingModal } from '../../components/meetings/ScheduleMeetingModal';
import { ComposerBar } from '../../components/ui/ComposerBar';
import { FIELD_LOOK } from '../../components/ui/Input';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { showAlert } from '../../lib/showAlert';
import { getMentionedMembers, hasBroadcastMention } from '../../lib/mentions';
import { useMentionReach } from '../../lib/hooks/useMentionableMembers';
import {
  formatMeetingDate,
  getAttendance,
  getCheckInOrder,
  getFirstName,
  getLocalIsoDate,
  getMonthNameFromPeriod,
  getTextAnswer,
  useArrivalBoard,
  type ArrivalBoardMember,
} from '../../lib/hooks/useArrivalBoard';

const hiveBee = require('../../assets/HIVE Bee.png');
const hiveLogo = require('../../assets/HIVE Logo Transparent  BG.png');

// OG's hand-tuned golds. Other HIVEs' decks derive the same three roles —
// accent, deep ink, light tint — from their own `accent_color`, inside the
// component, so Tech's deck reads in Tech's blue everywhere OG's reads gold.
const OG_GOLD = '#bd9348';
const OG_GOLD_DEEP = '#8a6b30';
const CHARCOAL = '#313130';
const MUTED = '#9a8060';
const PAPER = '#fdfbf2';
const CARD = '#fffdf5';

/** #rrggbb → its three channel numbers (hiveAccent guarantees the shape). */
const hexChannels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Move a colour part-way toward black (0) or white (255). */
const mixToward = (hex: string, target: number, amount: number): [number, number, number] =>
  hexChannels(hex).map((channel) => Math.round(channel + (target - channel) * amount)) as [
    number,
    number,
    number,
  ];

const TAGLINE = 'HUMAN · INSIGHT · VISION · EXECUTION';

/**
 * The look worn by the boxes you would never talk into — a clock time, here.
 *
 * Everything on this deck that takes WORDS is a `ComposerBar`, so it comes with
 * the microphone and you can say it out loud instead of typing at a television.
 * A time is not words, so it keeps a plain field — but it wears the same white
 * fill, the same gold hairline and the same placeholder ink as the composer, so
 * the deck reads as one set of controls rather than two.
 */
const FIELD_BORDER = FIELD_LOOK.border;
const PLACEHOLDER_INK = FIELD_LOOK.placeholder;
const PLAIN_FIELD = {
  borderWidth: 1,
  borderColor: FIELD_LOOK.border,
  borderRadius: FIELD_LOOK.radius,
  backgroundColor: FIELD_LOOK.fill,
  paddingHorizontal: FIELD_LOOK.paddingHorizontal,
  paddingVertical: FIELD_LOOK.paddingVertical,
  fontFamily: FIELD_LOOK.font,
  fontSize: FIELD_LOOK.fontSize,
  color: FIELD_LOOK.ink,
} as const;

// ---- Per-HIVE deck definitions ----
// Each HIVE that has a designed rhythm gets a deck here — a declarative list,
// so Production's future deck becomes a third entry rather than a third
// branch. OG (slug 'default') is the original deck, byte-for-byte; Tech is
// Nat's 2026-08-11 voice-memo design: monthly first-Thursday evenings,
// work-and-craft focused, networking instead of hangs, and the treasurer
// slide kept deliberately as the place to talk about WHETHER Tech wants dues.

type DeckSlideKey =
  | 'room'
  | 'outline'
  | 'news'
  | 'treasurer'
  | 'meetups'
  | 'hummdinger'
  /**
   * Production's replacement for the HummDinger slide. OG and Tech spend that
   * stretch on one member's wish; Production has one shared goal instead, so
   * the same stretch of the night is spent handing out the jobs that move it.
   * Same mechanism underneath — @-mention a member and it lands on their list.
   */
  | 'assignments'
  | 'wrapup'
  | 'thanks';

type DeckDefinition = {
  /** The slides, in show order. */
  slides: DeckSlideKey[];
  /** Tonight's agenda — drives both the Outline slide and the frozen rail. */
  agenda: { key: string; label: string }[];
  /** The italic line under the welcome title as people arrive. */
  welcomeNudge: string;
  /**
   * The Treasurer slide. OG reports the Honey Pot with real dues numbers;
   * Tech has no Honey Pot yet, and the slide is KEPT on purpose — Nat: having
   * the screen is what starts the do-we-want-dues conversation.
   */
  treasurer:
    | { kind: 'honeyPot'; kicker: string; title: string }
    | { kind: 'duesConversation'; kicker: string; title: string; lead: string; questions: string[] };
  plan: {
    kicker: string;
    title: string;
    cards: { key: 'meeting' | 'help' | 'hang'; title: string; blurb: string }[];
    /**
     * OG's Hang card opens the polls-and-ideas panel. Tech's third card is
     * HIVE Networking — tapping it arms the calendar for scheduling one,
     * the same move as the Meeting card, with no panel.
     */
    hangCardExpands: boolean;
    /**
     * What the Help card opens: OG's check-in voices and focus tally, or —
     * for a HIVE that hasn't chosen a HIVE Help yet — a short conversation
     * about whether to have one at all. No pressure; it's a choice.
     */
    helpExpansion: { kind: 'voices' } | { kind: 'conversation'; lead: string; points: string[] };
    /**
     * The "Help Focus:" composer in the calendar headers is OG's monthly-
     * focus machinery (board thread + to-do fan-out). A HIVE still deciding
     * whether it wants HIVE Help doesn't get the controls for running one.
     */
    hasHelpFocusHeader: boolean;
    /**
     * A check-in answer key whose replies are printed under the three cards.
     * Tech's Networking card doesn't open a panel, so without this the
     * networking question Nat asked for (2026-08-12: *"we'll deff want to put
     * that on the meeting checkin surveys… ask people if they know of any or
     * have any that they want to go to"*) would be collected and never shown
     * — the exact "where does this info end up" failure the hang voices two
     * hundred lines below exist to correct.
     */
    voicesUnderCards?: { answerKey: string; heading: string; empty: string };
  };
  /**
   * Answers from the pre-meeting check-in, printed on the slide that decides
   * the thing they answer.
   *
   * Nat, 2026-08-14, on Production's night: *"we can put the how often do you
   * want to meet and the HIVE Help questions in the pre-production meeting
   * survey... that information can kind of precede the meeting helper, and
   * then we can decide things."* So the room walks in already knowing where
   * everybody stands, and spends the meeting deciding rather than surveying.
   */
  checkInSays?: { slide: DeckSlideKey; heading: string; keys: { key: string; label: string }[] }[];
  wrapupReminders: string[];
};

/**
 * Production HIVE's opening jobs.
 *
 * Every one of these turns a blank on the research site into a real number.
 * They live here rather than in the database because the FIRST meeting needs
 * them on screen before anyone has typed anything — and because the questions
 * matter as much as the job does. Nat, 2026-08-14: *"it doesn't have a task
 * attached to it... it should say who's going to call, these are the questions
 * that you need to ask, and then who's getting assigned to that."*
 *
 * Once the first meeting has handed these out they are ordinary to-dos like
 * any other, and the next round of work is written by the group, not by this
 * list. This is a starting grid, not a permanent fixture.
 */
const PRODUCTION_JOBS: { key: string; title: string; why: string; asks: string[]; threadId: string }[] = [
  {
    key: 'circus-center',
    threadId: 'ac33d3c4-7a7c-47dc-b2af-54ac37d0b93f',
    title: 'Call Las Vegas Circus Center',
    why: 'They already built a rigged circus facility in a Las Vegas warehouse, under these exact codes. One call answers what a hundred property listings could not.',
    asks: [
      'What is your ceiling height, floor to lowest obstruction?',
      'What was the building before?',
      'Who engineered your rigging points, and would you use them again?',
      'Did you need a Special Use Permit, and how long did it take?',
      'What surprised you most about the buildout?',
    ],
  },
  {
    key: 'broker',
    threadId: 'fa605a5d-15ec-4e1a-a0f8-9d135d9bed79',
    title: 'Call a tenant-rep industrial broker',
    why: 'A broker can search by ceiling height, which is the one thing the public listings leave out.',
    asks: [
      'Las Vegas metro, 36 ft clear or more, under 50,000 sq ft — what exists?',
      'Can we see the broker flyers? They carry heights the web listings do not.',
      'Who handles aircraft hangars, soundstages, gyms and ice rinks?',
    ],
  },
  {
    key: 'rigging',
    threadId: 'b603855c-0376-49dc-8f2c-fcf5945a70dd',
    title: 'Get a rigging quote',
    why: 'A real number here changes the whole budget. It takes one call to get it.',
    asks: [
      'What does it cost to engineer and install points for silks, lyra and straps?',
      'Do we need a Nevada-licensed structural engineer stamp, and do you provide one?',
      'Lead time from survey to certified and load-tested?',
      'How much height do your points and the lighting grid actually eat?',
    ],
  },
  {
    key: 'insurance',
    threadId: 'b551b839-4455-4aca-8eaa-49469c6daa85',
    title: 'Call an entertainment insurance broker',
    why: 'Performers need their own cover, separate from ordinary liability — and some carriers cap the height they will insure. Worth knowing early.',
    asks: [
      'General liability plus participant accident, for an eight-person aerial show — what does it run?',
      'Do you impose a height restriction?',
      'Does the premium change if we also run daytime classes?',
    ],
  },
  {
    key: 'fire',
    threadId: 'dbb6d9ef-9f3c-4e34-ac82-c8bf4c2107ad',
    title: 'Call Clark County Fire Prevention · 702-455-7316',
    why: 'The sprinkler ruling is the largest cost in a conversion, and it turns on one official\'s reading. Get it in writing before anyone signs.',
    asks: [
      'Warehouse to theatre — does the 5,000 sq ft whole-building sprinkler rule apply?',
      'Please confirm in writing.',
      'What occupancy would you calculate for our seating plan?',
    ],
  },
  {
    key: 'notoriety',
    threadId: '9aef35af-f028-467a-abbe-60ad9a0d93ee',
    title: 'Call Notoriety · 702-243-0654',
    why: 'The cheapest way to open at all — a licensed room by the day. The Robin Leach Lounge has 30 ft ceilings.',
    asks: [
      'Spec sheet with real ceiling heights per room?',
      'What does the mandatory in-house catering cost per head?',
      'Can we rig from your ceiling, and what are the load limits?',
    ],
  },
];

const DECKS: Record<'default' | 'tech' | 'show', DeckDefinition> = {
  default: {
    slides: ['room', 'outline', 'news', 'treasurer', 'meetups', 'hummdinger', 'wrapup', 'thanks'],
    agenda: [
      { key: 'news', label: 'News from Nat' },
      { key: 'treasurer', label: 'Treasurer' },
      { key: 'meetups', label: 'Plan the Meet Ups' },
      { key: 'hummdinger', label: 'HummDinger Sesh' },
      { key: 'wrapup', label: 'Wrap-Up' },
    ],
    welcomeNudge: 'grab a plate and check in',
    treasurer: { kind: 'honeyPot', kicker: 'Cabinet Reports', title: 'Treasurer Report — Ollie' },
    plan: {
      kicker: 'Ways we gather · on the calendar',
      title: 'Plan the Meet Ups',
      cards: [
        { key: 'meeting', title: 'HIVE Meeting', blurb: 'Second Wednesday — dinner, business, and the HummDinger.' },
        { key: 'help', title: 'HIVE Help', blurb: 'Fifteen-minute favors — small asks, quick wins.' },
        { key: 'hang', title: 'HIVE Hang', blurb: 'Casual get-togethers between meetings. Anyone can host.' },
      ],
      hangCardExpands: true,
      helpExpansion: { kind: 'voices' },
      hasHelpFocusHeader: true,
    },
    wrapupReminders: [
      'Next meeting — second Wednesday of the month',
      'Newsletter lands on the 1st',
      'Dues: $25 / quarter · CashApp $HiveLV',
    ],
  },
  tech: {
    slides: ['room', 'outline', 'news', 'treasurer', 'meetups', 'hummdinger', 'wrapup', 'thanks'],
    agenda: [
      { key: 'news', label: 'News from Nat' },
      { key: 'treasurer', label: 'Treasurer' },
      { key: 'meetups', label: 'Plan' },
      { key: 'hummdinger', label: 'HummDinger Sesh' },
      { key: 'wrapup', label: 'Wrap-Up' },
    ],
    welcomeNudge: 'grab a drink and check in',
    treasurer: {
      kind: 'duesConversation',
      kicker: 'Cabinet Reports',
      title: 'Treasurer',
      lead: 'This one is ours to decide together.',
      questions: [
        'Do we want dues at all?',
        'What would dues be for?',
        'Who keeps the pot?',
      ],
    },
    plan: {
      kicker: 'Ways we gather · on the calendar',
      title: 'Plan',
      cards: [
        { key: 'meeting', title: 'HIVE Meeting', blurb: 'Second Thursday evening, monthly — built to fit around work.' },
        { key: 'help', title: 'HIVE Help', blurb: 'A small shared kindness some HIVEs take on each month.' },
        { key: 'hang', title: 'HIVE Networking', blurb: 'Get the crew in a room with new faces — schedule one right here.' },
      ],
      hangCardExpands: false,
      helpExpansion: {
        kind: 'conversation',
        lead: 'Some HIVEs pick one small act of kindness to do together each month.',
        points: [
          'Does Tech want one? Totally a choice — no pressure either way.',
          "If it's a yes, we pick the first focus together.",
        ],
      },
      hasHelpFocusHeader: false,
      voicesUnderCards: {
        answerKey: 'q_networking',
        heading: '🔗 Events on people’s radar',
        empty: 'Nothing on the radar yet — the check-in asks, and answers land here.',
      },
    },
    wrapupReminders: [
      'Next meeting — second Thursday of the month',
      'Monthly check-in — POP + what you learned, before we meet',
    ],
  },
  /**
   * Production HIVE, designed out loud by Nat on 2026-08-14 for the first
   * pre-production meeting.
   *
   * The order is hers and it is deliberately back-to-front against OG's. Her
   * words: *"normally it goes like this, but we're going to go through this
   * website first of my findings... and then that's going to help us answer a
   * lot of questions."* So News from Nat carries the research site, everyone
   * walks it together, and only THEN does the room decide cadence, whether it
   * wants a HIVE Help, whether it wants a treasurer, who goes to look at
   * venues, and who takes which job.
   *
   * Two deliberate departures from the other two decks:
   *  - No "new in the app" block on the news slide. Nat: *"we don't need new
   *    tech in the app"* — this room is about the show, not the software.
   *  - The HummDinger slide becomes `assignments`. OG and Tech spend that
   *    stretch on one person's wish; Production has one shared goal, so it
   *    spends it handing out the work.
   */
  show: {
    slides: ['room', 'outline', 'news', 'meetups', 'treasurer', 'assignments', 'wrapup', 'thanks'],
    agenda: [
      { key: 'news', label: 'News from Nat' },
      { key: 'meetups', label: 'How we run' },
      { key: 'treasurer', label: 'Honey Pot' },
      { key: 'assignments', label: 'Who takes what' },
      { key: 'wrapup', label: 'Wrap-Up' },
    ],
    welcomeNudge: 'grab a seat — this one is different',
    treasurer: {
      kind: 'duesConversation',
      kicker: 'Ours to decide',
      title: 'Honey Pot',
      lead: 'This is the conversation. Everything here is still ours to pick.',
      questions: [
        'Do we want a Honey Pot — money the five of us put in to get this moving?',
        'If yes: how much each, and what does it cover?',
        'Who wants to be treasurer?',
      ],
    },
    plan: {
      kicker: 'How this HIVE runs · ours to set tonight',
      title: 'How we run',
      cards: [
        { key: 'meeting', title: 'How often we meet', blurb: 'Weekly? Monthly? A group chat and meet when there is something to meet about? Pick it here and schedule the next one.' },
        { key: 'help', title: 'HIVE Help', blurb: 'A small shared kindness some HIVEs take on each month. Do we want one?' },
        { key: 'hang', title: 'Go see a venue', blurb: 'Notoriety, The Space, Vegas Theatre, the Henderson tent. Who is going, and when? Schedule it right here.' },
      ],
      hangCardExpands: false,
      helpExpansion: {
        kind: 'conversation',
        lead: 'Some HIVEs pick one small act of kindness to do together each month.',
        points: [
          'Does Production want one? Genuinely a choice — no pressure either way.',
          "If it's a yes, we pick the first focus together.",
        ],
      },
      hasHelpFocusHeader: false,
    },
    checkInSays: [
      {
        slide: 'meetups',
        heading: 'What everyone said before tonight',
        keys: [
          { key: 'q_cadence', label: 'How often we should meet' },
          { key: 'q_when', label: 'What day and time works' },
          { key: 'q_hive_help', label: 'HIVE Help' },
          { key: 'q_venue_visit', label: 'Which room they would go and see' },
        ],
      },
      {
        slide: 'treasurer',
        heading: 'What everyone said before tonight',
        keys: [
          { key: 'q_honey_pot', label: 'Should we have a Honey Pot' },
          { key: 'q_honey_pot_amount', label: 'What feels right to put in' },
          { key: 'q_treasurer', label: 'Who would be treasurer' },
        ],
      },
    ],
    wrapupReminders: [
      'The research lives at show-proposal.vercel.app',
      'Everything we decided tonight is on your to-do list',
    ],
  },
};

// Nat's POP formula — the backbone of the HummDinger sesh.
const POP_SECTIONS = [
  { key: 'q_pop_progress', label: 'Progress', prompt: 'credit where credit is due' },
  { key: 'q_pop_obstacles', label: 'Obstacles', prompt: 'where are you stuck?' },
  { key: 'q_pop_priorities', label: 'Priorities', prompt: "what's your focus & how can HIVE support you?" },
] as const;

// Same forgiving parser the tune-up uses — "7", "7pm", "around 7:30 PM" all work.
const normalizeEventTimeInput = (value: string) => {
  const raw = value.trim();
  if (!raw) return { time: null, note: '' };

  // Postgres hands a `time` column back as "17:30:00", and the edit form used
  // to put that straight into this box — where the old exact-match pattern
  // rejected it (it ends in an extra ":00"), fell through to the loose match,
  // and returned the WHOLE string as a "note". That note then got written into
  // the description as "Time note: 17:30:00", and because editing re-ran all of
  // this every save, a second identical line appeared each time. That is the
  // doubled "Time note: 17:30:00" with no description Nat photographed
  // (2026-08-04): both lines were generated, and they had pushed her actual
  // description out of view.
  const secondsMatch = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (secondsMatch) {
    const h = Number(secondsMatch[1]);
    const m = Number(secondsMatch[2]);
    if (h <= 23 && m <= 59) {
      return { time: `${String(h).padStart(2, '0')}:${secondsMatch[2]}`, note: '' };
    }
  }

  const exactMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  const looseMatches = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)];
  const looseMatch = looseMatches[0];
  const match = exactMatch || looseMatch;
  if (!match) return { time: null, note: raw };

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const laterMeridiem = looseMatches.find((timeMatch) => timeMatch[3])?.[3]?.toLowerCase();
  const meridiem = match[3]?.toLowerCase() ?? laterMeridiem;

  if (hour < 1 || hour > 23 || Number(minute) > 59) {
    return { time: null, note: raw };
  }

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return {
    time: `${String(hour).padStart(2, '0')}:${minute}`,
    note: exactMatch ? '' : raw,
  };
};

/** "17:30:00" -> "5:30 PM", for putting a saved time back in the box. */
const timeForEditing = (value?: string | null) => {
  if (!value) return '';
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value;
  const h24 = Number(m[1]);
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${meridiem}`;
};

/**
 * Strip the generated "Time note: …" lines back off a description.
 *
 * Without this, editing an event prepends a fresh one on top of the one already
 * there, every single time. Three edits, three lines.
 */
const withoutTimeNotes = (description?: string | null) =>
  (description ?? '')
    .split(/\n{2,}/)
    .filter((block) => !/^Time note:/i.test(block.trim()))
    .join('\n\n')
    .trim();

const POP_ALT_PHRASING =
  'Where are you · Where do you want to be · What have you tried · Where are you stuck';

type MeetingHelperNotes = {
  news?: string;
  appnews?: string;
  meetups?: string;
  wrapup?: string;
  // Where the dues conversation actually lands, typed live on the night.
  // Nat, 2026-08-12, on an all-remote Tech HIVE: *"its kinda nice to be able
  // to put things in the meeting helper in real time… what do you think
  // about me being able to type in the answers to those spaces?"*
  treasurer?: string;
  // The month's HIVE Help, written down before the meeting rather than only
  // talked about at it. Nat: *"I'd also like to be able to put text directly
  // in there, I think its at the top of the month? where i could just put
  // the help in."*
  help?: string;
};

type EditableNoteKey = keyof MeetingHelperNotes;

type DeckEvent = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  event_time: string | null;
  event_type: string;
};

type DeckWish = {
  id: string;
  title?: string | null;
  description: string;
  user_id: string;
  memberName: string;
  // Carried so the deck honours a member's starred HD instead of assuming
  // their newest one (see pickSpotlightWish).
  status?: string | null;
  is_active?: boolean | null;
  is_spotlight?: boolean | null;
};

type HangIdea = {
  id: string;
  title: string | null;
};

type GrantedWish = {
  id: string;
  title: string | null;
  description: string;
  user_id: string;
  granterNames: string[];
};

const EDIT_SLIDE_META: Record<EditableNoteKey, { title: string; placeholder: string }> = {
  news: {
    title: 'News from Nat',
    placeholder: "What's the news this month? Announcements, celebrations, house business…",
  },
  appnews: {
    title: 'App updates',
    placeholder: "What's new in the HIVE app this month? The 3 newest things to demo…",
  },
  meetups: {
    title: 'Plan the Meet Ups',
    placeholder: "This month's plans — who's hosting the hang, help requests, meeting notes…",
  },
  wrapup: {
    title: 'Wrap-Up',
    placeholder: 'Final notes, decisions made tonight, things to remember…',
  },
  treasurer: {
    title: 'Treasurer',
    placeholder: 'What did we land on? Dues or no dues, what they are for, who keeps the pot…',
  },
  help: {
    title: 'HIVE Help',
    placeholder: "This month's HIVE Help — the one small kindness we're taking on together…",
  },
};

function formatBalance(balance: number) {
  return `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MeetingHelperScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  // These live as sibling tab screens, so router.back() can't be trusted to
  // return to the launching tab — honor an explicit `from` param instead.
  const closeDeck = () => {
    // Never `router.back()` — see the note in `settings.tsx`. This file's own
    // comment already said back "can't be trusted" here; it was still the
    // fallback anyway, and the browser's history remembers the public site.
    if (from === 'admin') router.replace('/admin');
    else router.replace('/meetings');
  };
  const { communityId, communityRole, profile, session, community } = useAuth();
  const { width, height } = useWindowDimensions();
  const isTV = width >= 1400;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';

  // Which deck tonight is. Any HIVE without a designed deck falls to 'default'
  // here, but never reaches the slides — the hasTailoredCheckIns() gate below
  // shows those HIVEs (Production, for now) the coming-soon screen instead.
  // The footer says where you are: HIVE › Meetings › Meeting Helper.
  useDeepTrail([{ label: 'Meeting Helper' }]);

  const deckSlug: keyof typeof DECKS =
    community?.slug === 'tech' ? 'tech'
    : community?.slug === 'show' ? 'show'
    : 'default';
  const deck = DECKS[deckSlug];

  // The deck's palette. OG keeps its hand-tuned golds exactly; every other
  // HIVE's deck cuts the same three roles — accent, deep ink, light tint —
  // from that HIVE's own accent colour, so Tech's deck reads in Tech's blue
  // wherever OG's reads gold. The papers (PAPER/CARD/MUTED/CHARCOAL) stay
  // shared: they are the deck's stationery, and only the accent changes hands.
  const deckIsOg = deckSlug === 'default';
  const accent = hiveAccent(community);
  const GOLD = deckIsOg ? OG_GOLD : accent;
  const GOLD_DEEP = deckIsOg ? OG_GOLD_DEEP : `rgb(${mixToward(accent, 0, 0.3).join(',')})`;
  // OG's washes were mixed from a lightened gold (#dec181); other accents lift
  // the same way so their washes stay soft rather than muddy.
  const tintChannels = deckIsOg ? '222,193,129' : mixToward(accent, 255, 0.35).join(',');
  const tintWash = (alpha: number) => `rgba(${tintChannels},${alpha})`;
  const accentChannels = deckIsOg ? '189,147,72' : hexChannels(accent).join(',');
  const accentWash = (alpha: number) => `rgba(${accentChannels},${alpha})`;
  const GOLD_SOFT = tintWash(0.5);

  const [slideIndex, setSlideIndex] = useState(0);

  // Slide 1 (Welcome) and slide 2 (Who's in the room) act as the pre-meeting
  // screen, so the arrival data keeps polling while either is showing.
  const {
    loading: arrivalLoading,
    survey,
    responsePeriod,
    members,
    responsesByUser,
    nextMeeting,
    lastUpdatedAt,
    refresh: refreshArrivals,
  } = useArrivalBoard({ pollingEnabled: slideIndex <= 1 });

  // A meeting is one HIVE in one room, and a to-do jotted here lands on that
  // HIVE's lists — so "@all" is this HIVE, and the picker says its name.
  const mentionReach = useMentionReach({ reach: 'hive' });

  // Deck data — loaded once on mount, refreshed via the subtle refresh button.
  const [notes, setNotes] = useState<MeetingHelperNotes>({});
  const [events, setEvents] = useState<DeckEvent[]>([]);
  const [honeyPotBalance, setHoneyPotBalance] = useState<number | null>(null);
  const [hangIdeas, setHangIdeas] = useState<HangIdea[]>([]);
  const [wishes, setWishes] = useState<DeckWish[]>([]);
  const [grantedWishes, setGrantedWishes] = useState<GrantedWish[]>([]);
  const [pastHangs, setPastHangs] = useState<DeckEvent[]>([]);
  const [helperPosts, setHelperPosts] = useState<HangIdea[]>([]);
  const [completedAssists, setCompletedAssists] = useState<
    { id: string; description: string; assignedTo: string | null; relatedUserId: string | null; assigneeName: string }[]
  >([]);
  // Tonight's live recap for the Wrap-Up slide — because the meeting happens
  // IN the app now, the summary is just "what changed today".
  const [tonightRecap, setTonightRecap] = useState<{
    events: string[];
    todoCount: number;
    todoPeople: number;
    wishComments: number;
    granted: string[];
    threads: string[];
  } | null>(null);
  const [deckRefreshing, setDeckRefreshing] = useState(false);
  // Wrap-Up "Seal tonight's notes" — composes the live app activity into a
  // meeting record on the Meetings tab (the notes write themselves).
  const [sealState, setSealState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  // HummDinger: which member's full check-in is expanded on the bubbles grid,
  // plus everyone who's had their turn this session (feeds the agenda rail's
  // who's-left-to-go list).
  // Everything shipped since the last meeting, shown on the News slide so the
  // app update note doesn't rely on Nat remembering what we did. One meeting
  // cycle, not "the newest six" — Nat, 2026-08-12: *"Ideally this page will
  // list all of the app updates from one 1st thurs to the next."* Falls back
  // to the newest six only while the cycle start is still loading.
  const [cycleStart, setCycleStart] = useState<Date | null>(null);
  const recentAppNews = useMemo(
    () => (cycleStart ? getAppNewsSince(cycleStart) : getAppNews(6)),
    [cycleStart]
  );

  const [expandedHummdingerId, setExpandedHummdingerId] = useState<string | null>(null);
  const [hummdingerVisited, setHummdingerVisited] = useState<Set<string>>(new Set());

  // Live meeting notes typed into an expanded HummDinger card. "@name" routes
  // the note onto that member's to-do list; no @ = the expanded member's list.
  const [liveNoteDraft, setLiveNoteDraft] = useState('');
  const [liveNoteSaving, setLiveNoteSaving] = useState(false);
  const [liveNoteConfirmation, setLiveNoteConfirmation] = useState<string | null>(null);
  // Which HD the note is about. Meetings wander: someone's card is open and the
  // room starts talking about a thing that ISN'T their headline HD. We used to
  // staple every jot to the spotlight wish anyway, which sent the to-do to an
  // unrelated wish and commented there ("Sex therapy workshop" landed on
  // Charlee's dog-door HD — Nat 2026-07-26). null = not about an HD at all.
  const [liveNoteWishId, setLiveNoteWishId] = useState<string | null>(null);
  // Everything jotted this session stays visible on the card it was taken on,
  // with an ✕ that pulls it back off every list it landed on (oops insurance).
  const [liveNotesTaken, setLiveNotesTaken] = useState<
    { id: string; aboutId: string; text: string; assignees: string; actionItemIds: string[] }[]
  >([]);

  const handleUndoLiveNote = async (noteId: string) => {
    const note = liveNotesTaken.find((candidate) => candidate.id === noteId);
    if (!note) return;
    setLiveNotesTaken((notes) => notes.filter((candidate) => candidate.id !== noteId));
    if (note.actionItemIds.length > 0) {
      const { error } = await (supabase as any)
        .from('action_items')
        .delete()
        .in('id', note.actionItemIds);
      if (error) {
        console.error('Live note undo failed:', error);
        showAlert('Hmm', "Couldn't remove that one — it may need archiving from the to-do list.");
      }
    }
  };

  // Gentle timekeeper: a clock pill with time-'til-hard-out (default 8pm,
  // tap to change) and a soft per-remaining-slide pace hint — enough to say
  // "peep the time!" without anyone feeling on the clock.
  const [hardOutTime, setHardOutTime] = useState('20:00');
  const [hardOutDraft, setHardOutDraft] = useState('');
  // Evening meetings: a bare "7:45" means PM unless someone says otherwise.
  const [hardOutMeridiem, setHardOutMeridiem] = useState<'AM' | 'PM'>('PM');
  const [showHardOutEditor, setShowHardOutEditor] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setClockNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Each month's HIVE Help focus lives in that month's calendar header —
  // type it there and the "{Month} HIVE Helpers — {focus}" board thread is
  // created automatically.
  const [monthFocusDrafts, setMonthFocusDrafts] = useState<Record<string, string>>({});
  const [monthFocusSaving, setMonthFocusSaving] = useState<string | null>(null);

  // Plan mode: the top cards pick what a calendar tap schedules — a hang
  // (quick pencil-in) or a full meeting (the same scheduler as the Meetings
  // page, Meet link and all). The Help card expands instead of scheduling.
  const [planMode, setPlanMode] = useState<'hang' | 'meeting'>('hang');
  const [expandedPlanCard, setExpandedPlanCard] = useState<'hang' | 'help' | null>(null);
  // A hang idea "armed" from the What-should-we-do pills: the next calendar
  // day you tap opens the quick-add already titled with it.
  const [armedHangIdea, setArmedHangIdea] = useState<string | null>(null);
  const [meetingSchedulerDate, setMeetingSchedulerDate] = useState<string | null>(null);

  // Month pager for the Meet Ups calendars — mini arrows page the two-month
  // window without leaving the slide (the big edge arrows change slides).
  const [monthOffset, setMonthOffset] = useState(0);

  // Quick-add: tap a calendar day on Plan the Meet Ups to pencil in a hang.
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddTime, setQuickAddTime] = useState('');
  const [quickAddAudience, setQuickAddAudience] = useState<EventAudience>('members');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const loadDeckData = useCallback(async () => {
    if (!communityId) return;

    const today = getLocalIsoDate(new Date());
    const horizon = new Date();
    // Wide enough that the month pager has real data several months out.
    horizon.setDate(horizon.getDate() + 190);
    // "Since last meeting" means the ACTUAL last meeting, not a fixed 35 days.
    const sinceLastMeeting = await getCycleStart(communityId, today);
    const sinceIso = sinceLastMeeting.toISOString();
    setCycleStart(sinceLastMeeting);

    await Promise.all([
      // Admin-editable slide notes
      (async () => {
        const { data } = (await supabase
          .from('communities')
          .select('meeting_helper_notes')
          .eq('id', communityId)
          .single()) as { data: { meeting_helper_notes: MeetingHelperNotes | null } | null };
        setNotes(data?.meeting_helper_notes ?? {});
      })().catch((error) => console.warn('Could not load meeting notes', error)),

      // Meet Ups calendar: birthdays + events (incl. ongoing multi-day
      // stretches) between now and the meeting after next (~75-day horizon).
      (async () => {
        const { data } = await supabase
          .from('events')
          .select('id, title, event_date, end_date, event_time, event_type')
          .eq('community_id', communityId)
          .or(`event_date.gte.${today},end_date.gte.${today}`)
          .lte('event_date', getLocalIsoDate(horizon))
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });
        setEvents((data ?? []) as DeckEvent[]);
      })().catch((error) => console.warn('Could not load events', error)),

      // Treasurer: Honey Pot balance
      (async () => {
        const ledger = await fetchHoneyPotLedger(communityId);
        setHoneyPotBalance(ledger.balance);
      })().catch((error) => console.warn('Could not load Honey Pot', error)),

      // Meet Ups: freshest ideas from the hang board
      (async () => {
        const { data: categories } = await supabase
          .from('board_categories')
          .select('id, name, status')
          .eq('community_id', communityId)
          .ilike('name', '%hang%');
        const hangBoard = ((categories ?? []) as { id: string; status?: string | null }[])
          .find((row) => !row.status || row.status === 'active');
        if (!hangBoard) {
          setHangIdeas([]);
          return;
        }
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title')
          .eq('category_id', hangBoard.id)
          .order('created_at', { ascending: false })
          .limit(3);
        setHangIdeas((posts ?? []) as HangIdea[]);
      })().catch((error) => console.warn('Could not load hang ideas', error)),

      // Member HDs: everyone's active public wishes
      (async () => {
        const { data } = await (supabase as any)
          .from('wishes')
          .select('id, title, description, status, is_active, is_spotlight, user_id, user:profiles!user_id(id, name)')
          .eq('community_id', communityId)
          .eq('status', 'public')
          // Newest first, so a member who never starred a wish still leads with
          // their most recent one.
          .order('created_at', { ascending: false });
        const rows = ((data ?? []) as any[])
          .filter((wish) => wish.is_active !== false)
          .map((wish) => ({
            id: wish.id as string,
            title: (wish.title ?? null) as string | null,
            description: (wish.description ?? '') as string,
            user_id: wish.user_id as string,
            memberName: (wish.user?.name ?? 'Someone') as string,
            status: (wish.status ?? null) as string | null,
            is_active: (wish.is_active ?? null) as boolean | null,
            is_spotlight: (wish.is_spotlight ?? false) as boolean,
          }))
          .sort((a, b) => a.memberName.localeCompare(b.memberName));
        setWishes(rows);
      })().catch((error) => console.warn('Could not load wishes', error)),

      // Kudos: wishes granted since the last meeting (~35 days), with granters
      (async () => {
        const { data } = await (supabase as any)
          .from('wishes')
          .select('id, title, description, user_id, fulfilled_at, granters:wish_granters(granter_id, granter:profiles!granter_id(name))')
          .eq('community_id', communityId)
          .eq('status', 'fulfilled')
          .not('fulfilled_at', 'is', null)
          .gte('fulfilled_at', sinceIso)
          .order('fulfilled_at', { ascending: false })
          .limit(10);
        const rows = ((data ?? []) as any[]).map((wish) => ({
          id: wish.id as string,
          title: (wish.title ?? null) as string | null,
          description: (wish.description ?? '') as string,
          user_id: wish.user_id as string,
          granterNames: ((wish.granters ?? []) as any[])
            .map((granter) => (granter.granter?.name ? getFirstName(granter.granter.name) : null))
            .filter((name: string | null): name is string => !!name),
        }));
        setGrantedWishes(rows);
      })().catch((error) => console.warn('Could not load granted wishes', error)),

      // Wrap-Up: everything that changed in the app since this morning —
      // the meeting's real-time edits ARE the meeting notes.
      (async () => {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const sinceToday = dayStart.toISOString();
        const [eventsRes, todosRes, commentsRes, grantedRes, threadsRes] = await Promise.all([
          supabase.from('events').select('title').eq('community_id', communityId).gte('created_at', sinceToday),
          supabase.from('action_items').select('assigned_to').eq('community_id', communityId).gte('created_at', sinceToday),
          (supabase as any).from('wish_comments').select('id').eq('community_id', communityId).gte('created_at', sinceToday),
          (supabase as any).from('wishes').select('title, description').eq('community_id', communityId).eq('status', 'fulfilled').gte('fulfilled_at', sinceToday),
          (supabase as any).from('board_posts').select('title').eq('community_id', communityId).gte('created_at', sinceToday),
        ]);
        const todoRows = (todosRes.data ?? []) as { assigned_to: string | null }[];
        setTonightRecap({
          events: ((eventsRes.data ?? []) as { title: string }[]).map((row) => row.title),
          todoCount: todoRows.length,
          todoPeople: new Set(todoRows.map((row) => row.assigned_to).filter(Boolean)).size,
          wishComments: ((commentsRes.data ?? []) as unknown[]).length,
          granted: ((grantedRes.data ?? []) as { title: string | null; description: string }[]).map(
            (row) => (row.title ?? row.description).slice(0, 60)
          ),
          threads: ((threadsRes.data ?? []) as { title: string | null }[]).map((row) => row.title ?? '').filter(Boolean),
        });
      })().catch((error) => console.warn('Could not load tonight recap', error)),

      // The cycle's hangs — meeting to meeting, NOT "up to today". The deck is
      // shown ON meeting night, by which point a hang scheduled for last week
      // has happened; capping at today meant a cycle with hangs still ahead of
      // it read "no hangs last cycle — blank scoreboard" (Nat 2026-07-25).
      // Same window the tune-up's rating cards use, so the two agree.
      (async () => {
        const { data: nextMeetingRows } = await supabase
          .from('events')
          .select('event_date')
          .eq('community_id', communityId)
          .eq('event_type', 'meeting')
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(1);
        const cycleEnd = new Date();
        cycleEnd.setDate(cycleEnd.getDate() + 35);
        const until = (nextMeetingRows?.[0] as { event_date?: string } | undefined)?.event_date
          ?? getLocalIsoDate(cycleEnd);

        const { data } = await supabase
          .from('events')
          .select('id, title, event_date, end_date, event_type')
          .eq('community_id', communityId)
          .gte('event_date', getLocalIsoDate(sinceLastMeeting))
          .lte('event_date', until)
          .neq('event_type', 'meeting')
          .neq('event_type', 'birthday')
          .order('event_date', { ascending: true });
        const hangs = ((data ?? []) as DeckEvent[]).filter(
          (event) => !(event.end_date || /\b(out of town|away|trip|travel|galavant)/i.test(event.title))
        );
        setPastHangs(hangs);
      })().catch((error) => console.warn('Could not load past hangs', error)),

      // HummDinger assists: to-dos completed since ~last meeting, with names,
      // so help given and received is on-screen during each member's HD moment
      // (the "we filmed Charlee's aerial straps act!" that June-vs-July brains
      // forget by meeting night).
      (async () => {
        const { data } = await (supabase as any)
          .from('action_items')
          .select('id, description, completed_at, assigned_to, related_user_id, assignee:profiles!assigned_to(name)')
          .eq('community_id', communityId)
          .eq('completed', true)
          // Archiving a to-do is how you say "this doesn't belong on my list" —
          // it shouldn't then reappear on the deck as something you checked off
          // (Nat 2026-07-24).
          .is('archived_at', null)
          .gte('completed_at', sinceIso)
          .order('completed_at', { ascending: false })
          .limit(60);
        setCompletedAssists(((data ?? []) as any[]).map((row) => ({
          id: row.id as string,
          description: row.description as string,
          assignedTo: (row.assigned_to ?? null) as string | null,
          relatedUserId: (row.related_user_id ?? null) as string | null,
          assigneeName: (row.assignee?.name ?? 'Someone') as string,
        })));
      })().catch((error) => console.warn('Could not load assists', error)),

      // Live notes jotted on the HummDinger spotlight. These used to live in
      // component state only, so the list under each member vanished on reload
      // even though the to-dos themselves were saved (Nat 2026-07-24: "I want
      // those to stay there"). One jot fans out to one action_item per
      // assignee, so regroup by who-it's-about + the text with the routing
      // suffix stripped, which reconstructs the note exactly as it was typed.
      (async () => {
        const { data } = await (supabase as any)
          .from('action_items')
          .select('id, description, assigned_to, related_user_id, created_at, assignee:profiles!assigned_to(name)')
          .eq('community_id', communityId)
          .not('related_user_id', 'is', null)
          .is('archived_at', null)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })
          .limit(200);

        const grouped = new Map<string, { id: string; aboutId: string; text: string; names: string[]; actionItemIds: string[] }>();
        ((data ?? []) as any[]).forEach((row) => {
          const aboutId = row.related_user_id as string;
          const text = parseActionItemDescription(row.description as string).text;
          const key = `${aboutId}::${text}`;
          const entry = grouped.get(key) ?? { id: key, aboutId, text, names: [], actionItemIds: [] };
          entry.names.push(getFirstName((row.assignee?.name ?? 'Someone') as string));
          entry.actionItemIds.push(row.id as string);
          grouped.set(key, entry);
        });

        setLiveNotesTaken(Array.from(grouped.values()).map((entry) => ({
          id: entry.id,
          aboutId: entry.aboutId,
          text: entry.text,
          assignees: entry.names.length > 3 ? `everyone (${entry.names.length})` : entry.names.join(' & '),
          actionItemIds: entry.actionItemIds,
        })));
      })().catch((error) => console.warn('Could not load live notes', error)),

      // Kudos: recent 15-min helper posts from the helper log board
      (async () => {
        const { data: categories } = await supabase
          .from('board_categories')
          .select('id, name, status')
          .eq('community_id', communityId)
          .or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%');
        const helperBoard = ((categories ?? []) as { id: string; status?: string | null }[])
          .find((row) => !row.status || row.status === 'active');
        if (!helperBoard) {
          setHelperPosts([]);
          return;
        }
        const { data: posts } = await supabase
          .from('board_posts')
          .select('id, title')
          .eq('category_id', helperBoard.id)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(6);
        setHelperPosts((posts ?? []) as HangIdea[]);
      })().catch((error) => console.warn('Could not load helper posts', error)),
    ]);
  }, [communityId]);

  useEffect(() => {
    void loadDeckData();
  }, [loadDeckData]);

  const refreshDeck = useCallback(async () => {
    if (deckRefreshing) return;
    setDeckRefreshing(true);
    try {
      await Promise.all([loadDeckData(), refreshArrivals()]);
    } finally {
      setDeckRefreshing(false);
    }
  }, [deckRefreshing, loadDeckData, refreshArrivals]);

  // Go-around order: Nat leads by example (her call, 2026-07-24 — she used to
  // sit wherever the sort put her), then the absentees right after (the torch
  // gets carried for whoever can't speak for themselves — everyone stays on
  // the HD board even when they miss), then present checked-in members in
  // submit order (a different voice order each month), then the rest who
  // haven't checked in.
  const memberOrder = useMemo(() => {
    const leader = members.find((member) => getFirstName(member.name).toLowerCase() === 'nat');
    const others = members.filter((member) => member.id !== leader?.id);
    const bySubmitTime = (a: ArrivalBoardMember, b: ArrivalBoardMember) => {
      const aTime = responsesByUser.get(a.id)?.submitted_at ?? '';
      const bTime = responsesByUser.get(b.id)?.submitted_at ?? '';
      return aTime.localeCompare(bTime);
    };
    const checkedIn = others.filter((member) => responsesByUser.has(member.id)).sort(bySubmitTime);
    const absent = checkedIn.filter((member) => getAttendance(responsesByUser.get(member.id)) === 'missing');
    const present = checkedIn.filter((member) => getAttendance(responsesByUser.get(member.id)) !== 'missing');
    const notYet = others.filter((member) => !responsesByUser.has(member.id));
    return [...(leader ? [leader] : []), ...absent, ...present, ...notYet];
  }, [members, responsesByUser]);

  const wishesByUserId = useMemo(() => {
    const grouped = new Map<string, DeckWish[]>();
    wishes.forEach((wish) => {
      const list = grouped.get(wish.user_id) ?? [];
      list.push(wish);
      grouped.set(wish.user_id, list);
    });
    return grouped;
  }, [wishes]);

  // Opening someone's card preselects their spotlight HD — the common case, so
  // the fast path stays one keystroke. Keyed on the member, not on the wish
  // list, or a background deck refresh would throw away a pick made mid-jot.
  const liveNoteSubjectMemberRef = useRef<string | null>(null);
  useEffect(() => {
    if (!expandedHummdingerId) {
      liveNoteSubjectMemberRef.current = null;
      return;
    }
    if (liveNoteSubjectMemberRef.current === expandedHummdingerId) return;
    liveNoteSubjectMemberRef.current = expandedHummdingerId;
    const memberWishes = wishesByUserId.get(expandedHummdingerId) ?? [];
    setLiveNoteWishId((pickSpotlightWish(memberWishes) ?? memberWishes[0])?.id ?? null);
  }, [expandedHummdingerId, wishesByUserId]);

  // Pencil in a hang straight from the Plan the Meet Ups calendar — same
  // create path as the tune-up and Home (the create-event edge function).
  const handleQuickAddEvent = async () => {
    if (!quickAddDate || !communityId || quickAddSaving) return;
    if (!quickAddTitle.trim()) {
      setQuickAddError('Give it a name — "Pool hang" works great.');
      return;
    }
    const normalizedTime = normalizeEventTimeInput(quickAddTime);
    if (quickAddTime.trim() && !normalizedTime.time) {
      setQuickAddError('For time, try something like 2:30 PM.');
      return;
    }

    setQuickAddSaving(true);
    setQuickAddError(null);
    try {
      const newEvent: Record<string, string | null> = {
        title: quickAddTitle.trim(),
        event_date: quickAddDate,
        community_id: communityId,
      };
      if (normalizedTime.time) newEvent.event_time = normalizedTime.time;
      if (normalizedTime.note) newEvent.description = `Time note: ${normalizedTime.note}`;
      newEvent.visibility = quickAddAudience;
      // One question here, so it answers both — see admin.tsx and migration 148.
      (newEvent as Record<string, unknown>).invited_scope = quickAddAudience;

      const { error } = await supabase.functions.invoke('create-event', { body: newEvent });
      if (error) throw error;

      setQuickAddDate(null);
      setQuickAddTitle('');
      setQuickAddTime('');
      setQuickAddAudience('members');
      // The idea has been claimed — disarm so the next day you tap starts fresh.
      setArmedHangIdea(null);
      await loadDeckData();
    } catch (error: any) {
      setQuickAddError(error?.message || 'Could not save the event — please try again.');
    } finally {
      setQuickAddSaving(false);
    }
  };

  // Same wiring as the Meetings page's Schedule button.
  const handleScheduleMeetingFromDeck = async (data: {
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    attendeeIds: string[];
    timezone: string;
    location?: string;
  }) => {
    if (!communityId || !session?.access_token) {
      throw new Error('Not authenticated');
    }
    const response = await supabase.functions.invoke('schedule-meeting', {
      body: { ...data, communityId },
    });
    if (response.error) {
      let errorMsg = 'Failed to schedule meeting';
      try {
        const ctx = (response.error as any).context;
        if (ctx instanceof Response) {
          const body = await ctx.json();
          errorMsg = body?.error || errorMsg;
        }
      } catch { /* fall through */ }
      if (errorMsg === 'Failed to schedule meeting') {
        errorMsg = response.error.message || errorMsg;
      }
      throw new Error(errorMsg);
    }
    await loadDeckData();
  };

  const handlePostHelpFocus = async (monthLabel: string) => {
    const focus = (monthFocusDrafts[monthLabel] ?? '').trim();
    if (!focus || !communityId || !profile || monthFocusSaving) return;
    setMonthFocusSaving(monthLabel);
    try {
      const { data: categories } = await supabase
        .from('board_categories')
        .select('id, name, status')
        .eq('community_id', communityId)
        .or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%');
      const helperBoard = ((categories ?? []) as { id: string; status?: string | null }[])
        .find((row) => !row.status || row.status === 'active');
      if (!helperBoard) throw new Error('No HIVE Help board found');

      const { error } = await (supabase as any).from('board_posts').insert({
        community_id: communityId,
        category_id: helperBoard.id,
        author_id: profile.id,
        title: `${monthLabel} HIVE Help — ${focus}`,
        content: `${monthLabel}'s HIVE Help focus: ${focus}\n\n(Decided together at the meeting — log your helps in this thread!)`,
      });
      if (error) throw error;

      // The focus lands on everyone's to-do list too (Nat: the donation
      // reminder should populate for the whole HIVE, not just the check-in).
      if (members.length > 0) {
        const monthMeeting = events.find(
          (event) => event.event_type === 'meeting'
            && new Date(`${event.event_date}T12:00:00`).toLocaleString('en-US', { month: 'long' }) === monthLabel
        );

        // One live focus at a time. Every earlier focus's still-open to-do
        // gets retired now, or they stack up on people's lists forever —
        // July's "Pay it behind" was still sitting there in August (Nat
        // 2026-07-24: "this is old news"). Finished ones keep their check.
        const { error: retireError } = await (supabase as any)
          .from('action_items')
          .update({ archived_at: new Date().toISOString() })
          .eq('community_id', communityId)
          .ilike('description', 'HIVE Help:%')
          .eq('completed', false)
          .is('archived_at', null);
        if (retireError) console.warn('Could not retire the previous focus to-dos:', retireError);

        const { error: fanError } = await (supabase as any).from('action_items').insert(
          members.map((member) => ({
            community_id: communityId,
            assigned_to: member.id,
            // Not every focus is a thing you carry in: "pay it behind" happens
            // in a drive-through, "pick up trash" happens on a walk. The nudge
            // has to fit an ACT, not just a donation (Nat 2026-07-24).
            description: `HIVE Help: ${focus} — however you pull it off, log it by the ${monthLabel} meeting`,
            due_date: monthMeeting?.event_date ?? null,
          }))
        );
        if (fanError) console.warn('Focus to-do fan-out skipped:', fanError);
      }

      setMonthFocusDrafts((drafts) => ({ ...drafts, [monthLabel]: '' }));
      await loadDeckData();
    } catch (error) {
      console.error('Could not post HIVE Help focus:', error);
      showAlert('Hmm', 'Could not post the new focus — try again, or use the Boards tab.');
    } finally {
      setMonthFocusSaving(null);
    }
  };

  // Production's job hand-out. Same mechanism as the HummDinger jots below —
  // @-mention a member and it lands on their to-do list — but the subject is a
  // job rather than a person's wish, so there is no `related_user_id` and no
  // "(re: someone's HummDinger)" suffix to add.
  //
  // Nat, 2026-08-14, describing exactly this: *"I could at each person... I'd
  // be like @Charlee and that would go onto her to-do list, and I could be like
  // @Ollie and that would go onto his to-do list."*
  const [openJobKey, setOpenJobKey] = useState<string | null>(null);
  const [jobDrafts, setJobDrafts] = useState<Record<string, string>>({});
  const [jobSaving, setJobSaving] = useState<string | null>(null);
  const [jobsAssigned, setJobsAssigned] = useState<Record<string, string>>({});

  const handleAssignJob = async (job: { key: string; title: string; asks: string[]; threadId: string }) => {
    const typed = (jobDrafts[job.key] ?? '').trim();
    if (!communityId || jobSaving) return;

    const mentioned = hasBroadcastMention(typed)
      ? members
      : getMentionedMembers(typed, members, undefined, mentionReach);
    if (mentioned.length === 0) {
      showAlert('Who is taking it?', 'Type @ and their name — that is what puts it on their list.');
      return;
    }

    setJobSaving(job.key);
    try {
      // The questions ride along in the to-do itself. A job that arrives
      // without them is the exact thing Nat said was useless: "Notoriety spec
      // sheet — and you're like, okay, what do I do with that?"
      const questions = job.asks.map((ask) => `  · ${ask}`).join('\n');
      const extra = typed.replace(/@[\w.-]+/g, '').trim();
      const description = `${job.title}${extra ? ` — ${extra}` : ''}\n${questions}`;

      const { error } = await (supabase as any).from('action_items').insert(
        mentioned.map((member) => ({
          description,
          assigned_to: member.id,
          community_id: communityId,
          // The to-do opens the Pre-Production thread that holds the brief and
          // collects what they find out — Nat's design, 2026-08-14.
          related_board_post_id: job.threadId,
        }))
      );
      if (error) throw error;

      const names = mentioned.map((member) => getFirstName(member.name)).join(' & ');
      setJobsAssigned((prev) => ({ ...prev, [job.key]: names }));
      setJobDrafts((drafts) => ({ ...drafts, [job.key]: '' }));
      setOpenJobKey(null);
      await loadDeckData();
    } catch (error) {
      console.error('Could not hand out the job:', error);
      showAlert('Hmm', 'That did not save — try again in a moment.');
    } finally {
      setJobSaving(null);
    }
  };

  // Live meeting notes from the HummDinger spotlight. Mentions use the same
  // rules as the boards — "@charlee" targets her list, "@all"/"@hive" fans
  // out to everyone, no @ lands on whoever's card is open.
  const handleSaveLiveNote = async (
    aboutMember: { id: string; name: string },
    aboutWishId?: string | null
  ) => {
    const text = liveNoteDraft.trim();
    if (!text || !communityId || liveNoteSaving) return;

    // "@all" from someone's card = the note is about helping THEM, so it
    // lands on everyone else's list — not the subject's own.
    const targets = hasBroadcastMention(text)
      ? members.filter((member) => member.id !== aboutMember.id)
      : getMentionedMembers(text, members, undefined, mentionReach);
    const assignees = targets.length > 0
      ? members.filter((member) => targets.some((target) => target.id === member.id))
      : members.filter((member) => member.id === aboutMember.id);
    if (assignees.length === 0) return;

    setLiveNoteSaving(true);
    try {
      const { data: inserted, error } = await (supabase as any)
        .from('action_items')
        .insert(
          assignees.map((member) => ({
            // "re: X's HummDinger" is a claim, so only make it when the note is
            // actually pinned to one of X's HDs. Otherwise it's still about X —
            // just not about a wish — and the suffix says only that.
            description:
              member.id === aboutMember.id
                ? text
                : aboutWishId
                  ? `${text} (re: ${getFirstName(aboutMember.name)}'s HummDinger)`
                  : `${text} (re: ${getFirstName(aboutMember.name)})`,
            assigned_to: member.id,
            community_id: communityId,
            related_user_id: aboutMember.id,
            // Deep link: tapping the to-do soft-opens the wish it's about —
            // the visual thread from someone's list back to the HD it serves.
            related_wish_id: aboutWishId ?? null,
          }))
        )
        .select('id');
      if (error) throw error;
      // The note is really a comment on the wish — leave it there too, so
      // tapping any of the to-dos lands on the wish with the note in context
      // and people can reply right on it.
      if (aboutWishId && profile) {
        // Jots are written live during the meeting, so "the meeting" is
        // whichever month it is right now (not the survey period, which
        // already points at the NEXT meeting).
        const meetingMonth = new Date().toLocaleString('en-US', { month: 'long' });
        const { error: commentError } = await (supabase as any).from('wish_comments').insert({
          wish_id: aboutWishId,
          user_id: profile.id,
          community_id: communityId,
          content: `📝 From the ${meetingMonth} meeting: ${text}`,
        });
        if (commentError) console.warn('Wish comment skipped (non-blocking):', commentError);
      }

      const assigneesLabel = assignees.length > 3
        ? `everyone (${assignees.length})`
        : assignees.map((member) => getFirstName(member.name)).join(' & ');
      setLiveNoteConfirmation(`On ${assigneesLabel}'s list ✓`);
      // Same key the reload builds, so a note doesn't double up when the deck
      // refreshes underneath you.
      const noteKey = `${aboutMember.id}::${text}`;
      setLiveNotesTaken((notes) => [
        ...notes.filter((note) => note.id !== noteKey),
        {
          id: noteKey,
          aboutId: aboutMember.id,
          text,
          assignees: assigneesLabel,
          actionItemIds: ((inserted ?? []) as { id: string }[]).map((row) => row.id),
        },
      ]);
      setLiveNoteDraft('');
    } catch (error) {
      console.error('Live note save failed:', error);
      setLiveNoteConfirmation('Could not save that note — try again.');
    } finally {
      setLiveNoteSaving(false);
    }
  };

  // ---- Editable notes (admin-only writes) ----
  const [editKey, setEditKey] = useState<EditableNoteKey | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const openNoteEditor = useCallback((key: EditableNoteKey) => {
    setEditDraft(notes[key] ?? '');
    setEditKey(key);
  }, [notes]);

  const saveNote = useCallback(async () => {
    if (!communityId || !editKey || savingNote) return;
    setSavingNote(true);
    const nextNotes: MeetingHelperNotes = { ...notes, [editKey]: editDraft.trim() };
    const { error } = await (supabase.from('communities') as any)
      .update({ meeting_helper_notes: nextNotes })
      .eq('id', communityId);
    setSavingNote(false);
    if (error) {
      console.warn('Could not save meeting note', error);
      showAlert('Could not save', 'Please try again in a moment.');
      return;
    }
    setNotes(nextNotes);
    setEditKey(null);
  }, [communityId, editDraft, editKey, notes, savingNote]);

  // ---- Sizing helpers ----
  const sz = useCallback((tv: number, small: number) => (isTV ? tv : small), [isTV]);
  const contentPadH = sz(150, 44);
  // Trimmed 2026-08-11 (were 72/36 and 96/72): Nat — "I have to scroll just
  // the tiniest bit and that drives me nuts." The footer overlay is ~48px
  // tall, so the bottom pad only needs to clear that, and the top pad was
  // pure air. Checked against ~1440x900 (the TV branch starts at 1400) and
  // ~1280x800 laptop viewports.
  const contentPadTop = sz(44, 26);
  const contentPadBottom = sz(56, 44);

  const monthName = getMonthNameFromPeriod(responsePeriod);
  const periodMatch = (responsePeriod ?? '').match(/^(\d{4})-(\d{2})$/);
  const meetingYear = periodMatch ? periodMatch[1] : String(new Date().getFullYear());
  const meetingLine = formatMeetingDate(nextMeeting)
    || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const checkedInCount = members.filter((member) => responsesByUser.has(member.id)).length;

  // ---- Small presentational pieces ----
  const Kicker = useCallback(({ children }: { children: string }) => (
    <Text
      style={{
        fontFamily: 'Lato_700Bold',
        fontSize: sz(18, 12),
        letterSpacing: sz(4, 2.5),
        textTransform: 'uppercase',
        color: GOLD,
        marginBottom: sz(14, 8),
      }}
    >
      {children}
    </Text>
  ), [sz, GOLD]);

  const SlideTitle = useCallback(({ children }: { children: string }) => (
    <Text
      style={{
        fontFamily: 'LibreBaskerville_700Bold',
        fontSize: sz(58, 30),
        lineHeight: sz(72, 40),
        color: CHARCOAL,
      }}
    >
      {children}
    </Text>
  ), [sz]);

  const EmptyNote = useCallback(({ children }: { children: React.ReactNode }) => (
    <Text
      style={{
        fontFamily: 'Lato_400Regular',
        fontStyle: 'italic',
        fontSize: sz(24, 15),
        lineHeight: sz(36, 23),
        color: MUTED,
      }}
    >
      {children}
    </Text>
  ), [sz]);

  const EditPill = useCallback(({ noteKey }: { noteKey: EditableNoteKey }) => {
    if (!isAdmin) return null;
    return (
      <EditButton
        onPress={() => openNoteEditor(noteKey)}
        size={sz(34, 26)}
        accessibilityLabel={`Edit ${noteKey === 'meetups' ? deck.plan.title : EDIT_SLIDE_META[noteKey].title}`}
      />
    );
  }, [isAdmin, openNoteEditor, sz, deck.plan.title]);

  const NoteBody = useCallback(({ noteKey, emptyText }: { noteKey: EditableNoteKey; emptyText: string }) => {
    const value = (notes[noteKey] ?? '').trim();
    if (!value) return <EmptyNote>{emptyText}</EmptyNote>;
    return (
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontSize: sz(20, 14),
          lineHeight: sz(31, 21),
          color: 'rgba(49,49,48,0.87)',
        }}
      >
        {value}
      </Text>
    );
  }, [EmptyNote, notes, sz]);

  const handleSealMeeting = async () => {
    if (!communityId || sealState === 'saving' || sealState === 'done') return;
    setSealState('saving');
    try {
      const { data, error } = await supabase.functions.invoke('seal-meeting', {
        body: { communityId, date: getLocalIsoDate(new Date()) },
      });
      if (error) throw error;
      if (!data?.sealed) throw new Error(data?.reason ?? 'Nothing to seal yet');
      setSealState('done');
    } catch (error) {
      console.warn('Seal meeting failed', error);
      setSealState('error');
    }
  };

  // ---- Slides ----
  // Welcome + Room merged (Lucas: this is the slide up as people arrive, and
  // the date/time header doubles as the "oops, wrong day!" check).
  const roomColumns = isTV ? 5 : width >= 1024 ? 4 : width >= 760 ? 3 : width >= 480 ? 2 : 1;
  const renderRoom = () => (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', marginBottom: sz(24, 14) }}>
        {/* Crest + title mirror the timekeeper clock's lockup: a big mark
            with the words tucked right underneath. Was 300/150 — the crest
            was the single biggest reason this slide overflowed a laptop
            screen by a hair (the one-page rule, 2026-08-11). */}
        <Image
          source={hiveBee}
          style={{ width: sz(230, 130), height: sz(230, 130) }}
          contentFit="contain"
        />
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: sz(58, 28),
            lineHeight: sz(70, 36),
            color: CHARCOAL,
            textAlign: 'center',
            marginTop: sz(-16, -8),
          }}
        >
          {monthName} {meetingYear} Meeting
        </Text>
        {meetingLine ? (
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(30, 16), color: GOLD_DEEP, marginTop: sz(10, 6), textAlign: 'center' }}>
            {meetingLine}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sz(8, 5), marginTop: sz(8, 5) }}>
          <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(23, 13), color: MUTED, textAlign: 'center' }}>
            {deck.welcomeNudge}
          </Text>
          <Text style={{ fontSize: sz(22, 13) }}>🍯</Text>
        </View>
        {survey ? (
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), color: MUTED, marginTop: sz(10, 6) }}>
            {checkedInCount} of {members.length} checked in{lastUpdatedAt ? '  ·  live' : ''}
          </Text>
        ) : null}
      </View>
      {arrivalLoading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ThinkingBee />
        </View>
      ) : !survey ? (
        <EmptyNote>
          No monthly check-in is live right now — once one opens, arrivals will glow here.
        </EmptyNote>
      ) : (
        <View>
          {(() => {
            const remote = members.filter((member) => getAttendance(responsesByUser.get(member.id)) === 'remote');
            const missing = members.filter((member) => getAttendance(responsesByUser.get(member.id)) === 'missing');
            if (remote.length === 0 && missing.length === 0) return null;
            const parts = [
              remote.length > 0
                ? `💻 Zooming in: ${remote.map((member) => getFirstName(member.name)).join(', ')} — fire up the Meet`
                : null,
              missing.length > 0
                ? `😢 Missing tonight: ${missing.map((member) => getFirstName(member.name)).join(', ')}`
                : null,
            ].filter(Boolean);
            return (
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), color: GOLD_DEEP, marginBottom: sz(12, 8) }}>
                {parts.join('   ·   ')}
              </Text>
            );
          })()}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5) }}>
          {getCheckInOrder(members, responsesByUser).map((member) => (
            <View key={member.id} style={{ width: `${100 / roomColumns}%`, padding: sz(8, 5) }}>
              <ArrivalMemberCard
                member={member}
                response={responsesByUser.get(member.id)}
                isTV={isTV}
                compact
              />
            </View>
          ))}
        </View>
        </View>
      )}
    </View>
  );

  const renderOutline = () => (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: sz(40, 16) }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Kicker>Tonight</Kicker>
        <SlideTitle>Outline</SlideTitle>
        <View style={{ marginTop: sz(40, 22), gap: sz(20, 12) }}>
          {deck.agenda.map((item, index) => (
            <View key={item.key} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(24, 14) }}>
              <Text
                style={{
                  fontFamily: 'LibreBaskerville_700Bold',
                  fontSize: sz(30, 17),
                  color: GOLD,
                  width: sz(48, 28),
                  textAlign: 'right',
                }}
              >
                {index + 1}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(34, 19), color: CHARCOAL }}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {/* The full HIVE crest gets its giant moment here (square frame — the
          arrivals slide squished it into a rectangle). */}
      {width >= 900 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={hiveLogo}
            style={{ width: sz(520, 300), height: sz(520, 300) }}
            contentFit="contain"
          />
        </View>
      ) : null}
    </View>
  );

  // Slim by design (Lucas): the news + app updates live here; hang and help
  // recaps moved to Plan the Meet Ups where the scheduling happens, and
  // wishes granted are each member's own HummDinger story.
  const renderNews = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(30, 18) }}>
        <View>
          <Kicker>{deckSlug === 'show' ? 'Tonight · a different shape' : 'Tonight · house business'}</Kicker>
          <SlideTitle>News from Nat</SlideTitle>
        </View>
      </View>
      {/* Home-page vibes (Lucas): tighter paper cards, quiet labels, body
          text that reads instead of shouting. */}
      <View style={{ gap: sz(14, 9), maxWidth: sz(940, 640) }}>
        {/* Production's night starts by walking the research together, and the
            rest of the deck answers itself afterwards. Nat, 2026-08-14:
            *"normally it goes like this, but we're going to go through this
            website first of my findings... and then that's going to help us
            answer a lot of questions."* */}
        {deckSlug === 'show' && (
          <View
            style={{
              backgroundColor: '#fffdf5',
              borderWidth: 2,
              borderColor: GOLD,
              borderRadius: sz(16, 12),
              paddingHorizontal: sz(20, 13),
              paddingVertical: sz(16, 11),
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), letterSpacing: 1.4, textTransform: 'uppercase', color: '#8e7a5e', marginBottom: sz(8, 5) }}>
              🎪 Start here — the research
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(22, 14), lineHeight: sz(34, 21), color: CHARCOAL }}>
              Tonight runs differently from a usual HIVE meeting. We walk through everything
              found so far, and then the rest of the questions answer themselves.
            </Text>
            <Pressable
              onPress={() => Linking.openURL('https://show-proposal.vercel.app')}
              accessibilityRole="link"
              accessibilityLabel="Open the research site"
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                marginTop: sz(14, 10),
                backgroundColor: GOLD,
                borderRadius: 999,
                paddingHorizontal: sz(26, 18),
                paddingVertical: sz(12, 9),
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(21, 14), color: '#fff' }}>
                Open the research →
              </Text>
            </Pressable>
          </View>
        )}
        <View
          style={{
            backgroundColor: '#fffdf5',
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: sz(16, 12),
            paddingHorizontal: sz(20, 13),
            paddingVertical: sz(15, 10),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sz(8, 5) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), letterSpacing: 1.4, textTransform: 'uppercase', color: '#8e7a5e' }}>
              📣 The news
            </Text>
            <EditPill noteKey="news" />
          </View>
          <NoteBody
            noteKey="news"
            emptyText={deckSlug === 'show' ? '' : "Nat hasn't dropped the news yet — drumroll, please."}
          />
        </View>
        {/* Production skips this card. Nat, 2026-08-14: *"news from Nat, new in
            the app — we don't need new tech in the app."* That room is about the
            show, not the software carrying it. */}
        {deckSlug !== 'show' && (
        <View
          style={{
            backgroundColor: '#fdf3dc',
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: sz(16, 12),
            paddingHorizontal: sz(20, 13),
            paddingVertical: sz(15, 10),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sz(8, 5) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), letterSpacing: 1.4, textTransform: 'uppercase', color: '#8e7a5e' }}>
              ✨ New in the app since last meeting
            </Text>
            <EditPill noteKey="appnews" />
          </View>
          {/* The empty line only speaks when the slide really is empty. It used
              to say "No app news this month — smooth sailing" directly above a
              list of app news, because it was reporting on Nat's typed note and
              the list underneath came from somewhere else. Nat, 2026-08-12:
              *"it says 'no app news, smooth sailing' and then below it its
              listing app news, whcih seems silly."* Two claims, one slide —
              now the shipped list answers for both. */}
          {notes.appnews?.trim() || recentAppNews.length === 0 ? (
            <NoteBody
              noteKey="appnews"
              emptyText="No app news this cycle — smooth sailing."
            />
          ) : null}
          {recentAppNews.length > 0 ? (
            <View style={{ marginTop: notes.appnews?.trim() ? sz(10, 7) : 0, borderTopWidth: notes.appnews?.trim() ? 1 : 0, borderTopColor: GOLD_SOFT, paddingTop: notes.appnews?.trim() ? sz(9, 6) : 0, gap: sz(3, 2) }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(11, 9), letterSpacing: 1.2, textTransform: 'uppercase', color: MUTED }}>
                Shipped this cycle
              </Text>
              {recentAppNews.map((entry) => (
                <Text key={entry.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 10), lineHeight: sz(19, 14), color: MUTED }}>
                  · {entry.title}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        )}
      </View>
    </View>
  );

  /**
   * "What everyone said before tonight" — the pre-meeting check-in, printed on
   * the slide that decides the thing it asked about.
   *
   * Choice answers are tallied, because four people picking "monthly" is a
   * decision that has already made itself and the room only has to notice.
   * Written answers are quoted with a name on them, because a day-and-time
   * answer is only useful if you know whose it is.
   */
  const renderCheckInSays = (slide: DeckSlideKey) => {
    const blocks = (deck.checkInSays ?? []).filter((entry) => entry.slide === slide);
    if (blocks.length === 0) return null;

    const answersFor = (key: string) =>
      members
        .map((member) => ({
          name: getFirstName(member.name),
          text: getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, key).trim(),
        }))
        .filter((row) => !!row.text);

    return (
      <>
        {blocks.map((entry) => {
          const rows = entry.keys
            .map((q) => ({ ...q, answers: answersFor(q.key) }))
            .filter((q) => q.answers.length > 0);
          if (rows.length === 0) return null;
          return (
            <View
              key={entry.slide + entry.heading}
              style={{
                marginTop: sz(18, 12),
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: sz(18, 14),
                paddingHorizontal: sz(22, 14),
                paddingVertical: sz(16, 11),
                gap: sz(12, 8),
              }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), letterSpacing: 2, textTransform: 'uppercase', color: GOLD_DEEP }}>
                {entry.heading}
              </Text>
              {rows.map((q) => {
                // Tally identical answers; anything unique keeps its name.
                const counts = new Map<string, string[]>();
                q.answers.forEach((row) => {
                  counts.set(row.text, [...(counts.get(row.text) ?? []), row.name]);
                });
                const tallied = Array.from(counts.entries()).sort((a, b) => b[1].length - a[1].length);
                return (
                  <View key={q.key} style={{ gap: sz(4, 3) }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 13), color: MUTED }}>
                      {q.label}
                    </Text>
                    {tallied.map(([answer, who]) => (
                      <Text
                        key={answer}
                        style={{ fontFamily: 'Lato_400Regular', fontSize: sz(22, 14), lineHeight: sz(32, 20), color: CHARCOAL }}
                      >
                        {answer}
                        <Text style={{ color: MUTED }}>
                          {'  '}{who.length > 1 ? `${who.length} — ${who.join(', ')}` : who[0]}
                        </Text>
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          );
        })}
      </>
    );
  };

  const renderTreasurer = () => (
    <View style={{ flex: 1 }}>
      <Kicker>{deck.treasurer.kicker}</Kicker>
      <SlideTitle>{deck.treasurer.title}</SlideTitle>
      {deck.treasurer.kind === 'honeyPot' ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: sz(40, 20) }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 13), letterSpacing: 3, textTransform: 'uppercase', color: MUTED }}>
            Honey Pot balance
          </Text>
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: sz(120, 54),
              lineHeight: sz(150, 70),
              color: GOLD,
              marginTop: sz(14, 8),
            }}
          >
            {honeyPotBalance === null ? '—' : formatBalance(honeyPotBalance)}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: sz(16, 10),
              marginTop: sz(44, 24),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: 999,
              paddingHorizontal: sz(34, 20),
              paddingVertical: sz(16, 10),
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(24, 14), color: CHARCOAL }}>
              Dues: $25 / quarter
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(24, 14), color: MUTED }}>·</Text>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(24, 14), color: GOLD_DEEP }}>
              CashApp $HiveLV
            </Text>
          </View>
        </View>
      ) : (
        /* The dues conversation — this slide exists ON PURPOSE for a HIVE with
           no Honey Pot yet. Nat: "leave the treasurer slide in there, because
           we'll want to talk about if we want to have dues, what they are for,
           who's in charge, & having that screen will do that." */
        <BounceScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: sz(60, 40) }}
        >
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontStyle: 'italic',
              fontSize: sz(26, 15),
              lineHeight: sz(38, 22),
              color: MUTED,
              textAlign: 'center',
            }}
          >
            {deck.treasurer.lead}
          </Text>
          <View
            style={{
              marginTop: sz(30, 18),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(22, 16),
              paddingHorizontal: sz(38, 20),
              paddingVertical: sz(26, 16),
              gap: sz(16, 10),
            }}
          >
            {deck.treasurer.questions.map((question, index) => (
              <View key={question} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(16, 10) }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 12), color: GOLD, transform: [{ translateY: -2 }] }}>
                  {index + 1}
                </Text>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(30, 17), lineHeight: sz(42, 25), color: CHARCOAL }}>
                  {question}
                </Text>
              </View>
            ))}
          </View>
          {/* Somewhere to put the answer while the room is still talking.
              Tech HIVE meets entirely remotely, so there is no notebook going
              round the table — Nat asked to be able to type straight into the
              deck on the night (2026-08-12). Empty until she writes, so the
              slide still reads as three clean questions on the screen share. */}
          <View style={{ marginTop: sz(22, 14), width: '100%', maxWidth: sz(900, 620), alignItems: 'center', gap: sz(8, 5) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(10, 6) }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 11), color: GOLD_DEEP }}>
                Whatever we land on goes in tonight's wrap-up.
              </Text>
              <EditPill noteKey="treasurer" />
            </View>
            {renderCheckInSays('treasurer')}
            {notes.treasurer?.trim() ? (
              <View
                style={{
                  alignSelf: 'stretch',
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: GOLD_SOFT,
                  borderRadius: sz(16, 12),
                  paddingHorizontal: sz(22, 14),
                  paddingVertical: sz(14, 9),
                }}
              >
                <NoteBody noteKey="treasurer" emptyText="" />
              </View>
            ) : null}
          </View>
        </BounceScrollView>
      )}
    </View>
  );

  // Plan the Meet Ups: how we gather across the top, then a classic two-month
  // calendar (this month + next, side by side on the TV) painted with what's
  // already on the HIVE calendar. Tap any upcoming day to pencil in a hang
  // right from the deck — no tab-juggling mid-meeting.
  const renderMeetups = () => {
    const todayIso = getLocalIsoDate(new Date());
    const today = new Date();
    const monthStarts = [
      new Date(today.getFullYear(), today.getMonth() + monthOffset, 1),
      new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 1),
    ];

    // Check-in voices for the expandable Hang/Help cards — the hangs answer
    // stores "Went to: …" on line one, thoughts after.
    const recapNote = (raw: string) => {
      const lines = raw.split('\n');
      return (lines[0]?.startsWith('Went to: ') ? lines.slice(1).join('\n') : raw).trim();
    };
    const voicesFor = (key: string, clean: (raw: string) => string = (raw) => raw.trim()) =>
      memberOrder
        .map((member) => ({
          id: member.id,
          name: getFirstName(member.name),
          text: clean(getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, key)),
        }))
        .filter((voice) => !!voice.text);
    // The focus answer keeps its choice on line one, thoughts after — so the
    // deck can report how many did it and how it landed, not just quote
    // paragraphs (Nat 2026-07-25).
    const focusNote = (raw: string) => parseFocusAnswer(raw).note.trim();
    const helpVoices = voicesFor('q_hive_help_recap', focusNote);
    const hangVoices = voicesFor('q_hangs_recap', recapNote);
    const underCards = deck.plan.voicesUnderCards;
    const underCardVoices = underCards ? voicesFor(underCards.answerKey) : [];

    const focusTally = members.reduce(
      (tally, member) => {
        const raw = getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, 'q_hive_help_recap');
        if (!raw.trim()) return tally;
        if (focusAnswerDidIt(raw)) tally.did += 1;
        const score = focusAnswerScore(raw);
        if (score) tally.ratings.push(score);
        const { choice, instead } = parseFocusAnswer(raw);
        if (choice === 'I did something else' && instead) tally.instead.push(`${getFirstName(member.name)}: ${instead}`);
        return tally;
      },
      { did: 0, ratings: [] as number[], instead: [] as string[] }
    );
    const focusAvg = focusTally.ratings.length > 0
      ? Math.round((focusTally.ratings.reduce((sum, value) => sum + value, 0) / focusTally.ratings.length) * 10) / 10
      : null;

    // Survey says! Turnout + average enjoyment per hang, from the check-ins'
    // "I went 🙌" taps and 🍯 ratings ("Went to: Taste (4/5) · Drag Brunch").
    const hangPoll = pastHangs.map((hang) => {
      let went = 0;
      const ratings: number[] = [];
      members.forEach((member) => {
        const raw = getTextAnswer(responsesByUser.get(member.id)?.answers ?? {}, 'q_hangs_recap');
        const firstLine = raw.split('\n')[0] ?? '';
        if (!firstLine.startsWith('Went to: ')) return;
        const entry = firstLine
          .slice('Went to: '.length)
          .split(' · ')
          .find((candidate) => candidate.trim().startsWith(hang.title));
        if (!entry) return;
        went += 1;
        const rating = entry.match(/\((\d)\/5\)\s*$/)?.[1];
        if (rating) ratings.push(Number(rating));
      });
      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10) / 10
        : null;
      return { ...hang, went, avgRating };
    });


    const eventsOnDay = (dayIso: string) =>
      events.filter((event) => event.event_date <= dayIso && dayIso <= (event.end_date || event.event_date));

    const isAwayEvent = (event: DeckEvent) =>
      event.event_type !== 'meeting' &&
      event.event_type !== 'birthday' &&
      (!!event.end_date || /\b(out of town|away|trip|travel|galavant)/i.test(event.title));

    const eventEmoji = (event: DeckEvent) => {
      if (event.event_type === 'meeting') return '🐝';
      if (event.event_type === 'birthday') return '🎂';
      if (isAwayEvent(event)) return '✈️';
      return '📌';
    };

    // Away events are titled "<FirstName> out of town" — match that first word
    // back to the roster so the calendar can show a face instead of the title.
    const memberForAwayEvent = (event: DeckEvent) => {
      const firstWord = event.title.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      return members.find((member) => getFirstName(member.name).toLowerCase() === firstWord) ?? null;
    };

    const renderMonth = (monthStart: Date) => {
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const gridStart = new Date(monthStart);
      gridStart.setDate(gridStart.getDate() - gridStart.getDay());
      const gridEnd = new Date(monthEnd);
      gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

      const days: Date[] = [];
      for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
        days.push(new Date(cursor));
      }
      const weeks: Date[][] = [];
      for (let index = 0; index < days.length; index += 7) {
        weeks.push(days.slice(index, index + 7));
      }

      const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long' });
      // This month's HIVE Help focus lives right in the calendar header —
      // read from the "{Month} HIVE Helpers — {focus}" board thread, or type
      // it here and the thread is created automatically.
      // Canonical: "{Month} HIVE Help — {Focus}"; legacy "HIVE Helpers" still parses.
      const focusPattern = new RegExp(`^${monthLabel}\\s+HIVE Help(?:ers)?\\s*[—–-]+\\s*(.+)$`, 'i');
      const existingFocus = helperPosts
        .map((post) => (post.title ?? '').trim().match(focusPattern)?.[1])
        .find((match) => !!match);

      return (
        <View key={monthStart.toISOString()} style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(26, 16), color: CHARCOAL, marginBottom: sz(8, 5) }}>
            {monthLabel}
          </Text>
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(18, 14),
              padding: sz(10, 6),
            }}
          >
            {/* The month's HIVE Help focus lives top-center of the calendar —
                type it here and the board thread is created automatically.
                Only for a HIVE that has chosen to run HIVE Help: Tech is
                still deciding whether it wants one, so Tech's calendar
                doesn't carry the controls for running it. */}
            {!deck.plan.hasHelpFocusHeader ? null : existingFocus ? (
              <Text
                numberOfLines={1}
                style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(19, 12), color: GOLD_DEEP, textAlign: 'center', marginBottom: sz(8, 5) }}
              >
                Help Focus: {existingFocus.replace(/!+$/, '')}
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(8, 5), justifyContent: 'center', marginBottom: sz(8, 5) }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(18, 11), color: GOLD_DEEP }}>
                  Help Focus:
                </Text>
                {/* A month's focus is a phrase somebody says out loud in the
                    room — "pick up trash on your walk" — so it takes the
                    composer and its microphone rather than a bare underline.
                    Press enter and the board thread is created. */}
                <ComposerBar
                  variant="form"
                  value={monthFocusDrafts[monthLabel] ?? ''}
                  onChangeText={(next) => setMonthFocusDrafts((drafts) => ({
                    ...drafts,
                    [monthLabel]: typeof next === 'function' ? next(drafts[monthLabel] ?? '') : next,
                  }))}
                  onSubmit={() => handlePostHelpFocus(monthLabel)}
                  submitting={monthFocusSaving === monthLabel}
                  placeholder={monthFocusSaving === monthLabel ? 'posting…' : 'type it, press enter'}
                  multiline={false}
                  containerClassName="flex-1"
                  fieldClassName={isTV ? 'text-[18px]' : 'text-[12px]'}
                />
              </View>
            )}
            <View style={{ flexDirection: 'row', marginBottom: sz(6, 4) }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel) => (
                <Text
                  key={dayLabel}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontFamily: 'Lato_700Bold',
                    fontSize: sz(13, 9),
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: MUTED,
                  }}
                >
                  {dayLabel}
                </Text>
              ))}
            </View>
            {weeks.map((week) => (
              <View key={week[0].toISOString()} style={{ flexDirection: 'row' }}>
                {week.map((day) => {
                  const dayIso = getLocalIsoDate(day);
                  const inMonth = day.getMonth() === monthStart.getMonth();
                  if (!inMonth) {
                    return <View key={dayIso} style={{ flex: 1, margin: sz(2, 1) }} />;
                  }
                  const isPast = dayIso < todayIso;
                  const dayEvents = eventsOnDay(dayIso);
                  const awayEvents = dayEvents.filter(isAwayEvent);
                  const plannedEvents = dayEvents.filter((event) => !isAwayEvent(event));
                  const isMeetingDay = plannedEvents.some((event) => event.event_type === 'meeting');
                  // Away stretches don't claim the day — someone being out of
                  // town still leaves the rest of the HIVE free to hang.
                  const isBusy = plannedEvents.length > 0;
                  const isToday = dayIso === todayIso;
                  const primaryEvent = plannedEvents[0];
                  // ✈️ marks the day a trip starts; → carries through the rest
                  // of the stretch so a long trip reads as one thin line.
                  const awayDeparts = awayEvents.some((event) => event.event_date === dayIso);
                  const shownAway = awayEvents.slice(0, 3);
                  const bubbleSize = sz(20, 13);
                  return (
                    <Pressable
                      key={dayIso}
                      disabled={isPast}
                      onPress={() => {
                        if (planMode === 'meeting') {
                          setMeetingSchedulerDate(dayIso);
                          return;
                        }
                        setQuickAddDate(dayIso);
                        // An armed idea rides in as the title; you fill in the
                        // time and place. Nothing armed = blank, as before.
                        setQuickAddTitle(armedHangIdea ?? '');
                        setQuickAddTime('');
                        setQuickAddError(null);
                      }}
                      style={{
                        flex: 1,
                        // Was 56/40 — six-week months made the calendar the
                        // tallest thing on the slide (one-page rule).
                        minHeight: sz(52, 38),
                        margin: sz(2, 1),
                        borderRadius: sz(10, 7),
                        borderWidth: isMeetingDay || isToday ? 2 : 1,
                        borderColor: isMeetingDay || isToday ? GOLD : isBusy ? GOLD_SOFT : tintWash(0.24),
                        backgroundColor: isBusy ? tintWash(0.16) : PAPER,
                        paddingHorizontal: sz(6, 3),
                        paddingVertical: sz(4, 2),
                        opacity: isPast ? 0.4 : 1,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: isToday || isMeetingDay ? 'Lato_700Bold' : 'Lato_400Regular',
                          fontSize: sz(15, 10),
                          color: isToday || isMeetingDay ? GOLD_DEEP : CHARCOAL,
                        }}
                      >
                        {day.getDate()}
                      </Text>
                      {primaryEvent ? (
                        <Text numberOfLines={isTV ? 2 : 1} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(12, 8), lineHeight: sz(16, 11), color: GOLD_DEEP, marginTop: sz(2, 1) }}>
                          {eventEmoji(primaryEvent)}{isTV ? ` ${primaryEvent.title}` : ''}
                          {plannedEvents.length > 1 ? `  +${plannedEvents.length - 1}` : ''}
                        </Text>
                      ) : null}
                      {shownAway.length > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: sz(2, 1) }}>
                          {shownAway.map((event, index) => {
                            const member = memberForAwayEvent(event);
                            return (
                              <View
                                key={event.id}
                                style={{
                                  marginLeft: index === 0 ? 0 : -bubbleSize * 0.35,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: PAPER,
                                }}
                              >
                                <Avatar
                                  name={member?.name ?? event.title}
                                  url={member?.avatar_url}
                                  size={bubbleSize}
                                />
                              </View>
                            );
                          })}
                          {awayEvents.length > shownAway.length ? (
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(11, 8), color: MUTED, marginLeft: sz(2, 1) }}>
                              +{awayEvents.length - shownAway.length}
                            </Text>
                          ) : null}
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(11, 8), color: MUTED, marginLeft: sz(2, 1) }}>
                            {awayDeparts ? '✈️' : '→'}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      );
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(26, 16) }}>
          <View>
            <Kicker>{deck.plan.kicker}</Kicker>
            <SlideTitle>{deck.plan.title}</SlideTitle>
          </View>
          <EditPill noteKey="meetups" />
        </View>

        {/* Top: the three ways we gather — now the controls. Meeting/Hang pick
            what a calendar tap schedules; Help expands with the focus + the
            check-in voices. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(16, 8) }}>
          {deck.plan.cards.map((column) => {
            // Exactly ONE card carries the highlight: the open panel wins;
            // with nothing expanded, the active schedule mode does. The ●/○
            // line still shows which mode calendar taps use.
            const isSelected = expandedPlanCard
              ? expandedPlanCard === column.key
              : planMode === column.key;
            return (
              <Pressable
                key={column.title}
                onPress={() => {
                  if (column.key === 'meeting') {
                    setPlanMode('meeting');
                    setExpandedPlanCard(null);
                  } else if (column.key === 'hang') {
                    setPlanMode('hang');
                    // Tech's third card (HIVE Networking) has no panel — it
                    // arms the calendar, the same move as the Meeting card.
                    setExpandedPlanCard((card) =>
                      deck.plan.hangCardExpands && card !== 'hang' ? 'hang' : null
                    );
                  } else {
                    setExpandedPlanCard((card) => (card === 'help' ? null : 'help'));
                  }
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: sz(260, 150),
                  backgroundColor: isSelected ? tintWash(0.18) : CARD,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? GOLD : GOLD_SOFT,
                  borderRadius: sz(18, 14),
                  paddingHorizontal: sz(22, 14),
                  paddingVertical: sz(14, 10),
                  opacity: pressed ? 0.8 : 1,
                  outlineWidth: 0,
                })}
              >
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(24, 16), color: GOLD_DEEP }}>
                  {column.title}
                </Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 12), lineHeight: sz(25, 18), color: MUTED, marginTop: sz(4, 3) }}>
                  {column.blurb}
                </Text>
                {/* OG's hang card says nothing extra — the panel it opens
                    explains itself (Nat 2026-07-24). Tech's networking card
                    schedules instead of expanding, so it talks like the
                    meeting card does. */}
                {column.key === 'hang' && deck.plan.hangCardExpands ? null : (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: isSelected ? GOLD_DEEP : 'rgba(154,128,96,0.55)', marginTop: sz(6, 4) }}>
                    {column.key === 'meeting'
                      ? isSelected ? '● tap a day below to schedule the meeting' : '○ select, then tap a day to schedule'
                      : column.key === 'hang'
                        ? isSelected ? '● tap a day below to schedule it' : '○ select, then tap a day to schedule'
                        : deck.plan.helpExpansion.kind === 'voices'
                          ? expandedPlanCard === 'help' ? '▾ voices from the check-ins' : '▸ tap for voices from the check-ins'
                          : expandedPlanCard === 'help' ? '▾ the conversation' : '▸ tap to talk it over'}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* What people wrote in their check-in, for a card that doesn't open a
            panel of its own. Tech's networking answers live here. */}
        {underCards ? (
          <View style={{ marginTop: sz(14, 8), gap: sz(4, 3) }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
              {underCards.heading}
            </Text>
            {underCardVoices.length > 0 ? (
              underCardVoices.map((voice) => (
                <Text key={voice.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(16, 11), lineHeight: sz(24, 16), color: CHARCOAL }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>{voice.name}: </Text>
                  {voice.text}
                </Text>
              ))
            ) : (
              <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                {underCards.empty}
              </Text>
            )}
          </View>
        ) : null}

        {/* HIVE Hang expansion — the POP formula for hangs. Left: how did
            last cycle land (real turnout meters from the check-in "I went 🙌"
            taps — survey says!). Right: what should we do next. Async voices
            count the same as in-person ones. */}
        {expandedPlanCard === 'hang' ? (
          <View
            style={{
              marginTop: sz(14, 8),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(18, 14),
              paddingHorizontal: sz(22, 14),
              paddingVertical: sz(16, 10),
              flexDirection: isTV ? 'row' : 'column',
              gap: sz(32, 14),
            }}
          >
            <View style={{ flex: isTV ? 1 : undefined, gap: sz(10, 7) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(8, 5) }}>
                <Text style={{ fontSize: sz(16, 12) }}>📊</Text>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
                  How did we do?
                </Text>
              </View>
              {hangPoll.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                  No hangs this cycle — blank scoreboard, let's fix that.
                </Text>
              ) : (
                hangPoll.map((hang) => (
                  <View key={hang.id} style={{ gap: sz(3, 2) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(10, 6) }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 12), color: CHARCOAL, flexShrink: 1 }}>
                        {hang.title}
                      </Text>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP }}>
                        {hang.went > 0
                          ? `🙌 ${hang.went} went${hang.avgRating ? ` · 🍯 ${hang.avgRating}/5${hang.avgRating >= 4.5 ? ' — we LOVED it' : hang.avgRating >= 3.5 ? ' — a hit' : ''}` : ''}`
                          : 'waiting on the check-ins'}
                      </Text>
                    </View>
                    <View style={{ height: sz(10, 7), borderRadius: 999, backgroundColor: tintWash(0.18), overflow: 'hidden' }}>
                      <View
                        style={{
                          width: `${Math.round((hang.went / Math.max(1, members.length)) * 100)}%`,
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: GOLD,
                        }}
                      />
                    </View>
                  </View>
                ))
              )}
              {/* The words themselves, not a count of them.
                  This said "3 written thoughts in the check-ins — worth a skim
                  out loud" and stopped there, so what somebody actually wrote
                  about a hang was saved, counted, and never once put on a
                  screen. Nat, doing the August tune-up: "I just want to know
                  where this info ends up... in case it doesnt carry somewhere."
                  It did not. The HIVE Help voices two sections down have been
                  printed in full all along; this is the same treatment. */}
              {hangVoices.length > 0 ? (
                <View style={{ gap: sz(4, 3), marginTop: sz(6, 4) }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginTop: sz(4, 3) }}>
                    🗣️ What people said about the hangs
                  </Text>
                  {hangVoices.map((voice) => (
                    <Text key={voice.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(16, 11), lineHeight: sz(24, 16), color: CHARCOAL }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>{voice.name}: </Text>
                      {voice.text}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            {/* One question, one answer box: the ideas, then the plan you
                write. The "how" line lives in the note's empty state instead
                of standing as a third block (Nat 2026-07-24: "same thing
                three times"). */}
            <View style={{ flex: isTV ? 1 : undefined, gap: sz(10, 7) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(8, 5) }}>
                  <Text style={{ fontSize: sz(16, 12) }}>💡</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
                    What should we do next?
                  </Text>
                </View>
                <EditPill noteKey="meetups" />
              </View>
              {hangIdeas.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                  No ideas on the board yet — first to post picks the venue.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(10, 7) }}>
                  {/* Arm an idea, then tap a day — the quick-add opens with the
                      title already filled so you only add time and place.
                      Tapping the armed pill again disarms it, and a day tapped
                      with nothing armed behaves exactly as it always did: you
                      are never forced to pick from this list (Nat 2026-07-24). */}
                  {hangIdeas.map((idea) => {
                    const label = (idea.title ?? 'Untitled idea').trim() || 'Untitled idea';
                    const isArmed = armedHangIdea === label;
                    return (
                      <Pressable
                        key={idea.id}
                        onPress={() => {
                          setArmedHangIdea(isArmed ? null : label);
                          // Make sure a day tap pencils in a hang, not a meeting.
                          setPlanMode('hang');
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isArmed }}
                        accessibilityLabel={isArmed ? `Unpick ${label}` : `Pick ${label}, then tap a day to schedule it`}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: sz(6, 4),
                          backgroundColor: isArmed ? GOLD : pressed ? tintWash(0.34) : tintWash(0.18),
                          borderWidth: 1,
                          borderColor: isArmed ? GOLD : 'transparent',
                          borderRadius: 999,
                          paddingHorizontal: sz(18, 12),
                          paddingVertical: sz(8, 6),
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(16, 11), color: isArmed ? 'white' : GOLD_DEEP }}>
                          {isArmed ? `✓ ${label}` : label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {armedHangIdea ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), color: GOLD_DEEP }}>
                  Now tap a day on the calendar to pencil in “{armedHangIdea}”.
                </Text>
              ) : null}
              <NoteBody noteKey="meetups" emptyText="No meet-up plans written down yet." />
            </View>
          </View>
        ) : null}

        {/* HIVE Help expansion: what everyone said in their check-ins —
            absent voices still get heard. The monthly focus lives up in the
            calendar headers now ("Help Focus: …"). */}
        {expandedPlanCard === 'help' ? (
          <View
            style={{
              marginTop: sz(14, 8),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(18, 14),
              paddingHorizontal: sz(22, 14),
              paddingVertical: sz(16, 10),
              gap: sz(12, 8),
            }}
          >
            {/* A HIVE still deciding whether it wants a HIVE Help gets the
                conversation, in Nat's framing: no pressure, it's a choice. */}
            {deck.plan.helpExpansion.kind === 'conversation' ? (
              <View style={{ gap: sz(8, 5) }}>
                {/* Says which card opened this. The panels stack under the whole
                    row, so without a name the conversation reads as belonging to
                    whichever card it happens to sit beneath. */}
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), letterSpacing: 2, textTransform: 'uppercase', color: GOLD_DEEP }}>
                  HIVE Help
                </Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(19, 13), lineHeight: sz(29, 20), color: CHARCOAL }}>
                  {deck.plan.helpExpansion.lead}
                </Text>
                {deck.plan.helpExpansion.points.map((point) => (
                  <Text key={point} style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 12), lineHeight: sz(26, 18), color: GOLD_DEEP }}>
                    {point}
                  </Text>
                ))}
                {/* The conversation is the point, and a HIVE that has already
                    picked its Help wants somewhere to say so. Nat, 2026-08-12:
                    *"I love that you have the 'lets talk about this' part, but
                    I'd also like to be able to put text directly in there…
                    where i could just put the help in."* Written any time —
                    top of the month, or live while the room decides. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(10, 6), marginTop: sz(4, 3) }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD }}>
                    This month's Help
                  </Text>
                  <EditPill noteKey="help" />
                </View>
                <NoteBody
                  noteKey="help"
                  emptyText="Nothing written down yet — talk it over, or write it in ahead of the meeting."
                />
              </View>
            ) : null}
            {/* Survey says, for the focus: how many did it and how it landed.
                This is the whole reason the recap is structured rather than a
                paragraph — counts and averages can be shown, prose can only be
                read aloud. */}
            {deck.plan.helpExpansion.kind === 'voices' && focusTally.did > 0 ? (
              <View style={{ gap: sz(4, 3) }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 13), color: GOLD_DEEP }}>
                  🙌 {focusTally.did} of {members.length} did it
                  {focusAvg ? ` · 🍯 ${focusAvg}/5${focusAvg >= 4.5 ? ' — we LOVED it' : focusAvg >= 3.5 ? ' — a hit' : ''}` : ''}
                </Text>
                {focusTally.instead.length > 0 ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(15, 10), color: MUTED }}>
                    Did their own thing — {focusTally.instead.join(' · ')}
                  </Text>
                ) : null}
                <View style={{ height: sz(10, 7), borderRadius: 999, backgroundColor: tintWash(0.18), overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.round((focusTally.did / Math.max(1, members.length)) * 100)}%`,
                      height: '100%',
                      borderRadius: 999,
                      backgroundColor: GOLD,
                    }}
                  />
                </View>
              </View>
            ) : null}
            {deck.plan.helpExpansion.kind === 'voices' ? (
              helpVoices.length > 0 ? (
                <View style={{ gap: sz(4, 3) }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 10), letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, marginTop: sz(4, 3) }}>
                    🗣️ Voices from the check-ins
                  </Text>
                  {helpVoices.map((voice) => (
                    <Text key={voice.id} style={{ fontFamily: 'Lato_400Regular', fontSize: sz(16, 11), lineHeight: sz(24, 16), color: CHARCOAL }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>{voice.name}: </Text>
                      {voice.text}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(14, 10), color: MUTED }}>
                  No HIVE Help thoughts in the check-ins yet — they'll gather here as people fill theirs out.
                </Text>
              )
            ) : null}
          </View>
        ) : null}

        {/* Mini month pager — pages the calendar window, NOT the slides */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: sz(10, 7), marginTop: sz(18, 10) }}>
          {monthOffset !== 0 ? (
            <Pressable
              onPress={() => setMonthOffset(0)}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: 999,
                paddingHorizontal: sz(14, 10),
                paddingVertical: sz(6, 4),
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP }}>back to now</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Middle: two months side by side on the TV — with carousel-style
            pager arrows riding the calendar's flanks, vertically centered
            (Nat: "between the 12 & 19"). */}
        <View style={{ position: 'relative', marginTop: sz(8, 5) }}>
          <View style={{ flexDirection: isTV ? 'row' : 'column', gap: sz(28, 14), paddingHorizontal: sz(52, 38) }}>
            {monthStarts.map(renderMonth)}
          </View>
          {[
            { label: '‹', delta: -1, hint: 'previous month', side: { left: 0 } },
            { label: '›', delta: 1, hint: 'next month', side: { right: 0 } },
          ].map((pager) => (
            <Pressable
              key={pager.label}
              onPress={() => setMonthOffset((offset) => offset + pager.delta)}
              accessibilityLabel={pager.hint}
              style={({ pressed }) => ({
                position: 'absolute',
                top: '50%',
                marginTop: -sz(21, 16),
                ...pager.side,
                width: sz(42, 32),
                height: sz(42, 32),
                borderRadius: 999,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                backgroundColor: CARD,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
                shadowColor: GOLD,
                shadowOpacity: 0.14,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 2,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(22, 17), color: GOLD_DEEP, marginTop: -2 }}>
                {pager.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Everything lives in the cards above now — recaps, polls, ideas,
            and plans all expand from Meeting/Hang/Help. */}

        {/* What the room already said about cadence, HIVE Help and which room
            they would go and look at. Answered before the meeting so tonight
            can decide instead of ask. */}
        {renderCheckInSays('meetups')}

        {/* Breathing room so the last row scrolls clear of the footer. The
            page's own bottom padding already clears most of it — this was
            90/64 on top of that, which is exactly the "scroll the tiniest
            bit" Nat named (one-page rule, 2026-08-11). */}
        <View style={{ height: sz(20, 14) }} />
      </View>
    );
  };

  // The HummDinger sesh, consolidated onto one page: a compact POP-formula
  // header (the talking points people follow during the go-around) above a grid
  // of member bubbles (name-for-today + their top HD goal).
  //
  // NOTE: Earlier this was a full formula slide + one slide PER MEMBER + a
  // grouped "Member HDs" overview. Per-member slides were intentionally folded
  // into these bubbles — early on most people haven't filled out the check-in,
  // and an empty personal slide makes them feel singled out. As the check-in
  // data richens, per-member slides can be reintroduced from git history.
  const bubbleColumns = isTV ? 5 : width >= 1024 ? 4 : width >= 760 ? 3 : width >= 480 ? 2 : 1;

  const HUMMDINGER_DETAIL_SECTIONS = [
    { key: 'q_pop_progress', label: 'Progress' },
    { key: 'q_pop_obstacles', label: 'Obstacles' },
    { key: 'q_pop_priorities', label: 'Priorities' },
  ] as const;

  const renderHummdinger = () => (
    <View style={{ flex: 1 }}>
      <Kicker>Obstacles · the HD sesh</Kicker>
      <SlideTitle>HummDinger Sesh</SlideTitle>
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontStyle: 'italic',
          fontSize: sz(20, 12),
          lineHeight: sz(30, 18),
          color: MUTED,
          marginTop: sz(12, 8),
        }}
      >
        {POP_ALT_PHRASING}
      </Text>

      {/* POP-formula header — a legend, not a headline. Kept deliberately
          slim so the member bubbles below get the room (Nat 2026-07-24). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sz(12, 7), marginTop: sz(14, 10) }}>
        {POP_SECTIONS.map((section) => (
          <View
            key={section.key}
            style={{
              flex: 1,
              minWidth: sz(200, 140),
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              borderRadius: sz(14, 11),
              paddingHorizontal: sz(16, 11),
              paddingVertical: sz(9, 7),
            }}
          >
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(18, 13), color: CHARCOAL }}>
              {section.label}
            </Text>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(13, 10), lineHeight: sz(18, 14), color: GOLD_DEEP, marginTop: sz(2, 1) }}>
              {section.prompt}
            </Text>
          </View>
        ))}
      </View>

      {/* Member bubbles — one per member, uniform size so no one looks
          emptier. Tap a bubble to expand the full check-in (and tap again to
          tuck it away) — thorough write-ups get their moment without empty
          ones being singled out. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: sz(-8, -5), marginTop: sz(20, 13) }}>
        {memberOrder.map((member) => {
          const response = responsesByUser.get(member.id);
          const answers = response?.answers ?? {};
          const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
          const memberWishes = wishesByUserId.get(member.id) ?? [];
          const topWish = pickSpotlightWish(memberWishes) ?? memberWishes[0];
          const hdGoal = topWish ? getWishQuickTitle(topWish, 40) : null;
          const priorities = getTextAnswer(answers, 'q_pop_priorities');
          const detailSections = HUMMDINGER_DETAIL_SECTIONS
            .map((section) => ({ ...section, text: getTextAnswer(answers, section.key) }))
            .filter((section) => !!section.text);
          const assistsForMember = completedAssists.filter(
            (assist) => assist.relatedUserId === member.id && assist.assignedTo !== member.id
          );
          const assistsByMember = completedAssists.filter((assist) => assist.assignedTo === member.id);
          const grantedThisCycle = grantedWishes.filter((wish) => wish.user_id === member.id);
          const attendance = getAttendance(response);
          // Whether they brought anything WRITTEN. Every bubble opens either
          // way: the meeting happens out loud, and someone who skipped the
          // digital part still gets a turn — often the idea only forms once
          // they start talking, and it needs somewhere to land (Nat
          // 2026-07-24). An empty spotlight is still a live-note pad.
          const hasDetails =
            detailSections.length > 0 ||
            !!topWish?.description ||
            assistsForMember.length > 0 ||
            assistsByMember.length > 0 ||
            grantedThisCycle.length > 0;
          return (
            <View key={member.id} style={{ width: `${100 / bubbleColumns}%`, padding: sz(8, 5) }}>
              <Pressable
                onPress={() => {
                  setExpandedHummdingerId(member.id);
                  setHummdingerVisited((visited) => new Set(visited).add(member.id));
                  setLiveNoteDraft('');
                  setLiveNoteConfirmation(null);
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  backgroundColor: CARD,
                  borderWidth: hummdingerVisited.has(member.id) ? 2 : 1,
                  borderColor: hummdingerVisited.has(member.id) ? GOLD : GOLD_SOFT,
                  borderRadius: sz(20, 14),
                  paddingHorizontal: sz(18, 11),
                  // Was 26/16 of vertical padding — with a full roster the
                  // grid ran just past one screen (one-page rule).
                  paddingVertical: sz(18, 12),
                  outlineWidth: 0,
                }}
              >
                <Avatar name={member.name} url={member.avatar_url} size={sz(88, 56)} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'LibreBaskerville_700Bold',
                    fontSize: sz(26, 16),
                    color: CHARCOAL,
                    marginTop: sz(12, 8),
                    textAlign: 'center',
                  }}
                >
                  {nameToday}
                </Text>
                {attendance === 'missing' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: MUTED, marginTop: sz(3, 2) }}>
                    😢 not here tonight — carry the torch
                  </Text>
                ) : attendance === 'remote' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP, marginTop: sz(3, 2) }}>
                    💻 zooming in
                  </Text>
                ) : null}
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: sz(17, 11),
                    lineHeight: sz(24, 16),
                    color: hdGoal ? GOLD_DEEP : MUTED,
                    fontStyle: hdGoal ? 'normal' : 'italic',
                    textAlign: 'center',
                    marginTop: sz(6, 4),
                  }}
                >
                  {hdGoal ?? 'open to ideas'}
                </Text>
                {priorities ? (
                  <Text
                    numberOfLines={2}
                    style={{
                      fontFamily: 'Lato_400Regular',
                      fontSize: sz(15, 10),
                      lineHeight: sz(21, 14),
                      color: MUTED,
                      textAlign: 'center',
                      marginTop: sz(6, 4),
                    }}
                  >
                    {priorities}
                  </Text>
                ) : null}
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 9), color: MUTED, marginTop: sz(8, 5) }}>
                  {hasDetails
                    ? hummdingerVisited.has(member.id) ? '✓ tap for the full story' : 'tap for the full story ↓'
                    : hummdingerVisited.has(member.id) ? '✓ tap to take notes' : 'tap to take notes ↓'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );

  // The spotlight: one member's full story in an overlay, so the group grid
  // never reflows. Big obvious way back — Lucas got lost in the inline
  // version ("I wanted to get back to wide view").
  const renderHummdingerSpotlight = () => {
    const member = memberOrder.find((candidate) => candidate.id === expandedHummdingerId);
    if (!member) return null;
    const response = responsesByUser.get(member.id);
    const answers = response?.answers ?? {};
    const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
    const memberWishList = wishesByUserId.get(member.id) ?? [];
    const topWish = pickSpotlightWish(memberWishList) ?? memberWishList[0];
    // The tune-up SEEDS an empty Progress answer with "Checked off: …" and
    // "Done for me 💛: …" lines. This card already renders both as their own
    // properly-formatted sections below, so echoing the seed under PROGRESS
    // said everything twice (Nat 2026-07-24: "kind of messy"). Drop the seeded
    // lines here and keep whatever the member actually wrote; if that's
    // nothing, the section doesn't appear at all.
    const detailSections = HUMMDINGER_DETAIL_SECTIONS
      .map((section) => {
        const text = getTextAnswer(answers, section.key);
        if (section.key !== 'q_pop_progress') return { ...section, text };
        const ownWords = text
          .split('\n')
          .filter((line) => !/^\s*(checked off|done for me\s*💛?)\s*:/i.test(line))
          .join('\n')
          .trim();
        return { ...section, text: ownWords };
      })
      .filter((section) => !!section.text);
    const assistsForMember = completedAssists.filter(
      (assist) => assist.relatedUserId === member.id && assist.assignedTo !== member.id
    );
    const assistsByMember = completedAssists.filter((assist) => assist.assignedTo === member.id);
    const grantedThisCycle = grantedWishes.filter((wish) => wish.user_id === member.id);
    const attendance = getAttendance(response);
    const sectionLabel = { fontFamily: 'Lato_700Bold' as const, fontSize: sz(15, 11), letterSpacing: 1.5, textTransform: 'uppercase' as const, color: GOLD, marginBottom: sz(4, 3) };
    const sectionText = { fontFamily: 'Lato_400Regular' as const, fontSize: sz(18, 13), lineHeight: sz(27, 19), color: CHARCOAL };
    const sectionContext = { fontFamily: 'Lato_400Regular' as const, fontSize: sz(14, 10), lineHeight: sz(19, 14), color: MUTED };

    return (
      <Modal visible animationType="fade" transparent onRequestClose={() => setExpandedHummdingerId(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(49,49,48,0.5)', alignItems: 'center', justifyContent: 'center', padding: sz(40, 14) }}
          onPress={() => setExpandedHummdingerId(null)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: sz(880, 640),
              maxHeight: '88%',
              backgroundColor: PAPER,
              borderRadius: sz(26, 18),
              borderWidth: 1,
              borderColor: GOLD_SOFT,
              overflow: 'hidden',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(16, 10), paddingHorizontal: sz(28, 16), paddingTop: sz(24, 14), paddingBottom: sz(14, 9), borderBottomWidth: 1, borderColor: GOLD_SOFT }}>
              <Avatar name={member.name} url={member.avatar_url} size={sz(64, 44)} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(30, 19), color: CHARCOAL }}>
                  {nameToday}
                </Text>
                {attendance === 'missing' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: MUTED }}>
                    😢 not here tonight — carry the torch
                  </Text>
                ) : attendance === 'remote' ? (
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: GOLD_DEEP }}>
                    💻 zooming in
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setExpandedHummdingerId(null)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: tintWash(0.18),
                  borderRadius: 999,
                  paddingHorizontal: sz(18, 12),
                  paddingVertical: sz(9, 7),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(16, 11), color: GOLD_DEEP }}>
                  ← back to the group
                </Text>
              </Pressable>
            </View>
            {/* The spotlight sheet's scroller — BounceScrollView so a member's
                story bounces at both ends like every other sheet in the app. */}
            <BounceScrollView contentContainerStyle={{ paddingHorizontal: sz(28, 16), paddingVertical: sz(20, 12), gap: sz(16, 10) }}>
              {!topWish?.description
                && grantedThisCycle.length === 0
                && detailSections.length === 0
                && assistsForMember.length === 0
                && assistsByMember.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: sz(17, 12), lineHeight: sz(25, 18), color: MUTED }}>
                  Nothing written down yet — that's what the floor is for. Catch what {nameToday} says below.
                </Text>
              ) : null}
              {topWish?.description ? (
                <View>
                  <Text style={sectionLabel}>This month's HD</Text>
                  <Text style={sectionText}>{topWish.description}</Text>
                </View>
              ) : null}
              {grantedThisCycle.length > 0 ? (
                <View>
                  <Text style={sectionLabel}>Wishes granted this cycle 🌟</Text>
                  {grantedThisCycle.map((wish) => (
                    <Text key={wish.id} style={sectionText}>
                      {getWishQuickTitle(wish, 72)}
                      {wish.granterNames.length > 0 ? (
                        <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>
                          {'  —  granted by '}{wish.granterNames.join(' & ')}
                        </Text>
                      ) : null}
                    </Text>
                  ))}
                </View>
              ) : null}
              {detailSections.map((section) => (
                <View key={section.key}>
                  <Text style={sectionLabel}>{section.label}</Text>
                  <Text style={sectionText}>{section.text}</Text>
                </View>
              ))}
              {assistsForMember.length > 0 ? (
                <View style={{ gap: sz(6, 4) }}>
                  <Text style={sectionLabel}>Done for {getFirstName(member.name)} this cycle 💛</Text>
                  {assistsForMember.map((assist) => {
                    const jot = parseActionItemDescription(assist.description);
                    return (
                      <View key={assist.id}>
                        <Text style={sectionText}>
                          {getFirstName(assist.assigneeName)}: {jot.text}
                        </Text>
                        {jot.context ? <Text style={sectionContext}>{jot.context}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {assistsByMember.length > 0 ? (
                <View style={{ gap: sz(6, 4) }}>
                  <Text style={sectionLabel}>{getFirstName(member.name)} checked off ✓</Text>
                  {/* Jots arrive as raw routing text ("@Nat do the thing (re:
                      Someone's HummDinger)") — the @token and re: subject are
                      addressing, not reading material, so they drop to a quiet
                      second line the way the Home to-do list shows them. */}
                  {assistsByMember.map((assist) => {
                    const jot = parseActionItemDescription(assist.description);
                    return (
                      <View key={assist.id}>
                        <Text style={sectionText}>{jot.text}</Text>
                        {jot.context ? <Text style={sectionContext}>{jot.context}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <View style={{ borderTopWidth: 1, borderColor: GOLD_SOFT, paddingTop: sz(14, 9), gap: sz(8, 6) }}>
                <Text style={sectionLabel}>Live note → to-do list</Text>
                {/* What the note is ABOUT, which is not always the card it's
                    taken on. Picking an HD links the to-do to that wish and
                    leaves the note as a comment there; "Not about an HD" files
                    a plain to-do about the member and touches no wish. */}
                {memberWishList.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sz(6, 4) }}>
                    <Text style={{ ...sectionContext, marginRight: sz(2, 1) }}>About:</Text>
                    {[
                      ...memberWishList.map((wish) => ({ id: wish.id, label: getWishQuickTitle(wish, 30) })),
                      { id: null, label: 'Not about an HD' },
                    ].map((option) => {
                      const selected = liveNoteWishId === option.id;
                      return (
                        <Pressable
                          key={option.id ?? 'no-hd'}
                          onPress={() => setLiveNoteWishId(option.id)}
                          style={({ pressed }) => ({
                            paddingHorizontal: sz(12, 9),
                            paddingVertical: sz(5, 4),
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: selected ? GOLD : GOLD_SOFT,
                            backgroundColor: selected ? tintWash(0.22) : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Text
                            style={{
                              fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                              fontSize: sz(14, 10),
                              color: selected ? GOLD_DEEP : MUTED,
                            }}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {/* The jot box. Mentions, the "@" suggestions list and the
                    microphone all come from the shared composer now, so the
                    suggestion list this screen used to draw by hand is gone.
                    Enter files the jot; Shift+Enter is the newline. Mid-meeting
                    you're typing fast — reaching for the button broke the flow.
                    The mic matters most right here: the room is talking, and
                    saying the to-do out loud is faster than typing it. */}
                <ComposerBar
                  variant="form"
                  value={liveNoteDraft}
                  onChangeText={(next) => {
                    setLiveNoteDraft((previous) => (typeof next === 'function' ? next(previous) : next));
                    if (liveNoteConfirmation) setLiveNoteConfirmation(null);
                  }}
                  placeholder={`Jot a to-do — it lands on ${getFirstName(member.name)}'s list. Start a word with @ (like @Charlee, or @all) to send it to them instead.`}
                  onSubmit={() => handleSaveLiveNote(member, liveNoteWishId)}
                  // Deliberately not `submitting`: a jot saves in a blink and
                  // the room keeps talking, so the box must stay typeable the
                  // whole time. Double-firing is already impossible —
                  // handleSaveLiveNote bows out while a save is in flight.
                  minHeight={sz(64, 48)}
                  fieldClassName={isTV ? 'text-[17px]' : 'text-[12px]'}
                  // No currentUserId on purpose: whoever is typing must still be
                  // able to put a to-do on their OWN list with "@their name".
                  mentionMembers={members}
                  mentionReach={mentionReach}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(12, 8) }}>
                  <Pressable
                    onPress={() => handleSaveLiveNote(member, liveNoteWishId)}
                    disabled={liveNoteSaving || !liveNoteDraft.trim()}
                    style={({ pressed }) => ({
                      paddingHorizontal: sz(22, 16),
                      paddingVertical: sz(9, 7),
                      borderRadius: 999,
                      backgroundColor: GOLD,
                      opacity: pressed || liveNoteSaving || !liveNoteDraft.trim() ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: 'white' }}>
                      {liveNoteSaving ? 'Saving…' : 'Add to list'}
                    </Text>
                  </Pressable>
                  {liveNoteConfirmation ? (
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), color: GOLD_DEEP, flexShrink: 1 }}>
                      {liveNoteConfirmation}
                    </Text>
                  ) : null}
                </View>
                {liveNotesTaken.filter((note) => note.aboutId === member.id).map((note) => (
                  <View key={note.id} style={{ flexDirection: 'row', gap: sz(8, 6), alignItems: 'flex-start' }}>
                    <View style={{ paddingTop: sz(3, 2) }}>
                      <Text style={{ fontSize: sz(15, 12) }}>📝</Text>
                    </View>
                    <Text style={{ flex: 1, fontFamily: 'Lato_400Regular', fontSize: sz(15, 11), lineHeight: sz(22, 16), color: CHARCOAL }}>
                      {note.text}
                      <Text style={{ fontFamily: 'Lato_700Bold', color: GOLD_DEEP }}>  → {note.assignees}</Text>
                    </Text>
                    <Pressable onPress={() => handleUndoLiveNote(note.id)} hitSlop={8}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(15, 11), color: MUTED }}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </BounceScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderWrapup = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: sz(30, 18) }}>
        <View>
          <Kicker>Priorities · take it home</Kicker>
          <SlideTitle>Wrap-Up</SlideTitle>
        </View>
        <EditPill noteKey="wrapup" />
      </View>
      <NoteBody
        noteKey="wrapup"
        emptyText="No wrap-up notes yet — decisions made tonight can land here."
      />
      {/* The meeting happens IN the app now, so the summary writes itself:
          everything that changed today, straight from the database. */}
      {tonightRecap &&
      (tonightRecap.events.length > 0 ||
        tonightRecap.todoCount > 0 ||
        tonightRecap.wishComments > 0 ||
        tonightRecap.granted.length > 0 ||
        tonightRecap.threads.length > 0) ? (
        <View
          style={{
            marginTop: sz(26, 14),
            backgroundColor: tintWash(0.12),
            borderWidth: 1,
            borderColor: GOLD_SOFT,
            borderRadius: sz(20, 14),
            paddingHorizontal: sz(24, 14),
            paddingVertical: sz(18, 11),
            gap: sz(8, 5),
          }}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), letterSpacing: 2, textTransform: 'uppercase', color: GOLD_DEEP }}>
            📸 Tonight in the app
          </Text>
          {tonightRecap.events.length > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              🗓️ Scheduled: {tonightRecap.events.join(' · ')}
            </Text>
          ) : null}
          {tonightRecap.todoCount > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              ✅ {tonightRecap.todoCount} to-do{tonightRecap.todoCount === 1 ? '' : 's'} handed out across {tonightRecap.todoPeople} list{tonightRecap.todoPeople === 1 ? '' : 's'}
            </Text>
          ) : null}
          {tonightRecap.wishComments > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              💬 {tonightRecap.wishComments} note{tonightRecap.wishComments === 1 ? '' : 's'} left on wishes
            </Text>
          ) : null}
          {tonightRecap.granted.length > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              🌟 Granted: {tonightRecap.granted.join(' · ')}
            </Text>
          ) : null}
          {tonightRecap.threads.length > 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: CHARCOAL }}>
              📌 New threads: {tonightRecap.threads.join(' · ')}
            </Text>
          ) : null}
          <Pressable
            onPress={handleSealMeeting}
            disabled={sealState === 'saving' || sealState === 'done'}
            style={{
              alignSelf: 'flex-start',
              marginTop: sz(10, 6),
              backgroundColor: sealState === 'done' ? accentWash(0.16) : GOLD,
              borderWidth: sealState === 'done' ? 1 : 0,
              borderColor: GOLD_SOFT,
              borderRadius: 999,
              paddingHorizontal: sz(22, 14),
              paddingVertical: sz(11, 8),
            }}
          >
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: sz(17, 12),
                color: sealState === 'done' ? GOLD_DEEP : '#ffffff',
              }}
            >
              {sealState === 'saving'
                ? 'Sealing…'
                : sealState === 'done'
                  ? '✓ Sealed — it’s in Meeting Summaries'
                  : sealState === 'error'
                    ? 'Hmm, try sealing again'
                    : '🍯 Seal tonight’s notes → Meeting Summaries'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={{
          // Was 40/22 of top margin — the reminders card is what nudged this
          // slide past one screen (one-page rule).
          marginTop: sz(26, 16),
          backgroundColor: CARD,
          borderWidth: 1,
          borderColor: GOLD_SOFT,
          borderRadius: sz(22, 16),
          padding: sz(30, 16),
          gap: sz(14, 9),
        }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(19, 12), letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
          Standing reminders
        </Text>
        {deck.wrapupReminders.map((reminder) => {
          // A reminder that names a web address should be tappable — Nat,
          // 2026-08-14: *"if that could be a hyperlink, that's even better."*
          const url = reminder.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i)?.[0] ?? null;
          const body = (
            <Text style={{ flex: 1, fontFamily: 'Lato_400Regular', fontSize: sz(24, 14), lineHeight: sz(34, 21), color: url ? GOLD_DEEP : CHARCOAL, textDecorationLine: url ? 'underline' : 'none' }}>
              {reminder}
            </Text>
          );
          return (
            <View key={reminder} style={{ flexDirection: 'row', alignItems: 'baseline', gap: sz(12, 8) }}>
              <View style={{ width: sz(9, 6), height: sz(9, 6), borderRadius: 999, backgroundColor: GOLD, transform: [{ translateY: -2 }] }} />
              {url ? (
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => Linking.openURL(url.startsWith('http') ? url : `https://${url}`)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${url}`}
                >
                  {body}
                </Pressable>
              ) : body}
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderThanks = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={hiveBee}
        style={{ width: sz(190, 100), height: sz(190, 100) }}
        contentFit="contain"
      />
      <Text
        style={{
          fontFamily: 'LibreBaskerville_700Bold',
          fontSize: sz(78, 36),
          color: CHARCOAL,
          marginTop: sz(28, 16),
        }}
      >
        Thank you
      </Text>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(26, 15), color: MUTED, marginTop: sz(14, 8) }}>
        See you next month.
      </Text>
    </View>
  );

  /**
   * Production's answer to the HummDinger slide: the jobs, and who takes them.
   *
   * The questions are printed under each job on purpose. A to-do that says
   * "call a rigging vendor" and nothing else is the thing Nat named as useless
   * — the person who takes it has to already know what to ask, and now they do,
   * because the questions travel with the to-do into their list.
   */
  const renderAssignments = () => (
    <View style={{ flex: 1 }}>
      <Kicker>Who takes what</Kicker>
      <SlideTitle>The jobs</SlideTitle>
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontStyle: 'italic',
          fontSize: sz(24, 14),
          lineHeight: sz(36, 21),
          color: MUTED,
          marginBottom: sz(22, 14),
          maxWidth: 720,
        }}
      >
        Each one turns a blank on the research site into a real number. Tap a job,
        say who is taking it, and it lands on their list with the questions already in it.
      </Text>
      <BounceScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: sz(220, 160), gap: sz(12, 8) }}>
        {PRODUCTION_JOBS.map((job) => {
          const open = openJobKey === job.key;
          const takenBy = jobsAssigned[job.key];
          return (
            <View
              key={job.key}
              style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: takenBy ? GOLD : GOLD_SOFT,
                borderRadius: sz(18, 14),
                overflow: 'hidden',
              }}
            >
              <Pressable
                onPress={() => setOpenJobKey(open ? null : job.key)}
                accessibilityRole="button"
                accessibilityLabel={`${job.title}${takenBy ? `, taken by ${takenBy}` : ''}`}
                style={{ paddingHorizontal: sz(24, 16), paddingVertical: sz(18, 13) }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sz(12, 8) }}>
                  <Text style={{ flex: 1, fontFamily: 'Lato_700Bold', fontSize: sz(26, 16), color: CHARCOAL }}>
                    {job.title}
                  </Text>
                  {takenBy ? (
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 13), color: GOLD_DEEP }}>
                      {takenBy} ✓
                    </Text>
                  ) : (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), color: MUTED }}>
                      {open ? 'Close' : 'Who?'}
                    </Text>
                  )}
                </View>
                {!open && (
                  <Text
                    numberOfLines={2}
                    style={{ fontFamily: 'Lato_400Regular', fontSize: sz(20, 13), lineHeight: sz(30, 19), color: MUTED, marginTop: sz(6, 4) }}
                  >
                    {job.why}
                  </Text>
                )}
              </Pressable>

              {open && (
                <View style={{ paddingHorizontal: sz(24, 16), paddingBottom: sz(20, 14) }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(21, 13), lineHeight: sz(32, 20), color: MUTED, marginBottom: sz(14, 10) }}>
                    {job.why}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(18, 12), letterSpacing: 2, textTransform: 'uppercase', color: GOLD_DEEP, marginBottom: sz(8, 6) }}>
                    What to ask
                  </Text>
                  {job.asks.map((ask) => (
                    <Text
                      key={ask}
                      style={{ fontFamily: 'Lato_400Regular', fontSize: sz(21, 13), lineHeight: sz(32, 20), color: CHARCOAL, marginBottom: sz(4, 3) }}
                    >
                      · {ask}
                    </Text>
                  ))}
                  <TextInput
                    value={jobDrafts[job.key] ?? ''}
                    onChangeText={(text) => setJobDrafts((drafts) => ({ ...drafts, [job.key]: text }))}
                    placeholder="@name — and anything else worth remembering"
                    placeholderTextColor={MUTED}
                    multiline
                    style={{
                      marginTop: sz(16, 12),
                      minHeight: sz(70, 52),
                      borderWidth: 1,
                      borderColor: GOLD_SOFT,
                      borderRadius: sz(14, 11),
                      paddingHorizontal: sz(16, 12),
                      paddingVertical: sz(12, 9),
                      fontFamily: 'Lato_400Regular',
                      fontSize: sz(22, 14),
                      color: CHARCOAL,
                      backgroundColor: '#fff',
                    }}
                  />
                  <Pressable
                    onPress={() => handleAssignJob(job)}
                    disabled={jobSaving === job.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Put ${job.title} on their list`}
                    style={({ pressed }) => ({
                      alignSelf: 'flex-start',
                      marginTop: sz(12, 9),
                      backgroundColor: GOLD,
                      borderRadius: 999,
                      paddingHorizontal: sz(26, 18),
                      paddingVertical: sz(12, 9),
                      opacity: pressed || jobSaving === job.key ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(21, 14), color: '#fff' }}>
                      {jobSaving === job.key ? 'Adding…' : 'Put it on their list'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </BounceScrollView>
    </View>
  );

  // The show, in the order this HIVE's deck declares it. Every renderer knows
  // how to wear any deck's content, so a new HIVE's deck is a new list in
  // DECKS — the renderers stay shared.
  const SLIDE_RENDERERS: Record<DeckSlideKey, () => React.ReactNode> = {
    room: renderRoom,
    outline: renderOutline,
    news: renderNews,
    treasurer: renderTreasurer,
    meetups: renderMeetups,
    hummdinger: renderHummdinger,
    assignments: renderAssignments,
    wrapup: renderWrapup,
    thanks: renderThanks,
  };
  const slides = deck.slides.map((key) => ({ key, render: SLIDE_RENDERERS[key] }));

  const slideCount = slides.length;
  const clampedIndex = Math.min(slideIndex, slideCount - 1);
  const activeSlide = slides[clampedIndex];

  const goNext = useCallback(() => {
    setSlideIndex((index) => Math.min(index + 1, slideCount - 1));
  }, [slideCount]);

  const goPrev = useCallback(() => {
    setSlideIndex((index) => Math.max(index - 1, 0));
  }, []);

  // Keyboard navigation on web: ← → and Space (the TV/laptop use case).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (event: any) => {
      if (editKey !== null) return; // don't page while the edit modal is open
      if (event.key === 'ArrowRight' || event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editKey, goNext, goPrev]);

  const navStripWidth = sz(96, 52);
  // The plan slide's name is per-deck ("Plan the Meet Ups" / "Plan"), so its
  // edit modal says whichever name is on the slide being edited.
  const editMeta = editKey
    ? { ...EDIT_SLIDE_META[editKey], ...(editKey === 'meetups' ? { title: deck.plan.title } : null) }
    : null;

  // The frozen agenda rail (wide screens): analog clock + countdown on top,
  // tonight's outline below with the current stop in gold, and the HummDinger
  // roster showing who's been through, who's up, and who's still to go.
  const showRail = isTV || width >= 1000;

  const renderRail = () => {
    const [hour, minute] = hardOutTime.split(':').map(Number);
    const hardOutDate = new Date(clockNow);
    hardOutDate.setHours(hour, minute, 0, 0);
    const minutesLeft = Math.round((hardOutDate.getTime() - clockNow.getTime()) / 60_000);
    const meetingIsNear = minutesLeft > 0 && minutesLeft <= 180;
    const clockLabel = clockNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const hardOutLabel = hardOutDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const leftLabel =
      minutesLeft <= 0
        ? `past ${hardOutLabel} 🌙`
        : minutesLeft >= 60
          ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m 'til ${hardOutLabel}`
          : `${minutesLeft} min 'til ${hardOutLabel}`;
    const clockSize = sz(110, 84);
    const hourAngle = (clockNow.getHours() % 12) * 30 + clockNow.getMinutes() * 0.5;
    const minuteAngle = clockNow.getMinutes() * 6;
    const activeKey = activeSlide.key;
    const membersToGo = memberOrder.filter((member) => !hummdingerVisited.has(member.id)).length;
    const hdPaceMinutes =
      meetingIsNear && activeKey === 'hummdinger' && membersToGo > 0
        ? Math.max(1, Math.floor(minutesLeft / membersToGo))
        : null;

    return (
      <View
        style={{
          width: sz(300, 224),
          borderLeftWidth: 1,
          borderColor: GOLD_SOFT,
          backgroundColor: 'rgba(255,253,245,0.75)',
          paddingHorizontal: sz(22, 14),
          paddingTop: sz(28, 16),
          paddingBottom: sz(20, 12),
        }}
      >
        <Pressable
          onPress={() => {
            setHardOutDraft('');
            setShowHardOutEditor(true);
          }}
          style={({ pressed }) => ({ alignItems: 'center', gap: sz(8, 5), opacity: pressed ? 0.75 : 1 })}
        >
          <View
            style={{
              width: clockSize,
              height: clockSize,
              borderRadius: clockSize / 2,
              borderWidth: 2,
              borderColor: GOLD,
              backgroundColor: CARD,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {[0, 90, 180, 270].map((angle) => (
              <View
                key={angle}
                style={{
                  position: 'absolute',
                  width: 2,
                  height: clockSize * 0.08,
                  backgroundColor: GOLD_SOFT,
                  transform: [{ rotate: `${angle}deg` }, { translateY: -clockSize * 0.4 }],
                }}
              />
            ))}
            <View
              style={{
                position: 'absolute',
                width: 3,
                height: clockSize * 0.24,
                borderRadius: 2,
                backgroundColor: CHARCOAL,
                transform: [{ rotate: `${hourAngle}deg` }, { translateY: -clockSize * 0.12 }],
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: 2,
                height: clockSize * 0.34,
                borderRadius: 2,
                backgroundColor: GOLD_DEEP,
                transform: [{ rotate: `${minuteAngle}deg` }, { translateY: -clockSize * 0.17 }],
              }}
            />
            <View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: GOLD_DEEP }} />
          </View>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(20, 14), color: CHARCOAL }}>{clockLabel}</Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: sz(15, 10),
              color: minutesLeft <= 15 && minutesLeft > 0 ? '#b3261e' : MUTED,
              textAlign: 'center',
            }}
          >
            {leftLabel}
          </Text>
        </Pressable>

        <View style={{ height: 1, backgroundColor: GOLD_SOFT, marginVertical: sz(18, 11) }} />

        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(14, 10), letterSpacing: 2, textTransform: 'uppercase', color: GOLD, marginBottom: sz(10, 7) }}>
          Tonight
        </Text>
        {/* A long roster can outgrow the rail, so it scrolls — and bounces at
            its ends like every other scroller, so a full list says so. */}
        <BounceScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {deck.agenda.map((item, agendaIndex) => {
            const slidePosition = slides.findIndex((slide) => slide.key === item.key);
            const isActive = activeKey === item.key;
            return (
              <View key={item.key}>
                <Pressable
                  onPress={() => setSlideIndex(slidePosition)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: sz(10, 7),
                    paddingVertical: sz(7, 5),
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: sz(17, 12), color: isActive ? GOLD_DEEP : accentWash(0.45) }}>
                    {agendaIndex + 1}
                  </Text>
                  <Text
                    style={{
                      fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular',
                      fontSize: sz(18, 12),
                      color: isActive ? GOLD_DEEP : 'rgba(49,49,48,0.45)',
                      flex: 1,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
                {item.key === 'hummdinger' ? (
                  <View style={{ paddingLeft: sz(26, 18), paddingBottom: sz(6, 4) }}>
                    {hdPaceMinutes !== null ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 9), color: '#b3261e', marginBottom: sz(4, 3) }}>
                        {membersToGo} to go · ≈{hdPaceMinutes} min each
                      </Text>
                    ) : null}
                    {memberOrder.map((member) => {
                      const isUp = expandedHummdingerId === member.id;
                      const wasVisited = hummdingerVisited.has(member.id) && !isUp;
                      const railAttendance = getAttendance(responsesByUser.get(member.id));
                      const attendanceMark =
                        railAttendance === 'missing' ? ' 😢' : railAttendance === 'remote' ? ' 💻' : '';
                      return (
                        <Text
                          key={member.id}
                          numberOfLines={1}
                          style={{
                            fontFamily: isUp ? 'Lato_700Bold' : 'Lato_400Regular',
                            fontSize: sz(15, 10),
                            lineHeight: sz(23, 16),
                            color: isUp
                              ? GOLD_DEEP
                              : wasVisited
                                ? 'rgba(49,49,48,0.28)'
                                : activeKey === 'hummdinger'
                                  ? 'rgba(49,49,48,0.6)'
                                  : 'rgba(49,49,48,0.35)',
                          }}
                        >
                          {wasVisited ? '✓ ' : isUp ? '→ ' : '· '}
                          {getFirstName(member.name)}{attendanceMark}
                        </Text>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </BounceScrollView>
      </View>
    );
  };

  // Until auth has loaded, nobody is anywhere — same guard monthly-tuneup.tsx
  // uses, so OG never flashes the coming-soon screen while `community` is
  // still on its way in.
  if (!profile) return null;

  // Only HIVEs with a designed deck in DECKS get past this door — OG, Tech
  // since 2026-08-11, and Production since 2026-08-14. A bookmarked or typed
  // /meeting-helper URL cannot open a deck while somebody is standing in a
  // HIVE that doesn't have one yet.
  //
  // **This gate has a sibling one floor up**, on the Meeting Helper tile in
  // `meetings.tsx`. On 2026-08-14 Production's deck shipped, this door opened,
  // and the button in front of it still read "coming soon" — because only one
  // of the two had been changed. If you ever add a fourth HIVE's deck, change
  // both, and check the tile before calling it done.
  if (!hasMeetingDeck(community)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="time-outline" size={34} color={GOLD_DEEP} style={{ marginBottom: 14 }} />
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 22,
              color: '#2d2d2d',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            Meeting Helper
          </Text>
          <Text
            accessibilityRole="text"
            style={{
              maxWidth: 420,
              fontFamily: 'Lato_400Regular',
              fontSize: 16,
              lineHeight: 24,
              color: '#7d715f',
              textAlign: 'center',
              marginBottom: 26,
            }}
          >
            {CHECK_INS_COMING_SOON_MESSAGE}
          </Text>
          <Pressable
            onPress={closeDeck}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${from === 'admin' ? 'Admin' : 'Meetings'}`}
            style={({ pressed }) => ({
              backgroundColor: GOLD,
              borderRadius: 14,
              paddingHorizontal: 28,
              paddingVertical: 13,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>
              Back to {from === 'admin' ? 'Admin' : 'Meetings'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }} edges={['top']}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1 }}>
        {/* Corner watermark on every slide */}
        <Image
          source={hiveBee}
          style={{
            position: 'absolute',
            right: sz(-40, -24),
            bottom: sz(-30, -18),
            width: sz(360, 190),
            height: sz(360, 190),
            opacity: 0.06,
          }}
          contentFit="contain"
          pointerEvents="none"
        />

        {/* Slide content. BounceScrollView, because most slides fit the screen
            and a page that fits is exactly the case Nat named: a scroll that
            refuses to move reads as broken unless it bounces to say "that's
            all". */}
        <BounceScrollView
          key={activeSlide.key}
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: contentPadH,
            paddingTop: contentPadTop,
            paddingBottom: contentPadBottom,
            minHeight: height - 120,
          }}
        >
          {activeSlide.render()}
        </BounceScrollView>

        {/* Edge navigation: tap zones with quiet chevrons */}
        {clampedIndex > 0 ? (
          <Pressable
            onPress={goPrev}
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            style={({ pressed }) => ({
              position: 'absolute',
              left: 0,
              top: sz(90, 60),
              bottom: sz(70, 54),
              width: navStripWidth,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 1 : 0.35,
            })}
          >
            <Ionicons name="chevron-back" size={sz(46, 28)} color={GOLD} />
          </Pressable>
        ) : null}
        {clampedIndex < slideCount - 1 ? (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next slide"
            style={({ pressed }) => ({
              position: 'absolute',
              right: 0,
              top: sz(90, 60),
              bottom: sz(70, 54),
              width: navStripWidth,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 1 : 0.35,
            })}
          >
            <Ionicons name="chevron-forward" size={sz(46, 28)} color={GOLD} />
          </Pressable>
        ) : null}

        {/* Quiet top controls: exit + refresh */}
        <Pressable
          onPress={closeDeck}
          accessibilityRole="button"
          accessibilityLabel="Leave the deck"
          hitSlop={10}
          style={({ pressed }) => ({
            position: 'absolute',
            top: sz(22, 12),
            left: sz(26, 14),
            opacity: pressed ? 0.9 : 0.35,
          })}
        >
          <Ionicons name="close" size={sz(30, 22)} color={GOLD_DEEP} />
        </Pressable>
        <Pressable
          onPress={() => void refreshDeck()}
          accessibilityRole="button"
          accessibilityLabel="Refresh deck data"
          hitSlop={10}
          style={({ pressed }) => ({
            position: 'absolute',
            top: sz(22, 12),
            right: sz(26, 14),
            opacity: pressed ? 0.9 : 0.35,
          })}
        >
          {deckRefreshing ? (
            <ThinkingBee />
          ) : (
            <Ionicons name="refresh" size={sz(28, 20)} color={GOLD_DEEP} />
          )}
        </Pressable>

        {/* Footer: tagline + slide counter */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: sz(40, 18),
            paddingBottom: sz(24, 14),
          }}
        >
          <View style={{ flex: 1 }} />
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: sz(15, 9),
              letterSpacing: sz(4, 2.5),
              color: accentWash(0.65),
              textAlign: 'center',
            }}
          >
            {TAGLINE}
          </Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(17, 11), color: 'rgba(154,128,96,0.7)' }}>
              {clampedIndex + 1} / {slideCount}
            </Text>
          </View>
        </View>

        {/* Compact timekeeper for narrow screens — wide screens get the full
            agenda rail instead. Pace hint only appears once the meeting is
            actually near (within 3h of the hard-out) — at lunchtime it's noise. */}
        {!showRail && (() => {
          const [hour, minute] = hardOutTime.split(':').map(Number);
          const hardOutDate = new Date(clockNow);
          hardOutDate.setHours(hour, minute, 0, 0);
          const minutesLeft = Math.round((hardOutDate.getTime() - clockNow.getTime()) / 60_000);
          const slidesLeft = Math.max(1, slideCount - clampedIndex);
          const meetingIsNear = minutesLeft > 0 && minutesLeft <= 180;
          const paceMinutes = meetingIsNear ? Math.max(1, Math.floor(minutesLeft / slidesLeft)) : null;
          const clockLabel = clockNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const hardOutLabel = hardOutDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const leftLabel =
            minutesLeft <= 0
              ? `past ${hardOutLabel} 🌙`
              : minutesLeft >= 60
                ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m 'til ${hardOutLabel}`
                : `${minutesLeft} min 'til ${hardOutLabel}`;
          const clockSize = sz(96, 54);
          const hourAngle = (clockNow.getHours() % 12) * 30 + clockNow.getMinutes() * 0.5;
          const minuteAngle = clockNow.getMinutes() * 6;
          return (
            <Pressable
              onPress={() => {
                setHardOutDraft('');
                setHardOutMeridiem('PM');
                setShowHardOutEditor(true);
              }}
              style={({ pressed }) => ({
                position: 'absolute',
                right: sz(28, 10),
                bottom: sz(72, 52),
                alignItems: 'center',
                gap: sz(8, 5),
                backgroundColor: 'rgba(255,253,245,0.94)',
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                borderRadius: sz(20, 14),
                paddingHorizontal: sz(16, 10),
                paddingVertical: sz(14, 9),
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: clockSize,
                  height: clockSize,
                  borderRadius: clockSize / 2,
                  borderWidth: 2,
                  borderColor: GOLD,
                  backgroundColor: CARD,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {[0, 90, 180, 270].map((angle) => (
                  <View
                    key={angle}
                    style={{
                      position: 'absolute',
                      width: 2,
                      height: clockSize * 0.08,
                      backgroundColor: GOLD_SOFT,
                      transform: [{ rotate: `${angle}deg` }, { translateY: -clockSize * 0.4 }],
                    }}
                  />
                ))}
                <View
                  style={{
                    position: 'absolute',
                    width: 3,
                    height: clockSize * 0.24,
                    borderRadius: 2,
                    backgroundColor: CHARCOAL,
                    transform: [{ rotate: `${hourAngle}deg` }, { translateY: -clockSize * 0.12 }],
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    width: 2,
                    height: clockSize * 0.34,
                    borderRadius: 2,
                    backgroundColor: GOLD_DEEP,
                    transform: [{ rotate: `${minuteAngle}deg` }, { translateY: -clockSize * 0.17 }],
                  }}
                />
                <View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD_DEEP }} />
              </View>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: sz(17, 11), color: CHARCOAL }}>
                {clockLabel}
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: sz(14, 9),
                  color: minutesLeft <= 15 && minutesLeft > 0 ? '#b3261e' : MUTED,
                  textAlign: 'center',
                }}
              >
                {leftLabel}
              </Text>
              {paceMinutes !== null ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: sz(13, 8), color: MUTED, textAlign: 'center' }}>
                  ≈{paceMinutes} min each for the{'\n'}{slidesLeft} slide{slidesLeft === 1 ? '' : 's'} left
                </Text>
              ) : null}
            </Pressable>
          );
        })()}

        {/* Admin note editor */}
        <Modal
          visible={editKey !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditKey(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(49,49,48,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 720,
                backgroundColor: CARD,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                padding: 24,
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: CHARCOAL }}>
                Edit — {editMeta?.title ?? ''}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: MUTED, marginTop: 4 }}>
                Shows on the slide exactly as written. Line breaks are kept.
              </Text>
              {/* Editing a slide in place, so this is the composer's
                  edit-in-place shape: the same box, with Cancel and Save on the
                  strip inside its own border. Enter makes a new line here —
                  these notes are paragraphs, and the slide keeps the breaks. */}
              <ComposerBar
                variant="inlineEdit"
                containerClassName="mt-4"
                value={editDraft}
                onChangeText={(next) => setEditDraft((previous) => (typeof next === 'function' ? next(previous) : next))}
                placeholder={editMeta?.placeholder}
                minHeight={220}
                autoFocus
                submitOnEnterKey={false}
                onSubmit={() => void saveNote()}
                // An empty note is a real answer — it clears the slide — so
                // Save stays live even with nothing in the box.
                canSubmit={!savingNote}
                submitting={savingNote}
                submitLabel="Save"
                onCancel={() => setEditKey(null)}
              />
            </View>
          </View>
        </Modal>

        {/* Quick-add: pencil in a hang from a tapped calendar day */}
        <Modal
          visible={!!quickAddDate}
          animationType="fade"
          transparent
          onRequestClose={() => setQuickAddDate(null)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onPress={() => setQuickAddDate(null)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 460,
                backgroundColor: PAPER,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: CHARCOAL }}>
                Pencil it in
              </Text>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: GOLD_DEEP }}>
                {quickAddDate ? formatMeetingDate({ title: '', event_date: quickAddDate, event_time: null }) : ''}
              </Text>
              {/* Naming the hang is words — "Pool day at Charlee's" — so it
                  gets the composer and its microphone. */}
              <ComposerBar
                variant="form"
                value={quickAddTitle}
                onChangeText={(next) => setQuickAddTitle((previous) => (typeof next === 'function' ? next(previous) : next))}
                placeholder="What's the hang? (e.g. Pool day at Charlee's)"
                multiline={false}
                autoFocus
                onSubmit={handleQuickAddEvent}
                // The Add button is always live and explains what's missing;
                // Enter behaves the same way rather than going quiet.
                canSubmit={!quickAddSaving}
                submitting={quickAddSaving}
              />
              {/* A clock time is not words — nobody wants to dictate "2:30 PM" —
                  so this keeps a plain field, wearing the composer's colours. */}
              <TextInput
                value={quickAddTime}
                onChangeText={setQuickAddTime}
                placeholder="Time (optional — e.g. 2:30 PM)"
                placeholderTextColor={PLACEHOLDER_INK}
                onSubmitEditing={handleQuickAddEvent}
                style={PLAIN_FIELD}
              />
              <EventAudienceToggle value={quickAddAudience} onChange={setQuickAddAudience} />
              {quickAddError ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#b3261e' }}>
                  {quickAddError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => setQuickAddDate(null)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 18,
                    paddingVertical: 10,
                    borderRadius: 12,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: MUTED }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleQuickAddEvent}
                  disabled={quickAddSaving}
                  style={({ pressed }) => ({
                    paddingHorizontal: 26,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: GOLD,
                    opacity: pressed || quickAddSaving ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>
                    {quickAddSaving ? 'Adding…' : 'Add to calendar'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* HummDinger spotlight — one member's full story, grid stays put */}
        {renderHummdingerSpotlight()}

        {/* Full meeting scheduler — same one as the Meetings page, seeded
            with the tapped calendar day */}
        <ScheduleMeetingModal
          visible={!!meetingSchedulerDate}
          onClose={() => setMeetingSchedulerDate(null)}
          communityId={communityId ?? null}
          initialDate={meetingSchedulerDate}
          onSchedule={async (data) => {
            await handleScheduleMeetingFromDeck(data);
            setMeetingSchedulerDate(null);
          }}
        />

        {/* Hard-out editor — "anyone got a hard out tonight?" */}
        <Modal
          visible={showHardOutEditor}
          animationType="fade"
          transparent
          onRequestClose={() => setShowHardOutEditor(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onPress={() => setShowHardOutEditor(false)}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 420,
                backgroundColor: PAPER,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: GOLD_SOFT,
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: CHARCOAL }}>
                Tonight's hard out
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 20, color: MUTED }}>
                When should the countdown aim for? No hard stop — people are always welcome to hang after.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* A clock time, so no microphone — the same plain field as
                    the quick-add time box, in the composer's colours. */}
                <TextInput
                  value={hardOutDraft}
                  onChangeText={setHardOutDraft}
                  placeholder="e.g. 8:00"
                  placeholderTextColor={PLACEHOLDER_INK}
                  autoFocus
                  style={[PLAIN_FIELD, { flex: 1 }]}
                />
                <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: GOLD_SOFT, borderRadius: 999, overflow: 'hidden' }}>
                  {(['AM', 'PM'] as const).map((meridiem) => (
                    <Pressable
                      key={meridiem}
                      onPress={() => setHardOutMeridiem(meridiem)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: hardOutMeridiem === meridiem ? GOLD : 'transparent',
                      }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: hardOutMeridiem === meridiem ? 'white' : MUTED }}>
                        {meridiem}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Pressable
                  onPress={() => setShowHardOutEditor(false)}
                  style={({ pressed }) => ({ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, opacity: pressed ? 0.7 : 1 })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: MUTED }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const normalized = normalizeEventTimeInput(hardOutDraft);
                    if (normalized.time) {
                      let [hour, minute] = normalized.time.split(':').map(Number);
                      // The toggle only kicks in when the text itself didn't
                      // say am/pm — explicit text always wins.
                      if (!/\b(am|pm)\b/i.test(hardOutDraft)) {
                        if (hardOutMeridiem === 'PM' && hour < 12) hour += 12;
                        if (hardOutMeridiem === 'AM' && hour >= 12) hour -= 12;
                      }
                      setHardOutTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                      setShowHardOutEditor(false);
                    }
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 26,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: GOLD,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>Set</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>

      {/* Frozen agenda rail — clock, outline, and the HummDinger roster */}
      {showRail ? renderRail() : null}
      </View>
    </SafeAreaView>
  );
}

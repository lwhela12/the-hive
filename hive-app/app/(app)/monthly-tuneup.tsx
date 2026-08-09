import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { invalidateWishQueries, queryClient, queryKeys } from '../../lib/queryClient';
import {
  getStoredItemAsync,
  removeStoredItemAsync,
  setStoredItemAsync,
} from '../../lib/webStorage';
import { deleteWishById } from '../../lib/wishMutations';
import { getCycleStart, getHalfwayDoneKey } from '../../lib/meetingCycle';
import { useMentionableMembers, useMentionReach } from '../../lib/hooks/useMentionableMembers';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { useDeepTrail } from '../../lib/hooks/usePathTrail';
import { Avatar } from '../../components/ui/Avatar';
import { EventAudienceToggle, type EventAudience } from '../../components/events/EventAudienceToggle';
import {
  getGroupMentionSuggestions,
  getMentionTargetHandle,
  type MentionTarget,
} from '../../lib/mentions';
import { ConfettiBurst } from '../../components/ui/ConfettiBurst';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { HiveIcon } from '../../components/ui/HiveIcon';
import { pickSpotlightWish } from '../../lib/wishDisplay';
import { parseFocusAnswer, parseHangsAnswer } from '../../components/surveys/SurveyQuestionField';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';
import { useAuth } from '../../lib/hooks/useAuth';
import { useWishes } from '../../lib/hooks/useWishes';
import { usePrivacyChoices } from '../../lib/hooks/usePrivacyChoices';
import { Switch, SWITCH_GUTTER } from '../../components/ui/Switch';
import { ScopeBadge } from '../../components/ui/ScopeBadge';
import {
  getSurveyResponsePeriod,
  isMonthlyCheckInSurvey,
  useSurveys,
  type SurveyAnswers,
  type SurveyQuestion,
} from '../../lib/hooks/useSurveys';
import { SurveyQuestionField } from '../../components/surveys/SurveyQuestionField';
import { ComposerBar } from '../../components/ui/ComposerBar';
import { FIELD_LOOK } from '../../components/ui/Input';
import { WishCombCard } from '../../components/profile/WishCombCard';
import { WishManageModal } from '../../components/wishes/WishManageModal';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { parseAmericanDate } from '../../lib/dateUtils';
import type { Profile, Wish } from '../../types';
import { CHECK_INS_COMING_SOON_MESSAGE, hasTailoredCheckIns } from '../../lib/checkIns';

import { confirmAction, showAlert } from '../../lib/showAlert';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
const hiveBee = require('../../assets/HIVE Bee.png');
// The crest (bee inside a 30-ray sunburst ring) needs room to read — its
// content is only 47% of the asset box, so at header size it collapses into a
// smudge. The plain bee mark is one bold shape at 70% of its box: same brand,
// legible small. Crest stays on the big moments (Nat 2026-07-24).
const hiveBeeMark = require('../../assets/BEE ONLY IN GOLD BG.png');
// The full crest — same mark the General room wears, so "everyone" reads the
// same wherever you pick it.
const hiveCrest = require('../../assets/HIVE Logo Transparent  BG.png');

type StepKey = 'wishes' | 'hangs' | 'calendar' | 'helpers' | 'todos' | 'checkin' | 'newsletter' | 'reading' | 'profile' | 'privacy';
type Step = { key: StepKey; label: string };

const STEPS: Step[] = [
  { key: 'wishes', label: 'HD wishes' },
  { key: 'hangs', label: 'Hang ideas' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'helpers', label: 'Helpers' },
  { key: 'todos', label: 'To-dos' },
  // Light and quick, and it earns its place: it's mingle fodder for before the
  // meeting starts, so it doesn't have to take up floor time (Nat 2026-07-26).
  { key: 'reading', label: 'Reading' },
  // Every month, straight after Reading. Built as a quarterly thing, but it's
  // one page with everything on it rather than a click-through, so it reads as
  // one extra step rather than a chore — "it doesn't seem too long to me"
  // (Nat 2026-07-26, after walking it). Nobody edits their profile
  // unprompted; people DO answer a link that arrives, so it comes to them.
  { key: 'profile', label: 'Your profile' },
  // Nat's idea, and the only realistic way anyone but her ever turns
  // HIVE-Wide visibility on — surfacing the two Settings switches here, where
  // people already are, instead of leaving them to be found on a page nobody
  // goes looking for (2026-08-09).
  { key: 'privacy', label: 'Your settings' },
  { key: 'checkin', label: 'Check-in' },
];

// Fields the quarterly review walks through. Multi-line ones get a taller box.
const PROFILE_REVIEW_FIELDS: {
  column: string;
  label: string;
  prompt: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  { column: 'current_project', label: 'What you\u2019re focused on', prompt: 'Still what you\u2019re working on?', placeholder: 'The thing taking up your brain right now', multiline: true },
  { column: 'bio', label: 'Your bio', prompt: 'Still sound like you?', placeholder: 'A couple of lines about you', multiline: true },
  { column: 'known_for', label: 'Ask me about', prompt: 'Still what you want to be asked about?', placeholder: 'The thing you love being asked about' },
  { column: 'favorite_food', label: 'Favourite food', prompt: 'Still true?', placeholder: 'Go on' },
  { column: 'favorite_book', label: 'Favourite book', prompt: 'Still true?', placeholder: 'The one you press on people' },
  { column: 'favorite_hobby', label: 'Favourite hobby', prompt: 'Still true?', placeholder: 'What you do for the joy of it' },
];

// Halfway between meetings the ask is smaller and the reason is different: the
// newsletter goes out, so this walks you through the app instead of relying on
// you to remember to go update it (Nat 2026-07-25). Newsletter leads because
// it's why you got the nudge. Calendar and the full POP check-in belong to the
// meeting and stay out of it.
const MIDPOINT_STEPS: Step[] = [
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'todos', label: 'To-dos' },
  { key: 'helpers', label: 'HIVE Help' },
];

// What someone might want in the newsletter. Pills, not a blank box — the whole
// point is walking people through it rather than asking them to compose.
const NEWSLETTER_KINDS = [
  { key: 'shoutout', label: 'Shout-out', prompt: 'Who deserves a nod this month?' },
  { key: 'plug', label: 'Plug an event', prompt: '"Come to my lemonade stand Tuesday!"' },
  { key: 'reminder', label: 'A reminder', prompt: "What shouldn't the HIVE forget?" },
  { key: 'compliment', label: 'Compliment someone', prompt: '@ them and they get a little love note.' },
] as const;
type NewsletterKind = (typeof NEWSLETTER_KINDS)[number]['key'];

/**
 * Every room the tune-up can be closed back into, with the name the path along
 * the bottom calls it.
 *
 * A table rather than a chain of `if`s because the chain existed twice — once
 * on the back arrow, once on the X — and the two had already drifted apart:
 * the X had no branch for Home. One list means a new way in cannot be given a
 * door out on one button and not the other.
 */
const EXITS = {
  admin: { route: '/admin', label: 'Admin' },
  meetings: { route: '/meetings', label: 'Meetings' },
  profile: { route: '/profile', label: 'Profile' },
  hive: { route: '/hive', label: 'Home' },
} as const;
type ExitKey = keyof typeof EXITS;

type BoardTarget = { id: string; name: string };

type NewsletterEvent = {
  id: string;
  title: string;
  event_date: string;
  end_date?: string | null;
  event_time?: string | null;
  location?: string | null;
};

// The HIVE Helpers board holds one thread per month (e.g. "June Pay It Forward
// Success"); members log helps as replies on the current thread.
type HelperThread = {
  boardId: string;
  boardName: string;
  postId: string | null;
  postTitle: string | null;
  /** The focus thread's own description — "bring something to donate". */
  postContent: string | null;
};

// Wizard draft persisted across relaunches (per community + member).
type TuneupDraft = {
  savedAt?: number;
  stepIndex?: number;
  helperContent?: string;
  hangTitle?: string;
  hangContent?: string;
  eventTitle?: string;
  eventDate?: string;
  eventEndDate?: string;
  eventAllDay?: boolean;
  eventTime?: string;
  eventLocation?: string;
  checkInAnswers?: Record<string, unknown>;
};

// The halfway flow keeps its own draft — a half-finished full tune-up must
// not restore you into the middle of the short one, or vice versa.
const getTuneupDraftKey = (communityId: string, userId: string, midpoint = false) =>
  `the-hive:tuneup-draft:${communityId}:${userId}${midpoint ? ':midpoint' : ''}`;

function getFirstName(name?: string | null) {
  const trimmed = (name ?? '').trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

function getMonthNameFromPeriod(period?: string | null) {
  const match = (period ?? '').match(/^(\d{4})-(\d{2})$/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
    : new Date();
  return date.toLocaleString('en-US', { month: 'long' });
}

// Mirrors the event time normalization in hive.tsx so the tune-up's mini form
// stores the same event_time shape the Home screen expects.
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

function deriveBoardPostTitle(title: string, content: string) {
  const trimmedTitle = title.trim();
  if (trimmedTitle) return trimmedTitle;
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 59).trim()}…` : clean;
}

const cardStyle = {
  backgroundColor: '#fffdf5',
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(222,193,129,0.5)',
  padding: 16,
} as const;

/**
 * The look for the boxes that are NOT words.
 *
 * Everywhere on this screen that a member writes a sentence or a phrase is a
 * `ComposerBar` now — same box, same mic, same behaviour as Clive's bar. What
 * is left here is the clock time, which nobody is going to dictate. It keeps a
 * plain input, wearing the composer's own fill, hairline, corner and
 * placeholder ink so the page still reads as one set of controls.
 */
const inputStyle = {
  backgroundColor: FIELD_LOOK.fill,
  borderWidth: 1,
  borderColor: FIELD_LOOK.border,
  borderRadius: FIELD_LOOK.radius,
  fontFamily: FIELD_LOOK.font,
  fontSize: FIELD_LOOK.fontSize,
  color: FIELD_LOOK.ink,
  paddingHorizontal: FIELD_LOOK.paddingHorizontal,
  paddingVertical: FIELD_LOOK.paddingVertical,
} as const;

/** The muted gold-brown every placeholder in the app is written in. */
const PLACEHOLDER_INK = FIELD_LOOK.placeholder;

function StepHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon?: ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d' }}>
          {title}
        </Text>
        {icon}
      </View>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#7d715f' }}>
        {subtitle}
      </Text>
    </View>
  );
}

// ONE way to say what a box is for (Nat 2026-07-25: the same screen had an
// all-caps brown label above one box, bold charcoal inside the next, and an
// emoji + all-caps tan inside a third).
//
// The rule: every box carries exactly one heading, in bold charcoal, as the
// first thing INSIDE the box. No all-caps, no emoji, nothing floating above
// the card. It matches how survey questions have always rendered, which is
// the style that already appears most often.
function BoxHeading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return (
    <Text style={[{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', lineHeight: 22, marginBottom: 8 }, style]}>
      {children}
    </Text>
  );
}

/**
 * Start date and end date, side by side.
 *
 * They used to be two full-width bars stacked on top of each other, the second
 * of them wearing a label three times longer than the field it named — "These
 * seem unnecessarily long: we could shorten them & put them side by side"
 * (Nat 2026-08-05). The explanation moved into the placeholder, where it costs
 * nothing to read and nothing to ignore.
 *
 * They wrap back into a stack whenever the card is too narrow to hold both, so
 * a phone still gets full-width pickers. The calendar itself opens in a modal,
 * so neither field's popup cares how wide the field underneath it is.
 */
function EventDateRow({
  date,
  onDateChange,
  endDate,
  onEndDateChange,
}: {
  date: string;
  onDateChange: (next: string) => void;
  endDate: string;
  onEndDateChange: (next: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 190 }}>
        <EventDatePicker value={date} onChange={onDateChange} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 190 }}>
        <EventDatePicker
          value={endDate}
          onChange={onEndDateChange}
          label="End date"
          placeholder="Same day — or pick one"
          clearable
        />
      </View>
    </View>
  );
}

/**
 * A note per hang, kept on its own line and tagged with that hang's title:
 *
 *     Went to: Taste (4/5) · Drag Brunch
 *     Taste: the fries were unreal
 *     Drag Brunch: let's do that one again
 *
 * The first line is untouched, so the meeting deck's turnout bars and 🍯
 * averages keep reading it exactly as they always have. Everything after it
 * used to be ONE note about the whole month, which meant a thought about the
 * Writers Sesh arrived detached from the Writers Sesh (Nat 2026-08-05).
 */
type HangNoteMap = Record<string, string>;

const splitHangNotes = (note: string, titles: string[]) => {
  // Longest title first, so a hang called "Writers Sesh" wins the line over one
  // called "Writers" — and so a title with a colon in it ("Movie: Barbie")
  // matches whole rather than being cut at its own colon.
  const ordered = [...titles].sort((a, b) => b.length - a.length);
  const byTitle: HangNoteMap = {};
  const leftover: string[] = [];
  let current: string | null = null;

  note.split('\n').forEach((line) => {
    const match = ordered.find((title) => line === `${title}:` || line.startsWith(`${title}: `));
    if (match) {
      current = match;
      byTitle[match] = line.slice(match.length + 1).trimStart();
      return;
    }
    // A note can run to several lines. Everything under a tagged line belongs
    // to that hang until the next tagged line starts.
    if (current) {
      byTitle[current] = `${byTitle[current]}\n${line}`;
      return;
    }
    leftover.push(line);
  });

  return { byTitle, leftover: leftover.join('\n').trim() };
};

const composeHangsAnswer = (
  attended: { title: string; rating: number | null }[],
  notes: HangNoteMap,
  leftover: string,
) => {
  const head = attended.length > 0
    ? `Went to: ${attended.map((entry) => (entry.rating ? `${entry.title} (${entry.rating}/5)` : entry.title)).join(' · ')}`
    : '';
  const noteLines = attended
    .map((entry) => {
      const text = (notes[entry.title] ?? '').trim();
      return text ? `${entry.title}: ${text}` : '';
    })
    .filter(Boolean);
  return [head, ...noteLines, leftover.trim()].filter(Boolean).join('\n');
};

/**
 * The hangs rater: tap the ones you made it to, rate them, and say something
 * about each one in its own box.
 *
 * It lives here rather than in `SurveyQuestionField` because the note belongs
 * to the hang now: "i think the 'anything else you want to add' should go under
 * or next to each one? so you could comment on each event separately"
 * (Nat 2026-08-05).
 */
function HangsRecapCard({
  question,
  value,
  onChange,
  hangs,
}: {
  question: SurveyQuestion;
  value: string;
  onChange: (next: string) => void;
  hangs: { id: string; title: string }[];
}) {
  const { attended, note } = parseHangsAnswer(value);
  const titles = hangs.map((hang) => hang.title);
  const { byTitle, leftover } = splitHangNotes(note, titles);

  // A note survives an accidental un-tap. The saved answer only carries notes
  // for hangs you are marked down for, so what you wrote is remembered here in
  // case you tap the same hang again.
  const rememberedNotes = useRef<HangNoteMap>({});

  // An answer written before the boxes moved carries one note belonging to no
  // particular hang. Once we've seen one, it keeps a box of its own — nobody's
  // words should vanish the first time they open this screen.
  const [hasLooseNote, setHasLooseNote] = useState(false);
  useEffect(() => {
    if (leftover.trim()) setHasLooseNote(true);
  }, [leftover]);

  if (hangs.length === 0) {
    return (
      <View>
        <BoxHeading>{question.text}</BoxHeading>
        <ComposerBar
          tone="light"
          variant="form"
          value={value}
          onChangeText={(next) => onChange(typeof next === 'function' ? next(value) : next)}
          placeholder="Any hangs, thoughts, or suggestions?"
          minHeight={90}
        />
      </View>
    );
  }

  const toggle = (title: string) => {
    const wasThere = attended.some((entry) => entry.title === title);
    const next = wasThere
      ? attended.filter((entry) => entry.title !== title)
      : [...attended, { title, rating: null }];
    const notes = wasThere
      ? byTitle
      : { ...byTitle, [title]: byTitle[title] ?? rememberedNotes.current[title] ?? '' };
    onChange(composeHangsAnswer(next, notes, leftover));
  };

  const rate = (title: string, rating: number) => {
    const next = attended.map((entry) =>
      entry.title === title ? { ...entry, rating: entry.rating === rating ? null : rating } : entry
    );
    onChange(composeHangsAnswer(next, byTitle, leftover));
  };

  const setNote = (title: string, text: string) => {
    rememberedNotes.current[title] = text;
    onChange(composeHangsAnswer(attended, { ...byTitle, [title]: text }, leftover));
  };

  return (
    <View>
      <BoxHeading>{question.text}</BoxHeading>
      <View style={{ gap: 10 }}>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
          Tap the ones you made it to, rate them, and say a word about each.
        </Text>
        {hangs.map((hang) => {
          const entry = attended.find((candidate) => candidate.title === hang.title);
          return (
            // The card hugs its title instead of ruling a line across the whole
            // step, and there's no "didn't make it" label sitting way off to the
            // right — not going is simply not tapping it (Nat 2026-07-25). Once
            // you HAVE tapped it, the card stretches: a note box hugging a
            // three-word title would be a slot too narrow to write in.
            <View
              key={hang.id}
              style={{
                alignSelf: entry ? 'stretch' : 'flex-start',
                maxWidth: '100%',
                backgroundColor: entry ? '#fdf3dc' : '#faf8f3',
                borderWidth: 1,
                borderColor: entry ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
                gap: 8,
              }}
            >
              <Pressable
                onPress={() => toggle(hang.title)}
                accessibilityRole="button"
                accessibilityState={{ selected: !!entry }}
                accessibilityLabel={entry ? `You went to ${hang.title} — tap to undo` : `I went to ${hang.title}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Text style={{ fontSize: 15 }}>{entry ? '🙌' : '○'}</Text>
                <Text
                  style={{ fontFamily: entry ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: entry ? '#8a6b30' : '#6b7280', flexShrink: 1 }}
                  numberOfLines={2}
                >
                  {hang.title}
                </Text>
              </Pressable>
              {entry ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 26 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>loved it?</Text>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable key={star} onPress={() => rate(hang.title, star)} hitSlop={6}>
                        <Text style={{ fontSize: 17, opacity: entry.rating && star <= entry.rating ? 1 : 0.25 }}>
                          🍯
                        </Text>
                      </Pressable>
                    ))}
                    {entry.rating ? (
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>{entry.rating}/5</Text>
                    ) : null}
                  </View>
                  <View style={{ paddingLeft: 26 }}>
                    <ComposerBar
          tone="light"
                      variant="form"
                      value={byTitle[hang.title] ?? ''}
                      onChangeText={(next) => setNote(
                        hang.title,
                        typeof next === 'function' ? next(byTitle[hang.title] ?? '') : next,
                      )}
                      placeholder="Anything to add about this one?"
                      minHeight={64}
                    />
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
        {hasLooseNote ? (
          <ComposerBar
          tone="light"
            variant="form"
            value={leftover}
            onChangeText={(next) => onChange(composeHangsAnswer(
              attended,
              byTitle,
              typeof next === 'function' ? next(leftover) : next,
            ))}
            placeholder="Anything else about the month?"
            minHeight={70}
          />
        ) : null}
      </View>
    </View>
  );
}

function PostedConfirmation({
  lines,
  boardName,
  boardNames,
}: {
  lines: string[];
  boardName?: string | null;
  boardNames?: (string | null | undefined)[];
}) {
  if (lines.length === 0) return null;
  return (
    <View
      style={{
        backgroundColor: '#ecfdf3',
        borderWidth: 1,
        borderColor: '#86efac',
        borderRadius: 14,
        padding: 12,
        marginTop: 12,
        gap: 4,
      }}
    >
      {lines.map((line, index) => {
        const destination = boardNames?.[index] ?? boardName;
        return (
          <Text key={`${line}-${index}`} style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#166534' }}>
            ✓ Posted{destination ? ` to ${destination}` : ''}: {line}
          </Text>
        );
      })}
    </View>
  );
}

export default function MonthlyTuneupScreen() {
  const router = useRouter();
  const { from, mode } = useLocalSearchParams<{ from?: string; mode?: string }>();
  // The halfway nudge deep-links here with mode=midpoint.
  const isMidpoint = mode === 'midpoint';
  const steps = isMidpoint ? MIDPOINT_STEPS : STEPS;
  const { profile, community, communityId } = useAuth();
  const privacyChoices = usePrivacyChoices();

  // Reading + the quarterly profile pass both write to `profiles`, so they
  // share one dirty flag and one save that runs when the tune-up finishes.
  const [readingDraft, setReadingDraft] = useState('');
  const [readingDirty, setReadingDirty] = useState(false);
  const [profileDrafts, setProfileDrafts] = useState<Record<string, string>>({});
  const [profileDirty, setProfileDirty] = useState(false);
  const [editingProfileField, setEditingProfileField] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const { members: mentionableMembers, loading: mentionableMembersLoading } = useMentionableMembers(communityId);
  // The check-in and the shout-out box are one HIVE's, so "@all" is this HIVE
  // and the picker names it rather than saying "HIVE" at a world with several.
  const mentionReach = useMentionReach({ reach: 'hive' });
  const hiveBroadcastTarget = getGroupMentionSuggestions(null, mentionReach)
    .find((target) => target.group === 'hive') ?? {
      id: '__broadcast_hive__',
      name: 'Everyone in this HIVE',
      handle: 'all',
      isBroadcast: true,
      group: 'hive' as const,
    };
  const hiveAudienceLabel = hiveBroadcastTarget.name;
  const { wishes, loading: wishesLoading, refresh: refreshWishes, grantWish } = useWishes();
  const {
    availableSurveys,
    pendingSurveys,
    myResponses,
    submitResponse,
    loading: surveysLoading,
    refetch: refetchSurveys,
  } = useSurveys(communityId ?? undefined, profile?.id);

  // Deck-style chrome (Nat 2026-07-24: "looks nice"). The flank arrows only
  // appear where there's margin to spare — on a phone they'd sit on top of the
  // form fields.
  const { width: windowWidth } = useWindowDimensions();
  const showFlankArrows = windowWidth >= 900;
  const [tuneupRefreshing, setTuneupRefreshing] = useState(false);

  const [stepIndex, setStepIndex] = useState(0);
  // Halfway check-in: what you'd like in the newsletter. Answers land as
  // replies on the threads that already exist for them, so nothing here is a
  // new pile to maintain and it's visible on the boards like everything else.
  // Shout-outs, reminders, and compliments can all be directed at a member or
  // the whole HIVE. Face bubbles and typed @mentions share the same text, so a
  // member can use either route (or both) without wondering whether it worked.
  const [halfwayHelpStatus, setHalfwayHelpStatus] = useState<'done' | 'not_yet' | 'other' | null>(null);
  const [halfwayHelpLog, setHalfwayHelpLog] = useState('');
  const [newsletterKind, setNewsletterKind] = useState<NewsletterKind>('shoutout');
  const [newsletterText, setNewsletterText] = useState('');
  const [newsletterPosting, setNewsletterPosting] = useState(false);
  const [newsletterError, setNewsletterError] = useState<string | null>(null);
  const [newsletterPosted, setNewsletterPosted] = useState<{ content: string; thread: string }[]>([]);
  const [newsletterEvents, setNewsletterEvents] = useState<NewsletterEvent[]>([]);
  const [newsletterEventsLoading, setNewsletterEventsLoading] = useState(false);
  const [showNewsletterEventComposer, setShowNewsletterEventComposer] = useState(false);
  const [finished, setFinished] = useState(false);

  // The box itself does its own @ tagging now (it's a ComposerBar). This tracker
  // stays for the FACE BUBBLES: it reads who the text already mentions, and a
  // tapped face writes the mention into the same text.
  const {
    mentionsEveryone: newsletterMentionsEveryone,
    mentionedMembers: newsletterMentionedMembers,
    resetMentionSelection: resetNewsletterMentionSelection,
    selectMention: selectNewsletterMention,
  } = useMentionInput({
    value: newsletterText,
    onChangeText: setNewsletterText,
    members: mentionableMembers,
    currentUserId: profile?.id,
    suggestionLimit: 50,
    reach: mentionReach,
  });

  const loadNewsletterEvents = useCallback(async () => {
    if (!communityId) return;
    setNewsletterEventsLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('events')
        .select('id, title, event_date, end_date, event_time, location')
        .eq('community_id', communityId)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(16);
      if (error) throw error;
      setNewsletterEvents((data ?? []) as NewsletterEvent[]);
    } catch (error) {
      console.warn('Could not load upcoming newsletter events', error);
    } finally {
      setNewsletterEventsLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    void loadNewsletterEvents();
  }, [loadNewsletterEvents]);

  // Hangs since the last meeting, for the check-in's went/didn't-go recap chips.
  const [hangRecapEvents, setHangRecapEvents] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!communityId) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const since = await getCycleStart(communityId, today);

      // The window runs meeting-to-meeting, not "up to today". You fill the
      // tune-up in the RUN-UP to the next meeting, so a hang scheduled for
      // next week has happened by the time everyone's in the room — capping at
      // today meant a cycle's hangs were invisible right when people were
      // being asked about them, and the whole rating card fell back to a bare
      // text box (Nat 2026-07-25). Falls back to five weeks out when no next
      // meeting is on the calendar yet.
      const { data: nextMeeting } = await supabase
        .from('events')
        .select('event_date')
        .eq('community_id', communityId)
        .eq('event_type', 'meeting')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(1);
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 35);
      const until = (nextMeeting?.[0] as { event_date?: string } | undefined)?.event_date
        ?? fallback.toISOString().slice(0, 10);

      const { data } = await supabase
        .from('events')
        .select('id, title, event_date, end_date, event_type')
        .eq('community_id', communityId)
        .gte('event_date', since.toISOString().slice(0, 10))
        .lte('event_date', until)
        .neq('event_type', 'meeting')
        .neq('event_type', 'birthday')
        .order('event_date', { ascending: true });
      const hangs = ((data ?? []) as { id: string; title: string; end_date: string | null }[])
        // Out-of-town stretches aren't hangs — same heuristic as the deck calendar.
        .filter((event) => !(event.end_date || /\b(out of town|away|trip|travel|galavant)/i.test(event.title)));
      setHangRecapEvents(hangs.map((event) => ({ id: event.id, title: event.title })));
    })().catch((error) => console.warn('Could not load hang recap events', error));
  }, [communityId]);

  // To-do review: open items to check off, plus this cycle's completed items
  // (yours, and ones others did FOR you) — the memory joggers that keep wins
  // like "we filmed the aerial straps act" from being forgotten by meeting day.
  type TodoRow = { id: string; description: string; completed_at?: string | null; helperName?: string };
  const [openTodos, setOpenTodos] = useState<TodoRow[]>([]);
  const [doneTodos, setDoneTodos] = useState<TodoRow[]>([]);
  const [doneForMe, setDoneForMe] = useState<TodoRow[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [todoSaving, setTodoSaving] = useState(false);

  const loadTodos = useCallback(async () => {
    if (!communityId || !profile) return;
    // Meeting-to-meeting window — same cycle anchor as the deck and hangs.
    const since = await getCycleStart(communityId, new Date().toISOString().slice(0, 10));
    const [mineRes, doneRes, forMeRes] = await Promise.all([
      supabase
        .from('action_items')
        .select('id, description')
        .eq('community_id', communityId)
        .eq('assigned_to', profile.id)
        .or('completed.is.null,completed.is.false')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('action_items')
        .select('id, description, completed_at')
        .eq('community_id', communityId)
        .eq('assigned_to', profile.id)
        .eq('completed', true)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })
        .limit(20),
      (supabase as any)
        .from('action_items')
        .select('id, description, completed_at, assignee:profiles!assigned_to(name)')
        .eq('community_id', communityId)
        .eq('related_user_id', profile.id)
        .neq('assigned_to', profile.id)
        .eq('completed', true)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })
        .limit(20),
    ]);
    setOpenTodos((mineRes.data ?? []) as TodoRow[]);
    setDoneTodos((doneRes.data ?? []) as TodoRow[]);
    setDoneForMe(((forMeRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      description: row.description,
      completed_at: row.completed_at,
      helperName: row.assignee?.name ?? 'Someone',
    })));
  }, [communityId, profile?.id]);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  const handleToggleTodo = async (todo: TodoRow, nowDone: boolean) => {
    if (!profile) return;
    const { error } = await (supabase as any)
      .from('action_items')
      .update({ completed: nowDone, completed_at: nowDone ? new Date().toISOString() : null })
      .eq('id', todo.id)
      .eq('assigned_to', profile.id);
    if (!error) await loadTodos();
  };

  const handleAddTodo = async () => {
    const text = newTodoText.trim();
    if (!text || !communityId || !profile || todoSaving) return;
    setTodoSaving(true);
    try {
      const { error } = await (supabase as any).from('action_items').insert({
        description: text,
        assigned_to: profile.id,
        community_id: communityId,
      });
      if (!error) {
        setNewTodoText('');
        await loadTodos();
      }
    } finally {
      setTodoSaving(false);
    }
  };

  // Step 1 — HD wishes (same manage wiring as profile.tsx)
  const [managingWish, setManagingWish] = useState<Wish | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [addWishModalVisible, setAddWishModalVisible] = useState(false);
  const [wishToGrant, setWishToGrant] = useState<(Wish & { user: Profile }) | null>(null);

  // Steps 2 + 4 — board posts
  const [hangTitle, setHangTitle] = useState('');
  const [hangContent, setHangContent] = useState('');
  const [hangPosting, setHangPosting] = useState(false);
  const [hangError, setHangError] = useState<string | null>(null);
  const [hangPosted, setHangPosted] = useState<string[]>([]);
  const [hangBoardName, setHangBoardName] = useState<string | null>(null);
  // Ideas already pinned to the hang board — shown in the Hang-ideas step so
  // the check-in reads "second one of these, or pitch something new".
  const [existingHangIdeas, setExistingHangIdeas] = useState<{ id: string; title: string }[]>([]);
  // Tap-to-second: picking an idea posts the +1 on that idea's own thread,
  // lights the chip up, grays the rest, and throws a little confetti.
  const [secondedHangIdeaId, setSecondedHangIdeaId] = useState<string | null>(null);
  // The reply row a +1 created, so tapping again can take it back.
  const [secondedHangReplyId, setSecondedHangReplyId] = useState<string | null>(null);
  const [hangSecondingId, setHangSecondingId] = useState<string | null>(null);
  const [hangConfetti, setHangConfetti] = useState(false);
  // Standing "HIVE Help Ideas" thread: future help-focus pitches live as
  // replies there, and the check-in shows them the same second-or-pitch way.
  const [helpIdeasThreadId, setHelpIdeasThreadId] = useState<string | null>(null);
  const [helpIdeas, setHelpIdeas] = useState<string[]>([]);
  const [helpIdeaContent, setHelpIdeaContent] = useState('');
  const [helpIdeaPosting, setHelpIdeaPosting] = useState(false);
  const [secondedHelpIdea, setSecondedHelpIdea] = useState<string | null>(null);
  const [secondedHelpReplyId, setSecondedHelpReplyId] = useState<string | null>(null);
  const [helpSeconding, setHelpSeconding] = useState(false);
  const [helpConfetti, setHelpConfetti] = useState(false);

  const [helperContent, setHelperContent] = useState('');
  const [helperPosting, setHelperPosting] = useState(false);
  const [helperError, setHelperError] = useState<string | null>(null);
  const [helperPosted, setHelperPosted] = useState<string[]>([]);
  const [helperThread, setHelperThread] = useState<HelperThread | null>(null);

  // Step 3 — calendar
  const [eventTitle, setEventTitle] = useState('');
  const [eventAudience, setEventAudience] = useState<EventAudience>('members');
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventsAdded, setEventsAdded] = useState<string[]>([]);

  // Step 5 — check-in questions, inline (one flow, no separate survey modal)
  const [checkInAnswers, setCheckInAnswers] = useState<SurveyAnswers>({});
  const [checkInDirty, setCheckInDirty] = useState(false);
  const [checkInPrefilled, setCheckInPrefilled] = useState(false);
  const [checkInSubmitted, setCheckInSubmitted] = useState(false);
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const monthlyCheckInSurvey = availableSurveys.find(isMonthlyCheckInSurvey) ?? null;
  const pendingSurveyIds = new Set(pendingSurveys.map((survey) => survey.id));
  const checkInResponse = monthlyCheckInSurvey ? myResponses.get(monthlyCheckInSurvey.id) : undefined;
  const checkInIsEditing = !!monthlyCheckInSurvey
    && !!checkInResponse
    && !pendingSurveyIds.has(monthlyCheckInSurvey.id);
  const checkInAlreadyDone = checkInIsEditing || checkInSubmitted;

  // Prefill this month's answers once, without clobbering draft-restored edits.
  useEffect(() => {
    if (checkInPrefilled || checkInDirty) return;
    if (checkInIsEditing && checkInResponse?.answers) {
      setCheckInAnswers(checkInResponse.answers);
      setCheckInPrefilled(true);
    }
  }, [checkInPrefilled, checkInDirty, checkInIsEditing, checkInResponse]);

  // Draft answers write themselves (Nat: "maybe even pre-filled?") — the
  // check-offs seed Progress and this session's kindness logs seed the HIVE
  // Help recap. Only ever fills an EMPTY answer; keep it, edit it, delete it.
  useEffect(() => {
    if (surveysLoading || !monthlyCheckInSurvey) return;
    if (doneTodos.length > 0 || doneForMe.length > 0) {
      const current = String(checkInAnswers.q_pop_progress ?? '').trim();
      if (!current) {
        // Don't staple a period onto something that already ends in
        // punctuation — "doggy manners help is appreciated!." read as a typo.
        const endSentence = (value: string) => (/[.!?…]$/.test(value) ? value : `${value}.`);
        const lines = [
          doneTodos.length > 0
            ? endSentence(`Checked off: ${doneTodos.map((todo) => parseActionItemDescription(todo.description).text).join(' · ')}`)
            : null,
          doneForMe.length > 0
            ? endSentence(`Done for me 💛: ${doneForMe.map((todo) => `${todo.helperName} — ${parseActionItemDescription(todo.description).text}`).join(' · ')}`)
            : null,
        ].filter(Boolean).join('\n');
        setCheckInAnswer('q_pop_progress', lines);
      }
    }
    // (The HIVE Help recap used to be seeded with "I logged: …" the moment you
    // logged a kindness, which turned the box directly below the log into a
    // copy of it — Nat 2026-07-24, "the same thing twice". The logged acts
    // already reach the deck on their own; this box is for what you THINK of
    // the focus, so it stays yours to fill.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveysLoading, monthlyCheckInSurvey, doneTodos, doneForMe, helperPosted]);

  const setCheckInAnswer = useCallback((questionId: string, value: any) => {
    setCheckInDirty(true);
    setCheckInAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const monthName = monthlyCheckInSurvey
    ? getMonthNameFromPeriod(getSurveyResponsePeriod(monthlyCheckInSurvey))
    : getMonthNameFromPeriod(null);

  /**
   * The one door out, and the name of the room on the other side of it.
   *
   * `from` is set by whoever opened the tune-up, so leaving retraces your steps.
   * The same pair feeds the path along the bottom: the step above the tune-up in
   * the trail and the step the X takes you to are the same place, said once.
   *
   * Anything that arrives without a `from` — a link in an email, the what's-new
   * strip, a bookmark — goes Home. That is the whole reason there is no
   * `router.back()` here any more: back hands the decision to the browser's
   * history, and the browser's history remembers where you were before the app.
   * Nat opened the tune-up on her phone, tapped the X, and landed on the public
   * the-hive.app site — *"that was nuts, we dont want that to happen"*
   * (2026-08-06). Closing something is a move to a room this app knows the name
   * of.
   */
  const exit = EXITS[String(from ?? '') as ExitKey] ?? EXITS.hive;
  const leaveTuneup = useCallback(() => {
    router.replace(exit.route as never);
  }, [exit.route, router]);

  // Where you are: OG HIVE › Meetings › August Tune-up › Check-in. The tune-up
  // has no rail entry of its own, so every step below the HIVE is named here.
  useDeepTrail([
    { label: exit.label, onPress: leaveTuneup },
    {
      label: isMidpoint ? 'Halfway Check-in' : `${monthName} Tune-up`,
      onPress: stepIndex === 0 && !finished ? undefined : () => {
        setFinished(false);
        setStepIndex(0);
      },
    },
    { label: finished ? 'All done' : steps[stepIndex].label },
  ]);

  const liveWishes = wishes.filter((wish) => (
    (wish.status === 'public' || wish.status === 'private') && wish.is_active !== false
  ));

  // You can hold several wishes, but only ONE reaches the HD page, the comb
  // card and the meeting deck. You pick it here; if you never do, it's your
  // newest public one, which is what the app always did (Nat 2026-07-25).
  const spotlightWishId = pickSpotlightWish(liveWishes)?.id ?? null;

  const setSpotlightWish = useCallback(async (wishId: string) => {
    if (!profile) return;
    // Clear first, then set — the partial unique index allows exactly one
    // starred wish per member, so the order matters.
    const { error: clearError } = await (supabase as any)
      .from('wishes')
      .update({ is_spotlight: false })
      .eq('user_id', profile.id)
      .eq('is_spotlight', true);
    if (clearError) {
      showAlert('Hmm', 'Could not update your HD spotlight — try again.');
      return;
    }
    const { error } = await (supabase as any)
      .from('wishes')
      .update({ is_spotlight: true })
      .eq('id', wishId)
      .eq('user_id', profile.id);
    if (error) {
      showAlert('Hmm', 'Could not update your HD spotlight — try again.');
      return;
    }
    await refreshWishes();
  }, [profile, refreshWishes]);

  // All wishes on this screen belong to the signed-in member, so the manage
  // permissions collapse to status checks (same rules profile.tsx applies).
  const canGrantWish = useCallback((wish: Wish) => wish.status === 'public', []);
  const canEditWish = useCallback((wish: Wish) => wish.status !== 'fulfilled', []);
  const canArchiveWish = useCallback((wish: Wish) => (
    wish.status === 'public' && wish.is_active !== false
  ), []);
  const canRefineWish = useCallback((wish: Wish) => wish.status !== 'fulfilled', []);

  const findBoardTarget = useCallback(async (kind: 'hangs' | 'helpers' | 'newsletter' | 'compliments'): Promise<BoardTarget | null> => {
    if (!communityId) return null;

    let query = supabase
      .from('board_categories')
      .select('id, name, status, topic_kind')
      .eq('community_id', communityId);

    query = kind === 'hangs'
      ? query.ilike('name', '%hang%')
      : kind === 'compliments'
        ? query.or('topic_kind.eq.compliments,name.ilike.%compliment%')
        : kind === 'newsletter'
          // topic_kind, not name — renaming the board must not break the check-in.
          ? query.or('topic_kind.eq.newsletter,name.ilike.%newsletter%,name.ilike.%announcement%')
        : query.or('topic_kind.eq.helper_log,name.ilike.%HIVE Helpers%');

    const { data, error } = await query;
    if (error) {
      console.warn('Could not find tune-up board', error);
      return null;
    }

    const rows = ((data ?? []) as { id: string; name: string; status?: string | null; topic_kind?: string | null }[])
      .filter((row) => !row.status || row.status === 'active')
      // A purpose-built board always beats a name match. Without this, the
      // newsletter lookup's Announcements fallback could win over the real
      // HIVE Newsletter board and quietly fork the threads in two.
      .sort((a, b) => {
        const rank = (row: { topic_kind?: string | null }) => (
          row.topic_kind === kind || (kind === 'helpers' && row.topic_kind === 'helper_log') ? 0 : 1
        );
        return rank(a) - rank(b);
      });
    // Prefer a month-specific board when one exists (e.g. "HIVE Helpers July"),
    // so monthly helper boards route automatically as they're created.
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
    const active = rows.find((row) => row.name.toLowerCase().includes(monthName)) ?? rows[0];
    return active ? { id: active.id, name: active.name } : null;
  }, [communityId]);

  const postToBoard = useCallback(async (title: string, content: string) => {
    if (!profile || !communityId) {
      return { error: 'Your profile is still loading. Please try again in a moment.' };
    }

    const board = await findBoardTarget('hangs');
    if (!board) {
      return {
        error: 'Could not find the HIVE Hangs board. You can post your idea from the Boards tab instead.',
      };
    }

    const { error } = await (supabase as any).from('board_posts').insert({
      community_id: communityId,
      category_id: board.id,
      author_id: profile.id,
      title: deriveBoardPostTitle(title, content),
      content: content.trim(),
    });

    if (error) {
      return { error: `Failed to post: ${error.message}` };
    }

    return { error: null, boardName: board.name };
  }, [communityId, findBoardTarget, profile]);

  // The midpoint cron already opens "{Month} Newsletter" and "{Month}
  // Compliment Corner" on Announcements. Find whichever exists; only create one
  // if a member gets here first (or the cron didn't run).
  const findOrCreateNewsletterThread = useCallback(async (
    kind: 'newsletter' | 'compliments',
  ): Promise<HelperThread | null> => {
    if (!profile || !communityId) return null;
    const board = await findBoardTarget(kind === 'compliments' ? 'compliments' : 'newsletter');
    if (!board) return null;

    const { data: existing } = await supabase
      .from('board_posts')
      .select('id, title, created_at')
      .eq('community_id', communityId)
      .eq('category_id', board.id)
      .ilike('title', kind === 'newsletter' ? '%newsletter%' : '%compliment%')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const found = ((existing ?? []) as { id: string; title: string }[])[0];
    if (found) {
      return { boardId: board.id, boardName: board.name, postId: found.id, postTitle: found.title, postContent: null };
    }

    const month = new Date().toLocaleString('en-US', { month: 'long' });
    const title = kind === 'newsletter'
      ? `${month} Newsletter 📰`
      : `${month} Compliment Corner 💐`;
    const content = kind === 'newsletter'
      ? "The newsletter's brewing! 🗞️ Want a shout-out, a plug, or a reminder in it — \"come to my lemonade stand Tuesday!\"-style? Drop it in this thread and it goes straight into the newsletter."
      : 'Want to compliment anyone this month? 💐 Drop it here — big, small, silly, sincere. @ them and they get a little love note the moment you post it. Compliments also get read out in the newsletter and at the meeting. No act of niceness too tiny.';

    const { data: created, error } = await (supabase as any)
      .from('board_posts')
      .insert({ community_id: communityId, category_id: board.id, author_id: profile.id, title, content })
      .select('id, title')
      .single();
    if (error || !created) return { boardId: board.id, boardName: board.name, postId: null, postTitle: null, postContent: null };
    return { boardId: board.id, boardName: board.name, postId: created.id, postTitle: created.title, postContent: null };
  }, [communityId, findBoardTarget, profile]);

  const submitNewsletterItem = async () => {
    const content = newsletterText.trim();
    if (!content || !profile || !communityId || newsletterPosting) return;
    const hasRecipient = newsletterMentionsEveryone || newsletterMentionedMembers.length > 0;
    if (newsletterKind === 'compliment' && !hasRecipient) {
      setNewsletterError(`Pick someone, choose ${hiveAudienceLabel}, or type @ and select a name first.`);
      return;
    }
    setNewsletterPosting(true);
    setNewsletterError(null);
    try {
      const thread = await findOrCreateNewsletterThread(
        newsletterKind === 'compliment' ? 'compliments' : 'newsletter'
      );
      if (!thread?.postId) {
        setNewsletterError('Could not find the newsletter thread. You can post it from the Boards tab instead.');
        return;
      }
      const { error } = await (supabase as any).from('board_replies').insert({
        community_id: communityId,
        post_id: thread.postId,
        author_id: profile.id,
        content,
      });
      if (error) {
        setNewsletterError(`Could not post that: ${error.message}`);
        return;
      }
      setNewsletterPosted((current) => [...current, { content, thread: thread.postTitle ?? 'the newsletter thread' }]);
      setNewsletterText('');
      resetNewsletterMentionSelection();
    } finally {
      setNewsletterPosting(false);
    }
  };

  // Helpers step posts as a REPLY on the current monthly thread of the HIVE
  // Helpers board (one thread per month, e.g. "June Pay It Forward Success").
  const findHelperThread = useCallback(async (): Promise<HelperThread | null> => {
    if (!communityId) return null;

    const board = await findBoardTarget('helpers');
    if (!board) return null;

    const { data, error } = await supabase
      .from('board_posts')
      .select('id, title, content, status, created_at')
      .eq('community_id', communityId)
      .eq('category_id', board.id)
      .or('status.is.null,status.eq.active')
      // An archived focus thread is retired — it must not keep winning
      // "newest", or archiving a mistaken one leaves it in charge.
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.warn('Could not load the current HIVE Helpers thread', error);
      return { boardId: board.id, boardName: board.name, postId: null, postTitle: null, postContent: null };
    }

    // Focus threads only — never the standing "HIVE Help Ideas" thread.
    //
    // Take the NEWEST one, full stop. This used to prefer whichever thread was
    // titled with the current calendar month, which quietly lied: the focus
    // turns over at a MEETING, not at midnight on the 1st. The July 21 meeting
    // chose Shelter Donation (filed under August, since it runs to the Aug 19
    // meeting), but because the calendar still said July, everyone kept being
    // told the focus was "Pay it behind" (Nat 2026-07-24). A focus thread is
    // only ever posted when a meeting picks one, so newest == current.
    const candidates = ((data ?? []) as { id: string; title: string; content: string | null }[])
      .filter((row) => !/ideas/i.test(row.title));
    const thread = candidates[0];
    return {
      boardId: board.id,
      boardName: board.name,
      postId: thread?.id ?? null,
      postTitle: thread?.title ?? null,
      postContent: thread?.content ?? null,
    };
  }, [communityId, findBoardTarget]);

  // Preload the destination board/thread so steps 2 and 4 can say where posts land.
  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;

    const loadBoardTargets = async () => {
      const [hangBoard, helperThreadInfo] = await Promise.all([
        findBoardTarget('hangs'),
        findHelperThread(),
      ]);
      if (cancelled) return;
      setHangBoardName(hangBoard?.name ?? null);
      setHelperThread(helperThreadInfo);

      if (hangBoard) {
        const { data: ideaPosts } = await supabase
          .from('board_posts')
          .select('id, title, status, created_at')
          .eq('category_id', hangBoard.id)
          .or('status.is.null,status.eq.active')
          .order('created_at', { ascending: false })
          .limit(6);
        if (!cancelled) {
          setExistingHangIdeas(
            ((ideaPosts ?? []) as { id: string; title: string | null }[])
              .filter((post): post is { id: string; title: string } => !!post.title)
              .map((post) => ({ id: post.id, title: post.title }))
          );
        }
      }

      if (helperThreadInfo?.boardId) {
        const { data: ideasThreadRows } = await supabase
          .from('board_posts')
          .select('id, title')
          .eq('category_id', helperThreadInfo.boardId)
          .ilike('title', '%help ideas%')
          .limit(1);
        const ideasThread = ((ideasThreadRows ?? []) as { id: string }[])[0];
        if (ideasThread && !cancelled) {
          setHelpIdeasThreadId(ideasThread.id);
          const { data: ideaReplies } = await supabase
            .from('board_replies')
            .select('content, created_at')
            .eq('post_id', ideasThread.id)
            .order('created_at', { ascending: false })
            .limit(24);
          if (!cancelled) {
            setHelpIdeas(
              ((ideaReplies ?? []) as { content: string | null }[])
                .map((reply) => (reply.content ?? '').trim())
                .filter(Boolean)
                // Votes live on this same thread as replies, so a "+1 for X"
                // would come back next month looking like an idea of its own.
                .filter((content) => !/^\+1\b/.test(content))
                .map((content) => (content.length > 70 ? `${content.slice(0, 67)}…` : content))
            );
          }
        }
      }
    };

    void loadBoardTargets();
    return () => {
      cancelled = true;
    };
  }, [communityId, findBoardTarget, findHelperThread]);

  // Wizard progress survives a full relaunch: restore any saved draft once the
  // profile/community are known, save (debounced) on change, clear on finish.
  const draftKey = communityId && profile ? getTuneupDraftKey(communityId, profile.id, isMidpoint) : null;
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (!draftKey || draftRestored) return;
    let cancelled = false;

    const restoreDraft = async () => {
      try {
        const raw = await getStoredItemAsync(draftKey);
        if (!cancelled && raw) {
          const draft = JSON.parse(raw) as TuneupDraft;
          if (draft && typeof draft === 'object') {
            // Resume the saved STEP only for a fresh interruption (refresh,
            // crash, token-refresh remount). Coming back hours or days later —
            // e.g. from the reminder email — should start at step 1, with any
            // drafted content still restored below.
            const draftIsFresh = typeof draft.savedAt === 'number'
              && Date.now() - draft.savedAt < 60 * 60 * 1000;
            if (draftIsFresh && typeof draft.stepIndex === 'number' && Number.isFinite(draft.stepIndex)) {
              setStepIndex(Math.min(Math.max(Math.trunc(draft.stepIndex), 0), steps.length - 1));
            }
            if (typeof draft.helperContent === 'string') setHelperContent(draft.helperContent);
            if (typeof draft.hangTitle === 'string') setHangTitle(draft.hangTitle);
            if (typeof draft.hangContent === 'string') setHangContent(draft.hangContent);
            if (typeof draft.eventTitle === 'string') setEventTitle(draft.eventTitle);
            if (typeof draft.eventDate === 'string') setEventDate(draft.eventDate);
            if (typeof draft.eventEndDate === 'string') setEventEndDate(draft.eventEndDate);
            if (typeof draft.eventAllDay === 'boolean') setEventAllDay(draft.eventAllDay);
            if (typeof draft.eventTime === 'string') setEventTime(draft.eventTime);
            if (typeof draft.eventLocation === 'string') setEventLocation(draft.eventLocation);
            if (draft.checkInAnswers && typeof draft.checkInAnswers === 'object') {
              setCheckInAnswers(draft.checkInAnswers as SurveyAnswers);
              setCheckInDirty(true);
            }
          }
        }
      } catch {
        // Bad or unreadable draft — start fresh.
      }
      if (!cancelled) setDraftRestored(true);
    };

    void restoreDraft();
    return () => {
      cancelled = true;
    };
  }, [draftKey, draftRestored]);

  useEffect(() => {
    if (!draftKey || !draftRestored || finished) return;
    const timeout = setTimeout(() => {
      const draft: TuneupDraft = {
        savedAt: Date.now(),
        stepIndex,
        helperContent,
        hangTitle,
        hangContent,
        eventTitle,
        eventDate,
        eventEndDate,
        eventAllDay,
        eventTime,
        eventLocation,
        ...(checkInDirty ? { checkInAnswers } : {}),
      };
      void setStoredItemAsync(draftKey, JSON.stringify(draft));
    }, 400);
    return () => clearTimeout(timeout);
  }, [
    draftKey,
    draftRestored,
    finished,
    stepIndex,
    helperContent,
    hangTitle,
    hangContent,
    eventTitle,
    eventDate,
    eventEndDate,
    eventAllDay,
    eventTime,
    eventLocation,
    checkInAnswers,
    checkInDirty,
  ]);

  useEffect(() => {
    if (finished && draftKey) void removeStoredItemAsync(draftKey);
  }, [finished, draftKey]);

  const handlePostHangIdea = async () => {
    if (!hangContent.trim() || hangPosting) return;
    setHangPosting(true);
    setHangError(null);
    const result = await postToBoard(hangTitle, hangContent);
    setHangPosting(false);
    if (result.error) {
      setHangError(result.error);
      return;
    }
    if (result.boardName) setHangBoardName(result.boardName);
    setHangPosted((prev) => [...prev, deriveBoardPostTitle(hangTitle, hangContent)]);
    setHangTitle('');
    setHangContent('');
  };

  // Posting a kindness to the HIVE Helpers thread. Called from the check-in's
  // "I did something else" answer — the separate "Log a kindness" box is gone,
  // since telling us what you did instead IS the log (Nat 2026-07-25).
  const postHelperLog = async (content: string) => {
    if (!content || helperPosting) return;
    if (!profile || !communityId) {
      setHelperError('Your profile is still loading. Please try again in a moment.');
      return;
    }

    setHelperPosting(true);
    setHelperError(null);

    let thread = helperThread ?? await findHelperThread();
    if (!thread) {
      setHelperPosting(false);
      setHelperError('Could not find the HIVE Helpers board. You can log it from the Boards tab instead.');
      return;
    }

    if (thread.postId) {
      // Same reply shape the Boards tab uses; reply_count / last_reply_at on the
      // thread are kept in sync by the update_reply_count DB trigger.
      const { error } = await (supabase as any).from('board_replies').insert({
        community_id: communityId,
        post_id: thread.postId,
        author_id: profile.id,
        content,
      });

      if (error) {
        setHelperPosting(false);
        setHelperError(`Failed to post: ${error.message}`);
        return;
      }

      // Non-blocking side-effects, mirroring the Boards reply composer.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.boardSearchIndex(communityId),
      });
      supabase.functions.invoke('notify-board-reply', {
        body: {
          post_id: thread.postId,
          reply_author_id: profile.id,
          reply_preview: content,
          community_id: communityId,
        },
      }).catch((err) => console.log('Board reply notification error (non-blocking):', err));
    } else {
      // No monthly thread yet — start one so this and later logs have a home.
      const { data, error } = await (supabase as any)
        .from('board_posts')
        .insert({
          community_id: communityId,
          category_id: thread.boardId,
          author_id: profile.id,
          title: `${monthName} HIVE Help`,
          content,
        })
        .select('id, title')
        .single();

      if (error) {
        setHelperPosting(false);
        setHelperError(`Failed to post: ${error.message}`);
        return;
      }

      thread = {
        ...thread,
        postId: data?.id ?? null,
        postTitle: data?.title ?? `${monthName} HIVE Help`,
      };
    }

    setHelperThread(thread);
    setHelperPosted((prev) => [...prev, deriveBoardPostTitle('', content)]);
    setHelperPosting(false);
  };

  // Future help-focus pitches land as replies on the standing Ideas thread
  // (created on first use if it doesn't exist yet).
  const handlePostHelpIdea = async () => {
    const content = helpIdeaContent.trim();
    if (!content || helpIdeaPosting || !profile || !communityId) return;

    setHelpIdeaPosting(true);
    try {
      let threadId = helpIdeasThreadId;
      if (!threadId) {
        const board = helperThread?.boardId
          ? { id: helperThread.boardId }
          : await findBoardTarget('helpers');
        if (!board) throw new Error('HIVE Helpers board not found');
        const { data, error } = await (supabase as any)
          .from('board_posts')
          .insert({
            community_id: communityId,
            category_id: board.id,
            author_id: profile.id,
            title: 'HIVE Help Ideas 💡',
            content: 'A standing thread of ideas for monthly HIVE Help focuses — add yours any time!',
          })
          .select('id')
          .single();
        if (error) throw error;
        threadId = data.id as string;
        setHelpIdeasThreadId(threadId);
      }

      const { error } = await (supabase as any).from('board_replies').insert({
        community_id: communityId,
        post_id: threadId,
        author_id: profile.id,
        content,
      });
      if (error) throw error;

      setHelpIdeas((prev) => [content, ...prev].slice(0, 6));
      setHelpIdeaContent('');
    } catch (error) {
      console.warn('Could not post help idea', error);
    } finally {
      setHelpIdeaPosting(false);
    }
  };

  // Same create path as hive.tsx's event modal: the create-event edge function.
  const handleCreateEvent = async () => {
    setEventError(null);
    if (!eventTitle.trim()) {
      setEventError('Please enter an event title.');
      return;
    }
    if (!eventDate) {
      setEventError('Please select a date.');
      return;
    }
    if (!communityId) {
      setEventError('No community found. Please refresh and try again.');
      return;
    }

    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      setEventError('Invalid date format. Please pick a date using the calendar.');
      return;
    }

    let eventEndDateIso: string | null = null;
    if (eventEndDate.trim()) {
      eventEndDateIso = parseAmericanDate(eventEndDate);
      if (!eventEndDateIso) {
        setEventError('Invalid end date. Please pick it using the calendar.');
        return;
      }
      if (eventEndDateIso < eventDateIso) {
        setEventError('The end date should be after the start date.');
        return;
      }
      if (eventEndDateIso === eventDateIso) eventEndDateIso = null;
    }

    const normalizedTime = eventAllDay ? { time: null, note: '' } : normalizeEventTimeInput(eventTime);
    if (!eventAllDay && eventTime.trim() && !normalizedTime.time) {
      setEventError('For time, use something like 7:30 PM.');
      return;
    }

    setSavingEvent(true);
    try {
      const newEvent: Record<string, string | null> = {
        title: eventTitle.trim(),
        event_date: eventDateIso,
        community_id: communityId,
      };
      if (eventEndDateIso) newEvent.end_date = eventEndDateIso;
      if (normalizedTime.time) newEvent.event_time = normalizedTime.time;
      if (normalizedTime.note) newEvent.description = `Time note: ${normalizedTime.note}`;
      if (eventLocation.trim()) newEvent.location = eventLocation.trim();

      newEvent.visibility = eventAudience;
      const { error } = await supabase.functions.invoke('create-event', {
        body: newEvent,
      });
      if (error) throw error;

      const createdEventLabel = `${eventTitle.trim()} — ${eventDate}${eventEndDateIso ? ` → ${eventEndDate}` : ''}`;
      setEventsAdded((prev) => [...prev, createdEventLabel]);
      if (newsletterKind === 'plug') {
        setNewsletterText((current) => current.trim() || createdEventLabel);
        setShowNewsletterEventComposer(false);
      }
      setEventTitle('');
      setEventDate('');
      setEventAudience('members');
      setEventEndDate('');
      setEventAllDay(false);
      setEventTime('');
      setEventLocation('');
      await loadNewsletterEvents();
    } catch (error: any) {
      setEventError(error?.message || 'Failed to create event. Please try again.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleOutOfTownPreset = () => {
    setEventTitle(`${getFirstName(profile?.name)} out of town`);
    // Trips are all-day stretches — surface the range fields, skip the time.
    setEventAllDay(true);
  };

  // Wish management — copied from profile.tsx's wiring.
  const handleArchiveWish = (wish: Wish) => {
    if (!profile || !communityId || !canArchiveWish(wish)) return;

    const archiveWish = async () => {
      const { error } = await supabase
        .from('wishes')
        .update({ status: 'replaced', is_active: false, replaced_at: new Date().toISOString() } as any)
        .eq('id', wish.id)
        .eq('user_id', profile.id)
        .eq('community_id', communityId);

      if (error) {
        showAlert('Error', 'Failed to archive wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await refreshWishes();
      setManagingWish(null);
    };

    // The same WishManageModal is hosted by five screens; Archive worked on
    // three of them and was inert on these two, because only these two lacked
    // the web branch.
    confirmAction({
      title: 'Archive HD wish',
      message: `Archive this HD wish from Wishes?\n\n"${wish.description}"`,
      confirmLabel: 'Archive',
      onConfirm: archiveWish,
    });
  };

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId) return;

    const deleteWish = async () => {
      const { error } = await deleteWishById({
        wishId: wish.id,
        communityId,
        ownerId: profile.id,
      });

      if (error) {
        showAlert('Error', 'Failed to delete wish. Please try again.');
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await refreshWishes();
      setManagingWish(null);
    };

    // One shared ask, the same on both platforms — this used to hand-roll the
    // web branch and then fall through to `Alert.alert`, which says nothing at
    // all in a browser.
    confirmAction({
      title: 'Delete wish',
      message: `Delete this wish?\n\n"${wish.description}"`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: deleteWish,
    });
  };

  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await refreshWishes();
      setWishToGrant(null);
    }
    return result;
  };

  const openGrantModal = (wish: Wish) => {
    if (!profile) return;
    setWishToGrant({ ...wish, user: (wish.user ?? profile) as Profile });
  };

  const handleRefineWithClive = (roughWish: string) => {
    setAddWishModalVisible(false);
    router.push({
      pathname: '/(app)',
      params: { refineWish: roughWish },
    });
  };

  const handleWishSaved = async () => {
    await refreshWishes();
    setEditingWish(null);
    setAddWishModalVisible(false);
  };

  // Second a help-focus idea with one tap — the +1 lands on the Ideas thread.
  // A +1 is a vote, not a commitment: tap the same chip again to take it back,
  // or tap a different one to move your vote (Nat 2026-07-25 got stuck after
  // the confetti with no way out). The reply we created is deleted either way,
  // so the thread never keeps a vote you withdrew.
  const handleSecondHelpIdea = async (idea: string) => {
    if (helpSeconding || !profile || !communityId || !helpIdeasThreadId) return;
    const undoing = secondedHelpIdea === idea;
    setHelpSeconding(true);
    try {
      if (secondedHelpReplyId) {
        const { error: undoError } = await (supabase as any)
          .from('board_replies')
          .delete()
          .eq('id', secondedHelpReplyId)
          .eq('author_id', profile.id);
        if (undoError) throw undoError;
        setSecondedHelpIdea(null);
        setSecondedHelpReplyId(null);
      }
      if (undoing) return;

      const { data, error } = await (supabase as any).from('board_replies').insert({
        community_id: communityId,
        post_id: helpIdeasThreadId,
        author_id: profile.id,
        content: `+1 for ${idea}! 🙋`,
      }).select('id').single();
      if (error) throw error;
      setSecondedHelpIdea(idea);
      setSecondedHelpReplyId((data as { id: string }).id);
      setHelpConfetti(true);
    } catch (error) {
      console.warn('Could not update the help idea vote', error);
    } finally {
      setHelpSeconding(false);
    }
  };

  // Second an idea with one tap: the +1 lands as a reply on that idea's own
  // thread (votes live with the idea, not as clutter threads on the board).
  const handleSecondHangIdea = async (idea: { id: string; title: string }) => {
    if (hangSecondingId || !profile || !communityId) return;
    const undoing = secondedHangIdeaId === idea.id;
    setHangSecondingId(idea.id);
    try {
      if (secondedHangReplyId) {
        const { error: undoError } = await (supabase as any)
          .from('board_replies')
          .delete()
          .eq('id', secondedHangReplyId)
          .eq('author_id', profile.id);
        if (undoError) throw undoError;
        setSecondedHangIdeaId(null);
        setSecondedHangReplyId(null);
      }
      if (undoing) return;

      const { data, error } = await (supabase as any).from('board_replies').insert({
        community_id: communityId,
        post_id: idea.id,
        author_id: profile.id,
        content: "+1 — I'm in! 🙋",
      }).select('id').single();
      if (error) throw error;
      setSecondedHangIdeaId(idea.id);
      setSecondedHangReplyId((data as { id: string }).id);
      setHangConfetti(true);
    } catch (error) {
      console.warn('Could not update the hang idea vote', error);
    } finally {
      setHangSecondingId(null);
    }
  };

  // Keyboard paging on web, deck-style: ← → step the wizard — but never
  // while you're typing in a field (arrows belong to the text cursor there).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || finished) return;
    const onKeyDown = (event: any) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase?.() ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const goBack = () => {
    // Step one has nothing behind it inside the tune-up, so back IS close —
    // and close goes to a named room. See `leaveTuneup`.
    if (stepIndex === 0) {
      leaveTuneup();
      return;
    }
    setStepIndex((index) => Math.max(0, index - 1));
  };

  // "I did something else" + what you did = the kindness log. It posts to the
  // HIVE Helpers thread when you finish, and only if that exact line isn't
  // already there — so editing your answer or re-entering the tune-up doesn't
  // spam the board with copies.
  const logInsteadOnFinish = async () => {
    if (!profile || !communityId || isMidpoint) return;
    const raw = String(checkInAnswers.q_hive_help_recap ?? '');
    const { choice, instead } = parseFocusAnswer(raw);
    const content = instead.trim();
    if (choice !== 'I did something else' || !content) return;

    const thread = helperThread ?? await findHelperThread();
    if (!thread?.postId) return;

    const { data: already } = await supabase
      .from('board_replies')
      .select('id')
      .eq('post_id', thread.postId)
      .eq('author_id', profile.id)
      .eq('content', content)
      .limit(1);
    if ((already ?? []).length > 0) return;

    await postHelperLog(content);
  };

  // Clicking straight through the tune-up used to file a check-in made only of
  // the Progress line the app seeds for you — which then counted as showing up
  // on the arrival board (Nat 2026-07-25: "it should say hasn't checked in yet
  // like everyone else"). A check-in needs at least one answer YOU put there.
  const hasRealCheckInAnswers = () => {
    const seededProgress = String(checkInAnswers.q_pop_progress ?? '')
      .split('\n')
      .filter((line) => !/^\s*(checked off|done for me\s*💛?)\s*:/i.test(line))
      .join('')
      .trim();
    return Object.entries(checkInAnswers).some(([key, value]) => {
      if (key === 'q_pop_progress') return !!seededProgress;
      if (typeof value === 'number') return true;
      if (Array.isArray(value)) return value.length > 0;
      return String(value ?? '').trim().length > 0;
    });
  };

  // Seed both from whatever the profile already says, so the quarterly pass
  // opens showing your real answers rather than empty boxes.
  useEffect(() => {
    if (!profile) return;
    setReadingDraft(((profile as any).currently_reading ?? '') as string);
    setProfileDrafts(
      PROFILE_REVIEW_FIELDS.reduce<Record<string, string>>((drafts, field) => {
        drafts[field.column] = ((profile as any)[field.column] ?? '') as string;
        return drafts;
      }, {})
    );
  }, [profile?.id]);

  const saveProfileEdits = async () => {
    if (!profile || (!readingDirty && !profileDirty)) return true;

    const updates: Record<string, string | null> = {};
    if (readingDirty) updates.currently_reading = readingDraft.trim() || null;
    if (profileDirty) {
      PROFILE_REVIEW_FIELDS.forEach((field) => {
        updates[field.column] = (profileDrafts[field.column] ?? '').trim() || null;
      });
    }

    const { error } = await (supabase as any)
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);

    if (error) {
      setProfileSaveError('Could not save that to your profile — try again.');
      return false;
    }

    setProfileSaveError(null);
    setReadingDirty(false);
    setProfileDirty(false);
    return true;
  };

  const goNext = async () => {
    if (stepIndex >= steps.length - 1) {
      // Finishing: save any check-in answers the member touched this session.
      // The halfway pass must never file a check-in — that's the pre-meeting
      // ritual, and filing one now would light you up on the Arrival Board
      // weeks early.
      if (!isMidpoint && monthlyCheckInSurvey && checkInDirty && !checkInSaving && hasRealCheckInAnswers()) {
        setCheckInSaving(true);
        setCheckInError(null);
        const result = await submitResponse(monthlyCheckInSurvey.id, checkInAnswers);
        setCheckInSaving(false);
        if (result.error) {
          setCheckInError('Could not save your check-in answers. Please try again.');
          return;
        }
        setCheckInSubmitted(true);
        setCheckInDirty(false);
      }
      // Reading and the quarterly profile pass write on the way out, same as
      // the check-in answers above. A failure here stops the finish so the
      // member doesn't lose what they typed.
      if (!(await saveProfileEdits())) return;
      await logInsteadOnFinish();
      if (isMidpoint && communityId && profile) {
        void setStoredItemAsync(getHalfwayDoneKey(communityId, profile.id), '1');
      }
      setFinished(true);
      return;
    }
    setStepIndex((index) => index + 1);
  };

  if (!profile) return null;

  const renderWishCard = (wish: Wish) => {
    const isSpotlight = wish.id === spotlightWishId;
    // Only public wishes can take the spotlight — a private one never leaves
    // your profile, so starring it would promise something that can't happen.
    const canBeSpotlight = wish.status === 'public' && wish.is_active !== false;
    return (
      <View key={wish.id} style={{ gap: 6 }}>
        {canBeSpotlight ? (
          <Pressable
            onPress={() => { if (!isSpotlight) void setSpotlightWish(wish.id); }}
            disabled={isSpotlight}
            accessibilityRole="button"
            accessibilityState={{ selected: isSpotlight }}
            accessibilityLabel={isSpotlight
              ? "This is this month's HD"
              : `Make "${wish.title || wish.description}" this month's HD`}
            hitSlop={6}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingLeft: 2,
              alignSelf: 'flex-start',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontSize: 14 }}>{isSpotlight ? '⭐' : '☆'}</Text>
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: isSpotlight ? '#bd9348' : '#a09274',
              }}
            >
              {isSpotlight ? "This month's HD — the one the HIVE sees" : 'Make this my HD'}
            </Text>
          </Pressable>
        ) : null}
        <View
          style={isSpotlight ? {
            borderWidth: 2,
            borderColor: '#bd9348',
            borderRadius: 20,
            padding: 3,
            backgroundColor: 'rgba(222,193,129,0.12)',
          } : undefined}
        >
          <WishCombCard
            wish={wish}
            ownerId={profile.id}
            ownerName={profile.name}
            ownerAvatarUrl={profile.avatar_url}
            compact
            onManage={(selectedWish) => setManagingWish(selectedWish as Wish)}
          />
        </View>
        {isSpotlight && liveWishes.length > 1 ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12, color: '#9a8060', paddingLeft: 2 }}>
            Your other wishes stay on your profile — star a different one to hand over the spotlight.
          </Text>
        ) : null}
      </View>
    );
  };

  const renderWishesStep = () => (
    <View style={{ gap: 12 }}>
      <StepHeader
        title="Your HD wishes"
        icon={<Text style={{ fontSize: 20 }}>⭐</Text>}
        subtitle="Let's check in on your HDs — still true? Anything new? What's changed since last meeting? Did anyone help you? Mark it granted and give them credit."
      />
      {wishesLoading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ThinkingBee />
        </View>
      ) : liveWishes.length === 0 ? (
        <View style={[cardStyle, { alignItems: 'center', paddingVertical: 28 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🌙</Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9a8060', textAlign: 'center' }}>
            No live HD wishes right now. What do you need help with?
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {liveWishes.map(renderWishCard)}
        </View>
      )}
      <Pressable
        onPress={() => setAddWishModalVisible(true)}
        style={({ pressed }) => ({
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.72)',
          backgroundColor: pressed ? '#fbf0d7' : '#fffdf7',
          paddingHorizontal: 14,
          paddingVertical: 9,
        })}
      >
        <Ionicons name="add" size={16} color="#bd9348" />
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>New wish</Text>
      </Pressable>
    </View>
  );

  const renderHangsStep = () => (
    <View>
      {/* Chronological, the way the month actually goes: look back at the
          hangs that happened, then +1 an idea already on the board, then pitch
          something new (Nat 2026-07-25). */}
      {/* The page header says HIVE hangs; each box then says its own job in
          bold. It used to stack a section label ON a question that repeated
          the same thing three ways (Nat 2026-07-25: "it's too much"). */}
      <StepHeader
        title="HIVE hangs"
        icon={<Text style={{ fontSize: 20 }}>🎉</Text>}
        subtitle={`Rate the ones you made it to, then pick what's next — ideas post straight to ${hangBoardName ?? 'the HIVE Hangs board'} so planning can start.`}
      />
      {(() => {
        const hangsRecap = checkInQuestions.find((question) => question.id === 'q_hangs_recap');
        return hangsRecap ? (
          <View style={[cardStyle, { marginBottom: 10, gap: 10 }]}>
            <HangsRecapCard
              question={hangsRecap}
              value={typeof checkInAnswers[hangsRecap.id] === 'string' ? (checkInAnswers[hangsRecap.id] as string) : ''}
              onChange={(value) => setCheckInAnswer(hangsRecap.id, value)}
              hangs={hangRecapEvents}
            />
            {/* Nat, filling in the August tune-up: "i just want to know where
                this info ends up… in case it doesn't carry somewhere". It
                carries: the meeting deck's "How did we do?" panel counts the
                taps into a turnout bar per hang and averages the 🍯 into a
                score. Only what is TRUE goes in this line — the written notes
                were only COUNTED on the deck when this line was written, so it
                promised the ratings and nothing else. The deck prints them in
                full now (meeting-helper.tsx, "What people said about the
                hangs"), so the line can honestly claim both. If that ever stops
                being true, this sentence has to shrink again — a promise about
                where words go is the one thing that must not drift. */}
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
              Your taps and 🍯 ratings land on the meeting deck — how many of us
              went, and how each hang landed — and what you write here gets read
              out with them.
            </Text>
          </View>
        ) : null;
      })()}
      {/* One question, one box: the chips ARE the choices and the writing area
          is the "or your own" option, the way a multiple-choice question with
          an Other field works. Two cards each saying "or suggest your own" was
          the same question asked twice (Nat 2026-07-25). */}
      <View style={[cardStyle, { gap: 10, position: 'relative', overflow: 'hidden' }]}>
        <ConfettiBurst visible={hangConfetti} onDone={() => setHangConfetti(false)} />
        <BoxHeading style={{ marginBottom: 0 }}>
          {existingHangIdeas.length > 0
            ? 'What should we do this month? Pick one, or write your own below.'
            : 'What should we do this month?'}
        </BoxHeading>
        {/* Stacked cards with a bubble on the left — the same shape as the
            hang rating cards a few inches up the page (Nat 2026-07-25). */}
        {existingHangIdeas.length > 0 ? (
          <View style={{ gap: 8 }}>
            {existingHangIdeas.map((idea) => {
              const isSeconded = secondedHangIdeaId === idea.id;
              return (
                <Pressable
                  key={idea.id}
                  onPress={() => void handleSecondHangIdea(idea)}
                  disabled={!!hangSecondingId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSeconded }}
                  accessibilityLabel={isSeconded ? `Take back your +1 for ${idea.title}` : `+1 the idea: ${idea.title}`}
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '100%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: isSeconded ? '#fdf3dc' : '#faf8f3',
                    borderWidth: 1,
                    borderColor: isSeconded ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: hangSecondingId === idea.id ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{isSeconded ? '🙋' : '○'}</Text>
                  <Text
                    style={{ fontFamily: isSeconded ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: isSeconded ? '#8a6b30' : '#6b7280', flexShrink: 1 }}
                    numberOfLines={2}
                  >
                    {idea.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {secondedHangIdeaId ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12, color: '#8e7a5e' }}>
            +1 sent — it's on the idea's thread 🎉 (tap again to take it back)
          </Text>
        ) : null}
        <ComposerBar
          tone="light"
          variant="form"
          value={hangTitle}
          onChangeText={setHangTitle}
          placeholder="Title (optional)"
          multiline={false}
        />
        <ComposerBar
          tone="light"
          variant="form"
          value={hangContent}
          onChangeText={setHangContent}
          placeholder="Bowling night? Beach day? Potluck?..."
          minHeight={90}
          onSubmit={handlePostHangIdea}
          canSubmit={!!hangContent.trim()}
          submitting={hangPosting}
        />
        {hangError ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{hangError}</Text>
        ) : null}
        <Pressable
          onPress={handlePostHangIdea}
          disabled={hangPosting || !hangContent.trim()}
          style={({ pressed }) => ({
            backgroundColor: hangContent.trim() ? '#bd9348' : '#e5e7eb',
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed || hangPosting ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: hangContent.trim() ? 'white' : '#a09274' }}>
            {hangPosting ? 'Posting...' : 'Post hang idea'}
          </Text>
        </Pressable>
      </View>
      <PostedConfirmation lines={hangPosted} boardName={hangBoardName} />
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        Post as many as you like — or tap "Looks good →" to skip.
      </Text>
    </View>
  );

  const renderCalendarStep = () => (
    <View>
      <StepHeader
        title="Calendar"
        icon={<Text style={{ fontSize: 20 }}>🗓️</Text>}
        subtitle="Upcoming events to add? Out of town at all? Anything you add shows up in Upcoming Events. Choose who can see it below."
      />
      <View style={[cardStyle, { gap: 10 }]}>
        <BoxHeading style={{ marginBottom: 0 }}>Add an event</BoxHeading>
        <Pressable
          onPress={handleOutOfTownPreset}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.72)',
            backgroundColor: pressed ? '#fbf0d7' : '#fdf3dc',
            paddingHorizontal: 12,
            paddingVertical: 7,
          })}
        >
          <Text style={{ fontSize: 13 }}>✈️</Text>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>I'm out of town</Text>
        </Pressable>
        <ComposerBar
          tone="light"
          variant="form"
          value={eventTitle}
          onChangeText={setEventTitle}
          placeholder="Event title"
          multiline={false}
        />
        <EventDateRow
          date={eventDate}
          onDateChange={setEventDate}
          endDate={eventEndDate}
          onEndDateChange={setEventEndDate}
        />
        <Pressable
          onPress={() => setEventAllDay((prev) => !prev)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: eventAllDay ? '#bd9348' : '#d1d5db',
              backgroundColor: eventAllDay ? '#bd9348' : 'white',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {eventAllDay ? <Text style={{ color: 'white', fontSize: 12 }}>✓</Text> : null}
          </View>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4a4a4a' }}>All day (no set time)</Text>
        </Pressable>
        {/* A clock time is not something anybody dictates, so it keeps the plain
            box — same cream fill, same gold hairline as everything around it. */}
        {!eventAllDay && (
          <TextInput
            value={eventTime}
            onChangeText={setEventTime}
            placeholder="Time (optional) — 7:30 PM"
            placeholderTextColor={PLACEHOLDER_INK}
            style={inputStyle}
          />
        )}
        <ComposerBar
          tone="light"
          variant="form"
          value={eventLocation}
          onChangeText={setEventLocation}
          placeholder="Location (optional)"
          multiline={false}
        />
        <EventAudienceToggle value={eventAudience} onChange={setEventAudience} />
        {eventError ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{eventError}</Text>
        ) : null}
        <Pressable
          onPress={handleCreateEvent}
          disabled={savingEvent}
          style={({ pressed }) => ({
            backgroundColor: eventTitle.trim() && eventDate ? '#bd9348' : '#e5e7eb',
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed || savingEvent ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: eventTitle.trim() && eventDate ? 'white' : '#a09274' }}>
            {savingEvent ? 'Adding...' : 'Add to HIVE calendar'}
          </Text>
        </Pressable>
      </View>
      {eventsAdded.length > 0 ? (
        <View
          style={{
            backgroundColor: '#ecfdf3',
            borderWidth: 1,
            borderColor: '#86efac',
            borderRadius: 14,
            padding: 12,
            marginTop: 12,
            gap: 4,
          }}
        >
          {eventsAdded.map((line, index) => (
            <Text key={`${line}-${index}`} style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#166534' }}>
              ✓ Added: {line}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        Add as many as you like — or tap "Looks good →" to skip.
      </Text>
    </View>
  );

  // At the meeting, HIVE Help is a REVIEW — how did it go, what's next month's
  // focus. Halfway through, neither question makes sense yet: the month isn't
  // over and the next focus gets picked in the room. The only useful question
  // now is "have you done it yet?" (Nat 2026-07-25).
  //
  // It also must not touch the check-in survey. Answering "how'd it go" here
  // used to file a real check-in — which would light you up on the Arrival
  // Board weeks before the meeting. This step is board posts and local state,
  // nothing else.
  const renderHalfwayHelpStep = () => {
    const focus = helperThread?.postTitle?.replace(/^.*HIVE Help(?:ers)?\s*[—–-]+\s*/i, '') ?? null;
    const options = [
      { key: 'done' as const, label: focus ? `Done it ✅` : 'Done it ✅' },
      { key: 'not_yet' as const, label: "Not yet — I'll get to it" },
      { key: 'other' as const, label: 'I did something else' },
    ];
    const wantsLog = halfwayHelpStatus === 'done' || halfwayHelpStatus === 'other';
    return (
      <View>
        <StepHeader
          title="Your HIVE Help"
          icon={<Text style={{ fontSize: 20 }}>🤝</Text>}
          subtitle="A nudge, not a test — there's no wrong answer here."
        />
        {/* Name the focus AND say what it means. "Shelter Donation" is a label;
            "bring something to our next meet up" is the actual ask, and it's
            been sitting unused in the thread body this whole time. Nobody
            should have to go find the board to remember the job
            (Nat 2026-07-25). */}
        {focus ? (
          <View
            style={{
              backgroundColor: '#fdf3dc',
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.55)',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginTop: -2,
              marginBottom: 14,
              gap: 4,
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30' }}>
              This month's HIVE Help: {focus}
            </Text>
            {helperThread?.postContent?.trim() ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: '#6f6559' }}>
                {helperThread.postContent.trim()}
              </Text>
            ) : null}
          </View>
        ) : null}
        <PostedConfirmation lines={helperPosted} boardName={helperThread?.postTitle ?? helperThread?.boardName ?? null} />

        <View style={[cardStyle, { marginTop: 14, gap: 12 }]}>
          <BoxHeading style={{ marginBottom: 0 }}>Have you done your HIVE Help yet?</BoxHeading>
          <View style={{ gap: 8 }}>
            {options.map((option) => {
              const selected = halfwayHelpStatus === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setHalfwayHelpStatus(selected ? null : option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                  style={{
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: selected ? '#fdf3dc' : '#faf8f3',
                    borderWidth: 1,
                    borderColor: selected ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ fontSize: 14 }}>{selected ? '●' : '○'}</Text>
                  <Text
                    style={{
                      fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                      fontSize: 14,
                      color: selected ? '#8a6b30' : '#6b7280',
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {halfwayHelpStatus === 'not_yet' ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 13, color: '#8e7a5e' }}>
              No stress — there's still time before the meeting. 💛
            </Text>
          ) : null}

          {/* Some focuses are one job ("bring a donation"); others are open-ended
              ("pay it behind", "pick up trash on a walk") and happen more than
              once. Logging stays optional either way. */}
          {wantsLog ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ComposerBar
          tone="light"
                variant="form"
                containerClassName="flex-1"
                value={halfwayHelpLog}
                onChangeText={setHalfwayHelpLog}
                placeholder={halfwayHelpStatus === 'other' ? 'What did you do instead?' : 'Want to log it? (optional)'}
                multiline={false}
                onSubmit={() => {
                  const content = halfwayHelpLog.trim();
                  if (!content) return;
                  void postHelperLog(content).then(() => setHalfwayHelpLog(''));
                }}
                canSubmit={!!halfwayHelpLog.trim()}
              />
              <Pressable
                onPress={() => {
                  const content = halfwayHelpLog.trim();
                  if (!content) return;
                  void postHelperLog(content).then(() => setHalfwayHelpLog(''));
                }}
                disabled={helperPosting || !halfwayHelpLog.trim()}
                style={({ pressed }) => ({
                  backgroundColor: halfwayHelpLog.trim() ? '#bd9348' : '#e5e7eb',
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  opacity: pressed || helperPosting ? 0.8 : 1,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: halfwayHelpLog.trim() ? 'white' : '#a09274' }}>
                  {helperPosting ? '…' : 'Log it'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {helperError ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{helperError}</Text>
          ) : null}
        </View>

        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
          Next month's focus gets picked at the meeting — nothing to decide here.
        </Text>
      </View>
    );
  };

  const renderHelpersStep = () => (
    <View>
      {/* A handshake, not the bee: the bee already heads the tune-up itself, so
          using it again here made two different steps wear the same mark
          (Nat 2026-07-26). Two hands also just says "helping each other" more
          plainly than a bee does. */}
      <StepHeader
        title="HIVE helps"
        icon={<Text style={{ fontSize: 20 }}>🤝</Text>}
        subtitle="Little kindnesses since last meeting — no act too tiny, totally optional."
      />
      {helperThread?.postTitle ? (
        <View style={{ marginTop: -6, marginBottom: 12, gap: 2 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
            Current focus: "{helperThread.postTitle.replace(/^.*HIVE Help(?:ers)?\s*[—–-]+\s*/i, '')}"
          </Text>
          {helperThread.postContent?.trim() ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18, color: '#9a8060' }}>
              {helperThread.postContent.trim()}
            </Text>
          ) : null}
        </View>
      ) : null}
      <PostedConfirmation lines={helperPosted} boardName={helperThread?.postTitle ?? helperThread?.boardName ?? null} />

      {(() => {
        const helpRecap = checkInQuestions.find((question) => question.id === 'q_hive_help_recap');
        return helpRecap ? (
          <View style={[cardStyle, { marginTop: 14 }]}>
            <SurveyQuestionField
              question={helpRecap}
              index={-1}
              value={checkInAnswers[helpRecap.id]}
              onChange={(value) => setCheckInAnswer(helpRecap.id, value)}
              hangEvents={hangRecapEvents}
            />
          </View>
        ) : null;
      })()}

      {/* Next month's focus: tap-to-second (confetti and all), or pitch fresh */}
      <View style={[cardStyle, { marginTop: 14, gap: 10, position: 'relative', overflow: 'hidden' }]}>
        <ConfettiBurst visible={helpConfetti} onDone={() => setHelpConfetti(false)} />
        {/* Only promise a choice when there's something to choose — an empty
            "choose one to +1" over nothing was a dead end (Nat 2026-07-24). */}
        <BoxHeading style={{ marginBottom: 0 }}>
          {helpIdeas.length > 0
            ? "Next meeting's focus — pick one, or pitch your own."
            : "Next meeting's focus — pitch one."}
        </BoxHeading>
        {helpIdeas.length > 0 ? (
          <View style={{ gap: 8 }}>
            {helpIdeas.map((idea) => {
              const isSeconded = secondedHelpIdea === idea;
              return (
                <Pressable
                  key={idea}
                  onPress={() => void handleSecondHelpIdea(idea)}
                  disabled={helpSeconding}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSeconded }}
                  accessibilityLabel={isSeconded ? `Take back your +1 for ${idea}` : `+1 the idea: ${idea}`}
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '100%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: isSeconded ? '#fdf3dc' : '#faf8f3',
                    borderWidth: 1,
                    borderColor: isSeconded ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: helpSeconding ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{isSeconded ? '🙋' : '○'}</Text>
                  <Text
                    style={{ fontFamily: isSeconded ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: isSeconded ? '#8a6b30' : '#6b7280', flexShrink: 1 }}
                    numberOfLines={2}
                  >
                    {idea}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {secondedHelpIdea ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12, color: '#8e7a5e' }}>
            +1 sent — it's on the ideas thread 🎉 (tap again to take it back)
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ComposerBar
          tone="light"
            variant="form"
            containerClassName="flex-1"
            value={helpIdeaContent}
            onChangeText={setHelpIdeaContent}
            placeholder="Add your own idea here…"
            multiline={false}
            onSubmit={handlePostHelpIdea}
            canSubmit={!!helpIdeaContent.trim()}
            submitting={helpIdeaPosting}
          />
          <Pressable
            onPress={handlePostHelpIdea}
            disabled={helpIdeaPosting || !helpIdeaContent.trim()}
            style={({ pressed }) => ({
              backgroundColor: helpIdeaContent.trim() ? '#bd9348' : '#e5e7eb',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 11,
              opacity: pressed || helpIdeaPosting ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: helpIdeaContent.trim() ? 'white' : '#a09274' }}>
              {helpIdeaPosting ? '…' : 'Pitch it'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        Nothing to log? No worries — tap "Looks good →".
      </Text>
    </View>
  );

  // Halfway step 1. Pills first so nobody faces a blank box: pick the KIND of
  // thing you want in the newsletter and the prompt changes to match.
  const renderNewsletterStep = () => {
    const active = NEWSLETTER_KINDS.find((kind) => kind.key === newsletterKind) ?? NEWSLETTER_KINDS[0];
    const showsRecipients = newsletterKind === 'shoutout'
      || newsletterKind === 'compliment'
      || newsletterKind === 'reminder';
    const hasNewsletterRecipient = newsletterMentionsEveryone || newsletterMentionedMembers.length > 0;
    const canPostNewsletterItem = !!newsletterText.trim()
      && (newsletterKind !== 'compliment' || hasNewsletterRecipient);

    const newsletterRecipients: (MentionTarget & { avatar_url?: string | null })[] = [
      ...mentionableMembers.filter((member) => member.id !== profile?.id),
      {
        ...hiveBroadcastTarget,
        // This face has always inserted @all. Keep that stable so tapping it
        // again can remove the same token, while the visible name comes from
        // the real scoped audience target above.
        id: '__broadcast_hive__',
        handle: 'all',
        avatar_url: null,
      },
    ];

    const isRecipientSelected = (member: MentionTarget) => member.isBroadcast
      ? newsletterMentionsEveryone
      : newsletterMentionedMembers.some((selected) => selected.id === member.id);

    const toggleNewsletterRecipient = (member: MentionTarget) => {
      if (!isRecipientSelected(member)) {
        selectNewsletterMention(member);
        return;
      }

      const escapedHandle = getMentionTargetHandle(member).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const handlePattern = member.isBroadcast ? '(?:all|everyone|hive)' : escapedHandle;
      setNewsletterText((current) => current
        .replace(new RegExp(`(^|\\s)@${handlePattern}\\b\\s*`, 'i'), '$1')
        .replace(/ {2,}/g, ' ')
        .trimStart());
      resetNewsletterMentionSelection();
    };

    const eventLabel = (event: NewsletterEvent) => {
      const date = new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      return `${event.title} — ${date}${event.location ? ` · ${event.location}` : ''}`;
    };

    const chooseNewsletterEvent = (event: NewsletterEvent) => {
      const label = eventLabel(event);
      setNewsletterText((current) => current.trim() ? `${current.trim()} ${label}` : label);
    };

    return (
      <View>
        <StepHeader
          title="Want anything in the newsletter?"
          subtitle="It goes out soon. Shout-outs, plugs, reminders, compliments — this is the easiest way in."
          icon={<Text style={{ fontSize: 20 }}>📰</Text>}
        />

        <View style={[cardStyle, { gap: 12 }]}>
          <BoxHeading style={{ marginBottom: 0 }}>What have you got?</BoxHeading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NEWSLETTER_KINDS.map((kind) => {
              const selected = kind.key === newsletterKind;
              return (
                <Pressable
                  key={kind.key}
                  onPress={() => setNewsletterKind(kind.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={kind.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: selected ? '#fdf3dc' : '#faf8f3',
                    borderWidth: 1,
                    borderColor: selected ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ fontSize: 14 }}>{selected ? '●' : '○'}</Text>
                  <Text
                    style={{
                      fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                      fontSize: 14,
                      color: selected ? '#8a6b30' : '#6b7280',
                    }}
                  >
                    {kind.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Face bubbles and typed @mentions are two doors into the same real
              mention. Either can be used alone, and both can be combined. */}
          {showsRecipients ? (
            <View style={{ gap: 8 }}>
              <BoxHeading style={{ marginBottom: 0 }}>
                {newsletterKind === 'reminder' ? 'Who should see it?' : "Who's it for?"}
              </BoxHeading>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
                Tap one or more faces, choose {hiveAudienceLabel}, or type @ below. They all work.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {newsletterRecipients.map((member) => {
                  const selected = isRecipientSelected(member);
                  return (
                    <Pressable
                      key={member.id}
                      onPress={() => toggleNewsletterRecipient(member)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${selected ? 'Remove' : 'Add'} ${member.name}`}
                      style={{ alignItems: 'center', width: member.isBroadcast ? 96 : 62, gap: 4 }}
                    >
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 26,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: selected ? 2.5 : 1,
                          borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.4)',
                          backgroundColor: 'transparent',
                          opacity: selected ? 1 : 0.85,
                        }}
                      >
                        {member.isBroadcast ? (
                          <Image source={hiveCrest} style={{ width: 46, height: 46 }} contentFit="contain" />
                        ) : (
                          <Avatar name={member.name} url={member.avatar_url} size={46} />
                        )}
                      </View>
                      <Text
                        numberOfLines={member.isBroadcast ? 2 : 1}
                        style={{
                          fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                          fontSize: 12,
                          lineHeight: 15,
                          textAlign: 'center',
                          color: selected ? '#8a6b30' : '#6b7280',
                        }}
                      >
                        {member.isBroadcast ? member.name : member.name.trim().split(/\s+/)[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {newsletterKind === 'plug' ? (
            <View style={{ gap: 10 }}>
              <BoxHeading style={{ marginBottom: 0 }}>Already on the calendar?</BoxHeading>
              {newsletterEventsLoading ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060' }}>
                  Loading upcoming events…
                </Text>
              ) : newsletterEvents.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {newsletterEvents.map((event) => (
                    <Pressable
                      key={event.id}
                      onPress={() => chooseNewsletterEvent(event)}
                      accessibilityRole="button"
                      accessibilityLabel={`Plug ${eventLabel(event)}`}
                      style={({ pressed }) => ({
                        borderWidth: 1,
                        borderColor: 'rgba(222,193,129,0.55)',
                        backgroundColor: pressed ? '#fdf3dc' : '#fffdf5',
                        borderRadius: 12,
                        paddingHorizontal: 11,
                        paddingVertical: 9,
                        maxWidth: 280,
                      })}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#4a4a4a' }}>
                        {event.title}
                      </Text>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8a6b30', marginTop: 2 }}>
                        {new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {event.location ? ` · ${event.location}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060' }}>
                  Nothing upcoming yet.
                </Text>
              )}

              <Pressable
                onPress={() => setShowNewsletterEventComposer((current) => !current)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showNewsletterEventComposer }}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.72)',
                  backgroundColor: pressed ? '#fbf0d7' : '#fdf3dc',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ fontSize: 15 }}>📅</Text>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30' }}>
                  {showNewsletterEventComposer ? 'Close calendar' : 'Add a new event'}
                </Text>
              </Pressable>

              {showNewsletterEventComposer ? (
                <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(222,193,129,0.35)', paddingTop: 10 }}>
                  <ComposerBar
          tone="light"
                    variant="form"
                    value={eventTitle}
                    onChangeText={setEventTitle}
                    placeholder="Event title"
                    multiline={false}
                  />
                  <EventDateRow
                    date={eventDate}
                    onDateChange={setEventDate}
                    endDate={eventEndDate}
                    onEndDateChange={setEventEndDate}
                  />
                  <Pressable
                    onPress={() => setEventAllDay((current) => !current)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: eventAllDay ? '#bd9348' : '#d1d5db',
                      backgroundColor: eventAllDay ? '#bd9348' : 'white',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {eventAllDay ? <Text style={{ color: 'white', fontSize: 12 }}>✓</Text> : null}
                    </View>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#4a4a4a' }}>All day</Text>
                  </Pressable>
                  {/* A clock time stays a plain box — nobody dictates "7:30 PM". */}
                  {!eventAllDay ? (
                    <TextInput
                      value={eventTime}
                      onChangeText={setEventTime}
                      placeholder="Time (optional) — 7:30 PM"
                      placeholderTextColor={PLACEHOLDER_INK}
                      style={inputStyle}
                    />
                  ) : null}
                  <ComposerBar
          tone="light"
                    variant="form"
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder="Location (optional)"
                    multiline={false}
                  />
                  <EventAudienceToggle value={eventAudience} onChange={setEventAudience} />
                  {eventError ? (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{eventError}</Text>
                  ) : null}
                  <Pressable
                    onPress={() => void handleCreateEvent()}
                    disabled={savingEvent || !eventTitle.trim() || !eventDate}
                    style={({ pressed }) => ({
                      backgroundColor: eventTitle.trim() && eventDate ? '#bd9348' : '#e5e7eb',
                      borderRadius: 12,
                      paddingVertical: 11,
                      alignItems: 'center',
                      opacity: pressed || savingEvent ? 0.8 : 1,
                    })}
                  >
                    <Text style={{
                      fontFamily: 'Lato_700Bold',
                      fontSize: 13,
                      color: eventTitle.trim() && eventDate ? 'white' : '#a09274',
                    }}>
                      {savingEvent ? 'Adding…' : 'Add to HIVE calendar'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* The shared bar carries @ tagging itself — the suggestion list and
                the "Tagged Nat" pills are drawn inside it now, so the face
                bubbles above and typing "@" here are still two doors into the
                same mention. */}
            <ComposerBar
          tone="light"
              variant="form"
              containerClassName="flex-1"
              value={newsletterText}
              onChangeText={setNewsletterText}
              placeholder={active.prompt}
              multiline={false}
              onSubmit={submitNewsletterItem}
              canSubmit={canPostNewsletterItem}
              submitting={newsletterPosting}
              mentionMembers={mentionableMembers}
              mentionsLoading={mentionableMembersLoading}
              mentionReach={mentionReach}
              currentUserId={profile?.id}
            />
            <Pressable
              onPress={() => void submitNewsletterItem()}
              disabled={newsletterPosting || !canPostNewsletterItem}
              style={({ pressed }) => ({
                backgroundColor: canPostNewsletterItem ? '#bd9348' : '#e5e7eb',
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 11,
                opacity: pressed || newsletterPosting ? 0.8 : 1,
              })}
            >
              <Text style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 13,
                color: canPostNewsletterItem ? 'white' : '#a09274',
              }}>
                {newsletterPosting ? '…' : 'Add it'}
              </Text>
            </Pressable>
            </View>
          </View>

          {newsletterError ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{newsletterError}</Text>
          ) : null}
        </View>

        {newsletterPosted.length > 0 ? (
          <PostedConfirmation
            lines={newsletterPosted.map((item) => item.content)}
            boardNames={newsletterPosted.map((item) => item.thread)}
          />
        ) : null}

        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
          Nothing this time? No worries — tap "Looks good →".
        </Text>
      </View>
    );
  };

  const renderReadingStep = () => (
    <View>
      <StepHeader
        title="What are you reading?"
        icon={<Text style={{ fontSize: 20 }}>📚</Text>}
        subtitle="Mingle fodder for before we start — so it doesn't have to eat floor time."
      />
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: '#9a8060', marginBottom: 10 }}>
        Book, audiobook, the same three articles all month, nothing at all — any
        answer is a fine answer. It lands on your profile so people can find
        their fellow readers.
      </Text>
      <ComposerBar
          tone="light"
        variant="form"
        value={readingDraft}
        onChangeText={(next) => {
          setReadingDraft((current) => (typeof next === 'function' ? next(current) : next));
          setReadingDirty(true);
        }}
        placeholder="Currently reading…"
        multiline={false}
      />
      {profileSaveError ? (
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626', marginTop: 8 }}>
          {profileSaveError}
        </Text>
      ) : null}
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 10 }}>
        Not reading anything? Leave it blank — "Looks good →" moves you on.
      </Text>
    </View>
  );

  // The quarterly pass. Everything is prefilled with what's already there and
  // every row is skippable — a blank form is exactly what nobody fills in, so
  // the default action is "yep, still right" rather than "compose something".
  const renderProfileReviewStep = () => (
    <View>
      <StepHeader
        title="A quick look at your profile"
        icon={<Text style={{ fontSize: 20 }}>🐝</Text>}
        subtitle="Everything below is what people see now — change what's stale, skip the rest."
      />
      <View style={{ gap: 10 }}>
        {PROFILE_REVIEW_FIELDS.map((field) => {
          const current = (profileDrafts[field.column] ?? '').trim();
          const isEditing = editingProfileField === field.column;
          return (
            <View
              key={field.column}
              style={{
                borderWidth: 1,
                borderColor: 'rgba(222,193,129,0.55)',
                borderRadius: 14,
                backgroundColor: '#fffdf5',
                padding: 12,
                gap: 6,
              }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase', color: '#8e6f35' }}>
                {field.label}
              </Text>
              {isEditing ? (
                // Editing one line of your profile in place — the shared box
                // with its own Done button, so the mic and the button that puts
                // the field away sit inside the same border.
                <ComposerBar
          tone="light"
                  variant="inlineEdit"
                  value={profileDrafts[field.column] ?? ''}
                  onChangeText={(next) => {
                    setProfileDrafts((drafts) => ({
                      ...drafts,
                      [field.column]: typeof next === 'function' ? next(drafts[field.column] ?? '') : next,
                    }));
                    setProfileDirty(true);
                  }}
                  placeholder={field.placeholder}
                  multiline={field.multiline}
                  minHeight={field.multiline ? 74 : undefined}
                  autoFocus
                  submitLabel="Done"
                  onSubmit={() => setEditingProfileField(null)}
                  // A bio is a paragraph — Enter still starts a new line there.
                  submitOnEnterKey={!field.multiline}
                  // Emptying a field on purpose is a real answer, so Done stays
                  // available even when the box is blank.
                  canSubmit
                />
              ) : (
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 15,
                    lineHeight: 21,
                    color: current ? '#2d2d2d' : '#a09274',
                    fontStyle: current ? 'normal' : 'italic',
                  }}
                >
                  {current || 'Nothing here yet'}
                </Text>
              )}
              {/* While you're editing, Done lives inside the box itself — a
                  second one out here would be the same button twice. */}
              {isEditing ? null : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable
                    onPress={() => setEditingProfileField(field.column)}
                    accessibilityRole="button"
                    hitSlop={6}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                      {current ? 'Change it' : 'Add one'}
                    </Text>
                  </Pressable>
                  {current ? (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
                      {field.prompt} Leave it be if so.
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </View>
      {profileSaveError ? (
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626', marginTop: 10 }}>
          {profileSaveError}
        </Text>
      ) : null}
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        All still right? Just tap "Looks good →" — nothing changes unless you change it.
      </Text>
    </View>
  );

  // Nat's idea, and the only realistic way anyone but her ever turns
  // HIVE-Wide visibility on (2026-08-09) — these are the same two switches on
  // Settings, brought here instead of left on a page nobody goes looking for.
  // Logic (the column-existence probe, the pending/saved pill state) lives
  // once in `usePrivacyChoices`; this just draws it in the tune-up's own
  // card style instead of Settings' Panel.
  const renderPrivacyStep = () => {
    const {
      community: privacyCommunity,
      checkedColumn,
      hasDefaultShareColumn,
      canDefaultWide,
      canSendFurther,
      travelOn,
      defaultWide,
      busyKey: privacyBusyKey,
      savedKey: privacySavedKey,
      saveProfileScope,
      saveDefaultShareScope,
    } = privacyChoices;

    return (
      <View>
        <StepHeader
          title="HIVE grew — here's your part of it"
          icon={<Text style={{ fontSize: 20 }}>🌍</Text>}
          subtitle="Three HIVEs now, and a shared space above them all. These two switches say how far you show up in it — change either any time."
        />
        <View style={cardStyle}>
          <Switch
            on={travelOn}
            busy={privacyBusyKey === 'profile_scope'}
            label="Show me HIVE-Wide"
            hint={
              travelOn
                ? 'Anyone in any HIVE can find you in the HIVE-Wide members list, and open your profile from anything you share.'
                : 'Only the people who share a HIVE with you can find you or open your profile.'
            }
            onToggle={(next) => void saveProfileScope(next)}
          />
          {privacySavedKey === 'profile_scope' && (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 12,
                color: '#9a8060',
                marginLeft: SWITCH_GUTTER,
                marginTop: -6,
                marginBottom: 6,
              }}
            >
              {travelOn
                ? 'Saved. You are in the HIVE-Wide members list now.'
                : 'Saved. You show up only inside your own HIVEs now.'}
            </Text>
          )}

          <View style={{ height: 1, backgroundColor: 'rgba(222,193,129,0.4)', marginLeft: SWITCH_GUTTER }} />

          {!checkedColumn ? (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <ThinkingBee />
            </View>
          ) : hasDefaultShareColumn && canDefaultWide ? (
            <>
              <Switch
                on={defaultWide}
                busy={privacyBusyKey === 'default_share_scope'}
                label={defaultWide ? 'New things go out HIVE-Wide' : 'New things start in your HIVE'}
                hint={
                  defaultWide
                    ? 'New wishes and threads go out to every HIVE. You can pull any single one back when you share it.'
                    : canSendFurther
                      ? 'New wishes and threads start here, with your HIVE. You can send any single one further when you share it.'
                      : 'New wishes and threads start here, with your HIVE.'
                }
                trailing={
                  <ScopeBadge
                    scope={defaultWide ? 'all_hives' : 'hive'}
                    community={privacyCommunity}
                    size="sm"
                  />
                }
                onToggle={(next) => void saveDefaultShareScope(next)}
              />
              {privacySavedKey === 'default_share_scope' && (
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 12,
                    color: '#9a8060',
                    marginLeft: SWITCH_GUTTER,
                    marginTop: -6,
                  }}
                >
                  {defaultWide
                    ? 'Saved. New wishes and threads will start HIVE-Wide.'
                    : 'Saved. New wishes and threads will start in your HIVE.'}
                </Text>
              )}
            </>
          ) : (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 13,
                lineHeight: 20,
                color: '#2d2d2d',
                paddingVertical: 12,
              }}
            >
              {canSendFurther
                ? 'New wishes and threads start in your HIVE. You can send any one of them further when you share it.'
                : 'New wishes and threads start in your HIVE, with the people here.'}
            </Text>
          )}
        </View>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
          Both save the moment you flip them — nothing to submit here.
        </Text>
      </View>
    );
  };

  const renderTodosStep = () => (
    <View>
      <StepHeader
        title="Your to-do list"
        icon={<Text style={{ fontSize: 20 }}>📋</Text>}
        subtitle="Anything from the meetings lands here. Check off what's done — it becomes your Progress memory-jogger at the next meeting, so wins don't get forgotten."
      />
      <View style={[cardStyle, { gap: 10 }]}>
        <BoxHeading style={{ marginBottom: 0 }}>Still open — tap to check off</BoxHeading>
        {openTodos.length === 0 ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9a8060' }}>
            Nothing open — clean slate ✨
          </Text>
        ) : (
          openTodos.map((todo) => (
            <Pressable
              key={todo.id}
              onPress={() => handleToggleTodo(todo, true)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#bd9348', marginTop: 1, backgroundColor: 'rgba(189,147,72,0.12)' }} />
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', flex: 1, lineHeight: 20 }}>
                {parseActionItemDescription(todo.description).text}
              </Text>
            </Pressable>
          ))
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <ComposerBar
          tone="light"
            variant="form"
            containerClassName="flex-1"
            value={newTodoText}
            onChangeText={setNewTodoText}
            placeholder="Add one (e.g. send Sara that Netherlands contact)"
            multiline={false}
            onSubmit={handleAddTodo}
            canSubmit={!!newTodoText.trim()}
            submitting={todoSaving}
          />
          <Pressable
            onPress={handleAddTodo}
            disabled={todoSaving || !newTodoText.trim()}
            style={({ pressed }) => ({
              backgroundColor: newTodoText.trim() ? '#bd9348' : '#e5e7eb',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              opacity: pressed || todoSaving ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: newTodoText.trim() ? 'white' : '#a09274' }}>Add</Text>
          </Pressable>
        </View>
      </View>
      {doneTodos.length > 0 ? (
        <View style={[cardStyle, { gap: 6, marginTop: 12 }]}>
          <BoxHeading>Done this cycle — tap to un-check</BoxHeading>
          {doneTodos.map((todo) => (
            <Pressable key={todo.id} onPress={() => handleToggleTodo(todo, false)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(142,122,94,0.36)', backgroundColor: 'rgba(142,122,94,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <Text style={{ color: '#8e7a5e', fontSize: 11, lineHeight: 13 }}>✓</Text>
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#8e7a5e', flex: 1, lineHeight: 19 }}>
                {parseActionItemDescription(todo.description).text}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {doneForMe.length > 0 ? (
        <View style={[cardStyle, { gap: 6, marginTop: 12, backgroundColor: '#fdf3dc' }]}>
          <BoxHeading>Done for you this cycle 💛</BoxHeading>
          {doneForMe.map((todo) => (
            <Text key={todo.id} style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#6b5b3e', lineHeight: 19 }}>
              {todo.helperName}: {todo.description}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 12 }}>
        All caught up? Tap "Looks good →".
      </Text>
    </View>
  );

  // The check-in questions live right here in the flow — no separate survey
  // modal at the end. Answers save when the member taps Finish.
  const checkInQuestions = (monthlyCheckInSurvey?.questions ?? [])
    .filter((question) => question.id !== 'q_carry_forward');

  // "Don't forget your donation!" — derived from the month's HIVE Help
  // thread title ("August HIVE Help — Shelter Donation"), so the reminder
  // updates itself as each month's focus changes.
  const helpFocusMatch = helperThread?.postTitle?.match(/HIVE Help(?:ers)?\s*[—–-]+\s*(.+)$/i);
  const helpFocus = helpFocusMatch?.[1]?.trim() ?? null;
  // "Current", not "this month's" — the focus turns over at each meeting.
  const helpFocusReminder = helpFocus
    ? /donat/i.test(helpFocus)
      ? `The HIVE Help focus is ${helpFocus} — don't forget to bring your donation to the meeting!`
      // A focus is often an ACT, not an object — "pay it behind" in a
      // drive-through, trash picked up on a walk. Nothing to carry in.
      : `The HIVE Help focus is ${helpFocus} — do yours out in the world, then tell us at the meeting!`
    : null;

  const renderCheckInStep = () => (
    <View>
      <StepHeader
        title="Check-in"
        icon={<Text style={{ fontSize: 20 }}>✅</Text>}
        subtitle="Last stop — a few quick questions so HIVE and Clive arrive prepared. Answers save when you tap Finish."
      />
      {/* The HIVE Help reminder banner used to sit here too, stacking a third
          bold-then-info block on top of the header and the submitted line
          before you reached question 1. The HIVE helps step already names the
          focus in gold (Nat 2026-07-25). */}
      {surveysLoading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <ThinkingBee />
        </View>
      ) : !monthlyCheckInSurvey ? (
        <View style={[cardStyle, { alignItems: 'center', paddingVertical: 28 }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🌙</Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9a8060', textAlign: 'center' }}>
            No monthly check-in is open right now. Tap Finish to wrap up your tune-up.
          </Text>
        </View>
      ) : (
        <View style={[cardStyle, { gap: 4 }]}>
          {checkInAlreadyDone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={14} color="#9a8060" />
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
                Already submitted for {monthName} — edits overwrite your earlier answers.
              </Text>
            </View>
          ) : null}
          {checkInQuestions.filter((question) => question.id !== 'q_hangs_recap' && question.id !== 'q_hive_help_recap').map((question, index) => (
            <SurveyQuestionField
              key={question.id}
              question={question}
              index={index}
              value={checkInAnswers[question.id]}
              onChange={(value) => setCheckInAnswer(question.id, value)}
              hangEvents={hangRecapEvents}
            />
          ))}
          {checkInError ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626' }}>{checkInError}</Text>
          ) : null}
        </View>
      )}
    </View>
  );

  const renderStep = () => {
    switch (steps[stepIndex].key) {
      case 'wishes':
        return renderWishesStep();
      case 'hangs':
        return renderHangsStep();
      case 'calendar':
        return renderCalendarStep();
      case 'helpers':
        return isMidpoint ? renderHalfwayHelpStep() : renderHelpersStep();
      case 'todos':
        return renderTodosStep();
      case 'checkin':
        return renderCheckInStep();
      case 'newsletter':
        return renderNewsletterStep();
      case 'reading':
        return renderReadingStep();
      case 'profile':
        return renderProfileReviewStep();
      case 'privacy':
        return renderPrivacyStep();
      default:
        return null;
    }
  };

  // This deck is OG HIVE's operating rhythm, not a generic template. Keep the
  // route boundary here as well as in Admin so a bookmarked/deep-linked URL
  // cannot open OG questions while somebody is standing in Tech or Production.
  if (!hasTailoredCheckIns(community)) {
    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="time-outline" size={34} color="#8a6b30" style={{ marginBottom: 14 }} />
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
            Check-ins
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
            onPress={leaveTuneup}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${exit.label}`}
            style={({ pressed }) => ({
              backgroundColor: '#bd9348',
              borderRadius: 14,
              paddingHorizontal: 28,
              paddingVertical: 13,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>
              Back to {exit.label}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          {/* The finish screen is the one place with room to spare — the crest
              earns its detail at this size (Nat 2026-07-25). */}
          <Image
            source={hiveBee}
            style={{ width: 150, height: 150, marginBottom: 20 }}
            contentFit="contain"
          />
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 24,
              color: '#2d2d2d',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            {isMidpoint ? "That's the halfway check-in done!" : `You're all tuned up for the ${monthName} meeting!`}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 22, color: '#7d715f', textAlign: 'center', marginBottom: 32 }}>
            {isMidpoint
              ? 'Anything you added goes straight into the newsletter — HIVE thanks you.'
              : 'Wishes refreshed, ideas posted, calendar updated — HIVE thanks you.'}
          </Text>
          {/* Finishing leaves the same way closing does — back to the room you
              opened the tune-up from, named on the button so you know where the
              tap is taking you. */}
          <Pressable
            onPress={leaveTuneup}
            style={({ pressed }) => ({
              backgroundColor: '#bd9348',
              borderRadius: 14,
              paddingHorizontal: 32,
              paddingVertical: 14,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>
              Back to {exit.label}
            </Text>
          </Pressable>
          {/* Never a dead end: finishing is a milestone, not a lock. Submitting
              again just overwrites your answers, so you can keep tuning as
              often as you like (Nat 2026-07-24). */}
          <Pressable
            onPress={() => {
              setFinished(false);
              setStepIndex(0);
            }}
            accessibilityRole="button"
            accessibilityLabel="Go back in and keep editing your tune-up"
            style={({ pressed }) => ({
              marginTop: 14,
              borderRadius: 14,
              paddingHorizontal: 24,
              paddingVertical: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30' }}>
              ← Keep editing — change anything you like
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={stepIndex === 0 ? 'Close tune-up' : 'Previous step'}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.55)',
          })}
        >
          <Ionicons name="chevron-back" size={20} color="#8a6b30" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image
              source={hiveBeeMark}
              style={{ width: 30, height: 30 }}
              contentFit="contain"
            />
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 20, color: '#2d2d2d' }}>
              {isMidpoint ? 'Halfway Check-in' : `${monthName} Tune-up`}
            </Text>
          </View>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 2 }}>
            Step {stepIndex + 1} of {steps.length} · {steps[stepIndex].label}
          </Text>
        </View>
        {/* Deck chrome: refresh + exit, quiet until you reach for them. */}
        <Pressable
          onPress={async () => {
            if (tuneupRefreshing) return;
            setTuneupRefreshing(true);
            try {
              await Promise.all([refetchSurveys(), refreshWishes()]);
            } finally {
              setTuneupRefreshing(false);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Refresh tune-up data"
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 0.4, paddingHorizontal: 6 })}
        >
          {tuneupRefreshing ? (
            <ThinkingBee />
          ) : (
            <Ionicons name="refresh" size={20} color="#8a6b30" />
          )}
        </Pressable>
        <Pressable
          onPress={leaveTuneup}
          accessibilityRole="button"
          accessibilityLabel={`Leave the tune-up and go back to ${exit.label}`}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 0.4, paddingHorizontal: 6 })}
        >
          <Ionicons name="close" size={22} color="#8a6b30" />
        </Pressable>
      </View>

      {/* Progress dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
        {steps.map((step, index) => (
          <View
            key={step.key}
            style={{
              width: index === stepIndex ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: index <= stepIndex ? '#bd9348' : 'rgba(189,147,72,0.24)',
            }}
          />
        ))}
      </View>

      <View style={{ flex: 1 }}>
        <BounceScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: showFlankArrows ? 56 : 16,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </BounceScrollView>
        {/* Flank arrows, the deck's pattern. The content gets extra side
            padding when they're up so they never sit on a field. */}
        {showFlankArrows && stepIndex > 0 ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Previous step"
            style={({ pressed }) => ({
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 1 : 0.32,
            })}
          >
            <Ionicons name="chevron-back" size={30} color="#bd9348" />
          </Pressable>
        ) : null}
        {showFlankArrows ? (
          <Pressable
            onPress={() => void goNext()}
            accessibilityRole="button"
            accessibilityLabel={stepIndex >= steps.length - 1 ? 'Finish the tune-up' : 'Next step'}
            style={({ pressed }) => ({
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 1 : 0.32,
            })}
          >
            <Ionicons name="chevron-forward" size={30} color="#bd9348" />
          </Pressable>
        ) : null}
      </View>

      {/* Footer: Back / Next — Next always available so every step is skippable */}
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: 'rgba(222,193,129,0.35)',
          backgroundColor: '#fffdf5',
        }}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.55)',
            backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30' }}>
            {stepIndex === 0 ? 'Close' : 'Back'}
          </Text>
        </Pressable>
        <Pressable
          onPress={goNext}
          style={({ pressed }) => ({
            flex: 2,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: 'center',
            backgroundColor: '#bd9348',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: 'white' }}>
            {stepIndex === steps.length - 1
              ? checkInSaving ? 'Saving...' : checkInDirty ? 'Save & finish ✓' : 'Finish ✓'
              : 'Looks good →'}
          </Text>
        </Pressable>
      </View>

      {/* Wish manage / edit / add / grant — same wiring as profile.tsx */}
      <WishManageModal
        visible={!!managingWish}
        wish={managingWish}
        onClose={() => setManagingWish(null)}
        canGrant={!!managingWish && canGrantWish(managingWish)}
        canEdit={!!managingWish && canEditWish(managingWish)}
        canArchive={!!managingWish && canArchiveWish(managingWish)}
        canDelete={!!managingWish}
        canRefine={!!managingWish && canRefineWish(managingWish)}
        onGrant={openGrantModal}
        onEdit={(wish) => setEditingWish(wish)}
        onArchive={handleArchiveWish}
        onDelete={handleDeleteWish}
        onRefine={(wish) => handleRefineWithClive(wish.description)}
      />

      {wishToGrant && (
        <GrantWishModal
          visible={!!wishToGrant}
          onClose={() => setWishToGrant(null)}
          wish={wishToGrant}
          communityId={communityId}
          onGrant={handleGrantWish}
        />
      )}

      <AddWishModal
        visible={addWishModalVisible}
        onClose={() => setAddWishModalVisible(false)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleWishSaved}
        onRefineWithClive={handleRefineWithClive}
      />
      <AddWishModal
        visible={!!editingWish}
        onClose={() => setEditingWish(null)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleWishSaved}
        existingWish={editingWish}
        wishOwnerUserId={editingWish?.user_id}
        wishOwnerName={editingWish?.user?.name}
      />

    </SafeAreaView>
  );
}

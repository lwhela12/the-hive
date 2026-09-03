import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ComposerBar } from '../ui/ComposerBar';
import type { SurveyQuestion } from '../../lib/hooks/useSurveys';
import { useAuth } from '../../lib/hooks/useAuth';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { supabase } from '../../lib/supabase';
import { ReachPill } from '../ui/ReachPill';
import { accentPalette, HIVE_GOLD } from '../../lib/hiveBrand';

export function ScaleInput({ value, onChange, accent = HIVE_GOLD }: { value: number | null; onChange: (v: number) => void; accent?: string }) {
  const tint = accentPalette(accent);
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: value === n ? tint.accent : '#faf8f3',
            borderWidth: 1,
            borderColor: value === n ? tint.accent : tint.line(0.4),
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: value === n ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 15, color: value === n ? 'white' : '#6b7280' }}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ChoiceInput({ options, value, onChange, multi, accent = HIVE_GOLD }: { options: string[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean; accent?: string }) {
  const tint = accentPalette(accent);
  const selected = multi ? (value as string[]) : [value as string];
  const toggle = (opt: string) => {
    if (multi) {
      const arr = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
      onChange(arr);
    } else {
      onChange(opt);
    }
  };
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => toggle(opt)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: active ? tint.wash : '#faf8f3',
              borderWidth: 1, borderColor: active ? tint.line(0.6) : tint.line(0.2),
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
            }}
          >
            <View style={{
              width: 18, height: 18,
              borderRadius: multi ? 4 : 9,
              borderWidth: 2, borderColor: active ? tint.accent : '#d1d5db',
              backgroundColor: active ? tint.accent : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {active && <Text style={{ color: 'white', fontSize: 11 }}>{multi ? '✓' : '●'}</Text>}
            </View>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', flex: 1 }}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The box you answer a survey question in — the shared message bar, wearing
 * form clothes.
 *
 * It used to be a hand-rolled TextInput with the mic bolted on beside it, one
 * of the several answers the app had to "what does a text box look like". Now
 * it is `ComposerBar`, so a survey answer looks and behaves exactly like
 * Clive's bar and the board composer: same cream-and-gold box, same mic in the
 * same place, and the mic APPENDS through the shared dictation logic rather
 * than a copy of it written here.
 *
 * Every survey in HIVE renders through this one function, so this is the field
 * members type into most.
 */
export function VoiceTextInput({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  communityId,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** Turns on @-mention profile bubbles, same as Compliment Corner (Nat,
   *  2026-08-13, looking at "Who showed up for you this year?": "are we
   *  supposed to tag people? If so, we shoudl show their little profile
   *  bubbles"). ComposerBar already has the picker built in — survey answer
   *  boxes just never handed it a member list before. */
  communityId?: string | null;
}) {
  const { members: mentionMembers, loading: mentionsLoading } = useMentionableMembers(communityId);
  return (
    <ComposerBar
      tone="light"
      variant="form"
      containerClassName="mt-2"
      value={value}
      // ComposerBar hands dictation an updater; this call site only ever wants
      // the resulting string, so resolve it here.
      onChangeText={(next) => onChangeText(typeof next === 'function' ? next(value) : next)}
      placeholder={placeholder ?? 'Your answer...'}
      multiline={multiline}
      minHeight={multiline ? 100 : undefined}
      mentionMembers={mentionMembers}
      mentionsLoading={mentionsLoading}
    />
  );
}

export interface HangRecapEvent {
  id: string;
  title: string;
  /**
   * `YYYY-MM-DD`. Nat, 2026-09-02, looking at four unlabelled chips: *"I also
   * think these need to have dates on them."* She is right — "Taste!" and "Put
   * stuff in resin" are asking *did you make it to this*, and a month's worth
   * of hangs with no dates is a memory test rather than a question.
   */
  eventDate?: string | null;
}

const HANG_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HANG_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tue Sep 23" — enough to remember the evening by, and no more. */
function hangDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${HANG_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${HANG_MONTHS[m - 1]} ${d}`;
}

// The hangs-recap answer is one plain string so every existing display keeps
// working: "Went to: Taste (4/5) · Drag Brunch" on the first line (rating in
// parens when given), free-form thoughts after.
type HangAttendance = { title: string; rating: number | null };

export const parseHangsAnswer = (raw: string) => {
  const lines = raw.split('\n');
  if (!lines[0]?.startsWith('Went to: ')) {
    return { attended: [] as HangAttendance[], note: raw };
  }
  const attended = lines[0]
    .slice('Went to: '.length)
    .split(' · ')
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)(?:\s\((\d)\/5\))?$/);
      return { title: (match?.[1] ?? entry).trim(), rating: match?.[2] ? Number(match[2]) : null };
    });
  return { attended, note: lines.slice(1).join('\n') };
};

const composeHangsAnswer = (attended: HangAttendance[], note: string) => {
  const head = attended.length > 0
    ? `Went to: ${attended.map((entry) => (entry.rating ? `${entry.title} (${entry.rating}/5)` : entry.title)).join(' · ')}`
    : '';
  return [head, note].filter(Boolean).join('\n');
};

// The HIVE Help recap. Encoded with a parseable first line like the hangs
// answer, so the deck can COUNT how the focus landed instead of only quoting
// paragraphs — that difference is the whole point of structuring it.
//
// Options carry a score so the deck can average them; "did something else" and
// "didn't get to it" have none (one is a different act, the other isn't one).
export const FOCUS_OPTIONS: { label: string; score: number | null }[] = [
  { label: 'Loved it', score: 5 },
  { label: 'Liked it', score: 4 },
  { label: 'It was OK', score: 3 },
  { label: 'Not for me', score: 2 },
  { label: 'I did something else', score: null },
  { label: "Didn't get to it", score: null },
];

const DID_SOMETHING_ELSE = 'I did something else';

export const parseFocusAnswer = (raw: string) => {
  const lines = raw.split('\n');
  const head = lines[0]?.trim() ?? '';
  const elseMatch = head.match(/^I did something else(?:\s*:\s*(.*))?$/);
  if (elseMatch) {
    return { choice: DID_SOMETHING_ELSE, instead: elseMatch[1]?.trim() ?? '', note: lines.slice(1).join('\n') };
  }
  const option = FOCUS_OPTIONS.find((entry) => entry.label === head);
  if (!option) return { choice: null as string | null, instead: '', note: raw };
  return { choice: option.label, instead: '', note: lines.slice(1).join('\n') };
};

/** The 1-5 score behind an answer, or null when it doesn't carry one. */
export const focusAnswerScore = (raw: string) => {
  const { choice } = parseFocusAnswer(raw);
  return FOCUS_OPTIONS.find((entry) => entry.label === choice)?.score ?? null;
};

/** Did they do SOMETHING — the focus itself or their own act? */
export const focusAnswerDidIt = (raw: string) => {
  const { choice } = parseFocusAnswer(raw);
  return !!choice && choice !== "Didn't get to it";
};

const composeFocusAnswer = (choice: string | null, instead: string, note: string) => {
  const head = !choice
    ? ''
    : choice === DID_SOMETHING_ELSE
      ? `${DID_SOMETHING_ELSE}${instead.trim() ? `: ${instead.trim()}` : ''}`
      : choice;
  return [head, note].filter(Boolean).join('\n');
};

export function FocusRecapInput({
  value,
  onChange,
  accent = HIVE_GOLD,
}: {
  value: string;
  onChange: (value: string) => void;
  accent?: string;
}) {
  const tint = accentPalette(accent);
  const { choice, instead, note } = parseFocusAnswer(value);

  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <View style={{ gap: 8 }}>
        {FOCUS_OPTIONS.map((option) => {
          const active = choice === option.label;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange(composeFocusAnswer(active ? null : option.label, instead, note))}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                alignSelf: 'flex-start',
                maxWidth: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: active ? tint.wash : '#faf8f3',
                borderWidth: 1,
                borderColor: active ? tint.line(0.7) : tint.line(0.25),
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 15 }}>{active ? '🙌' : '○'}</Text>
              <Text
                style={{ fontFamily: active ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: active ? '#8a6b30' : '#6b7280', flexShrink: 1 }}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {choice === DID_SOMETHING_ELSE ? (
        <VoiceTextInput
          value={instead}
          onChangeText={(next) => onChange(composeFocusAnswer(choice, next, note))}
          placeholder="What did you do? (this gets logged on the HIVE Helpers board)"
        />
      ) : null}
      <VoiceTextInput
        value={note}
        onChangeText={(next) => onChange(composeFocusAnswer(choice, instead, next))}
        placeholder="Anything else you'd like to share?"
        multiline
      />
    </View>
  );
}

export function HangsRecapInput({
  value,
  onChange,
  hangs,
  accent = HIVE_GOLD,
}: {
  value: string;
  onChange: (value: string) => void;
  hangs: HangRecapEvent[];
  accent?: string;
}) {
  const tint = accentPalette(accent);
  const { attended, note } = parseHangsAnswer(value);

  if (hangs.length === 0) {
    return (
      <VoiceTextInput
        value={value}
        onChangeText={onChange}
        placeholder="Any hangs, thoughts, or suggestions?"
        multiline
      />
    );
  }

  const toggle = (title: string) => {
    const next = attended.some((entry) => entry.title === title)
      ? attended.filter((entry) => entry.title !== title)
      : [...attended, { title, rating: null }];
    onChange(composeHangsAnswer(next, note));
  };

  const rate = (title: string, rating: number) => {
    const next = attended.map((entry) =>
      entry.title === title ? { ...entry, rating: entry.rating === rating ? null : rating } : entry
    );
    onChange(composeHangsAnswer(next, note));
  };

  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
        Tap the ones you made it to, then rate them.
      </Text>
      {hangs.map((hang) => {
        const entry = attended.find((candidate) => candidate.title === hang.title);
        return (
          // The card hugs its title instead of ruling a line across the whole
          // step, and there's no "didn't make it" label sitting way off to the
          // right — not going is simply not tapping it (Nat 2026-07-25).
          <View
            key={hang.id}
            style={{
              alignSelf: 'flex-start',
              maxWidth: '100%',
              backgroundColor: entry ? tint.wash : '#faf8f3',
              borderWidth: 1,
              borderColor: entry ? tint.line(0.7) : tint.line(0.25),
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
              <View style={{ flexShrink: 1 }}>
                <Text
                  style={{ fontFamily: entry ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: entry ? '#8a6b30' : '#6b7280' }}
                  numberOfLines={2}
                >
                  {hang.title}
                </Text>
                {hang.eventDate ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: '#9a8060', marginTop: 1 }}>
                    {hangDate(hang.eventDate)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {entry ? (
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
            ) : null}
          </View>
        );
      })}
      <VoiceTextInput
        value={note}
        onChangeText={(nextNote) => onChange(composeHangsAnswer(attended, nextNote))}
        placeholder="Anything to add? Stories, suggestions, 'let's do that one again'…"
        multiline
      />
    </View>
  );
}

// One survey question — same look everywhere the check-in renders.
export function SurveyQuestionField({
  question,
  index,
  value,
  onChange,
  hangEvents,
  communityId,
  answers,
  onSetAnswer,
  accent = HIVE_GOLD,
}: {
  question: SurveyQuestion;
  index: number;
  value: any;
  onChange: (value: any) => void;
  hangEvents?: HangRecapEvent[];
  communityId?: string | null;
  /** Every answer so far, for a question that carries more than one decision. */
  answers?: Record<string, any>;
  /** Write an answer under a key other than this question's own. */
  onSetAnswer?: (id: string, value: any) => void;
  /**
   * The colour this survey wears. Handed down by `SurveyModal`, which reads it
   * off the SURVEY rather than off wherever the member happens to be standing —
   * the HIVE-Wide End of the month belongs to no HIVE and stays gold.
   */
  accent?: string;
}) {
  const tint = accentPalette(accent);
  const textValue = typeof value === 'string' ? value : '';

  // The 3MIQ question brings the member's own answers TO them — never
  // "peek at your profile". Nat, 2026-08-13: "if you tell someone 'leave
  // this screen, navigate to this other screen & come back', it'll never
  // work. Ever."
  const { profile, community } = useAuth();
  const router = useRouter();
  const [miqLaterDismissed, setMiqLaterDismissed] = useState(false);
  /**
   * Your own HD wishes, offered back to you inside the check-in.
   *
   * The same rule as the 3MIQ block above: never tell somebody to leave the
   * screen, go and look something up, and come back. On a HIVE's first night
   * this list is empty for everybody — nobody has made a wish yet — so the
   * Clive door and the box beside it are what the room actually uses, and the
   * picker starts earning its keep from the second meeting on.
   */
  const isHdWish = question.id === 'q_hd_wish';
  const hdReach: 'hive' | 'all_hives' = answers?.q_hd_wish_reach === 'all_hives' ? 'all_hives' : 'hive';
  const [pickableWishes, setPickableWishes] = useState<
    { id: string; description: string; fromHive: string | null; reach: 'hive' | 'all_hives' }[]
  >([]);
  useEffect(() => {
    if (!isHdWish || !profile?.id || !communityId) return;
    let live = true;
    (async () => {
      /**
       * This HIVE's wishes, plus every wish of yours that travels — whichever
       * HIVE it was written in.
       *
       * A wish is the one thing on the scope ladder that picks its own rung, so
       * a wish marked HIVE-Wide belongs on its owner's screen everywhere. The
       * member card learned this on 2026-08-19 and the profile panel on
       * 2026-08-28; the check-in is the third screen the fix had never reached.
       * Nat, 2026-09-01: *"this is tricky, because it might be across hives,
       * but i have my wishes marked as HIVE wide, so they should show up here,
       * right?"* Right.
       *
       * A wish that stayed home stays home. That is the ladder doing its job,
       * not a gap.
       */
      const { data, error } = await (supabase as any)
        .from('wishes')
        .select('id, description, share_scope, community_id, community:communities(name)')
        .eq('user_id', profile.id)
        .eq('status', 'public')
        .eq('is_active', true)
        .or(`community_id.eq.${communityId},share_scope.eq.all_hives`)
        .order('created_at', { ascending: false });
      if (!live) return;
      if (error) {
        console.warn('Could not load your wishes for the check-in', error);
        return;
      }
      setPickableWishes(
        ((data ?? []) as any[])
          .filter((wish) => !!String(wish.description ?? '').trim())
          .map((wish) => ({
            id: String(wish.id),
            description: String(wish.description).trim(),
            // Only says so when it came from somewhere else — a wish written
            // here does not need telling you where you are standing.
            fromHive: wish.community_id === communityId ? null : (wish.community?.name ?? null),
            reach: (wish.share_scope === 'all_hives' ? 'all_hives' : 'hive') as 'hive' | 'all_hives',
          }))
      );
    })();
    return () => { live = false; };
  }, [isHdWish, profile?.id, communityId]);
  const miqEntries = question.id === 'q_quarter_miq'
    ? ([
        ['Experiences', (profile as any)?.miq_experiences],
        ['Growth', (profile as any)?.miq_growth],
        ['Contribution', (profile as any)?.miq_contribution],
      ] as const).filter(([, answer]) => typeof answer === 'string' && answer.trim().length > 0)
    : [];

  /**
   * A block that explains rather than asks.
   *
   * Nat, 2026-09-01, scrolling her own check-in: *"I want it more obvious,
   * like, explaining how the HIVE's work. Like saying that the purpose of the
   * HIVE is helping all of us achieve our goals/higher purpose. Explain what a
   * High Definition wish is & that we go over them in our HummDinger
   * sessions."* Four prose boxes in a row are four chores; the same four
   * behind a paragraph saying what they are for are the shape of a
   * conversation.
   *
   * It wears the HIVE's own tint, carries no number and no input, and stores
   * nothing — so it can never be a question whose answer goes nowhere.
   */
  if (question.type === 'note') {
    return (
      <View
        style={{
          marginBottom: 24,
          backgroundColor: tint.wash,
          borderWidth: 1,
          borderColor: tint.line(0.5),
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          gap: 8,
        }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: tint.ink, lineHeight: 22 }}>
          {question.text}
        </Text>
        {(question.body ?? []).map((paragraph) => (
          <Text key={paragraph} style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, color: '#5c5648', lineHeight: 20 }}>
            {paragraph}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        {/* index -1 = question embedded in another step; no number chip */}
        {index >= 0 && (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tint.wash, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: tint.accent }}>{index + 1}</Text>
          </View>
        )}
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', flex: 1, lineHeight: 22 }}>
          {question.text}
          {question.required && <Text style={{ color: tint.accent }}> *</Text>}
        </Text>
      </View>

      {question.id === 'q_quarter_miq' && (
        <View style={{ backgroundColor: tint.wash, borderWidth: 1, borderColor: tint.line(0.5), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, gap: 4 }}>
          {miqEntries.length > 0 ? (
            miqEntries.map(([label, answer]) => (
              <Text key={label} style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', lineHeight: 18 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', color: tint.ink }}>{label}: </Text>
                {String(answer).trim()}
              </Text>
            ))
          ) : miqLaterDismissed ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#8e7a5e', lineHeight: 18 }}>
              No worries — Clive's around whenever you want to write it.
            </Text>
          ) : (
            <>
              {/* No 3MIQ yet: a fork, not homework. Answers draft-save, so
                  stepping out to Clive loses nothing. (Nat, 2026-08-13.) */}
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: tint.ink, lineHeight: 18 }}>
                No 3MIQ yet?
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Pressable
                  onPress={() => router.push({
                    pathname: '/(app)',
                    params: {
                      prefill: 'Help me discover my 3 Most Important Questions. I want one for experiences, one for growth, and one for contribution.',
                    },
                  })}
                  accessibilityRole="button"
                  style={{ backgroundColor: tint.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', fontSize: 13 }}>
                    Figure it out with Clive now ✨
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMiqLaterDismissed(true)}
                  accessibilityRole="button"
                  style={{ backgroundColor: '#f5f3ee', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#8e7a5e', fontSize: 13 }}>
                    I'll do it later
                  </Text>
                </Pressable>
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: '#9b8a6b', marginTop: 6 }}>
                Your answers here are saved — you can hop to Clive and come right back.
              </Text>
            </>
          )}
        </View>
      )}

      {isHdWish && (
        <View style={{ backgroundColor: tint.wash, borderWidth: 1, borderColor: tint.line(0.5), borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, gap: 8 }}>
          {pickableWishes.length > 0 ? (
            <>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: tint.ink, lineHeight: 18 }}>
                One you already have
              </Text>
              <View style={{ gap: 6 }}>
                {pickableWishes.map((wish) => {
                  const description = wish.description;
                  const chosen = textValue.trim() === description;
                  return (
                    <Pressable
                      key={wish.id}
                      onPress={() => {
                        onChange(chosen ? '' : description);
                        // A wish you already have arrives with its own reach.
                        // Without this, picking a HIVE-Wide wish and pressing
                        // submit would quietly pull it back home.
                        if (!chosen) onSetAnswer?.('q_hd_wish_reach', wish.reach);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Make this your focus: ${description}`}
                      style={{
                        backgroundColor: chosen ? tint.accent : '#fffdf5',
                        borderWidth: 1,
                        borderColor: chosen ? tint.accent : tint.line(0.5),
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ fontFamily: chosen ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 13, color: chosen ? 'white' : '#5c5648', lineHeight: 19 }}>
                        {description}
                      </Text>
                      {wish.fromHive ? (
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: chosen ? 'rgba(255,255,255,0.85)' : '#9b8a6b', marginTop: 3 }}>
                          from {wish.fromHive}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          {/* Nat, 2026-09-01, opening her own profile mid-check-in and finding
              HD Wishes (0): *"i think then maybe the survey should say
              something like, looks like you dont have one yet, would you like
              to write one now or refine with clive."* A picker with nothing in
              it explains nothing; the same space can say where you are and
              offer the two ways forward. */}
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: tint.ink, lineHeight: 18 }}>
            {pickableWishes.length > 0
              ? 'Or make a new one'
              : 'This will be your first HD wish'}
          </Text>
          {pickableWishes.length === 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', lineHeight: 19 }}>
              Write it in the box below, or let Clive ask you the questions that find it.
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => router.push({
                pathname: '/(app)',
                params: {
                  prefill: textValue.trim()
                    ? `Help me turn this into a High Definition wish for my HIVE — specific enough that somebody could actually grant it: "${textValue.trim()}"`
                    : 'Help me find my High Definition wish for this HIVE. Ask me where I am, where I want to be, what I have tried and where I am stuck.',
                },
              })}
              accessibilityRole="button"
              style={{ backgroundColor: tint.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', fontSize: 13 }}>
                Shape it with Clive ✨
              </Text>
            </Pressable>
          </View>
          {/* How far it travels, decided here rather than hunted for on the
              profile afterwards. THE pill, the same shape as everywhere else,
              and it starts at the safe end of the ladder. A HIVE whose ceiling
              stops at its own walls is never offered the choice. */}
          {onSetAnswer && community?.max_share_scope !== 'hive' ? (
            <View style={{ gap: 5, marginTop: 2 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: tint.ink, lineHeight: 18 }}>
                Who sees it
              </Text>
              {/* The same pill the profile wears, at the same size. Nat,
                  2026-09-01: *"i think we need every toggle to look the same."*
                  It was drawing at 'sm' beside a full-width question, which
                  read as a different control rather than the one she already
                  knows. Her own rule, from the day this component was made:
                  one toggle, one pill, one shape everywhere. */}
              <ReachPill
                reach={hdReach}
                size="md"
                onToggle={() => onSetAnswer('q_hd_wish_reach', hdReach === 'all_hives' ? 'hive' : 'all_hives')}
                communityId={communityId}
              />
            </View>
          ) : null}
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: '#9b8a6b' }}>
            Your answers here are saved — you can hop to Clive and come right back. Whatever ends up in the box becomes your HD.
          </Text>
        </View>
      )}

      {(question.type === 'short' || question.type === 'long') && (
        <VoiceTextInput
          value={textValue}
          onChangeText={onChange}
          multiline={question.type === 'long'}
          communityId={communityId}
        />
      )}
      {question.type === 'scale' && (
        <ScaleInput value={value ?? null} onChange={onChange} accent={accent} />
      )}
      {question.type === 'choice' && question.options && (
        <ChoiceInput options={question.options} value={value ?? ''} onChange={onChange} accent={accent} />
      )}
      {question.type === 'hangs' && (
        <HangsRecapInput value={textValue} onChange={onChange} hangs={hangEvents ?? []} accent={accent} />
      )}
      {question.type === 'focus' && (
        <FocusRecapInput value={textValue} onChange={onChange} accent={accent} />
      )}
    </View>
  );
}

import { Pressable, Text, View } from 'react-native';
import { ComposerBar } from '../ui/ComposerBar';
import type { SurveyQuestion } from '../../lib/hooks/useSurveys';
import { useAuth } from '../../lib/hooks/useAuth';

export function ScaleInput({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: value === n ? '#bd9348' : '#faf8f3',
            borderWidth: 1,
            borderColor: value === n ? '#bd9348' : 'rgba(222,193,129,0.4)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: value === n ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 15, color: value === n ? 'white' : '#6b7280' }}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ChoiceInput({ options, value, onChange, multi }: { options: string[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean }) {
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
              backgroundColor: active ? '#fdf3dc' : '#faf8f3',
              borderWidth: 1, borderColor: active ? 'rgba(222,193,129,0.6)' : 'rgba(222,193,129,0.2)',
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
            }}
          >
            <View style={{
              width: 18, height: 18,
              borderRadius: multi ? 4 : 9,
              borderWidth: 2, borderColor: active ? '#bd9348' : '#d1d5db',
              backgroundColor: active ? '#bd9348' : 'transparent',
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
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
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
    />
  );
}

export interface HangRecapEvent {
  id: string;
  title: string;
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
}: {
  value: string;
  onChange: (value: string) => void;
}) {
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
                backgroundColor: active ? '#fdf3dc' : '#faf8f3',
                borderWidth: 1,
                borderColor: active ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
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
}: {
  value: string;
  onChange: (value: string) => void;
  hangs: HangRecapEvent[];
}) {
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
}: {
  question: SurveyQuestion;
  index: number;
  value: any;
  onChange: (value: any) => void;
  hangEvents?: HangRecapEvent[];
}) {
  const textValue = typeof value === 'string' ? value : '';

  // The 3MIQ question brings the member's own answers TO them — never
  // "peek at your profile". Nat, 2026-08-13: "if you tell someone 'leave
  // this screen, navigate to this other screen & come back', it'll never
  // work. Ever."
  const { profile } = useAuth();
  const miqEntries = question.id === 'q_quarter_miq'
    ? ([
        ['Experiences', (profile as any)?.miq_experiences],
        ['Growth', (profile as any)?.miq_growth],
        ['Contribution', (profile as any)?.miq_contribution],
      ] as const).filter(([, answer]) => typeof answer === 'string' && answer.trim().length > 0)
    : [];

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        {/* index -1 = question embedded in another step; no number chip */}
        {index >= 0 && (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fdf3dc', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>{index + 1}</Text>
          </View>
        )}
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', flex: 1, lineHeight: 22 }}>
          {question.text}
          {question.required && <Text style={{ color: '#bd9348' }}> *</Text>}
        </Text>
      </View>

      {question.id === 'q_quarter_miq' && (
        <View style={{ backgroundColor: '#fdf3dc', borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, gap: 4 }}>
          {miqEntries.length > 0 ? (
            miqEntries.map(([label, answer]) => (
              <Text key={label} style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', lineHeight: 18 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', color: '#8a5a16' }}>{label}: </Text>
                {String(answer).trim()}
              </Text>
            ))
          ) : (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#8e7a5e', lineHeight: 18 }}>
              You haven't written a 3MIQ yet — skip this one guilt-free.
            </Text>
          )}
        </View>
      )}

      {(question.type === 'short' || question.type === 'long') && (
        <VoiceTextInput
          value={textValue}
          onChangeText={onChange}
          multiline={question.type === 'long'}
        />
      )}
      {question.type === 'scale' && (
        <ScaleInput value={value ?? null} onChange={onChange} />
      )}
      {question.type === 'choice' && question.options && (
        <ChoiceInput options={question.options} value={value ?? ''} onChange={onChange} />
      )}
      {question.type === 'hangs' && (
        <HangsRecapInput value={textValue} onChange={onChange} hangs={hangEvents ?? []} />
      )}
      {question.type === 'focus' && (
        <FocusRecapInput value={textValue} onChange={onChange} />
      )}
    </View>
  );
}

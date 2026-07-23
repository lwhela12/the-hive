import { Pressable, Text, TextInput, View } from 'react-native';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import type { SurveyQuestion } from '../../lib/hooks/useSurveys';

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

// Text input with the same talk-to-text mic members know from chat and boards.
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
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-end' : 'center', gap: 8, marginTop: 8 }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? 'Your answer...'}
        placeholderTextColor="#b5ad9f"
        multiline={multiline}
        style={{
          flex: 1,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.4)',
          borderRadius: 12,
          fontFamily: 'Lato_400Regular',
          fontSize: 14,
          color: '#2d2d2d',
          paddingHorizontal: 14,
          paddingVertical: 10,
          ...(multiline ? { minHeight: 100, textAlignVertical: 'top' as const } : {}),
        }}
      />
      <VoiceMicButton
        size={20}
        style={{ marginBottom: multiline ? 10 : 0 }}
        onTranscript={(text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          onChangeText(value ? `${value.replace(/\s+$/, '')} ${trimmed}` : trimmed);
        }}
      />
    </View>
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
      {hangs.map((hang) => {
        const entry = attended.find((candidate) => candidate.title === hang.title);
        return (
          <View
            key={hang.id}
            style={{
              backgroundColor: entry ? '#fdf3dc' : '#faf8f3',
              borderWidth: 1,
              borderColor: entry ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              gap: 8,
            }}
          >
            <Pressable onPress={() => toggle(hang.title)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 15 }}>{entry ? '🙌' : '○'}</Text>
              <Text style={{ fontFamily: entry ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 14, color: entry ? '#8a6b30' : '#6b7280', flex: 1 }}>
                {hang.title}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060' }}>
                {entry ? 'went!' : "didn't make it"}
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
    </View>
  );
}

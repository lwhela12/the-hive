import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';

export type EventAudience = 'members' | 'all_hives' | 'public';

// Three rungs, and the hint says what it means socially — whether you can bring
// your mum. An intimate game night and a wedding on a cruise ship are both
// events; the difference is who you'd be surprised to see turn up.
const OPTIONS: { key: EventAudience; label: string; hint: string }[] = [
  { key: 'members', label: 'This HIVE only', hint: 'Just us. Nobody outside this HIVE sees it.' },
  { key: 'all_hives', label: 'Every HIVE', hint: 'Anyone from any HIVE is welcome.' },
  { key: 'public', label: 'Come one, come all', hint: 'Bring whoever you like. Shows on the website.' },
];

const RANK: Record<EventAudience, number> = { members: 0, all_hives: 1, public: 2 };

/**
 * Who is this event for?
 *
 * Never offers a rung this HIVE won't honour. Show HIVE keeps everything, so
 * inside it there is one option and the question isn't worth asking — offering
 * "Come one, come all" there would be a promise the database quietly refuses
 * (Nat 2026-08-01).
 *
 * Same shape as every other pickable thing in the app: a pill with a filled
 * dot when chosen.
 */
export function EventAudienceToggle({
  value,
  onChange,
  label = 'Who is this for?',
}: {
  value: EventAudience;
  onChange: (next: EventAudience) => void;
  label?: string;
}) {
  const { community } = useAuth();
  const ceiling = (community?.max_share_scope as string | undefined) ?? 'hive';
  const ceilingRank = ceiling === 'public' ? 2 : ceiling === 'all_hives' ? 1 : 0;
  const options = OPTIONS.filter((o) => RANK[o.key] <= ceilingRank);

  // If the current value sits above what this HIVE allows, bring it down rather
  // than leave a setting showing that isn't true.
  useEffect(() => {
    if (RANK[value] > ceilingRank) onChange(options[options.length - 1].key);
  }, [value, ceilingRank]);

  // One rung is not a choice.
  if (options.length < 2) return null;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = value === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => onChange(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label} — ${option.hint}`}
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
              <View>
                <Text
                  style={{
                    fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                    fontSize: 14,
                    color: selected ? '#8a6b30' : '#6b7280',
                  }}
                >
                  {option.label}
                </Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#a09585' }}>
                  {option.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

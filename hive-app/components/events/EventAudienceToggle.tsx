import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';

export type EventAudience = 'members' | 'all_hives' | 'public';

// Three rungs, one set of words, and the hints answer the question actually
// being asked. An event is ATTENDED, so the question is "who's invited" and the
// hints talk about who may turn up. Content is SEEN, so a wish or a post asks
// "who can see it" instead. Same ladder, same labels, different verb — which is
// what makes it obvious which things reach the website and the newsletter.
const OPTIONS: { key: EventAudience; label: string; hint: string }[] = [
  { key: 'members', label: 'This HIVE only', hint: 'Just us.' },
  { key: 'all_hives', label: 'All HIVEs', hint: 'Anyone from any HIVE is welcome.' },
  { key: 'public', label: 'Public', hint: 'Bring whoever you like. Shows on the website and can go in the newsletter.' },
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
  label = "Who's invited?",
}: {
  value: EventAudience;
  onChange: (next: EventAudience) => void;
  label?: string;
}) {
  const { community, memberships } = useAuth();
  const ceiling = (community?.max_share_scope as string | undefined) ?? 'hive';
  const ceilingRank = ceiling === 'public' ? 2 : ceiling === 'all_hives' ? 1 : 0;
  // Somebody in one HIVE has no use for "All HIVEs" — and being asked about it
  // would tell them other HIVEs exist, which is nobody's business (Nat 2026-08-02).
  const inSeveral = memberships.length > 1;
  const options = OPTIONS.filter((o) => RANK[o.key] <= ceilingRank && (inSeveral || o.key !== 'all_hives'));

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

import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';

export type WishScope = 'hive' | 'all_hives' | 'public';

// The same ladder events use, in wish words. "Anyone know a teacher?" is exactly
// the kind of ask that travels further than one HIVE (Nat 2026-08-02).
const OPTIONS: { key: WishScope; label: string; hint: string }[] = [
  { key: 'hive', label: 'This HIVE only', hint: 'Just the people here.' },
  { key: 'all_hives', label: 'HIVE-Wide', hint: 'More eyes on it — anyone in any HIVE.' },
  { key: 'public', label: 'Public', hint: 'Can be shared beyond the HIVEs.' },
];

const RANK: Record<WishScope, number> = { hive: 0, all_hives: 1, public: 2 };

export function WishScopePicker({
  value,
  onChange,
  label = 'Who can see it?',
}: {
  value: WishScope;
  onChange: (next: WishScope) => void;
  label?: string;
}) {
  const { community, memberships } = useAuth();
  const ceiling = (community?.max_share_scope as WishScope | undefined) ?? 'hive';
  // Somebody in one HIVE has no use for "All HIVEs" — and being asked about it
  // would tell them other HIVEs exist, which is nobody's business (Nat 2026-08-02).
  const inSeveral = memberships.length > 1;
  const options = OPTIONS.filter((o) => RANK[o.key] <= RANK[ceiling] && (inSeveral || o.key !== 'all_hives'));

  // Never leave a setting showing that this HIVE won't honour.
  useEffect(() => {
    if (RANK[value] > RANK[ceiling]) onChange(options[options.length - 1].key);
  }, [value, ceiling]);

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
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: selected ? '#fdf3dc' : '#faf8f3',
                borderWidth: 1,
                borderColor: selected ? 'rgba(222,193,129,0.7)' : 'rgba(222,193,129,0.25)',
                borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9,
              }}
            >
              <Text style={{ fontSize: 13 }}>{selected ? '●' : '○'}</Text>
              <View>
                <Text style={{
                  fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                  fontSize: 13, color: selected ? '#8a6b30' : '#6b7280',
                }}>
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

import { Pressable, Text, View } from 'react-native';

export type EventAudience = 'members' | 'public';

const OPTIONS: { key: EventAudience; label: string; hint: string }[] = [
  { key: 'members', label: 'HIVErs Only', hint: 'Stays inside the HIVE' },
  { key: 'public', label: "Everyone's invited", hint: 'Safe to name in the newsletter' },
];

/**
 * Who is this event for?
 *
 * The HIVE has a public face and a private one. Marking an event
 * "Everyone's invited" is what lets the newsletter name it — anything left as
 * HIVErs Only never leaves the members' side (Nat 2026-07-25).
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
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {OPTIONS.map((option) => {
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

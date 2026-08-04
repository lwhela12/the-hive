import { View, Text } from 'react-native';

/**
 * How far this thing travels, said plainly on the thing itself.
 *
 * Three scopes were showing as two badges: "This HIVE only" and "All HIVEs"
 * both read as "HIVErs Only", so the middle rung was invisible from the outside
 * (Nat 2026-08-02). You can't respect a boundary you can't see, and with three
 * HIVEs the difference between "just us" and "anyone in any HIVE" is the whole
 * point of having chosen.
 *
 * Events use members/all_hives/public; wishes and survey answers use
 * hive/all_hives/public. Both spellings land in the same place.
 */
export type Scope = 'members' | 'hive' | 'all_hives' | 'public';

const LOOKS: Record<'hive' | 'all_hives' | 'public', {
  emoji: string; label: string; bg: string; border: string; ink: string;
}> = {
  hive: {
    emoji: '🔒', label: 'This HIVE only',
    bg: '#f5f1e8', border: 'rgba(189,147,72,0.22)', ink: '#9a8060',
  },
  all_hives: {
    emoji: '🐝', label: 'HIVE-Wide',
    bg: '#f7e9cb', border: 'rgba(189,147,72,0.55)', ink: '#8a6b30',
  },
  public: {
    emoji: '📣', label: 'Public',
    bg: '#eaf3e6', border: 'rgba(122,154,107,0.35)', ink: '#5c7a4e',
  },
};

export function ScopeBadge({ scope, compact }: { scope?: Scope | string | null; compact?: boolean }) {
  const key = scope === 'public' ? 'public' : scope === 'all_hives' ? 'all_hives' : 'hive';
  const look = LOOKS[key];

  return (
    <View
      className={`${compact ? 'py-1 px-2' : 'py-1.5 px-3'} rounded-full flex-row items-center`}
      style={{ backgroundColor: look.bg, borderWidth: 1, borderColor: look.border }}
    >
      <Text className={compact ? 'text-[10px] mr-1' : 'text-xs mr-1.5'}>{look.emoji}</Text>
      <Text
        style={{ fontFamily: 'Lato_700Bold', color: look.ink }}
        className={compact ? 'text-[10px]' : 'text-xs'}
      >
        {look.label}
      </Text>
    </View>
  );
}

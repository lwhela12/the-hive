import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { hiveChipLook, reachChipLook, type ChipLook } from '../../lib/scopeLook';
import { HiveMark } from './HiveMark';
import { WorldMark } from './WorldMark';

const HAIRLINE = 'rgba(222,193,129,0.4)';
const MUTED = '#8e7f6b';

/**
 * A single scope option — a HIVE's own hexagon or the reserved-near-black
 * Earth — drawn as one segment of `WhoCanSeeYouToggle`. Same colour
 * vocabulary as `ScopeBadge` everywhere else, pulled from `lib/scopeLook.ts`
 * rather than invented here, so this toggle and a wish's badge agree at a
 * glance.
 */
function ScopeSegment({
  selected,
  label,
  icon,
  look,
  onPress,
  disabled,
}: {
  selected: boolean;
  label: string;
  icon: React.ReactNode;
  look: ChipLook;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? look.border : HAIRLINE,
        backgroundColor: selected ? look.bg : 'transparent',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon}
      <Text
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: 13.5,
          color: selected ? look.ink : MUTED,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "Who can see you" — a straight pick between two named places, not an
 * on/off, so it draws as a two-up segmented toggle rather than
 * `components/ui/Switch.tsx`'s single pill.
 *
 * Nat, verbatim: *"It should be an easy toggle of 'HIVE Wide or this HIVE
 * only' & when you're in OG HIVE, it'll say 'OG HIVE only' and if you're in
 * Tech Hive than the 2 options will be 'HIVE wide or Tech HIVE only' with
 * easy colors & icons so your choice is visible and easy."* Shared between
 * Settings and the monthly tune-up's privacy step (2026-08-11) — both write
 * the same flag, `profiles.profile_scope`.
 */
export function WhoCanSeeYouToggle({
  wide,
  hiveName,
  hiveColour,
  busy,
  onChange,
}: {
  wide: boolean;
  hiveName: string;
  hiveColour: string;
  busy?: boolean;
  onChange: (next: boolean) => void;
}) {
  const hive = hiveChipLook(hiveColour, 'light', hiveName);
  const world = reachChipLook('all_hives', 'light');
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 14 }}>
      <ScopeSegment
        selected={!wide}
        label={`${hiveName} only`}
        icon={<HiveMark size={17} colour={hive.accent} />}
        look={hive}
        onPress={() => onChange(false)}
        disabled={busy}
      />
      <ScopeSegment
        selected={wide}
        label="HIVE-Wide"
        icon={<WorldMark size={22} />}
        look={world}
        onPress={() => onChange(true)}
        disabled={busy}
      />
    </View>
  );
}

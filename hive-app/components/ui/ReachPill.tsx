import { Pressable, Text, View } from 'react-native';
import { HiveMark } from './HiveMark';
import { WorldMark } from './WorldMark';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName, hiveTagMark } from '../../lib/hiveBrand';
import { hiveChipLook, HIVE_WIDE_INK } from '../../lib/scopeLook';
import type { Community } from '../../types';

/**
 * THE pill for the this-HIVE-only ↔ HIVE-Wide choice. One shape, everywhere.
 *
 * Nat, 2026-08-19, holding a wish card wearing two chips next to a "Who sees
 * it" pill next to a full-width profile switch, all saying versions of the
 * same thing: *"we need to make sure that there's one pill — this HIVE only
 * and HIVE-Wide — one toggle, one pill, one shape everywhere."*
 *
 * So this is it, and the rules live here once:
 *
 * - **The shell wears the home HIVE's colour** in both states — her ask: "the
 *   wishes could be the color of your HIVE, so you know where you wrote it."
 *   Whose-it-is never disappears when a thing starts travelling.
 * - **The mark and the word carry the reach**: a filled hexagon and
 *   "<HIVE> only" when it stays home, the near-black Earth and "HIVE-Wide"
 *   when it travels — the same vocabulary as `lib/scopeLook.ts`.
 * - **A tiny switch track appears only when the pill can be pressed**, so a
 *   control and a label are told apart by shape, not by guessing.
 *
 * Public is deliberately NOT a state of this pill. A two-state flip cannot say
 * "public" and does not get to quietly take it away — public things keep the
 * teal `ScopeBadge`, and the wish editor owns that rung.
 */
export function ReachPill({
  reach,
  onToggle,
  busy,
  size = 'sm',
  community,
  communityId,
  label,
  alignSelf = 'flex-start',
}: {
  reach: 'hive' | 'all_hives';
  /** Present = a control (mini switch track drawn); absent = a label. */
  onToggle?: () => void;
  busy?: boolean;
  size?: 'sm' | 'md';
  /** Whose it is. Pass it when you have it — this is what colours the shell. */
  community?: Community | null;
  /** Or the id, resolved among the HIVEs you're in — same rule as ScopeBadge. */
  communityId?: string | null;
  /** Override the stays-home wording; default is "<HIVE name> only". */
  label?: { hive?: string; wide?: string };
  /**
   * Where the pill sits in its parent. Defaults to hugging the left, which is
   * right inside rows and cards; the profile's whole-card switch passes
   * 'center' — Nat, memo 207: "if it really is going to toggle the whole
   * profile, it needs to be centered."
   */
  alignSelf?: 'flex-start' | 'center';
}) {
  const { community: current, memberships } = useAuth();
  const owner: Community | null =
    community
    ?? memberships.find((m) => m.community_id === communityId)?.community
    ?? current
    ?? null;

  const accent = hiveAccent(owner);
  const markColour = hiveTagMark(owner);
  const shell = hiveChipLook(accent, 'light', hiveDisplayName(owner?.name));
  const travels = reach === 'all_hives';
  const words = travels
    ? (label?.wide ?? 'HIVE-Wide')
    : (label?.hive ?? `${hiveDisplayName(owner?.name)} only`);

  /**
   * A pill you can PRESS is always the big one.
   *
   * Nat, 2026-09-01, after finding the check-in's toggle drawn smaller than
   * the profile's: *"i think we need every toggle to look the same... make
   * sure that all toggles between this hive and hive wide are the same
   * everywhere."*
   *
   * Passing the size was the whole problem — six call sites, six chances to
   * pick differently, and one of them eventually does. So the choice is taken
   * away where it matters: a control is 'md', and `size` only decides how
   * quietly a LABEL sits inside whatever card it is riding on.
   */
  const drawnSize = onToggle ? 'md' : size;
  const dims = drawnSize === 'md'
    ? { mark: 15, text: 13, padX: 11, padY: 5.5, gap: 7, track: 34, knob: 15, inset: 2.5 }
    : { mark: 12, text: 10.5, padX: 8, padY: 3.5, gap: 5, track: 26, knob: 11, inset: 2 };

  const body = (
    <>
      {/* One box for both marks, so the words never shuffle sideways when the
          pill turns round. */}
      <View style={{ width: dims.mark + 2, height: dims.mark + 2, alignItems: 'center', justifyContent: 'center' }}>
        {travels ? <WorldMark size={dims.mark + 2} /> : <HiveMark size={dims.mark} colour={markColour} />}
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: dims.text,
          color: travels ? HIVE_WIDE_INK : accent,
        }}
      >
        {words}
      </Text>
      {onToggle ? (
        <View
          style={{
            width: dims.track,
            height: dims.knob + dims.inset * 2,
            borderRadius: (dims.knob + dims.inset * 2) / 2,
            padding: dims.inset,
            // The house switch colours (components/ui/Switch.tsx keeps them
            // module-private, so they are matched here rather than imported).
            backgroundColor: travels ? '#bd9348' : 'rgba(49,49,48,0.18)',
            alignItems: travels ? 'flex-end' : 'flex-start',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: dims.knob, height: dims.knob, borderRadius: dims.knob / 2, backgroundColor: '#fffdf5' }} />
        </View>
      ) : null}
    </>
  );

  const shellStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf,
    gap: dims.gap,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: shell.border,
    backgroundColor: shell.bg,
    paddingLeft: dims.padX,
    paddingRight: onToggle ? dims.padY + 2 : dims.padX,
    paddingVertical: dims.padY,
    opacity: busy ? 0.6 : 1,
  };

  if (!onToggle) {
    return (
      <View
        style={shellStyle}
        accessible
        accessibilityLabel={travels ? 'HIVE-Wide. Everyone in every HIVE can see it.' : words}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      // stopPropagation: this pill often sits on a card that is itself a
      // button (the wish card opens the wish) — flipping must not also open.
      onPress={busy ? undefined : (event) => { (event as any)?.stopPropagation?.(); onToggle(); }}
      disabled={busy}
      accessibilityRole="switch"
      accessibilityState={{ checked: travels, disabled: !!busy }}
      accessibilityLabel={
        travels
          ? 'HIVE-Wide. Everyone in every HIVE can see it. Tap to keep it in one HIVE.'
          : `${words}. Tap to make it HIVE-Wide.`
      }
      className="active:opacity-70"
      style={shellStyle}
    >
      {body}
    </Pressable>
  );
}

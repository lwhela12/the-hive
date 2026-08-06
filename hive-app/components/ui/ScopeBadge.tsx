import { View, Text } from 'react-native';
import { HiveMark } from './HiveMark';
import { WorldMark } from './WorldMark';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import {
  CHIP, normaliseScope, travels, hiveChipLook, reachChipLook, scopeSpoken,
  type ChipSize, type ScopeKey,
} from '../../lib/scopeLook';
import type { Community } from '../../types';

/**
 * Whose it is, and how far it goes — worn on the thing itself.
 *
 * The rules live in `lib/scopeLook.ts`; this is the drawing of them. Read that
 * file for why whose-it-is and how-far-it-goes are two chips rather than one,
 * and why each rung wears the colour it does.
 *
 * The short version: a filled hexagon in a HIVE's own colour means "this is
 * OG's" / "this is Tech's", the near-black Earth means it has reached every
 * HIVE, and the solid teal megaphone means it has left the HIVEs altogether.
 * Three colours, three shapes — the eye gets the answer before the word does.
 * Which of the two chips you get depends on where you are standing — see the
 * note further down.
 *
 * `members` and `hive` are the same rung under two spellings — events use one,
 * wishes and survey answers the other.
 */
export type Scope = 'members' | 'hive' | 'all_hives' | 'public';

/** A chip. One shape, two sizes, used by both halves so they can't drift. */
function Chip({
  size, look, children,
}: {
  size: ChipSize;
  look: { bg: string; border: string; ink: string; label: string };
  children: React.ReactNode;
}) {
  const s = CHIP[size];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s.gap,
        paddingHorizontal: s.padX,
        paddingVertical: s.padY,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: look.bg,
        borderColor: look.border,
      }}
    >
      {children}
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: s.text, color: look.ink }}>
        {look.label}
      </Text>
    </View>
  );
}

export function ScopeBadge({
  scope,
  community,
  communityId,
  compact,
  size,
  tone = 'light',
  hideHive,
  caption,
}: {
  scope?: Scope | string | null;
  /** Whose it is. Pass it when you have it — this is what colours the hexagon. */
  community?: Community | null;
  /** Or pass the id and let the badge find the HIVE among the ones you're in. */
  communityId?: string | null;
  /** Older call sites say `compact`; it means `size="sm"`. */
  compact?: boolean;
  size?: ChipSize;
  /** Dark pages need lifted ink — Tech's blue is unreadable on near-black. */
  tone?: 'light' | 'dark';
  /**
   * Drop the hexagon and show only the reach. For a row that is already inside
   * one HIVE's box, where repeating the hexagon on every line is just noise.
   */
  hideHive?: boolean;
  /**
   * A tiny word in front, naming which question this badge answers.
   *
   * An event has two: who can see it, and who is invited. Nat, 2026-08-05, on a
   * card showing a lone black "Public" pill: *"when i see these, i think 'oh no,
   * i invited the whole public' and thats not what i did, i just toggled the
   * visibility settings."* An unlabelled badge is fine when a thing has one
   * scope and dangerously ambiguous the moment it has two.
   */
  caption?: string;
}) {
  const { community: current, communityId: currentCommunityId, memberships, wholeHive } = useAuth();
  const key: ScopeKey = normaliseScope(typeof scope === 'string' ? scope : undefined);
  const chipSize: ChipSize = size ?? (compact ? 'sm' : 'md');
  const s = CHIP[chipSize];

  // Whose it is, in order of how much we trust the answer: what the caller
  // handed us, then the HIVE that id belongs to, then the one you're standing
  // in. On a per-HIVE page the last one is right; on HIVE-Wide it is a guess,
  // which is exactly why screens there pass the row's own community.
  const owner: Community | null =
    community
    ?? memberships.find((m) => m.community_id === communityId)?.community
    ?? current
    ?? null;

  const hive = hiveChipLook(hiveAccent(owner), tone, hiveDisplayName(owner?.name));
  const showReach = travels(key);

  // The hexagon appears when it tells you something you didn't already know.
  //
  // Standing on OG HIVE's own page, every row belongs to OG, so stamping
  // "OG HIVE" on all of them is wallpaper — the first badge you stop reading.
  // There it earns its place only on the things that stay put, where it IS the
  // "just us" badge. Standing at HIVE-Wide, or looking at another HIVE's thing,
  // whose it is becomes the whole question, so the hexagon comes back and sits
  // next to the world (Nat 2026-08-05).
  const ownerId = community?.id ?? communityId ?? null;
  const elsewhere =
    wholeHive || (!!currentCommunityId && !!ownerId && ownerId !== currentCommunityId);
  const showHive = !hideHive && (elsewhere || !showReach);

  // Nothing to say: no hexagon wanted and it hasn't gone anywhere.
  if (!showHive && !showReach) return null;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
      accessible
      accessibilityLabel={scopeSpoken(key, hive.label)}
    >
      {caption ? (
        <Text
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: chipSize === 'sm' ? 8.5 : 9.5,
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            // Firm enough to actually read. This word is the whole reason two
            // badges on one row are not ambiguous, and at 42% on cream it was
            // fainter than the thing it was disambiguating.
            color: tone === 'dark' ? 'rgba(255,248,233,0.68)' : 'rgba(49,49,48,0.62)',
          }}
        >
          {caption}
        </Text>
      ) : null}
      {showHive && (
        <Chip size={chipSize} look={hive}>
          <HiveMark size={s.mark} colour={hive.accent} />
        </Chip>
      )}
      {showReach && (
        <Chip size={chipSize} look={reachChipLook(key, tone)}>
          {key === 'public'
            ? <Text style={{ fontSize: s.mark }}>📣</Text>
            : <WorldMark size={s.mark + 2} />}
        </Chip>
      )}
    </View>
  );
}

/**
 * Just the reach, for places that are already unmistakably inside one HIVE —
 * a wish list on your own HIVE's page, where every row would otherwise carry an
 * identical hexagon.
 */
export function ReachBadge(props: Omit<Parameters<typeof ScopeBadge>[0], 'hideHive'>) {
  return <ScopeBadge {...props} hideHive />;
}

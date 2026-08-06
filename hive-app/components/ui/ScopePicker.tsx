import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HiveMark } from './HiveMark';
import { WorldMark } from './WorldMark';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { hiveChipLook, reachChipLook, HIVE_WIDE_INK, type ScopeKey } from '../../lib/scopeLook';

/**
 * Choosing how far something goes, wearing the badge it will get.
 *
 * There were two of these — `WishScopePicker` and `EventAudienceToggle` — built
 * a day apart and identical apart from their words, and both drew a hollow dot
 * that told you nothing about the result. So a member chose "HIVE-Wide" from a
 * gold radio button and then met a pill with a globe on it somewhere else, and
 * had to work out for themselves that those were the same decision.
 *
 * Now the choice looks like the outcome: pick the hexagon and your thing wears
 * the hexagon. Nat, 2026-08-05: *"instead of relying on people reading, I want
 * colour coding for quick noticing."* The picker is where the reading happens,
 * so it is where the colour has to be taught.
 *
 * Both callers keep their own words, because the verb genuinely differs — an
 * event is ATTENDED ("who's invited") and a wish is SEEN ("who can see it").
 * Same ladder, same colours, different question.
 */

export type ScopeOption<K extends string> = {
  key: K;
  label: string;
  hint: string;
  /** Which rung of the shared ladder this option is, whatever it is called. */
  rung: ScopeKey;
};

export function ScopePicker<K extends string>({
  value,
  onChange,
  label,
  options: allOptions,
}: {
  value: K;
  onChange: (next: K) => void;
  label: string;
  options: ScopeOption<K>[];
}) {
  const { community, memberships } = useAuth();

  const RANK: Record<ScopeKey, number> = { hive: 0, all_hives: 1, public: 2 };
  const ceiling = (community?.max_share_scope as ScopeKey | undefined) ?? 'hive';
  const ceilingRank = RANK[ceiling] ?? 0;

  // This used to hide "HIVE-Wide" from anybody in a single HIVE, because being
  // asked about it would have told them other HIVEs existed and that was
  // nobody's business (Nat, 2026-08-02).
  //
  // That reason is gone. Since 2026-08-03 every member lands on HIVE-Wide, and
  // it names all three HIVEs on arrival — so there is nothing left to keep from
  // them, and almost everybody is in exactly one HIVE. The rule was hiding the
  // rung from very nearly the whole community, including the people the
  // August newsletter is about to invite to use it.
  //
  // The ceiling still decides. A HIVE whose `max_share_scope` is `hive` shows
  // nothing beyond its own walls, however many HIVEs you belong to.
  const options = allOptions.filter((o) => RANK[o.rung] <= ceilingRank);

  /**
   * Never leave a setting showing that this HIVE won't honour — but only once
   * we actually know what this HIVE honours.
   *
   * This quietly ate Nat's choice for days. Her Nellie wish was saved
   * `all_hives` in the database and the picker kept opening on "This HIVE
   * only": *"I've been trying to select HIVE-Wide a billion times, it never
   * reflects that anywhere."*
   *
   * On the first render after the modal opens, `community` has not arrived yet,
   * so the ceiling reads as its fallback — `hive`, the most restrictive rung —
   * and this effect dutifully demoted a perfectly legal HIVE-Wide wish. Worse,
   * the effect is declared above the early return, so it ran even on the
   * renders where the picker drew nothing at all, and the demotion was then
   * saved over her real answer.
   *
   * The fallback was right to be the strict one. The mistake was acting on a
   * value we did not have yet. A rule that fires while the facts are still
   * loading is a rule that enforces its own default.
   */
  const current = allOptions.find((o) => o.key === value);
  useEffect(() => {
    if (!community) return;
    if (current && RANK[current.rung] > ceilingRank && options.length) {
      onChange(options[options.length - 1].key);
    }
  }, [value, ceilingRank, options.length, community?.id]);

  // One rung is not a choice.
  if (options.length < 2) return null;

  const accent = hiveAccent(community);
  const hiveLook = hiveChipLook(accent, 'light', hiveDisplayName(community?.name));

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6b30' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = value === option.key;
          // The option is tinted in the colour it will produce, so the choice
          // and the result are the same colour before anybody reads either.
          const look = option.rung === 'hive' ? hiveLook : reachChipLook(option.rung, 'light');
          // Public's chip is black-filled with white ink, which would be
          // unreadable as an option's label, so the option wears the ink colour
          // rather than the fill.
          const tint = option.rung === 'public' ? HIVE_WIDE_INK : look.ink;

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
                gap: 9,
                backgroundColor: selected ? (option.rung === 'public' ? 'rgba(11,11,18,0.06)' : look.bg) : '#faf8f3',
                borderWidth: selected ? 1.5 : 1,
                borderColor: selected ? look.border : 'rgba(49,49,48,0.12)',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <View style={{ width: 18, alignItems: 'center', opacity: selected ? 1 : 0.55 }}>
                {option.rung === 'hive' && <HiveMark size={15} colour={hiveLook.accent} />}
                {option.rung === 'all_hives' && <WorldMark size={17} />}
                {option.rung === 'public' && <Text style={{ fontSize: 15 }}>📣</Text>}
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text
                  style={{
                    fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                    fontSize: 14,
                    color: selected ? tint : '#6b7280',
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

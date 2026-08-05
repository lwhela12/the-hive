import { ScopePicker, type ScopeOption } from './ScopePicker';

export type WishScope = 'hive' | 'all_hives' | 'public';

// The same ladder events use, in wish words. "Anyone know a teacher?" is exactly
// the kind of ask that travels further than one HIVE (Nat 2026-08-02). A wish is
// SEEN rather than attended, so the question is who can see it.
const OPTIONS: ScopeOption<WishScope>[] = [
  { key: 'hive', rung: 'hive', label: 'This HIVE only', hint: 'Just the people here.' },
  { key: 'all_hives', rung: 'all_hives', label: 'HIVE-Wide', hint: 'More eyes on it — anyone in any HIVE.' },
  { key: 'public', rung: 'public', label: 'Public', hint: 'Can be shared beyond the HIVEs.' },
];

/**
 * How far should this wish go?
 *
 * The ceiling, the single-HIVE case and the colours all live in `ScopePicker`,
 * which the event toggle uses too — the two of these had drifted into separate
 * implementations of the same decision.
 */
export function WishScopePicker({
  value,
  onChange,
  label = 'Who can see it?',
}: {
  value: WishScope;
  onChange: (next: WishScope) => void;
  label?: string;
}) {
  return <ScopePicker value={value} onChange={onChange} label={label} options={OPTIONS} />;
}

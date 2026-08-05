import { ScopePicker, type ScopeOption } from '../ui/ScopePicker';

export type EventAudience = 'members' | 'all_hives' | 'public';

// Three rungs, one set of words, and the hints answer the question actually
// being asked. An event is ATTENDED, so the question is "who's invited" and the
// hints talk about who may turn up. Content is SEEN, so a wish or a post asks
// "who can see it" instead. Same ladder, same colours, different verb — which is
// what makes it obvious which things reach the website and the newsletter.
//
// Events spell the bottom rung `members` where wishes spell it `hive`; `rung`
// is what maps both spellings onto the one shared ladder.
const OPTIONS: ScopeOption<EventAudience>[] = [
  { key: 'members', rung: 'hive', label: 'This HIVE only', hint: 'Just us.' },
  { key: 'all_hives', rung: 'all_hives', label: 'HIVE-Wide', hint: 'Anyone from any HIVE is welcome.' },
  { key: 'public', rung: 'public', label: 'Public', hint: 'Bring whoever you like. Shows on the website and can go in the newsletter.' },
];

/**
 * Who is this event for?
 *
 * Never offers a rung this HIVE won't honour — Show HIVE keeps everything, so
 * inside it there is one option and the question isn't worth asking; offering
 * "Come one, come all" there would be a promise the database quietly refuses
 * (Nat 2026-08-01). `ScopePicker` handles that, and the colours.
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
  return <ScopePicker value={value} onChange={onChange} label={label} options={OPTIONS} />;
}

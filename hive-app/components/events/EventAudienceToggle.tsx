import { View, Text } from 'react-native';
import { ScopePicker, type ScopeOption } from '../ui/ScopePicker';

export type EventAudience = 'members' | 'all_hives' | 'public';

/**
 * Seeing and coming are two different questions.
 *
 * Nat, 2026-08-05: *"we want everyone to be able to see when our meetings are,
 * (everyone HIVE wide) but i dont want everyone to be able to join the meet,
 * right? Does that make sense?"*
 *
 * It does, and until now the app could not say it. One column did both jobs, so
 * the only way to let every HIVE SEE that OG meets on the 19th was to also tell
 * every HIVE they were welcome — with the Google Meet link sitting right there
 * on the card. The two honest choices were "keep it to ourselves" and "open the
 * door to everyone".
 *
 * So there are two ladders now (migration 148):
 *
 *   Who can see it   — that this event exists, when and where it is
 *   Who's invited    — who it is actually for, and who gets the joining details
 *
 * The rule between them only runs one way: **you cannot invite somebody who
 * cannot see it.** So the invite list is offered no wider than the visibility,
 * and choosing a narrower visibility pulls the invite in with it. The database
 * holds the same rule, because a form is a suggestion and a constraint is the
 * promise.
 *
 * An event is ATTENDED and content is SEEN, which is why these ladders use
 * "who's invited" and "who can see it" where a wish asks only the second.
 */

const RANK: Record<EventAudience, number> = { members: 0, all_hives: 1, public: 2 };

const VISIBILITY: ScopeOption<EventAudience>[] = [
  { key: 'members', rung: 'hive', label: 'This HIVE only', hint: 'Nobody else knows it is on.' },
  { key: 'all_hives', rung: 'all_hives', label: 'HIVE-Wide', hint: 'Every HIVE can see it is happening.' },
  { key: 'public', rung: 'public', label: 'Public', hint: 'Shows on the website and can go in the newsletter.' },
];

const INVITED: ScopeOption<EventAudience>[] = [
  { key: 'members', rung: 'hive', label: 'This HIVE only', hint: 'Just us. Others see it, but not how to join.' },
  { key: 'all_hives', rung: 'all_hives', label: 'HIVE-Wide', hint: 'Anyone from any HIVE is welcome to come.' },
  { key: 'public', rung: 'public', label: 'Public', hint: 'Bring whoever you like.' },
];

/**
 * Both questions, with the rule between them kept.
 *
 * `invited` is optional so the older call sites — which only ever asked one
 * question — keep working while they are converted one at a time.
 */
export function EventScopeFields({
  visibility,
  onVisibilityChange,
  invited,
  onInvitedChange,
}: {
  visibility: EventAudience;
  onVisibilityChange: (next: EventAudience) => void;
  invited: EventAudience;
  onInvitedChange: (next: EventAudience) => void;
}) {
  // Narrowing who can see it drags the invitation in with it, rather than
  // leaving a setting on screen that the database will refuse.
  const setVisibility = (next: EventAudience) => {
    onVisibilityChange(next);
    if (RANK[invited] > RANK[next]) onInvitedChange(next);
  };

  const invitedOptions = INVITED.filter((option) => RANK[option.key] <= RANK[visibility]);
  const differ = RANK[invited] < RANK[visibility];

  return (
    <View style={{ gap: 14 }}>
      <ScopePicker
        value={visibility}
        onChange={setVisibility}
        label="Who can see it?"
        options={VISIBILITY}
      />

      {invitedOptions.length > 1 ? (
        <ScopePicker
          value={invited}
          onChange={onInvitedChange}
          label="Who's invited?"
          options={invitedOptions}
        />
      ) : null}

      {/* Said plainly, because the whole point of splitting these apart is the
          case where they disagree — and a member should not have to work out
          what the combination means. */}
      {differ ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18,
            color: '#a09274',
          }}
        >
          {invited === 'members'
            ? 'Everyone can see it is happening. Only your HIVE gets the address and the link to join.'
            : 'Everyone can see it is happening. Only the HIVEs get the address and the link to join.'}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Who is this event for? — the single-question version.
 *
 * Kept for the places that ask only one thing (a quick add from the meeting
 * helper, the tune-up's mini composer). Those set both rungs to the same value,
 * which is exactly what the app did everywhere before migration 148.
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
  return <ScopePicker value={value} onChange={onChange} label={label} options={INVITED} />;
}

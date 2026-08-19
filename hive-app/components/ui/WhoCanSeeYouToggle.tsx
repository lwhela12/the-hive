import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';
import { ReachPill } from './ReachPill';

/**
 * "Who can see you" in Settings and the monthly tune-up — the same pill the
 * Profile page and every wish wear.
 *
 * This used to be a two-up segmented radio, which meant `profiles.
 * profile_scope` had two different faces depending on the page you changed it
 * from. Nat, 2026-08-19: *"we need one pill — this HIVE only and HIVE-Wide —
 * one toggle, one pill, one shape everywhere. Do a continuity pass and double
 * check that everywhere."* So all three surfaces now render `ReachPill`, and
 * a person who learns the control once has learned it everywhere.
 *
 * `hiveName`/`hiveColour` stay in the props so the two call sites did not
 * have to change; the pill resolves the current HIVE itself.
 */
export function WhoCanSeeYouToggle({
  wide,
  hiveName: _hiveName,
  hiveColour: _hiveColour,
  busy,
  onChange,
}: {
  wide: boolean;
  hiveName: string;
  hiveColour: string;
  busy?: boolean;
  onChange: (next: boolean) => void;
}) {
  const { community } = useAuth();
  return (
    <View style={{ paddingVertical: 14, alignItems: 'flex-start' }}>
      <ReachPill
        reach={wide ? 'all_hives' : 'hive'}
        size="md"
        community={community}
        onToggle={() => onChange(!wide)}
        busy={busy}
      />
    </View>
  );
}

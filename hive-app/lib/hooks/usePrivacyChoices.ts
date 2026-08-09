import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { showAlert } from '../showAlert';
import { useAuth } from './useAuth';

const SCOPE_RANK: Record<string, number> = { hive: 0, all_hives: 1, public: 2 };

/**
 * The two profile-level privacy choices every member actually has: whether
 * the rest of the HIVEs can see them (`profile_scope`), and where a brand-new
 * wish or thread starts out (`default_share_scope`).
 *
 * Pulled out of Settings so the pre-meeting check-in's privacy step can ask
 * the same two questions without re-deriving the column-existence probe or
 * the pending/saved pill state — both took a few rounds to get right (see
 * `settings.tsx`'s own history) and a second copy would drift.
 */
export function usePrivacyChoices() {
  const { profile, community, refreshProfile } = useAuth();

  // Your default sharing wants a column that may not have been added yet,
  // and neither screen is allowed to add it — so this asks the database
  // once and only offers the choice if it can genuinely save the answer.
  const [checkedColumn, setCheckedColumn] = useState(false);
  const [hasDefaultShareColumn, setHasDefaultShareColumn] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // The answer you just gave, held until the profile catches up — a switch
  // has to move under your finger, and the profile only changes once the
  // save round-trips.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Which switch was just saved, so the screen can say so. Goes away on its
  // own once you've had a chance to read it.
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!savedKey) return;
    const timer = setTimeout(() => setSavedKey(null), 4000);
    return () => clearTimeout(timer);
  }, [savedKey]);

  const userId = profile?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      const { error } = await (supabase as any)
        .from('profiles')
        .select('default_share_scope')
        .eq('id', userId)
        .limit(1);
      if (cancelled) return;
      setHasDefaultShareColumn(!error);
      setCheckedColumn(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const savePatch = useCallback(
    async (key: string, next: boolean, patch: Record<string, unknown>, failureMessage: string) => {
      if (!profile) return;
      setBusyKey(key);
      setSavedKey(null);
      setPending((held) => ({ ...held, [key]: next }));
      try {
        const { error } = await (supabase as any)
          .from('profiles')
          .update(patch)
          .eq('id', profile.id);

        if (error) {
          console.warn('[usePrivacyChoices] save failed', key, error);
          showAlert('Sorry', `${failureMessage} (${error.message})`);
          return;
        }
        // Awaited all the way, so by the time `pending` clears below the
        // profile is already carrying this answer and nothing flickers.
        await refreshProfile();
        setSavedKey(key);
      } finally {
        setBusyKey(null);
        setPending((held) => {
          const rest = { ...held };
          delete rest[key];
          return rest;
        });
      }
    },
    [profile, refreshProfile]
  );

  const profileScope: 'hive' | 'all_hives' =
    profile?.profile_scope === 'all_hives' ? 'all_hives' : 'hive';

  const ceiling = (community?.max_share_scope as string | undefined) ?? 'hive';
  const canDefaultWide = SCOPE_RANK[ceiling] >= SCOPE_RANK.all_hives;
  // Whether a wish picker will offer a second rung at all, worked out the
  // same way WishScopePicker works it out — a HIVE stopping at its own edge
  // should not be promised its members can send things further.
  const canSendFurther =
    ['hive', 'all_hives', 'public'].filter(
      (rung) => SCOPE_RANK[rung] <= (SCOPE_RANK[ceiling] ?? 0)
    ).length > 1;

  const defaultScope: 'hive' | 'all_hives' =
    (profile as any)?.default_share_scope === 'all_hives' ? 'all_hives' : 'hive';

  const travelOn = pending.profile_scope ?? profileScope === 'all_hives';
  const defaultWide = pending.default_share_scope ?? defaultScope === 'all_hives';

  const saveProfileScope = useCallback(
    (next: boolean) =>
      savePatch(
        'profile_scope',
        next,
        { profile_scope: next ? 'all_hives' : 'hive' },
        'That setting did not save. Please try again.'
      ),
    [savePatch]
  );

  const saveDefaultShareScope = useCallback(
    (next: boolean) =>
      savePatch(
        'default_share_scope',
        next,
        { default_share_scope: next ? 'all_hives' : 'hive' },
        'That setting did not save. Please try again.'
      ),
    [savePatch]
  );

  return {
    community,
    checkedColumn,
    hasDefaultShareColumn,
    canDefaultWide,
    canSendFurther,
    travelOn,
    defaultWide,
    busyKey,
    savedKey,
    saveProfileScope,
    saveDefaultShareScope,
  };
}

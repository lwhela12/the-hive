import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { showAlert } from '../showAlert';
import { userFacingError } from '../userFacingError';
import { useAuth } from './useAuth';
import { EMAIL_SETTINGS, type EmailSetting } from '../emailSettings';

export type ContactPref = 'email' | 'text' | 'either';

/**
 * How a member wants to be reached: the seven email switches, and the one
 * question Nat asks alongside them.
 *
 * Pulled out on 2026-09-02 so the halfway check-in can offer the same rows
 * Settings offers — Nat, writing three group texts by hand: *"maybe include in
 * the survey a question if they like emails or texts better & a short cut to
 * toggle off their email settings if they want."* The list itself lives in
 * `lib/emailSettings.ts` and is build-guarded (`scripts/lint-reach-mail.mjs`),
 * so the two screens can never end up offering different switches.
 *
 * **`contact_pref` is a report, never a gate.** Nothing in the app sends a
 * text, so this answer changes what NAT does, not what the mailer does. The
 * column it replaces (`preferred_contact`) was a gate, defaulted to a value
 * nobody chose, and silently stopped six people's mail — see migration 223.
 */
export function useReachChoices() {
  const { profile, refreshProfile } = useAuth();

  const [busyKey, setBusyKey] = useState<string | null>(null);
  // The answer you just gave, held until the profile catches up — a switch has
  // to move under your finger, and the profile only changes once it saves.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [pendingPref, setPendingPref] = useState<ContactPref | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!savedKey) return;
    const timer = setTimeout(() => setSavedKey(null), 4000);
    return () => clearTimeout(timer);
  }, [savedKey]);

  const save = useCallback(
    async (key: string, patch: Record<string, unknown>, failureMessage: string) => {
      if (!profile) return;
      setBusyKey(key);
      setSavedKey(null);
      try {
        const { error } = await (supabase as any)
          .from('profiles')
          .update(patch)
          .eq('id', profile.id);
        if (error) {
          console.warn('[useReachChoices] save failed', key, error);
          showAlert('Sorry', userFacingError(error, failureMessage));
          return;
        }
        await refreshProfile();
        setSavedKey(key);
      } finally {
        setBusyKey(null);
        setPending((held) => {
          const rest = { ...held };
          delete rest[key];
          return rest;
        });
        setPendingPref(null);
      }
    },
    [profile, refreshProfile]
  );

  // Default true, matching the columns: mail a member has never turned off is
  // mail they still get, and a missing value must not read as "no".
  const emailIsOn = useCallback(
    (setting: EmailSetting) =>
      pending[setting.column] ?? ((profile as any)?.[setting.column] ?? true) !== false,
    [pending, profile]
  );

  const setEmail = useCallback(
    (setting: EmailSetting, next: boolean) => {
      setPending((held) => ({ ...held, [setting.column]: next }));
      void save(
        setting.column,
        { [setting.column]: next },
        'That email setting did not save. Please try again.'
      );
    },
    [save]
  );

  // `null` means nobody has asked yet, and it stays null until somebody
  // answers — an unasked member must not look like one who chose email.
  const contactPref: ContactPref | null =
    pendingPref ?? ((profile as any)?.contact_pref ?? null);

  const setContactPref = useCallback(
    (next: ContactPref) => {
      setPendingPref(next);
      void save('contact_pref', { contact_pref: next }, 'That did not save. Please try again.');
    },
    [save]
  );

  return { EMAIL_SETTINGS, emailIsOn, setEmail, contactPref, setContactPref, busyKey, savedKey };
}

import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { AppHeader } from '../../components/navigation';
import { LinkedLogins } from '../../components/profile/LinkedLogins';
import { ScopeBadge } from '../../components/ui/ScopeBadge';
import { Switch, SWITCH_GUTTER } from '../../components/ui/Switch';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
/**
 * Settings — the back of the house.
 *
 * Nat, 2026-08-03: "maybe we separate part of it out, so everyone has profile,
 * settings & log out. Your profile is like, about you, what you are working on,
 * your 3MIQ, etc & settings is all the back end stuff."
 *
 * So Profile is now only ever about the person, and everything you'd set once
 * and forget lives here. Signing out was left exactly where it was — the foot
 * of Profile and the side rail — because people already know where to find it
 * and moving it is its own decision, not a side effect of this one.
 *
 * 2026-08-05: every preference on this page is now the same control.
 *
 * It had grown four — radio cards for how far you travel, the same cards again
 * for your default sharing, a sliding pill for who can see you, and a gold
 * button per email — which is four ways of asking one kind of question. Nat:
 * *"We need one style & one alignment throughout."* They are all
 * `components/ui/Switch.tsx` now, so every pill sits in the same column and
 * every label starts at the same x. What each one saves, and where, did not
 * change: a switch that quietly moved somebody's sharing default would be far
 * worse than four mismatched controls.
 */

const PANEL = '#fffdf6';
const HAIRLINE = 'rgba(222,193,129,0.4)';
const CHARCOAL = '#313130';
const MUTED = '#8e7f6b';
// The gold used to live here too, for the radio dots and the On buttons. Both
// are gone; the switch carries the gold now, out of `components/ui/Switch.tsx`.

type Scope = 'hive' | 'all_hives';

const SCOPE_RANK: Record<string, number> = { hive: 0, all_hives: 1, public: 2 };

/**
 * One switch per email the HIVE actually sends. Two, because two is how many
 * there are: check-in-reminder is the only function that mails a member, and
 * it reads exactly these two columns (migration 117).
 *
 * The newsletter is not here. Nat still writes it in the app and pastes it into
 * Wix to send, so nothing in our code consults a member's answer at send time —
 * a switch would take the choice and quietly drop it, which is worse than
 * sending them to the unsubscribe link already at the foot of the email (Nat
 * 2026-07-26, and still true on 2026-08-03).
 *
 * Replies and @s are not here either. Those arrive as a nudge on your phone —
 * notify-board-reply, notify-board-mention, notify-chat-mention and
 * notify-wish-mention all push, none of them mail — so the Notifications card
 * further down this page is the one that governs them.
 */
type EmailSetting = {
  /** The boolean column on profiles that carries this. */
  column: string;
  label: string;
  onHint: string;
  offHint: string;
};

const EMAIL_SETTINGS: EmailSetting[] = [
  {
    column: 'email_meeting_checkin_enabled',
    label: 'Before a meeting',
    // The pill already says on or off, so the words stopped repeating it and
    // spend themselves on what actually lands in the inbox (2026-08-05).
    onHint: 'Your check-in link arrives three days before we meet.',
    offHint: "You'll still find the check-in waiting on Home.",
  },
  {
    column: 'email_midpoint_checkin_enabled',
    label: 'The month-end check-in',
    onHint: 'Two minutes to add something to the newsletter.',
    offHint: 'The newsletter still comes out without you.',
  },
];

/** The one card shape this page uses. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: PANEL,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: HAIRLINE,
        paddingHorizontal: 16,
        paddingVertical: 4,
      }}
    >
      {children}
    </View>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 24, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: CHARCOAL }}>
        {title}
      </Text>
      {blurb ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 13,
            lineHeight: 19,
            color: MUTED,
            marginTop: 4,
            marginBottom: 10,
          }}
        >
          {blurb}
        </Text>
      ) : (
        <View style={{ height: 10 }} />
      )}
      {children}
    </View>
  );
}

/**
 * A hairline between two switches in the same panel.
 *
 * It starts where the words start rather than at the panel's edge, so the
 * column of pills reads as one column instead of a stack of separate boxes.
 */
function RowDivider() {
  return (
    <View
      style={{ height: 1, backgroundColor: HAIRLINE, marginLeft: SWITCH_GUTTER }}
    />
  );
}

export default function SettingsScreen() {
  const { profile, community, memberships, refreshProfile, openHivePicker } = useAuth();
  const [visibleHiveWide, setVisibleHiveWide] = useState<boolean>(!!(profile as any)?.visible_hive_wide);
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Kept in step with the profile, so arriving here fresh shows the truth
  // rather than whatever this screen last remembered.
  useEffect(() => {
    setVisibleHiveWide(!!(profile as any)?.visible_hive_wide);
  }, [profile]);

  const toggleHiveWideVisibility = useCallback(async () => {
    if (!profile?.id || savingVisibility) return;
    const next = !visibleHiveWide;
    setSavingVisibility(true);
    setVisibleHiveWide(next);            // answer the tap immediately
    const { error } = await (supabase.from('profiles') as any)
      .update({ visible_hive_wide: next })
      .eq('id', profile.id);
    if (error) {
      setVisibleHiveWide(!next);         // put it back; nothing was saved
      // `Alert.alert` is an empty function in a browser, so this used to slide
      // the pill back with no word of explanation (2026-08-05).
      showAlert('Could not save that', error.message);
    } else {
      await refreshProfile();
    }
    setSavingVisibility(false);
  }, [profile?.id, savingVisibility, visibleHiveWide, refreshProfile]);
  const { permissionStatus, requestPermissions } = useNotifications({ enableListeners: false });
  const isNotificationEnabled =
    permissionStatus === 'granted' || permissionStatus === 'provisional';

  // Your default sharing wants a column that may not have been added yet, and
  // this screen is not allowed to add it. So it asks the database once and
  // shows the picker only if it can genuinely save the answer (2026-08-03).
  const [checkedColumn, setCheckedColumn] = useState(false);
  const [hasDefaultShareColumn, setHasDefaultShareColumn] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /**
   * The answer you just gave, held until the profile catches up.
   *
   * A switch has to move under your finger. What these draw comes from the
   * profile, and the profile only changes once the save has been round-tripped,
   * so without this the pill sits still for half a second and reads as a
   * control that doesn't work. The radio cards did exactly that.
   *
   * Keyed by column so two saves in flight can't wear each other's answer, and
   * dropped the moment the save settles — successfully, so the profile now says
   * the same thing, or badly, so the switch slides back on its own.
   */
  const [pending, setPending] = useState<Record<string, boolean>>({});

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

  /**
   * Save one switch. `key` is the column it lives in and `next` is where the
   * switch has just been put, which is only ever used to draw it — what is
   * stored is `patch`, exactly as the caller wrote it.
   */
  const savePatch = useCallback(
    async (key: string, next: boolean, patch: Record<string, unknown>, failureMessage: string) => {
      if (!profile) return;
      setBusyKey(key);
      setPending((held) => ({ ...held, [key]: next }));
      try {
        const { error } = await (supabase as any)
          .from('profiles')
          .update(patch)
          .eq('id', profile.id);

        if (error) {
          showAlert('Sorry', failureMessage);
          return;
        }
        // Awaited all the way, so by the time we let go of `pending` below the
        // profile is already carrying this answer and nothing flickers.
        await refreshProfile();
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

  const closeSettings = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/profile');
  };

  // Reloading the page on the web gets here before the profile has landed.
  // Returning null showed a bare white rectangle, which reads as a crash, so
  // hold the cream and the header steady until there's something to show
  // (2026-08-03).
  if (!profile) {
    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <AppHeader title="Settings" onBackPress={closeSettings} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ThinkingBee />
        </View>
      </SafeAreaView>
    );
  }

  const profileScope: Scope =
    (profile as any).profile_scope === 'all_hives' ? 'all_hives' : 'hive';

  // How far you travel is worth asking everyone, even somebody in a single
  // HIVE: the shared noticeboards reach every HIVE, so their post can be read
  // by people they've never met whether or not they belong to a second HIVE.

  // Your default only offers what your HIVE allows and what you could actually
  // pick on a wish — the same rule WishScopePicker follows, so a default can
  // never disagree with the picker you meet later.
  const ceiling = (community?.max_share_scope as string | undefined) ?? 'hive';
  const inSeveralHives = memberships.length > 1;
  const canDefaultWide = inSeveralHives && SCOPE_RANK[ceiling] >= SCOPE_RANK.all_hives;
  const defaultShare: Scope =
    (profile as any).default_share_scope === 'all_hives' ? 'all_hives' : 'hive';

  // Whether the picker they meet on a wish will offer them a second rung at
  // all, worked out exactly the way WishScopePicker works it out. Someone whose
  // HIVE stops at its own edge should not be promised they can send things
  // further, because they can't.
  const canSendFurther =
    ['hive', 'all_hives', 'public'].filter(
      (rung) =>
        SCOPE_RANK[rung] <= (SCOPE_RANK[ceiling] ?? 0) &&
        (inSeveralHives || rung !== 'all_hives')
    ).length > 1;

  // Where each switch is drawn: the answer you just gave if one is in flight,
  // otherwise what the profile says. Emails count a missing column as on.
  const travelOn = pending.profile_scope ?? profileScope === 'all_hives';
  const defaultWide = pending.default_share_scope ?? defaultShare === 'all_hives';
  const emailIsOn = (setting: EmailSetting) =>
    pending[setting.column] ?? (profile as any)[setting.column] !== false;

  const setEmail = (setting: EmailSetting, next: boolean) => {
    void savePatch(
      setting.column,
      next,
      { [setting.column]: next },
      'That email setting did not save. Please try again.'
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <AppHeader title="Settings" onBackPress={closeSettings} />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View
          style={{
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#fdf3dc',
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 5,
            marginBottom: 18,
          }}
        >
          <Text style={{ fontSize: 11 }}>🛠</Text>
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: 10,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: '#8e6f35',
            }}
          >
            Backstage · only you see this page
          </Text>
        </View>

        {/* Two paragraphs used to wrap this one switch — an explanation above
            and a reassurance below. Nat, 2026-08-05: *"This seems confusing to
            me & too much reading."* The explanation should be shorter than the
            thing it explains, so it is one line above and one line under the
            label, and it changes with the answer.

            Migration 135 promises "a little bee stands in for you" when your
            card stays home. That bee has not been built — BoardPostCard and
            BoardReplyItem still fall back to the word "Unknown" — so the words
            here stop at what is true today (2026-08-03). */}
        <Section
          title="How far you travel"
          blurb="About you, on top of whatever you choose for each thing you write."
        >
          <Panel>
            <Switch
              on={travelOn}
              busy={busyKey === 'profile_scope'}
              label="My card travels with what I share"
              hint={
                travelOn
                  ? 'Anyone in any HIVE can tap your name and see who is vouching for it.'
                  : 'Only the people who share a HIVE with you can open your card.'
              }
              onToggle={(next) =>
                void savePatch(
                  'profile_scope',
                  next,
                  { profile_scope: next ? 'all_hives' : 'hive' },
                  'That setting did not save. Please try again.'
                )
              }
            />
          </Panel>
        </Section>

        <Section
          title="Your default sharing"
          blurb="Where a new wish or thread starts out."
        >
          {!checkedColumn ? (
            <Panel>
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ThinkingBee />
              </View>
            </Panel>
          ) : hasDefaultShareColumn && canDefaultWide ? (
            <Panel>
              {/* The badge beside the label is the one your next wish will
                  actually wear, and it changes as you flip the switch. Nat,
                  2026-08-05: *"that just shows what things look like if they are
                  shared, so you're toggling on and off your choice & on and off
                  what it looks like."* The setting shows you its own result. */}
              <Switch
                on={defaultWide}
                busy={busyKey === 'default_share_scope'}
                label="Start new things HIVE-Wide"
                hint={
                  defaultWide
                    ? 'New wishes and threads go out to every HIVE. You can pull any single one back when you share it.'
                    : canSendFurther
                      ? 'New wishes and threads start here, with your HIVE. You can send any single one further when you share it.'
                      : 'New wishes and threads start here, with your HIVE.'
                }
                trailing={
                  <ScopeBadge
                    scope={defaultWide ? 'all_hives' : 'hive'}
                    community={community}
                    size="sm"
                  />
                }
                onToggle={(next) =>
                  void savePatch(
                    'default_share_scope',
                    next,
                    { default_share_scope: next ? 'all_hives' : 'hive' },
                    'That setting did not save. Please try again.'
                  )
                }
              />
            </Panel>
          ) : (
            <Panel>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 13,
                  lineHeight: 20,
                  color: CHARCOAL,
                  paddingVertical: 14,
                }}
              >
                {canSendFurther
                  ? 'New wishes and threads start in your HIVE. You can send any one of them further when you share it.'
                  : 'New wishes and threads start in your HIVE, with the people here.'}
              </Text>
            </Panel>
          )}
        </Section>

        <Section title="Emails" blurb="One switch per email. Keep the ones you want.">
          <Panel>
            {EMAIL_SETTINGS.map((setting, index) => {
              const on = emailIsOn(setting);
              return (
                <View key={setting.column}>
                  {index > 0 ? <RowDivider /> : null}
                  <Switch
                    on={on}
                    busy={busyKey === setting.column}
                    label={setting.label}
                    hint={on ? setting.onHint : setting.offHint}
                    onToggle={(next) => setEmail(setting, next)}
                  />
                </View>
              );
            })}
          </Panel>
        </Section>

        {/* Push permission is an iOS/Android thing — the browser has its own. */}
        {Platform.OS !== 'web' && (
          <Section
            title="Notifications"
            blurb="Nudges on your phone: a reply to something you posted, or your name coming up."
          >
            {/* This one is the phone's answer, not ours — nothing here is saved
                to a profile. It wears the same switch so the column holds, and
                it does exactly what the gold button used to do: ask the phone
                the first time, and send you to the phone's own settings once
                the phone has an opinion. That is the only place these can be
                turned back off, which is what the words say. */}
            <Panel>
              <Switch
                on={isNotificationEnabled}
                label="Push notifications"
                hint={
                  isNotificationEnabled
                    ? "Your phone will let you know. Turn them off in your phone's settings."
                    : permissionStatus === 'denied'
                      ? "Your phone is holding these back — open its settings to let them through."
                      : 'Off for now. Turn this on and your phone will ask you to allow it.'
                }
                onToggle={async () => {
                  if (isNotificationEnabled || permissionStatus === 'denied') {
                    Linking.openSettings();
                    return;
                  }
                  await requestPermissions();
                }}
              />
            </Panel>
          </Section>
        )}

        {/* Who can see you, and where.

            The HIVE-Wide members list is opt-in and starts off for everybody
            (Nat 2026-08-03): "everyone's preferences default to a visibility of
            this HIVE only, they'd have to go in and toggle on HIVE-Wide
            visibility in order to populate here." Being in one HIVE was never
            consent to be listed to the others. */}
        <Section
          title="Who can see you"
          blurb="Your HIVEs always see you. HIVE-Wide is your call."
        >
          <Panel>
            {/* This is the control the other three were made to match — it was
                written here first and lives in `components/ui/Switch.tsx` now. */}
            <Switch
              on={visibleHiveWide}
              busy={savingVisibility}
              label="Show me in HIVE-Wide"
              hint={
                visibleHiveWide
                  ? 'Members of every HIVE you share can find you in the HIVE-Wide directory.'
                  : 'You only appear to people inside your own HIVEs.'
              }
              onToggle={() => void toggleHiveWideVisibility()}
            />
          </Panel>
        </Section>

        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <LinkedLogins />
        </View>

        {/* Swapping HIVEs is plumbing, so it came here with the rest of it. The
            rail has it too, for anyone already on their way somewhere. */}
        {memberships.length > 1 && (
          <Pressable
            onPress={openHivePicker}
            accessibilityRole="button"
            accessibilityLabel="Swap HIVE"
            className="flex-row items-center justify-center bg-gold/10 py-3 rounded-xl active:bg-gold/20"
            style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}
          >
            <Text style={{ fontSize: 16 }}>🔀</Text>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold ml-2">
              Swap HIVE
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          className="flex-row items-center justify-center active:opacity-70"
          style={{ width: '100%', maxWidth: 720, alignSelf: 'center', paddingVertical: 18 }}
        >
          <Ionicons name="person-circle-outline" size={18} color={MUTED} />
          <Text
            style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: MUTED, marginLeft: 8 }}
          >
            Back to your profile
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

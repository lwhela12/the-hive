import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { usePrivacyChoices } from '../../lib/hooks/usePrivacyChoices';
import { AppHeader } from '../../components/navigation';
import { LinkedLogins } from '../../components/profile/LinkedLogins';
import { ScopeBadge } from '../../components/ui/ScopeBadge';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
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
    // Not "add something to the newsletter". Nat, 2026-08-05: "no one cares
    // about the newsletter but me. I'd pitch it as more of an 'end of the month
    // check-in'." The check-in is the thing a member does; the newsletter is
    // one of the places their answers end up, and leading with it made a
    // two-minute reflection sound like an errand for somebody else.
    onHint: 'Two minutes at the end of the month — how it went, what is next.',
    offHint: "You'll still find the check-in waiting on Home.",
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
 * The receipt under a switch that has just been saved.
 *
 * A pill sliding under your finger looks identical whether or not anything
 * reached the database, which is how a setting can be flipped a dozen times and
 * still be wrong. This says, in words, that the answer is stored — and then
 * leaves, because a permanent "Saved" is furniture rather than news.
 */
function SavedNote({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: 'Lato_400Regular',
        fontSize: 12,
        lineHeight: 18,
        color: MUTED,
        marginTop: 8,
        marginBottom: 10,
        marginLeft: SWITCH_GUTTER,
      }}
    >
      {children}
    </Text>
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
  const { profile, memberships, refreshProfile, openHivePicker } = useAuth();
  const { permissionStatus, requestPermissions } = useNotifications({ enableListeners: false });
  const isNotificationEnabled =
    permissionStatus === 'granted' || permissionStatus === 'provisional';

  const {
    community,
    checkedColumn,
    hasDefaultShareColumn,
    canDefaultWide,
    canSendFurther,
    travelOn,
    defaultWide,
    busyKey: privacyBusyKey,
    savedKey: privacySavedKey,
    saveProfileScope,
    saveDefaultShareScope,
  } = usePrivacyChoices();

  // Emails are a separate kind of preference from the two above — same switch
  // component, same busy/pending state so a save can't take another tap
  // mid-flight, but their own state so an email save can never be mistaken
  // for a privacy one. (No "Saved" receipt here — there never was one; the
  // pill's own movement is the only feedback, same as before this split.)
  const [emailBusyKey, setEmailBusyKey] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState<Record<string, boolean>>({});

  const saveEmailPatch = useCallback(
    async (key: string, next: boolean, patch: Record<string, unknown>, failureMessage: string) => {
      if (!profile) return;
      setEmailBusyKey(key);
      setEmailPending((held) => ({ ...held, [key]: next }));
      try {
        const { error } = await (supabase as any)
          .from('profiles')
          .update(patch)
          .eq('id', profile.id);

        if (error) {
          console.warn('[Settings] save failed', key, error);
          showAlert('Sorry', `${failureMessage} (${error.message})`);
          return;
        }
        await refreshProfile();
      } finally {
        setEmailBusyKey(null);
        setEmailPending((held) => {
          const rest = { ...held };
          delete rest[key];
          return rest;
        });
      }
    },
    [profile, refreshProfile]
  );

  const closeSettings = () => {
    // Never `router.back()`. The browser's history remembers the-hive.app from
    // before you signed in, so "back" can walk straight out of the app onto the
    // public marketing site. Nat hit exactly that on her phone (2026-08-06):
    // "it dropped me allllll the way out, all the way to the public site."
    // Every exit names a room inside the app instead.
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

  // Emails count a missing column as on.
  const emailIsOn = (setting: EmailSetting) =>
    emailPending[setting.column] ?? (profile as any)[setting.column] !== false;

  const setEmail = (setting: EmailSetting, next: boolean) => {
    void saveEmailPatch(
      setting.column,
      next,
      { [setting.column]: next },
      'That email setting did not save. Please try again.'
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <AppHeader title="Settings" onBackPress={closeSettings} />

      <BounceScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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

        {/* Who can see you, and where. One switch, one column.

            This page carried TWO of these for the same idea — "How far you
            travel", which wrote `profiles.profile_scope`, and "Show me in
            HIVE-Wide" at the foot of the page, which wrote
            `profiles.visible_hive_wide`. The database's own security policy
            reads `profile_scope` and has never heard of the other column, and
            the HIVE-Wide member list filtered on the other column alone. So a
            member had to find and turn on BOTH before anything happened, and
            turning on either one by itself changed nothing they could see. Nat,
            2026-08-04 and again 08-05: "I've been tryin to select 'HIVE wide' a
            billion times, it never reflects that anywhere" and "I want to make
            my profile visible hive-wide, but i dont see that option anywhere."
            One idea, one flag, one switch, in three places that agree
            (2026-08-06).

            The HIVE-Wide member list is opt-in and starts off for everybody
            (Nat 2026-08-03): "everyone's preferences default to a visibility of
            this HIVE only, they'd have to go in and toggle on HIVE-Wide
            visibility in order to populate here." Being in one HIVE was never
            consent to be listed to the others.

            Two paragraphs used to wrap this switch — an explanation above and a
            reassurance below. Nat, 2026-08-05: "This seems confusing to me & too
            much reading." So it is one line above and one line under the label,
            and it changes with the answer.

            Migration 135 promises "a little bee stands in for you" when your
            profile stays home. That bee has not been built — BoardPostCard and
            BoardReplyItem still fall back to the word "Unknown" — so the words
            here stop at what is true today (2026-08-03). */}
        <Section
          title="Who can see you"
          blurb="Your HIVEs always see you. HIVE-Wide is your call."
        >
          <Panel>
            <Switch
              on={travelOn}
              busy={privacyBusyKey === 'profile_scope'}
              // "Card" appears nowhere else in the app — Nat: "Whats a 'card'?
              // we dont use that anywhere, what are you referring to?" It meant
              // your profile, so it says profile.
              label="Show me HIVE-Wide"
              hint={
                travelOn
                  ? 'Anyone in any HIVE can find you in the HIVE-Wide members list, and open your profile from anything you share.'
                  : 'Only the people who share a HIVE with you can find you or open your profile.'
              }
              onToggle={(next) => void saveProfileScope(next)}
            />
          </Panel>
          {privacySavedKey === 'profile_scope' && (
            <SavedNote>
              {travelOn
                ? 'Saved. You are in the HIVE-Wide members list now.'
                : 'Saved. You show up only inside your own HIVEs now.'}
            </SavedNote>
          )}
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
                busy={privacyBusyKey === 'default_share_scope'}
                // The label used to read "Start new things HIVE-Wide" whether
                // the switch was on or off, so an OFF switch sat under a
                // sentence describing the ON state and the badge beside it said
                // something different again (Nat: "this doesnt match up").
                label={defaultWide ? 'New things go out HIVE-Wide' : 'New things start in your HIVE'}
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
                onToggle={(next) => void saveDefaultShareScope(next)}
              />
              {privacySavedKey === 'default_share_scope' && (
                <SavedNote>
                  {defaultWide
                    ? 'Saved. New wishes and threads will start HIVE-Wide.'
                    : 'Saved. New wishes and threads will start in your HIVE.'}
                </SavedNote>
              )}
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
                    busy={emailBusyKey === setting.column}
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

        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <LinkedLogins />
        </View>

        {/* "Swap HIVE" and "Back to your profile" both left on 2026-08-05.
            Every HIVE you belong to is listed by name in the rail and tapping
            one swaps to it, and Profile is a rail entry too — Nat: "We can get
            rid of these now, because they are in the side navigation panel."
            Two doors to the same room is two things to keep in step. */}
      </BounceScrollView>
    </SafeAreaView>
  );
}

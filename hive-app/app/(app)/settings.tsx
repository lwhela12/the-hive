import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from '../../components/ui/SafeArea';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { userFacingError } from '../../lib/userFacingError';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { usePrivacyChoices } from '../../lib/hooks/usePrivacyChoices';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { AppHeader } from '../../components/navigation';
import { LinkedLogins } from '../../components/profile/LinkedLogins';
import { WhoCanSeeYouToggle } from '../../components/ui/WhoCanSeeYouToggle';
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
 * 2026-08-05: every yes/no preference on this page became the same control,
 * `components/ui/Switch.tsx` — it had grown four different shapes (radio
 * cards, a sliding pill, a gold button per email) for four instances of one
 * kind of question. Nat: *"We need one style & one alignment throughout."*
 *
 * 2026-08-11: two follow-on cuts. "Your default sharing" is gone — nothing
 * downstream ever read `profiles.default_share_scope` as a starting value,
 * so the switch was pure decoration (see `components/ui/WhoCanSeeYouToggle.tsx`
 * for what replaced its neighbour, now shared with the monthly tune-up's own
 * copy of the same choice). And every section's explanatory blurb, plus each
 * switch's own on/off hint, came out — Nat: *"each bolded header is self
 * explanatory enough, we dont need to explain it, thats just too many
 * words."* What each remaining control saves, and where, did not change.
 */

const PANEL = '#fffdf6';
const HAIRLINE = 'rgba(222,193,129,0.4)';
const CHARCOAL = '#313130';
const MUTED = '#8e7f6b';
// The gold used to live here too, for the radio dots and the On buttons. Both
// are gone; the switch carries the gold now, out of `components/ui/Switch.tsx`.

/**
 * One switch per email the HIVE actually sends.
 *
 * **The newsletter switch is here as of 2026-08-12, and the reason it was
 * absent is worth keeping.** It used to say: *"Nat still writes it in the app
 * and pastes it into Wix to send, so nothing in our code consults a member's
 * answer at send time — a switch would take the choice and quietly drop it."*
 * That was right, and it stopped being right the day `send-newsletter`
 * shipped, because that function reads `email_newsletter_enabled` to decide
 * who gets an issue.
 *
 * Nat found the gap from the other end, in the email itself: the footer told
 * members to "turn it off in Settings" and Settings had no such switch. A
 * promise pointing at nothing.
 *
 * **Replies and @s joined the list on 2026-09-01.** They used to be absent
 * with a note saying they "arrive as a nudge on your phone" — which was true
 * of the code and false of the world. Expo push reaches an installed app, and
 * HIVE is a browser tab, so those nudges had been landing where nobody was
 * standing since June. Nat: *"we don't have any means of pushing. It's not an
 * app. It's a web app... nobody knows any of those things. So I think an email
 * could be nice, because then people could know to go back into the HIVE web
 * app. And the usage has really fallen off."*
 *
 * The three new ones are email only, deliberately: *"the only thing we have
 * available to ourselves right now is email... When it is an app, then they can
 * toggle those on."* A push switch goes beside each the day there is an app to
 * push to.
 *
 * `scripts/lint-reach-mail.mjs` holds the three halves together — column,
 * sender, and a row on this page — so a switch can never govern nothing.
 */

type EmailSetting = {
  /** The boolean column on profiles that carries this. */
  column: string;
  label: string;
  hint?: string;
};

/**
 * These three carry a line of explanation each, against this page's usual rule.
 *
 * Nat set that rule herself on 2026-08-11 — *"each bolded header is self
 * explanatory enough, we dont need to explain it, thats just too many words"* —
 * and made this exception on 2026-08-12: *"Normally, i dont like the extra
 * explainer text, but here, i think we can add a little more."* The difference
 * is that these three switch off an email a member has not received yet, so
 * the label alone is asking them to decide about something they cannot picture.
 */
const EMAIL_SETTINGS: EmailSetting[] = [
  {
    column: 'email_meeting_checkin_enabled',
    label: 'Before-a-meeting check-in',
    hint: 'Three days before the meeting, an email walks you through getting ready — your wishes, your to-dos, and how you are doing.',
  },
  {
    column: 'email_midpoint_checkin_enabled',
    label: 'Halfway check-in',
    hint: 'Roughly halfway between meetings. A quick pulse on how it is going, and your chance to put a shout-out or a plug in the next newsletter.',
  },
  {
    column: 'email_newsletter_enabled',
    label: 'The Buzz',
    hint: 'The monthly newsletter — what everyone worked on, what got granted, and what is coming up.',
  },
  {
    column: 'email_post_meeting_recap_enabled',
    label: 'Recap email if I miss a meeting',
    hint: 'After Wrap-Up confirms you were away, two direct ways to catch up: the sealed summary or Clive.',
  },
  {
    column: 'email_mention_enabled',
    label: 'When somebody writes my name',
    hint: 'An @mention on a board, in a room, or on a wish — with what they said and a way straight to it.',
  },
  {
    column: 'email_message_enabled',
    label: 'When a message lands for me',
    hint: 'One email per conversation, then quiet until you have opened it.',
  },
  {
    column: 'email_board_reply_enabled',
    label: 'When somebody replies to my post',
    hint: 'A reply on something you put on a board.',
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 24, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 18, color: CHARCOAL }}>
        {title}
      </Text>
      <View style={{ height: 10 }} />
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
    travelOn,
    busyKey: privacyBusyKey,
    savedKey: privacySavedKey,
    saveProfileScope,
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
          showAlert('Sorry', userFacingError(error, `${failureMessage} Please try again.`));
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
            here stop at what is true today (2026-08-03).

            2026-08-11: the single "Show me HIVE-Wide" switch became this
            two-way toggle. Nat: *"It should be an easy toggle of 'HIVE Wide or
            this HIVE only' ... with easy colors & icons so your choice is
            visible and easy."* The explanatory paragraphs above and below the
            old switch are gone too — the two options now say the whole thing
            themselves. Still the one flag, `profiles.profile_scope`. */}
        <Section title="Who can see you">
          <Panel>
            <WhoCanSeeYouToggle
              wide={travelOn}
              hiveName={hiveDisplayName(community?.name)}
              hiveColour={hiveAccent(community)}
              busy={privacyBusyKey === 'profile_scope'}
              onChange={(next) => void saveProfileScope(next)}
            />
          </Panel>
          {privacySavedKey === 'profile_scope' && (
            <SavedNote>
              {travelOn
                ? 'Saved. You are in the HIVE-Wide members list now.'
                : `Saved. You show up only inside ${hiveDisplayName(community?.name)} now.`}
            </SavedNote>
          )}
        </Section>

        <Section title="Emails">
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
                    onToggle={(next) => setEmail(setting, next)}
                  />
                  {setting.hint ? (
                    <Text
                      style={{
                        fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18,
                        color: MUTED, paddingHorizontal: 16, paddingBottom: 12, marginTop: -6,
                      }}
                    >
                      {setting.hint}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Panel>
        </Section>

        {/* Push permission is an iOS/Android thing — the browser has its own. */}
        {Platform.OS !== 'web' && (
          <Section title="Notifications">
            {/* This one is the phone's answer, not ours — nothing here is saved
                to a profile. It wears the same switch so the column holds, and
                it does exactly what the gold button used to do: ask the phone
                the first time, and send you to the phone's own settings once
                the phone has an opinion. That is the only place these can be
                turned back off. */}
            <Panel>
              <Switch
                on={isNotificationEnabled}
                label="Push notifications"
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

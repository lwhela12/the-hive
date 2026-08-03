import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { AppHeader } from '../../components/navigation';
import { HiveIcon } from '../../components/ui/HiveIcon';
import { LinkedLogins } from '../../components/profile/LinkedLogins';

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
 */

const PANEL = '#fffdf6';
const HAIRLINE = 'rgba(222,193,129,0.4)';
const CHARCOAL = '#313130';
const MUTED = '#8e7f6b';
const GOLD = '#bd9348';

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
    onHint: 'On — your check-in link, three days before we meet',
    offHint: "Off — you'll still see it on Home",
  },
  {
    column: 'email_midpoint_checkin_enabled',
    label: 'The month-end check-in',
    onHint: 'On — two minutes to add something to the newsletter',
    offHint: 'Off — the newsletter still comes out without you',
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

/** A row of choices, one of which is yours. Same shape as the wish picker. */
function ChoiceRow({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { key: string; label: string; hint: string }[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: !!disabled }}
            accessibilityLabel={`${option.label} — ${option.hint}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: selected ? '#fdf3dc' : PANEL,
              borderWidth: 1,
              borderColor: selected ? 'rgba(222,193,129,0.75)' : HAIRLINE,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 12,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 14, color: selected ? GOLD : '#c3b8a5' }}>
              {selected ? '●' : '○'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: selected ? 'Lato_700Bold' : 'Lato_400Regular',
                  fontSize: 14,
                  color: selected ? '#8a6b30' : CHARCOAL,
                }}
              >
                {option.label}
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 12,
                  lineHeight: 17,
                  color: MUTED,
                  marginTop: 2,
                }}
              >
                {option.hint}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function Toggle({
  on,
  onPress,
  busy,
  label,
}: {
  on: boolean;
  onPress: () => void;
  busy?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled: !!busy }}
      style={{
        minWidth: 58,
        alignItems: 'center',
        backgroundColor: on ? GOLD : '#ece7dc',
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 8,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: 13,
          color: on ? '#fffdf5' : '#7d715f',
        }}
      >
        {on ? 'On' : 'Off'}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { profile, community, memberships, refreshProfile, openHivePicker } = useAuth();
  const { permissionStatus, requestPermissions } = useNotifications({ enableListeners: false });
  const isNotificationEnabled =
    permissionStatus === 'granted' || permissionStatus === 'provisional';

  // Your default sharing wants a column that may not have been added yet, and
  // this screen is not allowed to add it. So it asks the database once and
  // shows the picker only if it can genuinely save the answer (2026-08-03).
  const [checkedColumn, setCheckedColumn] = useState(false);
  const [hasDefaultShareColumn, setHasDefaultShareColumn] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
    async (key: string, patch: Record<string, unknown>, failureMessage: string) => {
      if (!profile) return;
      setBusyKey(key);
      try {
        const { error } = await (supabase as any)
          .from('profiles')
          .update(patch)
          .eq('id', profile.id);

        if (error) {
          Alert.alert('Sorry', failureMessage);
          return;
        }
        await refreshProfile();
      } finally {
        setBusyKey(null);
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
          <ActivityIndicator size="small" color={GOLD} />
        </View>
      </SafeAreaView>
    );
  }

  const profileScope: Scope =
    (profile as any).profile_scope === 'all_hives' ? 'all_hives' : 'hive';

  // How far you travel is worth asking everyone, even somebody in a single
  // HIVE: the shared noticeboards reach every HIVE, so their post can be read
  // by people they've never met whether or not they belong to a second HIVE.
  const travelOptions = [
    {
      key: 'hive',
      label: 'Stay in my HIVE',
      hint: 'The people who share a HIVE with you can open your card.',
    },
    {
      key: 'all_hives',
      label: 'Come with me',
      hint: 'Anyone in any HIVE can open your card.',
    },
  ];

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

  const emailIsOn = (setting: EmailSetting) => (profile as any)[setting.column] !== false;

  const setEmail = (setting: EmailSetting, next: boolean) => {
    void savePatch(
      setting.column,
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

        <Section
          title="How far you travel"
          blurb="This one is about you, and it works on top of whatever you choose for each thing you write. Post to a board that every HIVE can see and your card can ride along, so someone you've never met can tap your name and see who is vouching for it."
        >
          <ChoiceRow
            options={travelOptions}
            value={profileScope}
            disabled={busyKey === 'profile_scope'}
            onChange={(next) =>
              void savePatch(
                'profile_scope',
                { profile_scope: next },
                'That setting did not save. Please try again.'
              )
            }
          />
          {/* Migration 135 promises "a little bee stands in for you" here, and
              that bee has not been built yet — BoardPostCard and BoardReplyItem
              still fall back to the word "Unknown" for an author they can't
              read. So this line stops at what is true today (2026-08-03); it
              can grow the bee back the day the bee exists. */}
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 12,
              lineHeight: 18,
              color: MUTED,
              marginTop: 10,
            }}
          >
            Keep to your HIVE and what you share still counts — the recommendation travels, you
            stay here.
          </Text>
        </Section>

        <Section
          title="Your default sharing"
          blurb={
            canSendFurther
              ? 'Where a new wish or thread starts out. Whatever you pick here, you can open any single one of them up when you share it.'
              : 'Where a new wish or thread starts out.'
          }
        >
          {!checkedColumn ? (
            <Panel>
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={GOLD} />
              </View>
            </Panel>
          ) : hasDefaultShareColumn && canDefaultWide ? (
            <ChoiceRow
              options={[
                { key: 'hive', label: 'My HIVE', hint: 'New wishes and threads start here.' },
                {
                  key: 'all_hives',
                  label: 'Every HIVE',
                  hint: 'More eyes on it — anyone in any HIVE.',
                },
              ]}
              value={defaultShare}
              disabled={busyKey === 'default_share_scope'}
              onChange={(next) =>
                void savePatch(
                  'default_share_scope',
                  { default_share_scope: next },
                  'That setting did not save. Please try again.'
                )
              }
            />
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
                  <View
                    key={setting.column}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 13,
                      borderTopWidth: index > 0 ? 1 : 0,
                      borderTopColor: HAIRLINE,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: CHARCOAL }}>
                        {setting.label}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Lato_400Regular',
                          fontSize: 12,
                          lineHeight: 17,
                          color: MUTED,
                          marginTop: 3,
                        }}
                      >
                        {on ? setting.onHint : setting.offHint}
                      </Text>
                    </View>
                    <Toggle
                      on={on}
                      busy={busyKey === setting.column}
                      label={setting.label}
                      onPress={() => setEmail(setting, !on)}
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
            <Panel>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: CHARCOAL }}>
                    Push notifications
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular',
                      fontSize: 12,
                      lineHeight: 17,
                      color: MUTED,
                      marginTop: 3,
                    }}
                  >
                    {isNotificationEnabled
                      ? 'On — your phone will let you know'
                      : permissionStatus === 'denied'
                        ? 'Your phone is holding these back — open its settings to let them through'
                        : 'Off for now'}
                  </Text>
                </View>
                {isNotificationEnabled ? (
                  <View
                    style={{
                      backgroundColor: '#eaf3e6',
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#3F7D5C' }}>
                      On
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={async () => {
                      if (permissionStatus === 'denied') {
                        Linking.openSettings();
                        return;
                      }
                      await requestPermissions();
                    }}
                    accessibilityRole="button"
                    style={{
                      backgroundColor: GOLD,
                      borderRadius: 999,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#fffdf5' }}>
                      {permissionStatus === 'denied' ? 'Open phone settings' : 'Turn on'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </Panel>
          </Section>
        )}

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
            <HiveIcon name="swap" size={18} color="#8e6f35" />
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

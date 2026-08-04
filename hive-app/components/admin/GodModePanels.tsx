import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { HIVE_GOLD, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import type { UserRole } from '../../types';

/**
 * Everyone, everywhere, in one room.
 *
 * Nat and Lucas are the only admins and they're in every HIVE, so Admin shows
 * all of them at once rather than making you swap HIVE to see who's in it
 * (Nat 2026-08-01). It isn't a special power: the rules already let you read
 * members of HIVEs you belong to, so an admin who's in one HIVE sees one box.
 * God mode is a consequence of Nat's memberships, not an exception to anything.
 *
 * Plus the newsletter, which belongs to nobody's HIVE in particular.
 */

type Row = { id: string; name: string; email: string; role: string };
type Subscriber = { id: string; email: string; name: string | null; unsubscribed_at: string | null };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'admin', label: 'Admin' },
];

/**
 * Where each box sits on the Admin dashboard.
 *
 * Nat 2026-08-03: "meeting helpers & surveys in the first box, cos that is what
 * I use the most, 2nd would be newsletter drafter & signups & then the other
 * hives below that." The web grid lays the boxes out by these numbers, and the
 * screen writes them in the same sequence so a phone build reads the same way.
 */
export const ADMIN_PANEL_ORDER = {
  // Nat 2026-08-03: "left hand side, top to bottom should go OG HIVE, Tech
  // HIVE, Production HIVE, and on the right it should be Meeting tools and
  // newsletter."
  //
  // The dashboard is a wrapping row of half-width cells, so odd positions land
  // in the left column and even ones in the right. The HIVEs take 1, 3, 5 and
  // the two tools take 2 and 4, which reads down each column the way she asked
  // and still stacks in a sensible order on a phone.
  hives: 1,
  meetingTools: 2,
  newsletter: 4,
} as const;

/* ------------------------------------------------------------------ colour */

type Rgb = { r: number; g: number; b: number };

const HEX = /^#[0-9a-fA-F]{6}$/;

function toRgb(hex: string): Rgb {
  const clean = (HEX.test(hex) ? hex : HIVE_GOLD).replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function toHsl({ r, g, b }: Rgb) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };

  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr
    ? ((gg - bb) / d) % 6
    : max === gg
      ? (bb - rr) / d + 2
      : (rr - gg) / d + 4;

  return { h: (h * 60 + 360) % 360, s, l };
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
      : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c]
            : [c, 0, x];
  const pair = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return `#${pair(r1)}${pair(g1)}${pair(b1)}`;
}

const veil = ({ r, g, b }: Rgb, alpha: number) => `rgba(${r},${g},${b},${alpha})`;

/** Same trick the side rail uses: the colour, taken down a few notches. */
const deepen = ({ r, g, b }: Rgb, amount: number) =>
  `#${[r, g, b].map((v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;

export type HivePanelSkin = {
  tab: string;
  tabText: string;
  body: string;
  border: string;
  hairline: string;
  inset: string;
  shadow: string;
  /** True when the accent itself is pale enough to need dark text on it. */
  isLight: boolean;
  /** The opaque tab colour, for anywhere a translucent one would not read. */
  washedTab: string;
};

/**
 * A HIVE's box, wearing that HIVE's colour.
 *
 * Nat 2026-08-03: a thin stripe of colour along the top wasn't enough to tell
 * the boxes apart — "we just need to make the purple and blue ones more
 * obvious". So the folder tab carries the HIVE's colour and the body sits in
 * the faintest wash of it. You know whose box you're in before you read the
 * name.
 *
 * Deep colours (Tech's navy, Production's purple) fill the tab at full strength
 * and take cream lettering. A light colour like HIVE gold would vanish that way
 * against a cream page, so it wears the same colour as a tint with charcoal
 * lettering — which is the cream-and-gold OG HIVE already had. Every value
 * comes off accent_color, so a fourth HIVE picks its own side of that line.
 */
export function hivePanelSkin(accent: string): HivePanelSkin {
  const rgb = toRgb(accent);
  const { h, s } = toHsl(rgb);
  // Perceived brightness, the usual sRGB weighting. Gold lands at 0.59, navy
  // and purple around 0.3.
  const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 >= 0.45;
  // Colour drains out of anything this pale, so the wash borrows saturation
  // back — otherwise "light blue" arrives as grey.
  const washed = Math.min(1, s * 1.6);

  // Admin is god mode, and god mode is seen from the cosmos — Nat's words, and
  // the right instinct (2026-08-03). The panels float on the star field rather
  // than covering it: the HIVE's own colour, thinned almost to nothing, so you
  // can still tell whose box you are looking at while the sky shows through.
  //
  // The `light` / `washed` work above still matters, because a HIVE picking a
  // pale accent needs its tab lifted or the name on it disappears.
  return {
    tab: veil(rgb, 0.55),
    tabText: '#fffdf5',
    body: veil(rgb, 0.11),
    border: veil(rgb, 0.42),
    hairline: 'rgba(255,255,255,0.11)',
    inset: 'rgba(255,255,255,0.07)',
    shadow: HEX.test(accent) ? accent : HIVE_GOLD,
    // Kept so a pale accent can still be checked against, rather than silently
    // dropping the two values this function spent its time working out.
    isLight: light,
    washedTab: fromHsl(h, washed, 0.9),
  };
}

/* ------------------------------------------------------------- shared bits */

async function functionErrorMessage(error: unknown, fallback: string) {
  try {
    const context = (error as { context?: { clone?: () => { json: () => Promise<unknown> } } }).context;
    const body = context?.clone ? await context.clone().json() : null;
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
    return (error as { message?: string }).message || fallback;
  } catch {
    return fallback;
  }
}

type PanelChrome = {
  cellStyle: any;
  panelStyle: any;
  bodyStyle: any;
  scrollStyle: any;
  Panel: React.ComponentType<any>;
};

/* -------------------------------------------------------------- newsletter */

/**
 * The newsletter, start to finish: write this month's draft, and see who is
 * signed up to get it. The draft used to be its own stop on the side rail —
 * it lives here now, next to the list it goes out to (Nat 2026-08-03).
 */
export function NewsletterPanel({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
  order = ADMIN_PANEL_ORDER.newsletter,
}: PanelChrome & { order?: number }) {
  const router = useRouter();
  const { profile } = useAuth();
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, name, unsubscribed_at')
      .order('created_at', { ascending: true });
    setSubs((data ?? []) as Subscriber[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addSubscriber = async () => {
    const email = newEmail.trim();
    if (!EMAIL.test(email)) {
      Alert.alert('That address looks off', 'Check it and try again.');
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.rpc('subscribe_to_newsletter', { p_email: email, p_name: null });
      if (error) throw error;
      setNewEmail('');
      await load();
      Alert.alert('Added', `${email} will get the next newsletter.`);
    } catch {
      Alert.alert('Could not add that', 'Try again in a moment.');
    } finally {
      setAdding(false);
    }
  };

  const removeSubscriber = async (sub: Subscriber) => {
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', sub.id);
    if (error) {
      Alert.alert('Could not remove that', 'Try again in a moment.');
      return;
    }
    await load();
  };

  const active = subs.filter((s) => !s.unsubscribed_at);

  return (
    <View style={[cellStyle, { order } as any]}>
      <Panel title="Newsletter" style={panelStyle} bodyStyle={bodyStyle}>
        <ScrollView style={scrollStyle} nestedScrollEnabled showsVerticalScrollIndicator>
          {/* The draft quotes members before Nat has chosen what stays in, so
              the screen itself is hers alone. Anyone else never sees the door. */}
          {profile?.is_owner ? (
            <Pressable
              onPress={() => router.push({ pathname: '/newsletter', params: { from: 'admin' } } as any)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 13,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(222,193,129,0.35)',
                backgroundColor: pressed ? '#fbf0d7' : '#fdf9ee',
              })}
            >
              <Ionicons name="create-outline" size={18} color="#bd9348" />
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8a6b30', flex: 1 }}>
                Write this month&rsquo;s newsletter
              </Text>
              <Ionicons name="chevron-forward" size={15} color="#bd9348" />
            </Pressable>
          ) : null}

          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: '#9a8060',
              paddingHorizontal: 14,
              paddingTop: 14,
            }}
          >
            Signed up ({active.length})
          </Text>

          {/* Add somebody by hand — "add my dad to the newsletter" */}
          <View style={{ flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' }}>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="their@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                flex: 1, fontFamily: 'Lato_400Regular', fontSize: 13, color: '#F6F4E5',
                backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(189,147,72,0.4)',
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
              }}
            />
            <Pressable
              onPress={addSubscriber}
              disabled={adding}
              style={{
                backgroundColor: '#bd9348', borderRadius: 10,
                paddingHorizontal: 14, paddingVertical: 10, opacity: adding ? 0.6 : 1,
              }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#fffdf5' }}>Add</Text>
            </Pressable>
          </View>

          {active.length === 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', paddingHorizontal: 14, paddingBottom: 14 }}>
              Nobody outside the HIVEs is subscribed yet. Members get it automatically.
            </Text>
          ) : active.map((sub) => (
            <View
              key={sub.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 14, paddingVertical: 10,
                borderTopWidth: 1, borderTopColor: 'rgba(222,193,129,0.25)',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#3f3a31' }}>
                  {sub.email}
                </Text>
                {sub.name ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060' }}>{sub.name}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => removeSubscriber(sub)}
                hitSlop={8}
                accessibilityLabel={`Remove ${sub.email}`}
              >
                <Ionicons name="close-circle-outline" size={19} color="#b0a48c" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </Panel>
    </View>
  );
}

/* ------------------------------------------------------------- other hives */

/**
 * One box per other HIVE you belong to, each in its own colour, each able to
 * invite. The HIVE you're signed into has a fuller box on the Admin screen
 * itself — rendering it here too showed OG HIVE twice under two different
 * names (Nat 2026-08-03).
 */
export function HiveMemberPanels({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
  HeaderAction,
  orderFrom = ADMIN_PANEL_ORDER.hives,
}: PanelChrome & {
  HeaderAction: React.ComponentType<{ label: string; onPress: () => void }>;
  orderFrom?: number;
}) {
  const { memberships, communityId } = useAuth();
  const [byHive, setByHive] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const next: Record<string, Row[]> = {};

    await Promise.all(memberships.map(async (m) => {
      const { data } = await supabase
        .from('community_memberships')
        .select('role, user:profiles!user_id(id, name, email)')
        .eq('community_id', m.community_id);

      next[m.community_id] = ((data ?? []) as any[])
        .map((r) => ({
          id: r.user?.id, name: r.user?.name ?? 'Someone', email: r.user?.email ?? '', role: r.role,
        }))
        .filter((r) => r.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    }));

    setByHive(next);
    setLoading(false);
  }, [memberships]);

  useEffect(() => { void load(); }, [load]);

  // The same edge function the HIVE you're in uses, told which HIVE to invite
  // into. It checks you're an admin of that one before it sends, which is why
  // the button only appears where you are.
  const sendInvite = async (targetId: string, hiveName: string) => {
    const email = inviteEmail.trim();
    if (!EMAIL.test(email)) {
      Alert.alert('That address looks off', 'Check it and try again.');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ reusedInvite?: boolean }>('invite', {
        body: { email, role: inviteRole, community_id: targetId },
      });
      if (error) throw new Error(await functionErrorMessage(error, 'Could not send that invite.'));

      setInviteEmail('');
      setInviteRole('member');
      setInviteFor(null);
      await load();
      Alert.alert(
        data?.reusedInvite ? 'Invite refreshed' : 'Invite sent',
        data?.reusedInvite
          ? `${email} already had an invite waiting for ${hiveName}, so we sent the link again.`
          : `${email} will get an invite to ${hiveName}.`
      );
    } catch (err) {
      Alert.alert('Could not send that invite', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* EVERY HIVE, including the one you happen to be standing in.
          It used to skip the current one, because admin.tsx drew that one
          itself — which is exactly why they didn't match: two bits of code
          drawing the same idea, one with role buttons and a purple wash, the
          other with cream and a tiny word. Nat spotted it side by side
          ("see how these don't"). One list now, drawn once.

          Nat's order, left column top to bottom: OG, Tech, Production. The grid
          wraps left-right, so the hives take the odd positions and Meeting
          Tools / Newsletter take the even ones. */}
      {memberships.map((m, index) => {
        const rows = byHive[m.community_id] ?? [];
        const accent = hiveAccent(m.community);
        const skin = hivePanelSkin(accent);
        const name = hiveDisplayName(m.community?.name);
        const inviting = inviteFor === m.community_id;

        return (
          <View key={m.community_id} style={[cellStyle, { order: orderFrom + index * 2 } as any]}>
            <Panel
              title={`${name} (${rows.length})`}
              accent={accent}
              style={panelStyle}
              bodyStyle={bodyStyle}
              action={m.role === 'admin' ? (
                <HeaderAction
                  label={inviting ? 'Close Invite' : '+ New Member'}
                  onPress={() => {
                    setInviteEmail('');
                    setInviteRole('member');
                    setInviteFor(inviting ? null : m.community_id);
                  }}
                />
              ) : undefined}
            >
              <ScrollView style={scrollStyle} nestedScrollEnabled showsVerticalScrollIndicator>
                {inviting ? (
                  <View
                    style={{
                      padding: 14,
                      backgroundColor: skin.inset,
                      borderBottomWidth: 1,
                      borderBottomColor: skin.hairline,
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#F6F4E5', marginBottom: 10 }}>
                      Invite somebody to {name}
                    </Text>
                    <TextInput
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      placeholder="their@email.com"
                      placeholderTextColor="rgba(246,244,229,0.38)"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!sending}
                      style={{
                        fontFamily: 'Lato_400Regular', fontSize: 13, color: '#F6F4E5',
                        backgroundColor: '#fff', borderWidth: 1, borderColor: skin.border,
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                        opacity: sending ? 0.65 : 1,
                      }}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {ROLES.map((role) => {
                        const chosen = inviteRole === role.value;
                        return (
                          <Pressable
                            key={role.value}
                            onPress={() => setInviteRole(role.value)}
                            disabled={sending}
                            style={{
                              backgroundColor: chosen ? accent : 'rgba(255,255,255,0.09)',
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              opacity: sending ? 0.7 : 1,
                            }}
                          >
                            <Text style={{
                              fontFamily: 'Lato_700Bold', fontSize: 12,
                              color: chosen ? '#fffdf5' : 'rgba(246,244,229,0.72)',
                            }}>
                              {role.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      onPress={() => sendInvite(m.community_id, name)}
                      disabled={sending}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: accent, borderRadius: 12,
                        paddingVertical: 12, marginTop: 12, opacity: sending ? 0.75 : 1,
                      }}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#fffdf5" style={{ marginRight: 8 }} />
                      ) : null}
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#fffdf5' }}>
                        {sending ? 'Sending Invite' : 'Send Invite'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {loading && rows.length === 0 ? (
                  <View style={{ padding: 20 }}><ActivityIndicator color={accent} /></View>
                ) : rows.length === 0 ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: 'rgba(246,244,229,0.55)', padding: 16 }}>
                    Nobody here yet.
                  </Text>
                ) : rows.map((r) => (
                  <View
                    key={r.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderBottomWidth: 1, borderBottomColor: skin.hairline,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#F6F4E5' }}>
                        {r.name}
                      </Text>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(246,244,229,0.55)' }}>
                        {r.email}
                      </Text>
                    </View>
                    {/* Everyone says what they are, including plain members —
                        "each one should show what they are" (Nat 2026-08-03).
                        Only marking the exceptions meant a blank row could be
                        read either as a member or as something still loading. */}
                    <View
                      style={{
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                        backgroundColor: r.role === 'member'
                          ? 'rgba(255,255,255,0.09)'
                          : 'rgba(255,255,255,0.17)',
                      }}
                    >
                      <Text style={{
                        fontFamily: 'Lato_700Bold', fontSize: 9.5, letterSpacing: 0.7,
                        textTransform: 'uppercase',
                        color: r.role === 'member' ? 'rgba(246,244,229,0.6)' : '#F6F4E5',
                      }}>
                        {r.role}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Panel>
          </View>
        );
      })}
    </>
  );
}

/** Both god-mode boxes at once, in Nat's order, for anyone who wants the pair. */
export function GodModePanels(props: PanelChrome & {
  HeaderAction: React.ComponentType<{ label: string; onPress: () => void }>;
}) {
  return (
    <>
      <NewsletterPanel {...props} />
      <HiveMemberPanels {...props} />
    </>
  );
}

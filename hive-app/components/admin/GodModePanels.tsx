import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { HIVE_GOLD, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateMedium } from '../../lib/dateUtils';
import { showAlert } from '../../lib/showAlert';
import type { UserRole } from '../../types';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FIELD_LOOK } from '../ui/Input';
import { ThinkingBee } from '../ui/ThinkingBee';
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

/**
 * What every box you type into wears: cream-white fill, the gold hairline, the
 * same rounded edge and the same muted placeholder ink as Clive's message bar.
 *
 * The two fields in this file both take an email address, which is not something
 * anybody wants to say out loud — dictating an address is worse than typing one —
 * so they keep a plain field and no microphone. Matching the bar's colours is
 * what keeps them in the same family as the boxes that do have one.
 */
const FIELD = FIELD_LOOK;

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'admin', label: 'Admin' },
];

/* --------------------------------------------------- invited, not joined yet */

/** An invite that is still waiting: a row with no `accepted_at` on it. */
type PendingInvite = {
  id: string;
  community_id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string | null;
};

const inviteKey = (invite: PendingInvite) => `${invite.community_id}:${invite.email.trim().toLowerCase()}`;
const inviteTime = (invite: PendingInvite) => new Date(invite.created_at).getTime() || 0;

/**
 * One line per person, not one line per time you pressed send.
 *
 * Re-inviting the same address writes another row (or refreshes the old one),
 * so a list straight out of the table can show the same email three times and
 * read like three people are hovering outside the door. Newest wins, which is
 * also the only one whose link still works.
 */
function newestInvitePerEmail(invites: PendingInvite[]) {
  const byEmail = new Map<string, PendingInvite>();
  invites.forEach((invite) => {
    const existing = byEmail.get(inviteKey(invite));
    if (!existing || inviteTime(invite) > inviteTime(existing)) byEmail.set(inviteKey(invite), invite);
  });
  return Array.from(byEmail.values()).sort((a, b) => inviteTime(b) - inviteTime(a));
}

/**
 * An expired invite is not pending. The link in that email does nothing now, so
 * calling it "pending" tells you to keep waiting for somebody who cannot get in
 * — on another project that exact lie cost a real person a week of trying.
 */
const inviteHasExpired = (invite: PendingInvite) =>
  !!invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "today", "yesterday", "4 days ago", then a plain date once that stops helping. */
function sentWhen(iso: string) {
  const sent = new Date(iso);
  if (Number.isNaN(sent.getTime())) return 'recently';
  const days = Math.round((startOfDay(new Date()) - startOfDay(sent)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${formatDateMedium(iso)}`;
}

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
  //
  // The body veil went 0.11 → 0.19 on 2026-08-03 ("the translucent ones should
  // have a tiny bit more color"). It is the other half of the same fix as the
  // cream panels going slightly transparent: both were true to their own idea
  // and wrong beside each other.
  return {
    tab: veil(rgb, 0.6),
    tabText: '#fffdf5',
    body: veil(rgb, 0.19),
    border: veil(rgb, 0.48),
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
  /**
   * Three jobs, three tabs.
   *
   * Nat, 2026-08-05: "so this newsletter box has different tabs: who's signed
   * up, shout outs people want mentioned & write this months newsletter?"
   *
   * The shout-outs tab is the one that was missing anywhere in the app. People
   * have been asked every month to drop things in the newsletter thread, and
   * there has never been a screen that showed what they dropped — the words went
   * into the board and only the draft ever read them, which is also why nobody
   * noticed the draft was reading none of them.
   */
  const [tab, setTab] = useState<'write' | 'shoutouts' | 'signed'>('write');
  const [shoutOuts, setShoutOuts] = useState<
    { id: string; content: string; created_at: string; author: string }[]
  >([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, name, unsubscribed_at')
      .order('created_at', { ascending: true });
    setSubs((data ?? []) as Subscriber[]);

    // What members have actually asked to have mentioned — the replies on the
    // newsletter thread, the same ones the draft harvests.
    const { data: boards } = await supabase
      .from('board_categories')
      .select('id')
      .eq('topic_kind', 'newsletter');
    const boardIds = ((boards ?? []) as { id: string }[]).map((b) => b.id);
    if (boardIds.length === 0) { setShoutOuts([]); return; }

    const { data: threads } = await supabase
      .from('board_posts')
      .select('id, title')
      .in('category_id', boardIds)
      .ilike('title', '%newsletter%')
      .order('created_at', { ascending: false })
      .limit(3);
    const threadIds = ((threads ?? []) as { id: string }[]).map((t) => t.id);
    if (threadIds.length === 0) { setShoutOuts([]); return; }

    const { data: replies } = await supabase
      .from('board_replies')
      .select('id, content, created_at, author:profiles!author_id(name)')
      .in('post_id', threadIds)
      .order('created_at', { ascending: false })
      .limit(40);
    setShoutOuts(((replies ?? []) as any[]).map((r) => ({
      id: r.id,
      content: String(r.content ?? '').trim(),
      created_at: r.created_at,
      author: r.author?.name ?? 'Someone',
    })).filter((r) => r.content.length > 0));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addSubscriber = async () => {
    const email = newEmail.trim();
    if (!EMAIL.test(email)) {
      showAlert('That address looks off', 'Check it and try again.');
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.rpc('subscribe_to_newsletter', { p_email: email, p_name: null });
      if (error) throw error;
      setNewEmail('');
      await load();
      showAlert('Added', `${email} will get the next newsletter.`);
    } catch {
      showAlert('Could not add that', 'Try again in a moment.');
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
      showAlert('Could not remove that', 'Try again in a moment.');
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

          {/* The three jobs, as tabs. */}
          <View
            style={{
              flexDirection: 'row',
              gap: 6,
              paddingHorizontal: 12,
              paddingTop: 12,
              flexWrap: 'wrap',
            }}
          >
            {([
              { key: 'shoutouts' as const, label: `Shout-outs (${shoutOuts.length})` },
              { key: 'signed' as const, label: `Signed up (${active.length})` },
            ]).map((entry) => {
              const on = tab === entry.key;
              return (
                <Pressable
                  key={entry.key}
                  onPress={() => setTab(entry.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: on ? 'rgba(189,147,72,0.7)' : 'rgba(189,147,72,0.25)',
                    backgroundColor: on ? '#fdf3dc' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: on ? 'Lato_700Bold' : 'Lato_400Regular',
                      fontSize: 12.5,
                      color: on ? '#8a6b30' : '#9a8060',
                    }}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'shoutouts' ? (
            <View style={{ padding: 12, gap: 8 }}>
              {shoutOuts.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', lineHeight: 19 }}>
                  Nobody has asked for a mention yet. What members add to the
                  newsletter thread lands here, and goes into the draft.
                </Text>
              ) : shoutOuts.map((item) => (
                <View
                  key={item.id}
                  style={{
                    borderWidth: 1,
                    borderColor: 'rgba(222,193,129,0.45)',
                    backgroundColor: '#fffdf5',
                    borderRadius: 12,
                    padding: 11,
                    gap: 3,
                  }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#8a6b30' }}>
                    {item.author}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, color: '#4b4740', lineHeight: 20 }}>
                    {item.content}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {tab === 'signed' ? (
          <>
          {/* Add somebody by hand — "add my dad to the newsletter" */}
          <View style={{ flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' }}>
            {/* The ink here was cream on a white field — invisible. You could
                type an address into this box and never see a letter of it, on
                the one form that adds somebody to the mailing list. Same bug
                the invite field below already had fixed. */}
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="their@email.com"
              placeholderTextColor={FIELD.placeholder}
              selectionColor={FIELD.ink}
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                flex: 1, fontFamily: 'Lato_400Regular', fontSize: 13, color: FIELD.ink,
                backgroundColor: FIELD.fill, borderWidth: 1, borderColor: FIELD.border,
                borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
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
          </>
          ) : null}
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
/**
 * The meeting-day surfaces, which all belong to exactly one HIVE.
 *
 * They were moved off Admin onto the Meetings tab on 2026-08-01 because they
 * are what you reach for on meeting day rather than settings you configure —
 * and then Admin could only point at them with a sentence, because Admin is
 * reached from HIVE-Wide and Meetings is hidden at HIVE-Wide. Naming the HIVE
 * first, as a tab, is what makes them linkable again.
 */
// The newsletter is NOT in here (Nat 2026-08-04: "we only want it in one spot,
// the newsletter box").
//
// It was duplicated — once here and once in the Newsletter panel — and the copy
// here was the wrong one on the merits as well. There is ONE Buzz across all the
// HIVEs; that is why The Buzz lives at HIVE-Wide and nowhere else. Hanging a
// "Newsletter draft" inside OG's folder said OG has a newsletter of its own,
// beside Tech's and Production's, which is the opposite of what it is.
//
// Everything left in this list genuinely belongs to exactly one HIVE.
const HIVE_TOOLS: { route: string; emoji: string; label: string; hint: string }[] = [
  { route: '/meeting-helper', emoji: '🗓️', label: 'Meeting Helper', hint: 'Run the meeting, live' },
  { route: '/monthly-tuneup', emoji: '🔧', label: 'Monthly Tune-up', hint: 'The check-in everyone fills in' },
];

export function HiveMemberPanels({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
  HeaderAction,
  orderFrom = ADMIN_PANEL_ORDER.hives,
  onOpenCheckIns,
}: PanelChrome & {
  HeaderAction: React.ComponentType<{ label: string; onPress: () => void }>;
  orderFrom?: number;
  /** Opens the check-in editor on the Admin screen, for whichever HIVE is current. */
  onOpenCheckIns?: () => void;
}) {
  const { memberships, communityId, switchCommunity } = useAuth();
  const router = useRouter();

  // Every tool link switches into the HIVE first, then opens the page. Without
  // the switch you would land on whichever HIVE you were last in and see its
  // numbers under another HIVE's name — the exact confusion the tabs exist to
  // remove.
  const openToolInHive = useCallback(async (targetId: string, route: string) => {
    if (targetId !== communityId) await switchCommunity(targetId);
    router.push({ pathname: route as any, params: { from: 'admin' } });
  }, [communityId, switchCommunity, router]);

  // Check-in questions live in a modal on this very screen, so there is nowhere
  // to navigate TO — routing to /admin from /admin is why both of these rows did
  // nothing at all when Nat pressed them (2026-08-04). The editor also only ever
  // holds one HIVE's surveys, which is the real reason the old panel told you to
  // "pick a HIVE in the rail first". So: switch into the HIVE, then hand Admin a
  // flag it acts on once that HIVE's surveys have loaded.
  const openCheckInsForHive = useCallback(async (targetId: string) => {
    if (targetId !== communityId) await switchCommunity(targetId);
    onOpenCheckIns?.();
  }, [communityId, switchCommunity, onOpenCheckIns]);
  const [byHive, setByHive] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  // Which view each HIVE's folder is showing. Per HIVE, so opening Tech's
  // check-ins does not also flip OG's box to check-ins.
  const [tabFor, setTabFor] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [sending, setSending] = useState(false);
  // Invites waiting on an answer, per HIVE. Same shape as the members above,
  // for the same reason: this panel draws every HIVE at once, so nothing here
  // can hang off "the HIVE you're currently in".
  const [invitesByHive, setInvitesByHive] = useState<Record<string, PendingInvite[]>>({});
  const [confirmRevoke, setConfirmRevoke] = useState<{ invite: PendingInvite; hiveName: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

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

    // Who has been invited and hasn't walked in yet. Only admins may read the
    // invite table at all, so we ask about the HIVEs where you are one — every
    // HIVE on the screen in a single question, rather than one query each.
    const adminIds = memberships.filter((m) => m.role === 'admin').map((m) => m.community_id);
    const nextInvites: Record<string, PendingInvite[]> = {};
    adminIds.forEach((id) => { nextInvites[id] = []; });

    if (adminIds.length > 0) {
      const { data } = await supabase
        .from('community_invites')
        .select('id, community_id, email, role, created_at, expires_at')
        .in('community_id', adminIds)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });

      newestInvitePerEmail((data ?? []) as PendingInvite[]).forEach((invite) => {
        const bucket = nextInvites[invite.community_id];
        if (!bucket) return;
        // Somebody who has since joined is a member, not an invitation. Their
        // old row just never got tidied up, and listing it would tell you to
        // chase a person who is already sitting in the room.
        const joined = (next[invite.community_id] ?? [])
          .some((r) => r.email.trim().toLowerCase() === invite.email.trim().toLowerCase());
        if (!joined) bucket.push(invite);
      });
    }

    setInvitesByHive(nextInvites);
    setLoading(false);
  }, [memberships]);

  useEffect(() => { void load(); }, [load]);

  // The same edge function the HIVE you're in uses, told which HIVE to invite
  // into. It checks you're an admin of that one before it sends, which is why
  // the button only appears where you are.
  const sendInvite = async (targetId: string, hiveName: string) => {
    const email = inviteEmail.trim();
    if (!EMAIL.test(email)) {
      showAlert('That address looks off', 'Check it and try again.');
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
      showAlert(
        data?.reusedInvite ? 'Invite refreshed' : 'Invite sent',
        data?.reusedInvite
          ? `${email} already had an invite waiting for ${hiveName}, so we sent the link again.`
          : `${email} will get an invite to ${hiveName}.`
      );
    } catch (err) {
      showAlert('Could not send that invite', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  // Taking the invitation back. Deleting the row is what kills the link: the
  // sign-up screen looks the token up in this table and finds nothing.
  //
  // The community_id in the delete is not decoration — it is the same filter
  // the rules check, so an id from one HIVE can never reach into another's.
  const revokeInvite = async () => {
    if (!confirmRevoke || revoking) return;
    const { invite } = confirmRevoke;

    setRevoking(true);
    const { data, error } = await supabase
      .from('community_invites')
      .delete()
      .eq('id', invite.id)
      .eq('community_id', invite.community_id)
      .select();
    setRevoking(false);
    setConfirmRevoke(null);

    if (error) {
      showAlert('Could not revoke that invite', error.message);
      return;
    }
    if (!data || data.length === 0) {
      showAlert(
        'Nothing was revoked',
        'That invite is already gone, or you are not an admin of this HIVE.'
      );
      return;
    }
    await load();
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
        const tab = tabFor[m.community_id] ?? 'members';
        const invites = invitesByHive[m.community_id] ?? [];

        return (
          <View key={m.community_id} style={[cellStyle, { order: orderFrom + index * 2 } as any]}>
            <Panel
              title={name}
              tabs={[
                { key: 'members', label: `Members (${rows.length})` },
                { key: 'tools', label: 'Meeting tools' },
                { key: 'checkins', label: 'Check-ins' },
              ]}
              activeTab={tab}
              onTabChange={(key: string) => setTabFor((prev) => ({ ...prev, [m.community_id]: key }))}
              accent={accent}
              style={panelStyle}
              bodyStyle={bodyStyle}
              // On every tab, not just Members (Nat 2026-08-04: "we want to make
              // sure each one of these has the 'add new member' button"). It is
              // an action on the HIVE, and hiding it behind a tab made it look
              // as though only some HIVEs could take new people.
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
                {/* MEETING TOOLS, for this HIVE.
                    They used to live in a panel of their own that could not name
                    a HIVE — so it said "pick a HIVE in the rail first", from a
                    page the rail cannot reach a HIVE from. Here the HIVE is
                    already chosen: every link switches into it on the way. */}
                {tab === 'tools' ? (
                  <View style={{ paddingVertical: 6 }}>
                    {HIVE_TOOLS.map((tool) => (
                      <Pressable
                        key={tool.route}
                        onPress={() => void openToolInHive(m.community_id, tool.route)}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingHorizontal: 14, paddingVertical: 11,
                          backgroundColor: pressed ? skin.inset : 'transparent',
                          borderBottomWidth: 1, borderBottomColor: skin.hairline,
                        })}
                      >
                        <Text style={{ fontSize: 15 }}>{tool.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#F6F4E5' }}>
                            {tool.label}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(246,244,229,0.55)' }}>
                            {tool.hint}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color="rgba(246,244,229,0.5)" />
                      </Pressable>
                    ))}
                  </View>
                ) : tab === 'checkins' ? (
                  <View style={{ paddingVertical: 6 }}>
                    <Pressable
                      onPress={() => void openCheckInsForHive(m.community_id)}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 14, paddingVertical: 11,
                        backgroundColor: pressed ? skin.inset : 'transparent',
                        borderBottomWidth: 1, borderBottomColor: skin.hairline,
                      })}
                    >
                      <Text style={{ fontSize: 15 }}>📊</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#F6F4E5' }}>
                          Check-in questions &amp; responses
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(246,244,229,0.55)' }}>
                          What {name} is asked each month, and what they said
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={15} color="rgba(246,244,229,0.5)" />
                    </Pressable>
                    <Text
                      style={{
                        fontFamily: 'Lato_400Regular', fontSize: 12,
                        color: 'rgba(246,244,229,0.5)', padding: 14, lineHeight: 18,
                      }}
                    >
                      Each HIVE gets its own questions, so {name} can be asked something
                      the others are not.
                    </Text>
                  </View>
                ) : (
                <>
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
                      // The hint was cream too, at barely a third strength, so
                      // the box looked empty of everything including its own
                      // prompt. It takes the same muted gold-brown as the
                      // placeholder in every other box in the app.
                      placeholderTextColor={FIELD.placeholder}
                      selectionColor={FIELD.ink}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!sending}
                      style={{
                        // Cream ink on a white field is invisible. It read as
                        // an empty box you could type into and never see, on
                        // the one form that sends somebody an email.
                        //
                        // The edge stays in this HIVE's own colour: inside a
                        // purple panel the purple hairline does the job the gold
                        // one does on a cream page.
                        fontFamily: 'Lato_400Regular', fontSize: 13, color: FIELD.ink,
                        backgroundColor: FIELD.fill, borderWidth: 1, borderColor: skin.border,
                        borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
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
                        <ThinkingBee />
                      ) : null}
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#fffdf5' }}>
                        {sending ? 'Sending Invite' : 'Send Invite'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {loading && rows.length === 0 ? (
                  <ActivityIndicator size="small" color="#fffdf5" />
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

                {/* INVITED, NOT JOINED YET.
                    Nat 2026-08-04: "I want to see who I've already invited &
                    just see that their membership is pending" — and be able to
                    take one back from this same box. Admins only, because only
                    an admin is allowed to read this table at all. */}
                {m.role === 'admin' && !loading ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: skin.border, marginTop: 4 }}>
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 1,
                        textTransform: 'uppercase', color: 'rgba(246,244,229,0.65)',
                        paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4,
                      }}
                    >
                      Invited, not joined yet{invites.length > 0 ? ` (${invites.length})` : ''}
                    </Text>

                    {invites.length === 0 ? (
                      // One quiet line rather than an empty box, so nothing is
                      // waiting on an answer reads as an answer.
                      <Text
                        style={{
                          fontFamily: 'Lato_400Regular', fontSize: 12,
                          color: 'rgba(246,244,229,0.5)', paddingHorizontal: 14, paddingBottom: 14,
                        }}
                      >
                        Nobody has an invite waiting for {name}.
                      </Text>
                    ) : invites.map((invite) => {
                      const expired = inviteHasExpired(invite);
                      return (
                        <View
                          key={invite.id}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 14, paddingVertical: 10,
                            borderTopWidth: 1, borderTopColor: skin.hairline,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#F6F4E5' }}>
                              {invite.email}
                            </Text>
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(246,244,229,0.55)' }}>
                              Invited as {invite.role} · sent {sentWhen(invite.created_at)}
                            </Text>
                          </View>

                          {/* Pending and expired are different states and are
                              coloured differently. An expired invite's link is
                              already dead — saying "pending" would send you off
                              waiting for somebody who cannot get in. */}
                          <View
                            style={{
                              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                              backgroundColor: expired ? 'rgba(192,82,63,0.28)' : 'rgba(255,255,255,0.09)',
                            }}
                          >
                            <Text style={{
                              fontFamily: 'Lato_700Bold', fontSize: 9.5, letterSpacing: 0.7,
                              textTransform: 'uppercase',
                              color: expired ? '#f4c4b8' : 'rgba(246,244,229,0.6)',
                            }}>
                              {expired ? 'expired' : 'pending'}
                            </Text>
                          </View>

                          <Pressable
                            onPress={() => setConfirmRevoke({ invite, hiveName: name })}
                            hitSlop={6}
                            accessibilityLabel={`Revoke the invite for ${invite.email}`}
                            style={({ pressed }) => ({
                              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                              borderWidth: 1, borderColor: 'rgba(246,244,229,0.28)',
                              backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent',
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: 'rgba(246,244,229,0.8)' }}>
                              Revoke
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}

                    {invites.some(inviteHasExpired) ? (
                      <Text
                        style={{
                          fontFamily: 'Lato_400Regular', fontSize: 11, lineHeight: 16,
                          color: 'rgba(246,244,229,0.5)', paddingHorizontal: 14, paddingVertical: 10,
                        }}
                      >
                        An expired link no longer works. Send that person a new invite with
                        &ldquo;+ New Member&rdquo; — it refreshes the one they already have.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                </>
                )}
              </ScrollView>
            </Panel>
          </View>
        );
      })}

      {/* One dialog for all the HIVEs — whichever Revoke you pressed fills it
          in. `Alert.alert` is not an option here: in a browser it does nothing
          at all, so the question would never appear and the invite would never
          go anywhere. */}
      <ConfirmDialog
        visible={!!confirmRevoke}
        title="Revoke this invite?"
        body={confirmRevoke
          ? `${confirmRevoke.invite.email} will not be able to join ${confirmRevoke.hiveName} with the link we emailed them. You can invite them again any time.`
          : undefined}
        confirmLabel={revoking ? 'Revoking…' : 'Revoke it'}
        destructive
        onConfirm={() => { void revokeInvite(); }}
        onCancel={() => { if (!revoking) setConfirmRevoke(null); }}
      />
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

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { HIVE_GOLD, accentOnDark, accentWash, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateMedium } from '../../lib/dateUtils';
// Admin is seen from the cosmos wherever the reader belongs, so the boxes in
// here take the space skin's ink rather than asking `usePageSkin()`.
import { SPACE_SKIN } from '../../lib/pageSkin';
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

const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'member', label: 'Member', hint: 'Everything a HIVE is for' },
  { value: 'treasurer', label: 'Treasurer', hint: 'Looks after the Honey Pot' },
  { value: 'admin', label: 'Admin', hint: 'Invites, roles and the settings' },
];

/**
 * What somebody is, in their HIVE's own colour.
 *
 * These were grey pills, in all three boxes, so Tech HIVE's ADMIN and OG HIVE's
 * ADMIN looked like the same fact about the same place (Nat 2026-08-06). The
 * panel already knows whose box it is drawing, so the chip may as well say it.
 *
 * The lettering goes through `accentOnDark` because these sit on a dark panel:
 * Tech's #2f4a63 as ink on near-black is about 1.9:1, which is a word nobody
 * can read. Admin carries the most colour and member the least, so the row
 * still sorts itself by weight before anybody reads a word.
 */
function RoleChip({ accent, role }: { accent: string; role: string }) {
  const fill = role === 'admin' ? 0.32 : role === 'treasurer' ? 0.24 : 0.14;
  const edge = role === 'member' ? 0.34 : 0.62;
  return (
    <View
      style={{
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
        backgroundColor: accentWash(accent, fill),
        borderWidth: 1, borderColor: accentWash(accent, edge),
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_700Bold', fontSize: 9.5, letterSpacing: 0.7,
          textTransform: 'uppercase', color: accentOnDark(accent),
        }}
      >
        {role}
      </Text>
    </View>
  );
}

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
 * Where each box sits on the Admin dashboard, in the order Nat reaches for them.
 *
 * Nat 2026-08-03: "meeting helpers & surveys in the first box, cos that is what
 * I use the most, 2nd would be newsletter drafter & signups & then the other
 * hives below that."
 *
 * Nat 2026-08-06, from her phone: Surveys, then Newsletter, then the HIVEs —
 * and then, later the same day, the Surveys box itself went (see admin.tsx for
 * her words). So: 1 Newsletter, 2 onwards the HIVEs in membership order.
 *
 * The numbers used to skip — HIVEs on 1, 3, 5 and the tools on 2 and 4 — to
 * satisfy a different request from the same week ("left hand side, top to bottom
 * should go OG HIVE, Tech HIVE, Production HIVE, and on the right it should be
 * Meeting tools and newsletter"). The dashboard wraps half-width cells
 * left-to-right, so odd positions land in the left column and even ones in the
 * right, and interleaving was the only way to describe a column split.
 *
 * A column split and a ranking are two different ideas and one sequence cannot
 * hold both. On a phone there is one column, so the interleave read as OG HIVE,
 * Surveys, Tech HIVE, Newsletter, Production HIVE — the ranking shredded. The
 * ranking wins, because it is what she asked for twice. On a wide screen it now
 * puts the Newsletter first and the HIVEs after it, which still reads
 * top-down in importance.
 */
export const ADMIN_PANEL_ORDER = {
  newsletter: 1,
  hives: 2,
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

/**
 * The two rules a folder is ruled with, whether or not it belongs to a HIVE.
 *
 * A HIVE's box got these from `hivePanelSkin` and the Newsletter box had its
 * own gold-on-cream version, which is part of why Nat read them
 * as a different species (2026-08-06). Both kinds are dark panes now, so both
 * take the same two lines: `HAIRLINE` between rows, `INSET` for a row being
 * pressed or a section pushed slightly into the sheet.
 */
export const PANEL_HAIRLINE = 'rgba(255,255,255,0.11)';
export const PANEL_INSET = 'rgba(255,255,255,0.07)';

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
    hairline: PANEL_HAIRLINE,
    inset: PANEL_INSET,
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
  /**
   * Writing it is a tab too, now.
   *
   * Nat, 2026-08-06: "I just think we need to move the 'write this months
   * newsletter' into it's own tab." It was a full-width banner pinned above the
   * tab row, so it stayed on screen whichever tab you were reading — one job
   * shouting over the other two instead of standing beside them.
   *
   * The box opens on Shout-outs rather than Write, because what the box is FOR
   * on arrival is showing you what members have asked to have mentioned. Write
   * is where you go once you've read them.
   */
  const [tab, setTab] = useState<'write' | 'shoutouts' | 'signed'>('shoutouts');
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
      {/* Real tabs, the same ones every HIVE box wears.
          Nat, 2026-08-05: "These were supposed to be tabs, more like this" —
          with a screenshot of the OG HIVE folder tabs. `Panel` has taken a
          `tabs` prop all along; the pills were a second way of doing something
          the component already did, which is the drift this whole day has been
          about. */}
      <Panel
        title="Newsletter"
        tabs={[
          { key: 'shoutouts', label: `Shout-outs (${shoutOuts.length})` },
          // The draft quotes members before Nat has chosen what stays in, so
          // the tab itself is hers alone. Anyone else never sees the door.
          ...(profile?.is_owner ? [{ key: 'write', label: 'Write this month’s' }] : []),
          { key: 'signed', label: `Signed up (${active.length})` },
        ]}
        activeTab={tab}
        onTabChange={(key: string) => setTab(key as 'write' | 'shoutouts' | 'signed')}
        // No action tab. This box's one "do it" is writing the draft, and Nat
        // made that a tab on 2026-08-06 — so the folder's edge already carries
        // it, and a gold pill saying the same word twice would be the pill she
        // asked to get rid of, wearing a new hat.
        style={panelStyle}
        bodyStyle={bodyStyle}
      >
        <ScrollView style={scrollStyle} nestedScrollEnabled showsVerticalScrollIndicator>
          {tab === 'write' && profile?.is_owner ? (
            <View>
              {/* Drawn like the tool rows inside a HIVE's folder — same gap, same
                  two weights, same chevron — because it is the same kind of row:
                  a door out of the box onto a page of its own. */}
              <Pressable
                onPress={() => router.push({ pathname: '/newsletter', params: { from: 'admin' } } as any)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  borderBottomWidth: 1,
                  borderBottomColor: PANEL_HAIRLINE,
                  backgroundColor: pressed ? PANEL_INSET : 'transparent',
                })}
              >
                <Ionicons name="create-outline" size={18} color={SPACE_SKIN.gold} />
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: SPACE_SKIN.ink, flex: 1 }}>
                  Write this month&rsquo;s newsletter
                </Text>
                <Ionicons name="chevron-forward" size={15} color={SPACE_SKIN.inkSoft} />
              </Pressable>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.inkSoft,
                  lineHeight: 19, padding: 14,
                }}
              >
                The draft opens on its own page, where you shape it and post it.
                {shoutOuts.length > 0
                  ? ` The ${shoutOuts.length} ${shoutOuts.length === 1 ? 'thing' : 'things'} members have asked to have mentioned are in Shout-outs — worth reading before you start.`
                  : ' Anything members ask to have mentioned shows up in Shout-outs.'}
              </Text>
            </View>
          ) : null}

          {tab === 'shoutouts' ? (
            <View style={{ padding: 12, gap: 8 }}>
              {shoutOuts.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.inkSoft, lineHeight: 19 }}>
                  Nobody has asked for a mention yet. What members add to the
                  newsletter thread lands here, and goes into the draft.
                </Text>
              ) : shoutOuts.map((item) => (
                <View
                  key={item.id}
                  style={{
                    borderWidth: 1,
                    borderColor: SPACE_SKIN.border,
                    backgroundColor: SPACE_SKIN.card,
                    borderRadius: 12,
                    padding: 11,
                    gap: 3,
                  }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: SPACE_SKIN.gold }}>
                    {item.author}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, color: SPACE_SKIN.inkBody, lineHeight: 20 }}>
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
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.inkSoft, paddingHorizontal: 14, paddingBottom: 14 }}>
              Nobody outside the HIVEs is subscribed yet. Members get it automatically.
            </Text>
          ) : active.map((sub) => (
            <View
              key={sub.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 14, paddingVertical: 10,
                borderTopWidth: 1, borderTopColor: PANEL_HAIRLINE,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.ink }}>
                  {sub.email}
                </Text>
                {sub.name ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: SPACE_SKIN.inkSoft }}>{sub.name}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => removeSubscriber(sub)}
                hitSlop={8}
                accessibilityLabel={`Remove ${sub.email}`}
              >
                <Ionicons name="close-circle-outline" size={19} color={SPACE_SKIN.inkSoft} />
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
 * Admin owns people and check-in configuration. Meeting Helper deliberately
 * stays in each HIVE's Meetings navigation instead of being duplicated here
 * (Nat 2026-08-07).
 */
/**
 * The check-ins a HIVE runs, and when each one goes out.
 *
 * The two live ones are what `supabase/functions/check-in-reminder` actually
 * fires, checked 2026-08-06:
 *   - three days before the meeting date, with a last call on the day itself to
 *     whoever has not answered (`REMINDER_WINDOW_DAYS = 3`, kinds `window` and
 *     `day_of`)
 *   - the third-to-last day of the month, so there are three days to add
 *     something before the newsletter goes out on the 1st
 *     (`NEWSLETTER_LEAD_DAYS = 3`, kind `midpoint`)
 *
 * The two send different things and their answers land in different places,
 * which is worth knowing before anybody goes looking. The pre-meeting one files
 * a survey response — that is what the row above opens. The month-end one walks
 * a member through the newsletter, their to-dos and HIVE Help, and posts to the
 * boards; its shout-outs surface in the Newsletter box, which is where Nat is
 * standing when she needs them (`monthly-tuneup.tsx`, `isMidpoint`).
 *
 * The quarter and the year are Nat's, 2026-08-06: *"check-ins should show the 3
 * days before the meeting, 3 days before the newsletter & 3 days before the end
 * of the quarter & 3 days before the end of the year."* Nothing sends those —
 * no survey, no cron, no table — so they are listed in italics and say so. She
 * asked to see the shape of the year, and a line that quietly looked live would
 * have her waiting on answers that never come.
 */
const CHECK_IN_SCHEDULE: {
  when: string;
  what: string;
  live: boolean;
  actionLabel?: string;
  mode?: 'midpoint';
}[] = [
  {
    when: 'Three days before the meeting',
    what: 'open the monthly tune-up',
    live: true,
    actionLabel: 'Test or fill out the monthly check-in',
  },
  {
    when: 'The last three days of the month',
    what: 'shout-outs for the newsletter',
    live: true,
    actionLabel: 'Test or fill out the halfway check-in',
    mode: 'midpoint',
  },
  { when: 'Three days before the quarter ends', what: 'coming soon', live: false },
  { when: 'Three days before the year ends', what: 'coming soon', live: false },
];

export function HiveMemberPanels({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
  orderFrom = ADMIN_PANEL_ORDER.hives,
  onOpenCheckIns,
}: PanelChrome & {
  orderFrom?: number;
  /** Opens the check-in editor on the Admin screen, for whichever HIVE is current. */
  onOpenCheckIns?: () => void;
}) {
  const { memberships, communityId, switchCommunity, profile, refreshProfile } = useAuth();
  const router = useRouter();

  // The member-facing check-ins are shared routes, so switch into the HIVE
  // named on this folder before opening them. This restores the old ability to
  // walk/test the real flow without making a second admin-only survey preview.
  const openMemberCheckIn = useCallback(async (targetId: string, mode?: 'midpoint') => {
    if (targetId !== communityId) await switchCommunity(targetId);
    router.push({
      pathname: '/monthly-tuneup',
      params: { from: 'admin', ...(mode ? { mode } : {}) },
    } as any);
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
  /**
   * Managing somebody who has already walked in.
   *
   * Nat, 2026-08-06: "I added 'thenateffect' to tech hive, but now i cant
   * revoke access or change them to admin or treasurer, i need to be able to do
   * that from my admin site." A pending invite had a Revoke button and a joined
   * member had a chip and nothing else, so the moment somebody accepted they
   * became unmanageable.
   *
   * The open row is keyed by HIVE **and** person, because the same face can sit
   * in three boxes on this screen and opening her in Tech must not also open her
   * in OG.
   */
  const [managing, setManaging] = useState<string | null>(null);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<
    { hiveId: string; hiveName: string; row: Row; isSelf: boolean } | null
  >(null);
  const [removing, setRemoving] = useState(false);

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

  /**
   * Make somebody a member, a treasurer or an admin — of THIS HIVE.
   *
   * The role lives on the `community_memberships` row, one row per person per
   * HIVE, so this is the whole reason both filters are on the write: changing
   * what somebody is in Tech HIVE leaves what they are in OG HIVE alone.
   *
   * The database agrees: the UPDATE rule on that table is
   * `is_community_admin(community_id)`, which is true for an admin of that HIVE
   * and for Nat and Lucas everywhere (checked against live `pg_policies`,
   * 2026-08-06). Nothing here needs a migration.
   */
  const changeRole = async (hiveId: string, hiveName: string, row: Row, next: UserRole) => {
    const key = `${hiveId}:${row.id}`;
    if (savingRow || row.role === next) return;

    setSavingRow(key);
    const { data, error } = await supabase
      .from('community_memberships')
      .update({ role: next })
      .eq('community_id', hiveId)
      .eq('user_id', row.id)
      .select();
    setSavingRow(null);

    if (error) {
      showAlert('Could not change that', error.message);
      return;
    }
    // An empty answer means the rules let the write run and then found no row
    // it was allowed to touch. Saying nothing here is how "the button does
    // nothing" happens.
    if (!data || data.length === 0) {
      showAlert(
        'Nothing changed',
        `${row.name} is no longer in ${hiveName}, or you are not an admin of it.`
      );
      await load();
      return;
    }

    await load();
    // Your own badge is drawn from the rail's copy of your memberships, so it
    // has to be told when you change your own.
    if (row.id === profile?.id) await refreshProfile();
  };

  /**
   * Take somebody out of one HIVE.
   *
   * Deleting the membership row is the whole of it — everything in the app asks
   * that table who belongs where. Their profile, and every other HIVE they are
   * in, is untouched.
   */
  const removeMember = async () => {
    if (!confirmRemove || removing) return;
    const { hiveId, hiveName, row, isSelf } = confirmRemove;

    setRemoving(true);
    const { data, error } = await supabase
      .from('community_memberships')
      .delete()
      .eq('community_id', hiveId)
      .eq('user_id', row.id)
      .select();
    setRemoving(false);
    setConfirmRemove(null);

    if (error) {
      showAlert('Could not remove them', error.message);
      return;
    }
    if (!data || data.length === 0) {
      showAlert(
        'Nobody was removed',
        `${row.name} is already out of ${hiveName}, or you are not an admin of it.`
      );
      await load();
      return;
    }

    setManaging(null);
    await load();
    if (isSelf) await refreshProfile();
  };

  return (
    <>
      {/* EVERY HIVE, including the one you happen to be standing in.
          It used to skip the current one, because admin.tsx drew that one
          itself — which is exactly why they didn't match: two bits of code
          drawing the same idea, one with role buttons and a purple wash, the
          other with cream and a tiny word. Nat spotted it side by side
          ("see how these don't"). One list now, drawn once.

          In membership order, after the Newsletter. The old note
          here described the interleaved grid — HIVEs on the odd positions, the
          cross-HIVE boxes on the even ones — which ADMIN_PANEL_ORDER retired on
          2026-08-06; see the comment on it for why a column split and a ranking
          could not both live in one sequence. */}
      {memberships.map((m, index) => {
        const rows = byHive[m.community_id] ?? [];
        const accent = hiveAccent(m.community);
        const skin = hivePanelSkin(accent);
        const name = hiveDisplayName(m.community?.name);
        const inviting = inviteFor === m.community_id;
        const tab = tabFor[m.community_id] ?? 'members';
        const invites = invitesByHive[m.community_id] ?? [];
        // Who is allowed to change what people are here. An admin of this HIVE,
        // and Nat and Lucas anywhere — which is exactly what the database's own
        // rule says, so the buttons and the rules agree rather than one of them
        // quietly failing.
        const canManage = m.role === 'admin' || !!profile?.is_owner;
        // The one person whose badge cannot come off. A HIVE with no admin has
        // nobody who can invite, nobody who can hand the job to anyone else, and
        // no way back without somebody going into the database by hand.
        const admins = rows.filter((r) => r.role === 'admin');
        const soleAdminId = admins.length === 1 ? admins[0].id : null;

        return (
          // One after another, no gaps. The HIVEs used to take every other
          // position so the two cross-HIVE boxes could sit between them in the
          // right-hand column; they follow the Newsletter now.
          <View key={m.community_id} style={[cellStyle, { order: orderFrom + index } as any]}>
            <Panel
              title={name}
              // Short labels, because the whole row has to fit the folder's top
              // edge on a phone. Meeting Helper lives in the HIVE's Meetings
              // navigation, not on this Admin folder.
              tabs={[
                { key: 'members', label: `Members (${rows.length})` },
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
              //
              // It is a tab on the folder now rather than a cream pill floating
              // beside it — Nat, 2026-08-06: "I think it should just be another
              // coloured tab on the folder." The panel draws it, in the house
              // gold every "do it" button wears, so it can never look like one of
              // the places you can be standing.
              action={m.role === 'admin' ? {
                label: inviting ? 'Close Invite' : '+ New Member',
                onPress: () => {
                  setInviteEmail('');
                  setInviteRole('member');
                  if (inviting) {
                    setInviteFor(null);
                    return;
                  }
                  // The form lives in Members. Moving there in the same press
                  // makes the action visibly answer instead of changing hidden
                  // state while Check-ins is still on screen.
                  setTabFor((prev) => ({ ...prev, [m.community_id]: 'members' }));
                  setInviteFor(m.community_id);
                },
              } : undefined}
            >
              <ScrollView style={scrollStyle} nestedScrollEnabled showsVerticalScrollIndicator>
                {tab === 'checkins' ? (
                  /* THE CHECK-INS THIS HIVE RUNS.
                     One door, then the shape of the year underneath it.

                     Nat asked for an Answers tab too — *"we could have an
                     'answer' tab that populates with all of those things?"*,
                     phrased as a question, so: both sets of answers already have
                     a door, and each door is where the answers get used. The
                     pre-meeting check-in's are in the sheet this row opens,
                     grouped by month with the POP readout on top. The month-end
                     one's are shout-outs, and they are in the Newsletter box —
                     the screen Nat is on when she writes the newsletter they
                     were collected for. An Answers tab would be a third door
                     onto those two rooms, on the morning whose whole job was
                     taking doors away. So this row says "answers" out loud, and
                     the line below names where the shout-outs go. */
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
                          Questions &amp; answers
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(246,244,229,0.55)' }}>
                          The meeting check-in, and what {name} said
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={15} color="rgba(246,244,229,0.5)" />
                    </Pressable>

                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 0.9,
                        textTransform: 'uppercase', color: 'rgba(246,244,229,0.6)',
                        paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6,
                      }}
                    >
                      When they go out
                    </Text>
                    {CHECK_IN_SCHEDULE.map((step) => {
                          const content = (
                            <>
                              <View
                                style={{
                                  width: 6, height: 6, borderRadius: 3, marginTop: 5,
                                  backgroundColor: step.live ? accent : 'transparent',
                                  borderWidth: step.live ? 0 : 1,
                                  borderColor: 'rgba(246,244,229,0.45)',
                                }}
                              />
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    fontFamily: step.live ? 'Lato_700Bold' : 'Lato_400Regular',
                                    fontSize: 12, lineHeight: 17,
                                    fontStyle: step.live ? 'normal' : 'italic',
                                    color: step.live ? '#F6F4E5' : 'rgba(246,244,229,0.45)',
                                  }}
                                >
                                  {step.when}
                                  <Text style={{ color: 'rgba(246,244,229,0.5)' }}> · {step.what}</Text>
                                </Text>
                                {step.actionLabel ? (
                                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10.5, color: 'rgba(246,244,229,0.55)', marginTop: 1 }}>
                                    {step.actionLabel}
                                  </Text>
                                ) : null}
                              </View>
                              {step.actionLabel ? (
                                <Ionicons name="chevron-forward" size={14} color="rgba(246,244,229,0.5)" />
                              ) : null}
                            </>
                          );

                          return step.actionLabel ? (
                            <Pressable
                              key={step.when}
                              onPress={() => void openMemberCheckIn(m.community_id, step.mode)}
                              accessibilityRole="button"
                              accessibilityLabel={step.actionLabel}
                              style={({ pressed }) => ({
                                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                                paddingHorizontal: 14, paddingVertical: 9,
                                backgroundColor: pressed ? skin.inset : 'transparent',
                              })}
                            >
                              {content}
                            </Pressable>
                          ) : (
                            <View
                              key={step.when}
                              style={{
                                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                                paddingHorizontal: 14, paddingVertical: 5,
                              }}
                            >
                              {content}
                            </View>
                          );
                        })}
                    <View style={{ height: 10 }} />
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
                ) : rows.map((r) => {
                  const rowKey = `${m.community_id}:${r.id}`;
                  const open = managing === rowKey;
                  const busy = savingRow === rowKey;
                  const onlyAdmin = soleAdminId === r.id;
                  const isSelf = r.id === profile?.id;

                  return (
                  <View
                    key={r.id}
                    style={{ borderBottomWidth: 1, borderBottomColor: skin.hairline }}
                  >
                  <View
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 14, paddingVertical: 10,
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
                        read either as a member or as something still loading.

                        The chip is also the way in: press it and the row opens
                        onto what you can change. It was a flat label, which is
                        why a joined member looked like a fact rather than a
                        person you could do something about. */}
                    {canManage ? (
                      <Pressable
                        onPress={() => setManaging(open ? null : rowKey)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        accessibilityLabel={`${r.name} is ${r.role} in ${name}. Change their role, or remove them.`}
                        hitSlop={6}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          opacity: pressed || busy ? 0.7 : 1,
                        })}
                      >
                        <RoleChip accent={accent} role={r.role} />
                        <Ionicons
                          name={open ? 'chevron-up' : 'chevron-down'}
                          size={13}
                          color="rgba(246,244,229,0.6)"
                        />
                      </Pressable>
                    ) : (
                      <RoleChip accent={accent} role={r.role} />
                    )}
                  </View>

                  {/* WHAT YOU CAN DO ABOUT THIS PERSON.
                      Opened from their chip, so the controls sit under the name
                      they belong to — in a half-width box there is nowhere to
                      put three role buttons and a Remove on one line without
                      them wrapping into soup. */}
                  {open && canManage ? (
                    <View
                      style={{
                        paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12, gap: 8,
                        backgroundColor: skin.inset,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 0.9,
                          textTransform: 'uppercase', color: 'rgba(246,244,229,0.6)',
                          paddingTop: 8,
                        }}
                      >
                        What {r.name} is in {name}
                      </Text>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {ROLES.map((role) => {
                          const chosen = r.role === role.value;
                          // Taking the only admin's badge off leaves the HIVE
                          // with nobody who can run it.
                          const wouldStrand = onlyAdmin && role.value !== 'admin';
                          return (
                            <Pressable
                              key={role.value}
                              onPress={() => void changeRole(m.community_id, name, r, role.value)}
                              disabled={chosen || busy || wouldStrand}
                              accessibilityRole="button"
                              accessibilityLabel={`Make ${r.name} a ${role.label.toLowerCase()} in ${name}. ${role.hint}.`}
                              style={({ pressed }) => ({
                                backgroundColor: chosen ? accent : 'rgba(255,255,255,0.09)',
                                borderRadius: 8,
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                opacity: wouldStrand ? 0.4 : pressed ? 0.8 : busy ? 0.7 : 1,
                              })}
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
                        onPress={() => setConfirmRemove({
                          hiveId: m.community_id, hiveName: name, row: r, isSelf,
                        })}
                        disabled={onlyAdmin || busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${r.name} from ${name}`}
                        style={({ pressed }) => ({
                          alignSelf: 'flex-start',
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                          borderWidth: 1, borderColor: 'rgba(224,140,120,0.55)',
                          backgroundColor: pressed ? 'rgba(192,82,63,0.28)' : 'transparent',
                          opacity: onlyAdmin ? 0.4 : 1,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#f4c4b8' }}>
                          {isSelf ? `Leave ${name}` : `Remove from ${name}`}
                        </Text>
                      </Pressable>

                      {/* Say why, rather than greying two buttons out and
                          leaving somebody pressing them. */}
                      {onlyAdmin ? (
                        <Text
                          style={{
                            fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 17,
                            color: 'rgba(246,244,229,0.62)',
                          }}
                        >
                          {isSelf ? 'You are' : `${r.name} is`} the only admin {name} has, and a
                          HIVE with no admin has nobody who can invite anybody or hand the job on.
                          Make somebody else an admin first, and then this opens up.
                        </Text>
                      ) : (
                        <Text
                          style={{
                            fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 17,
                            color: 'rgba(246,244,229,0.5)',
                          }}
                        >
                          This is about {name} only. Any other HIVE {isSelf ? 'you are' : 'they are'} in
                          stays exactly as it is.
                        </Text>
                      )}
                    </View>
                  ) : null}
                  </View>
                  );
                })}

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
                              waiting for somebody who cannot get in.

                              Neither wears the HIVE's colour, and that is the
                              point: since 2026-08-06 a filled chip in the HIVE's
                              own colour means "this is what they ARE here". An
                              invite is a different kind of fact — somebody
                              outside the door — so it stays an outline in no
                              colour at all. */}
                          <View
                            style={{
                              paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                              borderWidth: 1,
                              borderColor: expired ? 'rgba(224,140,120,0.5)' : 'rgba(246,244,229,0.32)',
                              backgroundColor: expired ? 'rgba(192,82,63,0.28)' : 'transparent',
                            }}
                          >
                            <Text style={{
                              fontFamily: 'Lato_700Bold', fontSize: 9.5, letterSpacing: 0.7,
                              textTransform: 'uppercase',
                              color: expired ? '#f4c4b8' : 'rgba(246,244,229,0.66)',
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

      {/* Taking somebody out of a HIVE. The one thing this has to say plainly is
          how far it reaches: one HIVE, and no further. Somebody in OG and Tech
          who gets removed from Tech still has OG exactly as they left it, and
          nobody should have to guess that before pressing a red button. */}
      <ConfirmDialog
        visible={!!confirmRemove}
        title={confirmRemove
          ? confirmRemove.isSelf
            ? `Leave ${confirmRemove.hiveName}?`
            : `Remove ${confirmRemove.row.name} from ${confirmRemove.hiveName}?`
          : ''}
        body={confirmRemove
          ? confirmRemove.isSelf
            ? `You will lose ${confirmRemove.hiveName} — its members, boards, meetings and messages. This is about ${confirmRemove.hiveName} only; every other HIVE you are in stays exactly as it is, and somebody there can invite you back any time.`
            : `${confirmRemove.row.name} will lose ${confirmRemove.hiveName} — its members, boards, meetings and messages. This is about ${confirmRemove.hiveName} only; any other HIVE they are in stays exactly as it is, and you can invite them back any time.`
          : undefined}
        confirmLabel={removing
          ? 'Removing…'
          : confirmRemove?.isSelf ? 'Leave it' : 'Remove them'}
        destructive
        onConfirm={() => { void removeMember(); }}
        onCancel={() => { if (!removing) setConfirmRemove(null); }}
      />
    </>
  );
}

/** Both god-mode boxes at once, in Nat's order, for anyone who wants the pair. */
export function GodModePanels(props: PanelChrome) {
  return (
    <>
      <NewsletterPanel {...props} />
      <HiveMemberPanels {...props} />
    </>
  );
}

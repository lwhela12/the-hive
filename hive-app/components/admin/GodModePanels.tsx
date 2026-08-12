import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { HIVE_GOLD, accentOnDark, accentWash, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateMedium } from '../../lib/dateUtils';
// Admin is seen from the cosmos wherever the reader belongs, so the boxes in
// here take the space skin's ink rather than asking `usePageSkin()`.
import { SPACE_SKIN } from '../../lib/pageSkin';
import { showAlert } from '../../lib/showAlert';
import { CHECK_INS_COMING_SOON_MESSAGE, hasTailoredCheckIns } from '../../lib/checkIns';
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

/** An issue of The Buzz, with whatever the send log knows about it. */
type NewsletterIssue = {
  id: string;
  title: string;
  visibility: string | null;
  created_at: string;
  sentAt: string | null;
  sentCount: number;
};

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

/** Somebody who asked to be told when a HIVE opens (migration 168). */
type WaitlistRow = {
  id: string;
  email: string;
  name: string | null;
  message: string | null;
  interested_in: string | null;
  status: string;
  created_at: string;
};

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

/** What the invite function answers with since 2026-08-11. */
type InviteFunctionResult = {
  reusedInvite?: boolean;
  /** Whether the email service actually accepted the send. */
  emailSent?: boolean;
  /** Why it did not, in words an admin can act on. */
  emailError?: string | null;
  /** The join link itself, so a failed email still hands the admin the way in. */
  inviteUrl?: string;
};

/**
 * Say what actually happened to the invite email.
 *
 * The invite function used to answer "success" without ever reading the email
 * service's reply, so a refused send looked exactly like a delivered one — and
 * on 2026-08-04 a real invite silently never arrived. It reports the send
 * honestly now. When the email failed, the invite row and its link are still
 * real, so this puts the link on the admin's clipboard and says to pass it on
 * by hand.
 */
async function announceInviteOutcome(data: InviteFunctionResult | null, email: string, hiveName: string) {
  if (data && data.emailSent === false) {
    if (data.inviteUrl) {
      try {
        await Clipboard.setStringAsync(data.inviteUrl);
      } catch {
        // The link is in the message either way — the clipboard is a courtesy.
      }
    }
    showAlert(
      'Invite created, but the email could not be sent',
      `${email} has a live invite to ${hiveName} — the invite email is what failed.`
        + (data.emailError ? `\n\nWhy: ${data.emailError}` : '')
        + (data.inviteUrl
          ? `\n\nTheir invite link is copied to your clipboard, so you can send it to them yourself:\n${data.inviteUrl}`
          : ''),
    );
    return;
  }

  showAlert(
    data?.reusedInvite ? 'Invite refreshed' : 'Invite sent',
    data?.reusedInvite
      ? `${email} already had an invite waiting for ${hiveName}, so we gave the same link a fresh seven days and emailed it again.`
      : `${email} will get an invite to ${hiveName}.`,
  );
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
  const [confirmRemoveSub, setConfirmRemoveSub] = useState<Subscriber | null>(null);
  const [removingSub, setRemovingSub] = useState(false);
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
  /**
   * And a fourth: actually sending it.
   *
   * Until 2026-08-12 there was no way to put an issue in anybody's inbox.
   * Sign-up, the welcome email, unsubscribe and the published archive were
   * all built; the send never was, so The Buzz only ever reached people who
   * went looking for it. Nat, believing it was done: *"we have the sign up
   * button on the public facing site & inside the app, right?"* — she did.
   * That was the half that existed.
   */
  const [tab, setTab] = useState<'write' | 'shoutouts' | 'signed' | 'send'>('shoutouts');
  const [shoutOuts, setShoutOuts] = useState<
    { id: string; content: string; created_at: string; author: string }[]
  >([]);
  const [issues, setIssues] = useState<NewsletterIssue[]>([]);
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<NewsletterIssue | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, name, unsubscribed_at')
      .order('created_at', { ascending: true });
    // A permission error here reads exactly like "nobody has subscribed" if
    // it is thrown away -- that silence is what hid this bug for months.
    if (error) console.error('newsletter_subscribers load failed', error);
    setSubs((data ?? []) as Subscriber[]);

    // What members have actually asked to have mentioned — the replies on the
    // newsletter thread, the same ones the draft harvests.
    const { data: boards } = await supabase
      .from('board_categories')
      .select('id')
      .eq('topic_kind', 'newsletter');
    const boardIds = ((boards ?? []) as { id: string }[]).map((b) => b.id);
    if (boardIds.length === 0) { setShoutOuts([]); setIssues([]); return; }

    // The issues themselves, and what the send log knows about each. Members
    // are counted here too: the send merges `newsletter_subscribers` with
    // every member who has newsletter email switched on, so a count that only
    // showed subscribers would tell Nat "1 person" before mailing twelve.
    const [issueRes, sendRes, memberRes] = await Promise.all([
      supabase
        .from('board_posts')
        .select('id, title, visibility, created_at')
        .in('category_id', boardIds)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('newsletter_sends')
        .select('post_id, created_at, recipient_count')
        .eq('mode', 'live')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('email')
        .eq('email_newsletter_enabled', true),
    ]);

    const sends = new Map<string, { created_at: string; recipient_count: number }>();
    for (const row of ((sendRes.data ?? []) as any[])) {
      if (!sends.has(row.post_id)) sends.set(row.post_id, row);
    }
    setIssues(((issueRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      title: String(row.title ?? 'Untitled'),
      visibility: row.visibility ?? null,
      created_at: row.created_at,
      sentAt: sends.get(row.id)?.created_at ?? null,
      sentCount: sends.get(row.id)?.recipient_count ?? 0,
    })));
    // De-duplicated the same way the send de-duplicates, so the number here
    // is the number that actually goes out. "About 27" beside a tab reading
    // "Signed up (16)" reconciled with nothing (Nat 2026-08-12).
    setMemberEmails(((memberRes.data ?? []) as { email: string | null }[])
      .map((row) => String(row.email ?? '').trim().toLowerCase())
      .filter(Boolean));

    /**
     * Shout-outs belong to ONE month, and retire with it.
     *
     * This read the newest THREE collecting threads and ignored archiving
     * altogether, so a shout-out kept showing up for months and the count was
     * really "the last three months of shout-outs, roughly". Nat asked the
     * question that found it (2026-08-12): *"when do these populate, when do
     * they get retired? how/when do they fall off? and where do they go?"* —
     * and the honest answer was "they don't", right after she had archived
     * July's thread and still saw its twelve.
     *
     * So: the one collecting thread that is currently open. A shout-out
     * appears when somebody adds one (from The Buzz, or from the halfway
     * check-in, both of which post a reply here) and leaves this box the
     * moment that thread is archived or the next month's thread opens.
     *
     * Nowhere is it deleted — the replies stay on the board thread for good.
     * This box is a worktop, not an archive.
     */
    const { data: threads } = await supabase
      .from('board_posts')
      .select('id, title')
      .in('category_id', boardIds)
      .ilike('title', '%newsletter%')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
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

  // A plain `useEffect` only fires once, on mount — so if this box was
  // already open in a tab when somebody subscribed from the public site, it
  // kept showing the old count until a hard reload. `useFocusEffect` reruns
  // `load()` on in-app navigation, but nearly everybody uses HIVE in a
  // browser and testing this means alt-tabbing to the public site and back —
  // that never blurs the route, only the window, so `useFocusEffect` alone
  // still missed it (Nat, 2026-08-07/08: signed up twice, saw "registered"
  // both times, still found "Signed up (0)" here — the row was in the
  // database the whole time). Same fix `useArrivalBoard.ts` already uses for
  // the TV case: also refetch when the browser window itself regains focus.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

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

  const removeSubscriber = async () => {
    if (!confirmRemoveSub || removingSub) return;
    setRemovingSub(true);
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', confirmRemoveSub.id);
    setRemovingSub(false);
    setConfirmRemoveSub(null);
    if (error) {
      showAlert('Could not remove that', 'Try again in a moment.');
      return;
    }
    await load();
  };

  const active = subs.filter((s) => !s.unsubscribed_at);
  /** Exactly who a live send reaches: both lists, merged, one row per email. */
  const recipientCount = new Set([
    ...active.map((s) => s.email.trim().toLowerCase()),
    ...memberEmails,
  ]).size;
  /**
   * The letter in progress — written, never sent, never published.
   *
   * The same test The Buzz uses, so "still a draft" means one thing in both
   * places: it clears from here the moment Send to everyone goes through.
   */
  const draftIssue = issues.find((issue) => !issue.sentAt && issue.visibility !== 'public') ?? null;

  /**
   * Send an issue. A test goes only to whoever pressed it; a live send goes
   * to the merged list, and the function refuses a second live send for the
   * same issue unless it is told to mean it.
   *
   * The function reads the issue out of the database itself — all that
   * travels from here is an id, so this button can never be the thing that
   * mails arbitrary content to everybody.
   */
  const sendIssue = useCallback(async (issue: NewsletterIssue, mode: 'test' | 'live') => {
    setSending(`${issue.id}:${mode}`);
    const { data, error } = await supabase.functions.invoke('send-newsletter', {
      body: { postId: issue.id, mode },
    });
    setSending(null);
    setConfirmSend(null);

    if (error) {
      // The function's own words, not a generic failure — a refusal to
      // double-send is the useful sentence here, and it lives in the body.
      const detail = await (async () => {
        try { return (await (error as any).context?.json())?.error ?? null; } catch { return null; }
      })();
      showAlert('It did not send', detail ?? 'Something went wrong on the way out. Try again in a moment.');
      return;
    }

    const sent = (data as any)?.sent ?? 0;
    const failed = (data as any)?.failed ?? 0;
    showAlert(
      mode === 'test' ? 'Test sent' : 'The Buzz is out',
      mode === 'test'
        ? 'Check your inbox — it went only to you.'
        : `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}.${failed > 0 ? ` ${failed} did not go through.` : ''}`
    );
    await load();
  }, [load]);

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
          // Sending speaks for HIVE to everybody it has an address for, so
          // the door is owners-only, same as writing.
          // "Test & send", never "Send it". A tab is a place, but this one was
                  // named like a button — Nat: "i keep getting nervous to click on
                  // the tab called 'send it' because i think its going to send it if
                  // i click on it." Leading with the safe half says what is inside.
                  ...(profile?.is_owner ? [{ key: 'send', label: 'Test & send' }] : []),
          { key: 'signed', label: `Signed up (${active.length})` },
        ]}
        activeTab={tab}
        onTabChange={(key: string) => setTab(key as 'write' | 'shoutouts' | 'signed' | 'send')}
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
                <View style={{ flex: 1 }}>
                  {/* Name the letter in progress rather than a generic errand.
                      Nat, 2026-08-12: *"I keep feeling like this tab should be
                      showing the draft version we're working on now, shouldnt
                      it? and once its posted, then that clears?"* Yes to both —
                      an issue stops being a draft the moment it is sent or
                      published, which is the same test The Buzz uses. */}
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: SPACE_SKIN.ink }}>
                    {draftIssue ? draftIssue.title : 'Start this month’s newsletter'}
                  </Text>
                  {draftIssue ? (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: SPACE_SKIN.gold, marginTop: 2 }}>
                      In progress · not sent yet
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={15} color={SPACE_SKIN.inkSoft} />
              </Pressable>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.inkSoft,
                  lineHeight: 19, padding: 14,
                }}
              >
                {draftIssue
                  ? 'Opens on its own page, where you shape it and post it. It stops showing here once you send it.'
                  : 'The draft opens on its own page, where you shape it and post it.'}
                {shoutOuts.length > 0
                  ? ` The ${shoutOuts.length} ${shoutOuts.length === 1 ? 'thing' : 'things'} members have asked to have mentioned are in Shout-outs — worth reading before you start.`
                  : ' Anything members ask to have mentioned shows up in Shout-outs.'}
              </Text>
            </View>
          ) : null}

          {tab === 'send' && profile?.is_owner ? (
            <View style={{ padding: 12, gap: 10 }}>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.inkSoft, lineHeight: 19 }}>
                Goes to <Text style={{ fontFamily: 'Lato_700Bold', color: SPACE_SKIN.gold }}>{recipientCount}</Text> people
                {' '}— the {active.length} signed up, plus members with it switched on.
              </Text>
              {issues.length === 0 ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: SPACE_SKIN.inkSoft, lineHeight: 19 }}>
                  No issues written yet. Write one first, and it will show up here.
                </Text>
              ) : issues.slice(0, 1).map((issue) => (
                <View
                  key={issue.id}
                  style={{
                    borderWidth: 1, borderColor: SPACE_SKIN.border, backgroundColor: SPACE_SKIN.card,
                    borderRadius: 12, padding: 11, gap: 8,
                  }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: SPACE_SKIN.ink }}>
                    {issue.title}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: SPACE_SKIN.inkSoft }}>
                    {issue.sentAt
                      ? `Sent ${String(issue.sentAt).slice(0, 10)} to ${issue.sentCount} ${issue.sentCount === 1 ? 'person' : 'people'}`
                      : issue.visibility === 'public'
                        ? 'Published — never emailed'
                        : 'Draft — publish it before you send'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => { void sendIssue(issue, 'test'); }}
                      disabled={!!sending}
                      style={({ pressed }) => ({
                        borderWidth: 1, borderColor: SPACE_SKIN.border, borderRadius: 999,
                        paddingHorizontal: 13, paddingVertical: 7,
                        opacity: pressed || sending ? 0.6 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: SPACE_SKIN.ink }}>
                        {sending === `${issue.id}:test` ? 'Sending…' : 'Send test to me'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setConfirmSend(issue)}
                      disabled={!!sending}
                      style={({ pressed }) => ({
                        backgroundColor: SPACE_SKIN.gold, borderRadius: 999,
                        paddingHorizontal: 13, paddingVertical: 7,
                        opacity: pressed || sending ? 0.6 : 1,
                      })}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#1b1a16' }}>
                        {sending === `${issue.id}:live` ? 'Sending…' : 'Send to everyone'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              {/* EARLIER ISSUES — read-only on purpose.
                  Every issue used to get its own pair of buttons, which turned
                  a shelf of finished work into a to-do list. Nat, seeing it
                  live 2026-08-12: *"how do i get rid of those buttons? i dont
                  like feeling like i have 'un done' tasks, and i dont want to
                  accidently send out an old one. those have all been accounted
                  for in various ways."* Both halves of that are the same fix:
                  only the newest issue can be sent, so the older ones cannot
                  nag and cannot go out by accident. */}
              {issues.length > 1 ? (
                <View style={{ borderTopWidth: 1, borderTopColor: PANEL_HAIRLINE, paddingTop: 10, gap: 5 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: SPACE_SKIN.inkSoft }}>
                    Earlier issues
                  </Text>
                  {issues.slice(1).map((issue) => (
                    <Text
                      key={issue.id}
                      style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 19, color: SPACE_SKIN.inkSoft }}
                    >
                      {issue.title}
                      {issue.sentAt ? ` · emailed ${String(issue.sentAt).slice(0, 10)}` : ''}
                    </Text>
                  ))}
                  <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 11.5, lineHeight: 17, color: SPACE_SKIN.inkSoft, paddingTop: 2 }}>
                    Done and dusted — only the newest issue can be sent from here.
                  </Text>
                </View>
              ) : null}
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
                onPress={() => setConfirmRemoveSub(sub)}
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
      {/* The one genuinely irreversible button in this box. An email cannot be
          taken back, so it asks, and it says the number out loud. */}
      <ConfirmDialog
        visible={!!confirmSend}
        title={confirmSend ? `Send "${confirmSend.title}" to everyone?` : ''}
        body={`This emails ${recipientCount} people and cannot be undone. If you have not sent yourself a test yet, do that first.`}
        confirmLabel={sending ? 'Sending…' : 'Send it'}
        onConfirm={() => { if (confirmSend) void sendIssue(confirmSend, 'live'); }}
        onCancel={() => { if (!sending) setConfirmSend(null); }}
      />
      <ConfirmDialog
        visible={!!confirmRemoveSub}
        title={confirmRemoveSub ? `Remove ${confirmRemoveSub.email}?` : ''}
        body="They will stop getting the newsletter. You can add them back any time."
        confirmLabel={removingSub ? 'Removing…' : 'Remove them'}
        destructive
        onConfirm={() => { void removeSubscriber(); }}
        onCancel={() => { if (!removingSub) setConfirmRemoveSub(null); }}
      />
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
  /** Opens the check-in editor for this exact HIVE on the Admin screen. */
  onOpenCheckIns?: (communityId: string) => void;
}) {
  const { memberships, communityId, switchCommunity, profile, refreshProfile } = useAuth();
  const router = useRouter();

  // The member-facing check-ins are shared routes, so switch into the HIVE
  // named on this folder before opening them. This restores the old ability to
  // walk/test the real flow without making a second admin-only survey preview.
  const openMemberCheckIn = useCallback(async (targetId: string, mode?: 'midpoint') => {
    const target = memberships.find((membership) => membership.community_id === targetId)?.community;
    if (!hasTailoredCheckIns(target)) return;
    // `switchCommunity` also leaves HIVE-Wide. Do it even when this HIVE was
    // already selected, or a cream check-in can inherit the space palette from
    // Admin and draw cream text on cream fields.
    await switchCommunity(targetId);
    router.push({
      pathname: '/monthly-tuneup',
      params: { from: 'admin', ...(mode ? { mode } : {}) },
    } as any);
  }, [memberships, switchCommunity, router]);

  // Check-in questions live in a modal on this very screen, so there is nowhere
  // to navigate TO — routing to /admin from /admin is why both of these rows did
  // nothing at all when Nat pressed them (2026-08-04). The editor also only ever
  // holds one HIVE's surveys, which is the real reason the old panel told you to
  // "pick a HIVE in the rail first". So: switch into the HIVE, then hand Admin a
  // target it can verify before opening any survey.
  const openCheckInsForHive = useCallback(async (targetId: string) => {
    const target = memberships.find((membership) => membership.community_id === targetId)?.community;
    if (!hasTailoredCheckIns(target)) return;
    if (targetId !== communityId) await switchCommunity(targetId);
    onOpenCheckIns?.(targetId);
  }, [memberships, communityId, switchCommunity, onOpenCheckIns]);
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
  /**
   * The stop before "invited": people who put their hand up.
   *
   * Nat's own shape, 2026-08-12 — *"people kind of 'move up the totem pole'"*.
   * Interested → invited → member, and somebody stands at exactly ONE of
   * those at a time, which is why `load()` drops a waitlist row the moment
   * that person has an invite or a membership. That also answers her
   * question: an invite moves them out of Waiting and into Invited, rather
   * than leaving them in two lists to be chased twice.
   */
  const [waitingByHive, setWaitingByHive] = useState<Record<string, WaitlistRow[]>>({});
  const isOwner = !!profile?.is_owner;
  const [confirmRevoke, setConfirmRevoke] = useState<{ invite: PendingInvite; hiveName: string } | null>(null);
  const [revoking, setRevoking] = useState(false);
  /** Which pending invite is being re-sent right now, so one press means one send. */
  const [resendingId, setResendingId] = useState<string | null>(null);
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

    // And the stop before that one: people who put their hand up and have not
    // been invited yet. Owners only — the waitlist spans every HIVE and names
    // people who have joined nothing, which is the `is_owner` line.
    //
    // Matched to a HIVE by slug (migration 168) because whoever wrote the row
    // may have had no account at all, so there was nothing to resolve an id
    // against. A row with no slug means "any HIVE, not sure" and shows up
    // under every HIVE you keep, since it is an offer to whoever wants it.
    if (isOwner) {
      const { data } = await supabase
        .from('waitlist')
        .select('id, email, name, message, interested_in, status, created_at')
        .eq('status', 'new')
        .order('created_at', { ascending: false });

      const nextWaiting: Record<string, WaitlistRow[]> = {};
      memberships.forEach((m) => { nextWaiting[m.community_id] = []; });
      const slugFor = new Map(
        memberships.map((m) => [String((m.community as { slug?: string } | undefined)?.slug ?? ''), m.community_id])
      );

      ((data ?? []) as WaitlistRow[]).forEach((row) => {
        const already = (email: string, id: string) =>
          (next[id] ?? []).some((r) => r.email.trim().toLowerCase() === email.trim().toLowerCase())
          || (nextInvites[id] ?? []).some((i) => i.email.trim().toLowerCase() === email.trim().toLowerCase());

        const targets = row.interested_in
          ? [slugFor.get(row.interested_in)].filter(Boolean) as string[]
          : memberships.map((m) => m.community_id);

        targets.forEach((id) => {
          // Somebody already invited or already in has moved up the totem
          // pole. Listing them here too would ask Nat to chase a person she
          // has already chased.
          if (!already(row.email, id)) nextWaiting[id]?.push(row);
        });
      });
      setWaitingByHive(nextWaiting);
    }

    setLoading(false);
  }, [memberships, isOwner]);

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
      const { data, error } = await supabase.functions.invoke<InviteFunctionResult>('invite', {
        body: { email, role: inviteRole, community_id: targetId },
      });
      if (error) throw new Error(await functionErrorMessage(error, 'Could not send that invite.'));

      setInviteEmail('');
      setInviteRole('member');
      setInviteFor(null);
      await load();
      await announceInviteOutcome(data, email, hiveName);
    } catch (err) {
      showAlert('Could not send that invite', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setSending(false);
    }
  };

  /**
   * Send the same invitation again, from the row it is already sitting in.
   *
   * The function treats an email with a pending invite as a refresh: same
   * token, same link, a fresh seven days on `expires_at`, and the email goes
   * out again. So this is both "they never got the email" and "their link
   * expired" fixed with one press — which is exactly the pair that stranded
   * Lucas's Aug 4 invite to Tech HIVE.
   */
  const resendInvite = async (invite: PendingInvite, hiveName: string) => {
    if (resendingId) return;
    setResendingId(invite.id);
    try {
      const { data, error } = await supabase.functions.invoke<InviteFunctionResult>('invite', {
        body: { email: invite.email, role: invite.role as UserRole, community_id: invite.community_id },
      });
      if (error) throw new Error(await functionErrorMessage(error, 'Could not resend that invite.'));

      await load();
      await announceInviteOutcome(data, invite.email, hiveName);
    } catch (err) {
      showAlert('Could not resend that invite', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setResendingId(null);
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
        const waiting = waitingByHive[m.community_id] ?? [];
        // Both stops on the totem pole, counted together — the tab's number is
        // "how many people are part-way in", which is the question being asked.
        const waitingCount = invites.length + waiting.length;
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
              /**
               * Waiting is its own tab rather than a third section stacked
               * under the member list.
               *
               * Nat asked for both shapes in one breath and then found the
               * problem with the first herself (2026-08-12): *"I would notice
               * them right away in tech or prod. but i wouldnt notice on OG
               * HIVE, cos i'd have to scroll a bunch. So that could also be
               * another tab?"* A count on the folder's edge is visible without
               * scrolling past eleven members, so the tab wins — and it keeps
               * the whole pipeline in one place instead of splitting invited
               * from interested across two views.
               */
              tabs={[
                { key: 'members', label: `Members (${rows.length})` },
                ...(m.role === 'admin' && waitingCount > 0
                  ? [{ key: 'waiting', label: `Waiting (${waitingCount})` }]
                  : m.role === 'admin' ? [{ key: 'waiting', label: 'Waiting' }] : []),
                { key: 'checkins', label: 'Check-ins' },
              ]}
              activeTab={tab}
              onTabChange={(key: string) => {
                setTabFor((prev) => ({ ...prev, [m.community_id]: key }));
                // Walking to another tab closes the invite form by itself.
                // Nat, 2026-08-11: "If i clicked 'add new member' and now i
                // want to do something else, i cant until i click 'close
                // invite' — which feels weird." The form is a thing you were
                // doing, not a place you are; going somewhere else IS
                // closing it.
                setInviteFor((prev) => (prev === m.community_id ? null : prev));
              }}
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
                  hasTailoredCheckIns(m.community) ? (
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
                    <View
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={CHECK_INS_COMING_SOON_MESSAGE}
                      style={{
                        minHeight: 150,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 24,
                        paddingVertical: 30,
                      }}
                    >
                      <Ionicons
                        name="time-outline"
                        size={24}
                        color={accentOnDark(accent)}
                        style={{ marginBottom: 10 }}
                      />
                      <Text
                        style={{
                          maxWidth: 360,
                          fontFamily: 'Lato_700Bold',
                          fontSize: 14,
                          lineHeight: 21,
                          color: '#F6F4E5',
                          textAlign: 'center',
                        }}
                      >
                        {CHECK_INS_COMING_SOON_MESSAGE}
                      </Text>
                    </View>
                  )
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

                {tab === 'members' ? (
                loading && rows.length === 0 ? (
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
                })
                ) : null}

                {/* INVITED, NOT JOINED YET.
                    Nat 2026-08-04: "I want to see who I've already invited &
                    just see that their membership is pending" — and be able to
                    take one back from this same box. Admins only, because only
                    an admin is allowed to read this table at all.

                    Moved onto the Waiting tab 2026-08-12, next to the people
                    who have not been invited yet — the two are one pipeline. */}
                {tab === 'waiting' && m.role === 'admin' && !loading ? (
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

                          {/* Send the same invitation again. One press covers
                              both "the email never arrived" and "the link
                              expired": the function refreshes the same link
                              with a fresh seven days and emails it again. */}
                          <Pressable
                            onPress={() => { void resendInvite(invite, name); }}
                            disabled={!!resendingId}
                            hitSlop={6}
                            accessibilityLabel={`Resend the invite for ${invite.email}`}
                            style={({ pressed }) => ({
                              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                              borderWidth: 1, borderColor: 'rgba(246,244,229,0.28)',
                              backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'transparent',
                              opacity: resendingId && resendingId !== invite.id ? 0.5 : 1,
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: 'rgba(246,244,229,0.8)' }}>
                              {resendingId === invite.id ? 'Sending…' : 'Resend'}
                            </Text>
                          </Pressable>

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
                        An expired link no longer works. Press Resend and the same link
                        comes back to life for another seven days.
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {/* INTERESTED, NOT INVITED YET — the stop before an invite.
                    Nat's totem pole, 2026-08-12. Owners only, because the
                    waitlist reads across every HIVE and names people who have
                    joined nothing.

                    "Invite them" fills the invite form at the top of this
                    folder rather than sending anything on the spot: who gets
                    in is a decision, and OG is closed to new members right
                    now even though it still collects names. */}
                {tab === 'waiting' && isOwner && !loading ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: skin.border, marginTop: 4 }}>
                    <Text
                      style={{
                        fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 1,
                        textTransform: 'uppercase', color: 'rgba(246,244,229,0.65)',
                        paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4,
                      }}
                    >
                      Interested, not invited yet{waiting.length > 0 ? ` (${waiting.length})` : ''}
                    </Text>

                    {waiting.length === 0 ? (
                      <Text
                        style={{
                          fontFamily: 'Lato_400Regular', fontSize: 12,
                          color: 'rgba(246,244,229,0.5)', paddingHorizontal: 14, paddingBottom: 14,
                        }}
                      >
                        Nobody has put their hand up for {name} yet.
                      </Text>
                    ) : waiting.map((person) => (
                      <View
                        key={`${m.community_id}:${person.id}`}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderTopWidth: 1, borderTopColor: skin.hairline,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#F6F4E5' }}>
                            {person.name?.trim() || person.email}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: 'rgba(246,244,229,0.55)' }}>
                            {person.name?.trim() ? `${person.email} · ` : ''}
                            asked {sentWhen(person.created_at)}
                            {person.interested_in ? '' : ' · any HIVE'}
                          </Text>
                          {person.message?.trim() ? (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 17, color: 'rgba(246,244,229,0.7)', paddingTop: 3 }}>
                              “{person.message.trim()}”
                            </Text>
                          ) : null}
                        </View>
                        {m.role === 'admin' ? (
                          <Pressable
                            onPress={() => {
                              setInviteEmail(person.email);
                              setInviteRole('member');
                              setInviteFor(m.community_id);
                              setTabFor((prev) => ({ ...prev, [m.community_id]: 'members' }));
                            }}
                            hitSlop={8}
                            accessibilityLabel={`Invite ${person.email} to ${name}`}
                            style={({ pressed }) => ({
                              borderWidth: 1, borderColor: skin.border, borderRadius: 999,
                              paddingHorizontal: 11, paddingVertical: 6, opacity: pressed ? 0.6 : 1,
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#F6F4E5' }}>
                              Invite them
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
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

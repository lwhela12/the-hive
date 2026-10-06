import { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from '../../components/ui/SafeArea';
import { AppHeader } from '../../components/navigation';
import { currentNewsletterDraft, newsletterIssueHistory } from '../../lib/newsletterIssues';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { CollapsiblePanel } from '../../components/ui/CollapsiblePanel';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useDeepTrail } from '../../lib/hooks/usePathTrail';
import { SPACE_SKIN } from '../../lib/pageSkin';
import { LetterProse, type LetterPalette } from './newsletter';

/**
 * The letter colours for space. The Buzz hangs in the same near-black as
 * HIVE-Wide, so paper's charcoal-on-cream would be unreadable here — headings
 * take the gold that reads on a dark ground, body takes the page's own ink.
 */
const SPACE_LETTER: LetterPalette = {
  heading: '#E8C77E',
  label: '#C9A961',
  body: SPACE_SKIN.inkBody,
  quiet: SPACE_SKIN.inkFaint,
  rule: 'rgba(255,226,166,0.4)',
  link: SPACE_SKIN.gold,
};

import { ThinkingBee } from '../../components/ui/ThinkingBee';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
/**
 * The Buzz — every newsletter you're entitled to read, in one place.
 *
 * The Buzz is one HIVE-Wide publication archive. Drafts are owner-only;
 * published issues are readable by members and on the public site.
 */

type Buzz = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  visibility: string;
  published_at?: string | null;
  /** Written but never sent or published — owners only (2026-08-12). */
  unsent?: boolean;
  /** When it was actually emailed to the list, if it ever was. */
  sentAt?: string | null;
};

/**
 * How long a letter counts as new.
 *
 * A month's letter has a month to be read, so a fortnight is generous without
 * ever letting two issues wear the badge at once.
 */
const JUST_OUT_DAYS = 14;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A month named anywhere in a letter's title, written out or shortened, with
 * the year beside it when the title bothers to give one.
 */
const MONTH_IN_TITLE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?[\s,—-]*(20\d{2})?/i;

/**
 * Which month a letter is FOR.
 *
 * Two dates are in play and they are often different. The day the letter was
 * posted is `created_at`. The month the letter is about is the one on its
 * masthead. In the live archive on 2026-08-06 they
 * disagreed on half the letters:
 *
 * | letter | posted | about |
 * |---|---|---|
 * | The Buzz — June 2026 HIVE Recap | 2026-07-08 | June |
 * | May 2026 — The Buzz | 2026-06-01 | May |
 * | H.I.V.E. Newsletter #4, May 2026 | 2026-05-05 | May |
 * | H.I.V.E. Newsletter #3, April 2026 | 2026-04-01 | April |
 * | H.I.V.E. Newsletter #2, March 2026 | 2026-02-23 | March |
 * | Our First Newsletter | 2026-02-16 | February |
 *
 * A recap goes out after the month it recaps, and March's letter went out in
 * February — so the posting date alone would have put "July" along the bottom
 * while the letter on screen said June, and "February" on two different
 * letters. The month word in the title is a date, so it is read as one and the
 * rest of the title is thrown away: only the month survives, which is why the
 * three shapes ("#3, April 2026", "May 2026 — The Buzz", "— June 2026 HIVE
 * Recap") all come out the same. A letter whose title names no month at all —
 * "Our First Newsletter" — falls back to the day it was posted, the same date
 * its card shows.
 *
 * `created_at` carries a time and a zone, so `new Date()` is safe here; the
 * date-only trap that `parseDateString` exists for does not apply.
 */
function letterMonth(item: Buzz): { month: number; year: number } {
  const posted = new Date(item.created_at);
  const found = MONTH_IN_TITLE.exec(item.title ?? '');
  const month = found
    ? MONTH_NAMES.findIndex((name) => name.slice(0, 3).toLowerCase() === found[1].slice(0, 3).toLowerCase())
    : -1;
  if (month < 0) return { month: posted.getMonth(), year: posted.getFullYear() };
  if (found?.[2]) return { month, year: Number(found[2]) };

  // A title that names a month and no year takes the year that lands it nearest
  // the day it went out, so a "January" letter posted in late December belongs
  // to the January a week away rather than the one eleven months behind.
  const postedIndex = posted.getFullYear() * 12 + posted.getMonth();
  const distance = (year: number) => Math.abs(year * 12 + month - postedIndex);
  const year = [posted.getFullYear() - 1, posted.getFullYear(), posted.getFullYear() + 1]
    .reduce((best, candidate) => (distance(candidate) < distance(best) ? candidate : best));
  return { month, year };
}

/**
 * What one letter is called in the path along the bottom.
 *
 * Nat, from her phone on 2026-08-06: *"it should show The Buzz > April."* A
 * month, the way she says it out loud, rather than the title she is already
 * looking at at the top of the letter.
 *
 * The year is added once the month stops being enough to say which letter this
 * is — a letter from any year but this one. While the archive is all 2026 and
 * it is 2026, every crumb is a bare month; the day an April 2025 letter is
 * still on the page, it says "April 2025" and the two cannot be confused.
 */
const letterTrailLabel = (item: Buzz): string => {
  const { month, year } = letterMonth(item);
  const name = MONTH_NAMES[month];
  return year === new Date().getFullYear() ? name : `${name} ${year}`;
};

/**
 * The archive shelf names the ISSUE month, not an old import/posting day.
 *
 * The legacy March issue is the one exception to deriving that month from the
 * row date: Wix says "H.I.V.E. Newsletter #2, March 2026", but its imported
 * row carries the early posting date February 23. Showing that raw date made
 * the shelf look like two February newsletters and no March newsletter.
 */
const EARLY_MARCH_ISSUE_ID = '79aac910-1a1f-444c-bc0b-7af1fe9e96ef';

const newsletterIssueLabel = (item: Buzz): string => {
  if (item.id === EARLY_MARCH_ISSUE_ID) return 'March 2026 issue';
  const issueDate = new Date(item.sentAt ?? item.created_at);
  return `${MONTH_NAMES[issueDate.getMonth()]} ${issueDate.getFullYear()} issue`;
};

export default function BuzzScreen() {
  const { profile } = useAuth();
  const isOwner = !!profile?.is_owner;
  // The Buzz lives at HIVE-Wide and nowhere else (Nat 2026-08-03), so it is
  // always dressed for space rather than following whoever opened it.
  const skin = SPACE_SKIN;
  const [items, setItems] = useState<Buzz[]>([]);
  /**
   * The one letter that gets to say it is new — the most recently SENT issue,
   * and only while it is still fresh.
   *
   * Sent, not written: an owner's unsent draft is already labelled as a draft,
   * and an issue imported from the Wix years has a `created_at` from 2024 and
   * was never new here at all.
   */
  const newestSentId = useMemo(() => {
    const cutoff = Date.now() - JUST_OUT_DAYS * 24 * 60 * 60 * 1000;
    const fresh = items
      .filter((item) => !item.unsent && item.sentAt && Date.parse(item.sentAt) >= cutoff)
      .sort((a, b) => Date.parse(b.sentAt!) - Date.parse(a.sentAt!));
    return fresh[0]?.id ?? null;
  }, [items]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * Where you are once you open a letter.
   *
   * A letter is not its own address — it unfolds inside the archive while the
   * route still says `/buzz`, so the strip along the bottom had no way to know
   * anything had happened and kept saying `HIVE-Wide › The Buzz` while Nat sat
   * inside April's letter on her phone (2026-08-06): *"when i go into different
   * news letters, the footer nav didnt update with me: it should show The Buzz >
   * April."*
   *
   * One crumb, because the archive opens one letter at a time and arrives with
   * every card shut — so there is exactly one thing you can be inside, and it
   * disappears the moment the letter does.
   *
   * "The Buzz" is the way back, the same as the boards' page crumb sheds an open
   * thread: pressing it closes the letter and the archive is there again.
   */
  const openLetter = items.find((item) => item.id === openId) ?? null;
  useDeepTrail(
    openLetter ? [{ label: letterTrailLabel(openLetter) }] : [],
    openLetter ? () => setOpenId(null) : undefined,
  );

  const load = useCallback(async () => {
    // RLS returns published issues to members and also returns Nat's current
    // draft to her. There is no newsletter board and no board-shaped intake.
    const { data } = await supabase
      .from('newsletter_issues')
      .select('id, title, content, created_at, visibility, published_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(40);

    const rows = (data ?? []) as unknown as Buzz[];

    /**
     * An issue joins the archive when it has actually GONE OUT — never before.
     *
     * Nat, 2026-08-12, finding this month's half-written letter sitting in the
     * list under every finished one: *"shouldnt the one we're working on
     * technically fall under 'still being written' until we click 'send to
     * everyone'?? what if people were in here reading the unfinished one?"*
     * They could, and it read as an issue they had somehow missed.
     *
     * Gone out means one of two things, because the archive predates the send
     * button: published to the public site (`visibility = 'public'`, which is
     * what the `public_newsletters` view reads and what every issue before
     * today has), or emailed to the list at least once.
     *
     * A draft that is neither is shown to OWNERS ONLY, wearing its own label,
     * so Nat can read hers back without it being on anybody else's page.
     */
    const { data: sends } = await supabase
      .from('newsletter_sends')
      .select('issue_id, created_at')
      .eq('mode', 'live');
    const sentAtById = new Map(
      ((sends ?? []) as { issue_id: string; created_at: string }[]).map((send) => [send.issue_id, send.created_at])
    );
    const candidates = rows
      .map((row) => ({ ...row, sentAt: sentAtById.get(row.id) ?? null }));
    const draft = currentNewsletterDraft(candidates);
    const history = newsletterIssueHistory(candidates, draft);

    // One policy across Admin, the writer, and this archive. Only a genuinely
    // current draft is private to an owner; imported pre-send issues are past
    // newsletters, not six forever-drafts. Once the real draft is sent it moves
    // into history immediately.
    const archive = [
      ...(isOwner && draft ? [{ ...draft, unsent: true }] : []),
      ...history.map((row) => ({ ...row, unsent: false })),
    ];
    setItems(archive);
    // Nothing is opened for you. Nat, 2026-08-06: *"I think the first view of
    // the newsletter page should always start out with them all collapsed & you
    // can expand the one you want to read."* A newsletter runs to about two
    // thousand words, so opening the newest one made the page a wall you had to
    // scroll past to find out what else was here. Whatever the reader has open
    // stays open through a refresh — `openId` is left alone here on purpose.
    setLoading(false);
  }, [isOwner]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: skin.page }} edges={['top']}>
      <SpaceBackdrop />
      <AppHeader title="The Buzz" />
      <BounceScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
          {loading ? (
            <View style={{ paddingVertical: 48 }}>
              <ThinkingBee />
            </View>
          ) : null}

          {loading ? null : items.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Text style={{ fontSize: 34, marginBottom: 12 }}>📰</Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: skin.ink, marginBottom: 6 }}>
                Nothing to catch up on yet
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: skin.inkSoft, textAlign: 'center', maxWidth: 320 }}>
                The first newsletter will land here, and so will anything another HIVE shares.
              </Text>
            </View>
          ) : items.map((item) => {
            const open = openId === item.id;
            const justOut = item.id === newestSentId;

            return (
              <CollapsiblePanel
                key={item.id}
                title={item.title}
                // A draft says so, and says who can see it — the whole point of
                // it being here is that Nat can read hers back while knowing
                // nobody else can (2026-08-12).
                // A newsletter used to arrive here in total silence — the row
                // simply appeared, and a member who did not read their email
                // had no way of knowing a new one was out. Nat, 2026-09-01,
                // asking the question that found it: *"check whether members
                // can tell a new issue exists."*
                //
                // So the newest issue says so for its first fortnight. It
                // clears itself rather than waiting to be dismissed, because a
                // badge nobody can put down stops meaning anything.
                eyebrow={
                  item.unsent
                    ? 'Draft · only you can see this'
                    : justOut
                      ? 'Just out'
                      : undefined
                }
                // A dashed edge means unfinished. Nat, 2026-08-12: *"i want that
                // dotted outline, like before, that made it super obvious, i
                // liked that."* The words say it; the border says it from
                // across the room.
                dashed={item.unsent}
                subtitle={newsletterIssueLabel(item)}
                // One at a time — opening a letter shuts the one you were
                // reading, which is what "expand the one you want to read"
                // means when each of these is two thousand words.
                open={open}
                onToggle={(next) => setOpenId(next ? item.id : null)}
                topAccent="#E8C77E"
                colours={{
                  ink: skin.ink,
                  inkSoft: skin.inkSoft,
                  // Opaque on the dark page, not a 5% wash.
                  //
                  // A whole newsletter is a long read, and this page is a
                  // photograph of a sunrise — over the bright edge of the planet
                  // the letter simply disappeared (Nat: "i also cant read the
                  // news letter"). A card you glance at can float; a card you
                  // READ needs ground under it.
                  fill: skin.dark ? '#12131A' : skin.card,
                  border: skin.border,
                  accent: skin.gold,
                  pressed: skin.cardPressed,
                }}
                titleStyle={{ fontSize: 16, letterSpacing: 0 }}
                style={{ borderRadius: 18, marginBottom: 12 }}
                bodyStyle={{ paddingBottom: 18 }}
              >
                {/* The letters read like letters here too.
                    Nat has asked three times. The archive imported from the
                    old Wix site kept every paragraph break — the text really
                    does carry its `\n\n` — but lost every mark of what a
                    line was FOR, and this printed the whole thing into one
                    `<Text>` at 15px. So a 6,000-character newsletter arrived
                    as one slab. `readLetter` reads the shape back out of the
                    plain text and `LetterProse` gives each piece its weight;
                    this is the same component the letter screen uses, in the
                    space skin's colours rather than paper's. */}
                <LetterProse text={item.content} palette={SPACE_LETTER} />
              </CollapsiblePanel>
            );
          })}
        </View>
      </BounceScrollView>
    </SafeAreaView>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// No AppHeader here on purpose — the title floats in the sky, and a gold bar
// across the top would put you back inside a HIVE (Nat 2026-08-03). The import
// hung around after the header came out.
import { SpaceGlobe, SPACE_BLACK } from '../../components/ui/SpaceGlobe';
import { CollapsiblePanel } from '../../components/ui/CollapsiblePanel';
import { HiveMark } from '../../components/ui/HiveMark';
import { HiveWideWelcome } from '../../components/ui/HiveWideWelcome';
import { PendingInviteDoor } from '../../components/ui/PendingInviteDoor';
import { markJustJoinedHive } from '../_layout';
import { HIVE_WIDE_WELCOME_VERSION } from '../../lib/hiveWide';
import { loadHiveWideWelcomeSeen, persistHiveWideWelcomeSeen } from '../../lib/readState';
import { supabase } from '../../lib/supabase';
import { useAuth, type HiveMembership } from '../../lib/hooks/useAuth';
import { useAppNews } from '../../lib/hooks/useAppNews';
import { accentOnDark, accentWash, hiveAccent, hiveDisplayName, normalizeHiveBrandText } from '../../lib/hiveBrand';
import { formatDateLong, formatTimeRange } from '../../lib/dateUtils';
import { getLocalIsoDate } from '../../lib/hooks/useArrivalBoard';
import { useOpenFeedback } from '../../lib/openFeedback';
import type { Community } from '../../types';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { HiveWideCalendar } from '../../components/hive/HiveWideCalendar';
/**
 * HIVE-Wide — the shared high street.
 *
 * The first pass was a flat list of eleven identical cards, every one of them
 * stamped "FROM OG HIVE" — "so much reading, just plain text all over, I'd never
 * read that... it doesn't match the rest of the site at all" (Nat 2026-08-03).
 * She was right on both counts, and the second one explains the first: Home
 * speaks in honeycombs and warm panels, and this spoke in a spreadsheet.
 *
 * So it's built out of what the app already uses. Combs to go somewhere, a warm
 * panel for the focus, and the last few things a HIVE opened up — shown as a
 * short glance rather than the entire archive. The HIVE a thing came from is a
 * coloured comb rather than the same four words on every line.
 *
 * The top of the page is three boxes, Nat's own sketch from later the same day:
 * HIVE Help, HIVE Hangs, Meetings. Side by side when there's room, stacked on a
 * phone. Boxes two and three carry one line per HIVE, so the shape of the whole
 * street is visible in a glance — including the HIVEs with nothing planned yet,
 * which say "tbd" in their own colour. An empty line is an invitation.
 */

/**
 * A wish somebody marked HIVE-Wide.
 *
 * Nat's own diagnosis, 2026-08-04: "we haven't figured out the quick action
 * toggle to make profiles & wishes HIVE-Wide. I just realised that part of the
 * problem might be that we don't actually have a place for all that in the
 * HIVE-Wide." Exactly right — marking a wish HIVE-Wide worked and then it went
 * nowhere visible, so the setting looked broken because its RESULT was missing.
 * This box is where those wishes now land.
 */
type WideWish = {
  id: string;
  title: string | null;
  description: string;
  user: { name: string | null; avatar_url: string | null } | null;
  community: { name: string; accent_color: string | null } | null;
};

type HiveEvent = {
  id: string;
  title: string;
  event_date: string;
  event_time: string | null;
  /** When the meeting finishes — migration 202. Null on almost everything today. */
  end_time: string | null;
  event_type: string;
  community_id: string;
  end_date: string | null;
  /**
   * How far this event was allowed to travel. HIVE-Wide shows the WHAT of every
   * HIVE's plans — that there is a pool day — and the when and where only when
   * the person who made it said so.
   *
   * "The 'what' shows up, very generically, but all other info (who what when
   * where why) is only available inside that hive. UNLESS it was specifically
   * marked hive wide" (Nat 2026-08-03). It was showing the date and time on
   * everything, which is more than anybody agreed to.
   */
  visibility: string | null;
};

/**
 * A hang is somewhere you can turn up. A date range on the calendar is almost
 * always somebody out of town, which is the opposite of an invitation — so it
 * stays out of the Hangs box, the same way the monthly tune-up keeps it out of
 * the hang recap (2026-08-03). Same words, same test, one place to change it.
 */
function isAHang(event: HiveEvent) {
  if (event.event_type === 'meeting' || event.event_type === 'birthday') return false;
  if (event.end_date) return false;
  return !/\b(out of town|away|trip|travel|galavant)/i.test(event.title);
}

// See-through, so the world shows through the cards the way the studio site
// does — a solid panel over a globe is just a globe with a lid on it. It rides
// on top of SPACE_SCRIM below, which is what keeps the ink readable where the
// planet is bright.
const CARD_FILL = 'rgba(255,248,233,0.055)';
const CARD_EDGE = 'rgba(255,226,166,0.22)';
const INK = '#FFF8E9';
const INK_SOFT = 'rgba(255,248,233,0.72)';
const INK_FAINT = 'rgba(255,248,233,0.45)';
/** The gold that reads on space — the same one the welcome panel wears. */
const GOLD_ON_SPACE = '#E8C77E';
/**
 * The dark the panels carry with them.
 *
 * The Earth is painted once, behind everything, and it stays put while the page
 * scrolls over it — so a panel can be sitting on empty black one second and on
 * the lit edge of the planet the next. Nat, on her phone 2026-08-06, could not
 * read "What We've Been Building" for exactly that reason: cream ink had landed
 * on the sunrise.
 *
 * So each panel lays `SPACE_BLACK` at 62% under its own see-through colour.
 * Over the black of space that changes nothing you can see. Over the bright limb
 * it knocks the glow down far enough for cream ink to read on it. The world
 * still shows through the cards — dimmed, the way it does through a window.
 */
const SPACE_SCRIM = 'rgba(5,6,11,0.62)';

/**
 * **Every panel on this page is the same panel. Making "Your HIVEs" stand out
 * was tried twice, Nat looked at the result both times, and both times she chose
 * sameness. There is no third way to try it.**
 *
 * Attempt one was a gold band down the left edge. Nat, 2026-08-06: *"why do the
 * first 2 have gold on the left hand side & the other ones dont? That feels
 * weird and inconsistent."* Two of the three came off and the band stayed on
 * "Your HIVEs" as a deliberate mark meaning *this is the way in*. She asked
 * about it again the same day — *"why does 'your hives' still have gold on the
 * left hand side?"* — so the band came off that one too.
 *
 * Attempt two was a brighter fill, 11% cream where the rest of the page sits at
 * 5.5%, on the same reasoning: the door should be findable now that every panel
 * arrives shut. Nat, looking at the finished page: *"'Your HIVEs' is a slightly
 * different color than all the rest, and it should match transparency and
 * style."* The brighter value is deleted rather than left defined, because a
 * number sitting here unused is a number the next session reaches for.
 *
 * The door is findable because it is second on the page and says "Your HIVEs".
 * It does not need to be louder. Her word for what she wants is *continuity*.
 */

/**
 * This page's one palette. Every panel on the page is handed this exact object —
 * the welcome, the door, and both boxes — so no panel can drift a few percent
 * away from its neighbours without somebody changing it here for all of them.
 */
const PANEL_COLOURS = {
  ink: INK,
  inkSoft: INK_SOFT,
  fill: CARD_FILL,
  border: CARD_EDGE,
  accent: GOLD_ON_SPACE,
  pressed: 'rgba(255,248,233,0.1)',
  scrim: SPACE_SCRIM,
};

/** One of the boxes. Same shell for all of them so they read as a set. */
function TopBox({ label, wide, children }: { label: string; wide: boolean; children: React.ReactNode }) {
  /**
   * Every panel on this page opens and shuts — Nat, from her phone on
   * 2026-08-06: *"i think all of those... all of those should be collapsible or
   * expandable, thats a really nice feature, i like!"*
   *
   * **They all start shut.** Nat, the same day: *"deff start the screen with
   * them all collapsed like that, easier to understand what you're looking at"*
   * and *"I think that is the best way to introduce all my OG HIVErs to the new
   * 'hive wide', that looks really cool."* You arrive at a contents page — every
   * panel on the street, named, in one screen — and open the ones you want.
   *
   * An earlier pass had them open, arguing that a wall of shut drawers would say
   * nothing was happening. Nat looked at both and picked shut. Leave it shut.
   */
  const [open, setOpen] = useState(false);

  return (
    <CollapsiblePanel
      title={label}
      open={open}
      onToggle={setOpen}
      colours={PANEL_COLOURS}
      // One line, always, at whatever size that takes — the panel measures its
      // own column and shrinks to suit. "What We've Been Building" is the
      // longest title here and the only one that needs much: it wants 252 of the
      // 216 points a 375-point phone gives it, so on a phone it sets a little
      // under 15 and on a laptop it sets at 17 like everything else.
      fitTitle
      style={{
        // Two to a row on a wide screen, one per row on a phone.
        //
        // flexBasis rather than flex:1 — with four boxes in a wrapping row,
        // flex:1 would squeeze all four onto one line and never wrap. 48% plus
        // grow leaves room for the gap and still lets a lonely last box fill
        // its row. On a phone they stack, and a flex child inside a column
        // would fight the scroll view for height.
        // `flexGrow: 0`, so a box that ends up alone on the last row stays a
        // cube instead of stretching the width of the page. That stretch is
        // what made "What We've Been Building" a long box under two short ones
        // (Nat 2026-08-12: *"instead of having some really long ones, they look
        // silly"*). With four boxes it is a tidy 2x2; a fifth lands under them
        // at the same width rather than reflowing the lot.
        flexGrow: 0,
        flexBasis: wide ? '48%' : 'auto',
        // All of them the same height (Nat 2026-08-04: "why are these bottom
        // boxes shorter than the top ones? they should all be equal"). A
        // wrapping row sizes each ROW to its own tallest child, so a short
        // second row sat shorter than a full first one. `alignItems: stretch`
        // cannot fix that across a wrap — it only equalises within a row — so
        // the boxes are given a floor instead, and the tallest content still
        // grows past it. A shut box drops the floor, because the whole point of
        // shutting one is to get the space back.
        minHeight: open && wide ? 270 : undefined,
      }}
    >
      {children}
    </CollapsiblePanel>
  );
}

/** A second door, kept small so it points at a destination instead of becoming another panel. */
function CompactDoor({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: CARD_EDGE,
        backgroundColor: pressed ? PANEL_COLOURS.pressed : CARD_FILL,
      })}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: GOLD_ON_SPACE }}>
        {label}
      </Text>
      <Ionicons name="arrow-forward" size={13} color={GOLD_ON_SPACE} />
    </Pressable>
  );
}

/** Air either side of the title, the same on both edges. */
const HERO_PADDING = 20;
/**
 * The slice the rail takes off the window before this page sees any of it.
 *
 * Used for one frame only — the guess the title starts at before the real
 * measurement arrives. A number rather than an import from the rail, because
 * the rail's own widths are its business and this only needs a floor: it is
 * never drawn narrower than this, so guessing it can only make the first frame
 * a little small, never a little wrapped.
 */
const RAIL_AT_ITS_NARROWEST = 56;
/** The biggest "HIVE-Wide" ever gets, which is what a laptop shows. */
const TITLE_MAX = 46;
/** Small enough that wrapping is the kinder answer. Nothing real hits this. */
const TITLE_MIN = 30;
/**
 * How wide "HIVE-Wide" is when it is one point tall.
 *
 * Nat, 2026-08-06: *"I think 'HIVE-Wide' needs to fit on one line. If we do
 * that, then it'll bump 'what we've been building' up into the dark outerspace
 * instead of on the cusp of the planet, & it'll be easier to read."* It was
 * breaking to `HIVE-` / `Wide` on her phone, because the rail takes 64 points
 * off a 375-point screen before this page sees any of it, and the title needs
 * 302 of the 271 that are left.
 *
 * The number is the typeface's, measured out of the font file: Libre Baskerville
 * Bold sets these nine characters in 6.27 ems, and the spacing between letters
 * adds another nine at 1.5/46 of the size. Six percent of slack on top covers
 * the moment before the webfont lands and a fallback serif is standing in.
 *
 * A constant is safe here where it would not be in `CollapsiblePanel`, because
 * this is one word that never changes, in one typeface, on one page.
 */
const TITLE_TRACKING = 1.5 / TITLE_MAX;
const TITLE_EMS = (6.27 + 9 * TITLE_TRACKING) * 1.06;

/**
 * The way down into your own HIVE.
 *
 * HIVE-Wide stays the page everybody lands on — Nat, 2026-08-06: "otherwise you
 * might never go there." What that costs is paid here. Somebody who accepted an
 * invite an hour ago opens the app to a black photograph of the Earth, and the
 * five numbered steps in their invite email — fill in your profile, read the
 * other members, answer the daily question, add what you are good at, post a
 * wish — are all inside their own HIVE, along with Clive, who the email calls
 * the fastest way to get unstuck. Standing above the HIVEs, every one of those
 * doors is out of the menu on purpose (`atWholeHive: 'hidden'` in
 * lib/navigation.ts), so the page has to say where they went.
 *
 * So this is the second thing on the page, under the explainer that says what
 * HIVE-Wide is: the member's HIVE, by name, in its own colour, on a button that
 * goes there. Nat on who is reading it: "we have very very very very not tech
 * savvy people." It sat first until 2026-08-06, when Nat put the "what is
 * HIVE-Wide" panel above it — what a place is comes before the way off it.
 *
 * It wears the same panel as everything else on the page, with no difference at
 * all. See the note above `PANEL_COLOURS` for the two attempts at making it
 * stand out and why both were undone.
 */
function WayIntoYourHive({
  memberships,
  firstName,
  firstVisit,
  onEnter,
}: {
  memberships: HiveMembership[];
  firstName: string | null;
  /** Shown the long explanation, until they have opened the welcome once. */
  firstVisit: boolean;
  onEnter: (communityId: string) => void;
}) {
  if (memberships.length === 0) return null;

  const names = memberships.map((m) => hiveDisplayName(m.community?.name));
  const many = names.length > 1;
  // "OG HIVE", "OG HIVE and Tech HIVE", "OG HIVE, Tech HIVE and Production HIVE"
  const nameList = names.length <= 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return (
    <CollapsiblePanel
      title={firstVisit
        ? `Welcome${firstName ? `, ${firstName}` : ''} 🐝`
        : many ? 'Your HIVEs' : 'Your HIVE'}
      // Shut on arrival, like every other panel here. Nat, 2026-08-06: *"deff
      // start the screen with them all collapsed like that, easier to understand
      // what you're looking at."* She was shown the case for keeping this one
      // open — it is the door, and a member who accepted an invite an hour ago
      // needs it — and said all of them, so all of them it is.
      //
      // What makes the door findable while it is shut is where it sits and what
      // it says: second on the page, named "Your HIVEs". It wore a gold left
      // band and then a brighter fill, and Nat undid both — see the note above
      // PANEL_COLOURS before reaching for a third.
      defaultOpen={false}
      colours={PANEL_COLOURS}
      fitTitle
      // The panel's own 16 points along the bottom, like every other panel here.
      // This one asked for 20 and that extra 4 is exactly the kind of almost-
      // the-same Nat keeps spotting. `gap` stays its own number because it is
      // the space between this panel's first-visit line and its pills, which no
      // other panel has.
      bodyStyle={{ gap: 14 }}
    >
      {/* One sentence on a first visit: where you belong, and what is waiting
          there. It ran to three until 2026-08-06 — Nat's standing note that day
          was *"every opportunity to have less words, take it"* — and the two
          that went were both already said somewhere the eye had just been. "This
          page shows all the HIVEs at once" is the panel directly above and the
          line under the title. "Tap the button below to go in" is the buttons
          directly beneath, which carry an arrow. */}
      {firstVisit ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 23, color: INK_SOFT,
          }}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', color: INK }}>{nameList}</Text>{' '}
          {many ? 'are' : 'is'} where the rest of the app is: your profile, the other
          members, the daily question, your wishes, and Clive, who answers questions.
        </Text>
      ) : null}

      {/* The doors themselves.
          Nat, 2026-08-06: *"I think these are really cool nav tools, but they
          seem too big and bulky for our sleek UI."* They were full-width slabs
          49 points tall with a 14-point corner, and three of them took a screen.

          Lighter, not quieter. Everything that does the work stays — each HIVE's
          own colour, its hexagon, the arrow, the full width and the HIVE's plain
          name — and the bulk goes: a pill instead of a slab, 38 points instead
          of 49, smaller type and smaller furniture. A pill reads as a button at
          any height; a tall rounded rectangle only reads as one because it is
          tall.

          ## The hexagon carries the HIVE's colour, and so the pill cannot

          Nat, 2026-08-06: *"These icons dont match how they should. The hexagons
          are black instead of colored. We need to keep continuity."* She is
          comparing them to the rail two inches to the left, where a HIVE is a
          filled comb in its own colour on a dark ground — and to the rest of
          THIS page, where the wishes draw exactly that. The buttons were the
          only place in the app drawing a HIVE's comb in black.

          A comb needs somewhere dark to sit before it can be gold, blue or
          purple: gold on gold disappears. So the colour moved off the pill and
          onto the mark. The pill is that HIVE's colour laid thin over the night
          sky, edged in the same colour at full strength, with the comb and the
          arrow at full strength inside it and the words in cream. That is the
          rail's own recipe — dark ground, coloured comb, cream name — which is
          what "continuity" means here.

          It works for all three because the edge, comb and arrow go through
          `accentOnDark`, which lifts a colour until it can be read on black:
          gold (#bd9348) is already light enough and passes through untouched,
          Tech's #2f4a63 comes back a pale blue, Production's purple a pale
          purple. The thin fill uses the raw colour, because it is doing the
          opposite job — it only has to say which HIVE without lighting up.

          ## The label is the HIVE's name and nothing else

          Nat, 2026-08-06: *"These should just say OG HIVE, Tech HIVE, not 'go
          into', it's implied with a button."* The hexagon, the arrow and the
          pill all say what pressing it does, so the words saying it a fourth
          time were spending room to repeat the furniture.

          Room this row genuinely has: a 375-point phone leaves 166 points for
          words once the rail, the page padding, the panel, the pill, the comb
          and the arrow have taken theirs. "Go into Production HIVE" wanted about
          160 of those, close enough to the edge that the longest name in the app
          broke onto a second line. "Production HIVE" wants about 109, so all
          three fit on one line with room to spare.

          The type stops at 14.5 rather than going smaller, and the second line
          stays allowed — a HIVE named longer than any of today's three wraps
          rather than clipping, and a taller pill is still a pill. */}
      <View style={{ gap: 8 }}>
        {memberships.map((m) => {
          const name = hiveDisplayName(m.community?.name);
          const raw = hiveAccent(m.community);
          // The HIVE's own colour, lifted until it reads on the night sky. The
          // same call the wish combs on this page already make, so one HIVE is
          // one colour everywhere you look.
          const colour = accentOnDark(raw);
          return (
            <Pressable
              key={m.community_id}
              onPress={() => onEnter(m.community_id)}
              accessibilityRole="button"
              // A screen reader gets the words the pill's shape and arrow carry
              // for everybody else, so "Go into" lives on here after coming off
              // the visible label.
              accessibilityLabel={`Go into ${name}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingVertical: 10,
                paddingHorizontal: 14,
                // A pill. Anything big enough to hold the text is the radius.
                borderRadius: 999,
                backgroundColor: accentWash(raw, 0.26),
                // The edge is what says "button" at a glance now that the fill
                // is thin. It costs 3 points of the row, which the labels have
                // to spare — see the note above.
                borderWidth: 1.5,
                borderColor: colour,
              }}
            >
              <HiveMark size={14} colour={colour} />
              <Text
                style={{
                  flex: 1, fontFamily: 'Lato_700Bold', fontSize: 14.5,
                  lineHeight: 19, color: INK,
                }}
                numberOfLines={2}
              >
                {name}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colour} />
            </Pressable>
          );
        })}
      </View>

      {/* The buttons are the end of this panel. A line used to sit here saying
          HIVE-Wide is waiting at the top of the menu on the left with the world
          beside it — the reassurance that going in is not a one-way door. The
          rail says that itself, on every screen, with HIVE-Wide at the top of
          it, so the words were describing something already on the page. Nat,
          2026-08-06: *"get rid of the text at the bottom explaining stuff."* */}
    </CollapsiblePanel>
  );
}

export default function HiveWideScreen() {
  const router = useRouter();
  const openFeedback = useOpenFeedback();
  const { communityId, community, communityRole, profile, refreshProfile, memberships, switchCommunity, wholeHive, enterWholeHive } = useAuth();
  const { appNews: allAppNews } = useAppNews();
  // The same audience as the existing Admin rail door: HIVE admins and
  // treasurers, plus the owners who work across every HIVE.
  const canSeeAdmin = communityRole === 'admin'
    || communityRole === 'treasurer'
    || profile?.is_owner === true;

  // The address is the truth: standing on /hive-wide means standing above the
  // HIVEs, so the mode follows the route. A "fresh honey" reload could land
  // here with the mode still pointing at one HIVE — the page and header said
  // HIVE-Wide while the rail and footer said OG HIVE (Nat, 2026-08-13:
  // "its 1/2 OG & 1/2 HIVE wide... THAT cant happen"). The /hive screen
  // referees the mirror case (wholeHive mode on a one-HIVE page) itself.
  //
  // Runs ONCE per mount, not on every wholeHive change — the first version
  // fired every time wholeHive went false, which includes the split second
  // switchCommunity() sets it false on the way OUT of this screen (tapping
  // OG HIVE in the rail while standing on HIVE-Wide). This screen was still
  // mounted for that one frame, so it flipped the mode straight back to true
  // before the navigation to /hive landed, and the tap did nothing (Nat,
  // 2026-08-13: "its not letting me click on 'OG HIVE' at all"). A stale
  // arrival only ever needs correcting once, right when the screen appears.
  const wholeHiveCorrectedRef = useRef(false);
  useEffect(() => {
    if (wholeHiveCorrectedRef.current) return;
    wholeHiveCorrectedRef.current = true;
    if (!wholeHive) enterWholeHive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether this person has ever opened the HIVE-Wide explainer is the same
  // question as whether they have been here before, so the door reads that flag
  // rather than inventing a second "have you seen this?" one on the profile.
  // (Opening it is what writes it now that every panel starts shut — see
  // `components/ui/HiveWideWelcome.tsx`.)
  const firstVisit = loadHiveWideWelcomeSeen(profile) !== HIVE_WIDE_WELCOME_VERSION;


  /**
   * The record, in days.
   *
   * Nat, 2026-08-05: "this is what we implemented on this date & this date &
   * this date? that would be cool to see." A flat list of forty-five lines is a
   * list; the same lines under their dates are a history, and the shape of the
   * work — a quiet week, then eleven things in one afternoon — only shows up
   * once the days are drawn.
   */
  const appNewsByDay = useMemo(() => {
    const days: { date: string; entries: typeof allAppNews }[] = [];
    allAppNews.forEach((entry) => {
      const last = days[days.length - 1];
      if (last && last.date === entry.date) last.entries.push(entry);
      else days.push({ date: entry.date, entries: [entry] });
    });
    return days;
  }, [allAppNews]);
  const oldestAppNews = allAppNews.length
    ? allAppNews[allAppNews.length - 1].date
    : new Date().toISOString().slice(0, 10);
  const { width } = useWindowDimensions();
  // These boxes need real width before they stop being narrow columns of
  // broken words. Below this they stack, in Nat's order.
  const wide = width >= 900;

  /**
   * The room the title has, and the size that fills it without breaking.
   *
   * Measured rather than worked out from the window, because the rail sits
   * beside this page and changes width when somebody opens it. Until the first
   * measurement lands we guess low — the window less the padding and the
   * narrowest the rail is ever drawn — so the very first frame is a title that
   * is slightly small rather than a title that wraps.
   */
  const [measuredTitleRoom, setMeasuredTitleRoom] = useState(0);
  const titleRoom = measuredTitleRoom || Math.max(
    TITLE_MIN * TITLE_EMS,
    width - HERO_PADDING * 2 - RAIL_AT_ITS_NARROWEST
  );
  const titleSize = Math.max(TITLE_MIN, Math.min(TITLE_MAX, titleRoom / TITLE_EMS));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hives, setHives] = useState<Community[]>([]);
  const [upcoming, setUpcoming] = useState<HiveEvent[]>([]);
  const [wideWishes, setWideWishes] = useState<WideWish[]>([]);

  /**
   * Three things, and only three: the HIVEs, what they have coming up, and the
   * wishes somebody sent out to everyone.
   *
   * It used to fetch three more — `monthly_focus`, `board_categories` and the
   * `board_posts` behind them — for boxes that came off the page weeks ago. The
   * rows arrived, went into state and were read by nothing. Nat asked about load
   * times on 2026-08-06 and this was half the page's waiting. Deleted rather
   * than left commented out: a query nobody draws is a page nobody can explain.
   */
  const load = useCallback(async () => {
    try {
      // Every HIVE this person can see, oldest first — which puts OG HIVE at
      // the top of both lists without anyone hard-coding an order.
      const { data: hiveRows } = await supabase
        .from('communities')
        .select('id, name, slug, accent_color, created_at')
        .order('created_at', { ascending: true });
      const hiveList = (hiveRows ?? []) as unknown as Community[];
      setHives(hiveList);

      if (hiveList.length > 0) {
        const today = getLocalIsoDate(new Date());
        const { data: eventRows } = await supabase
          .from('events')
          .select('id, title, event_date, event_time, end_time, event_type, community_id, end_date, visibility')
          .in('community_id', hiveList.map((hive) => hive.id))
          .gte('event_date', today)
          .or('status.is.null,status.eq.scheduled')
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });
        setUpcoming((eventRows ?? []) as unknown as HiveEvent[]);
      } else {
        setUpcoming([]);
      }

      // Every wish that was marked to travel. The RLS policy already decides
      // which of these this person may see, so no community filter here — that
      // is the whole point of the scope.
      const { data: wishRows } = await supabase
        .from('wishes')
        .select('id, title, description, user:profiles!user_id(name, avatar_url), community:communities(name, accent_color)')
        .eq('share_scope', 'all_hives')
        .eq('status', 'public')
        .or('is_active.is.true,is_active.is.null')
        .order('created_at', { ascending: false })
        .limit(6);
      setWideWishes((wishRows ?? []) as unknown as WideWish[]);
    } catch (error) {
      // One query falling over used to leave the whole page spinning with
      // nothing on it. Keep whatever did load, say so in the log, and let a
      // pull-down try again (2026-08-03).
      console.warn('Could not load HIVE-Wide', error);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // The events come back in date order, so the first one a HIVE puts in the map
  // is the next one it has. Birthdays are made for us by the app rather than
  // planned by anybody, so they'd bury the real plans — the monthly tune-up
  // leaves them out of its hang list for the same reason.
  const nextHangByHive = useMemo(() => {
    const byHive = new Map<string, HiveEvent>();
    upcoming.forEach((event) => {
      if (!isAHang(event)) return;
      if (!byHive.has(event.community_id)) byHive.set(event.community_id, event);
    });
    return byHive;
  }, [upcoming]);

  /**
   * Every meeting you personally have to be at, across all of them.
   *
   * Nat, 2026-08-12: *"so if you're in multiple hives you can see all of your
   * meetings in one place."* Which is the one job HIVE-Wide has — Meetings is
   * `hidden` up here (`lib/navigation.ts`), because a meeting belongs to one
   * HIVE, so without this box somebody in three HIVEs has to walk into all
   * three to find out when they are next expected anywhere.
   *
   * YOUR meetings, not every meeting: filtered to the HIVEs you actually
   * belong to. `upcoming` covers every HIVE you can SEE, which is a wider net
   * than the ones you are in, and a Production HIVE meeting is not on Nat's
   * calendar just because she can see it exists.
   */
  const myMeetings = useMemo(() => {
    const mine = new Set(memberships.map((m) => m.community_id));
    return upcoming
      .filter((event) => event.event_type === 'meeting' && mine.has(event.community_id))
      .slice(0, 5);
  }, [upcoming, memberships]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SPACE_BLACK }} edges={['top']}>
      {/* The hero IS the header here. A pale wash behind a cream page was
          invisible — "a giant fail" (Nat 2026-08-03) — so the world gets its own
          deep band to live in, and the title sits in it. */}
      {/* You are standing above the HIVEs. It should look like it before you've
          read a word (Nat 2026-08-03). */}
      <SpaceGlobe />
      {/* Room at the top, above the world, said the way the HIVE home pages say
          it — small line, big name, small line (Nat 2026-08-03). */}
      <View
        style={{ paddingTop: 26, paddingBottom: 4, paddingHorizontal: HERO_PADDING }}
        onLayout={(event) => {
          const room = event.nativeEvent.layout.width - HERO_PADDING * 2;
          setMeasuredTitleRoom((was) => (Math.abs(was - room) > 0.5 ? room : was));
        }}
      >
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontSize: 13, letterSpacing: 3,
            textTransform: 'uppercase', color: 'rgba(255,248,233,0.55)', textAlign: 'center',
          }}
        >
          HIVE-Wide
        </Text>
        {/* One line, always. The tracking rides the size so a phone's smaller
            title has the same letter rhythm as a laptop's. */}
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: titleSize,
            letterSpacing: titleSize * TITLE_TRACKING,
            color: INK, textAlign: 'center', marginTop: 4,
          }}
        >
          Home
        </Text>
      </View>
      {/* The title lives in the sky rather than in a bar. There is no header on
          HIVE-Wide on purpose — "it's just part of outer space" (Nat 2026-08-03),
          and a gold bar across the top would put you back inside a HIVE. */}
      <BounceScrollView
        // Held to a column in the middle of the page rather than run edge to
        // edge (Nat 2026-08-04: "this feels a little too squishy to me, the
        // boxes should sit in the middle of the page please"). On a wide
        // monitor two half-width boxes stretched to nearly a metre each, so
        // three words of content sat in an acre of card and the eye had to
        // travel the whole screen to read a line. 1240 is the same width the
        // profile and settings pages already hold themselves to.
        contentContainerStyle={{
          padding: 16,
          gap: 18,
          paddingBottom: 44,
          // The air under the title. The page has no header bar — the title
          // floats in the sky — so this number plus the hero's own 4 points is
          // the whole gap between the title and the first panel.
          //
          // It has come down twice, each time because a panel that opens with a
          // title of its own needs less air under the headline than the row of
          // cards this was first measured for. 84 → 62 (Nat, 2026-08-05: "i'd
          // shift it up a teeny tiny bit closer to the heading") → 38 (Nat,
          // 2026-08-06: "I think we can scoot this up a teeensy bit. We want
          // some space, but we don't need that much space").
          //
          // 38 leaves deliberate room without turning the first panel into a
          // second screen. 66 was reading as a hole in the page.
          paddingTop: 38,
          width: '100%',
          maxWidth: 1240,
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* The welcome Nat asked for on 2026-08-03. It was built that day,
            given a column to remember its dismissal (`hive_wide_welcome_seen`)
            and then never put on a page — so no member has ever seen it.
            Dismissing it follows the person rather than the device, so putting
            it away on the phone puts it away on the laptop.

            It is the FIRST thing on the page. Nat, 2026-08-06: *"i like the
            'enter your hives here' thats nice, i think the 'what is HIVE wide'
            should be first."* What this page is comes before the way off it.

            Outside the loading branch, like the door under it. Both are built
            from who you are, which the app knows the moment you sign in — so
            they hold their order while the rest of the page is still fetching,
            rather than the explainer appearing above the door a second later
            and shoving it down. */}
        {/* A pending invitation to another HIVE, if one is waiting for this
            person's email. FIRST on the page and never collapsed, on purpose:
            on 2026-08-04 Lucas was invited to Tech HIVE, the invite email
            silently failed to send, and when he came looking in the app there
            was nowhere that showed him the invitation at all. Everybody lands
            here, so here is where the invitation stands. For everyone without
            one waiting — almost everyone, almost always — it renders nothing. */}
        <PendingInviteDoor
          colours={PANEL_COLOURS}
          onJoined={async (id) => {
            // The same landing the email-link join gives: say they just
            // joined, reload who they are, and walk them into the HIVE they
            // accepted — not leave them looking at the Earth.
            markJustJoinedHive(id);
            await refreshProfile();
            await switchCommunity(id);
          }}
        />
        <HiveWideWelcome
          // The same object every other panel here gets. It used to keep its own
          // copy of these colours and the copy had drifted a couple of percent
          // (Nat, 2026-08-06: "Only thing missing is continuity").
          colours={PANEL_COLOURS}
          // Phone still lands with everything shut (Nat, 2026-08-06 — see the
          // note in this panel's own file). A computer has the room to show it,
          // and Nat pointed at exactly this open on a desktop screenshot and
          // said "should land with this open, like that" (2026-08-08) — so
          // `wide`, the same threshold the three boxes below use, decides it.
          defaultOpen={wide}
          seenVersion={loadHiveWideWelcomeSeen(profile)}
          onDismiss={(version) => {
            void persistHiveWideWelcomeSeen(profile, version).then(() => refreshProfile());
          }}
        />
        {loading ? (
          <ThinkingBee />
        ) : (
          <>
            {/* Boxes, two by two — the same shape as a HIVE's own home
                page, so HIVE-Wide stops being a layout of its own (Nat
                2026-08-03: "I love the colours and the look, but I want it to
                have the same layout as other HIVEs").

                A wrapping row of half-width cells rather than two hand-built
                columns: it collapses to a single stack on a phone without a
                second set of rules, and a fifth box later just lands in the
                next slot. */}
            <View
              style={{
                flexDirection: wide ? 'row' : 'column',
                flexWrap: wide ? 'wrap' : 'nowrap',
                // One rhythm down the whole page. The scroll view sets 18
                // between the welcome, the door and this group; this group used
                // to set 12 between the boxes inside it, so the spacing quietly
                // tightened halfway down — and on a phone, where the boxes
                // stack, that is five panels in one column with two different
                // gaps in it. The 12 stays only as the gutter BETWEEN two
                // side-by-side boxes on a wide screen, which is a different job.
                rowGap: 18,
                columnGap: 12,
              }}
            >
              {/* The door is one of the cubes now.
                  It used to sit full-width above this grid, which left the page
                  reading as one long box, then two short ones, then another
                  long one. Nat, 2026-08-12: *"i think all of these sub ones
                  should be shorties & we can cube it up, instead of having some
                  really long ones, they look silly."*
                  Welcome stays big and full-width above — that one she likes
                  exactly as it is. Everything under it is a cube. */}
              <View style={{ flexGrow: 0, flexBasis: wide ? '48%' : 'auto' }}>
                <WayIntoYourHive
                  memberships={memberships}
                  firstName={(profile?.name ?? '').trim().split(/\s+/)[0] || null}
                  firstVisit={firstVisit}
                  // Picking a HIVE by name is how you come down out of
                  // HIVE-Wide — `switchCommunity` clears the HIVE-Wide standing
                  // and lands you on that HIVE's home page.
                  onEnter={(id) => { void switchCommunity(id); }}
                />
              </View>
              {/* The wishes that travel — the home they never had.
                  Marking a wish HIVE-Wide worked all along and then it went
                  nowhere visible, so the setting read as broken because its
                  RESULT was missing. HIVE Help and HIVE Hangs came out to make
                  room: both were three lines of "tbd" repeated per HIVE, and
                  neither is a thing you can act on from up here. */}
              {/* Your meetings, wherever they are. Tapping one steps you into
                  that HIVE and opens its Meetings page, because that is where
                  the deck, the notes and the check-in for it live. */}
              <TopBox label="Your Meetings" wide={wide}>
                {myMeetings.length > 0 ? (
                  <View style={{ gap: 9 }}>
                    {myMeetings.map((event) => {
                      const hive = hives.find((h) => h.id === event.community_id);
                      return (
                        <Pressable
                          key={event.id}
                          onPress={() => {
                            void switchCommunity(event.community_id);
                            router.push('/meetings' as never);
                          }}
                          style={{
                            flexDirection: 'row', alignItems: 'flex-start', gap: 9,
                            paddingVertical: 10, paddingHorizontal: 12,
                            borderRadius: 12, borderWidth: 1,
                            borderColor: CARD_EDGE, backgroundColor: CARD_FILL,
                          }}
                        >
                          <View style={{ paddingTop: 3 }}>
                            <HiveMark size={12} colour={accentOnDark(hiveAccent(hive))} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: INK, lineHeight: 19 }}
                              numberOfLines={2}
                            >
                              {normalizeHiveBrandText(event.title)}
                            </Text>
                            <Text
                              style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: INK_FAINT, marginTop: 2 }}
                            >
                              {[
                                formatDateLong(event.event_date),
                                // "5:00 – 7:00 PM" once the meeting has an end
                                // time — Nat: "i couldnt add window, like
                                // 5-7, i could only put in 5pm" (migration
                                // 202). Null end time reads exactly as before.
                                event.event_time ? formatTimeRange(event.event_time, event.end_time) : null,
                                hive?.name ? hiveDisplayName(hive.name) : null,
                              ].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14,
                      lineHeight: 21, color: INK_SOFT,
                    }}
                  >
                    Nothing on the books yet. When a HIVE you&rsquo;re in schedules its next
                    meeting, it turns up here.
                  </Text>
                )}
              </TopBox>

              {/* The whole month of HIVE life, at a glance.
                  Nat's parked idea, her words: "A genuinely HIVE-Wide
                  calendar, with a coloured bee per HIVE's meeting day."
                  The box above answers "when am I expected somewhere?"; this
                  one answers "when is everybody meeting?" — every HIVE's
                  meeting days, yours or not, each wearing its own colour.
                  The days come through migration 176's narrow window: day,
                  time, title, whose — never a Meet link, notes or recordings,
                  which stay inside their own HIVE. */}
              <TopBox label="HIVE-Wide Calendar" wide={wide}>
                <HiveWideCalendar
                  hives={hives}
                  myHiveIds={memberships.map((m) => m.community_id)}
                  colours={PANEL_COLOURS}
                  onOpenMeetings={(id) => {
                    // The same walk the meetings box above takes: step into
                    // that HIVE, then open its Meetings page.
                    void switchCommunity(id);
                    router.push('/meetings' as never);
                  }}
                />
              </TopBox>

              <TopBox label="HIVE-Wide Wishes" wide={wide}>
                {wideWishes.length > 0 ? (
                  <View style={{ gap: 9 }}>
                    {wideWishes.slice(0, 4).map((wish) => (
                      <Pressable
                        key={wish.id}
                        onPress={() => router.push('/members' as never)}
                        style={{
                          flexDirection: 'row', alignItems: 'flex-start', gap: 9,
                          paddingVertical: 10, paddingHorizontal: 12,
                          borderRadius: 12, borderWidth: 1,
                          borderColor: CARD_EDGE, backgroundColor: CARD_FILL,
                        }}
                      >
                        <View style={{ paddingTop: 3 }}>
                          <HiveMark size={12} colour={accentOnDark(hiveAccent(wish.community))} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: INK, lineHeight: 19 }}
                            numberOfLines={2}
                          >
                            {wish.title?.trim() || wish.description}
                          </Text>
                          <Text
                            style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: INK_FAINT, marginTop: 2 }}
                          >
                            {[wish.user?.name?.split(/\s+/)[0], wish.community?.name ? hiveDisplayName(wish.community.name) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14,
                      lineHeight: 21, color: INK_SOFT,
                    }}
                  >
                    Mark a wish HIVE-Wide and it turns up here, where every HIVE can see it.
                  </Text>
                )}
              </TopBox>

              {/* HIVE-Wide Chat came out (Nat 2026-08-04): "when we're ready
                  for the chat, we'll just add that into the vertical nav bar."
                  Which is right — a room is a destination, and destinations
                  live in the rail. A box that only says "not yet" is a box
                  taking up a slot that something real could use. */}
              {/* What's new in the app.
                  Nat remembered what this slot was always for (2026-08-04):
                  "one of them is supposed to be for what's new tech-wise in the
                  app! So all my little updates go right there!"

                  It reads `lib/appNews.ts` — the same list the Home strip and
                  the newsletter draft already read, so shipping a feature
                  updates all three at once and there is no fourth place to
                  remember. This replaced "What's happening", which could never
                  fill up: the shared boards went home to OG in migration 142,
                  so nothing was coming. */}
              {/* Everything, not a sample.
                  Nat, 2026-08-05: "its cool to see too, if we populate that at
                  the end of every session? So people can see how much work goes
                  into it? or i can see how much work i've done and know i'm
                  actually doing something?" She was offered a members-see-the-
                  highlights version and picked the whole record on purpose. So
                  it scrolls inside its own box rather than showing the top four,
                  and it opens with the count, because the count is the part that
                  answers her question. */}
              <TopBox label="What We've Been Building" wide={wide}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <CompactDoor label="Read The Buzz" onPress={() => router.push('/buzz' as never)} />
                  {canSeeAdmin ? (
                    <CompactDoor label="Admin" onPress={() => router.push('/admin' as never)} />
                  ) : null}
                </View>
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12.5,
                    color: INK_FAINT, marginBottom: 9,
                  }}
                >
                  {allAppNews.length} changes since {formatDateLong(oldestAppNews)}
                </Text>
                <BounceScrollView
                  // Taller now that it is a history with dates in it rather
                  // than a handful of lines — 208px showed about two days.
                  // The shared bounce, same as the page behind it — every
                  // scrollable says "that's the end" the same way (Nat's
                  // standing rule, 2026-08-06).
                  style={{ maxHeight: wide ? 340 : 380 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                <View style={{ gap: 9 }}>
                  {appNewsByDay.map((day) => (
                    <View key={day.date} style={{ gap: 9 }}>
                      <Text
                        style={{
                          fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1.1,
                          textTransform: 'uppercase', color: INK_FAINT, marginTop: 4,
                        }}
                      >
                        {formatDateLong(day.date)}
                        {day.entries.length > 1 ? ` · ${day.entries.length} things` : ''}
                      </Text>
                      {day.entries.map((entry) => (
                    <Pressable
                      key={entry.id}
                      disabled={!entry.href}
                      onPress={() => {
                        if (!entry.href) return;
                        if (entry.href.pathname === '/app-feedback') {
                          openFeedback({ pathname: '/hive-wide', captureRequested: true });
                        } else {
                          router.push(entry.href as never);
                        }
                      }}
                      style={{
                        paddingVertical: 10, paddingHorizontal: 12,
                        borderRadius: 12, borderWidth: 1,
                        borderColor: CARD_EDGE, backgroundColor: CARD_FILL,
                      }}
                    >
                      <Text
                        style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: INK, lineHeight: 19 }}
                        numberOfLines={2}
                      >
                        {entry.title}
                      </Text>
                      {entry.detail ? (
                        <Text
                          style={{
                            fontFamily: 'Lato_400Regular', fontSize: 12.5,
                            color: INK_SOFT, lineHeight: 18, marginTop: 2,
                          }}
                          numberOfLines={2}
                        >
                          {entry.detail}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                    </View>
                  ))}
                </View>
                </BounceScrollView>
              </TopBox>
            </View>
          </>
        )}
      </BounceScrollView>
    </SafeAreaView>
  );
}

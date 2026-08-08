import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { HIVE_WIDE_WELCOME, SCOPE_LADDER, HIVE_WIDE_WELCOME_VERSION } from '../../lib/hiveWide';
import { CollapsiblePanel, type CollapsiblePanelColours } from './CollapsiblePanel';
import { ScopeBadge } from './ScopeBadge';
import type { Community } from '../../types';

/**
 * "Welcome to our new landing page" — the who, what and why of HIVE-Wide.
 *
 * Nat's ask, 2026-08-03. It is the panel she picked out on 2026-08-06 — *"i
 * like the 'what is hive wide'... thats a really nice feature, i like!"* — so
 * the opening and shutting moved into `CollapsiblePanel` and every other panel
 * on the page wears it too. The header carries both names: the question while
 * it is away, the welcome's own title once it is open.
 *
 * ## It starts shut on a phone, open on a computer
 *
 * It used to spring open on a first visit, then start shut everywhere (Nat, on
 * her phone, 2026-08-06: *"deff start the screen with them all collapsed like
 * that, easier to understand what you're looking at"*). A computer has the
 * room a phone doesn't, and Nat pointed at exactly this panel open in a
 * desktop screenshot and said it should land that way (2026-08-08) — so
 * `defaultOpen` is `true` only past the same width the three boxes lower on
 * the page use to go from stacked to side-by-side.
 *
 * That moved when this counts as read. Shutting it used to be the signal, which
 * no longer works — nobody shuts a panel they never opened — so **opening it is
 * the signal now**. That flag is also how the page below knows whether to say
 * the long hello (`firstVisit` in `app/(app)/hive-wide.tsx`), and it follows the
 * person rather than the device, so reading it on the phone counts on the
 * laptop.
 *
 * The colour ladder is shown by USING it rather than describing it: the real
 * badges, in the order they travel. Somebody who skims the words still leaves
 * knowing that the hexagon is home and the world is further.
 *
 * ## It is drawn for space, and only for space
 *
 * This lives on the HIVE-Wide page, which is a photograph of the Earth at
 * night, so it is dark panel with light ink using that page's own tokens rather
 * than the cream-and-charcoal every other card in the app uses. It was cream
 * when it was written, which would have put a bright slab across the sky.
 *
 * ## The page hands it every colour it uses
 *
 * Nat, 2026-08-06, on the finished landing page: *"Only thing missing is
 * continuity."* This file used to keep its own copy of the page's tokens, and
 * the copy had drifted — its quiet ink was 74% where the page's was 72%, and its
 * faintest ink 50% where the page's was 45%. Near enough to look like nothing in
 * a diff, and exactly the sort of nearly-but-not-quite Nat keeps seeing on the
 * screen.
 *
 * So `app/(app)/hive-wide.tsx` owns the palette and passes it in, the same
 * object it gives every other panel on the page. One place to change a colour,
 * and a panel that cannot quietly drift away from its neighbours.
 */

/**
 * The ladder, taught by showing the actual badges.
 *
 * This used to draw its own pills — outlined in the HIVE's colour, filled in
 * green — which meant the welcome page taught a vocabulary the rest of the app
 * never spoke. Somebody learned it here and then met a padlock and a bee
 * everywhere else. It now renders the real `ScopeBadge`, so the lesson cannot
 * drift from the thing it is a lesson about (Nat 2026-08-05).
 */
export function ScopeBadgeSample({
  rung,
  community,
}: {
  rung: (typeof SCOPE_LADDER)[number];
  community?: Community | null;
}) {
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <ScopeBadge scope={rung.key} community={community} compact tone="dark" />
    </View>
  );
}

export function HiveWideWelcome({
  community,
  colours,
  inkFaint,
  defaultOpen = false,
  seenVersion,
  onDismiss,
}: {
  community: Community | null;
  /**
   * The one palette HIVE-Wide gives every panel on it. Required rather than
   * optional, so this panel is drawn in the page's colours or not at all.
   */
  colours: CollapsiblePanelColours;
  /** The page's quietest ink, for the footnote under the ladder. */
  inkFaint: string;
  /**
   * A phone still lands shut — there isn't the room, and Nat wants the arrival
   * screen to read as a contents page there. A wide screen has the room to
   * show the answer straight away (Nat, 2026-08-08). Screens too narrow for
   * this never pass `true`, so the shut-by-default behaviour is unchanged for
   * them.
   */
  defaultOpen?: boolean;
  /** What this person has already put away, from their profile. */
  seenVersion: string | null;
  onDismiss: (version: string) => void;
}) {
  const alreadySeen = seenVersion === HIVE_WIDE_WELCOME_VERSION;
  const [open, setOpen] = useState(defaultOpen);

  // Opening it is how you say you have read it (below, on a manual toggle).
  // Landing on a wide screen with it already open is the same thing by
  // another door — nobody taps a panel that greeted them already open — so it
  // marks itself read the same way, once, rather than leaving `firstVisit`
  // stuck true for every desktop visit after this.
  useEffect(() => {
    if (defaultOpen && !alreadySeen) onDismiss(HIVE_WIDE_WELCOME_VERSION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The body's own type takes the same ink and the same gold as the header, so
  // an open panel is the shut panel with more of it rather than a second design.
  const inkSoft = colours.inkSoft;
  const gold = colours.accent;

  return (
    <CollapsiblePanel
      title={HIVE_WIDE_WELCOME.title}
      collapsedTitle="What is HIVE-Wide?"
      open={open}
      onToggle={(next) => {
        setOpen(next);
        // Opening it is how you say you have read it. Written once, because
        // coming back later to check something should not cost another round
        // trip to the profile.
        if (next && !alreadySeen) onDismiss(HIVE_WIDE_WELCOME_VERSION);
      }}
      colours={colours}
      // No gold band down the left edge, and no panel on HIVE-Wide has one.
      // Nat, 2026-08-06: *"why do the first 2 have gold on the left hand side &
      // the other ones dont? That feels weird and inconsistent."* The band was
      // tried on one panel and she asked about it again — see the note in
      // `app/(app)/hive-wide.tsx`.
      //
      // The title takes the panel's own size (17), same as every other panel
      // here, and no `titleStyle` of its own. It used to be set at 19 and broke
      // in half: the shut title, "What is HIVE-Wide?", wanted 215 of the 188
      // points a 375-point phone left it once the question-mark badge and the
      // chevron had taken their share.
      //
      // With the badge gone (Nat, 2026-08-06: *"get rid of it"*) that column is
      // 218 points on the same phone, and the shut title wants about 192 of
      // them — so it now sets at the full 17 with nothing shrinking it at all.
      // The open title, "Welcome to HIVE-Wide", is the longer of the two and
      // lands within a few points of the line; `fitTitle` stays on so that one
      // takes a hair off itself on the narrowest screens instead of wrapping.
      fitTitle
      bodyStyle={{ gap: 16 }}
    >
      {HIVE_WIDE_WELCOME.panels.map((panel) => (
        <View key={panel.heading} style={{ gap: 4 }}>
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: 11,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: gold,
            }}
          >
            {panel.heading}
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 14,
              lineHeight: 21,
              color: inkSoft,
            }}
          >
            {panel.body}
          </Text>
        </View>
      ))}

      {/* The colours, taught by wearing them. */}
      <View
        style={{
          gap: 10,
          paddingTop: 14,
          borderTopWidth: 1,
          // The page's one edge colour, the same hairline that draws the panel
          // itself. It was a cream 12% of its own, which read as a second kind
          // of line inside a panel drawn with the first kind.
          borderTopColor: colours.border,
        }}
      >
        <Text
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: gold,
          }}
        >
          How far something travels
        </Text>
        {SCOPE_LADDER.map((rung) => (
          <View
            key={rung.key}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}
          >
            <View style={{ width: 172 }}>
              <ScopeBadgeSample rung={rung} community={community} />
            </View>
            <Text
              style={{
                flex: 1,
                minWidth: 180,
                fontFamily: 'Lato_400Regular',
                fontSize: 13.5,
                lineHeight: 19,
                color: inkSoft,
              }}
            >
              {rung.meaning}
            </Text>
          </View>
        ))}
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 13,
            lineHeight: 19,
            color: inkFaint,
            marginTop: 2,
          }}
        >
          The hexagon is your HIVE. The world means it&rsquo;s gone further.
        </Text>
      </View>
    </CollapsiblePanel>
  );
}

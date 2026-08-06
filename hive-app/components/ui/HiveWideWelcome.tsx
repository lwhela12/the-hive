import { useState } from 'react';
import { View, Text } from 'react-native';
import { HIVE_WIDE_WELCOME, SCOPE_LADDER, HIVE_WIDE_WELCOME_VERSION } from '../../lib/hiveWide';
import { CollapsiblePanel } from './CollapsiblePanel';
import { ScopeBadge } from './ScopeBadge';
import type { Community } from '../../types';

/**
 * "Welcome to our new landing page" — the who, what and why of HIVE-Wide.
 *
 * Nat's ask, 2026-08-03. It opens expanded the first time somebody lands here
 * and collapses to a single line once they've read it, because an explanation
 * you can't put away becomes furniture you stop seeing.
 *
 * It is the panel Nat picked out on 2026-08-06 — *"i like the 'what is hive
 * wide'... thats a really nice feature, i like!"* — so the opening and shutting
 * moved into `CollapsiblePanel` and every other panel on the page wears it too.
 * The header carries both names: the question while it is away, the welcome's
 * own title once it is open.
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
 */

/** The HIVE-Wide page's own tokens, so this box belongs to the page it is on. */
const INK = '#FFF8E9';
const INK_SOFT = 'rgba(255,248,233,0.74)';
const INK_FAINT = 'rgba(255,248,233,0.5)';
const CARD_FILL = 'rgba(255,248,233,0.055)';
const CARD_EDGE = 'rgba(255,226,166,0.22)';
/** The gold that reads on space — the same one the page's headings use. */
const GOLD_ON_SPACE = '#E8C77E';

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
  seenVersion,
  onDismiss,
}: {
  community: Community | null;
  /** What this person has already put away, from their profile. */
  seenVersion: string | null;
  onDismiss: (version: string) => void;
}) {
  const alreadySeen = seenVersion === HIVE_WIDE_WELCOME_VERSION;
  /**
   * Null until this person opens or shuts it themselves; until then it follows
   * whether they have read it. The profile lands a moment after the page does,
   * so a state initialised once from `seenVersion` would latch onto "not read
   * yet" and hang open for somebody who put this away weeks ago.
   */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? !alreadySeen;

  return (
    <CollapsiblePanel
      title={HIVE_WIDE_WELCOME.title}
      collapsedTitle="What is HIVE-Wide?"
      icon="help-circle-outline"
      open={open}
      onToggle={(next) => {
        setChosen(next);
        // Shutting it is how you say you have read it — the same write the
        // little X used to do, so putting it away on the phone still puts it
        // away on the laptop. Only written the first time, because reopening it
        // later to check something should not cost a round trip to the profile.
        if (!next && !alreadySeen) onDismiss(HIVE_WIDE_WELCOME_VERSION);
      }}
      colours={{
        ink: INK,
        inkSoft: INK_SOFT,
        fill: CARD_FILL,
        border: CARD_EDGE,
        accent: GOLD_ON_SPACE,
        pressed: 'rgba(255,248,233,0.1)',
      }}
      style={{ borderLeftWidth: 4, borderLeftColor: GOLD_ON_SPACE }}
      titleStyle={{ fontSize: 19 }}
      bodyStyle={{ gap: 16 }}
    >
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontSize: 14.5,
          lineHeight: 22,
          color: INK_SOFT,
        }}
      >
        {HIVE_WIDE_WELCOME.standfirst}
      </Text>

      {HIVE_WIDE_WELCOME.panels.map((panel) => (
        <View key={panel.heading} style={{ gap: 4 }}>
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: 11,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: GOLD_ON_SPACE,
            }}
          >
            {panel.heading}
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 14,
              lineHeight: 21,
              color: INK_SOFT,
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
          borderTopColor: 'rgba(255,248,233,0.12)',
        }}
      >
        <Text
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: GOLD_ON_SPACE,
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
                color: INK_SOFT,
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
            color: INK_FAINT,
            marginTop: 2,
          }}
        >
          The hexagon is your HIVE, in your HIVE&rsquo;s colour. The world appears
          when something has gone further than that.
        </Text>
      </View>
    </CollapsiblePanel>
  );
}

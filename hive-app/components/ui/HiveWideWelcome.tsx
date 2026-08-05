import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIVE_WIDE_WELCOME, SCOPE_LADDER, HIVE_WIDE_WELCOME_VERSION } from '../../lib/hiveWide';
import { ScopeBadge } from './ScopeBadge';
import type { Community } from '../../types';

/**
 * "Welcome to our new landing page" — the who, what and why of HIVE-Wide.
 *
 * Nat's ask, 2026-08-03. It opens expanded the first time somebody lands here
 * and collapses to a single line once they've read it, because an explanation
 * you can't put away becomes furniture you stop seeing.
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
  const [open, setOpen] = useState(!alreadySeen);

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="What is HIVE-Wide?"
        style={{
          flexDirection: 'row',
          alignSelf: 'flex-start',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: CARD_EDGE,
          backgroundColor: CARD_FILL,
        }}
      >
        <Ionicons name="help-circle-outline" size={17} color={GOLD_ON_SPACE} />
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, color: INK_SOFT }}>
          What is HIVE-Wide?
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: CARD_EDGE,
        borderLeftWidth: 4,
        borderLeftColor: GOLD_ON_SPACE,
        backgroundColor: CARD_FILL,
        padding: 20,
        gap: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 19,
              color: INK,
              marginBottom: 6,
            }}
          >
            {HIVE_WIDE_WELCOME.title}
          </Text>
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
        </View>
        <Pressable
          onPress={() => {
            setOpen(false);
            onDismiss(HIVE_WIDE_WELCOME_VERSION);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Put this away"
        >
          <Ionicons name="close" size={20} color={INK_FAINT} />
        </Pressable>
      </View>

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
    </View>
  );
}

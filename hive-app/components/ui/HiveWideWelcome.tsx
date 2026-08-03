import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIVE_WIDE_WELCOME, SCOPE_LADDER, HIVE_WIDE_WELCOME_VERSION } from '../../lib/hiveWide';
import { hiveAccent } from '../../lib/hiveBrand';
import type { Community } from '../../types';

/**
 * "Welcome to our new landing page" — the who, what and why of HIVE-Wide.
 *
 * Nat's ask, 2026-08-03. It opens expanded the first time somebody lands here
 * and collapses to a single line once they've read it, because an explanation
 * you can't put away becomes furniture you stop seeing.
 *
 * The colour ladder is shown by USING the colours rather than describing them:
 * three real badges, in the order they travel. Somebody who skims the words
 * still leaves knowing that green means further.
 */

export const HIVE_WIDE_GREEN = '#3F7D5C';

export function ScopeBadgeSample({
  rung,
  hiveColour,
}: {
  rung: (typeof SCOPE_LADDER)[number];
  hiveColour: string;
}) {
  const solid = rung.treatment === 'green-solid';
  const green = rung.treatment !== 'hive-colour';
  const colour = green ? HIVE_WIDE_GREEN : hiveColour;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colour,
        backgroundColor: solid ? colour : 'transparent',
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: 11,
          letterSpacing: 0.6,
          color: solid ? '#fff' : colour,
        }}
      >
        {rung.label}
      </Text>
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
  const hiveColour = hiveAccent(community);

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="What is HIVE-Wide?"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(63,125,92,0.3)',
        }}
      >
        <Ionicons name="help-circle-outline" size={17} color={HIVE_WIDE_GREEN} />
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, color: HIVE_WIDE_GREEN }}>
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
        borderColor: 'rgba(63,125,92,0.25)',
        borderLeftWidth: 4,
        borderLeftColor: HIVE_WIDE_GREEN,
        backgroundColor: '#fffdf6',
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
              color: '#313130',
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
              color: 'rgba(49,49,48,0.72)',
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
          <Ionicons name="close" size={20} color="rgba(49,49,48,0.4)" />
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
              color: HIVE_WIDE_GREEN,
            }}
          >
            {panel.heading}
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 14,
              lineHeight: 21,
              color: 'rgba(49,49,48,0.78)',
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
          borderTopColor: 'rgba(49,49,48,0.1)',
        }}
      >
        <Text
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: HIVE_WIDE_GREEN,
          }}
        >
          How far something travels
        </Text>
        {SCOPE_LADDER.map((rung) => (
          <View key={rung.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 88 }}>
              <ScopeBadgeSample rung={rung} hiveColour={hiveColour} />
            </View>
            <Text
              style={{
                flex: 1,
                fontFamily: 'Lato_400Regular',
                fontSize: 13.5,
                lineHeight: 19,
                color: 'rgba(49,49,48,0.68)',
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
            color: 'rgba(49,49,48,0.55)',
            marginTop: 2,
          }}
        >
          The further something travels, the more solid its badge looks. Your own
          HIVE wears its own colour.
        </Text>
      </View>
    </View>
  );
}

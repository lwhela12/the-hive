import { useRef, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

/**
 * Where you are, and the way back out.
 *
 * Nat, 2026-08-05: *"Can we make it more obvious where you are when you're
 * inside of them? I understand how the boards work, but not every one does. So
 * like, when you're here, is there some way of showing where you are? some sort
 * of: OG HIVE > Boards > HIVE approved > Favo healthcare, or something?"*
 *
 * The boards are four levels deep — a HIVE, its boards, one board, one thread —
 * and until now the deepest screen's header said the word "Thread". That is a
 * label for the KIND of thing you are looking at, not for where it sits, so
 * somebody who did not already have the structure in their head had nothing to
 * build it from. Nat does have it. That is exactly why she noticed: she could
 * tell the screen was only legible to someone who already knew.
 *
 * ## It is deliberately not clever
 *
 * A trail is only worth having if it is the same shape every time, so this
 * takes a plain list and draws it. It knows nothing about HIVEs, boards or
 * threads — the screen that has the facts passes them in. That is what makes it
 * liftable into Jammin' Sprouts, which Nat wants next, without dragging any of
 * HIVE's vocabulary along with it.
 *
 * Every step except the last is a way back. The last one is where you are, so
 * it is the only one wearing full-strength ink and the only one you cannot
 * press — a "button" that returns you to the page you are on is the same
 * nothing-happens bug we fixed in the rail.
 *
 * ## Long names
 *
 * "Favorite Healthcare: Doc, gyno, dentist, etc" inside "HIVE Approved" inside
 * "OG HIVE" does not fit a phone. It scrolls sideways rather than wrapping to
 * two lines or truncating the middle, because the two ends are the parts that
 * carry meaning: the far left is the way home and the far right is where you
 * are. It starts scrolled to the right for the same reason — where you ARE is
 * the question being answered.
 */

export type Crumb = {
  label: string;
  /** Where this step goes. The last crumb leaves it off; it is already here. */
  onPress?: () => void;
  /** A small thing drawn before the label — a HIVE's hexagon, the Earth. */
  mark?: ReactNode;
};

export function Breadcrumbs({
  items,
  tone = 'light',
  compact,
}: {
  items: Crumb[];
  /** Dark surfaces need light ink. HIVE-Wide's boards are near-black. */
  tone?: 'light' | 'dark';
  compact?: boolean;
}) {
  // Above the early return on purpose: a hook that only runs sometimes is a
  // hook React will refuse.
  const scroller = useRef<ScrollView>(null);

  const trail = items.filter((item) => item.label.trim().length > 0);
  // One step is not a trail — it says nothing the page title has not.
  if (trail.length < 2) return null;

  const dark = tone === 'dark';
  const quiet = dark ? 'rgba(255,248,233,0.6)' : 'rgba(49,49,48,0.5)';
  const here = dark ? '#FFF8E9' : '#313130';
  const divider = dark ? 'rgba(255,248,233,0.32)' : 'rgba(49,49,48,0.28)';
  const size = compact ? 11.5 : 12.5;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      ref={scroller}
      // Pinned to the right end, so a trail too long for the screen still opens
      // showing where you are rather than where you started. Done on the content
      // measuring rather than with `contentOffset`, which React Native Web does
      // not honour — and the web is where nearly everyone reads this today.
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: compact ? 7 : 9,
        gap: 7,
      }}
    >
      {trail.map((item, index) => {
        const last = index === trail.length - 1;
        const label = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {item.mark}
            <Text
              numberOfLines={1}
              style={{
                fontFamily: last ? 'Lato_700Bold' : 'Lato_400Regular',
                fontSize: size,
                color: last ? here : quiet,
              }}
            >
              {item.label}
            </Text>
          </View>
        );

        return (
          <View key={`${item.label}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {index > 0 && (
              <Text
                style={{ fontFamily: 'Lato_400Regular', fontSize: size, color: divider }}
                accessibilityElementsHidden
              >
                ›
              </Text>
            )}
            {last || !item.onPress ? (
              <View accessibilityRole="header" accessibilityLabel={`You are in ${item.label}`}>
                {label}
              </View>
            ) : (
              <Pressable
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={`Back to ${item.label}`}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
              >
                {label}
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

import { useRef, type ReactNode } from 'react';
import { View, Text, Pressable, Platform, ScrollView } from 'react-native';

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
 * ## They have to be hittable, and they have to look hittable
 *
 * Nat, 2026-08-06: *"i love the nav here, but i wish i could click on it to go
 * back to where i want to go back to, like if i was all the way inside that
 * thread & i wanted to go back to boards."* The steps already carried their
 * handlers. What they did not carry was a target: 11.5pt text in a 5px-tall
 * strip is around fourteen pixels of thumb room on a phone, against the 44 that
 * a finger actually needs, so the tap landed on the gap between two words and
 * the trail sat there looking decorative.
 *
 * So every step carries its own height now — eight pixels of padding above and
 * below the words, taken out of the strip's own padding so the bar grows by
 * about six pixels in total and stays the thin Finder-ish line Nat asked for.
 * The room has to be real padding: a horizontal scroller clips anything hanging
 * outside it, taps included, so a negative margin would have looked bigger and
 * caught nothing.
 *
 * It says so as well as being it: a step you can press is underlined faintly all
 * the time, and darkens with a full underline while a pointer is over it. The
 * one you are standing on stays plain.
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
  dense,
}: {
  items: Crumb[];
  /** Dark surfaces need light ink. HIVE-Wide's boards are near-black. */
  tone?: 'light' | 'dark';
  compact?: boolean;
  /** Finder-thin, for the strip along the bottom of the app. */
  dense?: boolean;
}) {
  // Above the early return on purpose: a hook that only runs sometimes is a
  // hook React will refuse.
  const scroller = useRef<ScrollView>(null);

  const trail = items.filter((item) => item.label.trim().length > 0);
  if (trail.length === 0) return null;

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
      // A ScrollView takes every pixel it is offered, and a HORIZONTAL one will
      // happily do that vertically — which is why the trail first shipped
      // marooned in the middle of an enormous blank gap on the thread screen
      // (Nat 2026-08-05: "there's that big weird space there"). It is exactly as
      // tall as its own text now.
      style={{ flexGrow: 0, flexShrink: 0 }}
      // Pinned to the right end, so a trail too long for the screen still opens
      // showing where you are rather than where you started. Done on the content
      // measuring rather than with `contentOffset`, which React Native Web does
      // not honour — and the web is where nearly everyone reads this today.
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: dense ? 12 : 16,
        // The steps carry most of the height themselves now, so that the room a
        // thumb needs lives inside the button rather than in the gap around it.
        // A horizontal scroller clips whatever hangs outside it — including the
        // taps — so the target has to be real padding, not a negative margin.
        paddingVertical: dense ? 0 : compact ? 2 : 4,
        gap: dense ? 6 : 7,
      }}
    >
      {trail.map((item, index) => {
        const last = index === trail.length - 1;
        const goes = !last && !!item.onPress;

        const label = (lit: boolean) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {item.mark}
            <Text
              numberOfLines={1}
              style={{
                fontFamily: last ? 'Lato_700Bold' : 'Lato_400Regular',
                fontSize: size,
                color: last || lit ? here : quiet,
                // A faint underline all the time says "this is a way back"; the
                // full one says "and you are on it right now".
                textDecorationLine: goes ? 'underline' : 'none',
                textDecorationColor: lit ? here : divider,
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
            {goes ? (
              <Pressable
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={`Back to ${item.label}`}
                // `hitSlop` is honoured on the phone and ignored by the browser,
                // and the browser is where nearly everyone reads this — so the
                // room is built into the box as well.
                hitSlop={12}
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 5,
                  marginHorizontal: -5,
                  opacity: pressed ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
                })}
              >
                {(state) => label(!!(state as { hovered?: boolean }).hovered || state.pressed)}
              </Pressable>
            ) : (
              // Matching padding, so the strip is the same height whether or
              // not the page you are on has anywhere above it to go.
              <View
                accessibilityRole="header"
                accessibilityLabel={`You are in ${item.label}`}
                style={{ paddingVertical: 8 }}
              >
                {label(false)}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

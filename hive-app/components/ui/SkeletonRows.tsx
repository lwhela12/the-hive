import { View } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';

/**
 * A list, sketched in, while the real one is on its way.
 *
 * WHY THIS EXISTS
 *
 * Nat, 2026-08-06: "HIVE-Wide boards still did the weird flash, where first it
 * was white, then it's black. We wanna fix that everywhere, I hate it."
 *
 * Part of that flash was hand-written: Boards drew its waiting state as five
 * `bg-white` rows with grey blocks in them. Inside a HIVE that is invisible —
 * white rows on cream. At HIVE-Wide it is five pure-white bars laid over a
 * near-black page, and they sit there for the whole of the first query, which is
 * exactly the visit where nothing is cached yet. The page floor underneath had
 * already been fixed; this was painting white on top of it.
 *
 * So the sketch wears the reader's own skin, like every other surface in HIVE.
 * It is a component rather than a copied block because the same white-rows
 * pattern is written out by hand on Home, Meetings, Messages and Admin too —
 * they each have the same bug waiting for the day somebody looks at them from
 * HIVE-Wide, and now there is somewhere for them to go.
 *
 * A sketch rather than a flying bee on purpose: a list that is coming should say
 * "a list is coming". `ThinkingBee` is still the right answer for a wait with no
 * shape to promise.
 */
export function SkeletonRows({
  count = 5,
  /** Each row carries a picture on the left — a board icon, an avatar. */
  showLeading = true,
}: {
  count?: number;
  showLeading?: boolean;
}) {
  const skin = usePageSkin();

  // Two weights of "something goes here". Lifted off the page on dark, laid onto
  // it on light, so the sketch reads as absence in both worlds rather than as a
  // pale card that arrived early.
  const block = skin.dark ? 'rgba(246,244,229,0.13)' : 'rgba(49,49,48,0.10)';
  const blockSoft = skin.dark ? 'rgba(246,244,229,0.07)' : 'rgba(49,49,48,0.055)';

  return (
    <View className="mt-2" accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className="flex-row items-center px-4 py-4"
          style={{ backgroundColor: skin.card, borderBottomWidth: 1, borderBottomColor: skin.border }}
        >
          {showLeading ? (
            <View className="w-10 h-10 rounded-lg mr-4" style={{ backgroundColor: block }} />
          ) : null}
          <View className="flex-1">
            <View className="h-4 rounded w-2/5 mb-2" style={{ backgroundColor: block }} />
            <View className="h-3 rounded w-3/5" style={{ backgroundColor: blockSoft }} />
          </View>
          <View className="w-4 h-4 rounded ml-2" style={{ backgroundColor: blockSoft }} />
        </View>
      ))}
    </View>
  );
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The most bottom clearance any iPhone has ever needed.
 *
 * Apple's home indicator is 34pt on every device that has one, and no device
 * has ever asked for more. Anything larger coming back from
 * `react-native-safe-area-context` on web is the measurement being wrong, not
 * a phone that needs it — and "wrong" here is expensive, because every point
 * of it is taken off the bottom of the screen.
 */
const HOME_INDICATOR_PT = 34;

/**
 * How much room to leave along the bottom edge, in points.
 *
 * Nat's iPhone, 2026-08-25, measured off her own screenshots: the side rail's
 * last icons were cut off with obvious empty space beneath them, and the
 * breadcrumb strip along the bottom read as a thick second nav bar. Both were
 * padding themselves by `insets.bottom` — which was coming back around 62pt,
 * nearly double the real clearance, so both surfaces gave up about an inch of
 * a 402pt-wide phone to nothing at all.
 *
 * Anything that clears the bottom edge asks this instead of reading
 * `insets.bottom` directly, so the answer stays the same in every place it is
 * used. (`PathFooter` had its own copy of this cap for a few hours; a second
 * surface needing the same number is what makes it shared.)
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Math.min(insets.bottom, HOME_INDICATOR_PT);
}

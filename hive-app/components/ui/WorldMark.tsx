import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop, ClipPath, G } from 'react-native-svg';

/**
 * The world, small enough to sit in a list.
 *
 * Nat, 2026-08-04: "can we make HIVE-Wide look more like the world from the main
 * screen? instead of that ugly world?"
 *
 * It was a stock outline-globe glyph — the meridian-and-parallels kind — sitting
 * next to a page whose whole identity is a photograph of Earth's limb at
 * sunrise. Two different planets in one app, and the wrong one on the label.
 *
 * This is the same picture as `SpaceGlobe`, miniaturised: black sky, the curve
 * of the world across the bottom, the atmosphere lit as a bright wire along it,
 * and the sun cresting on the RIGHT in HIVE's gold. Drawn as SVG rather than
 * canvas on purpose — one of these can appear several times in a room list, and
 * animating canvases in a scroll view is a real cost for a 48px badge. It is a
 * still, because at this size there is nothing to animate.
 *
 * The geometry echoes the big one deliberately: a large circle whose centre sits
 * below the frame, so what you see is the top of a gentle curve, not a ball.
 */
export function WorldMark({ size = 48 }: { size?: number }) {
  // Everything is in a 48-unit box and scaled by the viewBox, so one set of
  // numbers works at any size.
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <ClipPath id="worldClip">
          <Circle cx="24" cy="24" r="24" />
        </ClipPath>
        {/* The sunrise, in the brand's gold. */}
        <RadialGradient id="worldSun" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF6D6" stopOpacity="1" />
          <Stop offset="0.35" stopColor="#FFB240" stopOpacity="0.8" />
          <Stop offset="1" stopColor="#D6741A" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <G clipPath="url(#worldClip)">
        {/* Space */}
        <Circle cx="24" cy="24" r="24" fill="#05060B" />
        <Path d="M0 0 H48 V34 H0 Z" fill="#070C18" />

        {/* The planet — centre well below the frame, so only the curve shows. */}
        <Circle cx="24" cy="62" r="34" fill="#0B1526" />

        {/* Warm ground on the lit side. */}
        <Ellipse cx="36" cy="38" rx="17" ry="7" fill="#3A2A14" opacity="0.5" />

        {/* The atmosphere: a soft band with a bright filament down the middle,
            the same two-pass trick the full-size limb uses. */}
        <Path d="M-4 36 A 34 34 0 0 1 52 30" stroke="#D6EEFF" strokeWidth="2.4" fill="none" opacity="0.4" />
        <Path d="M-4 36 A 34 34 0 0 1 52 30" stroke="#EAF6FF" strokeWidth="1" fill="none" opacity="0.95" />

        {/* The sun, cresting on the right. */}
        <Circle cx="41" cy="30" r="13" fill="url(#worldSun)" />
        <Circle cx="41" cy="30" r="3" fill="#FFF8E4" />
      </G>
    </Svg>
  );
}

import Svg, { Polygon } from 'react-native-svg';

/**
 * One HIVE, as a shape you can recognise before you've read anything.
 *
 * Nat, 2026-08-05: *"I think these should all be size/shape/colour coded,
 * because we want to be able to notice at a glance which meeting for who."*
 *
 * A single honeycomb cell, filled in that HIVE's own colour: OG's gold, Tech's
 * blue, Production's purple. It is deliberately the same cell the logo is built
 * out of — the app already draws seven of them clustered in `HexagonIcon`, and
 * this is one of those, pulled out and given a colour to carry.
 *
 * Pointy-top, matching `HexagonIcon` exactly, so a lone mark and the honeycomb
 * cluster look like the same object at two magnifications rather than two
 * different hexagons.
 *
 * The counterpart is `WorldMark` — the Earth — which is what something wears
 * once it has left its own HIVE. Hexagon means here, world means everywhere.
 */

/** Pointy-top hexagon, centred in a 24-unit box. */
function points(r: number): string {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    out.push(`${12 + r * Math.cos(angle)},${12 + r * Math.sin(angle)}`);
  }
  return out.join(' ');
}

export function HiveMark({
  size = 14,
  colour,
  hollow = false,
}: {
  size?: number;
  /** The HIVE's accent colour. Callers get this from `hiveAccent()`. */
  colour: string;
  /** Outline instead of fill — for a HIVE that isn't the subject of the row. */
  hollow?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon
        points={points(hollow ? 10 : 11)}
        fill={hollow ? 'none' : colour}
        stroke={colour}
        strokeWidth={hollow ? 2.4 : 0}
      />
    </Svg>
  );
}

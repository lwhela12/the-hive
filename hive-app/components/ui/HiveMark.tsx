import Svg, { Polygon } from 'react-native-svg';


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

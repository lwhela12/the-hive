import Svg, { Polygon, G } from 'react-native-svg';

interface HexagonIconProps {
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

// Single hexagon path (pointy-top, centered at origin)
const hexPoints = (cx: number, cy: number, r: number) => {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(' ');
};

export function HexagonIcon({
  size = 28,
  fill = 'transparent',
  stroke = '#bd9348',
  strokeWidth = 2
}: HexagonIconProps) {
  const r = 18; // radius of each hexagon
  const h = r * 1.5; // vertical spacing
  const w = r * Math.sqrt(3); // horizontal spacing

  // Honeycomb cluster: 7 hexagons
  //    ⬡ ⬡
  //   ⬡ ⬡ ⬡
  //    ⬡ ⬡
  const hexagons = [
    // Top row (2 hexagons)
    { cx: 35, cy: 16 },
    { cx: 35 + w, cy: 16 },
    // Middle row (3 hexagons)
    { cx: 35 - w/2, cy: 16 + h },
    { cx: 35 + w/2, cy: 16 + h },
    { cx: 35 + w * 1.5, cy: 16 + h },
    // Bottom row (2 hexagons)
    { cx: 35, cy: 16 + h * 2 },
    { cx: 35 + w, cy: 16 + h * 2 },
  ];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G>
        {hexagons.map((hex, i) => (
          <Polygon
            key={i}
            points={hexPoints(hex.cx, hex.cy, r)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        ))}
      </G>
    </Svg>
  );
}

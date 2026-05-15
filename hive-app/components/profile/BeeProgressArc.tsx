import { View } from 'react-native';
import Svg, { Path, Circle, G, Ellipse, Line } from 'react-native-svg';

interface BeeProgressArcProps {
  score: number;
  size?: number;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ');
}

function RouteFlower({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`}>
      <Line x1={0} y1={17} x2={0} y2={31} stroke="#739a88" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M0 25c-5-1-8 1-10 5M0 26c5-1 8 1 10 5" stroke="#739a88" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      {[0, 72, 144, 216, 288].map((angle) => {
        const petal = polarToCartesian(0, 8, 8.8, angle);
        return (
          <Ellipse
            key={angle}
            cx={petal.x}
            cy={petal.y}
            rx={5.2}
            ry={7.3}
            fill="#fff4c9"
            stroke="#dec181"
            strokeWidth={1}
            transform={`rotate(${angle} ${petal.x} ${petal.y})`}
          />
        );
      })}
      <Circle cx={0} cy={8} r={5.2} fill="#bd9348" />
      <Circle cx={-1.5} cy={6.6} r={1.1} fill="rgba(255,255,255,0.45)" />
    </G>
  );
}

function RouteHive({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`}>
      <Path
        d="M-15 23C-15 8-8-5 0-5S15 8 15 23H-15Z"
        fill="#f5d071"
        stroke="#7a5a24"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M-11 5h22M-14 11h28M-13 17h26M-8 -1h16" stroke="#bd9348" strokeWidth={1.35} strokeLinecap="round" />
      <Circle cx={0} cy={18} r={3.4} fill="#7a5a24" />
      <Path d="M-10 23h20" stroke="#7a5a24" strokeWidth={1.2} strokeLinecap="round" />
    </G>
  );
}

function RouteBee({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`}>
      <Ellipse cx={-3.2} cy={-9.4} rx={5.8} ry={3.3} fill="rgba(255,255,255,0.9)" stroke="#dec181" strokeWidth={0.8} transform="rotate(-30 -3.2 -9.4)" />
      <Ellipse cx={-3.2} cy={9.4} rx={5.8} ry={3.3} fill="rgba(255,255,255,0.9)" stroke="#dec181" strokeWidth={0.8} transform="rotate(30 -3.2 9.4)" />
      <Ellipse cx={-0.8} cy={0} rx={12.2} ry={7.6} fill="#f2c84b" stroke="#2d2d2d" strokeWidth={1.35} />
      <Path d="M-7.2-6.2c1.2 4.1 1.2 8.3 0 12.4M-1.2-7c1.2 4.6 1.2 9.4 0 14M5-5.8c1 3.8 1 7.8 0 11.6" stroke="#2d2d2d" strokeWidth={2.1} strokeLinecap="round" />
      <Circle cx={11.1} cy={0} r={4.7} fill="#2d2d2d" />
      <Circle cx={12.4} cy={-1.4} r={0.85} fill="#fffdf7" />
      <Path d="M14.6 -3.6c2.3-2 4.2-2.5 5.8-1.6M14.6 3.6c2.3 2 4.2 2.5 5.8 1.6" stroke="#2d2d2d" strokeWidth={1.05} strokeLinecap="round" />
    </G>
  );
}

export function BeeProgressArc({ score, size = 220 }: BeeProgressArcProps) {
  const progress = clamp(score);
  const strokeWidth = Math.max(10, size * 0.055);
  const width = size;
  const height = size * 0.68;
  const cx = width / 2;
  const cy = height * 0.88;
  const radius = (width - strokeWidth - 28) / 2;
  const startAngle = 238;
  const endAngle = 122;
  const totalSweep = 360 - startAngle + endAngle;
  const progressEndAngle = startAngle + totalSweep * progress;
  const marker = polarToCartesian(cx, cy, radius, progressEndAngle);
  const startMarker = polarToCartesian(cx, cy, radius, startAngle);
  const endMarker = polarToCartesian(cx, cy, radius, endAngle);
  const iconScale = size / 220;
  const beeScale = size / 220;
  const beeMarker = progress >= 1
    ? { x: endMarker.x - 18 * iconScale, y: endMarker.y - 7 * iconScale }
    : marker;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path
          d={describeArc(cx, cy, radius, startAngle, startAngle + totalSweep)}
          stroke="rgba(189,147,72,0.22)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d={describeArc(cx, cy, radius, startAngle, progressEndAngle)}
          stroke={progress >= 1 ? '#739a88' : '#bd9348'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
        <RouteFlower x={startMarker.x} y={startMarker.y - 30 * iconScale} scale={iconScale} />
        <RouteHive x={endMarker.x} y={endMarker.y - 25 * iconScale} scale={iconScale} />
        <RouteBee x={beeMarker.x} y={beeMarker.y - 11 * beeScale} scale={beeScale} />
      </Svg>
    </View>
  );
}

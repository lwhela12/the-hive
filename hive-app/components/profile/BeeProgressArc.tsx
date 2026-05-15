import { View } from 'react-native';
import Svg, { Path, Circle, G, Ellipse, Rect } from 'react-native-svg';

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
  const beeToHive = {
    x: endMarker.x - marker.x,
    y: endMarker.y - marker.y,
  };
  const beeRotation = Math.abs(beeToHive.x) + Math.abs(beeToHive.y) > 0.5
    ? Math.atan2(beeToHive.y, beeToHive.x) * 180 / Math.PI
    : 0;

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
        <G transform={`translate(${startMarker.x - 18}, ${startMarker.y - 18})`}>
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const petal = polarToCartesian(18, 18, 8.5, angle);
            return <Ellipse key={angle} cx={petal.x} cy={petal.y} rx={4.7} ry={6.3} fill="#fff2b8" stroke="#dec181" strokeWidth={1} />;
          })}
          <Circle cx={18} cy={18} r={4.8} fill="#bd9348" />
          <Path d="M18 23v11" stroke="#739a88" strokeWidth={1.7} strokeLinecap="round" />
          <Path d="M18 29c-4 0-6 2-7 4M18 30c4 0 6 2 7 4" stroke="#739a88" strokeWidth={1.3} strokeLinecap="round" />
        </G>
        <G transform={`translate(${endMarker.x - 18}, ${endMarker.y - 17})`}>
          <Path
            d="M5 29C5 14 11.1 4 18 4s13 10 13 25H5Z"
            fill="#f5d071"
            stroke="#bd9348"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <Path d="M8 14.4h20M6.4 20.4h23.2M9.5 26h17M12 9.2h12" stroke="#bd9348" strokeWidth={1.25} strokeLinecap="round" />
          <Circle cx={18} cy={25.6} r={3.4} fill="#7a5a24" />
        </G>
        <G transform={`translate(${marker.x}, ${marker.y}) rotate(${beeRotation})`}>
          <Ellipse cx={-2} cy={-7} rx={5.6} ry={3.4} fill="rgba(255,255,255,0.82)" stroke="#dec181" strokeWidth={0.8} transform="rotate(-28 -2 -7)" />
          <Ellipse cx={-2} cy={7} rx={5.6} ry={3.4} fill="rgba(255,255,255,0.82)" stroke="#dec181" strokeWidth={0.8} transform="rotate(28 -2 7)" />
          <Ellipse cx={1} cy={0} rx={10.8} ry={7.2} fill="#f2c84b" stroke="#7a5a24" strokeWidth={1.4} />
          <Rect x={-5.8} y={-6.1} width={2.2} height={12.2} rx={1.1} fill="#2d2d2d" opacity={0.92} />
          <Rect x={-0.2} y={-6.7} width={2.2} height={13.4} rx={1.1} fill="#2d2d2d" opacity={0.92} />
          <Circle cx={10.2} cy={0} r={4.2} fill="#2d2d2d" />
          <Circle cx={11.4} cy={-1.3} r={0.75} fill="#fffdf7" />
          <Path d="M13.5 -3.8c2.5-2 4.3-2.3 5.8-1.5M13.5 3.8c2.5 2 4.3 2.3 5.8 1.5" stroke="#2d2d2d" strokeWidth={1} strokeLinecap="round" />
        </G>
      </Svg>
    </View>
  );
}

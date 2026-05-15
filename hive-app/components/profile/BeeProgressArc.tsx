import { View, Text } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';

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
        <G transform={`translate(${startMarker.x - 14}, ${startMarker.y - 14})`}>
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const petal = polarToCartesian(14, 14, 7, angle);
            return <Circle key={angle} cx={petal.x} cy={petal.y} r={4.5} fill="#fff0a8" stroke="#dec181" strokeWidth={1} />;
          })}
          <Circle cx={14} cy={14} r={4.5} fill="#bd9348" />
        </G>
        <G transform={`translate(${endMarker.x - 14}, ${endMarker.y - 15})`}>
          <Path
            d="M4 23C4 12.8 8.8 5 14 5s10 7.8 10 18H4Z"
            fill="#f5d071"
            stroke="#bd9348"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <Path d="M6.8 13.2h14.4M5.2 18.2h17.6M9.2 8.7h9.6" stroke="#bd9348" strokeWidth={1.2} strokeLinecap="round" />
          <Circle cx={14} cy={20.4} r={3.1} fill="#7a5a24" />
        </G>
        <Circle
          cx={marker.x}
          cy={marker.y}
          r={strokeWidth * 0.92}
          fill="#fffdf5"
          stroke={progress >= 1 ? '#739a88' : '#bd9348'}
          strokeWidth={2}
        />
      </Svg>
      <Text
        style={{
          position: 'absolute',
          left: marker.x - 10,
          top: marker.y - 11,
          fontSize: 18,
          lineHeight: 22,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        🐝
      </Text>
    </View>
  );
}

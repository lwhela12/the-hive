import React from 'react';
import { Platform, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface BeeProgressArcProps {
  profileCompletionPercent?: number;
  score?: number;
  size?: number;
}

type Point = {
  x: number;
  y: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProgress(profileCompletionPercent?: number, score?: number) {
  if (typeof profileCompletionPercent === 'number') {
    return clamp(profileCompletionPercent > 1 ? profileCompletionPercent / 100 : profileCompletionPercent);
  }

  return clamp(score ?? 0);
}

function cubicBezierPoint(progress: number, start: Point, controlA: Point, controlB: Point, end: Point) {
  const t = clamp(progress);
  const inverse = 1 - t;

  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * t * controlA.x +
      3 * inverse * t ** 2 * controlB.x +
      t ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * t * controlA.y +
      3 * inverse * t ** 2 * controlB.y +
      t ** 3 * end.y,
  };
}

function EmojiMarker({
  emoji,
  label,
  x,
  y,
  size,
}: {
  emoji: string;
  label: string;
  x: number;
  y: number;
  size: number;
}) {
  return (
    <Text
      accessibilityLabel={label}
      selectable={false}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        fontSize: size * 0.78,
        lineHeight: size,
        textAlign: 'center',
        textShadowColor: 'rgba(49,49,48,0.1)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
      }}
    >
      {emoji}
    </Text>
  );
}

function HiveDestinationMarker({
  label,
  x,
  y,
  size,
}: {
  label: string;
  x: number;
  y: number;
  size: number;
}) {
  const width = size * 1.16;
  const height = size * 1.08;

  return (
    <View
      accessibilityLabel={label}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
        shadowColor: '#bd9348',
        shadowOpacity: 0.16,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Svg width={width} height={height} viewBox="0 0 36 34" style={{ overflow: 'visible' }}>
        <Path
          d="M18 3.4C12.2 3.4 7.7 8.9 7.7 16.7c0 7.9 4.2 13.9 10.3 13.9s10.3-6 10.3-13.9C28.3 8.9 23.8 3.4 18 3.4Z"
          fill="#f5c95f"
          stroke="#c89131"
          strokeWidth={1.3}
        />
        <Path
          d="M10 11.1c3.4 1.4 12.6 1.4 16 0M8.6 17c4.5 1.6 14.3 1.6 18.8 0M10.1 22.8c3.6 1.4 12.2 1.4 15.8 0"
          stroke="#d59c36"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          strokeOpacity={0.78}
        />
        <Path
          d="M13.6 30.2v-3.4c0-2.8 1.9-4.9 4.4-4.9s4.4 2.1 4.4 4.9v3.4"
          fill="#6f471e"
          stroke="#553414"
          strokeWidth={1.1}
        />
        <Path
          d="M13 8.2c1.3-1.2 2.9-1.9 5-1.9s3.7.7 5 1.9"
          stroke="#ffe6a5"
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
          strokeOpacity={0.88}
        />
      </Svg>
    </View>
  );
}

function NativeBeeBadge({
  point,
  percent,
  badgeWidth,
  badgeHeight,
}: {
  point: Point;
  percent: number;
  badgeWidth: number;
  badgeHeight: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: point.x - badgeWidth / 2,
        top: point.y - badgeHeight,
        width: badgeWidth,
        height: badgeHeight,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.7)',
        backgroundColor: 'rgba(255,250,240,0.96)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#bd9348',
        shadowOpacity: 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      }}
    >
      <Text selectable={false} style={{ fontSize: 15, marginRight: 3, transform: [{ scaleX: -1 }] }}>
        🐝
      </Text>
      <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#7a5a24' }}>
        {percent}%
      </Text>
    </View>
  );
}

function WebBeeBadge({
  path,
  percent,
  badgeWidth,
  badgeHeight,
}: {
  path: string;
  percent: number;
  badgeWidth: number;
  badgeHeight: number;
}) {
  return React.createElement(
    'div',
    {
      'aria-label': `Profile ${percent}% complete`,
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: badgeWidth,
        height: badgeHeight,
        borderRadius: 999,
        border: '1px solid rgba(222,193,129,0.7)',
        background: 'rgba(255,250,240,0.96)',
        color: '#7a5a24',
        boxShadow: '0 8px 18px rgba(189,147,72,0.16)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        pointerEvents: 'none',
        userSelect: 'none',
        offsetPath: `path("${path}")`,
        offsetDistance: `${percent}%`,
        offsetAnchor: '50% 105%',
        offsetRotate: '0deg',
        transition: 'offset-distance 720ms cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'offset-distance',
      } as React.CSSProperties,
    },
    React.createElement(
      'span',
      {
        style: {
          display: 'inline-block',
          fontSize: 15,
          lineHeight: '15px',
          transform: 'scaleX(-1)',
          transformOrigin: 'center',
        } as React.CSSProperties,
      },
      '🐝'
    ),
    React.createElement(
      'span',
      {
        style: {
          fontFamily: 'Lato_700Bold, Lato, sans-serif',
          fontSize: 11,
          lineHeight: '11px',
          fontWeight: 700,
        } as React.CSSProperties,
      },
      `${percent}%`
    )
  );
}

export function BeeProgressArc({ profileCompletionPercent, score, size = 220 }: BeeProgressArcProps) {
  const progress = normalizeProgress(profileCompletionPercent, score);
  const percent = Math.round(progress * 100);
  const width = size;
  const height = size * 0.5;
  const scale = size / 220;
  const start = { x: size * 0.18, y: height * 0.72 };
  const end = { x: size * 0.82, y: height * 0.72 };
  const controlA = { x: size * 0.32, y: height * 0.08 };
  const controlB = { x: size * 0.68, y: height * 0.08 };
  const path = `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`;
  const arcLength = (end.x - start.x) * 1.24;
  const badgeWidth = 55 * scale;
  const badgeHeight = 27 * scale;
  const markerSize = 27 * scale;
  const nativePoint = cubicBezierPoint(progress, start, controlA, controlB, end);

  return (
    <View pointerEvents="none" style={{ width, height, position: 'relative', overflow: 'visible', zIndex: 2 }}>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <Path
          d={path}
          stroke="rgba(189,147,72,0.24)"
          strokeWidth={3 * scale}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${1 * scale} ${8 * scale}`}
        />
        <Path
          d={path}
          stroke={progress >= 1 ? '#739a88' : '#bd9348'}
          strokeWidth={4 * scale}
          strokeLinecap="round"
          fill="none"
          strokeOpacity={0.42}
          strokeDasharray={`${Math.max(1, progress * arcLength)} ${arcLength}`}
        />
      </Svg>
      <EmojiMarker emoji="🌸" label="Profile journey start" x={start.x} y={start.y + 8 * scale} size={markerSize} />
      <HiveDestinationMarker label="Profile complete hive" x={end.x} y={end.y + 8 * scale} size={markerSize} />
      {Platform.OS === 'web' ? (
        <WebBeeBadge path={path} percent={percent} badgeWidth={badgeWidth} badgeHeight={badgeHeight} />
      ) : (
        <NativeBeeBadge point={nativePoint} percent={percent} badgeWidth={badgeWidth} badgeHeight={badgeHeight} />
      )}
    </View>
  );
}

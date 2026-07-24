import Svg, { Path, Circle, Rect, Line, G } from 'react-native-svg';

// The HIVE icon family — hand-drawn kin of the honey pencil (EditButton).
// House style: 24-box, stroke 2, rounded caps and joins, one color, and a
// filled honey-drop accent somewhere in every icon. These are the app's
// chrome; emojis stay reserved for human content (reactions, comments).
export type HiveIconName =
  | 'honeypot'
  | 'board'
  | 'message'
  | 'reply'
  | 'bee'
  | 'calendar'
  | 'person'
  | 'sparkle'
  | 'gear'
  | 'note'
  | 'checkin'
  | 'star';

export function HiveIcon({
  name,
  size = 20,
  color = '#8e6f35',
}: {
  name: HiveIconName;
  size?: number;
  color?: string;
}) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
  const drop = { fill: color };

  const icon = (() => {
    switch (name) {
      case 'honeypot': return (
        <G>
          <Path d="M8 6.6 L8 5.4 C8 4.4 9.2 3.8 12 3.8 C14.8 3.8 16 4.4 16 5.4 L16 6.6" {...stroke} />
          <Path d="M6.6 9.4 C5 11 4.2 12.9 4.2 14.8 C4.2 18.2 7.5 20.6 12 20.6 C16.5 20.6 19.8 18.2 19.8 14.8 C19.8 12.9 19 11 17.4 9.4 C16.2 8.2 14.4 7.4 12 7.4 C9.6 7.4 7.8 8.2 6.6 9.4 Z" {...stroke} />
          <Circle cx="12" cy="12.3" r="1.5" {...drop} />
        </G>
      );
      case 'board': return (
        <G>
          <Rect x="3.2" y="4.6" width="17.6" height="14.4" rx="2.4" {...stroke} />
          <Line x1="7" y1="10.4" x2="14" y2="10.4" {...stroke} />
          <Line x1="7" y1="14.4" x2="11.4" y2="14.4" {...stroke} />
          <Circle cx="12" cy="6.9" r="1.3" {...drop} />
        </G>
      );
      case 'message': return (
        <G>
          <Path d="M4 7 C4 5.6 5.1 4.5 6.5 4.5 H17.5 C18.9 4.5 20 5.6 20 7 V12.8 C20 14.2 18.9 15.3 17.5 15.3 H9.4 L5.6 18.8 C5 19.3 4 18.9 4 18.1 Z" {...stroke} />
          <Circle cx="8.6" cy="10" r="1.15" {...drop} />
          <Circle cx="12" cy="10" r="1.15" {...drop} />
          <Circle cx="15.4" cy="10" r="1.15" {...drop} />
        </G>
      );
      case 'reply': return (
        <G>
          <Path d="M3.4 6.4 C3.4 5.2 4.3 4.3 5.5 4.3 H14 C15.2 4.3 16.1 5.2 16.1 6.4 V10.4 C16.1 11.6 15.2 12.5 14 12.5 H8.2 L5 15.3 C4.5 15.7 3.4 15.4 3.4 14.7 Z" {...stroke} />
          <Path d="M18.6 10.6 C19.8 10.9 20.6 11.7 20.6 12.9 V16.2 C20.6 17.4 19.7 18.3 18.5 18.3 H17.9 L15.7 20.3 C15.2 20.7 14.4 20.4 14.4 19.7 V18.3 H12.6 C11.6 18.3 10.8 17.7 10.5 16.8" {...stroke} />
          <Circle cx="9.7" cy="8.4" r="1.2" {...drop} />
        </G>
      );
      case 'bee': return (
        <G>
          <Path d="M8.6 9.9 C7 9.3 6 8.1 6 6.9 C6 5.7 7 4.9 8.3 4.9 C9.9 4.9 11.2 6.2 11.7 8.1" {...stroke} />
          <Path d="M15.4 9.9 C17 9.3 18 8.1 18 6.9 C18 5.7 17 4.9 15.7 4.9 C14.1 4.9 12.8 6.2 12.3 8.1" {...stroke} />
          <Path d="M12 8.4 C15 8.4 16.8 10.7 16.8 13.7 C16.8 17 14.7 19.6 12 19.6 C9.3 19.6 7.2 17 7.2 13.7 C7.2 10.7 9 8.4 12 8.4 Z" {...stroke} />
          <Line x1="8" y1="12.2" x2="16" y2="12.2" {...stroke} />
          <Line x1="8.2" y1="15.6" x2="15.8" y2="15.6" {...stroke} />
          <Circle cx="12" cy="21.4" r="1" {...drop} />
        </G>
      );
      case 'calendar': return (
        <G>
          <Rect x="3.6" y="5" width="16.8" height="15" rx="2.4" {...stroke} />
          <Line x1="8" y1="3.2" x2="8" y2="7" {...stroke} />
          <Line x1="16" y1="3.2" x2="16" y2="7" {...stroke} />
          <Line x1="3.6" y1="9.8" x2="20.4" y2="9.8" {...stroke} />
          <Circle cx="12" cy="14.8" r="1.5" {...drop} />
        </G>
      );
      case 'person': return (
        <G>
          <Circle cx="12" cy="8" r="3.6" {...stroke} />
          <Path d="M5 20.2 C5 16.4 8 14.4 12 14.4 C16 14.4 19 16.4 19 20.2" {...stroke} />
          <Circle cx="17.6" cy="4.6" r="1.2" {...drop} />
        </G>
      );
      case 'sparkle': return (
        <G>
          <Path d="M12 3.6 L13.7 9.3 L19.4 11 L13.7 12.7 L12 18.4 L10.3 12.7 L4.6 11 L10.3 9.3 Z" {...stroke} />
          <Circle cx="17.8" cy="5" r="1.3" {...drop} />
        </G>
      );
      case 'gear': return (
        <G>
          <Circle cx="12" cy="12" r="5" {...stroke} />
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4;
            const x1 = 12 + Math.cos(angle) * 6.2;
            const y1 = 12 + Math.sin(angle) * 6.2;
            const x2 = 12 + Math.cos(angle) * 8.4;
            const y2 = 12 + Math.sin(angle) * 8.4;
            return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...stroke} />;
          })}
          <Circle cx="12" cy="12" r="1.5" {...drop} />
        </G>
      );
      case 'note': return (
        <G>
          <Line x1="4" y1="6.2" x2="12.6" y2="6.2" {...stroke} />
          <Line x1="4" y1="11" x2="9.6" y2="11" {...stroke} />
          <Line x1="4" y1="15.8" x2="7.6" y2="15.8" {...stroke} />
          <Path d="M12.6 17.6 L18.9 11.3 C19.7 10.5 19.7 9.4 18.9 8.6 C18.1 7.8 17 7.8 16.2 8.6 L9.9 14.9 L9 18.5 L12.6 17.6 Z" {...stroke} />
          <Circle cx="8.7" cy="19.2" r="1.2" {...drop} />
        </G>
      );
      case 'checkin': return (
        <G>
          <Rect x="4.8" y="4.6" width="14.4" height="16.4" rx="2.2" {...stroke} />
          <Path d="M9.4 4.6 V3.4 C9.4 3 9.7 2.8 10 2.8 H14 C14.3 2.8 14.6 3 14.6 3.4 V4.6" {...stroke} />
          <Path d="M8.6 13.6 L11 16 L15.4 10.6" {...stroke} />
          <Circle cx="12" cy="7.6" r="1.1" {...drop} />
        </G>
      );
      case 'star': return (
        <G>
          <Path d="M12 3.6 L14.4 8.9 L20.3 9.6 L15.9 13.5 L17.2 19.3 L12 16.3 L6.8 19.3 L8.1 13.5 L3.7 9.6 L9.6 8.9 Z" {...stroke} />
          <Circle cx="12" cy="12.4" r="1.3" {...drop} />
        </G>
      );
      default: return null;
    }
  })();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icon}
    </Svg>
  );
}

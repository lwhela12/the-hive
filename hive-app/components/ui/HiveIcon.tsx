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
  | 'star'
  | 'suitcase'
  | 'cake'
  | 'pin'
  | 'crown'
  | 'tv'
  | 'chart'
  // Board marks — drawn so a board can wear the family instead of a stock
  // emoji (Nat 2026-07-24: "that's very upscale and sleek").
  | 'trophy'
  | 'book'
  | 'handshake'
  | 'palette'
  | 'megaphone'
  | 'sprout'
  | 'fork'
  | 'heart'
  | 'home'
  | 'question'
  | 'target'
  | 'gift'
  | 'swap';

export function HiveIcon({
  name,
  size = 20,
  color = '#8e6f35',
}: {
  name: HiveIconName;
  size?: number;
  color?: string;
}) {
  // Constant-weight lines: normalize the stroke by render size so it stays
  // ~1.6 CSS px whether the icon draws at 16 or 32 (matches the footer).
  const stroke = { stroke: color, strokeWidth: (1.6 * 24) / size, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
  const drop = { fill: color };

  const icon = (() => {
    switch (name) {
      case 'honeypot': return (
        <G>
          {/* Lid cap */}
          <Path d="M8.4 6.4 C8.4 5.1 10 4.3 12 4.3 C14 4.3 15.6 5.1 15.6 6.4" {...stroke} />
          {/* Wide rim band */}
          <Rect x="6.4" y="6.4" width="11.2" height="3" rx="1.5" {...stroke} />
          {/* Squat bulging body */}
          <Path d="M7.6 9.4 C5.9 10.8 4.9 12.6 4.9 14.4 C4.9 17.8 8 20.3 12 20.3 C16 20.3 19.1 17.8 19.1 14.4 C19.1 12.6 18.1 10.8 16.4 9.4" {...stroke} />
          {/* Honey dripping from the rim */}
          <Path d="M10.2 9.4 L10.2 11" {...stroke} />
          <Circle cx="10.2" cy="12.3" r="1.4" {...drop} />
        </G>
      );
      // Matches the footer's grid-outline — one referent, one mark.
      case 'board': return (
        <G>
          <Rect x="4" y="4" width="6.8" height="6.8" rx="1.8" {...stroke} />
          <Rect x="13.2" y="4" width="6.8" height="6.8" rx="1.8" {...stroke} />
          <Rect x="4" y="13.2" width="6.8" height="6.8" rx="1.8" {...stroke} />
          <Rect x="13.2" y="13.2" width="6.8" height="6.8" rx="1.8" {...stroke} />
          <Circle cx="16.6" cy="16.6" r="1.3" {...drop} />
        </G>
      );
      // Matches the footer's chatbubble-ellipses — round bubble, dot trio.
      case 'message': return (
        <G>
          <Path d="M12 4.2 C16.5 4.2 20 7.4 20 11.5 C20 15.6 16.5 18.8 12 18.8 C10.9 18.8 9.9 18.6 9 18.3 C7.9 18.9 6.4 19.5 4.9 19.8 C4.4 19.9 4 19.4 4.2 19 C4.7 17.9 5.1 16.7 5.2 15.7 C4.4 14.5 4 13.1 4 11.5 C4 7.4 7.5 4.2 12 4.2 Z" {...stroke} />
          <Circle cx="8.6" cy="11.5" r="1.15" {...drop} />
          <Circle cx="12" cy="11.5" r="1.15" {...drop} />
          <Circle cx="15.4" cy="11.5" r="1.15" {...drop} />
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
      case 'suitcase': return (
        <G>
          <Rect x="4.6" y="8" width="14.8" height="12.4" rx="2.2" {...stroke} />
          <Path d="M9.4 8 V6.4 C9.4 5.6 10 5.1 10.8 5.1 H13.2 C14 5.1 14.6 5.6 14.6 6.4 V8" {...stroke} />
          <Line x1="8.6" y1="8" x2="8.6" y2="20.4" {...stroke} />
          <Line x1="15.4" y1="8" x2="15.4" y2="20.4" {...stroke} />
          <Circle cx="12" cy="14" r="1.3" {...drop} />
        </G>
      );
      case 'cake': return (
        <G>
          <Path d="M4.6 20.4 H19.4 V13.8 C19.4 12.7 18.5 11.8 17.4 11.8 H6.6 C5.5 11.8 4.6 12.7 4.6 13.8 Z" {...stroke} />
          <Path d="M4.6 16 C6.4 17.6 8.2 15 10.1 16 C12 17 13.9 15 15.8 16 C17.2 16.7 18.2 16.4 19.4 15.6" {...stroke} />
          <Line x1="12" y1="11.8" x2="12" y2="8.6" {...stroke} />
          <Circle cx="12" cy="6.6" r="1.4" {...drop} />
        </G>
      );
      case 'pin': return (
        <G>
          <Path d="M12 21 C12 21 5.6 14.9 5.6 10.1 C5.6 6.5 8.4 3.6 12 3.6 C15.6 3.6 18.4 6.5 18.4 10.1 C18.4 14.9 12 21 12 21 Z" {...stroke} />
          <Circle cx="12" cy="10" r="1.5" {...drop} />
        </G>
      );
      case 'crown': return (
        <G>
          <Path d="M5.2 16.8 L4.2 8.4 L8.6 11.4 L12 6.4 L15.4 11.4 L19.8 8.4 L18.8 16.8 Z" {...stroke} />
          <Line x1="5.8" y1="20" x2="18.2" y2="20" {...stroke} />
          <Circle cx="12" cy="13.4" r="1.3" {...drop} />
        </G>
      );
      case 'tv': return (
        <G>
          <Rect x="3.6" y="6.2" width="16.8" height="11.6" rx="2.2" {...stroke} />
          <Line x1="9" y1="21" x2="15" y2="21" {...stroke} />
          <Line x1="12" y1="17.8" x2="12" y2="21" {...stroke} />
          <Circle cx="12" cy="12" r="1.5" {...drop} />
        </G>
      );
      case 'chart': return (
        <G>
          <Line x1="4.4" y1="20" x2="19.6" y2="20" {...stroke} />
          <Line x1="7.6" y1="16.4" x2="7.6" y2="11.8" {...stroke} />
          <Line x1="12" y1="16.4" x2="12" y2="7.2" {...stroke} />
          <Line x1="16.4" y1="16.4" x2="16.4" y2="9.8" {...stroke} />
          <Circle cx="12" cy="4.6" r="1.3" {...drop} />
        </G>
      );
      case 'trophy': return (
        <G>
          <Path d="M7.4 4.6 H16.6 V9.4 C16.6 12 14.5 14.1 12 14.1 C9.5 14.1 7.4 12 7.4 9.4 Z" {...stroke} />
          <Path d="M7.4 6.2 H5 C4.3 6.2 3.8 6.7 3.8 7.4 C3.8 9.3 5.3 10.8 7.2 10.9" {...stroke} />
          <Path d="M16.6 6.2 H19 C19.7 6.2 20.2 6.7 20.2 7.4 C20.2 9.3 18.7 10.8 16.8 10.9" {...stroke} />
          <Line x1="12" y1="14.1" x2="12" y2="17" {...stroke} />
          <Path d="M8.4 20 C8.4 18.4 10 17 12 17 C14 17 15.6 18.4 15.6 20 Z" {...stroke} />
          <Circle cx="12" cy="8.8" r="1.4" {...drop} />
        </G>
      );
      case 'book': return (
        <G>
          <Path d="M4.2 5.4 C4.2 4.7 4.7 4.2 5.4 4.2 H10 C11.1 4.2 12 5.1 12 6.2 V19.4 C12 18.5 11.2 17.8 10.2 17.8 H5.4 C4.7 17.8 4.2 17.3 4.2 16.6 Z" {...stroke} />
          <Path d="M19.8 5.4 C19.8 4.7 19.3 4.2 18.6 4.2 H14 C12.9 4.2 12 5.1 12 6.2 V19.4 C12 18.5 12.8 17.8 13.8 17.8 H18.6 C19.3 17.8 19.8 17.3 19.8 16.6 Z" {...stroke} />
          <Circle cx="12" cy="21" r="1.3" {...drop} />
        </G>
      );
      case 'handshake': return (
        <G>
          <Path d="M3.4 10.6 L7 7.4 C7.5 7 8.2 7 8.7 7.3 L11.4 9.2" {...stroke} />
          <Path d="M20.6 10.6 L17 7.4 C16.5 7 15.8 7 15.3 7.3 L12.6 9.2" {...stroke} />
          <Path d="M11.4 9.2 L9.2 11.2 C8.6 11.8 8.6 12.7 9.2 13.3 C9.8 13.9 10.7 13.9 11.3 13.3 L12 12.7 L14.4 15 C15 15.6 15.9 15.6 16.5 15 C17.1 14.4 17.1 13.5 16.5 12.9 L12.6 9.2" {...stroke} />
          <Path d="M3.4 10.6 L3.4 14.4 C3.4 15 3.9 15.5 4.5 15.5 H5.6" {...stroke} />
          <Path d="M20.6 10.6 L20.6 14.4 C20.6 15 20.1 15.5 19.5 15.5 H18.4" {...stroke} />
          <Circle cx="12" cy="19.6" r="1.3" {...drop} />
        </G>
      );
      case 'palette': return (
        <G>
          <Path d="M12 3.8 C16.9 3.8 20.6 7.1 20.6 11.3 C20.6 13.7 18.9 15.2 16.9 15.2 H15.2 C14.2 15.2 13.6 16 13.9 16.9 C14.2 17.8 13.6 18.8 12.6 19 C12.4 19.1 12.2 19.1 12 19.1 C7.1 19.1 3.4 15.7 3.4 11.5 C3.4 7.2 7.1 3.8 12 3.8 Z" {...stroke} />
          <Circle cx="8.2" cy="9.2" r="1.15" {...drop} />
          <Circle cx="12" cy="7.4" r="1.15" {...drop} />
          <Circle cx="15.8" cy="9.4" r="1.15" {...drop} />
          <Circle cx="7.8" cy="13.4" r="1.15" {...drop} />
        </G>
      );
      case 'megaphone': return (
        <G>
          <Path d="M18.6 5.2 V17.6 L8.4 14.6 V8.2 Z" {...stroke} />
          <Path d="M8.4 8.2 H5.6 C4.6 8.2 3.8 9 3.8 10 V12.8 C3.8 13.8 4.6 14.6 5.6 14.6 H8.4" {...stroke} />
          <Path d="M7.2 14.6 L8.4 19.6 C8.5 20.2 9 20.6 9.6 20.6 H10.6 C11.4 20.6 12 19.9 11.8 19.1 L10.8 15.6" {...stroke} />
          <Circle cx="21" cy="11.4" r="1.3" {...drop} />
        </G>
      );
      case 'sprout': return (
        <G>
          <Path d="M12 20.4 V11.4" {...stroke} />
          <Path d="M12 12.6 C12 9.6 9.8 7.4 6.8 7.4 C6.2 7.4 5.8 7.9 5.8 8.4 C5.8 11.4 8 13.6 11 13.6 H12" {...stroke} />
          <Path d="M12 11.6 C12 8.9 14 6.8 16.7 6.8 C17.3 6.8 17.7 7.3 17.7 7.8 C17.7 10.5 15.6 12.6 12.9 12.6 H12" {...stroke} />
          <Circle cx="12" cy="4.6" r="1.4" {...drop} />
        </G>
      );
      case 'fork': return (
        <G>
          <Path d="M7.2 3.8 V8.4 C7.2 9.6 8.2 10.6 9.4 10.6 C10.6 10.6 11.6 9.6 11.6 8.4 V3.8" {...stroke} />
          <Line x1="9.4" y1="10.6" x2="9.4" y2="20.2" {...stroke} />
          <Line x1="9.4" y1="3.8" x2="9.4" y2="8" {...stroke} />
          <Path d="M16.6 20.2 V13.6 C18 13.2 18.9 11.9 18.9 10.2 V6 C18.9 4.8 18.2 3.8 17.2 3.8 C16.2 3.8 15.4 4.8 15.4 6 V10.2 C15.4 11.9 15.4 13.2 16.6 13.6" {...stroke} />
          <Circle cx="12.8" cy="21" r="1.2" {...drop} />
        </G>
      );
      case 'heart': return (
        <G>
          <Path d="M12 20 C12 20 3.8 15.3 3.8 9.6 C3.8 7 5.8 5 8.3 5 C9.9 5 11.3 5.9 12 7.2 C12.7 5.9 14.1 5 15.7 5 C18.2 5 20.2 7 20.2 9.6 C20.2 15.3 12 20 12 20 Z" {...stroke} />
          <Circle cx="12" cy="11.4" r="1.4" {...drop} />
        </G>
      );
      case 'home': return (
        <G>
          <Path d="M3.8 11 L12 4.2 L20.2 11" {...stroke} />
          <Path d="M5.8 12.4 V19 C5.8 19.7 6.3 20.2 7 20.2 H17 C17.7 20.2 18.2 19.7 18.2 19 V12.4" {...stroke} />
          <Circle cx="12" cy="15.6" r="1.4" {...drop} />
        </G>
      );
      case 'question': return (
        <G>
          <Circle cx="12" cy="12" r="8.2" {...stroke} />
          <Path d="M9.4 9.4 C9.4 8 10.6 7 12 7 C13.4 7 14.6 8 14.6 9.4 C14.6 11.2 12 11.4 12 13.6" {...stroke} />
          <Circle cx="12" cy="16.6" r="1.3" {...drop} />
        </G>
      );
      case 'target': return (
        <G>
          <Circle cx="12" cy="12" r="8.2" {...stroke} />
          <Circle cx="12" cy="12" r="4.4" {...stroke} />
          <Circle cx="12" cy="12" r="1.5" {...drop} />
        </G>
      );
      // Two lanes running opposite ways — moving between HIVEs, not a refresh.
      case 'swap': return (
        <G>
          <Path d="M4.4 9.2 H17.2" {...stroke} />
          <Path d="M14.2 6.2 L17.2 9.2 L14.2 12.2" {...stroke} />
          <Path d="M19.6 14.8 H6.8" {...stroke} />
          <Path d="M9.8 11.8 L6.8 14.8 L9.8 17.8" {...stroke} />
        </G>
      );
      case 'gift': return (
        <G>
          <Rect x="3.8" y="8.6" width="16.4" height="4" rx="1.2" {...stroke} />
          <Path d="M5.4 12.6 V19 C5.4 19.7 5.9 20.2 6.6 20.2 H17.4 C18.1 20.2 18.6 19.7 18.6 19 V12.6" {...stroke} />
          <Line x1="12" y1="8.6" x2="12" y2="20.2" {...stroke} />
          <Path d="M12 8.6 C12 8.6 10.9 4.4 8.6 4.4 C7.4 4.4 6.6 5.3 6.6 6.4 C6.6 7.8 8.2 8.6 12 8.6 Z" {...stroke} />
          <Path d="M12 8.6 C12 8.6 13.1 4.4 15.4 4.4 C16.6 4.4 17.4 5.3 17.4 6.4 C17.4 7.8 15.8 8.6 12 8.6 Z" {...stroke} />
          <Circle cx="12" cy="16" r="1.3" {...drop} />
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

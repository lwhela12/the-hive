import { useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/** Reveal the editor at its actual scroll position, including on short phones. */
export function MeetingNoteSection({ children, scrollTo, scale = 1, alwaysOpen = false }: {
  children: ReactNode; scrollTo: (y: number) => void; scale?: number; alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  const top = useRef(0);
  const reveal = useRef(false);
  const revealEditor = () => {
    if (!reveal.current) return;
    requestAnimationFrame(() => scrollTo(Math.max(0, top.current - 8)));
  };
  return <View onLayout={event => { top.current = event.nativeEvent.layout.y; revealEditor(); }} style={{ gap: 12 }}>
    {!alwaysOpen ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
      onPress={() => { reveal.current = !open; setOpen(!open); }}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14, backgroundColor: pressed ? '#e9d5ad' : '#f1e6ca' })}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16 * scale, color: '#75571f' }}>{open ? 'Close next-step note' : '+ Add a next step'}</Text>
    </Pressable> : null}
    {open ? <View onLayout={() => { revealEditor(); reveal.current = false; }}>{children}</View> : null}
  </View>;
}

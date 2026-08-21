import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * "It's gone and there's nothing to press."
 *
 * Lucas deleted a wish by accident and it took its whole conversation with it
 * (Nat, 2026-08-21). Nothing is destroyed any more — but a safety net nobody
 * can see is not a safety net, so the moment something is removed this says so
 * and offers it straight back.
 *
 * It sits over the bottom of the screen rather than interrupting: an alert
 * asking "are you sure?" a second time would be the same question twice, and
 * the answer to a mistake is a button, not another question.
 *
 * A missed Undo is not a lost wish. This is the fast way back; the slow way is
 * the removed list, which keeps everything.
 */

export type UndoOffer = {
  /** What would be put back. */
  id: string;
  /** Past tense, what just happened. "Wish removed". */
  message: string;
};

const UNDO_WINDOW_MS = 15000;

/**
 * Holds the one thing currently offering itself back, and takes it away again
 * on its own. Screens keep no timers of their own.
 */
export function useUndoOffer(windowMs: number = UNDO_WINDOW_MS) {
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismissUndo = useCallback(() => {
    clearTimer();
    setOffer(null);
    setBusy(false);
  }, [clearTimer]);

  const offerUndo = useCallback((next: UndoOffer) => {
    clearTimer();
    setBusy(false);
    setOffer(next);
    timer.current = setTimeout(() => setOffer(null), windowMs);
  }, [clearTimer, windowMs]);

  // A screen that goes away mid-countdown should not leave a timer running.
  useEffect(() => clearTimer, [clearTimer]);

  return { offer, busy, setBusy, offerUndo, dismissUndo };
}

export function UndoBar({
  offer,
  busy = false,
  onUndo,
  onDismiss,
}: {
  offer: UndoOffer | null;
  busy?: boolean;
  onUndo: (offer: UndoOffer) => void;
  onDismiss: () => void;
}) {
  if (!offer) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: Platform.OS === 'web' ? 'fixed' : 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 24,
        zIndex: 9000,
      } as any}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          maxWidth: 520,
          width: '100%',
          backgroundColor: '#2d2416',
          borderRadius: 16,
          paddingLeft: 16,
          paddingRight: 8,
          paddingVertical: 10,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
        }}
      >
        <Ionicons name="arrow-undo-outline" size={18} color="#f0d9a8" />
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            fontFamily: 'Lato_400Regular',
            fontSize: 14,
            lineHeight: 19,
            color: '#f7ecd8',
            marginLeft: 10,
          }}
        >
          {offer.message}
          {'\n'}
          <Text style={{ fontSize: 12, color: '#c9b48c' }}>
            Nothing was thrown away — you can bring it back.
          </Text>
        </Text>

        <Pressable
          onPress={() => onUndo(offer)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#d8b463' : '#bd9348',
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 9,
            marginLeft: 10,
            opacity: busy ? 0.6 : 1,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2416' }}>
            {busy ? 'Undoing…' : 'Undo'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          style={({ pressed }) => ({
            padding: 8,
            marginLeft: 2,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="close" size={18} color="#c9b48c" />
        </Pressable>
      </View>
    </View>
  );
}

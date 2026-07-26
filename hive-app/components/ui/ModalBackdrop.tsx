import type { ReactNode } from 'react';
import { Pressable, type ViewStyle } from 'react-native';

/**
 * The dimmed area behind a modal, which closes it when you tap it.
 *
 * Some HIVE modals had this and some didn't, so getting out of a sheet meant
 * hunting for the ✕ on exactly the screens where you'd already learned you
 * could just tap away (Nat 2026-07-26). Every modal that's safe to dismiss
 * should use this so the way out is the same everywhere.
 *
 * Children sit inside a Pressable that swallows the tap, so pressing the sheet
 * itself never closes it. Anything already interactive inside keeps working —
 * the swallow only stops the press from reaching the backdrop.
 */
export function ModalBackdrop({
  onClose,
  children,
  style,
  sheetStyle,
}: {
  onClose: () => void;
  children: ReactNode;
  /** Layout for the backdrop itself — how the sheet is parked (centered, bottom…). */
  style?: ViewStyle;
  /** Layout for the tap-swallowing wrapper around the sheet. */
  sheetStyle?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onClose}
      accessibilityLabel="Close"
      style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }, style]}
    >
      <Pressable
        // A View can't stop a press, so the wrapper is a Pressable with a
        // no-op handler. `cursor: default` keeps the web pointer from turning
        // into a hand over the whole sheet (web-only, hence the cast).
        onPress={(event) => event.stopPropagation()}
        style={[{ cursor: 'default' } as unknown as ViewStyle, sheetStyle]}
      >
        {children}
      </Pressable>
    </Pressable>
  );
}

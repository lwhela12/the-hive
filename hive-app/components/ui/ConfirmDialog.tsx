import { Modal, Pressable, Text, View } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';
import { ModalBackdrop } from './ModalBackdrop';

/**
 * "Are you sure?", the same way every time.
 *
 * Nat, 2026-08-04: "I think the log out button should have an 'are you sure'
 * screen first." She was right about more than the rail. Signing out lived in
 * two places, and both were wrong in different directions — the rail signed you
 * out on the first press with no question at all, and the profile page asked
 * politely on a phone and then, on web, took the `Alert.alert` path that React
 * Native does not implement in a browser and signed you straight out anyway.
 * Since almost everybody uses the HIVE in a browser, the confirmation nobody
 * ever saw was the one that mattered.
 *
 * That is the reason this is a component rather than two `window.confirm` calls.
 * `Alert.alert` silently does nothing on web, `window.confirm` does not exist on
 * a phone, and a codebase that reaches for whichever one it remembers ends up
 * with exactly this bug again somewhere else. This renders real views, so it
 * behaves identically on both, wears the page's own colours, and cannot be
 * dismissed into the destructive branch by accident: tapping the dim area or
 * pressing the quiet button both mean no.
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Never mind',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Paints the confirm button in the warning red instead of the HIVE gold. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const skin = usePageSkin();
  const accent = destructive ? '#c0523f' : skin.gold;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <ModalBackdrop
        onClose={onCancel}
        style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}
        sheetStyle={{ width: '100%', maxWidth: 380 }}
      >
        <View
          style={{
            backgroundColor: skin.dark ? '#0F1119' : skin.card,
            borderColor: skin.border,
            borderWidth: 1,
            borderRadius: 20,
            padding: 24,
          }}
        >
          <Text
            style={{
              fontFamily: 'LibreBaskerville_400Regular',
              fontSize: 20,
              lineHeight: 28,
              color: skin.ink,
              marginBottom: body ? 8 : 20,
            }}
          >
            {title}
          </Text>

          {body ? (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 15,
                lineHeight: 22,
                color: skin.inkBody,
                marginBottom: 22,
              }}
            >
              {body}
            </Text>
          ) : null}

          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingVertical: 13,
              alignItems: 'center',
              backgroundColor: accent,
              opacity: pressed ? 0.86 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#fffdf5' }}>
              {confirmLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingVertical: 13,
              marginTop: 8,
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: skin.inkSoft }}>
              {cancelLabel}
            </Text>
          </Pressable>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

import { Alert, Platform } from 'react-native';

/**
 * Telling somebody something, on both platforms.
 *
 * `Alert.alert` does nothing at all in a browser. Not degraded — nothing.
 * react-native-web's implementation is, in full:
 *
 *     class Alert { static alert() {} }
 *
 * Since almost everyone uses the HIVE in a browser, every `Alert.alert` in the
 * app is a message nobody receives. That is how "the button does nothing" keeps
 * happening: the write fails, the code politely explains why, and the
 * explanation is discarded before it reaches a screen.
 *
 * Three private copies of this function already existed — in `board.tsx`,
 * `BoardPostDetail.tsx` and `LinkedLogins.tsx` — each written the day somebody
 * noticed the problem on the screen they happened to be working on, and each
 * adopted by only that screen. `board.tsx` has its own copy and still calls raw
 * `Alert.alert` in 23 of its 26 error paths. So it lives here now, once.
 *
 * For a QUESTION rather than a statement, use `components/ui/ConfirmDialog.tsx`
 * instead — a real view, styled like the app, with the cancel path wired to the
 * safe answer. `window.confirm` works but looks like 1998 and cannot be themed.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/**
 * Asking before doing something destructive, on both platforms.
 *
 * `ConfirmDialog` is the nicer answer and should be preferred for anything on a
 * screen you are already editing — it is a real view, wears the page's colours,
 * and cannot be dismissed into the destructive branch. This exists for the
 * places that need un-breaking without restructuring their state: the same
 * `window.confirm` shape 29 call sites already use, so adopting it changes
 * nothing about how those screens behave.
 *
 * Four destructive buttons were `Alert.alert`-only and therefore completely
 * inert in a browser — you pressed Delete Message, or Archive HD Wish, or
 * Decline Invite, and nothing happened at all, forever, with no explanation.
 * The web path did not silently proceed; it silently refused.
 */
export function confirmAction({
  title,
  message,
  confirmLabel = 'OK',
  destructive = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (window.confirm(`${title}\n\n${message}`)) void onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: () => void onConfirm(),
    },
  ]);
}

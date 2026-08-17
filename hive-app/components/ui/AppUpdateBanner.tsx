import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppUpdate } from '../../lib/hooks/useAppUpdate';

/**
 * "Fresh honey" banner — a slim, dismissible, app-wide bar shown when a newer
 * web deployment is live. Tapping it refreshes into the new build. Web only;
 * renders nothing on native.
 */
export function AppUpdateBanner() {
  const { updateAvailable, applyUpdate } = useAppUpdate();
  /**
   * This bar sits at the very top of the shell, above the rail and above every
   * screen — and it was the one thing up there that never asked where the top
   * actually is. The app is installed to the home screen and `public/index.html`
   * asks iOS for `viewport-fit=cover`, so the page really does start at the top
   * of the glass. It drew under the clock and the battery, and Nat could not
   * tap it: *"i cant even get to the 'fresh honey avail' bar there at the top"*
   * (2026-08-17).
   *
   * Exactly the bug the rail had on 2026-08-06, one component over. Every
   * SCREEN handles this with `edges={['top']}` and the rail reads the insets
   * itself; this now does too, so nothing at the top of the shell is left.
   */
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (Platform.OS !== 'web' || !updateAvailable || dismissed) return null;

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void applyUpdate();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fdf3dc',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(222,193,129,0.7)',
        paddingTop: insets.top,
        // The notch is a corner on a phone held sideways, not a strip at the top.
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <Pressable
        onPress={handleRefresh}
        accessibilityRole="button"
        accessibilityLabel="Refresh to get the latest version of HIVE"
        style={({ pressed }) => ({
          flex: 1,
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: pressed || refreshing ? 0.6 : 1,
        })}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
          {refreshing ? '🍯 Getting fresh honey...' : '🍯 Fresh honey available — tap to refresh'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss update notice"
        hitSlop={8}
        style={({ pressed }) => ({
          paddingVertical: 8,
          paddingHorizontal: 14,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#7b6b59' }}>✕</Text>
      </Pressable>
    </View>
  );
}

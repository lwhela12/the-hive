import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAppUpdate } from '../../lib/hooks/useAppUpdate';

/**
 * "Fresh honey" banner — a slim, dismissible, app-wide bar shown when a newer
 * web deployment is live. Tapping it refreshes into the new build. Web only;
 * renders nothing on native.
 */
export function AppUpdateBanner() {
  const { updateAvailable, applyUpdate } = useAppUpdate();
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

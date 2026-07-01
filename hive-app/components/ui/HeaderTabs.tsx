import { Pressable, StyleSheet, Text, View } from 'react-native';

export type HeaderTabItem<T extends string = string> = {
  key: T;
  label: string;
  count: number;
};

type HeaderTabsProps<T extends string> = {
  tabs: HeaderTabItem<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  actionLabel: string;
  onAction: () => void;
  compact?: boolean;
  compactAction?: boolean;
};

export function HeaderTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  actionLabel,
  onAction,
  compact = false,
  compactAction = compact,
}: HeaderTabsProps<T>) {
  return (
    <View style={[styles.container, compact ? styles.compactContainer : null]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.tab,
              compact ? styles.compactItem : styles.wideTab,
              isActive ? styles.activeTab : styles.inactiveTab,
              pressed ? styles.pressedTab : null,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.74}
              style={[
                styles.tabLabel,
                compact ? styles.compactTabLabel : null,
                isActive ? styles.activeLabel : styles.inactiveLabel,
              ]}
            >
              {tab.label} ({tab.count})
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.actionButton,
          compact && compactAction ? styles.compactItem : null,
          pressed ? styles.pressedTab : null,
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={[styles.actionText, compact ? styles.compactActionText : null]}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    marginBottom: 0,
  },
  compactContainer: {
    gap: 6,
  },
  compactItem: {
    flex: 1,
    minWidth: 0,
  },
  tab: {
    minWidth: 0,
    minHeight: 44,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideTab: {
    minWidth: 150,
  },
  activeTab: {
    backgroundColor: '#fdf3dc',
    borderColor: 'rgba(222,193,129,0.7)',
  },
  inactiveTab: {
    backgroundColor: '#fffdf5',
    borderColor: 'rgba(222,193,129,0.58)',
  },
  pressedTab: {
    opacity: 0.8,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: 'Lato_700Bold',
    fontSize: 16,
    letterSpacing: 0,
  },
  compactTabLabel: {
    fontSize: 15,
  },
  activeLabel: {
    color: '#2d2d2d',
  },
  inactiveLabel: {
    color: '#8e7a5e',
  },
  actionButton: {
    flexShrink: 0,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(222,193,129,0.72)',
    backgroundColor: '#fffdf5',
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 15,
    letterSpacing: 0,
    color: '#bd9348',
  },
  compactActionText: {
    fontSize: 14,
  },
});

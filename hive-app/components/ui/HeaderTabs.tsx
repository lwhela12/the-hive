import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type HeaderTabItem<T extends string = string> = {
  key: T;
  label: string;
  count?: number;
};

type HeaderTabsProps<T extends string> = {
  tabs: HeaderTabItem<T>[];
  activeTab?: T;
  onChange?: (tab: T) => void;
  actionLabel?: string;
  onAction?: () => void;
  /** Extra right-side action pills (rendered after actionLabel, right-aligned). */
  actions?: ReactNode;
  compact?: boolean;
  compactAction?: boolean;
  stretchTabs?: boolean;
};

/**
 * Shared section-header grammar: folder tab(s) on the left, action pills on
 * the right. One style for single- and multi-tab headers (tab label 15,
 * padding 12/8; pill label 12, padding 10/6).
 */
export function HeaderTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  actionLabel,
  onAction,
  actions,
  compact = false,
  compactAction = compact,
  stretchTabs = compact,
}: HeaderTabsProps<T>) {
  const hasActions = Boolean((actionLabel && onAction) || actions);

  return (
    <View style={[styles.container, compact ? styles.compactContainer : null]}>
      {tabs.map((tab) => {
        const isActive = tabs.length === 1 || tab.key === activeTab;
        const label = `${tab.label}${typeof tab.count === 'number' ? ` (${tab.count})` : ''}`;
        const labelNode = (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.74}
            style={[styles.tabLabel, isActive ? styles.activeLabel : styles.inactiveLabel]}
          >
            {label}
          </Text>
        );

        // Static (single, non-switchable) titles render the same folder tab
        // without press affordances.
        if (!onChange) {
          return (
            <View
              key={tab.key}
              style={[
                styles.tab,
                compact && stretchTabs ? styles.stretchItem : null,
                styles.shrinkTab,
                isActive ? styles.activeTab : styles.inactiveTab,
              ]}
            >
              {labelNode}
            </View>
          );
        }

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={({ pressed }) => [
              styles.tab,
              compact && stretchTabs ? styles.stretchItem : null,
              isActive ? styles.activeTab : styles.inactiveTab,
              pressed ? styles.pressed : null,
            ]}
          >
            {labelNode}
          </Pressable>
        );
      })}

      {hasActions ? <View style={styles.spacer} /> : null}

      {actionLabel && onAction ? (
        compact && compactAction ? (
          <View style={styles.stretchItem}>
            <HeaderActionPill label={actionLabel} onPress={onAction} />
          </View>
        ) : (
          <HeaderActionPill label={actionLabel} onPress={onAction} />
        )
      ) : null}

      {actions}
    </View>
  );
}

type HeaderActionPillProps = {
  label: string;
  onPress: () => void;
  /** Toggled/active state (gold border, cream fill, darker label). */
  selected?: boolean;
  disabled?: boolean;
  /** Slightly larger variant for standalone rows (e.g. Refresh / Customize). */
  large?: boolean;
  accessibilityLabel?: string;
};

export function HeaderActionPill({
  label,
  onPress,
  selected,
  disabled = false,
  large = false,
  accessibilityLabel,
}: HeaderActionPillProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [
        styles.pill,
        large ? styles.pillLarge : null,
        {
          borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.72)',
          backgroundColor: selected ? '#fdf3dc' : pressed ? '#fbf0d7' : '#fffdf5',
        },
        disabled ? styles.disabled : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.pillText,
          large ? styles.pillTextLarge : null,
          selected ? styles.pillTextSelected : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  spacer: {
    flexGrow: 1,
    flexShrink: 0,
  },
  stretchItem: {
    flex: 1,
    minWidth: 0,
  },
  shrinkTab: {
    flexShrink: 1,
    minWidth: 0,
  },
  tab: {
    minWidth: 0,
    minHeight: 38,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#fdf3dc',
    borderColor: 'rgba(222,193,129,0.7)',
  },
  inactiveTab: {
    backgroundColor: '#fffdf5',
    borderColor: 'rgba(222,193,129,0.58)',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: 'Lato_700Bold',
    fontSize: 15,
    letterSpacing: 0,
  },
  activeLabel: {
    color: '#2d2d2d',
  },
  inactiveLabel: {
    color: '#8e7a5e',
  },
  pill: {
    flexShrink: 0,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLarge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 12,
    letterSpacing: 0,
    color: '#bd9348',
  },
  pillTextLarge: {
    fontSize: 13,
  },
  pillTextSelected: {
    color: '#8e6f35',
  },
});

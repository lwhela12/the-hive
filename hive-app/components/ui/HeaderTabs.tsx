import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';
import { usePageSkin } from '../../lib/pageSkin';
import { accentWash, hiveAccent } from '../../lib/hiveBrand';

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
  /** Override the HIVE's colour. Almost nothing should need this. */
  accent?: string;
};

/**
 * Shared section-header grammar: folder tab(s) on the left, action pills on
 * the right. One style for single- and multi-tab headers (tab label 15,
 * padding 12/8; pill label 12, padding 10/6).
 *
 * It reads the HIVE and the page skin ITSELF, the way AppHeader does, rather
 * than taking them as props. Nat, 2026-08-03: "all OG HIVE have creams & all
 * Tech tabs are blue and all Production tabs are purple". Every tab in the app
 * was gold regardless of which HIVE you were standing in, because the accent
 * lived only in the header bar and the rail — and threading it through the
 * dozen screens that use these tabs is a dozen chances to miss one. Per-screen
 * opt-in is exactly what caused the "colours don't stay with me" bug earlier
 * the same day; the fix there was the same as the fix here.
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
  accent,
}: HeaderTabsProps<T>) {
  const hasActions = Boolean((actionLabel && onAction) || actions);
  const { community, wholeHive } = useAuth();
  const skin = usePageSkin();
  // At HIVE-Wide there is no HIVE to be the colour of, so it wears the gold
  // that reads on space — same call the rail and the header already make.
  const tone = accent ?? (wholeHive ? skin.gold : hiveAccent(community));

  const tabStyles = {
    active: {
      backgroundColor: skin.dark ? accentWash(tone, 0.18) : accentWash(tone, 0.16),
      borderColor: accentWash(tone, skin.dark ? 0.5 : 0.62),
    },
    inactive: {
      backgroundColor: skin.card,
      borderColor: accentWash(tone, skin.dark ? 0.3 : 0.44),
    },
    activeLabel: { color: skin.ink },
    inactiveLabel: { color: skin.inkSoft },
  };

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
            style={[styles.tabLabel, isActive ? tabStyles.activeLabel : tabStyles.inactiveLabel]}
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
                isActive ? tabStyles.active : tabStyles.inactive,
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
              isActive ? tabStyles.active : tabStyles.inactive,
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
            <HeaderActionPill label={actionLabel} onPress={onAction} accent={tone} />
          </View>
        ) : (
          <HeaderActionPill label={actionLabel} onPress={onAction} accent={tone} />
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
  /** Override the HIVE's colour. Defaults to whichever HIVE you're standing in. */
  accent?: string;
};

export function HeaderActionPill({
  label,
  onPress,
  selected,
  disabled = false,
  large = false,
  accessibilityLabel,
  accent,
}: HeaderActionPillProps) {
  const { community, wholeHive } = useAuth();
  const skin = usePageSkin();
  const tone = accent ?? (wholeHive ? skin.gold : hiveAccent(community));
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
          borderColor: selected ? tone : accentWash(tone, skin.dark ? 0.46 : 0.72),
          backgroundColor: selected
            ? tone
            : pressed
              ? accentWash(tone, skin.dark ? 0.22 : 0.16)
              : skin.card,
        },
        disabled ? styles.disabled : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.pillText,
          { color: selected ? '#fffdf5' : skin.dark ? skin.ink : tone },
          large ? styles.pillTextLarge : null,
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
  },
  pillTextLarge: {
    fontSize: 13,
  },
});

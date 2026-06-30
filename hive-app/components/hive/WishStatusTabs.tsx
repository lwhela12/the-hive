import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type WishStatusTabKey = 'public' | 'granted';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type WishStatusTab = {
  key: WishStatusTabKey;
  label: string;
  count: number;
  icon: IoniconName;
};

type WishStatusTabsProps = {
  tabs: WishStatusTab[];
  activeTab: WishStatusTabKey;
  onChange: (tab: WishStatusTabKey) => void;
};

export function WishStatusTabs({
  tabs,
  activeTab,
  onChange,
}: WishStatusTabsProps) {
  return (
    <View style={styles.container}>
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
              isActive ? styles.activeTab : styles.inactiveTab,
              pressed ? styles.pressedTab : null,
            ]}
          >
            <Ionicons
              name={tab.icon}
              size={15}
              color={isActive ? '#bd9348' : '#8e7a5e'}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={[
                styles.tabLabel,
                isActive ? styles.activeLabel : styles.inactiveLabel,
              ]}
            >
              {tab.label}
            </Text>
            <View style={[styles.countPill, isActive ? styles.activeCountPill : styles.inactiveCountPill]}>
              <Text style={[styles.countText, isActive ? styles.activeCountText : styles.inactiveCountText]}>
                {tab.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(222,193,129,0.28)',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#fffdf5',
    borderColor: 'rgba(189,147,72,0.45)',
  },
  inactiveTab: {
    backgroundColor: 'rgba(255,253,245,0.48)',
    borderColor: 'rgba(222,193,129,0.24)',
  },
  pressedTab: {
    opacity: 0.8,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: 'Lato_700Bold',
    fontSize: 12.5,
    letterSpacing: 0,
  },
  activeLabel: {
    color: '#2d2d2d',
  },
  inactiveLabel: {
    color: '#8e7a5e',
  },
  countPill: {
    minWidth: 22,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCountPill: {
    backgroundColor: 'rgba(189,147,72,0.16)',
  },
  inactiveCountPill: {
    backgroundColor: 'rgba(142,122,94,0.1)',
  },
  countText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 11,
    letterSpacing: 0,
  },
  activeCountText: {
    color: '#bd9348',
  },
  inactiveCountText: {
    color: '#8e7a5e',
  },
});

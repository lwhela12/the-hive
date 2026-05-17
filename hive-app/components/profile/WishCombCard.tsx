import { Ionicons } from '@expo/vector-icons';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Wish } from '../../types';

const publicBeeIcon = require('../../assets/BEE ONLY IN GOLD BG.png');

type WishCombCardProps = {
  wish: Wish;
  expanded?: boolean;
  linkedBoardLabel?: string | null;
  onToggle?: (wish: Wish) => void;
  onManage?: (wish: Wish) => void;
};

function getStatusMeta(status: Wish['status']) {
  if (status === 'fulfilled') {
    return {
      label: 'Granted',
      color: '#bd9348',
      bg: '#fff4d3',
      rail: '#efc657',
      capBg: '#fff7df',
      border: 'rgba(189,147,72,0.72)',
      iconKind: 'ionicon' as const,
      icon: 'sparkles-outline' as const,
    };
  }
  if (status === 'private') {
    return {
      label: 'Private',
      color: '#77736a',
      bg: '#f4f2eb',
      rail: '#c7c2b5',
      capBg: '#fbfaf5',
      border: 'rgba(119,115,106,0.72)',
      iconKind: 'ionicon' as const,
      icon: 'lock-closed-outline' as const,
    };
  }
  return {
    label: 'Public',
    color: '#a87822',
    bg: '#fff7dc',
    rail: '#f3c044',
    capBg: '#fff9e8',
    border: 'rgba(189,147,72,0.72)',
    iconKind: 'bees' as const,
  };
}

type StatusMeta = ReturnType<typeof getStatusMeta>;

function StatusIcon({
  status,
  compact = false,
}: {
  status: StatusMeta;
  compact?: boolean;
}) {
  if (status.iconKind === 'bees') {
    return <PublicBeesIcon compact={compact} />;
  }

  return (
    <Ionicons
      name={status.icon}
      size={compact ? 12 : 16}
      color={status.color}
    />
  );
}

function PublicBeesIcon({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Image
        source={publicBeeIcon}
        style={styles.beePillIcon}
        resizeMode="contain"
      />
    );
  }

  return (
    <View style={styles.beeCluster}>
      <Image source={publicBeeIcon} style={[styles.beeImage, styles.beeImageOne]} resizeMode="contain" />
      <Image source={publicBeeIcon} style={[styles.beeImage, styles.beeImageTwo]} resizeMode="contain" />
      <Image source={publicBeeIcon} style={[styles.beeImage, styles.beeImageThree]} resizeMode="contain" />
    </View>
  );
}

export function WishCombCard({
  wish,
  expanded = false,
  linkedBoardLabel,
  onToggle,
  onManage,
}: WishCombCardProps) {
  const status = getStatusMeta(wish.status);
  const isLong = wish.description.length > 128 || wish.description.includes('\n');

  const content = (
    <>
      <View style={[styles.topHoneyRail, { backgroundColor: status.rail }]} />
      <View
        style={[
          styles.leftCombCap,
          {
            backgroundColor: status.capBg,
            borderColor: status.border,
          },
        ]}
      >
        <View style={styles.leftCombIcon}>
          <StatusIcon status={status} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: status.bg,
                borderColor: status.border,
              },
            ]}
          >
            <StatusIcon status={status} compact />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>

          {onManage && (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onManage(wish);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Manage wish"
              style={styles.manageButton}
            >
              <Ionicons name="pencil-outline" size={16} color="#7a6849" />
            </Pressable>
          )}
        </View>

        <Text
          style={styles.description}
          numberOfLines={expanded ? undefined : 3}
        >
          {wish.description}
        </Text>

        <View style={styles.chipRow}>
          {linkedBoardLabel && (
            <View style={styles.linkedChip}>
              <Ionicons name="folder-open-outline" size={13} color="#bd9348" />
              <Text style={styles.linkedChipText}>
                {linkedBoardLabel}
              </Text>
            </View>
          )}

          {isLong && (
            <Text style={styles.expandHint}>
              {expanded ? 'Less' : 'More'}
            </Text>
          )}
        </View>

        {wish.status === 'fulfilled' && wish.thank_you_message && (
          <Text style={styles.thankYou}>
            "{wish.thank_you_message}"
          </Text>
        )}
      </View>
    </>
  );

  if (!isLong) {
    return (
      <View style={styles.card}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} wish`}
      accessibilityHint={wish.description}
      onPress={() => onToggle?.(wish)}
      style={({ pressed }) => [
        styles.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(222,193,129,0.54)',
    backgroundColor: '#fffefa',
    paddingHorizontal: 18,
    paddingVertical: 16,
    paddingLeft: 58,
    minHeight: 108,
    shadowColor: '#bd9348',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.995 }],
  },
  topHoneyRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 7,
    backgroundColor: '#f3c044',
    opacity: 0.86,
    ...(Platform.OS === 'web'
      ? ({
          clipPath: 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)',
        } as any)
      : {}),
  },
  leftCombCap: {
    position: 'absolute',
    left: 14,
    top: 22,
    width: 32,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(189,147,72,0.36)',
    backgroundColor: '#fff3c7',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '30deg' }],
  },
  leftCombIcon: {
    transform: [{ rotate: '-30deg' }],
  },
  content: {
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  manageButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,234,209,0.7)',
  },
  description: {
    fontFamily: 'Lato_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#2d2d2d',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  linkedChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(189,147,72,0.28)',
    backgroundColor: 'rgba(245,234,209,0.48)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  linkedChipText: {
    fontFamily: 'Lato_700Bold',
    color: '#bd9348',
    fontSize: 12,
    marginLeft: 5,
  },
  expandHint: {
    fontFamily: 'Lato_700Bold',
    color: '#9a8060',
    fontSize: 12,
  },
  thankYou: {
    fontFamily: 'LibreBaskerville_400Regular',
    color: 'rgba(45,45,45,0.66)',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
    marginTop: 10,
  },
  beeCluster: {
    position: 'relative',
    width: 25,
    height: 18,
  },
  beePillIcon: {
    width: 13,
    height: 13,
  },
  beeImage: {
    position: 'absolute',
  },
  beeImageOne: {
    left: 0,
    top: 4,
    width: 15,
    height: 15,
  },
  beeImageTwo: {
    left: 10,
    top: -1,
    width: 12,
    height: 12,
    opacity: 0.86,
  },
  beeImageThree: {
    left: 14,
    top: 9,
    width: 10,
    height: 10,
    opacity: 0.76,
  },
});

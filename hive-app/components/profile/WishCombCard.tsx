import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateShort } from '../../lib/dateUtils';
import { getHdWishStatusLabel, getWishBodyPreview, getWishQuickTitle, hasSeparateWishTitle } from '../../lib/wishDisplay';
import { Avatar } from '../ui/Avatar';
import type { Wish } from '../../types';

const publicBeeIcon = require('../../assets/BEE ONLY IN GOLD BG.png');
const ACTIVE_WISH_CARD_BACKGROUND = '#fff8e8';
const GRANTED_WISH_CARD_BACKGROUND = '#fffdf5';

type WishCombCardWish = Pick<Wish, 'id' | 'description' | 'status'> & Partial<Wish>;

type WishCombCardProps = {
  wish: WishCombCardWish;
  linkedBoardLabel?: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  onManage?: (wish: WishCombCardWish) => void;
};

function getStatusMeta(status: Wish['status']) {
  if (status === 'fulfilled') {
    return {
      label: getHdWishStatusLabel(status),
      color: '#bd9348',
      bg: 'rgba(255,244,211,0.72)',
      border: 'rgba(189,147,72,0.5)',
      iconKind: 'ionicon' as const,
      icon: 'sparkles-outline' as const,
    };
  }
  if (status === 'private') {
    return {
      label: getHdWishStatusLabel(status),
      color: '#77736a',
      bg: 'rgba(244,242,235,0.78)',
      border: 'rgba(119,115,106,0.42)',
      iconKind: 'ionicon' as const,
      icon: 'lock-closed-outline' as const,
    };
  }
  return {
    label: getHdWishStatusLabel(status),
    color: '#a87822',
    bg: 'rgba(255,247,220,0.78)',
    border: 'rgba(189,147,72,0.5)',
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
      size={compact ? 14 : 16}
      color={status.color}
    />
  );
}

function PublicBeesIcon({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.beeCluster, compact ? styles.beeClusterCompact : null]}>
      <Image source={publicBeeIcon} style={[styles.beeImage, compact ? styles.beePillOne : styles.beeImageOne]} resizeMode="contain" />
      <Image source={publicBeeIcon} style={[styles.beeImage, compact ? styles.beePillTwo : styles.beeImageTwo]} resizeMode="contain" />
      <Image source={publicBeeIcon} style={[styles.beeImage, compact ? styles.beePillThree : styles.beeImageThree]} resizeMode="contain" />
    </View>
  );
}

export function WishCombCard({
  wish,
  linkedBoardLabel,
  ownerName,
  ownerAvatarUrl,
  onManage,
}: WishCombCardProps) {
  const status = getStatusMeta(wish.status);
  const isGranted = wish.status === 'fulfilled';
  const isPrivate = wish.status === 'private';
  const ownerDisplayName = (ownerName ?? '').trim();
  const showOwnerRow = isGranted && ownerDisplayName.length > 0;
  const showStatusPill = !isGranted;
  const quickTitle = getWishQuickTitle(wish);
  const bodyPreview = getWishBodyPreview(wish);
  const showBodyPreview = hasSeparateWishTitle(wish);
  const dateLabel = isGranted && wish.fulfilled_at
    ? `${getHdWishStatusLabel('fulfilled')} · ${formatDateShort(wish.fulfilled_at)}`
    : wish.created_at
      ? formatDateShort(wish.created_at)
      : null;
  const cardStyle = [
    styles.card,
    isPrivate ? styles.cardPrivate : styles.cardPublic,
    isGranted ? styles.cardGranted : null,
  ];

  const content = (
    <>
      <View style={styles.content}>
        {(showOwnerRow || showStatusPill || onManage) && (
          <View style={styles.metaRow}>
            {showOwnerRow ? (
              <View style={styles.ownerRow}>
                <Avatar name={ownerDisplayName} url={ownerAvatarUrl} size={44} />
                <Text style={styles.ownerName} numberOfLines={1}>
                  {ownerDisplayName}
                </Text>
              </View>
            ) : showStatusPill ? (
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
            ) : (
              <View style={styles.metaSpacer} />
            )}

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
        )}

        <Text
          style={[
            styles.quickTitle,
            isGranted ? styles.descriptionGranted : styles.descriptionOpen,
            isPrivate ? styles.descriptionPrivate : null,
          ]}
          numberOfLines={2}
        >
          {quickTitle}
        </Text>

        {showBodyPreview && (
          <Text
            style={[
              styles.description,
              isGranted ? styles.descriptionGranted : styles.descriptionPreview,
              isPrivate ? styles.descriptionPrivate : null,
            ]}
            numberOfLines={3}
          >
            {bodyPreview}
          </Text>
        )}

        {linkedBoardLabel && (
          <View
            style={[
              styles.linkedMeta,
              isGranted ? styles.linkedMetaGranted : styles.linkedMetaOpen,
            ]}
          >
            <Ionicons name="link-outline" size={13} color={isGranted ? '#9a8060' : '#b88a3c'} />
            <Text style={[styles.linkedMetaText, isGranted ? styles.linkedMetaTextGranted : null]}>
              {linkedBoardLabel}
            </Text>
          </View>
        )}

        {dateLabel && (
          <View style={styles.footerRow}>
            <Text style={[styles.dateText, isGranted ? styles.dateTextGranted : null]}>
              {dateLabel}
            </Text>
          </View>
        )}
      </View>
    </>
  );

  if (onManage) {
    return (
      <Pressable
        onPress={() => onManage(wish)}
        accessibilityRole="button"
        accessibilityLabel="Manage wish"
        style={({ pressed }) => [
          ...cardStyle,
          pressed ? styles.cardPressed : null,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 0,
    shadowColor: '#bd9348',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardPressed: {
    opacity: 0.84,
  },
  cardPublic: {
    borderColor: 'rgba(222,193,129,0.5)',
    backgroundColor: ACTIVE_WISH_CARD_BACKGROUND,
  },
  cardPrivate: {
    borderColor: 'rgba(119,115,106,0.28)',
    backgroundColor: '#f8f4ea',
  },
  cardGranted: {
    borderColor: 'rgba(222,193,129,0.28)',
    backgroundColor: GRANTED_WISH_CARD_BACKGROUND,
    shadowOpacity: 0.04,
  },
  content: {
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 9,
  },
  ownerRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ownerName: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'Lato_400Regular',
    color: '#7f715f',
    fontSize: 15,
    lineHeight: 21,
  },
  metaSpacer: {
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  manageButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  quickTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  descriptionOpen: {
    fontFamily: 'Lato_700Bold',
    color: '#2d2d2d',
  },
  descriptionPreview: {
    fontFamily: 'Lato_400Regular',
    color: 'rgba(45,45,45,0.68)',
    marginTop: 6,
  },
  descriptionPrivate: {
    color: '#49463f',
  },
  descriptionGranted: {
    fontFamily: 'Lato_400Regular',
    color: '#7f715f',
    fontStyle: 'italic',
    textDecorationLine: 'line-through',
  },
  linkedMeta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 9,
  },
  linkedMetaOpen: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(189,147,72,0.2)',
  },
  linkedMetaGranted: {
    backgroundColor: 'rgba(245,234,209,0.34)',
    borderColor: 'rgba(189,147,72,0.16)',
  },
  linkedMetaText: {
    fontFamily: 'Lato_700Bold',
    color: '#b88a3c',
    fontSize: 12,
    marginLeft: 5,
  },
  linkedMetaTextGranted: {
    color: '#9a8060',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  dateText: {
    fontFamily: 'Lato_400Regular',
    color: 'rgba(45,45,45,0.4)',
    fontSize: 12,
  },
  dateTextGranted: {
    color: 'rgba(45,45,45,0.4)',
  },
  beeCluster: {
    position: 'relative',
    width: 34,
    height: 18,
  },
  beeClusterCompact: {
    width: 34,
    height: 18,
    marginRight: 1,
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
  beePillOne: {
    left: 0,
    top: 5,
    width: 15,
    height: 15,
  },
  beePillTwo: {
    left: 12,
    top: 0,
    width: 13,
    height: 13,
    opacity: 0.9,
  },
  beePillThree: {
    left: 24,
    top: 8,
    width: 10,
    height: 10,
    opacity: 0.72,
  },
});

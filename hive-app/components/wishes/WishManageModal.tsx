import type { ComponentProps } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Wish } from '../../types';

type ManagedWish = Pick<Wish, 'id' | 'description' | 'status'> & Partial<Wish>;
type ActionTone = 'gold' | 'neutral' | 'danger';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface WishManageModalProps<TWish extends ManagedWish> {
  visible: boolean;
  wish: TWish | null;
  onClose: () => void;
  canGrant?: boolean;
  canEdit?: boolean;
  canArchive?: boolean;
  canDelete?: boolean;
  canRefine?: boolean;
  onGrant?: (wish: TWish) => void;
  onEdit?: (wish: TWish) => void;
  onArchive?: (wish: TWish) => void;
  onDelete?: (wish: TWish) => void;
  onRefine?: (wish: TWish) => void;
}

const toneColor = (tone: ActionTone = 'neutral') => (
  tone === 'danger' ? '#ef4444' : tone === 'gold' ? '#bd9348' : 'rgba(49,49,48,0.66)'
);

const actionStyle = (tone: ActionTone = 'neutral') => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: tone === 'danger'
    ? 'rgba(239,68,68,0.18)'
    : tone === 'gold'
      ? 'rgba(189,147,72,0.28)'
      : 'rgba(49,49,48,0.10)',
  backgroundColor: tone === 'danger'
    ? '#fff1f2'
    : tone === 'gold'
      ? '#fff8e8'
      : '#fffdf5',
  marginTop: 8,
});

function WishManageAction({
  label,
  icon,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  icon: IoniconName;
  tone?: ActionTone;
  onPress: () => void;
}) {
  const color = toneColor(tone);

  return (
    <Pressable onPress={onPress} style={actionStyle(tone)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color }}>
          {label}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={tone === 'danger' ? 'rgba(239,68,68,0.45)' : tone === 'gold' ? 'rgba(189,147,72,0.55)' : 'rgba(49,49,48,0.32)'}
      />
    </Pressable>
  );
}

export function WishManageModal<TWish extends ManagedWish>({
  visible,
  wish,
  onClose,
  canGrant = false,
  canEdit = false,
  canArchive = false,
  canDelete = false,
  canRefine = false,
  onGrant,
  onEdit,
  onArchive,
  onDelete,
  onRefine,
}: WishManageModalProps<TWish>) {
  const runAction = (handler?: (wish: TWish) => void) => {
    if (!wish || !handler) return;
    const targetWish = wish;
    onClose();
    if (Platform.OS === 'web') {
      handler(targetWish);
      return;
    }
    // iOS silently drops a modal (or alert) presented while this sheet is
    // still dismissing — hand off only after the dismissal animation.
    setTimeout(() => handler(targetWish), 380);
  };

  return (
    <Modal visible={visible && !!wish} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: '#fffdf5',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 22,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
          }}
        >
          <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.28)', borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d' }}>
                Manage Wish
              </Text>
              {wish ? (
                <Text
                  numberOfLines={2}
                  style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: '#8a7760', marginTop: 4 }}
                >
                  {wish.description}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close wish actions"
              hitSlop={8}
              style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff8e8' }}
            >
              <Ionicons name="close-outline" size={22} color="#8e7a5e" />
            </Pressable>
          </View>

          {canGrant && onGrant ? (
            <WishManageAction
              label="Grant"
              icon="checkmark-circle-outline"
              tone="gold"
              onPress={() => runAction(onGrant)}
            />
          ) : null}

          {canEdit && onEdit ? (
            <WishManageAction
              label="Edit"
              icon="pencil-outline"
              onPress={() => runAction(onEdit)}
            />
          ) : null}

          {canArchive && onArchive ? (
            <WishManageAction
              label="Archive"
              icon="archive-outline"
              onPress={() => runAction(onArchive)}
            />
          ) : null}

          {canRefine && onRefine ? (
            <WishManageAction
              label="Refine with Clive"
              icon="sparkles-outline"
              tone="gold"
              onPress={() => runAction(onRefine)}
            />
          ) : null}

          {canDelete && onDelete ? (
            <WishManageAction
              label="Delete"
              icon="trash-outline"
              tone="danger"
              onPress={() => runAction(onDelete)}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

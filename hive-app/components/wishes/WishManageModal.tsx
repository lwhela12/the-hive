import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Wish } from '../../types';

type ManagedWish = Pick<Wish, 'id' | 'description' | 'status'> & Partial<Wish>;

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

/**
 * What one action looks like: its emoji, its colour, and the ink its word is
 * written in.
 *
 * Nat, 2026-08-05, looking at five full-width pills stacked down the sheet:
 * "those pills are sooooooo long for no reason. Those could be side by side,
 * left to right, and take up WAY less space & each have a different
 * icon/colour, so its easy to tell at a glance & you dont have to read so
 * much." So colour and emoji carry the meaning here and the word underneath
 * only confirms it — which is also why no two of these share a colour.
 */
type TileLook = {
  emoji: string;
  /** The word and the border read in this. */
  ink: string;
  background: string;
  border: string;
};

// Granting is the whole point of the app, so it is the only filled tile —
// solid honey, cream lettering, unmistakably the first thing your eye lands on.
const GRANT_LOOK: TileLook = { emoji: '🎁', ink: '#fffdf5', background: '#bd9348', border: '#a67f3a' };

// Edit and Archive are the quiet ones. They stay pale and unshouty, but they
// are warm grey and cool grey so they still read apart at a glance.
const EDIT_LOOK: TileLook = { emoji: '✏️', ink: '#6b6257', background: '#fffdf5', border: 'rgba(49,49,48,0.13)' };
const ARCHIVE_LOOK: TileLook = { emoji: '📦', ink: '#6b7280', background: '#f5f4f0', border: 'rgba(49,49,48,0.13)' };

// Clive is a gold ✨ everywhere else in the app — the rail draws him that way,
// and so does the "Refine with Clive ✨" link on the member cards. He keeps it.
const CLIVE_LOOK: TileLook = { emoji: '✨', ink: '#bd9348', background: '#fff8e8', border: 'rgba(189,147,72,0.34)' };

// The only red in the set. Delete and Archive are one slip apart and only one
// of them can be undone, so Delete gets the red, the far end of the row, a rule
// between it and everything else, and the arming tap below.
const DELETE_LOOK: TileLook = { emoji: '🗑️', ink: '#c0523f', background: '#fdf1ee', border: 'rgba(192,82,63,0.3)' };
const DELETE_ARMED_LOOK: TileLook = { emoji: '🗑️', ink: '#fffdf5', background: '#c0523f', border: '#a8452f' };

/** How long an armed Delete stays armed before it forgets you touched it. */
const DELETE_ARMED_MS = 4000;

function WishActionTile({
  label,
  look,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  fill = false,
}: {
  label: string;
  look: TileLook;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Fills its parent instead of claiming its own slice of the row. */
  fill?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({
        // Every tile takes an equal share of the row and wraps onto the next
        // line when there is no room, so this works on a phone and on a wide
        // browser window without a breakpoint anywhere.
        ...(fill ? { flex: 1 } : { flexGrow: 1, flexBasis: 84, minWidth: 78, maxWidth: 132 }),
        minHeight: 74,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: look.border,
        backgroundColor: look.background,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 20, lineHeight: 24, marginBottom: 5 }}>{look.emoji}</Text>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: 11.5,
          lineHeight: 14,
          textAlign: 'center',
          color: look.ink,
        }}
      >
        {label}
      </Text>
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
  // Delete asks for a second tap before it hands off. Every screen that opens
  // this sheet already asks "are you sure?" — this is not that question, it is
  // the guard for the new shape: a small tile shoulder to shoulder with Archive
  // is easier to hit by mistake than a pill of its own was.
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    if (!visible) setDeleteArmed(false);
  }, [visible]);

  useEffect(() => {
    setDeleteArmed(false);
  }, [wish?.id]);

  useEffect(() => {
    if (!deleteArmed) return;
    const timer = setTimeout(() => setDeleteArmed(false), DELETE_ARMED_MS);
    return () => clearTimeout(timer);
  }, [deleteArmed]);

  const runAction = (handler?: (wish: TWish) => void) => {
    if (!wish || !handler) return;
    const targetWish = wish;
    setDeleteArmed(false);
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
    <Modal visible={visible && !!wish} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        {/* A ceiling and a scroll, for the same reason the event sheet needed
            them: this shows the whole wish text above the actions, and a long
            wish grew the sheet past the top of the window with no way to reach
            the buttons (Nat 2026-08-05, on the event form: "i'm trapped"). */}
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: '#fffdf5',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
            maxHeight: '88%',
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 22, paddingBottom: 34 }}
            showsVerticalScrollIndicator={false}
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

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 8, marginTop: 14 }}>
            {canGrant && onGrant ? (
              <WishActionTile
                label="Grant"
                look={GRANT_LOOK}
                onPress={() => runAction(onGrant)}
              />
            ) : null}

            {canEdit && onEdit ? (
              <WishActionTile
                label="Edit"
                look={EDIT_LOOK}
                onPress={() => runAction(onEdit)}
              />
            ) : null}

            {canArchive && onArchive ? (
              <WishActionTile
                label="Archive"
                look={ARCHIVE_LOOK}
                onPress={() => runAction(onArchive)}
              />
            ) : null}

            {canRefine && onRefine ? (
              <WishActionTile
                label="Refine with Clive"
                look={CLIVE_LOOK}
                onPress={() => runAction(onRefine)}
              />
            ) : null}

            {canDelete && onDelete ? (
              // Delete travels with its own hairline rule so it never sits flush
              // against Archive, wherever the row happens to wrap.
              <View
                style={{
                  flexGrow: 1,
                  flexBasis: 96,
                  minWidth: 88,
                  maxWidth: 145,
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  gap: 8,
                }}
              >
                <View style={{ width: 1, marginVertical: 8, backgroundColor: 'rgba(49,49,48,0.12)' }} />
                <WishActionTile
                  fill
                  label={deleteArmed ? 'Tap again' : 'Delete'}
                  look={deleteArmed ? DELETE_ARMED_LOOK : DELETE_LOOK}
                  accessibilityLabel={deleteArmed ? 'Tap again to delete this wish' : 'Delete wish'}
                  accessibilityHint={deleteArmed ? undefined : 'Asks you to tap once more first'}
                  onPress={() => {
                    if (!deleteArmed) {
                      setDeleteArmed(true);
                      return;
                    }
                    runAction(onDelete);
                  }}
                />
              </View>
            ) : null}
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

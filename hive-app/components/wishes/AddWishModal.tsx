import { useState, useEffect } from 'react';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import { useDictation } from '../../lib/hooks/useDictation';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { invalidateWishQueries } from '../../lib/queryClient';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { notifyWishMentions } from '../../lib/wishMentions';
import { syncWishEditToLinkedBoard } from '../../lib/wishBoardLinking';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import { WishScopePicker, type WishScope } from '../ui/WishScopePicker';
import type { BoardCategory, Wish } from '../../types';

const WISH_DRAFT_KEY = 'add-wish-draft';
const WISH_TITLE_DRAFT_KEY = 'add-wish-title-draft';

interface AddWishModalProps {
  visible: boolean;
  onClose: () => void;
  communityId: string | null;
  userId: string | undefined;
  onSave: () => void | Promise<void>;
  onRefineWithClive?: (roughWish: string) => void;
  existingWish?: Wish | null;
  linkedBoardCategory?: Pick<BoardCategory, 'id' | 'name'> | null;
  wishOwnerUserId?: string;
  wishOwnerName?: string;
}

export function AddWishModal({
  visible,
  onClose,
  communityId,
  userId,
  onSave,
  onRefineWithClive,
  existingWish,
  linkedBoardCategory,
  wishOwnerUserId,
  wishOwnerName,
}: AddWishModalProps) {
  const [wishText, setWishText] = useState('');
  const [wishScope, setWishScope] = useState<WishScope>('hive');
  const [wishTitle, setWishTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Routed so a spoken wish is drafted like a typed one. Going straight to
  // setWishText would skip handleWishTextChange, and the draft this modal
  // carefully keeps in AsyncStorage would only ever hold what you had typed —
  // so talking your wish and then closing the sheet would lose it.
  const wishDictation = useDictation((updater) =>
    setWishText((prev) => {
      const next = updater(prev);
      if (!existingWish) AsyncStorage.setItem(WISH_DRAFT_KEY, next).catch(() => {});
      return next;
    })
  );
  const { members: mentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(communityId);
  const isEditMode = !!existingWish;
  const isLinkedWish = !!linkedBoardCategory && !existingWish;

  const handleWishTextChange = (text: string) => {
    setWishText(text);
    if (!existingWish) AsyncStorage.setItem(WISH_DRAFT_KEY, text).catch(() => {});
  };

  const handleWishTitleChange = (text: string) => {
    setWishTitle(text);
    if (!existingWish) AsyncStorage.setItem(WISH_TITLE_DRAFT_KEY, text).catch(() => {});
  };

  const wishMentionInput = useMentionInput({
    value: wishText,
    onChangeText: handleWishTextChange,
    members: mentionableMembers,
    currentUserId: userId,
  });

  useEffect(() => {
    if (visible && existingWish) {
      setWishTitle(existingWish.title ?? '');
      setWishText(existingWish.description);
      // ...and load the scope it actually has. Without this the picker opened
      // on "This HIVE only" every time regardless of the truth, so even after
      // the save above is fixed, re-editing a HIVE-Wide wish would quietly
      // demote it back.
      setWishScope(((existingWish as { share_scope?: string }).share_scope as WishScope) ?? 'hive');
      setError('');
    } else if (visible && !existingWish) {
      // Restore new-wish draft
      AsyncStorage.getItem(WISH_DRAFT_KEY).then(raw => {
        if (raw) setWishText(raw);
      });
      AsyncStorage.getItem(WISH_TITLE_DRAFT_KEY).then(raw => {
        if (raw) setWishTitle(raw);
      });
      setError('');
    } else if (!visible) {
      setWishTitle('');
      setWishText('');
      setError('');
      wishMentionInput.resetMentionSelection();
    }
  }, [visible, existingWish]);

  const handleSave = async (makePublic: boolean) => {
    if (!userId || !communityId || !wishText.trim()) return;
    const ownerUserId = wishOwnerUserId || existingWish?.user_id || userId;
    const shouldPublish = !existingWish || isLinkedWish || makePublic;
    const titleMissingFromSchema = (err: unknown) =>
      err instanceof Error
        ? err.message.includes('title')
        : !!err && typeof err === 'object' && String((err as { message?: unknown }).message ?? '').includes('title');

    setSaving(true);
    setError('');

    try {
      let savedWishId = existingWish?.id;
      if (existingWish) {
        // share_scope was missing here, and only here. It was set on INSERT and
        // silently dropped on every UPDATE — so a new wish remembered how far it
        // travelled and an edited one never did. Nat, 2026-08-04: "i've marked
        // this wish HIVE-wide a bunch of times & it never saves." The picker was
        // working perfectly and writing to nowhere.
        const updatePayload = {
          title: wishTitle.trim() || null,
          description: wishText.trim(),
          raw_input: wishText.trim(),
          share_scope: wishScope,
        };
        let { error: updateError } = await supabase
          .from('wishes')
          .update(updatePayload)
          .eq('id', existingWish.id)
          .eq('user_id', ownerUserId)
          .eq('community_id', communityId);

        if (updateError && titleMissingFromSchema(updateError)) {
          const { error: fallbackError } = await supabase
            .from('wishes')
            .update({
              description: updatePayload.description,
              raw_input: updatePayload.raw_input,
            })
            .eq('id', existingWish.id)
            .eq('user_id', ownerUserId)
            .eq('community_id', communityId);
          updateError = fallbackError;
        }

        if (updateError) throw updateError;

        // Mirror the edit onto the linked HD-board thread so board and wish never diverge.
        await syncWishEditToLinkedBoard({
          wishId: existingWish.id,
          communityId,
          title: updatePayload.title,
          description: updatePayload.description,
        });
      } else {
        const insertPayload: Record<string, unknown> = {
          user_id: ownerUserId,
          community_id: communityId,
          title: wishTitle.trim() || null,
          description: wishText.trim(),
          raw_input: wishText.trim(),
          status: 'public',
          share_scope: wishScope,
          is_active: true,
          extracted_from: 'manual',
        };

        if (linkedBoardCategory?.id) {
          insertPayload.board_category_id = linkedBoardCategory.id;
        }

        let { data: insertedWish, error: insertError } = await supabase
          .from('wishes')
          .insert(insertPayload)
          .select('id')
          .single();

        if (insertError && titleMissingFromSchema(insertError)) {
          delete insertPayload.title;
          const fallback = await supabase
            .from('wishes')
            .insert(insertPayload)
            .select('id')
            .single();
          insertedWish = fallback.data;
          insertError = fallback.error;
        }

        if (insertError) throw insertError;
        savedWishId = insertedWish?.id;
      }

      if (savedWishId && shouldPublish) {
        notifyWishMentions({
          wishId: savedWishId,
          senderId: userId,
          communityId,
          content: wishText.trim(),
          members: mentionableMembers,
          wishOwnerName: wishOwnerName || (ownerUserId === userId ? undefined : 'another member'),
        });
      }

      await invalidateWishQueries(
        communityId,
        wishOwnerUserId || existingWish?.user_id || userId
      );

      if (!existingWish) {
        AsyncStorage.removeItem(WISH_DRAFT_KEY).catch(() => {});
        AsyncStorage.removeItem(WISH_TITLE_DRAFT_KEY).catch(() => {});
      }
      wishMentionInput.resetMentionSelection();
      await onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEditMode ? 'Failed to update wish' : 'Failed to save wish'));
    } finally {
      setSaving(false);
    }
  };

  const handleRefine = () => {
    if (!wishText.trim() || !onRefineWithClive) return;
    onRefineWithClive(wishText.trim());
  };

  const canSubmit = wishText.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
            <View className="p-6">
              {/* Header */}
              <View className="flex-row justify-between items-center mb-6">
                <Pressable onPress={onClose} className="py-2">
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal/60 text-base"
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-xl text-charcoal"
                >
                  {isEditMode ? 'Edit HD Wish' : isLinkedWish ? 'Add Linked HD Wish' : 'Add an HD Wish'}
                </Text>
                <View style={{ width: 50 }} />
              </View>

              {/* Input Section */}
              <View className="mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-base mb-2"
                >
                  What is the HD wish?
                </Text>
                {isLinkedWish && (
                  <View className="bg-gold/10 border border-gold/20 rounded-xl px-4 py-3 mb-3">
                    <Text
                      style={{ fontFamily: 'Lato_700Bold' }}
                      className="text-gold text-sm"
                    >
                      Linked to {linkedBoardCategory.name}
                    </Text>
                    <Text
                      style={{ fontFamily: 'Lato_400Regular' }}
                      className="text-charcoal/60 text-sm mt-1"
                    >
                      This public HD wish will show up on profiles and Home.
                      {wishOwnerName ? ` It will belong to ${wishOwnerName}.` : ''}
                    </Text>
                  </View>
                )}
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-sm mb-2"
                >
                  Quick glance title
                </Text>
                <TextInput
                  value={wishTitle}
                  onChangeText={handleWishTitleChange}
                  placeholder="Rose bushes, tap shoes, HIVE app suggestions..."
                  placeholderTextColor="#9ca3af"
                  maxLength={80}
                  className="bg-white rounded-xl px-4 py-3 text-charcoal mb-4"
                  style={{
                    fontFamily: 'Lato_400Regular',
                  }}
                />
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  {isLinkedWish ? 'Make this one clear, claimable ask from the linked thread.' : 'Describe what you need help with'}
                </Text>
                <TextInput
                  value={wishText}
                  onChangeText={wishMentionInput.textInputMentionProps.onChangeText}
                  onSelectionChange={wishMentionInput.textInputMentionProps.onSelectionChange}
                  selection={wishMentionInput.textInputMentionProps.selection}
                  placeholder="I want help learning to cook healthier meals..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={6}
                  maxLength={500}
                  className="bg-white rounded-xl px-4 py-3 text-charcoal min-h-[150px]"
                  style={{
                    fontFamily: 'Lato_400Regular',
                    textAlignVertical: 'top',
                  }}
                />
                {/* A wish said out loud is usually a better wish than a wish
                    typed — people hedge less when they talk. */}
                <View className="flex-row items-center mt-2">
                  <VoiceMicButton
                    size={20}
                    onTranscript={wishDictation.onTranscript}
                    onInterimTranscript={wishDictation.onInterimTranscript}
                  />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs ml-2">
                    Talk instead of typing
                  </Text>
                </View>
                {/* Who can see this wish. More eyes is sometimes exactly what
                    an ask needs — "anyone know a teacher?" travels further than
                    one HIVE (Nat 2026-08-02). */}
                <View className="mt-4">
                  <WishScopePicker value={wishScope} onChange={setWishScope} />
                </View>

                <MentionSuggestions
                  active={wishMentionInput.mentionQuery !== null}
                  query={wishMentionInput.mentionQuery}
                  loading={mentionMembersLoading}
                  suggestions={wishMentionInput.mentionSuggestions}
                  onSelect={wishMentionInput.selectMention}
                />
                {wishMentionInput.mentionedMembers.length > 0 && (
                  <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
                    {wishMentionInput.mentionedMembers.map((member) => (
                      <View key={member.id} className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
                          Tagged {member.name.split(/\s+/)[0]}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/40 text-xs mt-1 text-right"
                >
                  {wishText.length}/500
                </Text>
              </View>

              {/* Info Box */}
              <View className="bg-gold/10 rounded-xl p-4 mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-gold mb-1"
                >
                  Tips for great HD wishes
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/70 text-sm"
                >
                  {isLinkedWish
                    ? 'Linked HD wishes work best as concrete next steps: "Help hang the mirror" or "Send Iceland travel tips."'
                    : 'Be specific about what you need. "Help cooking" becomes "Teach me 3 easy weeknight meals I can prep on Sundays."'}
                </Text>
              </View>

              {/* Error */}
              {error ? (
                <View className="bg-red-50 rounded-xl p-4 mb-4">
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-red-600"
                  >
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons */}
              {isEditMode ? (
                <View className="mb-4">
                  <Button
                    title="Save Changes"
                    onPress={() => handleSave(existingWish?.status === 'public')}
                    loading={saving}
                    disabled={saving || !canSubmit}
                  />
                </View>
              ) : isLinkedWish ? (
                <View className="mb-4">
                  <Button
                    title="Add Linked HD Wish"
                    onPress={() => handleSave(true)}
                    loading={saving}
                    disabled={saving || !canSubmit}
                  />
                </View>
              ) : (
                <View className="mb-4">
                  <Button
                    title="Add HD Wish"
                    onPress={() => handleSave(true)}
                    loading={saving}
                    disabled={saving || !canSubmit}
                  />
                </View>
              )}

              {/* Refine with Clive */}
              {!isEditMode && onRefineWithClive && (
                <Pressable
                  onPress={handleRefine}
                  disabled={!canSubmit}
                  className={`flex-row items-center justify-center py-3 rounded-xl ${
                    canSubmit ? 'active:bg-gold/10' : 'opacity-50'
                  }`}
                >
                  <Ionicons
                    name="sparkles"
                    size={18}
                    color={canSubmit ? '#E8B923' : '#9ca3af'}
                  />
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className={`ml-2 text-base ${
                      canSubmit ? 'text-gold' : 'text-charcoal/40'
                    }`}
                  >
                    Refine with Clive
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

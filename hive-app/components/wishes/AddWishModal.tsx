import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { invalidateWishQueries } from '../../lib/queryClient';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { notifyWishMentions } from '../../lib/wishMentions';
import { syncWishEditToLinkedBoard } from '../../lib/wishBoardLinking';
import { ComposerBar } from '../ui/ComposerBar';
import { uploadAttachments, type AttachmentUploadOutcome } from '../../lib/attachmentUpload';
import type { Attachment } from '../../types';
import type { SelectedImage } from '../../lib/imagePicker';
import type { SelectedFile } from '../../lib/filePicker';
import { WishScopePicker, type WishScope } from '../ui/WishScopePicker';
import type { BoardCategory, Wish } from '../../types';

const WISH_DRAFT_KEY = 'add-wish-draft';
const WISH_TITLE_DRAFT_KEY = 'add-wish-title-draft';
/**
 * How long a wish can be.
 *
 * The title was 80 and the wish itself 500 — about three sentences. A wish is
 * the thing this whole app is built around, and the description is where you
 * explain what you actually need; 500 characters is a place to run out of room
 * mid-thought. Nat has already hit a cap that was too tight once (the thank-you
 * box, 2026-08-04), so these grew. The title matches the 90 characters the
 * quick-glance line already shows.
 */
const WISH_TITLE_MAX_LENGTH = 90;
const WISH_TEXT_MAX_LENGTH = 2000;

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
  /**
   * Whether we actually KNOW how far this wish already travels.
   *
   * Not every screen hands this modal a whole wish. Some fetch a wish with a
   * named list of columns and `share_scope` is not on the list — the member
   * card is the live example (`app/(app)/members.tsx`, both the directory query
   * and `refreshManagedWishes`). The object arrives looking complete, the
   * missing field reads as `undefined`, and a `?? 'hive'` fallback turns "I
   * don't know" into "This HIVE only". Save, and a HIVE-Wide wish has been
   * quietly demoted by somebody who only came to fix a typo.
   *
   * So: 'checking' while we go ask the database, 'unknown' if that fails, and
   * we only write the scope back when it is 'known'. Not writing a column
   * leaves it exactly as it was, which is the right answer to not knowing.
   */
  // Nat: "shouldn't it also have a clip to add attachments?" A wish is often a
  // picture of the thing — the broken fence, the dress, the room. Until
  // migration 149 there was nowhere on the wish to keep one, so the only way to
  // show it was to reply to your own ask.
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [scopeStatus, setScopeStatus] = useState<'known' | 'checking' | 'unknown'>('known');

  /**
   * Put whatever was picked into storage and say whether the save may go ahead.
   *
   * On the `readyToSend: true` answer, `attachments` is `undefined` when nothing
   * was picked, which is different from an empty list: `undefined` means "leave
   * whatever is already on this wish alone", and that distinction is the whole
   * reason this is not inline. On `readyToSend: false` every picture failed and
   * `uploadAttachments` has already told the person, so the save stops and the
   * modal stays open with their words and their pictures still in it.
   */
  const collectAttachments = (uploaderId: string): Promise<AttachmentUploadOutcome> =>
    uploadAttachments({
      userId: uploaderId,
      images: selectedImages,
      files: selectedFiles,
    });
  const [wishTitle, setWishTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { members: mentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(communityId);
  const isEditMode = !!existingWish;
  const isLinkedWish = !!linkedBoardCategory && !existingWish;

  /**
   * Both boxes keep a draft, and both take an updater as well as a string —
   * dictation writes by reading what the box already said. Writing straight to
   * setWishText would skip the draft, so talking your wish and then closing the
   * sheet would lose it.
   */
  const handleWishTextChange = (next: string | ((previous: string) => string)) => {
    setWishText((previous) => {
      const text = typeof next === 'function' ? next(previous) : next;
      if (!existingWish) AsyncStorage.setItem(WISH_DRAFT_KEY, text).catch(() => {});
      return text;
    });
  };

  const handleWishTitleChange = (next: string | ((previous: string) => string)) => {
    setWishTitle((previous) => {
      const text = typeof next === 'function' ? next(previous) : next;
      if (!existingWish) AsyncStorage.setItem(WISH_TITLE_DRAFT_KEY, text).catch(() => {});
      return text;
    });
  };

  useEffect(() => {
    let stale = false;

    if (visible && existingWish) {
      setWishTitle(existingWish.title ?? '');
      setWishText(existingWish.description);
      // ...and load the scope it actually has. Without this the picker opened
      // on "This HIVE only" every time regardless of the truth, so even after
      // the save above is fixed, re-editing a HIVE-Wide wish would quietly
      // demote it back.
      const carriedScope = (existingWish as { share_scope?: string }).share_scope as
        | WishScope
        | undefined;
      if (carriedScope) {
        setWishScope(carriedScope);
        setScopeStatus('known');
      } else {
        // The wish came from a screen that did not fetch this column. Ask the
        // database rather than assuming the smallest answer.
        setWishScope('hive');
        setScopeStatus('checking');
        supabase
          .from('wishes')
          .select('share_scope')
          .eq('id', existingWish.id)
          .maybeSingle()
          .then(({ data, error: scopeError }) => {
            if (stale) return;
            const found = (data as { share_scope?: string } | null)?.share_scope as
              | WishScope
              | undefined;
            if (!scopeError && found) {
              setWishScope(found);
              setScopeStatus('known');
            } else {
              setScopeStatus('unknown');
            }
          });
      }
      setError('');
    } else if (visible && !existingWish) {
      // A brand-new wish has no history to protect — the picker's own default
      // is the truth from the first keystroke.
      setScopeStatus('known');
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
      // The scope goes home with the title and the text. It used to survive the
      // close, so the next wish you wrote started life carrying the last wish's
      // reach without anybody choosing that.
      setWishScope('hive');
      setScopeStatus('known');
      setError('');
    }

    return () => {
      // The modal moved on before the lookup came back — its answer is about a
      // wish nobody is editing any more.
      stale = true;
    };
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
        const picked = await collectAttachments(ownerUserId);
        if (!picked.readyToSend) return;
        const attachments = picked.attachments;
        const updatePayload = {
          title: wishTitle.trim() || null,
          description: wishText.trim(),
          raw_input: wishText.trim(),
          // The scope is written only when it is known — see `scopeStatus`.
          // Leaving the column out is what keeps a wish's reach intact when the
          // screen that opened this modal never fetched it.
          ...(scopeStatus === 'known' ? { share_scope: wishScope } : {}),
          // Only overwrite when something new was picked. Saving `null` because
          // the picker started empty would delete a picture that is already on
          // the wish.
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
        const picked = await collectAttachments(ownerUserId);
        if (!picked.readyToSend) return;
        const attachments = picked.attachments;
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
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
      await onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEditMode ? 'Failed to update wish' : 'Failed to save wish'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * A deliberate pick is knowledge. Whatever we did or did not manage to look
   * up, once somebody has chosen a rung themselves that is the wish's reach and
   * it gets saved.
   */
  const handleScopeChange = (next: WishScope) => {
    setWishScope(next);
    setScopeStatus('known');
  };

  const handleRefine = () => {
    if (!wishText.trim() || !onRefineWithClive) return;
    onRefineWithClive(wishText.trim());
  };

  const canSubmit = wishText.trim().length > 0;
  // What pressing Enter in either box does: the same thing the big button at
  // the bottom does, whichever button that is right now.
  const handleKeyboardSave = () => {
    if (!canSubmit || saving) return;
    void handleSave(isEditMode ? existingWish?.status === 'public' : true);
  };

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
                {/* A title is words too — short ones. Same box, one line. */}
                <ComposerBar
                  variant="form"
                  containerClassName="mb-4"
                  label="Quick glance title"
                  value={wishTitle}
                  onChangeText={handleWishTitleChange}
                  placeholder="Rose bushes, tap shoes, HIVE app suggestions..."
                  multiline={false}
                  maxLength={WISH_TITLE_MAX_LENGTH}
                  counter="none"
                  onSubmit={handleKeyboardSave}
                  canSubmit={canSubmit && !saving}
                  submitting={saving}
                />
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  {isLinkedWish ? 'Make this one clear, claimable ask from the linked thread.' : 'Describe what you need help with'}
                </Text>
                {/* The one box, wearing form clothes. The mic is inside its own
                    border with the counter — Clive's geometry (Nat 2026-08-04),
                    now the shared component rather than a copy of it. A wish
                    said out loud is usually a better wish than a wish typed, so
                    this is the box where talking most wants finding.
                    @ tagging, the tagged pills and the draft all still work;
                    they moved into the bar instead of living out here. */}
                <ComposerBar
                  variant="form"
                  value={wishText}
                  onChangeText={handleWishTextChange}
                  placeholder="I want help learning to cook healthier meals..."
                  minHeight={150}
                  maxLength={WISH_TEXT_MAX_LENGTH}
                  onSubmit={handleKeyboardSave}
                  canSubmit={canSubmit && !saving}
                  submitting={saving}
                  attachments="compact"
                  selectedImages={selectedImages}
                  onImagesChange={setSelectedImages}
                  selectedFiles={selectedFiles}
                  onFilesChange={setSelectedFiles}
                  mentionMembers={mentionableMembers}
                  mentionsLoading={mentionMembersLoading}
                  currentUserId={userId}
                />
                {/* Who can see this wish. More eyes is sometimes exactly what
                    an ask needs — "anyone know a teacher?" travels further than
                    one HIVE (Nat 2026-08-02). */}
                <View className="mt-4">
                  <WishScopePicker value={wishScope} onChange={handleScopeChange} />
                  {isEditMode && scopeStatus !== 'known' ? (
                    <Text
                      style={{ fontFamily: 'Lato_400Regular' }}
                      className="text-charcoal/60 text-sm mt-2"
                    >
                      {scopeStatus === 'checking'
                        ? 'Checking how far this wish already travels...'
                        : 'Keeping this wish where it already is. Pick an option above to change it.'}
                    </Text>
                  ) : null}
                </View>
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

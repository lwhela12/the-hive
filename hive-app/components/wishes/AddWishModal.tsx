import { useState, useEffect } from 'react';
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
import type { Wish } from '../../types';

const WISH_DRAFT_KEY = 'add-wish-draft';

interface AddWishModalProps {
  visible: boolean;
  onClose: () => void;
  communityId: string | null;
  userId: string | undefined;
  onSave: () => void;
  onRefineWithClive?: (roughWish: string) => void;
  existingWish?: Wish | null;
}

export function AddWishModal({
  visible,
  onClose,
  communityId,
  userId,
  onSave,
  onRefineWithClive,
  existingWish,
}: AddWishModalProps) {
  const [wishText, setWishText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEditMode = !!existingWish;

  useEffect(() => {
    if (visible && existingWish) {
      setWishText(existingWish.description);
      setError('');
    } else if (visible && !existingWish) {
      // Restore new-wish draft
      AsyncStorage.getItem(WISH_DRAFT_KEY).then(raw => {
        if (raw) setWishText(raw);
      });
      setError('');
    } else if (!visible) {
      setWishText('');
      setError('');
    }
  }, [visible, existingWish]);

  const handleSave = async (makePublic: boolean) => {
    if (!userId || !communityId || !wishText.trim()) return;

    setSaving(true);
    setError('');

    try {
      if (existingWish) {
        const { error: updateError } = await supabase
          .from('wishes')
          .update({
            description: wishText.trim(),
            raw_input: wishText.trim(),
          })
          .eq('id', existingWish.id)
          .eq('user_id', userId)
          .eq('community_id', communityId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('wishes').insert({
          user_id: userId,
          community_id: communityId,
          description: wishText.trim(),
          raw_input: wishText.trim(),
          status: makePublic ? 'public' : 'private',
          is_active: makePublic, // Only active if public
          extracted_from: 'manual',
        });

        if (insertError) throw insertError;
      }

      if (!existingWish) AsyncStorage.removeItem(WISH_DRAFT_KEY).catch(() => {});
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEditMode ? 'Failed to update wish' : 'Failed to save wish'));
    } finally {
      setSaving(false);
    }
  };

  const handleWishTextChange = (text: string) => {
    setWishText(text);
    if (!existingWish) AsyncStorage.setItem(WISH_DRAFT_KEY, text).catch(() => {});
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
                  {isEditMode ? 'Edit Wish' : 'Add a Wish'}
                </Text>
                <View style={{ width: 50 }} />
              </View>

              {/* Input Section */}
              <View className="mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-base mb-2"
                >
                  What do you wish for?
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  Describe what you need help with
                </Text>
                <TextInput
                  value={wishText}
                  onChangeText={handleWishTextChange}
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
                  Tips for great wishes
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/70 text-sm"
                >
                  Be specific about what you need. "Help cooking" becomes "Teach me 3 easy weeknight meals I can prep on Sundays."
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
              ) : (
                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Button
                      title="Save as Private"
                      variant="secondary"
                      onPress={() => handleSave(false)}
                      loading={saving}
                      disabled={saving || !canSubmit}
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      title="Make Public"
                      onPress={() => handleSave(true)}
                      loading={saving}
                      disabled={saving || !canSubmit}
                    />
                  </View>
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

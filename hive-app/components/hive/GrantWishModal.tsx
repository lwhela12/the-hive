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
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { supabase } from '../../lib/supabase';
import type { Wish, Profile } from '../../types';

interface GrantWishModalProps {
  visible: boolean;
  onClose: () => void;
  wish: Wish & { user: Profile };
  communityId: string | null;
  onGrant: (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => Promise<{ error: Error | null }>;
}

export function GrantWishModal({
  visible,
  onClose,
  wish,
  communityId,
  onGrant,
}: GrantWishModalProps) {
  const [thankYouMessage, setThankYouMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Member selection
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Fetch community members when modal opens (excluding wish owner)
  useEffect(() => {
    if (visible && communityId) {
      fetchMembers();
    }
  }, [visible, communityId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setThankYouMessage('');
      setSelectedMembers(new Set());
      setError('');
    }
  }, [visible]);

  const fetchMembers = async () => {
    if (!communityId) return;

    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('community_memberships')
        .select('user_id, profiles:user_id(*)')
        .eq('community_id', communityId)
        .neq('user_id', wish.user_id); // Exclude wish owner

      if (!error && data) {
        const profiles = data
          .map((m) => m.profiles as unknown as Profile)
          .filter((p) => p !== null);
        setMembers(profiles);
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedMembers(new Set(members.map((m) => m.id)));
  };

  const selectNone = () => {
    setSelectedMembers(new Set());
  };

  const handleGrant = async () => {
    setLoading(true);
    setError('');

    try {
      const result = await onGrant({
        wishId: wish.id,
        granterIds: Array.from(selectedMembers),
        thankYouMessage: thankYouMessage.trim() || undefined,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to mark wish as granted');
        return;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark wish as granted');
    } finally {
      setLoading(false);
    }
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
          <ScrollView className="flex-1">
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
                  Mark as Granted
                </Text>
                <View style={{ width: 50 }} />
              </View>

              {/* Wish Preview */}
              <View className="bg-white rounded-2xl p-4 mb-6 border border-gold/20">
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-xs uppercase tracking-wide mb-2"
                >
                  Your Wish
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-base leading-relaxed"
                >
                  {wish.description}
                </Text>
              </View>

              {/* Member Selection */}
              <View className="mb-6">
                <View className="flex-row justify-between items-center mb-3">
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className="text-charcoal text-base"
                  >
                    Who helped grant this wish?
                  </Text>
                  <View className="flex-row gap-2">
                    <Pressable onPress={selectAll}>
                      <Text
                        style={{ fontFamily: 'Lato_400Regular' }}
                        className="text-gold text-sm"
                      >
                        All
                      </Text>
                    </Pressable>
                    <Text className="text-charcoal/30">|</Text>
                    <Pressable onPress={selectNone}>
                      <Text
                        style={{ fontFamily: 'Lato_400Regular' }}
                        className="text-gold text-sm"
                      >
                        None
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  Select all the members who helped make this happen
                </Text>

                {loadingMembers ? (
                  <View className="bg-white rounded-xl p-4">
                    <Text
                      style={{ fontFamily: 'Lato_400Regular' }}
                      className="text-charcoal/50 text-center"
                    >
                      Loading members...
                    </Text>
                  </View>
                ) : (
                  <View className="bg-white rounded-xl p-3">
                    <View className="flex-row flex-wrap gap-2">
                      {members.map((member) => (
                        <Pressable
                          key={member.id}
                          onPress={() => toggleMember(member.id)}
                          className={`flex-row items-center px-3 py-2 rounded-full border ${
                            selectedMembers.has(member.id)
                              ? 'bg-gold border-gold'
                              : 'bg-cream border-charcoal/20'
                          }`}
                        >
                          <Avatar
                            name={member.name}
                            url={member.avatar_url}
                            size={24}
                          />
                          <Text
                            style={{ fontFamily: 'Lato_700Bold' }}
                            className={`ml-2 text-sm ${
                              selectedMembers.has(member.id)
                                ? 'text-white'
                                : 'text-charcoal'
                            }`}
                          >
                            {member.name || member.email?.split('@')[0] || 'Member'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    {members.length === 0 && (
                      <Text
                        style={{ fontFamily: 'Lato_400Regular' }}
                        className="text-charcoal/50 text-center py-2"
                      >
                        No other members in this community
                      </Text>
                    )}
                  </View>
                )}

                {selectedMembers.size > 0 && (
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal/60 text-sm mt-2"
                  >
                    {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''} selected
                  </Text>
                )}
              </View>

              {/* Thank You Message */}
              <View className="mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-base mb-2"
                >
                  Thank you message (optional)
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  Share your gratitude with the community
                </Text>
                <TextInput
                  value={thankYouMessage}
                  onChangeText={setThankYouMessage}
                  placeholder="Thank you so much for helping me with..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  className="bg-white rounded-xl px-4 py-3 text-charcoal min-h-[100px]"
                  style={{
                    fontFamily: 'Lato_400Regular',
                    textAlignVertical: 'top',
                  }}
                />
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/40 text-xs mt-1 text-right"
                >
                  {thankYouMessage.length}/500
                </Text>
              </View>

              {/* Celebration Note */}
              <View className="bg-gold/10 rounded-xl p-4 mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-gold mb-1"
                >
                  Celebrating your granted wish!
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/70 text-sm"
                >
                  Your wish will be moved to the "Granted" section where the community can see how
                  the Hive came together to help.
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

              {/* Submit Button */}
              <Button
                title={loading ? 'Marking as Granted...' : 'Mark Wish as Granted'}
                onPress={handleGrant}
                loading={loading}
                disabled={loading}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

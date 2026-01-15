import { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import type { Profile } from '../../types';

interface MemberPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (member: Profile) => void;
  onSelectMultiple?: (members: Profile[]) => void;
  multiSelect?: boolean;
}

export function MemberPicker({
  visible,
  onClose,
  onSelect,
  onSelectMultiple,
  multiSelect = true,
}: MemberPickerProps) {
  const { profile, communityId } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && communityId) {
      fetchMembers();
      setSelectedMembers([]);
      setSearch('');
    }
  }, [visible, communityId]);

  const fetchMembers = async () => {
    if (!communityId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_memberships')
        .select('user:profiles(*)')
        .eq('community_id', communityId)
        .neq('user_id', profile?.id);

      if (!error && data) {
        const profiles = data
          .map((m) => m.user as Profile)
          .filter((p): p is Profile => p !== null);
        setMembers(profiles);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const isSelected = (member: Profile) =>
    selectedMembers.some((m) => m.id === member.id);

  const handleMemberPress = (member: Profile) => {
    if (!multiSelect) {
      // Single select mode - immediately select and close
      onSelect(member);
      onClose();
      setSearch('');
      return;
    }

    // Multi-select mode - toggle selection
    setSelectedMembers((prev) => {
      if (isSelected(member)) {
        return prev.filter((m) => m.id !== member.id);
      } else {
        return [...prev, member];
      }
    });
  };

  const handleNext = () => {
    if (selectedMembers.length === 1) {
      // Single selection - use the single select callback
      onSelect(selectedMembers[0]);
    } else if (selectedMembers.length > 1 && onSelectMultiple) {
      // Multiple selections - use the multi-select callback
      onSelectMultiple(selectedMembers);
    }
    onClose();
    setSearch('');
    setSelectedMembers([]);
  };

  const getHeaderTitle = () => {
    if (!multiSelect) return 'New Message';
    if (selectedMembers.length === 0) return 'New Message';
    if (selectedMembers.length === 1) return 'New Message';
    return 'New Group';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-cream">
          <Pressable onPress={onClose} className="w-16">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
              Cancel
            </Text>
          </Pressable>
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg">
            {getHeaderTitle()}
          </Text>
          {multiSelect ? (
            <Pressable
              onPress={handleNext}
              disabled={selectedMembers.length === 0}
              className="w-16 items-end"
            >
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className={selectedMembers.length > 0 ? 'text-gold' : 'text-charcoal/30'}
              >
                Next
              </Text>
            </Pressable>
          ) : (
            <View className="w-16" />
          )}
        </View>

        {/* Selected members chips */}
        {multiSelect && selectedMembers.length > 0 && (
          <View className="bg-white px-4 py-2 border-b border-cream">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {selectedMembers.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => handleMemberPress(member)}
                  className="flex-row items-center bg-gold/10 rounded-full px-3 py-1.5"
                >
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal mr-1">
                    {member.name}
                  </Text>
                  <Ionicons name="close-circle" size={16} color="#bd9348" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search */}
        <View className="p-4 bg-white">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search members..."
            placeholderTextColor="#9ca3af"
            className="bg-cream rounded-xl px-4 py-3"
            style={{ fontFamily: 'Lato_400Regular' }}
          />
        </View>

        {/* Member list */}
        <ScrollView className="flex-1">
          {loading ? (
            <View className="items-center py-8">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                Loading...
              </Text>
            </View>
          ) : filteredMembers.length === 0 ? (
            <View className="items-center py-8">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                {search ? 'No members found' : 'No other members in this community'}
              </Text>
            </View>
          ) : (
            filteredMembers.map((member) => {
              const selected = isSelected(member);
              return (
                <Pressable
                  key={member.id}
                  onPress={() => handleMemberPress(member)}
                  className={`flex-row items-center px-4 py-3 bg-white border-b border-cream active:bg-cream ${
                    selected ? 'bg-gold/5' : ''
                  }`}
                >
                  {/* Selection indicator */}
                  {multiSelect && (
                    <View
                      className={`w-6 h-6 rounded-full mr-3 items-center justify-center ${
                        selected ? 'bg-gold' : 'border-2 border-charcoal/20'
                      }`}
                    >
                      {selected && <Ionicons name="checkmark" size={16} color="white" />}
                    </View>
                  )}

                  {/* Avatar */}
                  <View className="w-12 h-12 rounded-full bg-gold/20 items-center justify-center mr-3">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-lg">
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  {/* Info */}
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
                      {member.name}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                      {member.email}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

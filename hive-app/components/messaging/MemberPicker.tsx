import { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import type { Profile } from '../../types';

interface MemberPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (member: Profile) => void;
}

export function MemberPicker({ visible, onClose, onSelect }: MemberPickerProps) {
  const { profile, communityId } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && communityId) {
      fetchMembers();
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

  const handleSelect = (member: Profile) => {
    onSelect(member);
    onClose();
    setSearch('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-cream">
          <Pressable onPress={onClose}>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
              Cancel
            </Text>
          </Pressable>
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg">
            New Message
          </Text>
          <View style={{ width: 50 }} />
        </View>

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
            filteredMembers.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => handleSelect(member)}
                className="flex-row items-center px-4 py-3 bg-white border-b border-cream active:bg-cream"
              >
                <View className="w-12 h-12 rounded-full bg-gold/20 items-center justify-center mr-3">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-lg">
                    {member.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
                    {member.name}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                    {member.email}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

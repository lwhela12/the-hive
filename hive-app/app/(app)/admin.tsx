import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { formatDateMedium, parseAmericanDate, isoToAmerican } from '../../lib/dateUtils';
import type { Profile, QueenBee, Event, UserRole, CommunityInvite } from '../../types';

type MemberRow = {
  id: string;
  role: UserRole;
  profiles: Profile;
};

type InviteRow = CommunityInvite & {
  inviter: Pick<Profile, 'name'> | null;
};

export default function AdminScreen() {
  const { profile, communityId, communityRole } = useAuth();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [queenBees, setQueenBees] = useState<QueenBee[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRow[]>([]);

  // Modal states
  const [showQueenBeeModal, setShowQueenBeeModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  // Form states
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [qbMonth, setQbMonth] = useState('');
  const [qbTitle, setQbTitle] = useState('');
  const [qbDescription, setQbDescription] = useState('');
  const [qbStatus, setQbStatus] = useState<'upcoming' | 'active' | 'completed'>('upcoming');
  const [editingQueenBee, setEditingQueenBee] = useState<QueenBee | null>(null);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');

  const fetchData = useCallback(async () => {
    if (!communityId) return;
    // Fetch members
    const { data: membersData } = await supabase
      .from('community_memberships')
      .select('id, role, profiles(*)')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true });
    if (membersData) setMembers(membersData as MemberRow[]);

    // Fetch queen bees (ordered by display_order for queue)
    const { data: qbData } = await supabase
      .from('queen_bees')
      .select('*')
      .eq('community_id', communityId)
      .order('display_order', { ascending: true })
      .order('month', { ascending: true })
      .limit(12);
    if (qbData) setQueenBees(qbData);

    // Fetch events
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .eq('community_id', communityId)
      .order('event_date', { ascending: true })
      .limit(20);
    if (eventsData) setEvents(eventsData);

    // Fetch pending invites
    const { data: invitesData } = await supabase
      .from('community_invites')
      .select('*, inviter:profiles!community_invites_invited_by_fkey(name)')
      .eq('community_id', communityId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (invitesData) setPendingInvites(invitesData as InviteRow[]);
  }, [communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const updateMemberRole = async (membershipId: string, role: UserRole) => {
    const { error } = await supabase
      .from('community_memberships')
      .update({ role })
      .eq('id', membershipId);

    if (error) {
      Alert.alert('Error', 'Failed to update role');
    } else {
      await fetchData();
    }
  };

  const createQueenBee = async () => {
    if (!selectedMember || !communityId) {
      Alert.alert('Error', 'Please select a member');
      return;
    }

    // Auto-generate month if not provided (next available month)
    // Format: MM-YYYY
    let month = qbMonth;
    if (!month) {
      // Sort existing months to find the latest one
      const existingMonths = queenBees.map(qb => qb.month);
      // Parse MM-YYYY format and find the latest
      const parsedMonths = existingMonths
        .map(m => {
          const parts = m.split('-');
          if (parts.length === 2) {
            // Could be MM-YYYY or YYYY-MM
            const first = parseInt(parts[0], 10);
            const second = parseInt(parts[1], 10);
            if (first > 12) {
              // YYYY-MM format
              return { year: first, month: second };
            } else {
              // MM-YYYY format
              return { year: second, month: first };
            }
          }
          return null;
        })
        .filter(Boolean) as { year: number; month: number }[];

      if (parsedMonths.length > 0) {
        // Find the latest month
        parsedMonths.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });
        const latest = parsedMonths[0];
        // Increment
        const nextMonth = latest.month === 12 ? 1 : latest.month + 1;
        const nextYear = latest.month === 12 ? latest.year + 1 : latest.year;
        month = `${String(nextMonth).padStart(2, '0')}-${nextYear}`;
      } else {
        // Start with current month
        const now = new Date();
        month = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
      }
    }

    const { error } = await supabase.from('queen_bees').insert({
      user_id: selectedMember.id,
      community_id: communityId,
      month,
      project_title: qbTitle || 'TBD',
      project_description: qbDescription || null,
      status: qbStatus,
    });

    if (error) {
      Alert.alert('Error', 'Failed to create Queen Bee');
    } else {
      closeQueenBeeModal();
      await fetchData();
    }
  };

  const updateQueenBee = async () => {
    if (!editingQueenBee || !qbTitle) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }

    const { error } = await supabase
      .from('queen_bees')
      .update({
        project_title: qbTitle,
        project_description: qbDescription,
        status: qbStatus,
      })
      .eq('id', editingQueenBee.id);

    if (error) {
      Alert.alert('Error', 'Failed to update Queen Bee');
    } else {
      closeQueenBeeModal();
      await fetchData();
    }
  };

  const openEditQueenBee = (qb: QueenBee) => {
    const member = members.find(m => m.profiles.id === qb.user_id);
    setEditingQueenBee(qb);
    setSelectedMember(member?.profiles || null);
    setQbMonth(qb.month);
    setQbTitle(qb.project_title);
    setQbDescription(qb.project_description || '');
    setQbStatus(qb.status);
    setShowQueenBeeModal(true);
  };

  const closeQueenBeeModal = () => {
    setShowQueenBeeModal(false);
    setEditingQueenBee(null);
    setSelectedMember(null);
    setQbMonth('');
    setQbTitle('');
    setQbDescription('');
    setQbStatus('upcoming');
  };

  const moveQueenBee = async (qbId: string, direction: 'up' | 'down') => {
    const currentIndex = queenBees.findIndex(qb => qb.id === qbId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= queenBees.length) return;

    const currentQB = queenBees[currentIndex];
    const targetQB = queenBees[targetIndex];

    // Swap display_order values
    const currentOrder = (currentQB as any).display_order ?? currentIndex + 1;
    const targetOrder = (targetQB as any).display_order ?? targetIndex + 1;

    try {
      await Promise.all([
        supabase
          .from('queen_bees')
          .update({ display_order: targetOrder })
          .eq('id', currentQB.id),
        supabase
          .from('queen_bees')
          .update({ display_order: currentOrder })
          .eq('id', targetQB.id),
      ]);

      await fetchData();
    } catch (err) {
      console.error('Reorder error:', err);
      Alert.alert('Error', 'Failed to reorder');
    }
  };

  const rotateQueenBee = async () => {
    // Find current active QB
    const activeQB = queenBees.find(qb => qb.status === 'active');

    // Find next upcoming QB (by display_order, fallback to month)
    let upcomingQBs = queenBees
      .filter(qb => qb.status === 'upcoming')
      .sort((a, b) => {
        const orderA = (a as any).display_order ?? 999;
        const orderB = (b as any).display_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.month.localeCompare(b.month);
      });

    let nextQB = upcomingQBs[0];
    let isNewCycle = false;

    // CIRCULAR: If no upcoming, reset all completed to upcoming
    if (!nextQB) {
      const completedQBs = queenBees.filter(qb => qb.status === 'completed');
      if (completedQBs.length === 0) {
        Alert.alert('No Queen Bees', 'There are no Queen Bees in the queue. Add some first.');
        return;
      }

      isNewCycle = true;
      // Sort completed by display_order to find who's next in the new cycle
      upcomingQBs = completedQBs.sort((a, b) => {
        const orderA = (a as any).display_order ?? 999;
        const orderB = (b as any).display_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.month.localeCompare(b.month);
      });
      nextQB = upcomingQBs[0];
    }

    const activeQBName = activeQB
      ? members.find(m => m.profiles.id === activeQB.user_id)?.profiles.name
      : null;
    const nextQBName = members.find(m => m.profiles.id === nextQB.user_id)?.profiles.name;

    const confirmMessage = isNewCycle
      ? `Starting a new cycle!\n\nAll Queen Bees will be reset to upcoming.\n${nextQBName} will be the first Queen Bee of the new cycle.\n\nProceed?`
      : activeQB
        ? `This will:\n• Mark ${activeQBName}'s turn as completed\n• Make ${nextQBName} the active Queen Bee\n\nProceed?`
        : `This will make ${nextQBName} the active Queen Bee. Proceed?`;

    const doRotation = async () => {
      try {
        if (isNewCycle) {
          // Reset all completed to upcoming for new cycle
          const completedIds = queenBees
            .filter(qb => qb.status === 'completed')
            .map(qb => qb.id);

          if (completedIds.length > 0) {
            await supabase
              .from('queen_bees')
              .update({ status: 'upcoming' })
              .in('id', completedIds);
          }
        }

        // Mark current active as completed (if exists and not already being reset)
        if (activeQB && !isNewCycle) {
          await supabase
            .from('queen_bees')
            .update({ status: 'completed' })
            .eq('id', activeQB.id);
        } else if (activeQB && isNewCycle) {
          // In new cycle, mark current active as upcoming too (it was the last one)
          await supabase
            .from('queen_bees')
            .update({ status: 'upcoming' })
            .eq('id', activeQB.id);
        }

        // Mark next as active
        await supabase
          .from('queen_bees')
          .update({ status: 'active' })
          .eq('id', nextQB.id);

        await fetchData();
        const message = isNewCycle
          ? `New cycle started! ${nextQBName} is now the active Queen Bee!`
          : `${nextQBName} is now the active Queen Bee!`;
        Alert.alert('Success', message);
      } catch (err) {
        console.error('Rotation error:', err);
        Alert.alert('Error', 'Failed to rotate Queen Bee');
      }
    };

    // Use window.confirm on web, Alert.alert on native
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(confirmMessage)) {
        await doRotation();
      }
    } else {
      Alert.alert('Rotate Queen Bee', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rotate', onPress: doRotation },
      ]);
    }
  };

  const createEvent = async () => {
    if (!eventTitle || !eventDate || !communityId) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    // Convert American date format to ISO for storage
    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      Alert.alert('Error', 'Please enter date in MM-DD-YYYY format');
      return;
    }

    const { error } = await supabase.from('events').insert({
      title: eventTitle,
      event_date: eventDateIso,
      description: eventDescription,
      event_type: 'custom',
      created_by: profile?.id,
      community_id: communityId,
    });

    if (error) {
      Alert.alert('Error', 'Failed to create event');
    } else {
      setShowEventModal(false);
      setEventTitle('');
      setEventDate('');
      setEventDescription('');
      await fetchData();
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail || !communityId) {
      Alert.alert('Error', 'Please enter an email');
      return;
    }

    const { error } = await supabase.functions.invoke('invite', {
      body: {
        email: inviteEmail.trim(),
        role: inviteRole,
        community_id: communityId,
      },
    });

    if (error) {
      Alert.alert('Error', 'Failed to send invite');
    } else {
      Alert.alert('Invite sent', `${inviteEmail} will receive an invite to join.`);
      setInviteEmail('');
      setInviteRole('member');
      await fetchData();
    }
  };

  const revokeInvite = async (inviteId: string, email: string) => {
    // Use window.confirm on web, Alert.alert on native
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`Are you sure you want to revoke the invite for ${email}?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Revoke Invite',
            `Are you sure you want to revoke the invite for ${email}?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Revoke', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });

    if (!confirmed) return;

    if (!communityId) {
      Alert.alert('Error', 'No community context. Please refresh and try again.');
      return;
    }

    const { data, error } = await supabase
      .from('community_invites')
      .delete()
      .eq('id', inviteId)
      .eq('community_id', communityId)
      .select();

    if (error) {
      console.error('Revoke invite error:', error);
      alert(`Failed to revoke invite: ${error.message}`);
    } else if (!data || data.length === 0) {
      alert('No invite was deleted. You may not have permission or the invite no longer exists.');
    } else {
      await fetchData();
    }
  };

  if (communityRole !== 'admin') {
    return (
      <SafeAreaView className="flex-1 bg-honey-50 justify-center items-center">
        <Text className="text-gray-600">Admin access required</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout && (
        <AppHeader
          title="Admin"
          onMenuPress={() => setDrawerOpen(true)}
        />
      )}

      {/* Navigation Drawer */}
      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mode="navigation"
        />
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text className="text-2xl font-bold text-hive-dark mb-6">
          Admin Panel ⚙️
        </Text>

        {/* Queen Bee Section */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-lg font-semibold text-gray-700">
              Queen Bee Schedule
            </Text>
            <View className="flex-row">
              <Pressable
                onPress={rotateQueenBee}
                className="bg-green-500 px-3 py-1 rounded-lg active:bg-green-600 mr-2"
              >
                <Text className="text-white font-medium">Next →</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowQueenBeeModal(true)}
                className="bg-honey-500 px-3 py-1 rounded-lg active:bg-honey-600"
              >
                <Text className="text-white font-medium">+ Add</Text>
              </Pressable>
            </View>
          </View>
          <View className="bg-white rounded-xl shadow-sm overflow-hidden">
            {queenBees.map((qb, index) => (
              <View
                key={qb.id}
                className="flex-row items-center border-b border-gray-100 last:border-b-0"
              >
                {/* Reorder buttons */}
                <View className="pl-2 py-2">
                  <Pressable
                    onPress={() => moveQueenBee(qb.id, 'up')}
                    disabled={index === 0}
                    className={`px-2 py-1 ${index === 0 ? 'opacity-30' : 'active:bg-gray-100'}`}
                  >
                    <Text className="text-gray-400 text-sm">▲</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveQueenBee(qb.id, 'down')}
                    disabled={index === queenBees.length - 1}
                    className={`px-2 py-1 ${index === queenBees.length - 1 ? 'opacity-30' : 'active:bg-gray-100'}`}
                  >
                    <Text className="text-gray-400 text-sm">▼</Text>
                  </Pressable>
                </View>

                {/* Main content - tappable to edit */}
                <Pressable
                  onPress={() => openEditQueenBee(qb)}
                  className="flex-1 p-4 active:bg-gray-50"
                >
                  <View className="flex-row justify-between items-center">
                    <View className="flex-1">
                      <Text className="font-semibold text-gray-800">
                        {members.find(m => m.profiles.id === qb.user_id)?.profiles.name || 'Unknown'}
                      </Text>
                      <Text className="text-sm text-gray-500 mt-1">
                        {qb.project_title}
                      </Text>
                    </View>
                    <View className={`px-2 py-1 rounded ${
                      qb.status === 'active' ? 'bg-green-100' :
                      qb.status === 'completed' ? 'bg-gray-100' : 'bg-honey-100'
                    }`}>
                      <Text className={`text-xs capitalize ${
                        qb.status === 'active' ? 'text-green-700' :
                        qb.status === 'completed' ? 'text-gray-600' : 'text-honey-700'
                      }`}>
                        {qb.status}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            ))}
            {queenBees.length === 0 && (
              <View className="p-4">
                <Text className="text-gray-500 text-center">
                  No Queen Bee schedule set
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Events Section */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-lg font-semibold text-gray-700">Events</Text>
            <Pressable
              onPress={() => setShowEventModal(true)}
              className="bg-honey-500 px-3 py-1 rounded-lg active:bg-honey-600"
            >
              <Text className="text-white font-medium">+ Add</Text>
            </Pressable>
          </View>
          <View className="bg-white rounded-xl shadow-sm overflow-hidden">
            {events.map((event) => (
              <View
                key={event.id}
                className="p-4 border-b border-gray-100 last:border-b-0"
              >
                <Text className="font-semibold text-gray-800">
                  {event.title}
                </Text>
                <Text className="text-sm text-gray-500 mt-1">
                  {formatDateMedium(event.event_date)}
                </Text>
              </View>
            ))}
            {events.length === 0 && (
              <View className="p-4">
                <Text className="text-gray-500 text-center">No events</Text>
              </View>
            )}
          </View>
        </View>

        {/* Members Section */}
        <View className="mb-6">
          <Text className="text-lg font-semibold text-gray-700 mb-2">
            Members ({members.length})
          </Text>
          <View className="bg-white rounded-xl shadow-sm overflow-hidden">
            {members.map((member) => (
              <View
                key={member.id}
                className="flex-row items-center p-4 border-b border-gray-100 last:border-b-0"
              >
                <Avatar name={member.profiles.name} url={member.profiles.avatar_url} size={40} />
                <View className="flex-1 ml-3">
                  <Text className="font-medium text-gray-800">
                    {member.profiles.name}
                  </Text>
                  <Text className="text-sm text-gray-500">{member.profiles.email}</Text>
                </View>
                <View className="flex-row">
                  {(['member', 'treasurer', 'admin'] as UserRole[]).map(
                    (role) => (
                      <Pressable
                        key={role}
                        onPress={() => updateMemberRole(member.id, role)}
                        className={`px-2 py-1 rounded mr-1 ${
                          member.role === role
                            ? 'bg-honey-500'
                            : 'bg-gray-100'
                        }`}
                      >
                        <Text
                          className={`text-xs capitalize ${
                            member.role === role
                              ? 'text-white'
                              : 'text-gray-600'
                          }`}
                        >
                          {role.charAt(0).toUpperCase()}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Invite Section */}
        <View className="mb-6">
          <Text className="text-lg font-semibold text-gray-700 mb-2">
            Invite Member
          </Text>
          <View className="bg-white rounded-xl shadow-sm p-4">
            <TextInput
              placeholder="Email address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              className="border border-gray-300 rounded-lg p-3 mb-3"
            />
            <View className="flex-row mb-4">
              {(['member', 'treasurer', 'admin'] as UserRole[]).map((role) => (
                <Pressable
                  key={role}
                  onPress={() => setInviteRole(role)}
                  className={`px-3 py-2 rounded mr-2 ${
                    inviteRole === role ? 'bg-honey-500' : 'bg-gray-100'
                  }`}
                >
                  <Text className={`${inviteRole === role ? 'text-white' : 'text-gray-600'} capitalize`}>
                    {role}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={sendInvite}
              className="bg-honey-500 py-3 rounded-lg active:bg-honey-600"
            >
              <Text className="text-center font-semibold text-white">Send Invite</Text>
            </Pressable>
          </View>
        </View>

        {/* Pending Invites Section */}
        {pendingInvites.length > 0 && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-700 mb-2">
              Pending Invites ({pendingInvites.length})
            </Text>
            <View className="bg-white rounded-xl shadow-sm overflow-hidden">
              {pendingInvites.map((invite) => {
                const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
                return (
                  <View
                    key={invite.id}
                    className="flex-row items-center p-4 border-b border-gray-100 last:border-b-0"
                  >
                    <View className="flex-1">
                      <Text className="font-medium text-gray-800">
                        {invite.email}
                      </Text>
                      <Text className="text-sm text-gray-500">
                        Role: {invite.role} • Invited by {invite.inviter?.name || 'Unknown'}
                      </Text>
                      {isExpired && (
                        <Text className="text-sm text-red-500">Expired</Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => revokeInvite(invite.id, invite.email)}
                      className="px-3 py-2 bg-red-100 rounded-lg active:bg-red-200"
                    >
                      <Text className="text-red-600 text-sm font-medium">Revoke</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Queen Bee Modal */}
      <Modal visible={showQueenBeeModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              {editingQueenBee ? 'Edit Queen Bee' : 'Set Queen Bee'}
            </Text>

            {!editingQueenBee && (
              <>
                <Text className="text-gray-600 mb-2">Select Member</Text>
                <ScrollView horizontal className="mb-4">
                  {members.map((member) => (
                    <Pressable
                      key={member.id}
                      onPress={() => setSelectedMember(member.profiles)}
                      className={`mr-2 p-2 rounded-lg ${
                        selectedMember?.id === member.profiles.id
                          ? 'bg-honey-100 border-2 border-honey-500'
                          : 'bg-gray-100'
                      }`}
                    >
                      <Text className="font-medium">{member.profiles.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <TextInput
                  placeholder="Month MM-YYYY (auto-fills next)"
                  value={qbMonth}
                  onChangeText={setQbMonth}
                  className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
                />
              </>
            )}

            {editingQueenBee && (
              <View className="mb-3 p-3 bg-gray-50 rounded-lg">
                <Text className="text-gray-600">
                  {selectedMember?.name} • {qbMonth}
                </Text>
              </View>
            )}

            <TextInput
              placeholder="Project Title (optional - defaults to TBD)"
              value={qbTitle}
              onChangeText={setQbTitle}
              className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
            />
            <TextInput
              placeholder="Project Description (optional)"
              value={qbDescription}
              onChangeText={setQbDescription}
              multiline
              numberOfLines={3}
              className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50"
            />

            <Text className="text-gray-600 mb-2">Status</Text>
            <View className="flex-row mb-4">
              {(['upcoming', 'active', 'completed'] as const).map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setQbStatus(status)}
                  className={`px-4 py-2 rounded-lg mr-2 ${
                    qbStatus === status
                      ? status === 'active' ? 'bg-green-500' :
                        status === 'completed' ? 'bg-gray-500' : 'bg-honey-500'
                      : 'bg-gray-100'
                  }`}
                >
                  <Text className={`capitalize ${
                    qbStatus === status ? 'text-white' : 'text-gray-600'
                  }`}>
                    {status}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="flex-row">
              <Pressable
                onPress={closeQueenBeeModal}
                className="flex-1 bg-gray-200 py-3 rounded-lg mr-2"
              >
                <Text className="text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={editingQueenBee ? updateQueenBee : createQueenBee}
                className="flex-1 bg-honey-500 py-3 rounded-lg"
              >
                <Text className="text-center font-semibold text-white">
                  {editingQueenBee ? 'Save' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Add Event
            </Text>

            <TextInput
              placeholder="Event Title"
              value={eventTitle}
              onChangeText={setEventTitle}
              className="border border-gray-300 rounded-lg p-3 mb-3"
            />
            <TextInput
              placeholder="Date (MM-DD-YYYY)"
              value={eventDate}
              onChangeText={setEventDate}
              className="border border-gray-300 rounded-lg p-3 mb-3"
            />
            <TextInput
              placeholder="Description (optional)"
              value={eventDescription}
              onChangeText={setEventDescription}
              multiline
              numberOfLines={3}
              className="border border-gray-300 rounded-lg p-3 mb-4"
            />

            <View className="flex-row">
              <Pressable
                onPress={() => setShowEventModal(false)}
                className="flex-1 bg-gray-200 py-3 rounded-lg mr-2"
              >
                <Text className="text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={createEvent}
                className="flex-1 bg-honey-500 py-3 rounded-lg"
              >
                <Text className="text-center font-semibold text-white">
                  Create
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

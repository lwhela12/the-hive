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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import type { Profile, QueenBee, Event, UserRole } from '../../types';

export default function AdminScreen() {
  const { profile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [queenBees, setQueenBees] = useState<QueenBee[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  // Modal states
  const [showQueenBeeModal, setShowQueenBeeModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);

  // Form states
  const [selectedMember, setSelectedMember] = useState<Profile | null>(null);
  const [qbMonth, setQbMonth] = useState('');
  const [qbTitle, setQbTitle] = useState('');
  const [qbDescription, setQbDescription] = useState('');

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  const fetchData = useCallback(async () => {
    // Fetch members
    const { data: membersData } = await supabase
      .from('profiles')
      .select('*')
      .order('name');
    if (membersData) setMembers(membersData);

    // Fetch queen bees
    const { data: qbData } = await supabase
      .from('queen_bees')
      .select('*')
      .order('month', { ascending: false })
      .limit(12);
    if (qbData) setQueenBees(qbData);

    // Fetch events
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .limit(20);
    if (eventsData) setEvents(eventsData);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const updateMemberRole = async (memberId: string, role: UserRole) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', memberId);

    if (error) {
      Alert.alert('Error', 'Failed to update role');
    } else {
      await fetchData();
    }
  };

  const createQueenBee = async () => {
    if (!selectedMember || !qbMonth || !qbTitle) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const { error } = await supabase.from('queen_bees').insert({
      user_id: selectedMember.id,
      month: qbMonth,
      project_title: qbTitle,
      project_description: qbDescription,
      status: 'upcoming',
    });

    if (error) {
      Alert.alert('Error', 'Failed to create Queen Bee');
    } else {
      setShowQueenBeeModal(false);
      setSelectedMember(null);
      setQbMonth('');
      setQbTitle('');
      setQbDescription('');
      await fetchData();
    }
  };

  const createEvent = async () => {
    if (!eventTitle || !eventDate) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const { error } = await supabase.from('events').insert({
      title: eventTitle,
      event_date: eventDate,
      description: eventDescription,
      event_type: 'custom',
      created_by: profile?.id,
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

  if (profile?.role !== 'admin') {
    return (
      <SafeAreaView className="flex-1 bg-honey-50 justify-center items-center">
        <Text className="text-gray-600">Admin access required</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
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
            <Pressable
              onPress={() => setShowQueenBeeModal(true)}
              className="bg-honey-500 px-3 py-1 rounded-lg active:bg-honey-600"
            >
              <Text className="text-white font-medium">+ Add</Text>
            </Pressable>
          </View>
          <View className="bg-white rounded-xl shadow-sm overflow-hidden">
            {queenBees.map((qb) => (
              <View
                key={qb.id}
                className="p-4 border-b border-gray-100 last:border-b-0"
              >
                <Text className="font-semibold text-gray-800">
                  {qb.month}: {qb.project_title}
                </Text>
                <Text className="text-sm text-gray-500 mt-1 capitalize">
                  Status: {qb.status}
                </Text>
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
                  {new Date(event.event_date).toLocaleDateString()}
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
                <Avatar name={member.name} url={member.avatar_url} size={40} />
                <View className="flex-1 ml-3">
                  <Text className="font-medium text-gray-800">
                    {member.name}
                  </Text>
                  <Text className="text-sm text-gray-500">{member.email}</Text>
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
      </ScrollView>

      {/* Queen Bee Modal */}
      <Modal visible={showQueenBeeModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Set Queen Bee
            </Text>

            <Text className="text-gray-600 mb-2">Select Member</Text>
            <ScrollView horizontal className="mb-4">
              {members.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => setSelectedMember(member)}
                  className={`mr-2 p-2 rounded-lg ${
                    selectedMember?.id === member.id
                      ? 'bg-honey-100 border-2 border-honey-500'
                      : 'bg-gray-100'
                  }`}
                >
                  <Text className="font-medium">{member.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput
              placeholder="Month (YYYY-MM)"
              value={qbMonth}
              onChangeText={setQbMonth}
              className="border border-gray-300 rounded-lg p-3 mb-3"
            />
            <TextInput
              placeholder="Project Title"
              value={qbTitle}
              onChangeText={setQbTitle}
              className="border border-gray-300 rounded-lg p-3 mb-3"
            />
            <TextInput
              placeholder="Project Description"
              value={qbDescription}
              onChangeText={setQbDescription}
              multiline
              numberOfLines={3}
              className="border border-gray-300 rounded-lg p-3 mb-4"
            />

            <View className="flex-row">
              <Pressable
                onPress={() => setShowQueenBeeModal(false)}
                className="flex-1 bg-gray-200 py-3 rounded-lg mr-2"
              >
                <Text className="text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={createQueenBee}
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
              placeholder="Date (YYYY-MM-DD)"
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

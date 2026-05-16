import { useState, useEffect, useCallback, type ReactNode } from 'react';
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { queryKeys } from '../../lib/queryClient';
import {
  ANNUAL_DUES_AMOUNT,
  QUARTERLY_DUES_AMOUNT,
  getCurrentDuesPeriod,
  getDuesAmountForCoverage,
  type DuesCoverage,
} from '../../lib/dues';
import {
  HONEY_POT_PAYMENT_METHOD_OPTIONS,
  fetchHoneyPotLedger,
  getHoneyPotErrorMessage,
  recordHoneyPotTransaction,
  type HoneyPotLedgerEntry,
  type HoneyPotPaymentMethod,
} from '../../lib/honeyPot';
import { Avatar } from '../../components/ui/Avatar';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { AppHeader } from '../../components/navigation';
import { HoneyPotLedger } from '../../components/hive/HoneyPotLedger';
import { useSurveys } from '../../lib/hooks/useSurveys';
import type { Survey } from '../../lib/hooks/useSurveys';
import { parseAmericanDate } from '../../lib/dateUtils';
import type { Profile, QueenBee, UserRole, CommunityInvite } from '../../types';

type MemberRow = {
  id: string;
  role: UserRole;
  profiles: Profile;
};

type InviteRow = CommunityInvite & {
  inviter: Pick<Profile, 'name'> | null;
};

const ROLE_OPTIONS: UserRole[] = ['member', 'treasurer', 'admin'];

const ROLE_LABELS: Record<UserRole, string> = {
  member: 'Member',
  treasurer: 'Treasurer',
  admin: 'Admin',
};

const DUES_QUARTERS = [1, 2, 3, 4] as const;

type HoneyPotFeedback = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

const HONEY_POT_FEEDBACK_STYLE: Record<HoneyPotFeedback['tone'], {
  backgroundColor: string;
  borderColor: string;
  color: string;
}> = {
  success: {
    backgroundColor: '#ecfdf3',
    borderColor: '#86efac',
    color: '#166534',
  },
  error: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    color: '#991b1b',
  },
  info: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    color: '#475569',
  },
};

function AdminPanel({
  title,
  action,
  style,
  bodyStyle,
  children,
}: {
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[{ marginBottom: 0 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d' }}>
          {title}
        </Text>
        {action}
      </View>
      <View
        style={[{
          backgroundColor: '#fff',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.35)',
          shadowColor: '#000',
          shadowOpacity: 0.04,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 5 },
          overflow: 'hidden',
        }, bodyStyle]}
      >
        {children}
      </View>
    </View>
  );
}

export default function AdminScreen() {
  const { profile, communityId, communityRole } = useAuth();
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const useMobileLayout = width < 768;
  const currentDuesPeriod = getCurrentDuesPeriod();
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [queenBees, setQueenBees] = useState<QueenBee[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteRow[]>([]);

  // Modal states
  const [showQueenBeeModal, setShowQueenBeeModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showSurveyModal, setShowSurveyModal] = useState(false);

  // Survey management
  const { allSurveys, refetch: refetchSurveys } = useSurveys(communityId ?? undefined, profile?.id);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDescription, setSurveyDescription] = useState('');
  const [surveyDueDate, setSurveyDueDate] = useState('');
  const [savingSurvey, setSavingSurvey] = useState(false);

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

  // Honey Pot state
  const [honeyPotBalance, setHoneyPotBalance] = useState<number>(0);
  const [honeyPotTransactions, setHoneyPotTransactions] = useState<HoneyPotLedgerEntry[]>([]);
  const [honeyPotLedgerLoading, setHoneyPotLedgerLoading] = useState(false);
  const [honeyPotAmount, setHoneyPotAmount] = useState('');
  const [honeyPotNote, setHoneyPotNote] = useState('');
  const [honeyPotPaymentMethod, setHoneyPotPaymentMethod] = useState<HoneyPotPaymentMethod | null>(null);
  const [honeyPotCounterparty, setHoneyPotCounterparty] = useState('');
  const [honeyPotType, setHoneyPotType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [recordingHoneyPot, setRecordingHoneyPot] = useState(false);
  const [honeyPotFeedback, setHoneyPotFeedback] = useState<HoneyPotFeedback | null>(null);
  const [duesCoverage, setDuesCoverage] = useState<DuesCoverage>('none');
  const [duesMemberId, setDuesMemberId] = useState('');
  const [duesYear, setDuesYear] = useState(String(currentDuesPeriod.year));
  const [duesQuarter, setDuesQuarter] = useState(String(currentDuesPeriod.quarter));

  useEffect(() => {
    if (honeyPotType !== 'deposit') return;
    const duesAmount = getDuesAmountForCoverage(duesCoverage);
    if (duesAmount) setHoneyPotAmount(String(duesAmount));
  }, [duesCoverage, honeyPotType]);

  const fetchData = useCallback(async () => {
    if (!communityId) return;
    // Fetch members
    const { data: membersData } = await supabase
      .from('community_memberships')
      .select('id, role, profiles(*)')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true });
    if (membersData) setMembers(membersData as unknown as MemberRow[]);

    // Fetch queen bees (ordered by display_order for queue)
    const { data: qbData } = await supabase
      .from('queen_bees')
      .select('*')
      .eq('community_id', communityId)
      .order('display_order', { ascending: true })
      .order('month', { ascending: true })
      .limit(12);
    if (qbData) setQueenBees(qbData);

    // Fetch pending invites
    const { data: invitesData } = await supabase
      .from('community_invites')
      .select('*, inviter:profiles!community_invites_invited_by_fkey(name)')
      .eq('community_id', communityId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    if (invitesData) setPendingInvites(invitesData as InviteRow[]);

    // Fetch honey pot balance and transparent ledger
    try {
      setHoneyPotLedgerLoading(true);
      const ledger = await fetchHoneyPotLedger(communityId);
      setHoneyPotBalance(ledger.balance);
      setHoneyPotTransactions(ledger.transactions);
    } catch (honeyPotError) {
      console.warn('Could not load honey pot ledger', honeyPotError);
      setHoneyPotBalance(0);
      setHoneyPotTransactions([]);
    } finally {
      setHoneyPotLedgerLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refetchSurveys()]);
    setRefreshing(false);
  };

  const showHoneyPotFeedback = useCallback((
    tone: HoneyPotFeedback['tone'],
    title: string,
    message: string
  ) => {
    setHoneyPotFeedback({ tone, message });
    if (typeof window === 'undefined') {
      Alert.alert(title, message);
    }
  }, []);

  const toggleSurveyActive = async (survey: Survey) => {
    await supabase.from('surveys').update({ is_active: !survey.is_active }).eq('id', survey.id);
    refetchSurveys();
  };

  const createQuickSurvey = async () => {
    if (!surveyTitle.trim() || !communityId) return;
    setSavingSurvey(true);
    try {
      await supabase.from('surveys').insert({
        community_id: communityId,
        title: surveyTitle.trim(),
        description: surveyDescription.trim() || null,
        due_date: surveyDueDate || null,
        questions: [],
        is_active: true,
        created_by: profile?.id,
      });
      setSurveyTitle('');
      setSurveyDescription('');
      setSurveyDueDate('');
      setShowSurveyModal(false);
      refetchSurveys();
    } catch (e) {
      Alert.alert('Error', 'Failed to create survey');
    } finally {
      setSavingSurvey(false);
    }
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

  const removeMember = async (membershipId: string, memberName: string, memberId: string) => {
    // Don't allow removing yourself
    if (memberId === profile?.id) {
      Alert.alert('Error', "You can't remove yourself from the community.");
      return;
    }

    const doRemove = async () => {
      try {
        const { error } = await supabase
          .from('community_memberships')
          .delete()
          .eq('id', membershipId);

        if (error) throw error;
        await fetchData();
        Alert.alert('Success', `${memberName} has been removed from the community.`);
      } catch (err) {
        console.error('Remove member error:', err);
        Alert.alert('Error', 'Failed to remove member');
      }
    };

    // Confirmation
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove ${memberName} from the community?\n\nThey can be re-invited later.`)) {
        await doRemove();
      }
    } else {
      Alert.alert(
        'Remove Member',
        `Remove ${memberName} from the community?\n\nThey can be re-invited later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ]
      );
    }
  };

  const createQueenBee = async () => {
    if (!selectedMember || !communityId) {
      Alert.alert('Error', 'Please select a member');
      return;
    }

    // Auto-generate month if not provided (next available month)
    // Format: YYYY-MM (ISO format for proper sorting and querying)
    let month = qbMonth;

    // Normalize manual input: convert MM-YYYY to YYYY-MM if needed
    if (month) {
      const parts = month.split('-');
      if (parts.length === 2) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first <= 12 && second > 12) {
          // MM-YYYY format entered, convert to YYYY-MM
          month = `${second}-${String(first).padStart(2, '0')}`;
        }
      }
    }

    if (!month) {
      // Sort existing months to find the latest one
      const existingMonths = queenBees.map(qb => qb.month);
      // Parse both MM-YYYY and YYYY-MM formats for backwards compatibility
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
              // MM-YYYY format (legacy)
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
        month = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      } else {
        // Start with current month
        const now = new Date();
        month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

  const closeQueenBeeModal = () => {
    setShowQueenBeeModal(false);
    setEditingQueenBee(null);
    setSelectedMember(null);
    setQbMonth('');
    setQbTitle('');
    setQbDescription('');
    setQbStatus('upcoming');
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

  const updateHoneyPot = async () => {
    if (recordingHoneyPot) return;
    const amount = parseFloat(honeyPotAmount);
    if (isNaN(amount) || amount <= 0) {
      showHoneyPotFeedback('error', 'Error', 'Please enter a valid amount.');
      return;
    }
    if (!communityId) {
      showHoneyPotFeedback('error', 'Error', 'No community context. Please refresh and try again.');
      return;
    }
    if (!honeyPotPaymentMethod) {
      showHoneyPotFeedback('error', 'Error', 'Please choose how this money moved.');
      return;
    }
    const taggedAsDues = honeyPotType === 'deposit' && duesCoverage !== 'none';
    const duesYearValue = Number(duesYear);
    const duesQuarterValue = Number(duesQuarter);

    if (taggedAsDues && !duesMemberId) {
      showHoneyPotFeedback('error', 'Error', 'Please choose who this dues payment is for.');
      return;
    }
    if (taggedAsDues && (!duesYearValue || duesYearValue < 2020)) {
      showHoneyPotFeedback('error', 'Error', 'Please enter a valid dues year.');
      return;
    }
    if (duesCoverage === 'quarter' && (!duesQuarterValue || duesQuarterValue < 1 || duesQuarterValue > 4)) {
      showHoneyPotFeedback('error', 'Error', 'Please choose a valid quarter.');
      return;
    }

    const signedAmount = honeyPotType === 'withdrawal' ? -amount : amount;

    try {
      setRecordingHoneyPot(true);
      setHoneyPotFeedback({
        tone: 'info',
        message: `Recording Honey Pot ${honeyPotType === 'deposit' ? 'deposit' : 'withdrawal'}...`,
      });
      const result = await recordHoneyPotTransaction({
        communityId,
        signedAmount,
        transactionType: honeyPotType,
        note: honeyPotNote,
        paymentMethod: honeyPotPaymentMethod,
        externalCounterpartyName: taggedAsDues ? null : honeyPotCounterparty,
        recordedBy: profile?.id ?? null,
        relatedUserId: taggedAsDues ? duesMemberId : null,
        duesYear: taggedAsDues ? duesYearValue : null,
        duesQuarter: duesCoverage === 'quarter' ? duesQuarterValue : null,
        duesCoveredQuarters: duesCoverage === 'year' ? 4 : duesCoverage === 'quarter' ? 1 : null,
        fallbackDuesLabel: taggedAsDues
          ? `${selectedDuesMember?.name ?? 'Member'} · ${duesCoverage === 'year' ? `${duesYearValue} full year` : `Q${duesQuarterValue} ${duesYearValue}`}`
          : null,
      });
      const savedBalance = result.balance;
      const savedStructuredDues = taggedAsDues && result.savedStructuredDues;

      setHoneyPotBalance(savedBalance);
      queryClient.setQueryData(queryKeys.honeyPot(communityId), savedBalance);
      await queryClient.invalidateQueries({ queryKey: queryKeys.honeyPot(communityId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.honeyPotLedger(communityId) });
      setHoneyPotAmount('');
      setHoneyPotNote('');
      setHoneyPotCounterparty('');
      if (duesCoverage !== 'none') {
        setDuesMemberId('');
      }
      const ledger = await fetchHoneyPotLedger(communityId);
      setHoneyPotBalance(ledger.balance);
      setHoneyPotTransactions(ledger.transactions);
      showHoneyPotFeedback(
        'success',
        'Success',
        savedStructuredDues || !taggedAsDues
          ? `Honey Pot ${honeyPotType === 'deposit' ? 'deposit' : 'withdrawal'} recorded`
          : 'Deposit recorded. The dues tag was saved in the note, but reminder tracking needs the latest database migration.'
      );
    } catch (err) {
      console.error('Honey pot update error:', err);
      showHoneyPotFeedback('error', 'Honey Pot update failed', getHoneyPotErrorMessage(err));
    } finally {
      setRecordingHoneyPot(false);
    }
  };

  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const isTreasurer = communityRole === 'treasurer' || profile?.role === 'treasurer';
  const canEditHoneyPot = isTreasurer || isAdmin;
  const selectedDuesMember = members.find((member) => member.profiles.id === duesMemberId)?.profiles;
  const desktopPanelHeight = Math.max(240, Math.floor((height - 188) / 2));
  const dashboardPanelStyle = useMobileLayout ? undefined : { height: desktopPanelHeight };
  const dashboardPanelBodyStyle = useMobileLayout ? undefined : { flex: 1 };
  const panelScrollStyle = useMobileLayout ? undefined : { flex: 1 };
  const panelOrderStyle = (order: number) => ({ order } as unknown as ViewStyle);
  const dashboardWrapStyle = {
    flexDirection: useMobileLayout ? 'column' : 'row',
    flexWrap: 'wrap',
    marginHorizontal: useMobileLayout ? 0 : -8,
  } as const;
  const dashboardCellStyle = {
    width: useMobileLayout ? '100%' : '50%',
    paddingHorizontal: useMobileLayout ? 0 : 8,
    marginBottom: useMobileLayout ? 18 : 16,
  } as const;

  if (!isAdmin && !isTreasurer) {
    return (
      <SafeAreaView className="flex-1 bg-honey-50 justify-center items-center">
        <Text className="text-gray-600">Admin or Treasurer access required</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <AppHeader title="Admin" />

      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={dashboardWrapStyle}>
          <View style={[dashboardCellStyle, panelOrderStyle(3)]}>
            <AdminPanel title="Honey Pot" style={dashboardPanelStyle} bodyStyle={dashboardPanelBodyStyle}>
              <ScrollView
                style={panelScrollStyle}
                contentContainerStyle={{ padding: 16 }}
                nestedScrollEnabled
                showsVerticalScrollIndicator={!useMobileLayout}
              >
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 28, color: '#bd9348', textAlign: 'center', marginBottom: 16 }}>
                  ${honeyPotBalance.toFixed(2)}
                </Text>

                {canEditHoneyPot ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                      {(['deposit', 'withdrawal'] as const).map((type) => {
                        const selected = honeyPotType === type;
                        return (
                          <Pressable
                            key={type}
                            onPress={() => {
                              setHoneyPotType(type);
                              if (type === 'withdrawal') {
                                setDuesCoverage('none');
                                setDuesMemberId('');
                              }
                            }}
                            accessibilityRole="button"
                            style={({ pressed }) => ({
                              flex: 1,
                              backgroundColor: selected
                                ? type === 'deposit' ? '#22c55e' : '#ef4444'
                                : pressed ? '#edf2f7' : '#f3f4f6',
                              borderRadius: 12,
                              paddingVertical: 10,
                            })}
                          >
                            <Text style={{
                              fontFamily: 'Lato_700Bold',
                              color: selected ? 'white' : '#4b5563',
                              textAlign: 'center',
                              textTransform: 'capitalize',
                            }}>
                              {type}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <TextInput
                      placeholder="Amount"
                      value={honeyPotAmount}
                      onChangeText={setHoneyPotAmount}
                      keyboardType="decimal-pad"
                      className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                    />

                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                      Payment method
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {HONEY_POT_PAYMENT_METHOD_OPTIONS.map((method) => {
                        const selected = honeyPotPaymentMethod === method.value;
                        return (
                          <Pressable
                            key={method.value}
                            onPress={() => setHoneyPotPaymentMethod(method.value)}
                            accessibilityRole="button"
                            style={({ pressed }) => ({
                              backgroundColor: selected ? '#bd9348' : pressed ? '#fbf0d7' : '#f9fafb',
                              borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.55)',
                              borderWidth: 1,
                              borderRadius: 999,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: selected ? 'white' : '#4b5563' }}>
                              {method.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {!(honeyPotType === 'deposit' && duesCoverage !== 'none') && (
                      <TextInput
                        placeholder={honeyPotType === 'withdrawal' ? 'Paid to / for (optional)' : 'From / donor name (optional)'}
                        value={honeyPotCounterparty}
                        onChangeText={setHoneyPotCounterparty}
                        className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                      />
                    )}

                    <TextInput
                      placeholder="Note (optional)"
                      value={honeyPotNote}
                      onChangeText={setHoneyPotNote}
                      className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                    />

                    {honeyPotType === 'deposit' && (
                      <View className="mb-3">
                        <Text className="text-xs font-semibold text-gray-500 mb-2">
                          Dues tag (optional)
                        </Text>
                        <View className="flex-row flex-wrap mb-2">
                          <Pressable
                            onPress={() => setDuesCoverage('none')}
                            className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                              duesCoverage === 'none' ? 'bg-honey-500' : 'bg-gray-100'
                            }`}
                          >
                            <Text className={`text-xs font-medium ${
                              duesCoverage === 'none' ? 'text-white' : 'text-gray-600'
                            }`}>
                              No dues tag
                            </Text>
                          </Pressable>
                          {DUES_QUARTERS.map((quarter) => {
                            const isSelected = duesCoverage === 'quarter' && duesQuarter === String(quarter);
                            return (
                              <Pressable
                                key={quarter}
                                onPress={() => {
                                  setDuesCoverage('quarter');
                                  setDuesQuarter(String(quarter));
                                }}
                                className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                                  isSelected ? 'bg-honey-500' : 'bg-gray-100'
                                }`}
                              >
                                <Text className={`text-xs font-medium ${
                                  isSelected ? 'text-white' : 'text-gray-600'
                                }`}>
                                  Q{quarter} · ${QUARTERLY_DUES_AMOUNT}
                                </Text>
                              </Pressable>
                            );
                          })}
                          <Pressable
                            onPress={() => setDuesCoverage('year')}
                            className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
                              duesCoverage === 'year' ? 'bg-honey-500' : 'bg-gray-100'
                            }`}
                          >
                            <Text className={`text-xs font-medium ${
                              duesCoverage === 'year' ? 'text-white' : 'text-gray-600'
                            }`}>
                              Full year · ${ANNUAL_DUES_AMOUNT}
                            </Text>
                          </Pressable>
                        </View>

                        {duesCoverage !== 'none' && (
                          <View className="bg-honey-50 border border-honey-100 rounded-lg p-3">
                            <View className="flex-row mb-2">
                              <TextInput
                                placeholder="Year"
                                value={duesYear}
                                onChangeText={setDuesYear}
                                keyboardType="number-pad"
                                className="border border-honey-200 rounded-lg px-3 py-2 mr-2 bg-white"
                                style={{ width: 92 }}
                              />
                              {duesCoverage === 'quarter' && (
                                <View className="flex-1 bg-white rounded-lg px-3 py-2 border border-honey-100">
                                  <Text className="text-xs font-semibold text-gray-600">
                                    Q{duesQuarter} selected
                                  </Text>
                                </View>
                              )}
                              {duesCoverage === 'year' && (
                                <View className="flex-1 bg-white rounded-lg px-3 py-2 border border-honey-100">
                                  <Text className="text-xs font-semibold text-gray-600">
                                    Covers Q1-Q4
                                  </Text>
                                </View>
                              )}
                            </View>

                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              {members.map((member) => (
                                <Pressable
                                  key={member.profiles.id}
                                  onPress={() => setDuesMemberId(member.profiles.id)}
                                  className={`mr-2 px-3 py-2 rounded-lg border ${
                                    duesMemberId === member.profiles.id
                                      ? 'bg-honey-500 border-honey-500'
                                      : 'bg-white border-honey-100'
                                  }`}
                                >
                                  <Text className={`text-xs font-semibold ${
                                    duesMemberId === member.profiles.id ? 'text-white' : 'text-gray-700'
                                  }`}>
                                    {member.profiles.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                            {selectedDuesMember && (
                              <Text className="text-xs text-gray-500 mt-2">
                                Tagging this deposit as dues for {selectedDuesMember.name}.
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    )}

                    <Pressable
                      onPress={updateHoneyPot}
                      disabled={recordingHoneyPot}
                      accessibilityRole="button"
                      className="bg-honey-500 py-3 rounded-lg active:bg-honey-600"
                      style={{ opacity: recordingHoneyPot ? 0.6 : 1 }}
                    >
                      <Text className="text-center font-semibold text-white">
                        {recordingHoneyPot
                          ? 'Recording...'
                          : `Record ${honeyPotType === 'deposit' ? 'Deposit' : 'Withdrawal'}`}
                      </Text>
                    </Pressable>
                    {honeyPotFeedback && (
                      <View
                        className="mt-3 rounded-lg border px-3 py-2"
                        style={{
                          backgroundColor: HONEY_POT_FEEDBACK_STYLE[honeyPotFeedback.tone].backgroundColor,
                          borderColor: HONEY_POT_FEEDBACK_STYLE[honeyPotFeedback.tone].borderColor,
                        }}
                      >
                        <Text
                          className="text-sm font-semibold text-center"
                          style={{ color: HONEY_POT_FEEDBACK_STYLE[honeyPotFeedback.tone].color }}
                        >
                          {honeyPotFeedback.message}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text className="text-center text-gray-500">
                    Honey Pot changes are limited to Admins and the Treasurer.
                  </Text>
                )}
              </ScrollView>
            </AdminPanel>
          </View>

          <View style={[dashboardCellStyle, panelOrderStyle(4)]}>
            <AdminPanel title="Honey Pot Transactions" style={dashboardPanelStyle} bodyStyle={dashboardPanelBodyStyle}>
              <ScrollView
                style={panelScrollStyle}
                contentContainerStyle={{ padding: 14 }}
                nestedScrollEnabled
                showsVerticalScrollIndicator={!useMobileLayout}
              >
                <HoneyPotLedger
                  balance={honeyPotBalance}
                  transactions={honeyPotTransactions}
                  loading={honeyPotLedgerLoading}
                  compact
                  showBalanceCard={false}
                />
              </ScrollView>
            </AdminPanel>
          </View>

          {isAdmin && (
            <View style={[dashboardCellStyle, panelOrderStyle(1)]}>
              <AdminPanel title={`Members (${members.length})`} style={dashboardPanelStyle} bodyStyle={dashboardPanelBodyStyle}>
                <ScrollView
                  style={panelScrollStyle}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={!useMobileLayout}
                >
                  <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', marginBottom: 10 }}>
                      Invite Member
                    </Text>
                    <TextInput
                      placeholder="Email address"
                      value={inviteEmail}
                      onChangeText={setInviteEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="border border-gray-300 rounded-lg p-3 mb-3 bg-white"
                    />
                    <View className="flex-row flex-wrap mb-4">
                      {ROLE_OPTIONS.map((role) => (
                        <Pressable
                          key={role}
                          onPress={() => setInviteRole(role)}
                          className={`px-3 py-2 rounded mr-2 mb-2 ${
                            inviteRole === role ? 'bg-honey-500' : 'bg-gray-100'
                          }`}
                        >
                          <Text className={`${inviteRole === role ? 'text-white' : 'text-gray-600'} capitalize`}>
                            {ROLE_LABELS[role]}
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

                {members.map((member) => {
                  const roleButtons = (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        justifyContent: useMobileLayout ? 'flex-start' : 'flex-end',
                        flexShrink: 0,
                      }}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <Pressable
                          key={role}
                          onPress={() => updateMemberRole(member.id, role)}
                          style={({ pressed }) => ({
                            backgroundColor: member.role === role ? '#bd9348' : pressed ? '#eceff3' : '#f3f4f6',
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            marginRight: 6,
                            marginBottom: useMobileLayout ? 6 : 0,
                          })}
                        >
                          <Text
                            style={{
                              color: member.role === role ? 'white' : '#4b5563',
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            {ROLE_LABELS[role]}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );

                  return (
                    <View
                      key={member.id}
                      style={{
                        padding: 16,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f3f4f6',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Avatar name={member.profiles.name} url={member.profiles.avatar_url} size={40} />
                        <View style={{ flex: 1, minWidth: 0, marginLeft: 12, marginRight: 12 }}>
                          <Text className="font-medium text-gray-800" numberOfLines={2}>
                            {member.profiles.name}
                          </Text>
                          <Text className="text-sm text-gray-500" numberOfLines={1}>
                            {member.profiles.email}
                          </Text>
                        </View>

                        {!useMobileLayout && roleButtons}
                        {member.profiles.id !== profile?.id && (
                          <Pressable
                            onPress={() => removeMember(member.id, member.profiles.name, member.profiles.id)}
                            className="px-2 py-1 bg-red-100 rounded active:bg-red-200"
                            style={{ marginLeft: useMobileLayout ? 0 : 8 }}
                          >
                            <Text className="text-red-600 text-xs">✕</Text>
                          </Pressable>
                        )}
                      </View>

                      {useMobileLayout && (
                        <View style={{ marginTop: 12, marginLeft: 52 }}>
                          {roleButtons}
                        </View>
                      )}
                    </View>
                  );
                })}

                {pendingInvites.length > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 16, paddingTop: 16 }}>
                      Pending Invites ({pendingInvites.length})
                    </Text>
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
                              Role: {ROLE_LABELS[invite.role] || invite.role} • Invited by {invite.inviter?.name || 'Unknown'}
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
                )}
                </ScrollView>
              </AdminPanel>
            </View>
          )}

          {isAdmin && (
            <View style={[dashboardCellStyle, panelOrderStyle(2)]}>
              <AdminPanel
                title="Surveys"
                style={dashboardPanelStyle}
                bodyStyle={dashboardPanelBodyStyle}
                action={(
                  <Pressable
                    onPress={() => setShowSurveyModal(true)}
                    style={({ pressed }: { pressed: boolean }) => ({
                      backgroundColor: pressed ? '#f5e0b0' : '#fdf3dc',
                      paddingHorizontal: 12,
                      paddingVertical: 5,
                      borderRadius: 10,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>+ Create</Text>
                  </Pressable>
                )}
              >
                <ScrollView
                  style={panelScrollStyle}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={!useMobileLayout}
                >
                  {allSurveys.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#9ca3af' }}>
                        No surveys yet.
                      </Text>
                    </View>
                  ) : (
                    allSurveys.map((survey, i) => (
                      <View key={survey.id} style={{
                        flexDirection: 'row', alignItems: 'center', padding: 14,
                        borderBottomWidth: i < allSurveys.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(222,193,129,0.3)',
                      }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d' }}>{survey.title}</Text>
                          {survey.due_date && (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                              Due {new Date(survey.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          )}
                        </View>
                        <Pressable
                          onPress={() => toggleSurveyActive(survey)}
                          style={({ pressed }: { pressed: boolean }) => ({
                            backgroundColor: pressed ? (survey.is_active ? '#f5e0b0' : '#e5e7eb') : (survey.is_active ? '#fdf3dc' : '#f3f4f6'),
                            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
                          })}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: survey.is_active ? '#bd9348' : '#9ca3af' }}>
                            {survey.is_active ? 'Active' : 'Inactive'}
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </ScrollView>
              </AdminPanel>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Survey Create Modal */}
      <Modal visible={showSurveyModal} animationType="slide" transparent onRequestClose={() => setShowSurveyModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 20, color: '#2d2d2d', marginBottom: 16 }}>Create Survey</Text>
            <TextInput
              placeholder="Survey title"
              value={surveyTitle}
              onChangeText={setSurveyTitle}
              style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 15, color: '#2d2d2d', marginBottom: 10, backgroundColor: '#faf8f3' }}
              placeholderTextColor="#b5ad9f"
            />
            <TextInput
              placeholder="Description (optional)"
              value={surveyDescription}
              onChangeText={setSurveyDescription}
              multiline
              style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', marginBottom: 10, backgroundColor: '#faf8f3', minHeight: 72, textAlignVertical: 'top' }}
              placeholderTextColor="#b5ad9f"
            />
            <TextInput
              placeholder="Due date (optional, e.g. 2026-06-01)"
              value={surveyDueDate}
              onChangeText={setSurveyDueDate}
              style={{ borderWidth: 1, borderColor: 'rgba(222,193,129,0.5)', borderRadius: 12, padding: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', marginBottom: 16, backgroundColor: '#faf8f3' }}
              placeholderTextColor="#b5ad9f"
            />
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
              💡 After creating, ask Clive to help you build questions for this survey.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowSurveyModal(false)} style={{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={createQuickSurvey}
                disabled={!surveyTitle.trim() || savingSurvey}
                style={{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: surveyTitle.trim() && !savingSurvey ? 1 : 0.4 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                  {savingSurvey ? 'Creating...' : 'Create Survey'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                  placeholder="Month YYYY-MM (auto-fills next)"
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
            <View className="mb-3">
              <EventDatePicker
                value={eventDate}
                onChange={setEventDate}
              />
            </View>
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

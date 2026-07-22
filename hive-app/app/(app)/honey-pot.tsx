import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/navigation';
import { HoneyPotPaymentCard } from '../../components/hive/HoneyPotPaymentCard';
import { HoneyPotLedger } from '../../components/hive/HoneyPotLedger';
import { fetchHoneyPotLedger, type HoneyPotLedgerEntry } from '../../lib/honeyPot';
import {
  duesTransactionsCoverMember,
  getCurrentDuesPeriod,
  QUARTERLY_DUES_AMOUNT,
} from '../../lib/dues';
import { useAuth } from '../../lib/hooks/useAuth';

export default function HoneyPotScreen() {
  const router = useRouter();
  const { communityId, communityRole, profile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<HoneyPotLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const isTreasurer = communityRole === 'treasurer' || profile?.role === 'treasurer';
  const canRecord = isAdmin || isTreasurer;

  const loadLedger = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const ledger = await fetchHoneyPotLedger(communityId);
      setBalance(ledger.balance);
      setTransactions(ledger.transactions);
    } catch (error) {
      console.warn('Could not load Honey Pot ledger', error);
      setBalance(0);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // At-a-glance dues status for whoever's looking — no ledger-scrolling
  // required. Uses the same recognizer as the reminder emails.
  const duesStatus = useMemo(() => {
    if (!profile) return null;
    const member = { id: profile.id, name: profile.name, email: profile.email };
    const current = getCurrentDuesPeriod();
    if (!duesTransactionsCoverMember(transactions, member, current)) {
      return { covered: false, label: `Q${current.quarter} ${current.year} dues are due — $${QUARTERLY_DUES_AMOUNT} · CashApp $HiveLV` };
    }
    let coveredThrough = current;
    for (let step = 0; step < 8; step += 1) {
      const next = coveredThrough.quarter === 4
        ? { year: coveredThrough.year + 1, quarter: 1 }
        : { year: coveredThrough.year, quarter: coveredThrough.quarter + 1 };
      if (!duesTransactionsCoverMember(transactions, member, next)) break;
      coveredThrough = next;
    }
    return { covered: true, label: `You're paid up through Q${coveredThrough.quarter} ${coveredThrough.year} 🎉` };
  }, [profile, transactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLedger();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      <AppHeader title="Honey Pot" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={{ maxWidth: 980, width: '100%', alignSelf: 'center' }}>
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d' }}>
              Honey Pot Ledger
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              Community fund activity
            </Text>
          </View>
          {!loading && duesStatus ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: duesStatus.covered ? '#f0fdf4' : '#fffbeb',
                borderWidth: 1,
                borderColor: duesStatus.covered ? '#bbf7d0' : '#fde68a',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 13,
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 18 }}>{duesStatus.covered ? '✅' : '🐝'}</Text>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: 15,
                  color: duesStatus.covered ? '#166534' : '#92400e',
                  flex: 1,
                }}
              >
                {duesStatus.label}
              </Text>
            </View>
          ) : null}
          <HoneyPotPaymentCard />
          <HoneyPotLedger
            balance={balance}
            transactions={transactions}
            loading={loading}
            canRecord={canRecord}
            onRecordPress={() => router.push('/admin')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

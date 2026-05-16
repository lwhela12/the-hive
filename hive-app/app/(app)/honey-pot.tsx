import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/navigation';
import { HoneyPotLedger } from '../../components/hive/HoneyPotLedger';
import { fetchHoneyPotLedger, type HoneyPotLedgerEntry } from '../../lib/honeyPot';
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

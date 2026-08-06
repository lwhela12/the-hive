import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/navigation';
import { HoneyPotPaymentCard } from '../../components/hive/HoneyPotPaymentCard';
import { HoneyPotLedger } from '../../components/hive/HoneyPotLedger';
import { RecordHoneyPotModal } from '../../components/hive/RecordHoneyPotModal';
import { fetchHoneyPotLedger, type HoneyPotLedgerEntry } from '../../lib/honeyPot';
import {
  duesTransactionsCoverMember,
  getCurrentDuesPeriod,
  QUARTERLY_DUES_AMOUNT,
} from '../../lib/dues';
import { useAuth } from '../../lib/hooks/useAuth';
import { HoneyPotNotSetUp } from '../../components/hive/HoneyPotNotSetUp';

export default function HoneyPotScreen() {
  const { communityId, communityRole, profile, community } = useAuth();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<HoneyPotLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isTreasurer = communityRole === 'treasurer' || profile?.role === 'treasurer';
  /**
   * Who may write in the ledger: the treasurer, and Nat and Lucas.
   *
   * Money is one job held by one person, and until 2026-08-06 this said
   * "treasurer or admin" — so every admin of every HIVE could record an entry.
   * Nat, 2026-08-06: *"i think only the treasurer should be able to 'record
   * entry'."* Admins keep the whole ledger in front of them; the writing is the
   * treasurer's.
   *
   * The owners stay because a HIVE that has not appointed a treasurer yet would
   * otherwise have a Honey Pot nobody in the app can update, and because Nat is
   * the one who sets a pot up in the first place (`profiles.is_owner`,
   * migration 128 — Nat and Lucas, the pair, never a community admin).
   *
   * The database still allows admins as well: `is_community_treasurer()` in
   * migration 082 reads `role in ('treasurer','admin')`, and the button being
   * gone is not the same thing as the door being locked. Closing that needs a
   * migration.
   */
  const canRecord = isTreasurer || profile?.is_owner === true;
  const [showRecord, setShowRecord] = useState(false);

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

  // A HIVE that never chose to run one gets the explainer instead of somebody
  // else's empty ledger (migration 140). Checked before the ledger renders so
  // nobody sees a $0 balance flash past on the way to being told there isn't a
  // Honey Pot here.
  if (community && community.honey_pot_enabled === false) {
    return (
      <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
        <AppHeader title="Honey Pot" />
        <HoneyPotNotSetUp community={community} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-honey-50" edges={['top']}>
      {/* No icons in headers — the bar is the HIVE's colour and its name, and
          a second mark in there is noise (Nat 2026-07-31). That covers the back
          arrow too: this was the one header in the app carrying one, and the
          strip along the bottom already says where you are and gets you back
          (Nat 2026-08-06: "lets ditch it"). */}
      <AppHeader title="Honey Pot" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={{ maxWidth: 980, width: '100%', alignSelf: 'center' }}>
          {!loading && duesStatus ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: duesStatus.covered ? '#fdf3dc' : '#fffbeb',
                borderWidth: 1,
                borderColor: duesStatus.covered ? 'rgba(189,147,72,0.45)' : '#fde68a',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 13,
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 16 }}>{duesStatus.covered ? '✅' : '🍯'}</Text>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: 15,
                  color: duesStatus.covered ? '#8e6f35' : '#92400e',
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
            onRecordPress={() => setShowRecord(true)}
          />
        </View>
      </ScrollView>

      {communityId ? (
        <RecordHoneyPotModal
          visible={showRecord}
          communityId={communityId}
          recordedBy={profile?.id ?? null}
          onClose={() => setShowRecord(false)}
          onRecorded={() => { void loadLedger(); }}
        />
      ) : null}
    </SafeAreaView>
  );
}

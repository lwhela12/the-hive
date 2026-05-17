import { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  describeHoneyPotTransaction,
  formatHoneyPotAmount,
  getHoneyPotDuesLabel,
  getHoneyPotPaymentMethodLabel,
  type HoneyPotLedgerEntry,
} from '../../lib/honeyPot';
import { Avatar } from '../ui/Avatar';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type LedgerFilter = 'all' | 'dues' | 'deposits' | 'withdrawals';

const FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'dues', label: 'Dues' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'withdrawals', label: 'Withdrawals' },
];

type HoneyPotLedgerProps = {
  balance: number;
  transactions: HoneyPotLedgerEntry[];
  loading?: boolean;
  canRecord?: boolean;
  compact?: boolean;
  showBalanceCard?: boolean;
  onRecordPress?: () => void;
};

const formatLedgerDate = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8a6b30', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#374151', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function GlanceChip({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.44)',
        backgroundColor: '#fffaf0',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '100%',
      }}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#8a6b30', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#374151', marginLeft: 5, flexShrink: 1 }}
      >
        {value}
      </Text>
    </View>
  );
}

const getNotePreview = (note?: string | null) => {
  const normalized = note?.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.length > 82 ? `${normalized.slice(0, 79)}...` : normalized;
};

function TransactionRow({ transaction }: { transaction: HoneyPotLedgerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const amountColor = transaction.amount < 0 ? '#b91c1c' : '#15803d';
  const methodLabel = getHoneyPotPaymentMethodLabel(transaction.payment_method);
  const duesLabel = getHoneyPotDuesLabel(transaction);
  const counterparty = transaction.related_user_profile?.name ?? transaction.external_counterparty_name;
  const recorder = transaction.recorded_by_profile?.name ?? 'Unknown recorder';
  const notePreview = getNotePreview(transaction.note);
  const glanceItems = [
    counterparty
      ? {
        label: transaction.transaction_type === 'withdrawal' ? 'Paid to' : 'From',
        value: counterparty,
      }
      : null,
    duesLabel ? { label: 'Dues', value: duesLabel } : null,
    methodLabel ? { label: 'Via', value: methodLabel } : null,
    notePreview ? { label: 'Note', value: notePreview } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const toggleExpanded = () => {
    LayoutAnimation.configureNext({
      duration: 260,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setExpanded((value) => !value);
  };

  return (
    <Pressable
      onPress={toggleExpanded}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#fff7e6' : '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: expanded ? 'rgba(189,147,72,0.55)' : 'rgba(222,193,129,0.34)',
        padding: 14,
        marginBottom: 10,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Avatar
          name={transaction.recorded_by_profile?.name ?? 'Hive'}
          url={transaction.recorded_by_profile?.avatar_url}
          size={36}
        />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', lineHeight: 19 }}>
            {describeHoneyPotTransaction(transaction)}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {formatLedgerDate(transaction.created_at)} · balance after {formatHoneyPotAmount(transaction.running_balance)}
          </Text>
          {glanceItems.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {glanceItems.map((item) => (
                <GlanceChip key={`${item.label}-${item.value}`} label={item.label} value={item.value} />
              ))}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: amountColor }}>
            {formatHoneyPotAmount(transaction.amount)}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#bd9348"
            style={{ marginTop: 5 }}
          />
        </View>
      </View>

      {expanded && (
        <View
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: 'rgba(222,193,129,0.34)',
          }}
        >
          <DetailLine label="Entered by" value={recorder} />
          <DetailLine
            label={transaction.transaction_type === 'withdrawal' ? 'Paid to / for' : 'From'}
            value={counterparty}
          />
          <DetailLine label="Dues period" value={duesLabel} />
          <DetailLine label="Payment method" value={methodLabel ?? 'Not listed'} />
          <DetailLine label="Note" value={transaction.note} />
        </View>
      )}
    </Pressable>
  );
}

export function HoneyPotLedger({
  balance,
  transactions,
  loading = false,
  canRecord = false,
  compact = false,
  showBalanceCard = true,
  onRecordPress,
}: HoneyPotLedgerProps) {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const filteredTransactions = useMemo(() => {
    switch (filter) {
      case 'dues':
        return transactions.filter((transaction) => Boolean(getHoneyPotDuesLabel(transaction)));
      case 'deposits':
        return transactions.filter((transaction) => transaction.amount > 0);
      case 'withdrawals':
        return transactions.filter((transaction) => transaction.amount < 0);
      default:
        return transactions;
    }
  }, [filter, transactions]);

  return (
    <View>
      {showBalanceCard && (
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(222,193,129,0.38)',
            padding: compact ? 14 : 18,
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#8a6b30', textTransform: 'uppercase' }}>
                Current balance
              </Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: compact ? 24 : 34, color: '#bd9348', marginTop: 4 }}>
                {formatHoneyPotAmount(balance)}
              </Text>
            </View>
            {canRecord && onRecordPress ? (
              <Pressable
                onPress={onRecordPress}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? '#a77f38' : '#bd9348',
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', fontSize: 13 }}>
                  Record entry
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {FILTERS.map((item) => {
          const selected = filter === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => setFilter(item.value)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: selected ? '#bd9348' : pressed ? '#fbf0d7' : '#fffdf5',
                borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.55)',
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 8,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: selected ? 'white' : '#7c5f25' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(222,193,129,0.34)' }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#8a6b30', textAlign: 'center' }}>
            Loading ledger...
          </Text>
        </View>
      ) : filteredTransactions.length === 0 ? (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(222,193,129,0.34)' }}>
          <Text style={{ fontFamily: 'Lato_400Regular', color: '#6b7280', textAlign: 'center' }}>
            No Honey Pot entries here yet.
          </Text>
        </View>
      ) : (
        filteredTransactions.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} />
        ))
      )}
    </View>
  );
}

import type { HoneyPotTransaction, Profile } from '../types';
import { supabase } from './supabase';

export type HoneyPotTransactionType = 'deposit' | 'withdrawal';
export type HoneyPotPaymentMethod = 'cash_app' | 'venmo' | 'zelle' | 'cash' | 'check' | 'other';

export const HONEY_POT_PAYMENT_METHOD_OPTIONS: {
  value: HoneyPotPaymentMethod;
  label: string;
}[] = [
  { value: 'cash_app', label: 'Cash App' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
];

export const HONEY_POT_PAYMENT_METHOD_LABELS = HONEY_POT_PAYMENT_METHOD_OPTIONS.reduce(
  (labels, option) => {
    labels[option.value] = option.label;
    return labels;
  },
  {} as Record<HoneyPotPaymentMethod, string>
);

type HoneyPotPerson = Pick<Profile, 'id' | 'name' | 'email' | 'avatar_url'>;

type HoneyPotTransactionRow = HoneyPotTransaction & {
  payment_method?: HoneyPotPaymentMethod | string | null;
  external_counterparty_name?: string | null;
};

export type HoneyPotLedgerEntry = HoneyPotTransactionRow & {
  amount: number;
  running_balance: number;
  recorded_by_profile?: HoneyPotPerson | null;
  related_user_profile?: HoneyPotPerson | null;
};

export type HoneyPotLedger = {
  balance: number;
  transactions: HoneyPotLedgerEntry[];
};

export type RecordHoneyPotTransactionInput = {
  communityId: string;
  signedAmount: number;
  transactionType: HoneyPotTransactionType;
  note: string;
  paymentMethod: HoneyPotPaymentMethod | null;
  externalCounterpartyName: string | null;
  recordedBy: string | null;
  relatedUserId: string | null;
  duesYear: number | null;
  duesQuarter: number | null;
  duesCoveredQuarters: number | null;
  fallbackDuesLabel: string | null;
};

export type RecordHoneyPotTransactionResult = {
  balance: number;
  savedStructuredDues: boolean;
};

export const getHoneyPotErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Unknown error');
  }
  return 'Unknown error';
};

const isMissingHoneyPotRpcError = (error: unknown) => {
  const message = getHoneyPotErrorMessage(error).toLowerCase();
  return message.includes('record_honey_pot_transaction')
    || message.includes('could not find the function')
    || message.includes('function public.record_honey_pot_transaction')
    || (message.includes('schema cache') && message.includes('function'));
};

const isMissingDuesColumnError = (error: unknown) => {
  const message = getHoneyPotErrorMessage(error).toLowerCase();
  return message.includes('related_user_id')
    || message.includes('dues_year')
    || message.includes('dues_quarter')
    || message.includes('dues_covered_quarters')
    || (message.includes('schema cache') && message.includes('honey_pot_transactions'));
};

const isMissingPaymentColumnError = (error: unknown) => {
  const message = getHoneyPotErrorMessage(error).toLowerCase();
  return message.includes('payment_method')
    || message.includes('external_counterparty_name')
    || (message.includes('schema cache') && message.includes('honey_pot_transactions'));
};

const getPaymentMethodLabel = (method?: string | null) => {
  if (!method) return null;
  return HONEY_POT_PAYMENT_METHOD_LABELS[method as HoneyPotPaymentMethod] ?? method;
};

const recordWithTables = async ({
  communityId,
  signedAmount,
  transactionType,
  note,
  paymentMethod,
  externalCounterpartyName,
  recordedBy,
  relatedUserId,
  duesYear,
  duesQuarter,
  duesCoveredQuarters,
  fallbackDuesLabel,
}: RecordHoneyPotTransactionInput): Promise<RecordHoneyPotTransactionResult> => {
  const trimmedNote = note.trim();
  const fallbackNote = [
    trimmedNote,
    getPaymentMethodLabel(paymentMethod) ? `Method: ${getPaymentMethodLabel(paymentMethod)}` : null,
    externalCounterpartyName ? `Party: ${externalCounterpartyName.trim()}` : null,
    fallbackDuesLabel ? `Dues: ${fallbackDuesLabel}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || null;

  const { data: startingPot, error: startingPotError } = await supabase
    .from('honey_pot')
    .select('balance')
    .eq('community_id', communityId)
    .maybeSingle();
  if (startingPotError) {
    console.warn('Could not read starting Honey Pot balance before fallback write', startingPotError);
  }
  const startingBalance = await fetchHoneyPotBalance(communityId)
    .catch(() => Number(startingPot?.balance ?? 0));

  const { error: structuredTransactionError } = await (supabase as any)
    .from('honey_pot_transactions')
    .insert({
      community_id: communityId,
      amount: signedAmount,
      transaction_type: transactionType,
      note: trimmedNote || null,
      payment_method: paymentMethod,
      external_counterparty_name: externalCounterpartyName?.trim() || null,
      recorded_by: recordedBy,
      related_user_id: relatedUserId,
      dues_year: duesYear,
      dues_quarter: duesQuarter,
      dues_covered_quarters: duesCoveredQuarters,
    });

  let savedStructuredDues = !!relatedUserId;
  if (structuredTransactionError) {
    if (!isMissingDuesColumnError(structuredTransactionError)
      && !isMissingPaymentColumnError(structuredTransactionError)) {
      throw structuredTransactionError;
    }
    savedStructuredDues = false;
    const { error: legacyTransactionError } = await (supabase as any)
      .from('honey_pot_transactions')
      .insert({
        community_id: communityId,
        amount: signedAmount,
        transaction_type: transactionType,
        note: fallbackNote,
        recorded_by: recordedBy,
      });
    if (legacyTransactionError) throw legacyTransactionError;
  }

  const nextBalance = startingBalance + signedAmount;
  try {
    if (startingPot) {
      const { error } = await (supabase as any)
        .from('honey_pot')
        .update({
          balance: nextBalance,
          updated_by: recordedBy,
          updated_at: new Date().toISOString(),
        })
        .eq('community_id', communityId);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from('honey_pot')
        .upsert({
          community_id: communityId,
          balance: nextBalance,
          updated_by: recordedBy,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'community_id' });
      if (error) throw error;
    }
  } catch (balanceSyncError) {
    console.warn('Honey Pot transaction saved, but balance sync needs migration', balanceSyncError);
  }

  return {
    balance: await fetchHoneyPotBalance(communityId).catch(() => nextBalance),
    savedStructuredDues,
  };
};

export const recordHoneyPotTransaction = async (
  input: RecordHoneyPotTransactionInput
): Promise<RecordHoneyPotTransactionResult> => {
  const { data, error } = await (supabase as any).rpc('record_honey_pot_transaction', {
    p_community_id: input.communityId,
    p_amount: input.signedAmount,
    p_transaction_type: input.transactionType,
    p_note: input.note.trim() || null,
    p_payment_method: input.paymentMethod,
    p_external_counterparty_name: input.externalCounterpartyName?.trim() || null,
    p_related_user_id: input.relatedUserId,
    p_dues_year: input.duesYear,
    p_dues_quarter: input.duesQuarter,
    p_dues_covered_quarters: input.duesCoveredQuarters,
  });

  if (!error) {
    let confirmedBalance: number;
    try {
      confirmedBalance = await fetchHoneyPotBalance(input.communityId);
    } catch (fetchError) {
      if (data === null || data === undefined) throw fetchError;
      confirmedBalance = Number(data);
    }
    return {
      balance: confirmedBalance,
      savedStructuredDues: !!input.relatedUserId,
    };
  }

  if (isMissingHoneyPotRpcError(error)) {
    return recordWithTables(input);
  }

  throw error;
};

const fetchLedgerBalance = async (communityId: string) => {
  const { data, error } = await supabase
    .from('honey_pot_transactions')
    .select('amount')
    .eq('community_id', communityId);

  if (error) throw error;

  return (data ?? []).reduce((total, transaction) => {
    return total + Number(transaction.amount ?? 0);
  }, 0);
};

export const fetchHoneyPotBalance = async (communityId: string) => {
  // Nat, 2026-08-11: these two reads used to run one after the other even
  // though neither depends on the other's result — the stored balance and
  // the ledger sum are both checked on every single call, purely to compare
  // them for drift. Running them together halves the wait for the common
  // case (both succeed) without changing any of the fallback behaviour below.
  const [storedResult, ledgerResult] = await Promise.allSettled([
    supabase.from('honey_pot').select('balance').eq('community_id', communityId).maybeSingle(),
    fetchLedgerBalance(communityId),
  ]);

  if (storedResult.status === 'rejected' || storedResult.value.error) {
    if (ledgerResult.status === 'fulfilled') return ledgerResult.value;
    throw ledgerResult.reason;
  }

  const storedBalance = storedResult.value.data
    ? Number(storedResult.value.data.balance ?? 0)
    : null;

  if (ledgerResult.status === 'rejected') {
    if (storedBalance !== null) return storedBalance;
    throw ledgerResult.reason;
  }

  const ledgerBalance = ledgerResult.value;
  if (storedBalance === null || Math.abs(storedBalance - ledgerBalance) >= 0.005) {
    return ledgerBalance;
  }

  return storedBalance ?? 0;
};

const LEGACY_LEDGER_COLUMNS = [
  'id',
  'community_id',
  'amount',
  'transaction_type',
  'note',
  'recorded_by',
  'related_user_id',
  'dues_year',
  'dues_quarter',
  'dues_covered_quarters',
  'created_at',
].join(', ');

const TRANSPARENT_LEDGER_COLUMNS = `${LEGACY_LEDGER_COLUMNS}, payment_method, external_counterparty_name`;

const fetchHoneyPotTransactionRows = async (communityId: string): Promise<HoneyPotTransactionRow[]> => {
  const runQuery = (columns: string) => (supabase as any)
    .from('honey_pot_transactions')
    .select(columns)
    .eq('community_id', communityId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  const { data, error } = await runQuery(TRANSPARENT_LEDGER_COLUMNS);
  if (!error) return (data ?? []) as HoneyPotTransactionRow[];

  if (!isMissingPaymentColumnError(error)) throw error;

  const fallback = await runQuery(LEGACY_LEDGER_COLUMNS);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((row: HoneyPotTransactionRow) => ({
    ...row,
    payment_method: null,
    external_counterparty_name: null,
  }));
};

const fetchHoneyPotPeople = async (userIds: string[]) => {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, HoneyPotPerson>();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, avatar_url')
    .in('id', ids);

  if (error) {
    console.warn('Could not load Honey Pot profile names', error);
    return new Map<string, HoneyPotPerson>();
  }

  return new Map((data ?? []).map((person) => [person.id, person as HoneyPotPerson]));
};

export const fetchHoneyPotLedger = async (communityId: string): Promise<HoneyPotLedger> => {
  const rows = await fetchHoneyPotTransactionRows(communityId);
  const people = await fetchHoneyPotPeople(
    rows.flatMap((row) => [row.recorded_by, row.related_user_id]).filter(Boolean) as string[]
  );

  let runningBalance = 0;
  const chronological = rows.map((row) => {
    runningBalance += Number(row.amount ?? 0);
    return {
      ...row,
      amount: Number(row.amount ?? 0),
      running_balance: runningBalance,
      recorded_by_profile: row.recorded_by ? people.get(row.recorded_by) ?? null : null,
      related_user_profile: row.related_user_id ? people.get(row.related_user_id) ?? null : null,
    };
  });

  const balance = await fetchHoneyPotBalance(communityId).catch(() => runningBalance);

  return {
    balance,
    transactions: chronological.reverse(),
  };
};

export const formatHoneyPotAmount = (amount: number) => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : formatted;
};

export const getHoneyPotDuesLabel = (transaction: Pick<
  HoneyPotLedgerEntry,
  'dues_year' | 'dues_quarter' | 'dues_covered_quarters'
>) => {
  if (!transaction.dues_year || !transaction.dues_covered_quarters) return null;
  if (transaction.dues_covered_quarters >= 4) return `Full year ${transaction.dues_year}`;
  if (!transaction.dues_quarter) return `${transaction.dues_year} dues`;
  if (transaction.dues_covered_quarters > 1) {
    const endQuarter = Math.min(transaction.dues_quarter + transaction.dues_covered_quarters - 1, 4);
    return `Q${transaction.dues_quarter}–Q${endQuarter} ${transaction.dues_year}`;
  }
  return `Q${transaction.dues_quarter} ${transaction.dues_year}`;
};

export const describeHoneyPotTransaction = (transaction: HoneyPotLedgerEntry) => {
  const recorder = transaction.recorded_by_profile?.name ?? 'Someone';
  const amount = formatHoneyPotAmount(transaction.amount);
  const type = transaction.transaction_type === 'withdrawal' ? 'withdrawal' : 'deposit';
  const member = transaction.related_user_profile?.name ?? transaction.external_counterparty_name?.trim();
  const method = getPaymentMethodLabel(transaction.payment_method);
  const duesLabel = getHoneyPotDuesLabel(transaction);

  const pieces = [
    `${recorder} recorded a ${amount} ${type}`,
    member ? `${transaction.transaction_type === 'withdrawal' ? 'for' : 'from'} ${member}` : null,
    duesLabel ? `for ${duesLabel}` : null,
    method ? `via ${method}` : null,
  ].filter(Boolean);

  return `${pieces.join(' ')}.`;
};

export const getHoneyPotPaymentMethodLabel = getPaymentMethodLabel;

import { supabase } from './supabase';

export type HoneyPotTransactionType = 'deposit' | 'withdrawal';

export type RecordHoneyPotTransactionInput = {
  communityId: string;
  signedAmount: number;
  transactionType: HoneyPotTransactionType;
  note: string;
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

const recordWithTables = async ({
  communityId,
  signedAmount,
  transactionType,
  note,
  recordedBy,
  relatedUserId,
  duesYear,
  duesQuarter,
  duesCoveredQuarters,
  fallbackDuesLabel,
}: RecordHoneyPotTransactionInput): Promise<RecordHoneyPotTransactionResult> => {
  const trimmedNote = note.trim();
  const fallbackNote = [trimmedNote, fallbackDuesLabel ? `Dues: ${fallbackDuesLabel}` : null]
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
      recorded_by: recordedBy,
      related_user_id: relatedUserId,
      dues_year: duesYear,
      dues_quarter: duesQuarter,
      dues_covered_quarters: duesCoveredQuarters,
    });

  let savedStructuredDues = !!relatedUserId;
  if (structuredTransactionError) {
    if (!isMissingDuesColumnError(structuredTransactionError)) {
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
  const { data, error } = await supabase
    .from('honey_pot')
    .select('balance')
    .eq('community_id', communityId)
    .maybeSingle();

  if (error) {
    return fetchLedgerBalance(communityId);
  }

  const storedBalance = data ? Number(data.balance ?? 0) : null;

  try {
    const ledgerBalance = await fetchLedgerBalance(communityId);
    if (storedBalance === null || Math.abs(storedBalance - ledgerBalance) >= 0.005) {
      return ledgerBalance;
    }
  } catch (ledgerError) {
    if (storedBalance !== null) return storedBalance;
    throw ledgerError;
  }

  return storedBalance ?? 0;
};

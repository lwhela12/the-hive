import { reminderKey } from './checkInSession.ts';

/** One atomic claim owns BOTH channels. Never release an ambiguous delivery. */
export async function deliverCheckIn(
  admin: { from: (table: string) => any },
  userIds: string[], kind: string, day: string,
  send: (userId: string) => Promise<{ sent: boolean; reason?: string }>,
  notification: (userId: string, emailed: boolean) => Record<string, unknown>,
) {
  const results = await Promise.all([...new Set(userIds)].map(async userId => {
    const key = reminderKey(kind, userId, day);
    let claimError: { code?: string; message: string } | null = null;
    try {
      ({ error: claimError } = await admin.from('check_in_reminder_receipts')
        .insert({ dedupe_key: key, user_id: userId }));
    } catch (error) {
      claimError = { message: error instanceof Error ? error.message : String(error) };
    }
    if (claimError) return {
      claimed: false, emailed: false, notified: false, suppressed: false,
      claimLost: claimError.code === '23505', claimFailed: claimError.code !== '23505',
      deliveryFailed: false, receiptFailed: false, notificationFailed: false,
      reason: claimError.message,
    };
    let result: { sent: boolean; reason?: string };
    try { result = await send(userId); }
    catch (error) {
      result = { sent: false, reason: `Delivery failed or ambiguous: ${error instanceof Error ? error.message : String(error)}` };
    }
    const reason = result.sent ? null : result.reason ?? 'Delivery outcome unknown; owner review required';
    // Preserve what the mail helper actually reported, not a guessed preference.
    let receiptFailed = false;
    try {
      const { error } = await admin.from('check_in_reminder_receipts')
        .update({ sent: result.sent, reason }).eq('dedupe_key', key);
      receiptFailed = !!error;
      if (error) console.error('[open-check-in] receipt update:', error.message);
    } catch (error) { receiptFailed = true; console.error('[open-check-in] receipt update:', error); }
    let notified = false;
    try {
      const { error } = await admin.from('notifications').insert({
        ...notification(userId, result.sent),
        metadata: { ...(notification(userId, result.sent).metadata as Record<string, unknown> ?? {}), reminder_dedupe_key: key },
      });
      notified = !error;
      if (error) console.error('[open-check-in] notification insert:', error.message);
    } catch (error) { console.error('[open-check-in] notification insert:', error); }
    const suppressed = !result.sent && (reason === 'switched off, or no address' || reason === 'that HIVE is meeting');
    return { claimed: true, emailed: result.sent, notified, suppressed,
      claimLost: false, claimFailed: false, deliveryFailed: !result.sent && !suppressed,
      receiptFailed, notificationFailed: !notified, reason };
  }));
  const count = (field: keyof typeof results[number]) => results.filter(r => r[field] === true).length;
  return {
    claimed: count('claimed'), emailed: count('emailed'), notified: count('notified'),
    suppressed: count('suppressed'), delivery_failed: count('deliveryFailed'),
    claim_lost: count('claimLost'), claim_failed: count('claimFailed'),
    receipt_failed: count('receiptFailed'), notification_failed: count('notificationFailed'),
  };
}

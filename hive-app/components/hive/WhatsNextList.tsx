import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWhatsNext, type WhatsNextItem } from '../../lib/hooks/useWhatsNext';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, accentOnDark } from '../../lib/hiveBrand';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/**
 * What's next — one list, everyone, on whatever dark page asks for it.
 *
 * Nat, 2026-09-02, on why this is one component and not two: *"maybe my view is
 * different, cos I'm admin and actually need to MAKE some of those things, or
 * maybe we could have same view? Like it could say 'end of month survey goes
 * out' and if I'm a regular person I know I need to do it, and if I'm me, I know
 * I need to make it."*
 *
 * That is exactly how it works. The ROW is a fact and the fact is the same for
 * everybody; what you can do about it depends on who you are. Rows only Nat can
 * act on come back only for Nat, because the queries behind them are hers — a
 * member's `useWhatsNext` simply finds no held sends. Nobody is shown a door
 * they cannot open, and nobody needs a second component.
 *
 * It was born inside HIVE-Wide Admin and lived there for an hour, which was a
 * mistake worth naming: the two boxes it replaced on HIVE-Wide Home came out
 * the same evening, so members lost their upcoming events entirely and got
 * nothing back. Nat, immediately: *"wait, we lost all the calendar/upcoming
 * events from the HIVE-Wide home page?"* A replacement that only the owner can
 * see is not a replacement.
 */
export function WhatsNextList({
  emptyLine = 'Nothing booked and nothing waiting. When a HIVE you’re in schedules its next meeting, it turns up here.',
}: {
  emptyLine?: string;
}) {
  const router = useRouter();
  const { memberships } = useAuth();
  const { items, state, today, refresh } = useWhatsNext();
  /** The check-in being sent, once its live count has come back. */
  const [sending, setSending] = useState<
    { surveyId: string; name: string; waiting: number; hiveName: string } | null
  >(null);

  /**
   * Press "Send it" and this asks the sender how many, before asking her.
   *
   * The dry run is the same function that does the sending, reading the same
   * eligibility rules. The count is provisional; concurrent claims and member
   * preferences are resolved at delivery time. It also
   * comes back saying whether that HIVE is mid-meeting, which is the one time
   * nothing may go out at all.
   */
  const offerToSend = async (openable: NonNullable<WhatsNextItem['openable']>) => {
    const { data, error } = await supabase.functions.invoke('open-check-in', {
      body: { survey_id: openable.surveyId, dry_run: true },
    });
    if (error || !data) {
      showAlert('That did not go through', 'The check-in could not be counted just now. Try again in a moment.');
      return;
    }
    if (data.meeting_now) {
      showAlert('Not during the meeting', `${data.hive} is meeting right now. Nothing goes out during one.`);
      return;
    }
    if (!data.would_reach) {
      showAlert('Nobody to remind now', data.already_claimed
        ? `${data.already_claimed} reminder slots are already claimed today. This does not mean everybody has answered.`
        : `Nobody is left to nudge about ${data.check_in}.`);
      return;
    }
    setSending({
      surveyId: openable.surveyId,
      name: data.check_in,
      waiting: data.would_reach,
      hiveName: data.hive,
    });
  };

  const reallySend = async () => {
    const asked = sending;
    setSending(null);
    if (!asked) return;
    const { data, error } = await supabase.functions.invoke('open-check-in', {
      body: { survey_id: asked.surveyId },
    });
    if (error || !data) {
      showAlert('That did not go through', 'The delivery result could not be confirmed. Some reminders may have gone out; check delivery records before retrying.');
      return;
    }
    const details = [
      `${data.emailed ?? 0} emails sent; ${data.notified ?? 0} in-app reminders created.`,
      data.suppressed ? `${data.suppressed} emails skipped by preferences, missing address, or meeting quiet time.` : '',
      data.delivery_failed ? `${data.delivery_failed} email deliveries failed or are unconfirmed. Owner review required.` : '',
      data.claim_lost || data.already_claimed ? `${(data.claim_lost ?? 0) + (data.already_claimed ?? 0)} reminder slots were already claimed; not sent again.` : '',
      data.claim_failed ? `${data.claim_failed} reminder claims failed; nothing sent for those recipients.` : '',
      data.notification_failed ? `${data.notification_failed} in-app reminders could not be saved.` : '',
      data.receipt_failed ? `${data.receipt_failed} delivery records could not be updated. Review before retrying.` : '',
    ].filter(Boolean).join(' ');
    showAlert(`${asked.name}: delivery results`, details);
    void refresh();
  };

  if (state === 'loading') {
    return (
      <View style={{ paddingVertical: 22, alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#e8c583" />
      </View>
    );
  }

  if (state === 'error') {
    // An empty list reads as a clear diary. That is the one thing this may not
    // claim when it does not know.
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ffb4a8', lineHeight: 19 }}>
          This did not load, so it is not telling you the diary is clear.
        </Text>
        {/* It used to say "pull down to try again", and pulling down did
            nothing — the page's refresh never reached this hook. A button that
            works beats an instruction that does not. */}
        <Pressable onPress={() => void refresh()} accessibilityRole="button">
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#e8c583' }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 14, lineHeight: 21, color: 'rgba(255,248,233,0.72)' }}>
        {emptyLine}
      </Text>
    );
  }

  return (
    <View>
      {/**
        * SAYING HOW MANY, BEFORE IT SENDS.
        *
        * Nat, 2026-09-04, on the whole streamlining idea: the point is fewer
        * steps, not fewer brakes. This is the one brake left, and it is one
        * line rather than a screen — the risk was never that she sends
        * something wrong, it is that a tag turns out to have been a broadcast.
        *
        * The number in the question is NOT the number the row was drawn with.
        * A panel opened twenty minutes ago has a stale count, and a confirm
        * that names a stale number is worse than no number at all. Pressing
        * asks `open-check-in` for a dry run first — the same two lists the
        * send itself uses — and puts THAT answer in the question.
        */}
      <ConfirmDialog
        visible={!!sending}
        title={sending ? `Send ${sending.name}?` : ''}
        body={sending
          ? `${sending.waiting} ${sending.waiting === 1 ? 'person' : 'people'} in ${sending.hiveName} `
            + 'will be checked for delivery. Each successful reminder claim can create one email and one in-app reminder. '
            + 'Anybody who has turned this email off does not.'
          : undefined}
        confirmLabel={sending ? `Send to ${sending.waiting}` : 'Send'}
        cancelLabel="Not yet"
        onConfirm={() => { void reallySend(); }}
        onCancel={() => setSending(null)}
      />
      {items.map((item, index) => (
        <WhatsNextRow
          key={item.key}
          item={item}
          today={today}
          first={index === 0}
          accent={
            item.communityId
              ? accentOnDark(hiveAccent(memberships.find((m) => m.community_id === item.communityId)?.community))
              : 'transparent'
          }
          /**
           * A held send opens the approve screen; a check-in of your own opens
           * the HIVE it lives in, where the survey card is.
           *
           * Without the second branch the ONE row a member can act on was flat
           * text with nowhere to tap — and tomorrow that is five Tech members
           * who have not answered before their first meeting.
           */
          onPress={
            item.openable
              ? () => { void offerToSend(item.openable!); }
              : item.holdId
              ? () => router.push(`/approve/${item.holdId}` as never)
              : item.key.startsWith('survey_')
                ? () => router.push(
                    item.communityId
                      // Naming a HIVE is how you ask to be IN it.
                      ? `/hive?hive=${item.communityId}` as never
                      // A check-in belonging to no HIVE has its own door.
                      : '/endofmonth' as never
                  )
                : undefined
          }
        />
      ))}
    </View>
  );
}

export function WhatsNextRow({
  item, today, first, accent, onPress,
}: {
  item: WhatsNextItem;
  today: string;
  first: boolean;
  accent: string;
  onPress?: () => void;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: 'rgba(246,244,229,0.12)',
        backgroundColor: item.overdue ? 'rgba(192,57,43,0.14)' : undefined,
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_700Bold',
          fontSize: 11,
          lineHeight: 15,
          width: 74,
          color: item.overdue ? '#ffb4a8' : item.date === today ? '#e8c583' : 'rgba(246,244,229,0.55)',
        }}
      >
        {said(item.date, today)}
      </Text>
      <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: accent }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, lineHeight: 19, color: '#F6F4E5' }}>
          {item.what}
        </Text>
        {item.detail ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: 'rgba(246,244,229,0.6)', marginTop: 2 }}>
            {item.detail}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={15} color="rgba(246,244,229,0.6)" /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.what}. Open it to read it and send it.`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** How far away, the way a person says it. "3 days late" beats a date nobody counts from. */
export function said(dateOnly: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${dateOnly}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return '1 day late';
  if (days < 0) return `${-days} days late`;
  const [y, m, d] = dateOnly.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
}

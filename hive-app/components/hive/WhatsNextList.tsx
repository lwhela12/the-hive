import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWhatsNext, type WhatsNextItem } from '../../lib/hooks/useWhatsNext';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, accentOnDark } from '../../lib/hiveBrand';

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
  const { items, state, today } = useWhatsNext();

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
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ffb4a8', lineHeight: 19 }}>
        This did not load, so it is not telling you the diary is clear. Pull down to try again.
      </Text>
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
          onPress={item.holdId ? () => router.push(`/approve/${item.holdId}` as never) : undefined}
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

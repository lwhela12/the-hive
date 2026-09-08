import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWhatsNext, type WhatsNextItem, type WhatsNextView } from '../../lib/hooks/useWhatsNext';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveTagMark } from '../../lib/hiveBrand';
import { whatsNextDateLabel } from '../../lib/whatsNextFormat';


/**
 * Upcoming Events on Home, and the broader operating list in Admin.
 *
 * Nat, 2026-09-02, on why this is one component and not two: *"maybe my view is
 * different, cos I'm admin and actually need to MAKE some of those things, or
 * maybe we could have same view? Like it could say 'end of month survey goes
 * out' and if I'm a regular person I know I need to do it, and if I'm me, I know
 * I need to make it."*
 *
 * The row is a fact and the fact is the same for everybody. Check-in delivery
 * approval lives in its own preview screen; this list never becomes a second,
 * contradictory send door.
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
  view = 'admin',
}: {
  emptyLine?: string;
  view?: WhatsNextView;
}) {
  const router = useRouter();
  const { memberships } = useAuth();
  const { items, state, today, refresh } = useWhatsNext(view);

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
      {items.map((item, index) => (
        <WhatsNextRow
          key={item.key}
          item={item}
          today={today}
          first={index === 0}
          accent={
            item.communityId
              ? hiveTagMark(memberships.find((m) => m.community_id === item.communityId)?.community)
              : 'transparent'
          }
          onPress={
            item.key.startsWith('survey_')
                ? () => router.push((item.destination ?? (item.communityId ? '/meetings' : '/endofmonth')) as never)
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
        {whatsNextDateLabel(item.date, today, item.endDate)}
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

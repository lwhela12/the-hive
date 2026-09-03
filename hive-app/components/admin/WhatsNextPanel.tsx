import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWhatsNext, type WhatsNextItem } from '../../lib/hooks/useWhatsNext';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent } from '../../lib/hiveBrand';

/**
 * What's next — every HIVE, in date order, at the top of HIVE-Wide Admin.
 *
 * Nat, 2026-09-02: *"this is what I've been missing... what's next is exactly
 * what I was talking about needing. Can we just fold that into the HIVE app,
 * somewhere in HIVE-Wide admin?"*
 *
 * It replaces two things that died of the same disease. Her Google Tasks got
 * messy; the HIVE Task Tracker sheet has not moved since 15 August. Both had to
 * be fed. **Nothing here is fed** — every line is worked out from the meeting
 * rows, the open check-ins and the held sends each time the panel opens.
 *
 * And nothing falls off it. Her calendar loses a job the day after it was due:
 * *"if it's in my calendar that I need to send something out on the first and
 * then I don't get to it on the first, then on the second I don't see it any
 * more."* Here, a row past its date turns red and climbs.
 */

const LATE = '#c0392b';

export function WhatsNextPanel({
  panelStyle,
  bodyStyle,
  Panel,
}: {
  panelStyle: any;
  bodyStyle: any;
  Panel: React.ComponentType<any>;
}) {
  const router = useRouter();
  const { memberships } = useAuth();
  const { items, state, today } = useWhatsNext();

  const waiting = items.filter((item) => item.holdId).length;

  return (
    <Panel
      title={waiting > 0 ? `What's next · ${waiting} waiting on you` : "What's next"}
      style={panelStyle}
    >
      <View style={bodyStyle}>
        {state === 'loading' ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#fffdf5" />
          </View>
        ) : state === 'error' ? (
          // An empty list here would read as a clear diary, which is the one
          // thing it must never say when it does not know.
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ffb4a8', padding: 14, lineHeight: 19 }}>
            This did not load, so it is not telling you the diary is clear. Pull down to try again.
          </Text>
        ) : items.length === 0 ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: 'rgba(246,244,229,0.6)', padding: 14 }}>
            Nothing booked and nothing waiting. Schedule a meeting and this fills itself in.
          </Text>
        ) : (
          items.map((item, index) => (
            <Row
              key={item.key}
              item={item}
              today={today}
              first={index === 0}
              accent={
                item.communityId
                  ? hiveAccent(memberships.find((m) => m.community_id === item.communityId)?.community)
                  : 'transparent'
              }
              onPress={item.holdId ? () => router.push(`/approve/${item.holdId}` as never) : undefined}
            />
          ))
        )}
      </View>
    </Panel>
  );
}

function Row({
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
        paddingHorizontal: 14,
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
      <View
        style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: accent }}
      />
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
function said(dateOnly: string, today: string): string {
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

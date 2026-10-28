import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getArrivalGroups, type ArrivalBoardMember, type MeetingAttendanceReport } from '../../lib/hooks/useArrivalBoard';
import type { SurveyResponse } from '../../lib/hooks/useSurveys';
import { ArrivalMemberCard } from './ArrivalMemberCard';

/** The same attendance overview on the meeting deck and the Arrival Board. */
export function ArrivalAttendanceGroups({ members, responsesByUser, reportsByUser, columns, isTV, compact = false, showLegacyEnergy = false, onAdminPress }: {
  members: ArrivalBoardMember[];
  responsesByUser: Map<string, SurveyResponse>;
  reportsByUser: Map<string, MeetingAttendanceReport>;
  columns: number;
  isTV: boolean;
  compact?: boolean;
  showLegacyEnergy?: boolean;
  onAdminPress?: (memberId: string) => void;
}) {
  const groups = getArrivalGroups(members, responsesByUser, reportsByUser);
  return <View style={{ gap: isTV ? 24 : 18 }}>
    <View accessibilityLabel="Attendance totals" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {groups.filter(group => group.status !== 'unconfirmed' || group.members.length > 0).map(group => (
        <View key={group.status} testID={`arrival-total-${group.status}`} style={{ flexBasis: 130, flexGrow: 1, borderRadius: 12, borderWidth: 1, borderColor: group.border, backgroundColor: group.wash, padding: 12, gap: 3 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isTV ? 26 : 22, color: group.ink }}>{group.members.length}</Text>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: isTV ? 16 : 13, color: group.ink }}>{group.label}</Text>
        </View>
      ))}
    </View>
    {groups.filter(group => group.members.length > 0).map(group => (
      <View key={group.status} testID={`arrival-group-${group.status}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 9, borderBottomWidth: 2, borderBottomColor: group.border, marginBottom: 6 }}>
          <Ionicons name={group.icon} size={isTV ? 22 : 19} color={group.ink} />
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: 'Lato_700Bold', fontSize: isTV ? 22 : 17, color: group.ink }}>{group.label} · {group.members.length}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
          {group.members.map(member => <View key={member.id} style={{ width: `${100 / columns}%`, padding: 5 }}>
            <ArrivalMemberCard member={member} response={responsesByUser.get(member.id)} report={reportsByUser.get(member.id)}
              onAdminPress={onAdminPress ? () => onAdminPress(member.id) : undefined}
              isTV={isTV} compact={compact} showLegacyEnergy={showLegacyEnergy} />
          </View>)}
        </View>
      </View>
    ))}
  </View>;
}

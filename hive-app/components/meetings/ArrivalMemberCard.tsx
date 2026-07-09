import { Text, View } from 'react-native';
import { Avatar } from '../ui/Avatar';
import {
  getEnergyDots,
  getFirstName,
  getNumberAnswer,
  getTextAnswer,
  type ArrivalBoardMember,
} from '../../lib/hooks/useArrivalBoard';
import type { SurveyResponse } from '../../lib/hooks/useSurveys';

/**
 * One member's arrival card — name for today, feeling, note, and energy.
 * Rendered by both the Arrival Board screen and the Meeting Helper deck.
 * `isTV` bumps every size for the 1920×1080 dining-room TV.
 */
export function ArrivalMemberCard({
  member,
  response,
  isTV,
  compact = false,
}: {
  member: ArrivalBoardMember;
  response?: SurveyResponse;
  isTV: boolean;
  compact?: boolean;
}) {
  const answers = response?.answers ?? {};
  const checkedIn = !!response;
  const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
  const feeling = getTextAnswer(answers, 'q_feeling_today');
  const feelingNote = getTextAnswer(answers, 'q_feeling_note');
  const energyLevel = getNumberAnswer(answers, 'q_energy_level');
  const energyMode = getTextAnswer(answers, 'q_energy_mode');
  const energyDots = energyLevel !== null ? getEnergyDots(energyLevel) : null;
  const scale = compact ? 0.78 : 1;

  return (
    <View
      style={{
        backgroundColor: checkedIn ? '#fffdf5' : 'rgba(255,253,245,0.55)',
        borderRadius: isTV ? 26 * scale : 18,
        borderWidth: 1,
        borderColor: checkedIn ? 'rgba(222,193,129,0.65)' : 'rgba(222,193,129,0.28)',
        paddingVertical: (isTV ? 26 : 18) * scale,
        paddingHorizontal: (isTV ? 18 : 14) * scale,
        alignItems: 'center',
        minHeight: (isTV ? 340 : 220) * scale,
        opacity: checkedIn ? 1 : 0.55,
        shadowColor: '#bd9348',
        shadowOpacity: checkedIn ? 0.12 : 0,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      <Avatar name={member.name} url={member.avatar_url} size={(isTV ? 88 : 56) * scale} />
      <Text
        numberOfLines={2}
        style={{
          fontFamily: 'LibreBaskerville_700Bold',
          fontSize: (isTV ? 34 : 22) * scale,
          lineHeight: (isTV ? 42 : 28) * scale,
          color: '#2d2d2d',
          textAlign: 'center',
          marginTop: (isTV ? 14 : 10) * scale,
        }}
      >
        {nameToday}
      </Text>

      {checkedIn ? (
        <>
          {feeling ? (
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: (isTV ? 20 : 15) * scale,
                lineHeight: (isTV ? 27 : 21) * scale,
                color: '#8a6b30',
                textAlign: 'center',
                marginTop: (isTV ? 12 : 8) * scale,
              }}
            >
              {feeling}
            </Text>
          ) : null}
          {feelingNote ? (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontStyle: 'italic',
                fontSize: (isTV ? 16 : 12) * scale,
                lineHeight: (isTV ? 22 : 17) * scale,
                color: '#9a8060',
                textAlign: 'center',
                marginTop: (isTV ? 8 : 6) * scale,
              }}
            >
              "{feelingNote}"
            </Text>
          ) : null}
          {energyDots !== null || energyMode ? (
            <View style={{ alignItems: 'center', marginTop: 'auto', paddingTop: (isTV ? 14 : 10) * scale }}>
              {energyDots !== null ? (
                <View style={{ flexDirection: 'row', gap: isTV ? 4 : 2 }}>
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <Text
                      key={dot}
                      style={{ fontSize: (isTV ? 18 : 13) * scale, opacity: dot <= energyDots ? 1 : 0.2 }}
                    >
                      ⚡
                    </Text>
                  ))}
                </View>
              ) : null}
              {energyMode ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: (isTV ? 14 : 11) * scale,
                    color: '#9a8060',
                    marginTop: 4,
                  }}
                >
                  {energyMode}
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: (isTV ? 17 : 13) * scale,
            color: '#9a8060',
            textAlign: 'center',
            marginTop: (isTV ? 14 : 10) * scale,
          }}
        >
          hasn't checked in yet 🌙
        </Text>
      )}
    </View>
  );
}

import { personalHardOut } from '../../lib/personalHardOut';
import { Text, View } from 'react-native';
import { Avatar } from '../ui/Avatar';
import {
  ENERGY_DOTS_MAX,
  getAttendance,
  getEnergyDots,
  getFirstName,
  getNumberAnswer,
  getTextAnswer,
  type ArrivalBoardMember,
} from '../../lib/hooks/useArrivalBoard';
import type { SurveyResponse } from '../../lib/hooks/useSurveys';

function plateAtAGlance(answer: string) {
  if (/plenty of room/i.test(answer)) return '🍽️ Plenty of room';
  if (/a bit on there/i.test(answer)) return '🥄 Room for this';
  if (/pretty full/i.test(answer)) return '🍲 One small thing';
  if (/full to the brim/i.test(answer)) return '🫙 Listening today';
  return answer;
}

function attendanceAtAGlance(attendance: ReturnType<typeof getAttendance>) {
  if (attendance === 'in_person') return '🐝 In person';
  if (attendance === 'remote') return '💻 Remote';
  if (attendance === 'missing') return '😢 Missing';
  return '';
}

function ArrivalFact({
  label,
  value,
  isTV,
  scale,
  danger = false,
}: {
  label: string;
  value: string;
  isTV: boolean;
  scale: number;
  danger?: boolean;
}) {
  return (
    <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: (isTV ? 10 : 7) * scale }}>
      <Text
        style={{
          width: (isTV ? 78 : 58) * scale,
          fontFamily: 'Lato_700Bold',
          fontSize: Math.max(9, (isTV ? 10 : 9) * scale),
          lineHeight: Math.max(14, (isTV ? 18 : 15) * scale),
          letterSpacing: (isTV ? 1.2 : 0.9) * scale,
          color: danger ? '#b3261e' : '#9a8060',
          textAlign: 'right',
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          flex: 1,
          fontFamily: 'Lato_700Bold',
          fontSize: Math.max(11, (isTV ? 15 : 12) * scale),
          lineHeight: Math.max(15, (isTV ? 20 : 17) * scale),
          color: danger ? '#b3261e' : '#5f4b27',
          textAlign: 'left',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

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
  showLegacyEnergy = false,
}: {
  member: ArrivalBoardMember;
  response?: SurveyResponse;
  isTV: boolean;
  compact?: boolean;
  showLegacyEnergy?: boolean;
}) {
  const answers = response?.answers ?? {};
  const checkedIn = !!response;
  const nameToday = getTextAnswer(answers, 'q_name_today') || getFirstName(member.name);
  const feeling = getTextAnswer(answers, 'q_feeling_today');
  const feelingNote = getTextAnswer(answers, 'q_feeling_note');
  const energyLevel = showLegacyEnergy ? getNumberAnswer(answers, 'q_energy_level') : null;
  const energyMode = showLegacyEnergy ? getTextAnswer(answers, 'q_energy_mode') : '';
  const plate = getTextAnswer(answers, 'q_plate');
  const hardOut = personalHardOut(answers.q_hard_out).label;
  const attendance = getAttendance(response);
  const attendanceLabel = attendanceAtAGlance(attendance);
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
        /**
         * A card holds what it holds.
         *
         * Every card reserved the height of a FULL one — name for today,
         * feeling, note, energy dots, hard-out — whether or not any of that had
         * been written. Before a meeting almost none of it has, so eleven cards
         * saying "hasn't checked in yet 🌙" each stood as tall as a card with
         * five lines in it, and on a phone that is a screen apiece (Nat,
         * 2026-08-17). Somebody who has checked in still gets the full frame,
         * so the board stays a grid rather than a ragged pile.
         */
        minHeight: (isTV ? (checkedIn ? 340 : 210) : checkedIn ? 220 : 132) * scale,
        opacity: checkedIn ? 1 : 0.55,
        shadowColor: '#bd9348',
        shadowOpacity: checkedIn ? 0.12 : 0,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      <Avatar name={member.name} url={member.avatar_url} size={(isTV ? 88 : 56) * scale} />
      {/* One line, shrinking to fit rather than breaking. "Charlee" came out
          as "Charl / ee" on Nat's screen (2026-08-14) — a name split across
          two lines mid-word reads as a bug, and it was: the card is a fixed
          width and the type was not allowed to give. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{
          fontFamily: 'LibreBaskerville_700Bold',
          fontSize: (isTV ? 30 : 21) * scale,
          lineHeight: (isTV ? 38 : 27) * scale,
          color: '#2d2d2d',
          textAlign: 'center',
          marginTop: (isTV ? 12 : 9) * scale,
        }}
      >
        {nameToday}
      </Text>

      {checkedIn ? (
        <>
          {feeling ? (
            <View style={{ alignItems: 'center', marginTop: (isTV ? 12 : 8) * scale }}>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: Math.max(9, (isTV ? 10 : 9) * scale),
                  lineHeight: Math.max(14, (isTV ? 16 : 14) * scale),
                  letterSpacing: (isTV ? 1.4 : 1) * scale,
                  color: '#9a8060',
                }}
              >
                FEELING
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  fontSize: (isTV ? 20 : 15) * scale,
                  lineHeight: (isTV ? 27 : 21) * scale,
                  color: '#8a6b30',
                  textAlign: 'center',
                  marginTop: 2 * scale,
                }}
              >
                {feeling}
              </Text>
            </View>
          ) : null}
          {feelingNote || attendanceLabel || hardOut || plate ? (
            <View
              style={{
                width: '100%',
                gap: (isTV ? 5 : 4) * scale,
                marginTop: (isTV ? 12 : 9) * scale,
                paddingTop: (isTV ? 10 : 8) * scale,
                borderTopWidth: 1,
                borderTopColor: 'rgba(222,193,129,0.45)',
              }}
            >
              {feelingNote ? <ArrivalFact label="Note" value={`“${feelingNote}”`} isTV={isTV} scale={scale} /> : null}
              {attendanceLabel ? <ArrivalFact label="Attending" value={attendanceLabel} isTV={isTV} scale={scale} /> : null}
              {hardOut ? <ArrivalFact label="Leaving" value={`⏰ ${hardOut}`} isTV={isTV} scale={scale} danger /> : null}
              {plate ? <ArrivalFact label="Capacity" value={plateAtAGlance(plate)} isTV={isTV} scale={scale} /> : null}
            </View>
          ) : null}
          {energyDots !== null || energyMode ? (
            <View style={{ alignItems: 'center', marginTop: 'auto', paddingTop: (isTV ? 14 : 10) * scale }}>
              {energyDots !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: isTV ? 2 : 1 }}>
                  {Array.from({ length: ENERGY_DOTS_MAX }, (_, index) => index + 1).map((dot) => (
                    <Text
                      key={dot}
                      style={{ fontSize: (isTV ? 15 : 11) * scale, opacity: dot <= energyDots ? 1 : 0.18 }}
                    >
                      ⚡
                    </Text>
                  ))}
                  <Text
                    style={{
                      fontFamily: 'Lato_700Bold',
                      fontSize: (isTV ? 14 : 11) * scale,
                      color: '#8a6b30',
                      marginLeft: isTV ? 6 : 4,
                    }}
                  >
                    {energyDots}/{ENERGY_DOTS_MAX}
                  </Text>
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

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { formatMeetingDate, type ArrivalBoardMeeting, type ArrivalBoardMember, type MeetingAttendanceReport } from '../../lib/hooks/useArrivalBoard';

const choices = [
  { value: 'in_person', label: 'In person' },
  { value: 'remote', label: 'Remote' },
  { value: 'missing', label: 'Not coming' },
] as const;

export function AdminMemberUpdate({ members, meeting, reportsByUser, onSaved, openForMemberId, onOpenForMemberHandled, compact = false }: {
  members: ArrivalBoardMember[];
  meeting: ArrivalBoardMeeting | null;
  reportsByUser: Map<string, MeetingAttendanceReport>;
  onSaved: () => Promise<void>;
  openForMemberId?: string | null;
  onOpenForMemberHandled?: () => void;
  compact?: boolean;
}) {
  const { communityId, communityRole, profile, session } = useAuth();
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [attendance, setAttendance] = useState<'in_person' | 'remote' | 'missing' | null>(null);
  const [hdWish, setHdWish] = useState('');
  const [helpIdea, setHelpIdea] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The tile and the top button open this same form. A tile supplies the
  // member first; clearing the request lets the same tile open it again later.
  useEffect(() => {
    if (!openForMemberId || !members.some((member) => member.id === openForMemberId)) return;
    const report = reportsByUser.get(openForMemberId);
    setMemberId(openForMemberId);
    setAttendance(report?.attendance ?? null);
    setHdWish(report?.hd_wish ?? '');
    setHelpIdea(report?.help_idea ?? '');
    setError('');
    setOpen(true);
    onOpenForMemberHandled?.();
  }, [openForMemberId]);

  if (!isAdmin || !meeting || !communityId) return null;

  const selectMember = (id: string) => {
    const report = reportsByUser.get(id);
    setMemberId(id);
    setAttendance(report?.attendance ?? null);
    setHdWish(report?.hd_wish ?? '');
    setHelpIdea(report?.help_idea ?? '');
    setError('');
  };

  const save = async () => {
    if (!memberId || !session?.user?.id || !communityId || !meeting) return;
    if (!attendance && !hdWish.trim() && !helpIdea.trim()) {
      setError('Choose attendance or add something they shared.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.from('meeting_attendance_reports').upsert({
      meeting_id: meeting.id,
      community_id: communityId,
      user_id: memberId,
      attendance,
      hd_wish: hdWish.trim(),
      help_idea: helpIdea.trim(),
      reported_by: session.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meeting_id,user_id' });
    if (saveError) {
      setError('Could not save this update. Please try again.');
    } else {
      await onSaved();
      setOpen(false);
    }
    setSaving(false);
  };

  const clear = async () => {
    if (!memberId || !meeting) return;
    setSaving(true);
    setError('');
    const { error: clearError } = await supabase.from('meeting_attendance_reports')
      .delete().eq('meeting_id', meeting.id).eq('user_id', memberId);
    if (clearError) setError('Could not clear this update. Please try again.');
    else {
      await onSaved();
      setOpen(false);
    }
    setSaving(false);
  };

  const selectedName = members.find((member) => member.id === memberId)?.name;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => { setMemberId(''); setAttendance(null); setHdWish(''); setHelpIdea(''); setError(''); setOpen(true); }}
        style={{ alignSelf: 'flex-start', paddingHorizontal: compact ? 11 : 15, paddingVertical: compact ? 7 : 10, borderRadius: 999, borderWidth: 1, borderColor: '#b58b42', backgroundColor: '#fffdf5' }}
      >
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: compact ? 12 : 14, color: '#765b31' }}>Record member update</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(40,32,19,0.52)', justifyContent: 'center', padding: 16 }}>
          <View style={{ alignSelf: 'center', width: '100%', maxWidth: 510, maxHeight: '92%', borderRadius: 20, backgroundColor: '#fffdf5', padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <Text style={{ flex: 1, fontFamily: 'LibreBaskerville_700Bold', fontSize: 21, color: '#2d2d2d' }}>Member update</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(false)}><Text style={{ fontSize: 25, color: '#765b31' }}>×</Text></Pressable>
            </View>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#765b31', marginTop: 6 }}>For {meeting.title} · {formatMeetingDate(meeting)}</Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 3 }}>Saved as reported by an admin</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', marginBottom: 8 }}>Member</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {members.map((member) => (
                  <Pressable key={member.id} accessibilityRole="button" onPress={() => selectMember(member.id)} style={{ borderRadius: 999, borderWidth: 1, borderColor: memberId === member.id ? '#8a6b30' : '#dfcda8', backgroundColor: memberId === member.id ? '#f6e9ca' : '#fff', paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', color: '#624923' }}>{member.name}</Text>
                  </Pressable>
                ))}
              </View>
              {selectedName ? (
                <View style={{ marginTop: 18, gap: 13 }}>
                  <View>
                    <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', marginBottom: 8 }}>Attendance</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                      {choices.map((choice) => (
                        <Pressable key={choice.value} accessibilityRole="button" onPress={() => setAttendance(choice.value)} style={{ borderRadius: 10, borderWidth: 1, borderColor: attendance === choice.value ? '#8a6b30' : '#dfcda8', backgroundColor: attendance === choice.value ? '#f6e9ca' : '#fff', paddingHorizontal: 12, paddingVertical: 9 }}>
                          <Text style={{ fontFamily: 'Lato_700Bold', color: '#624923' }}>{choice.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View>
                    <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', marginBottom: 6 }}>HummDinger wish</Text>
                    <TextInput value={hdWish} onChangeText={setHdWish} placeholder="What do they want the room to help with?" multiline style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfcda8', borderRadius: 10, padding: 11, minHeight: 58, color: '#2d2d2d', textAlignVertical: 'top' }} />
                  </View>
                  <View>
                    <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', marginBottom: 6 }}>HIVE Help idea</Text>
                    <TextInput value={helpIdea} onChangeText={setHelpIdea} placeholder="An idea they shared for HIVE Help" multiline style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfcda8', borderRadius: 10, padding: 11, minHeight: 58, color: '#2d2d2d', textAlignVertical: 'top' }} />
                  </View>
                </View>
              ) : null}
            </ScrollView>
            {error ? <Text style={{ color: '#a33b2e', marginTop: 10 }}>{error}</Text> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 8 }}>
              {reportsByUser.has(memberId) ? <Pressable disabled={saving} onPress={() => void clear()}><Text style={{ fontFamily: 'Lato_700Bold', color: '#925740' }}>Clear update</Text></Pressable> : <View />}
              <Pressable disabled={saving || !memberId} onPress={() => void save()} style={{ backgroundColor: '#8a6b30', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, opacity: saving || !memberId ? 0.5 : 1 }}><Text style={{ fontFamily: 'Lato_700Bold', color: '#fff' }}>{saving ? 'Saving…' : 'Save update'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

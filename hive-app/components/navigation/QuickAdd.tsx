import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, type HiveMembership } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { parseAmericanDate } from '../../lib/dateUtils';
import { createCalendarEvent } from '../../lib/eventMutations';
import { ComposerBar } from '../ui/ComposerBar';
import { Input } from '../ui/Input';
import { EventDatePicker } from '../ui/DatePicker';

const INK = '#313130';
const GOLD = '#bd9348';
const QUIET = '#756b5d';
const BORDER = 'rgba(189,147,72,0.28)';

type Destination = 'meeting' | 'news' | 'unavailable' | null;
type MeetingHelperNotes = Record<string, unknown> & { news?: string };

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function americanDate(date = new Date()) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${date.getFullYear()}`;
}

function defaultNewsDate() {
  return localIsoDate();
}

function isRealIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function mayManageHive(membership: HiveMembership) {
  return membership.role === 'admin' || membership.role === 'treasurer';
}

export function QuickAdd({
  visible,
  onClose,
  onSaved,
  initialDestination = null,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialDestination?: Destination;
}) {
  const { profile, communityId, communityRole, wholeHive, memberships } = useAuth();
  const isOwner = profile?.is_owner === true;
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const canQuickAdd = isOwner || isAdmin;
  const manageableHives = useMemo(
    () => memberships.filter((membership) => isOwner || mayManageHive(membership)),
    [isOwner, memberships],
  );

  const [destination, setDestination] = useState<Destination>(null);
  const [targetHiveId, setTargetHiveId] = useState<string | null>(null);
  const [meetingThought, setMeetingThought] = useState('');
  const [newsDate, setNewsDate] = useState(defaultNewsDate);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsDetail, setNewsDetail] = useState('');
  const [unavailableStart, setUnavailableStart] = useState(americanDate);
  const [unavailableEnd, setUnavailableEnd] = useState(americanDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDestination(initialDestination === 'news' && !isOwner ? null : initialDestination);
    setTargetHiveId(wholeHive ? null : communityId ?? null);
    setMeetingThought('');
    setNewsDate(defaultNewsDate());
    setNewsTitle('');
    setNewsDetail('');
    setUnavailableStart(americanDate());
    setUnavailableEnd(americanDate());
    setSaving(false);
    setError(null);
  }, [communityId, initialDestination, isOwner, visible, wholeHive]);

  if (!canQuickAdd || !profile) return null;

  const finish = () => {
    setSaving(false);
    onClose();
    onSaved?.();
  };

  const requireTargetHive = () => {
    if (targetHiveId) return targetHiveId;
    setError('Choose which HIVE this belongs to.');
    return null;
  };

  const save = async () => {
    if (saving || !destination) return;
    setError(null);

    if (destination === 'meeting') {
      const target = requireTargetHive();
      const thought = meetingThought.trim();
      if (!target) return;
      if (!thought) {
        setError('Write the thought you want to bring up.');
        return;
      }

      setSaving(true);
      const { data, error: readError } = await supabase
        .from('communities')
        .select('meeting_helper_notes')
        .eq('id', target)
        .single();
      if (readError) {
        setSaving(false);
        setError('That did not save. Check your connection and try again.');
        return;
      }

      const existing = ((data as { meeting_helper_notes?: MeetingHelperNotes | null } | null)?.meeting_helper_notes ?? {});
      const currentNews = typeof existing.news === 'string' ? existing.news.trim() : '';
      const nextNews = currentNews ? `${currentNews}\n\n• ${thought}` : `• ${thought}`;
      const { error: writeError } = await (supabase.from('communities') as any)
        .update({ meeting_helper_notes: { ...existing, news: nextNews } })
        .eq('id', target);
      if (writeError) {
        setSaving(false);
        setError('That did not save. Check your connection and try again.');
        return;
      }
      finish();
      return;
    }

    if (destination === 'unavailable') {
      const target = requireTargetHive();
      const start = parseAmericanDate(unavailableStart);
      const selectedEnd = parseAmericanDate(unavailableEnd);
      if (!target) return;
      if (!start || !selectedEnd) {
        setError('Choose a start and end date.');
        return;
      }
      if (selectedEnd < start) {
        setError('The end date should be on or after the start date.');
        return;
      }

      setSaving(true);
      try {
        await createCalendarEvent({
          community_id: target,
          title: `${(profile.name ?? 'Nat').split(/\s+/)[0]} unavailable`,
          event_date: start,
          end_date: selectedEnd === start ? null : selectedEnd,
          visibility: 'members',
          invited_scope: 'members',
        });
        finish();
      } catch {
        setSaving(false);
        setError('That did not save. Check your connection and try again.');
      }
      return;
    }

    if (!isOwner) {
      setError('Only the HIVE owner can add News from Nat.');
      return;
    }
    const title = newsTitle.trim();
    const detail = newsDetail.trim();
    if (!title) {
      setError('Add a title before saving.');
      return;
    }
    if (!isRealIsoDate(newsDate)) {
      setError('Use a real date in YYYY-MM-DD format.');
      return;
    }

    setSaving(true);
    const { error: writeError } = await supabase.from('app_news').insert({
      occurred_on: newsDate,
      title,
      detail: detail || null,
      created_by: profile.id,
    });
    if (writeError) {
      setSaving(false);
      setError('That did not save. Check your connection and try again.');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.appNews });
    finish();
  };

  const needsHivePicker = wholeHive && (destination === 'meeting' || destination === 'unavailable');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(11,11,18,0.58)', alignItems: 'center', justifyContent: 'center', padding: 18 }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: '#fffdf7', borderRadius: 18, overflow: 'hidden' }}
        >
          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 21, color: INK }}>Quick Add</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: QUIET, marginTop: 3 }}>
                  Put the thought where you will find it later.
                </Text>
              </View>
              <Pressable onPress={onClose} accessibilityLabel="Close Quick Add" hitSlop={8}>
                <Ionicons name="close" size={24} color={INK} />
              </Pressable>
            </View>

            {!destination ? (
              <View style={{ gap: 10 }}>
                <DestinationButton
                  icon="people-outline"
                  title="Meeting thought"
                  detail={wholeHive ? 'Choose the HIVE next.' : 'Adds it to this HIVE’s existing meeting-helper notes.'}
                  onPress={() => setDestination('meeting')}
                />
                {isOwner ? (
                  <DestinationButton
                    icon="newspaper-outline"
                    title="News from Nat"
                    detail="Member-visible, and available when you deliberately write the newsletter."
                    onPress={() => setDestination('news')}
                  />
                ) : null}
                <DestinationButton
                  icon="airplane-outline"
                  title="Vacation, travel or unavailable"
                  detail={wholeHive ? 'Choose the HIVE and date range next.' : 'Adds an all-day date range to this HIVE’s calendar.'}
                  onPress={() => setDestination('unavailable')}
                />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {needsHivePicker ? (
                  <HivePicker memberships={manageableHives} selectedId={targetHiveId} onSelect={setTargetHiveId} />
                ) : null}

                {destination === 'meeting' ? (
                  <ComposerBar
                    variant="form"
                    tone="light"
                    label="What should the meeting bring up?"
                    value={meetingThought}
                    onChangeText={setMeetingThought}
                    placeholder="One thought"
                    minHeight={76}
                    maxHeight={150}
                    maxLength={700}
                    counter="none"
                    attachments="none"
                    autoFocus={!wholeHive}
                  />
                ) : destination === 'news' ? (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: QUIET }}>
                      Visible to members and eligible for newsletter facts. Saving never drafts, previews, publishes or sends.
                    </Text>
                    <Input label="Date · YYYY-MM-DD" value={newsDate} onChangeText={setNewsDate} maxLength={10} autoCapitalize="none" autoCorrect={false} style={{ marginBottom: -16 }} />
                    <ComposerBar variant="form" tone="light" label="Title" value={newsTitle} onChangeText={setNewsTitle} placeholder="What can members do now?" multiline={false} minHeight={44} maxLength={140} counter="none" attachments="none" autoFocus />
                    <ComposerBar variant="form" tone="light" label="Detail · optional" value={newsDetail} onChangeText={setNewsDetail} placeholder="One short detail" minHeight={58} maxHeight={110} maxLength={500} counter="none" attachments="none" />
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: QUIET }}>
                      Saves “{(profile.name ?? 'Nat').split(/\s+/)[0]} unavailable” as an all-day calendar range for HIVErs only.
                    </Text>
                    <View style={{ gap: 10 }}>
                      <EventDatePicker value={unavailableStart} onChange={setUnavailableStart} label="First day" />
                      <EventDatePicker value={unavailableEnd} onChange={setUnavailableEnd} label="Last unavailable day" />
                    </View>
                  </View>
                )}
              </View>
            )}

            {error ? <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#b42318' }}>{error}</Text> : null}
            {destination ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => { setDestination(null); setError(null); }} disabled={saving}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: QUIET }}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={() => { void save(); }}
                  disabled={saving}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, opacity: pressed || saving ? 0.65 : 1 })}
                >
                  {saving ? <ActivityIndicator size="small" color="#1b1a16" /> : null}
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#1b1a16' }}>{saving ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HivePicker({ memberships, selectedId, onSelect }: { memberships: HiveMembership[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: INK }}>Which HIVE?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {memberships.map((membership) => {
          const selected = selectedId === membership.community_id;
          const accent = hiveAccent(membership.community);
          return (
            <Pressable
              key={membership.community_id}
              onPress={() => onSelect(membership.community_id)}
              style={{ borderWidth: 1, borderColor: selected ? accent : BORDER, backgroundColor: selected ? `${accent}18` : '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: INK }}>{hiveDisplayName(membership.community?.name)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DestinationButton({ icon, title, detail, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 14, backgroundColor: pressed ? '#f8f1df' : '#fff', padding: 13 })}
    >
      <Ionicons name={icon} size={22} color={GOLD} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: INK }}>{title}</Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 16, color: QUIET }}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={QUIET} />
    </Pressable>
  );
}

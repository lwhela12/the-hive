import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, type HiveMembership } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { ComposerBar } from '../ui/ComposerBar';
import { Input } from '../ui/Input';

const INK = '#313130';
const GOLD = '#bd9348';
const QUIET = '#756b5d';
const BORDER = 'rgba(189,147,72,0.28)';

export type QuickAddDestination = 'meeting' | 'news' | 'newsletter' | null;
type MeetingHelperNotes = Record<string, unknown> & { news?: string };

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  initialDestination?: QuickAddDestination;
}) {
  const { profile, communityId, communityRole, wholeHive, memberships } = useAuth();
  const isOwner = profile?.is_owner === true;
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const canQuickAdd = isOwner || isAdmin;
  const manageableHives = useMemo(
    () => memberships.filter((membership) => isOwner || mayManageHive(membership)),
    [isOwner, memberships],
  );

  const [destination, setDestination] = useState<QuickAddDestination>(null);
  const [targetHiveId, setTargetHiveId] = useState<string | null>(null);
  const [meetingThought, setMeetingThought] = useState('');
  const [newsDate, setNewsDate] = useState(defaultNewsDate);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsDetail, setNewsDetail] = useState('');
  const [newsletterThought, setNewsletterThought] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDestination((initialDestination === 'news' || initialDestination === 'newsletter') && !isOwner ? null : initialDestination);
    setTargetHiveId(wholeHive ? null : communityId ?? null);
    setMeetingThought('');
    setNewsDate(defaultNewsDate());
    setNewsTitle('');
    setNewsDetail('');
    setNewsletterThought('');
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

    if (destination === 'newsletter') {
      if (!isOwner) {
        setError('Only the HIVE owner can add a newsletter thought.');
        return;
      }
      const content = newsletterThought.trim();
      if (!content) {
        setError('Write the thought you want to keep.');
        return;
      }
      setSaving(true);
      const { error: writeError } = await supabase.from('newsletter_thoughts').insert({
        content,
        created_by: profile.id,
      });
      if (writeError) {
        setSaving(false);
        setError('That did not save. Check your connection and try again.');
        return;
      }
      finish();
      return;
    }

    if (!isOwner) {
      setError('Only the HIVE owner can add app-wide news.');
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

  const needsHivePicker = wholeHive && destination === 'meeting';

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
                  icon="newspaper-outline"
                  title="News from Nat"
                  detail={wholeHive ? 'Choose the HIVE next.' : 'Goes on this HIVE’s own News from Nat slide in the meeting deck.'}
                  onPress={() => setDestination('meeting')}
                />
                {isOwner ? (
                  <DestinationButton
                    icon="sparkles-outline"
                    title="New in the app"
                    detail="App-wide, not per-HIVE — shows in every HIVE’s deck and is eligible for newsletter facts."
                    onPress={() => setDestination('news')}
                  />
                ) : null}
                {isOwner ? (
                  <DestinationButton
                    icon="bulb-outline"
                    title="Newsletter thought"
                    detail="Private note for you. It waits in the Newsletter box until you are ready to write."
                    onPress={() => setDestination('newsletter')}
                  />
                ) : null}
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
                    label="What's the news?"
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
                      Visible to every HIVE, not just this one — and eligible for newsletter facts. Saving never drafts, previews, publishes or sends.
                    </Text>
                    <Input label="Date · YYYY-MM-DD" value={newsDate} onChangeText={setNewsDate} maxLength={10} autoCapitalize="none" autoCorrect={false} style={{ marginBottom: -16 }} />
                    <ComposerBar variant="form" tone="light" label="Title" value={newsTitle} onChangeText={setNewsTitle} placeholder="What can members do now?" multiline={false} minHeight={44} maxLength={140} counter="none" attachments="none" autoFocus />
                    <ComposerBar variant="form" tone="light" label="Detail · optional" value={newsDetail} onChangeText={setNewsDetail} placeholder="One short detail" minHeight={58} maxHeight={110} maxLength={500} counter="none" attachments="none" />
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: QUIET }}>
                      Just for you. Saving keeps the thought in the Newsletter box. It never drafts, previews, publishes or sends anything.
                    </Text>
                    <ComposerBar
                      variant="form"
                      tone="light"
                      label="What do you want to remember?"
                      value={newsletterThought}
                      onChangeText={setNewsletterThought}
                      placeholder="One quick thought"
                      minHeight={76}
                      maxHeight={150}
                      maxLength={1000}
                      counter="none"
                      attachments="none"
                      autoFocus
                    />
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

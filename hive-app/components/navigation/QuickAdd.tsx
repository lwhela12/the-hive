import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, type HiveMembership } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { HIVE_WIDE_INK } from '../../lib/scopeLook';
import { ComposerBar } from '../ui/ComposerBar';

const INK = '#313130';
const GOLD = '#bd9348';
const QUIET = '#756b5d';
const BORDER = 'rgba(189,147,72,0.28)';

// Nat, 2026-08-24: "i only need 2 shortcuts: news from nat & newsletter
// idea." The app-wide changelog entry ("New in the app") is still real and
// still written by hand elsewhere when it's needed — it just doesn't need
// its own button in a menu she never reaches for.
export type QuickAddDestination = 'meeting' | 'newsletter' | null;

/**
 * One thought, every HIVE.
 *
 * Nat, 2026-09-02: *"can I please have a 'HIVE-Wide' button? So if there's
 * something I want to remember to bring up at each meeting I don't have to type
 * it three times."*
 *
 * It is not a fourth HIVE and it is not a reach — News from Nat lives on each
 * HIVE's own deck, so this writes the same line onto each of them. That is the
 * one place in the app where a thing is deliberately copied, and it is copied
 * because three meetings are three meetings; nothing about the thought travels.
 */
const ALL_HIVES = '__all__';
type MeetingHelperNotes = Record<string, unknown> & { news?: string };

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
  const [newsletterThought, setNewsletterThought] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDestination(initialDestination === 'newsletter' && !isOwner ? null : initialDestination);
    setTargetHiveId(wholeHive ? null : communityId ?? null);
    setMeetingThought('');
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

      /**
       * Each HIVE's News from Nat is its own column, so "all of them" is a
       * write per HIVE rather than one write with a wider reach. Read then
       * append, one at a time — appending to a text blob cannot be done in
       * parallel against the same row shape without two writes racing to
       * overwrite each other's line.
       */
      const targets = target === ALL_HIVES
        ? manageableHives.map((membership) => membership.community_id)
        : [target];
      const landed: string[] = [];
      for (const hiveId of targets) {
        const { data, error: readError } = await supabase
          .from('communities')
          .select('meeting_helper_notes')
          .eq('id', hiveId)
          .single();
        if (readError) break;

        const existing = ((data as { meeting_helper_notes?: MeetingHelperNotes | null } | null)?.meeting_helper_notes ?? {});
        const currentNews = typeof existing.news === 'string' ? existing.news.trim() : '';
        const nextNews = currentNews ? `${currentNews}\n\n• ${thought}` : `• ${thought}`;
        const { error: writeError } = await (supabase.from('communities') as any)
          .update({ meeting_helper_notes: { ...existing, news: nextNews } })
          .eq('id', hiveId);
        if (writeError) break;
        landed.push(hiveId);
      }

      if (landed.length !== targets.length) {
        setSaving(false);
        // Says WHICH ones took it. "That did not save" after two of three
        // landed would have her type it again into the two that already have it.
        const named = landed
          .map((id) => hiveDisplayName(manageableHives.find((m) => m.community_id === id)?.community?.name))
          .filter(Boolean);
        setError(
          named.length
            ? `Saved to ${named.join(' and ')}. The rest did not go — try again and it will only add the missing ones.`
            : 'That did not save. Check your connection and try again.'
        );
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
  };

  /**
   * The picker used to appear only at HIVE-Wide, which put the new All HIVEs
   * button somewhere Nat would have to already be standing to find. Anyone who
   * runs more than one HIVE now sees it wherever they open Quick Add, with the
   * HIVE they are standing in already chosen — so a single-HIVE member's flow
   * is untouched and hers is one glance longer and three types shorter.
   */
  const needsHivePicker = destination === 'meeting' && (wholeHive || manageableHives.length > 1);

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
                  detail={
                    manageableHives.length > 1
                      // She picks next, and "All HIVEs" is one of the answers —
                      // so this must not promise a single HIVE before she has chosen.
                      ? 'Choose the HIVE next, or all of them at once.'
                      : 'Goes on this HIVE’s own News from Nat slide in the meeting deck.'
                  }
                  onPress={() => setDestination('meeting')}
                />
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
                  <HivePicker
                    memberships={manageableHives}
                    selectedId={targetHiveId}
                    onSelect={setTargetHiveId}
                  />
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

function HiveChip({
  label,
  selected,
  accent,
  onPress,
}: { label: string; selected: boolean; accent: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? accent : BORDER,
        backgroundColor: selected ? `${accent}18` : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: selected ? 6 : 7,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: INK }}>{label}</Text>
    </Pressable>
  );
}

function HivePicker({ memberships, selectedId, onSelect }: { memberships: HiveMembership[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const everywhere = selectedId === ALL_HIVES;
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: INK }}>Which HIVE?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {/* First, because "all of them" is the answer that saves the most
            typing and the one Nat asked for by name. It wears HIVE-Wide's ink
            rather than any HIVE's colour — it is not a fourth HIVE. */}
        {memberships.length > 1 ? (
          <HiveChip
            label="All HIVEs"
            selected={everywhere}
            accent={HIVE_WIDE_INK}
            onPress={() => onSelect(ALL_HIVES)}
          />
        ) : null}
        {memberships.map((membership) => (
          <HiveChip
            key={membership.community_id}
            label={hiveDisplayName(membership.community?.name)}
            selected={selectedId === membership.community_id}
            accent={hiveAccent(membership.community)}
            onPress={() => onSelect(membership.community_id)}
          />
        ))}
      </View>
      {everywhere ? (
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 16, color: QUIET }}>
          Goes on all {memberships.length} News from Nat slides — one line each, written once.
        </Text>
      ) : null}
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

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';

/**
 * Everyone, everywhere, in one room.
 *
 * Nat and Lucas are the only admins and they're in every HIVE, so Admin shows
 * all of them at once rather than making you swap HIVE to see who's in it
 * (Nat 2026-08-01). It isn't a special power: the rules already let you read
 * members of HIVEs you belong to, so an admin who's in one HIVE sees one box.
 * God mode is a consequence of Nat's memberships, not an exception to anything.
 *
 * Plus the newsletter list, which belongs to nobody's HIVE in particular.
 */

type Row = { id: string; name: string; email: string; role: string };
type Subscriber = { id: string; email: string; name: string | null; unsubscribed_at: string | null };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function GodModePanels({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
  orderFrom = 10,
}: {
  cellStyle: any;
  panelStyle: any;
  bodyStyle: any;
  scrollStyle: any;
  Panel: React.ComponentType<any>;
  orderFrom?: number;
}) {
  const { memberships, communityId } = useAuth();
  const [byHive, setByHive] = useState<Record<string, Row[]>>({});
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const next: Record<string, Row[]> = {};

    await Promise.all(memberships.map(async (m) => {
      const { data } = await supabase
        .from('community_memberships')
        .select('role, user:profiles!user_id(id, name, email)')
        .eq('community_id', m.community_id);

      next[m.community_id] = ((data ?? []) as any[])
        .map((r) => ({
          id: r.user?.id, name: r.user?.name ?? 'Someone', email: r.user?.email ?? '', role: r.role,
        }))
        .filter((r) => r.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    }));

    const { data: subRows } = await supabase
      .from('newsletter_subscribers')
      .select('id, email, name, unsubscribed_at')
      .order('created_at', { ascending: true });

    setByHive(next);
    setSubs((subRows ?? []) as Subscriber[]);
    setLoading(false);
  }, [memberships]);

  useEffect(() => { void load(); }, [load]);

  const addSubscriber = async () => {
    const email = newEmail.trim();
    if (!EMAIL.test(email)) {
      Alert.alert('That address looks off', 'Check it and try again.');
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.rpc('subscribe_to_newsletter', { p_email: email, p_name: null });
      if (error) throw error;
      setNewEmail('');
      await load();
      Alert.alert('Added', `${email} will get the next newsletter.`);
    } catch {
      Alert.alert('Could not add that', 'Try again in a moment.');
    } finally {
      setAdding(false);
    }
  };

  const removeSubscriber = async (sub: Subscriber) => {
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', sub.id);
    if (error) {
      Alert.alert('Could not remove that', 'Try again in a moment.');
      return;
    }
    await load();
  };

  const active = subs.filter((s) => !s.unsubscribed_at);

  return (
    <>
      {memberships.map((m, index) => {
        const rows = byHive[m.community_id] ?? [];
        const accent = hiveAccent(m.community);
        const name = hiveDisplayName(m.community?.name);
        return (
          <View key={m.community_id} style={[cellStyle, { order: orderFrom + index } as any]}>
            <Panel
              title={`${name} (${rows.length})`}
              style={panelStyle}
              bodyStyle={bodyStyle}
            >
              <View style={{ height: 4, backgroundColor: accent }} />
              <ScrollView style={scrollStyle} nestedScrollEnabled showsVerticalScrollIndicator>
                {loading && rows.length === 0 ? (
                  <View style={{ padding: 20 }}><ActivityIndicator color={accent} /></View>
                ) : rows.length === 0 ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', padding: 16 }}>
                    Nobody here yet.
                  </Text>
                ) : rows.map((r) => (
                  <View
                    key={r.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.25)',
                      backgroundColor: r.id === undefined ? 'transparent' : 'transparent',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#3f3a31' }}>
                        {r.name}{m.community_id === communityId ? '' : ''}
                      </Text>
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060' }}>
                        {r.email}
                      </Text>
                    </View>
                    {r.role !== 'member' ? (
                      <Text style={{
                        fontFamily: 'Lato_700Bold', fontSize: 10, letterSpacing: 0.6,
                        textTransform: 'uppercase', color: accent,
                      }}>
                        {r.role}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </Panel>
          </View>
        );
      })}

      <View style={[cellStyle, { order: orderFrom + memberships.length } as any]}>
        <Panel
          title={`Newsletter subscribers (${active.length})`}
          style={panelStyle}
          bodyStyle={bodyStyle}
        >
          <ScrollView style={scrollStyle} nestedScrollEnabled showsVerticalScrollIndicator>
            {/* Add somebody by hand — "add my dad to the newsletter" */}
            <View style={{ flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' }}>
              <TextInput
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="their@email.com"
                autoCapitalize="none"
                keyboardType="email-address"
                style={{
                  flex: 1, fontFamily: 'Lato_400Regular', fontSize: 13, color: '#313130',
                  backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(189,147,72,0.4)',
                  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
                }}
              />
              <Pressable
                onPress={addSubscriber}
                disabled={adding}
                style={{
                  backgroundColor: '#bd9348', borderRadius: 10,
                  paddingHorizontal: 14, paddingVertical: 10, opacity: adding ? 0.6 : 1,
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#fffdf5' }}>Add</Text>
              </Pressable>
            </View>

            {active.length === 0 ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', paddingHorizontal: 14, paddingBottom: 14 }}>
                Nobody outside the HIVEs is subscribed yet. Members get it automatically.
              </Text>
            ) : active.map((sub) => (
              <View
                key={sub.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: 'rgba(222,193,129,0.25)',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#3f3a31' }}>
                    {sub.email}
                  </Text>
                  {sub.name ? (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060' }}>{sub.name}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => removeSubscriber(sub)}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${sub.email}`}
                >
                  <Ionicons name="close-circle-outline" size={19} color="#b0a48c" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </Panel>
      </View>
    </>
  );
}

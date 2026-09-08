import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { HIVE_GOLD } from '../../lib/hiveBrand';

/**
 * The button that was never built.
 *
 * `open-check-in` (`supabase/functions/open-check-in`) shipped 2026-09-04 —
 * Nat's ask, "everything happens in the app, one press, no proofreading" —
 * and nothing in the app has ever called it. `check-in-reminder`'s old 6am
 * preview-to-Nat cron was retired the same week and nothing replaced its job
 * of reminding a HUMAN to press send. Found 2026-09-08 answering Nat's
 * question about whether Tech HIVE's non-responders got a morning email —
 * they had not, because there was nothing to press.
 *
 * This is that press. It shows both merged check-ins ("Before we meet",
 * "End of the month" — the only two the function will touch, per its own
 * refusal at 409) with a live count before anything sends, and a confirm
 * naming the number — the same rule `open-check-in`'s own comments describe:
 * "it says how many, before it sends... nobody presses send on 'everyone'
 * without seeing what everyone means."
 */

type DryRun = {
  survey_id: string;
  check_in: string;
  hive: string;
  members: number;
  answered: number;
  would_reach: number;
  meeting_now: boolean;
};

type Row = { surveyId: string; title: string; state: 'loading' | 'ready' | 'error'; message?: string; dry?: DryRun };

export function SendCheckInPanel({
  cellStyle, panelStyle, bodyStyle, Panel, order,
}: {
  cellStyle: any; panelStyle: any; bodyStyle: any; Panel: React.ComponentType<any>; order?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<Row | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('surveys')
      .select('id, title')
      .is('community_id', null)
      .eq('is_active', true);
    if (error || !data?.length) {
      setRows([]);
      setLoading(false);
      return;
    }
    const initial: Row[] = data.map((s: { id: string; title: string }) => ({
      surveyId: s.id, title: s.title, state: 'loading',
    }));
    setRows(initial);
    setLoading(false);
    await Promise.all(initial.map(async (row) => {
      const { data: dry, error: dryError } = await supabase.functions.invoke('open-check-in', {
        body: { survey_id: row.surveyId, dry_run: true },
      });
      setRows((current) => current.map((r) => r.surveyId === row.surveyId
        ? (dryError
          ? { ...r, state: 'error', message: (dry as any)?.error ?? dryError.message ?? 'Could not check.' }
          : { ...r, state: 'ready', dry: dry as DryRun })
        : r));
    }));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const send = useCallback(async (row: Row) => {
    setConfirming(null);
    setSending(row.surveyId);
    const { data, error } = await supabase.functions.invoke('open-check-in', {
      body: { survey_id: row.surveyId, dry_run: false },
    });
    setSending(null);
    if (error) {
      showAlert('Nothing sent', (data as any)?.error ?? error.message ?? 'Something went wrong.');
      return;
    }
    const result = data as { reached?: number };
    showAlert('Sent', `Reached ${result.reached ?? 0} ${result.reached === 1 ? 'person' : 'people'}.`);
    await load();
  }, [load]);

  return (
    <View style={[cellStyle, { order } as any]}>
      <Panel title="Send a check-in" style={panelStyle} bodyStyle={bodyStyle}>
        {loading ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={HIVE_GOLD} />
          </View>
        ) : !rows.length ? (
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: 'rgba(246,244,229,0.6)', padding: 14 }}>
            Nothing open right now.
          </Text>
        ) : (
          rows.map((row) => (
            <View
              key={row.surveyId}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(246,244,229,0.12)' }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#F6F4E5' }}>{row.title}</Text>
              {row.state === 'loading' ? (
                <ActivityIndicator size="small" color={HIVE_GOLD} style={{ marginTop: 6, alignSelf: 'flex-start' }} />
              ) : row.state === 'error' ? (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: 'rgba(246,244,229,0.55)', marginTop: 3 }}>
                  {row.message}
                </Text>
              ) : row.dry ? (
                <>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: 'rgba(246,244,229,0.7)', marginTop: 3 }}>
                    {row.dry.hive} · {row.dry.would_reach} of {row.dry.members} waiting
                    {row.dry.meeting_now ? ' · in its meeting right now' : ''}
                  </Text>
                  {row.dry.would_reach > 0 && !row.dry.meeting_now ? (
                    <Pressable
                      onPress={() => setConfirming(row)}
                      disabled={sending === row.surveyId}
                      style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: HIVE_GOLD, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 }}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#1a1a1a' }}>
                        {sending === row.surveyId ? 'Sending…' : `Send to ${row.dry.would_reach}`}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>
          ))
        )}
      </Panel>
      <ConfirmDialog
        visible={!!confirming}
        title={confirming ? `Send "${confirming.title}"?` : ''}
        body={confirming?.dry ? `Reaches ${confirming.dry.would_reach} people in ${confirming.dry.hive} who have not answered yet.` : undefined}
        confirmLabel="Send it"
        onConfirm={() => confirming && send(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}

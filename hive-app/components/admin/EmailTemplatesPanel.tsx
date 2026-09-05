import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { HIVE_GOLD } from '../../lib/hiveBrand';

/**
 * EVERY TEMPLATED EMAIL, RENDERED, IN ONE PLACE. OWNER-ONLY TEST COPIES.
 *
 * Nat, 2026-09-04: *"you'll make all the templates today, with the new logos &
 * i'll approve them all just once. Then we dont need to play this game each
 * time."*
 *
 * This is the page that makes "approve once" honest. The Build Standard was
 * amended the same day to match: a template — the same words every time with a
 * name and a date slotted in — is read and approved ONCE, here; only words
 * written fresh still preview before every send.
 *
 * **The letters below are built by the real sender.** `email-preview` imports
 * `reachEmailHtml` from the same module the five notify functions use, so what
 * is approved on this page is character-for-character what lands in an inbox.
 * A second copy of a template kept for previewing would let her approve
 * something nobody receives — the `_shared/hiveMark.ts` trap with the stakes
 * reversed.
 *
 * **They are shown in a real browser frame, on web.** An email is HTML, and
 * retyping it as React Native views to display it would be a third copy that
 * looks right and proves nothing. On a phone build there is no frame to use, so
 * the panel says so and shows the words instead of pretending.
 */

type Template = {
  key: string;
  name: string;
  when: string;
  subject: string;
  html: string;
  approved: boolean;
  revision: string;
};

export function EmailTemplatesPanel({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
}: {
  cellStyle: any;
  panelStyle: any;
  bodyStyle: any;
  scrollStyle: any;
  Panel: React.ComponentType<any>;
}) {
  // Scope changes the real seal/colour, never the approved generic words.
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [scopes, setScopes] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { void supabase.from('communities').select('id, name').then(({ data }) => setScopes([...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)))); }, []);
  const [saving, setSaving] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [open, setOpen] = useState<string | null>(null);
  const [posting, setPosting] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setState('loading');
    const { data, error } = await supabase.functions.invoke(scopeId ? `email-preview?hive=${encodeURIComponent(scopeId)}` : 'email-preview', {
      method: 'GET',
    });
    if (version !== loadVersion.current) return;
    if (error || !data?.templates) { setState('error'); return; }
    setTemplates(data.templates as Template[]);
    setState('ready');
  }, [scopeId]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Read them here, or read them where they will actually arrive.
   *
   * Nat, 2026-09-04: *"put one of each type in my inbox."* Every previous set
   * went out because a session ran the function by hand from a terminal, which
   * is the exact shape PROJECT.md warns about for check-ins — *"before this,
   * there was no button anywhere."* A page that renders the templates and then
   * cannot mail them is a page that needs somebody at a keyboard every time the
   * words change.
   *
   * It takes no recipient and never has. `email-preview` reads the caller's own
   * address off their profile and mails it there and nowhere else, so there is
   * nothing here that can be pointed at a member.
   */
  const mailThemToMe = useCallback(async () => {
    setPosting('sending');
    const { data, error } = await supabase.functions.invoke(scopeId ? `email-preview?hive=${encodeURIComponent(scopeId)}` : 'email-preview', {
      method: 'POST',
      body: { send: true },
    });
    const sent = (data as { sent?: number; of?: number } | null);
    setPosting(!error && sent?.sent === sent?.of && (sent?.of ?? 0) > 0 ? 'sent' : 'failed');
  }, [scopeId]);

  const setApproval = async (template: Template, approved: boolean) => {
    setSaving(template.key); setApprovalError(null);
    const { data, error } = await supabase.functions.invoke('email-preview', {
      method: 'POST', body: { action: 'approval', key: template.key, revision: template.revision, approved },
    });
    if (error || data?.approved !== approved) setApprovalError('That approval was not saved. Reload and try again.');
    else setTemplates(rows => rows.map(row => row.key === template.key ? { ...row, approved: data.approved } : row));
    setSaving(null);
  };

  return (
    <View style={cellStyle}>
      <Panel
        title="The emails we send"
        tabs={[{ key: 'wide', label: 'HIVE-Wide' }, ...scopes.map(scope => ({ key: scope.id, label: scope.name }))]}
        activeTab={scopeId ?? 'wide'}
        onTabChange={(key: string) => { setScopeId(key === 'wide' ? null : key); setOpen(null); setPosting('idle'); }}
        style={panelStyle}
        bodyStyle={bodyStyle}
      >
        <ScrollView style={scrollStyle} contentContainerStyle={{ paddingBottom: 6 }}>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: 'rgba(255,248,233,0.78)', paddingHorizontal: 12, paddingTop: 10 }}>
            Approve template wording once; open an email to review it.
          </Text>

          {approvalError ? <Text accessibilityRole="alert" style={{ color: '#ffb4a8', padding: 12 }}>{approvalError}</Text> : null}
          {/* The same five, in the place they will actually be read. */}
          <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
            <Pressable
              onPress={() => { void mailThemToMe(); }}
              disabled={posting === 'sending' || state !== 'ready'}
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: 'rgba(255,248,233,0.14)',
                opacity: posting === 'sending' || state !== 'ready' ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#fffdf5' }}>
                {posting === 'sending' ? 'Sending test copies…' : state === 'ready' ? `Email me all ${templates.length} previews` : 'Email me all previews'}
              </Text>
            </Pressable>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18, color: 'rgba(255,248,233,0.78)', paddingTop: 6 }}>
              Test copies only—including unapproved templates. Approval controls member emails.
            </Text>
            {posting === 'sent' ? (
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 18, color: 'rgba(255,248,233,0.66)', paddingTop: 6 }}>
                On their way to you, and nobody else. Every subject starts with [Test].
              </Text>
            ) : posting === 'failed' ? (
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, lineHeight: 18, color: '#ffb4a8', paddingTop: 6 }}>
                Not all test copies were confirmed sent. Some may have arrived; check your inbox before retrying.
              </Text>
            ) : null}
          </View>

          {state === 'loading' ? (
            <View style={{ paddingVertical: 26, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#e8c583" />
            </View>
          ) : state === 'error' ? (
            <View style={{ padding: 14 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, lineHeight: 19, color: '#ffb4a8' }}>
                These did not load, so none of them is being shown as approved.
              </Text>
              <Pressable onPress={() => { void load(); }} style={{ marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,248,233,0.14)' }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#fffdf5' }}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ paddingTop: 8 }}>
              {templates.map((template) => {
                const showing = open === template.key;
                return (
                  <View key={template.key} style={{ borderTopWidth: 1, borderTopColor: 'rgba(246,244,229,0.12)' }}>
                    <View testID="email-approval-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Review ${template.name}`}
                        accessibilityState={{ expanded: showing }}
                        onPress={() => setOpen(showing ? null : template.key)}
                        style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#fffdf5' }}>
                          {showing ? '▾ ' : '▸ '}{template.name}
                        </Text>
                      </Pressable>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <Switch value={template.approved === true} disabled={saving !== null}
                          trackColor={{ false: '#665c49', true: HIVE_GOLD }}
                          // RN Web 0.21 uses separate active colours; thumbColor only affects OFF.
                          {...(Platform.OS === 'web' ? { activeThumbColor: '#F6F4E5', activeTrackColor: HIVE_GOLD } : {})}
                          thumbColor="#F6F4E5" ios_backgroundColor="#665c49"
                          accessibilityLabel={`${template.name}: ${template.approved ? 'Approved' : 'Needs review'}`}
                          onValueChange={value => { void setApproval(template, value); }} />
                        <Text style={{ color: '#fffdf5', fontSize: 12 }}>{saving === template.key ? 'Saving…' : template.approved ? 'Approved' : 'Needs review'}</Text>
                      </View>
                    </View>
                    {showing ? (
                      <View style={{ paddingHorizontal: 12, paddingBottom: 14 }}>
                        <Text style={{ fontSize: 12, lineHeight: 18, color: 'rgba(255,248,233,0.66)', paddingBottom: 10 }}>{template.when}</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,248,233,0.5)', paddingBottom: 4 }}>
                          Subject
                        </Text>
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#fffdf5', paddingBottom: 10 }}>
                          {template.subject}
                        </Text>
                        <LetterFrame html={template.html} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </Panel>
    </View>
  );
}

/**
 * The letter itself, drawn by a browser, because that is what will draw it.
 *
 * `srcDoc` rather than a URL: the HTML is already in hand, and handing it to
 * the frame directly means no second request and nothing to authenticate. The
 * frame is sandboxed with nothing granted — a preview has no reason to run a
 * script or follow a link, and the letters carry neither.
 */
function LetterFrame({ html }: { html: string }) {
  if (Platform.OS !== 'web') {
    return (
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: 'rgba(255,248,233,0.8)' }}>
        {stripTags(html)}
      </Text>
    );
  }
  return (
    <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: '#ffffff' }}>
      {/* An iframe is a real element on web; react-native-web passes it through. */}
      <iframe
        srcDoc={html}
        sandbox=""
        title="What this email looks like"
        style={{ width: '100%', height: 460, border: 'none', display: 'block' }}
      />
    </View>
  );
}

/** The words on their own, for a phone with no frame to draw them in. */
function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

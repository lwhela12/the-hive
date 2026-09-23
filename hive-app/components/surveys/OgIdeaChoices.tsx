import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type Idea = { id: string; title: string; votes: number };
type Kind = 'help' | 'hang';
type Board = { id: string; name: string; topic_kind?: string | null; status?: string | null };
type Reply = { id: string; post_id: string; author_id: string; content: string };

/** The former OG check-in's board-backed "pick one or suggest your own" choice. */
export function OgIdeaChoices({ communityId, userId }: { communityId: string; userId: string }) {
  const [boards, setBoards] = useState<{ help: Board | null; hang: Board | null }>({ help: null, hang: null });
  const [helpThreadId, setHelpThreadId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Record<Kind, Idea[]>>({ help: [], hang: [] });
  const [selected, setSelected] = useState<Record<Kind, string | null>>({ help: null, hang: null });
  const [voteIds, setVoteIds] = useState<Record<Kind, string[]>>({ help: [], hang: [] });
  const [draft, setDraft] = useState<Record<Kind, string>>({ help: '', hang: '' });
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: boardRows, error: boardError } = await supabase.from('board_categories')
      .select('id, name, topic_kind, status').eq('community_id', communityId);
    if (boardError) throw boardError;
    const active = ((boardRows ?? []) as Board[]).filter(row => !row.status || row.status === 'active');
    const help = active.find(row => row.topic_kind === 'helper_log')
      ?? active.find(row => /hive help|hive helpers/i.test(row.name)) ?? null;
    const hang = active.find(row => /hang/i.test(row.name)) ?? null;
    setBoards({ help, hang });

    const [helpPosts, hangPosts] = await Promise.all([
      help ? supabase.from('board_posts').select('id, title').eq('category_id', help.id)
        .ilike('title', '%help ideas%').order('created_at', { ascending: false }).limit(1) : Promise.resolve({ data: [], error: null }),
      hang ? supabase.from('board_posts').select('id, title').eq('category_id', hang.id)
        .or('status.is.null,status.eq.active').order('created_at', { ascending: false }).limit(6) : Promise.resolve({ data: [], error: null }),
    ]);
    if (helpPosts.error || hangPosts.error) throw helpPosts.error ?? hangPosts.error;
    const threadId = helpPosts.data?.[0]?.id ?? null;
    setHelpThreadId(threadId);
    const hangRows = (hangPosts.data ?? []) as { id: string; title: string }[];
    const postIds = [...(threadId ? [threadId] : []), ...hangRows.map(row => row.id)];
    const { data: replyRows, error: replyError } = postIds.length
      ? await supabase.from('board_replies').select('id, post_id, author_id, content').in('post_id', postIds)
        .order('created_at', { ascending: false }).limit(500)
      : { data: [], error: null };
    if (replyError) throw replyError;
    const replies = (replyRows ?? []) as Reply[];
    const helpIdeas = replies.filter(reply => reply.post_id === threadId && !/^\+1\b/i.test(reply.content.trim()))
      .map(reply => ({ id: reply.id, title: reply.content.trim(), votes: 0 }))
      .filter(idea => !!idea.title);
    const uniqueHelp = helpIdeas.filter((idea, index) => helpIdeas.findIndex(other => other.title === idea.title) === index);
    for (const idea of uniqueHelp) {
      idea.votes = new Set(replies.filter(reply => reply.post_id === threadId && reply.content === `+1 for ${idea.title}! 🙋`)
        .map(reply => reply.author_id)).size;
    }
    const hangIdeas = hangRows.map(post => ({
      id: post.id, title: post.title,
      votes: new Set(replies.filter(reply => reply.post_id === post.id && /^\+1\b/.test(reply.content.trim()))
        .map(reply => reply.author_id)).size,
    }));
    setIdeas({ help: uniqueHelp.slice(0, 6), hang: hangIdeas });
    const myHelpVotes = replies.filter(reply => reply.post_id === threadId && reply.author_id === userId && /^\+1 for /i.test(reply.content));
    const myHangVotes = replies.filter(reply => reply.author_id === userId && hangRows.some(post => post.id === reply.post_id) && /^\+1\b/.test(reply.content));
    const myHelp = myHelpVotes[0];
    const myHang = myHangVotes[0];
    setSelected({
      help: uniqueHelp.find(idea => myHelp?.content === `+1 for ${idea.title}! 🙋`)?.id ?? null,
      hang: myHang?.post_id ?? null,
    });
    setVoteIds({ help: myHelpVotes.map(reply => reply.id), hang: myHangVotes.map(reply => reply.id) });
  }, [communityId, userId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().catch(() => { if (active) setError('Ideas could not load. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const vote = async (kind: Kind, idea: Idea) => {
    if (busy) return;
    setBusy(kind); setError(null);
    try {
      if (voteIds[kind].length) {
        const { error: deleteError } = await supabase.from('board_replies').delete()
          .in('id', voteIds[kind]).eq('author_id', userId);
        if (deleteError) throw deleteError;
      }
      if (selected[kind] !== idea.id) {
        const postId = kind === 'help' ? helpThreadId : idea.id;
        if (!postId) throw new Error('Idea thread unavailable');
        const { error: insertError } = await (supabase as any).from('board_replies').insert({
          community_id: communityId, post_id: postId, author_id: userId,
          content: kind === 'help' ? `+1 for ${idea.title}! 🙋` : "+1 — I'm in! 🙋",
        });
        if (insertError) throw insertError;
      }
      await refresh();
    } catch {
      setError('Your choice did not save. Please try again.');
      await refresh().catch(() => {});
    } finally { setBusy(null); }
  };

  const addIdea = async (kind: Kind) => {
    const title = draft[kind].trim();
    if (!title || busy) return;
    setBusy(kind); setError(null);
    try {
      const board = boards[kind];
      if (!board) throw new Error('Board unavailable');
      if (kind === 'hang') {
        const { error: insertError } = await (supabase as any).from('board_posts').insert({
          community_id: communityId, category_id: board.id, author_id: userId, title, content: title,
        });
        if (insertError) throw insertError;
      } else {
        let postId = helpThreadId;
        if (!postId) {
          const { data, error: threadError } = await (supabase as any).from('board_posts').insert({
            community_id: communityId, category_id: board.id, author_id: userId,
            title: 'HIVE Help Ideas 💡', content: 'Ideas for future HIVE Help focuses.',
          }).select('id').single();
          if (threadError) throw threadError;
          postId = data.id;
        }
        const { error: insertError } = await (supabase as any).from('board_replies').insert({
          community_id: communityId, post_id: postId, author_id: userId, content: title,
        });
        if (insertError) throw insertError;
      }
      setDraft(previous => ({ ...previous, [kind]: '' }));
      await refresh();
    } catch { setError('Your idea did not post. Please try again.'); }
    finally { setBusy(null); }
  };

  if (loading) return <ActivityIndicator color="#b58b43" />;
  if (!boards.help && !boards.hang) return null;
  return <View style={{ gap: 16, marginBottom: 20 }}>
    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, color: '#3b3428' }}>Ideas for next time</Text>
    <Text style={{ fontFamily: 'Lato_400Regular', color: '#665c4b' }}>Pick one for each, or add your own and tap it. These choices save right away.</Text>
    {(['help', 'hang'] as Kind[]).map(kind => boards[kind] && <View key={kind} style={{ borderWidth: 1, borderColor: '#e8d6b2', borderRadius: 16, padding: 16, gap: 10, backgroundColor: '#fffdf8' }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: '#765b2d' }}>HIVE {kind === 'help' ? 'Help' : 'Hang'}</Text>
      {ideas[kind].map(idea => <Pressable key={idea.id} accessibilityRole="button"
        accessibilityLabel={`${selected[kind] === idea.id ? 'Remove your vote for' : 'Vote for'} ${idea.title}`}
        accessibilityState={{ selected: selected[kind] === idea.id, disabled: !!busy }}
        disabled={!!busy} onPress={() => void vote(kind, idea)}
        style={{ borderWidth: 1, borderColor: selected[kind] === idea.id ? '#b58b43' : '#eadfc9', borderRadius: 12, padding: 11, backgroundColor: selected[kind] === idea.id ? '#fff2d9' : '#fff' }}>
        <Text style={{ fontFamily: 'Lato_700Bold', color: '#51452f' }}>{selected[kind] === idea.id ? '✓ ' : '○ '}{idea.title} · {idea.votes}</Text>
      </Pressable>)}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput accessibilityLabel={`Suggest a HIVE ${kind} idea`} value={draft[kind]}
          onChangeText={value => setDraft(previous => ({ ...previous, [kind]: value }))}
          placeholder="Your idea" style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#eadfc9', borderRadius: 10, padding: 11, color: '#3b3428' }} />
        <Pressable accessibilityRole="button" disabled={!draft[kind].trim() || !!busy}
          onPress={() => void addIdea(kind)} style={{ borderRadius: 10, padding: 12, backgroundColor: draft[kind].trim() ? '#b58b43' : '#d9d1c2' }}>
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#fff' }}>Add</Text>
        </Pressable>
      </View>
    </View>)}
    {error && <Text style={{ color: '#b42318' }}>{error}</Text>}
  </View>;
}

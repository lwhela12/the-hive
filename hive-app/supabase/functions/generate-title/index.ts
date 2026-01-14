import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { corsHeaders, handleCors, errorResponse } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const auth = await verifySupabaseJwt(authHeader);

    if (isAuthError(auth)) {
      return errorResponse(auth.error, auth.status);
    }

    const { userId, token } = auth;

    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } } }
    );

    const { conversation_id } = await req.json();

    if (!conversation_id) {
      return errorResponse('conversation_id is required', 400);
    }

    // Get the first few messages from the conversation
    const { data: messages, error: messagesError } = await supabaseClient
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(4);

    if (messagesError || !messages || messages.length === 0) {
      return errorResponse('Could not fetch messages', 400);
    }

    // Find the first user message
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) {
      return errorResponse('No user messages found', 400);
    }

    // Build context from the conversation
    const conversationContext = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    // Call Claude Haiku to generate a title
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20250929',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Generate a short, concise title (3-6 words) for this conversation. Just return the title, nothing else.

Conversation:
${conversationContext}`
      }]
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const title = textBlock?.text?.trim() || 'New Conversation';

    // Update the conversation with the generated title
    const { error: updateError } = await supabaseClient
      .from('conversations')
      .update({ title })
      .eq('id', conversation_id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update conversation title:', updateError);
      return errorResponse('Failed to update title', 500);
    }

    return new Response(
      JSON.stringify({ title }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate title error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

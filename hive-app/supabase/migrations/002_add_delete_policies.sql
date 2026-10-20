-- Add delete policy for chat_messages so users can delete their own messages
create policy "Users can delete own chat messages" on public.chat_messages
  for delete using (auth.uid() = user_id);

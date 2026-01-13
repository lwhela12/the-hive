-- Add delete policy for chat_messages so users can delete their own messages
create policy "Users can delete own chat messages" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- Add delete policy for skills so users can delete their own skills
create policy "Users can delete own skills" on public.skills
  for delete using (auth.uid() = user_id);

-- Add delete policy for wishes so users can delete their own wishes
create policy "Users can delete own wishes" on public.wishes
  for delete using (auth.uid() = user_id);

-- Let each member choose what ordinary Enter does in a multiline composer on
-- the web. Document-style writing is the default: Enter makes a new line and
-- Command/Ctrl + Enter submits. Members who prefer the old fast-send behaviour
-- can opt into it under Settings -> Writing on computer.

alter table public.profiles
  add column if not exists enter_sends_on_web boolean not null default false;

comment on column public.profiles.enter_sends_on_web is
  'When true, plain Enter submits multiline web composers and Shift+Enter makes a newline. When false, Enter makes a newline and Command/Ctrl+Enter submits. Native keyboards are unchanged.';

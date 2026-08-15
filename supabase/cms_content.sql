-- Global site-settings persistence. CMS pages were normalized into individual
-- `public.pages` rows by pages_sync.sql; this table deliberately owns only the
-- global site_settings document so there is no duplicate page store.

create table if not exists public.cms_content (
  id text primary key check (id = 'site_settings'),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.cms_content_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cms_content_touch_trigger on public.cms_content;
create trigger cms_content_touch_trigger
  before update on public.cms_content
  for each row execute function public.cms_content_touch();

alter table public.cms_content enable row level security;

drop policy if exists "Public can read cms content" on public.cms_content;
drop policy if exists "Staff can write cms content" on public.cms_content;

create policy "Public can read cms content" on public.cms_content
  for select using (true);

create policy "Staff can write cms content" on public.cms_content
  for all to authenticated
  using (public.is_staff() or public.is_root_admin())
  with check (public.is_staff() or public.is_root_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cms_content'
    ) then
    alter publication supabase_realtime add table public.cms_content;
  end if;
end $$;

insert into public.cms_content (id, content)
values ('site_settings', '{}'::jsonb)
on conflict (id) do nothing;

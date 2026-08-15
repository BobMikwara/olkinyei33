-- ============================================================================
-- CMS PAGES — normalized single source of truth (`public.pages`)
-- ============================================================================
-- Repository schema audit (2026-08-15): no relational pages table existed.
-- Page records were embedded as one JSON array in `cms_content.content` where
-- id = 'pages'. That document could not enforce unique slugs, row-level
-- publication rules, or safe row CRUD. This migration normalizes those same
-- records into `public.pages`, migrates the document once, and removes the old
-- `cms_content/pages` document so there is never a competing page store.
--
-- Run after schema.sql, auth_schema_sync.sql, and cms_content.sql.
-- Idempotent: existing public.pages rows are retained and seeds never overwrite
-- CMS edits.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content jsonb not null default '{"body":""}'::jsonb,
  featured_image text not null default '',
  hero_title text not null default '',
  hero_eyebrow text not null default '',
  hero_description text not null default '',
  status text not null default 'draft',
  layout text not null default 'standard',
  navigation_label text not null default '',
  show_in_navigation boolean not null default false,
  sort_order integer not null default 0,
  seo_title text not null default '',
  seo_description text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_slug_check check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) between 1 and 120
    and slug not in ('admin', 'api', 'auth')
  ),
  constraint pages_status_check check (status in ('draft', 'published', 'archived')),
  constraint pages_layout_check check (layout in (
    'standard', 'home', 'about', 'experiences', 'destinations', 'journal', 'contact'
  )),
  constraint pages_home_slug_check check (layout <> 'home' or slug = 'home'),
  constraint pages_content_object_check check (jsonb_typeof(content) = 'object')
);

-- The lowercase slug check makes this index defensive documentation as well as
-- protection for databases that predate pages_slug_check.
create unique index if not exists pages_slug_lower_key on public.pages (lower(slug));
-- A specialist React layout belongs to one active page record. Standard pages
-- remain unlimited and all resolve through the same dynamic component.
create unique index if not exists pages_special_layout_key
  on public.pages(layout) where layout <> 'standard' and status <> 'archived';
create index if not exists pages_status_idx on public.pages(status);
create index if not exists pages_navigation_idx
  on public.pages(show_in_navigation, sort_order) where status = 'published';

create or replace function public.can_delete_pages()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (is_root = true or role in ('root', 'super_admin'))
  );
$$;

create or replace function public.pages_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Archiving is the application's safe-delete operation and follows the
  -- narrower delete permission (Root/Super Admin), not general edit rights.
  if (
    (tg_op = 'INSERT' and new.status = 'archived')
    or (tg_op = 'UPDATE' and old.status is distinct from new.status and (old.status = 'archived' or new.status = 'archived'))
  ) and not public.can_delete_pages() then
    raise exception 'Only a Root or Super Admin can archive or restore a page';
  end if;

  new.updated_at := now();
  new.slug := lower(btrim(new.slug));
  new.navigation_label := coalesce(nullif(btrim(new.navigation_label), ''), new.title);
  return new;
end;
$$;

drop trigger if exists pages_touch_updated_at on public.pages;
create trigger pages_touch_updated_at
  before insert or update on public.pages
  for each row execute function public.pages_touch_updated_at();

-- Page write permission is intentionally narrower than generic is_staff().
-- Reservation and finance users can never mutate public website pages.
create or replace function public.can_manage_pages()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and (
        is_root = true
        or role in ('root', 'super_admin', 'content_manager')
      )
  );
$$;

alter table public.pages enable row level security;

drop policy if exists "Public can read published pages" on public.pages;
drop policy if exists "Page managers can read all pages" on public.pages;
drop policy if exists "Page managers can create pages" on public.pages;
drop policy if exists "Page managers can update pages" on public.pages;
drop policy if exists "Page managers can delete pages" on public.pages;

create policy "Public can read published pages" on public.pages
  for select using (status = 'published');
create policy "Page managers can read all pages" on public.pages
  for select to authenticated using (public.can_manage_pages());
create policy "Page managers can create pages" on public.pages
  for insert to authenticated with check (public.can_manage_pages());
create policy "Page managers can update pages" on public.pages
  for update to authenticated using (public.can_manage_pages()) with check (public.can_manage_pages());
create policy "Page managers can delete pages" on public.pages
  for delete to authenticated using (public.can_delete_pages());

grant select on public.pages to anon;
grant select, insert, update, delete on public.pages to authenticated;

-- Migrate the legacy cms_content JSON array. Historic /gallery was already an
-- alias for the Journal route in React, so it becomes the authoritative
-- `journal` row instead of creating two page records for one public layout.
do $$
begin
  if to_regclass('public.cms_content') is not null then
    insert into public.pages (
      slug, title, content, featured_image, hero_title, hero_eyebrow,
      hero_description, status, layout, navigation_label,
      show_in_navigation, sort_order, seo_title, seo_description, updated_at
    )
    select
      case
        when coalesce(item ->> 'route', '/') = '/' then 'home'
        when trim(both '/' from coalesce(item ->> 'route', '')) = 'gallery' then 'journal'
        else trim(both '/' from coalesce(item ->> 'route', ''))
      end,
      coalesce(nullif(item ->> 'title', ''), 'Untitled page'),
      case
        when jsonb_typeof(item -> 'content') = 'object'
          then (item -> 'content') || jsonb_build_object('body', coalesce(item #>> '{content,body}', ''))
        else jsonb_build_object('body', coalesce(item ->> 'content', ''))
      end,
      coalesce(item ->> 'heroImage', ''),
      coalesce(item ->> 'heroTitle', ''),
      coalesce(item ->> 'heroEyebrow', ''),
      coalesce(item ->> 'heroText', ''),
      case when coalesce((item ->> 'published')::boolean, false) then 'published' else 'draft' end,
      case trim(both '/' from coalesce(item ->> 'route', ''))
        when '' then 'home'
        when 'about' then 'about'
        when 'safari-experiences' then 'experiences'
        when 'destinations' then 'destinations'
        when 'gallery' then 'journal'
        when 'journal' then 'journal'
        when 'contact' then 'contact'
        else 'standard'
      end,
      coalesce(nullif(item ->> 'title', ''), 'Page'),
      true,
      ordinality::integer,
      coalesce(item #>> '{seo,title}', ''),
      coalesce(item #>> '{seo,description}', ''),
      coalesce(nullif(item ->> 'updatedAt', '')::timestamptz, now())
    from (
      select content
      from public.cms_content
      where id = 'pages' and jsonb_typeof(content) = 'array'
    ) source
    cross join lateral jsonb_array_elements(source.content) with ordinality as legacy(item, ordinality)
    where trim(both '/' from coalesce(item ->> 'route', '/')) not in ('admin', 'api', 'auth')
    on conflict (slug) do nothing;

    -- Retire the old page document after its rows have been copied. Site
    -- settings continue to use cms_content exactly as before.
    delete from public.cms_content where id = 'pages';
  end if;
end $$;

-- Initial public records. These values are deployment data, not frontend mock
-- objects. ON CONFLICT DO NOTHING preserves migrated rows and every CMS edit.
insert into public.pages (
  slug, title, content, featured_image, hero_title, hero_eyebrow,
  hero_description, status, layout, navigation_label,
  show_in_navigation, sort_order, seo_title, seo_description
)
values
(
  'home', 'Home',
  '{"body":"","homeStatement":"There is a moment when the plains stop being scenery and become something felt. We design every journey around that moment.","conservationStatement":"Every expedition contributes directly to land leases, guide education and community-led conservation in the places we travel."}'::jsonb,
  'https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'East Africa, unhurried.', 'Private journeys across Kenya and Tanzania',
  'Private safaris shaped by the migration, not the clock.', 'published', 'home',
  'Home', false, 0,
  'Olkinyei Expeditions | Private Luxury Safaris',
  'Private, conservation-led luxury safaris across Kenya and Tanzania.'
),
(
  'about', 'Our Story', '{"body":""}'::jsonb,
  'https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'Born here. Still led by wonder.', 'OUR STORY',
  'An independent East African company creating private journeys with deep local knowledge and a light footprint.',
  'published', 'about', 'Our Story', true, 10,
  'Our Story | Olkinyei Expeditions', 'The story of Olkinyei Expeditions.'
),
(
  'safari-experiences', 'Safari Experiences', '{"body":""}'::jsonb,
  'https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'Journeys measured in moments.', 'PRIVATE SAFARIS',
  'Signature routes, each privately guided and shaped around your pace.',
  'published', 'experiences', 'Safaris', true, 20,
  'Private Safari Experiences | Olkinyei', 'Private safari routes across East Africa.'
),
(
  'destinations', 'Destinations', '{"body":""}'::jsonb,
  'https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'The map is only the beginning.', 'KENYA + TANZANIA',
  'From volcanic highlands to endless grassland, explore the places that shape our journeys.',
  'published', 'destinations', 'Destinations', true, 30,
  'Kenya & Tanzania Destinations | Olkinyei', 'Destinations across Kenya and Tanzania.'
),
(
  'journal', 'Field Notes & Journal', '{"body":""}'::jsonb,
  'https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'Notes from a living landscape.', 'FIELD NOTES & JOURNAL',
  'Stories, practical knowledge and photographs carried back from the bush.',
  'published', 'journal', 'Field Notes & Journal', true, 40,
  'Field Notes and Journal | Olkinyei', 'Field notes and photography from East Africa.'
),
(
  'contact', 'Contact & Booking', '{"body":""}'::jsonb,
  'https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&w=1600',
  'Your safari starts with a conversation.', 'PRIVATE JOURNEY DESIGN',
  'Share a few details. One dedicated designer will shape a thoughtful first proposal within one business day.',
  'published', 'contact', 'Plan Your Journey', true, 50,
  'Plan Your Safari | Olkinyei', 'Plan your private safari with Olkinyei.'
)
on conflict (slug) do nothing;

-- `cms_content` now has one responsibility: global site settings.
do $$
begin
  if to_regclass('public.cms_content') is not null then
    alter table public.cms_content drop constraint if exists cms_content_id_check;
    alter table public.cms_content
      add constraint cms_content_id_check check (id = 'site_settings');
  end if;
end $$;

-- Realtime keeps CMS and public tabs synchronized.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'pages'
     ) then
    alter publication supabase_realtime add table public.pages;
  end if;
end $$;

-- Verification:
--   select column_name, data_type from information_schema.columns
--     where table_schema = 'public' and table_name = 'pages' order by ordinal_position;
--   select slug, status, layout from public.pages order by sort_order;
--   select lower(slug), count(*) from public.pages group by 1 having count(*) > 1;
--   select * from public.cms_content where id = 'pages'; -- must return 0 rows
-- ============================================================================

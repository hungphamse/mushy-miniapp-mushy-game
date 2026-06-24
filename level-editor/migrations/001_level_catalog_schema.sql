-- Level-editor catalog schema.
--
-- Apply this migration separately to each editor-owned Supabase project
-- (for example: dev/staging first, then production). Unlike Mushy miniapp
-- runtime schemas, the editor-owned Supabase project does not auto-create a
-- dev schema.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.compute_level_number(puzzle_date date, launch_date date)
returns integer
language sql
immutable
strict
as $$
  select (puzzle_date - launch_date)::integer + 1;
$$;

comment on function public.compute_level_number(date, date) is
  'Immutable V1 daily level numbering from a game launch date. Do not duplicate this logic in app backends.';

create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  description text null,
  icon text null,
  status text not null default 'active',
  launch_date date not null,
  has_timer boolean not null default false,
  score_direction text null,
  generator_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint games_launch_date_valid check (launch_date >= date '2020-01-01'),
  constraint games_status_check check (status in ('active', 'inactive', 'archived')),
  constraint games_score_direction_check check (score_direction in ('asc', 'desc') or score_direction is null)
);

comment on table public.games is
  'Editor-owned catalog of puzzle games exposed to Mushy Game through level-editor HTTP APIs.';

insert into public.games (
  slug,
  display_name,
  description,
  icon,
  status,
  launch_date,
  has_timer,
  score_direction,
  generator_version
) values (
  'word-guess',
  'Đoán Từ',
  'Wordle-style daily word guessing game.',
  'ion:text-outline',
  'active',
  date '2026-06-24',
  false,
  'asc',
  'v1'
) on conflict (slug) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  icon = excluded.icon,
  status = excluded.status,
  launch_date = excluded.launch_date,
  has_timer = excluded.has_timer,
  score_direction = excluded.score_direction,
  generator_version = excluded.generator_version,
  updated_at = now();

create table public.daily_levels (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  puzzle_date date not null,
  level_number integer not null,
  source text not null default 'generated',
  publish_status text not null default 'draft',
  content jsonb not null,
  content_hash text null,
  generator_version text not null default 'v1',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz null,
  constraint daily_levels_source_check check (source in ('generated', 'custom')),
  constraint daily_levels_publish_status_check check (publish_status in ('draft', 'published', 'archived')),
  constraint daily_levels_content_object check (jsonb_typeof(content) = 'object'),
  constraint daily_levels_level_number_positive check (level_number > 0),
  constraint daily_levels_unique_date unique (game_id, puzzle_date),
  constraint daily_levels_unique_number unique (game_id, level_number)
);

comment on table public.daily_levels is
  'Published and draft daily levels. level_number is stored from the editor-owned schema, not computed by application code.';
comment on column public.daily_levels.level_number is
  'Stored value assigned by set_daily_level_number() from the game launch date. Mushy Game reads this value from level bundles.';

create table public.editor_assets (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique,
  filename text null,
  mime_type text not null,
  size_bytes integer not null,
  width integer null,
  height integer null,
  alt_text text null,
  tags text[] not null default '{}',
  game_slug text null references public.games(slug) on update cascade on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint editor_assets_object_key_format check (object_key ~ '^assets/[a-z0-9-]+/[0-9]{4}/[0-9]{2}/[^/]+$'),
  constraint editor_assets_mime_type_check check (mime_type <> ''),
  constraint editor_assets_size_positive check (size_bytes > 0),
  constraint editor_assets_dimensions_positive check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint editor_assets_status_check check (status in ('pending', 'ready', 'archived'))
);

comment on table public.editor_assets is
  'Editor-owned asset metadata. Persist object_key only; derive short-lived URLs when needed.';
comment on column public.editor_assets.object_key is
  'Canonical asset reference stored in level content fields such as imageObjectKey. Never persist public URLs.';

create table public.level_asset_refs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.editor_assets(id) on delete cascade,
  daily_level_id uuid null references public.daily_levels(id) on delete cascade,
  game_slug text not null references public.games(slug) on update cascade on delete restrict,
  puzzle_date date not null,
  level_id uuid null,
  content_path text not null,
  created_at timestamptz not null default now(),
  constraint level_asset_refs_content_path_check check (content_path <> ''),
  constraint level_asset_refs_unique_path unique (asset_id, game_slug, puzzle_date, content_path)
);

comment on table public.level_asset_refs is
  'References from saved level JSON paths to editor asset object keys. level_id is optional cross-project metadata and is not a foreign key.';

create table public.editor_service_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  constraint editor_service_tokens_label_check check (btrim(label) <> ''),
  constraint editor_service_tokens_prefix_check check (length(token_prefix) between 6 and 32),
  constraint editor_service_tokens_scope_count check (coalesce(array_length(scopes, 1), 0) > 0),
  constraint editor_service_tokens_scopes_check check (
    scopes <@ array['catalog:read', 'asset:read']::text[]
  )
);

comment on table public.editor_service_tokens is
  'Custom level-editor service tokens for Mushy Game runtime HTTP API access. Store hashes only, never raw tokens.';
comment on column public.editor_service_tokens.token_hash is
  'Hash/HMAC of the raw token. The raw token is shown once by owner-only APIs and is not persisted.';

create index daily_levels_game_date_status_idx
  on public.daily_levels (game_id, puzzle_date, publish_status);
create index daily_levels_game_level_number_idx
  on public.daily_levels (game_id, level_number);
create index editor_assets_status_created_idx
  on public.editor_assets (status, created_at desc);
create index editor_assets_game_slug_idx
  on public.editor_assets (game_slug) where game_slug is not null;
create index editor_assets_tags_idx
  on public.editor_assets using gin (tags);
create index level_asset_refs_level_idx
  on public.level_asset_refs (game_slug, puzzle_date);
create index level_asset_refs_asset_idx
  on public.level_asset_refs (asset_id);
create index editor_service_tokens_active_idx
  on public.editor_service_tokens (revoked_at, expires_at);
create index editor_service_tokens_scopes_idx
  on public.editor_service_tokens using gin (scopes);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_daily_level_number()
returns trigger
language plpgsql
as $$
declare
  game_launch_date date;
begin
  select launch_date
    into game_launch_date
    from public.games
   where id = new.game_id;

  if game_launch_date is null then
    raise exception 'Cannot assign level number: game % does not exist', new.game_id;
  end if;

  if new.puzzle_date < game_launch_date then
    raise exception 'Cannot assign level number before game launch date %', game_launch_date;
  end if;

  new.level_number = public.compute_level_number(new.puzzle_date, game_launch_date);
  return new;
end;
$$;

create or replace function public.prevent_game_launch_date_change()
returns trigger
language plpgsql
as $$
begin
  if old.launch_date is distinct from new.launch_date
     and exists (
       select 1
         from public.daily_levels
        where game_id = old.id
        limit 1
     ) then
    raise exception 'Cannot change launch_date for game % after daily levels exist', old.slug;
  end if;

  return new;
end;
$$;

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

create trigger games_prevent_launch_date_change
before update of launch_date on public.games
for each row execute function public.prevent_game_launch_date_change();

create trigger daily_levels_set_level_number
before insert or update of game_id, puzzle_date on public.daily_levels
for each row execute function public.set_daily_level_number();

create trigger daily_levels_set_updated_at
before update on public.daily_levels
for each row execute function public.set_updated_at();

create trigger editor_assets_set_updated_at
before update on public.editor_assets
for each row execute function public.set_updated_at();

alter table public.games enable row level security;
alter table public.daily_levels enable row level security;
alter table public.editor_assets enable row level security;
alter table public.level_asset_refs enable row level security;
alter table public.editor_service_tokens enable row level security;

revoke all on table public.games from anon, authenticated;
revoke all on table public.daily_levels from anon, authenticated;
revoke all on table public.editor_assets from anon, authenticated;
revoke all on table public.level_asset_refs from anon, authenticated;
revoke all on table public.editor_service_tokens from anon, authenticated;
revoke all on function public.compute_level_number(date, date) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_daily_level_number() from public, anon, authenticated;
revoke all on function public.prevent_game_launch_date_change() from public, anon, authenticated;

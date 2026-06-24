import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve('migrations', '001_level_catalog_schema.sql');
const sql = readFileSync(migrationPath, 'utf8');

const requiredSnippets = [
  'create or replace function public.compute_level_number',
  'puzzle_date - launch_date',
  'create table if not exists public.games',
  'launch_date date not null',
  "constraint games_launch_date_valid check (launch_date >= date '2020-01-01')",
  "insert into public.games",
  "'word-guess'",
  'now()::date',
  'the first time defines level 001 as the migration application',
  'Re-running the migration keeps',
  'create table if not exists public.daily_levels',
  'level_number integer not null',
  'create or replace function public.set_daily_level_number',
  'new.level_number = public.compute_level_number(new.puzzle_date, game_launch_date)',
  'create or replace function public.prevent_game_launch_date_change',
  'create trigger games_prevent_launch_date_change',
  'create trigger daily_levels_set_level_number',
  'drop trigger if exists games_set_updated_at',
  'create index if not exists daily_levels_game_date_status_idx',
  'create table if not exists public.editor_assets',
  'object_key text not null unique',
  'create table if not exists public.level_asset_refs',
  'create table if not exists public.editor_service_tokens',
  'token_hash text not null unique',
  "'catalog:read'",
  "'asset:read'",
  'alter table public.games enable row level security',
  'alter table public.daily_levels enable row level security',
  'alter table public.editor_assets enable row level security',
  'alter table public.level_asset_refs enable row level security',
  'alter table public.editor_service_tokens enable row level security',
  'revoke all on table public.editor_service_tokens from anon, authenticated',
  'revoke all on function public.set_daily_level_number() from public, anon, authenticated',
  'revoke all on function public.prevent_game_launch_date_change() from public, anon, authenticated',
];

const forbiddenSnippets = [
  "date '2026-01-01'",
  'level_number integer generated always as',
  'compute_level_number(puzzle_date)',
  'launch_date = excluded.launch_date',
];

const missing = requiredSnippets.filter((snippet) => !sql.includes(snippet));

if (missing.length > 0) {
  console.error('Schema verification failed. Missing required snippets:');
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

const forbiddenFound = forbiddenSnippets.filter((snippet) => sql.includes(snippet));

if (forbiddenFound.length > 0) {
  console.error('Schema verification failed. Forbidden legacy snippets found:');
  for (const snippet of forbiddenFound) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log('Schema verification passed.');

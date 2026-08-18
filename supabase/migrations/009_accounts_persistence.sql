-- Milestone 6: accounts and user persistence hardening.
-- Authenticated identity, private activity rows, and profile ownership are distinct from
-- verified trail publication, GPS evidence, and segment completion state.

alter table public.profiles alter column is_public set default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_display_name_length_chk;
alter table public.profiles add constraint profiles_display_name_length_chk
  check (
    display_name is null
    or char_length(display_name) <= 120
  );
alter table public.profiles drop constraint if exists profiles_username_format_chk;
alter table public.profiles add constraint profiles_username_format_chk
  check (
    username is null
    or username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'
  );

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profile_updated_at();

-- SECURITY DEFINER is narrowly required because this trigger runs from auth.users
-- and inserts into public.profiles during sign-up. It does not expose a general app
-- mutation API, uses a fixed search_path, fully qualifies tables, and copies only a
-- safe provider display-name hint rather than arbitrary raw_user_meta_data.
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_display_name text;
begin
  safe_display_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  )), '');

  insert into public.profiles(id, display_name, is_public)
  values (new.id, left(safe_display_name, 120), false)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user_profile();

revoke execute on function public.handle_new_auth_user_profile() from public;
revoke execute on function public.handle_new_auth_user_profile() from anon;
revoke execute on function public.handle_new_auth_user_profile() from authenticated;
revoke execute on function public.set_profile_updated_at() from public;
revoke execute on function public.set_profile_updated_at() from anon;
revoke execute on function public.set_profile_updated_at() from authenticated;

alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.segment_completions enable row level security;

drop policy if exists "public profiles are viewable" on public.profiles;
drop policy if exists "users create own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "anon can read public profiles" on public.profiles;
drop policy if exists "authenticated can read own and public profiles" on public.profiles;
drop policy if exists "authenticated can create own profile" on public.profiles;
drop policy if exists "authenticated can update own profile" on public.profiles;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;

create policy "anon can read public profiles"
  on public.profiles
  for select
  to anon
  using (is_public = true);

create policy "authenticated can read own and public profiles"
  on public.profiles
  for select
  to authenticated
  using (
    is_public = true
    or ((select auth.uid()) is not null and id = (select auth.uid()))
  );

create policy "authenticated can create own profile"
  on public.profiles
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and id = (select auth.uid())
  );

create policy "authenticated can update own profile"
  on public.profiles
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and id = (select auth.uid())
  )
  with check (
    (select auth.uid()) is not null
    and id = (select auth.uid())
  );

drop policy if exists "users read own activities" on public.activities;
drop policy if exists "users create own activities" on public.activities;
drop policy if exists "users update own activities" on public.activities;
drop policy if exists "users delete own activities" on public.activities;
drop policy if exists "authenticated can read own activities" on public.activities;
drop policy if exists "authenticated can create own activities" on public.activities;
drop policy if exists "authenticated can update own activities" on public.activities;
drop policy if exists "authenticated can delete own activities" on public.activities;

revoke all on public.activities from public, anon, authenticated;
grant select, insert, update, delete on public.activities to authenticated;

create policy "authenticated can read own activities"
  on public.activities
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy "authenticated can create own activities"
  on public.activities
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy "authenticated can update own activities"
  on public.activities
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  )
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

create policy "authenticated can delete own activities"
  on public.activities
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

drop policy if exists "users read own completions" on public.segment_completions;
drop policy if exists "users create own completions" on public.segment_completions;
drop policy if exists "users update own completions" on public.segment_completions;
drop policy if exists "users delete own completions" on public.segment_completions;
drop policy if exists "authenticated can read own completions" on public.segment_completions;

revoke all on public.segment_completions from public, anon, authenticated;
grant select on public.segment_completions to authenticated;

create policy "authenticated can read own completions"
  on public.segment_completions
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
  );

-- Completion evidence remains controlled evidence persistence for M6.
-- GPS/activity evidence is not completion state, and M7 will introduce any user
-- completion mutation contract deliberately.
revoke all on public.activity_match_runs from public, anon, authenticated;
revoke all on public.activity_segment_match_candidates from public, anon, authenticated;
revoke all on public.activity_segment_match_review_decisions from public, anon, authenticated;
revoke all on public.completion_evidence from public, anon, authenticated;


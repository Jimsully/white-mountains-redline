# Accounts and User Persistence

Milestone 6 adds real Supabase Auth and durable profile persistence. It establishes who the user is and which private rows belong to that user. It does not create completion records, promote GPS evidence, or change the verified publication pipeline.

## Environment

Browser and SSR auth use only public Supabase configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`NEXT_PUBLIC_SUPABASE_ANON_KEY` remains an explicit compatibility fallback for older deployments. Do not add any `NEXT_PUBLIC_*SERVICE_ROLE*` variable.

`SUPABASE_SERVICE_ROLE_KEY` is only for controlled server-side/admin import and publication tooling. It is never browser auth, never exposed to client components, and is not needed for ordinary profile writes.

When public Supabase auth config is absent, the public map and demo trail repository continue to work. `/login` renders a configuration-unavailable state, the auth proxy no-ops, and `/account` cannot accidentally become a fake signed-in page. Authentication runtime configuration is stricter than public trail-read configuration: production sign-in requires a valid HTTPS `NEXT_PUBLIC_SITE_URL` for OAuth and magic-link callback URLs, while development/test may use the fixed trusted `http://localhost:3000` fallback.

## Session Architecture

The App Router uses `@supabase/ssr` cookie-backed clients:

- `lib/supabase/client.ts` creates a browser client only when public config exists.
- `lib/supabase/server.ts` creates a server client from request cookies and verifies users with `auth.getUser()`.
- `proxy.ts` refreshes Supabase cookies and preserves response cookies. It skips static/generated assets and safely no-ops without config.

Protected routes must verify the session server-side. UI code must not trust arbitrary cookie payloads.

## Routes

- `/login` supports email magic links, Google OAuth, and Apple OAuth.
- `/auth/callback` exchanges PKCE/code callbacks and accepts only safe same-origin relative return paths.
- `/auth/sign-out` signs out and redirects to a safe relative path.
- `/account` is protected and allows editing `display_name`, `username`, and `is_public`.

## Profile Persistence

`public.profiles` stores public-safe profile fields only:

- `id`, owned by `auth.users(id)`
- optional `username`
- optional `display_name`
- `is_public`
- timestamps

Email addresses, tokens, raw JWTs, provider secrets, and arbitrary auth metadata are not stored in profiles.

Usernames are optional. When present they are canonical lowercase values matching `^[a-z0-9][a-z0-9_-]{2,31}$`. The application validates this before writes and migration 009 enforces it at the database boundary.

Profile creation is idempotent. Migration 009 adds a narrowly scoped `SECURITY DEFINER` trigger on `auth.users` because auth user creation must insert into `public.profiles`. The function uses a safe search path, fully-qualified table references, revokes direct execution from public roles, and copies only a safe provider name hint into `display_name`.

## Ownership And RLS

Migration 009 replaces the original broad policies with explicit role-targeted policies.

Profiles:

- anon can read only public profiles
- authenticated users can read their own profile and public profiles
- authenticated users can insert/update only their own profile
- authenticated users cannot delete profiles directly

Activities:

- anon has no access
- authenticated users can select/insert/update/delete only their own rows
- update policies include both `USING` and `WITH CHECK` so ownership cannot change

Segment completions:

- M6 grants only own-row historical select compatibility to authenticated users
- authenticated insert/update/delete privileges are revoked
- M7 will deliberately introduce the completion mutation contract

Completion evidence and activity-matching review tables remain service/admin controlled. GPS evidence is not completion state.

## Product Boundary

The public map remains anonymous and uses the verified/demo trail network without requiring login. Account persistence is only for private user state. Verified publication, authenticated user identity, activity evidence, and completion are separate concepts.

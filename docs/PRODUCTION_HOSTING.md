# Production Hosting Readiness

M8D-A prepares this repository for a later human-operated Vercel and production Supabase cutover. It does not deploy, configure DNS, create a Vercel project, connect production Supabase, configure auth redirects, or apply migrations.

## Approved Architecture

```text
jamesscottsullivan.com
  static portfolio deployment

trails.jamesscottsullivan.com
  Next.js Redline application on Vercel

Supabase
  Postgres/PostGIS, Auth, RLS, RPCs, and public trail projection

External map provider
  configurable MapLibre style service, initially MapTiler Cloud
```

Do not merge the portfolio repository into this app. Do not configure a `/redline` `basePath` or reverse proxy for M8D.

The approved production app URL is:

```text
NEXT_PUBLIC_SITE_URL=https://trails.jamesscottsullivan.com
```

The generic M8C URL helper remains full-base/path-prefix capable for future hosting flexibility.

## Vercel Readiness

Use the normal Vercel Next.js framework preset unless a future concrete requirement says otherwise.

- Install command: `npm ci`
- Build command: `npm run build`
- Output: standard `.next` output managed by the Vercel Next.js builder
- Runtime start command: Vercel-managed, not `npm run start`

No `vercel.json` is currently required. The app uses supported Next.js 16 conventions:

- App Router routes under `app/`
- server components for public pages
- server actions for login and completion mutations
- route handlers for `/auth/confirm`, `/auth/callback`, and `/auth/sign-out`
- root `proxy.ts` for Supabase SSR cookie refresh
- Supabase SSR cookies via `@supabase/ssr`
- metadata routes for `robots.txt` and `sitemap.xml`
- `generateStaticParams()` for trail detail pages
- client-side MapLibre maps
- authenticated completion writes through the existing repository/action/RPC boundaries

Production SEO/indexing behavior is build-sensitive. Rebuild after changing `NEXT_PUBLIC_SITE_URL`, repository mode, public Supabase config, public map style config, or public-indexing opt-in state.

## Admin Route Contract

`/admin/*` is development-only web tooling for reconciliation, segment construction, activity matching, and publication review. The public production application does not expose a web-admin interface.

Production-like runtimes with `NODE_ENV=production`, including Vercel Production, Vercel Preview, and local `next build` plus `next start`, return the normal not-found experience for `/admin/*` before admin page content renders. Production administration and publication remain controlled server-side workflows, not public web pages.

Robots/noindex are crawler guidance only. They are not the security boundary for admin tooling.

## Environment Contract

Hosted public application variables:

- `NEXT_PUBLIC_SITE_URL`: full public app base URL. Production value is `https://trails.jamesscottsullivan.com`.
- `TRAIL_REPOSITORY`: must be `supabase` for public production.
- `NEXT_PUBLIC_SUPABASE_URL`: production Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: preferred browser-safe public key.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: compatibility fallback only if publishable key is not available.
- `NEXT_PUBLIC_MAP_STYLE_URL`: hosted MapLibre style URL. Initial provider direction is MapTiler Cloud.
- `PUBLIC_INDEXING_ENABLED`: server/build-only exact opt-in. Use `true` only after the final production promotion gate; leave false/absent everywhere else.
- `NODE_ENV`: host-managed; production builds run with production semantics.
- `VERCEL_ENV`: host-managed on Vercel. If present, public indexing requires `production`.

Do not configure these in the hosted public Next.js runtime:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` for service/admin loaders
- `RECONCILIATION_ARTIFACT_PATH`
- `SEGMENT_CONSTRUCTION_ARTIFACT_PATH`
- `ACTIVITY_MATCHING_ARTIFACT_PATH`
- `PUBLICATION_ARTIFACT_PATH`
- private challenge inventory paths
- private activity paths
- private/admin loader credentials

A service-role key is never required by the ordinary hosted application runtime.

## Map Provider Contract

Browser maps use MapLibre and a provider-neutral `NEXT_PUBLIC_MAP_STYLE_URL`. Production must point this at a hosted MapLibre style URL rather than OpenStreetMap community raster tiles.

Approved initial provider direction: MapTiler Cloud with MapLibre. A MapTiler browser key is public client configuration, not a server secret. Restrict the key by domain in MapTiler or the chosen provider where available.

Production `NEXT_PUBLIC_MAP_STYLE_URL` is build-sensitive public browser configuration. It must be a valid absolute HTTPS URL for a public provider endpoint, with no embedded username/password credentials and no localhost, loopback, private-network, link-local, or `.local` host. Query-string public browser API keys are allowed but visible to browsers.

Local development may omit `NEXT_PUBLIC_MAP_STYLE_URL`; in that case the app uses a clearly development-only OpenStreetMap community raster fallback with OSM attribution. Development can use local/private test style URLs when useful. Production never falls back to that service. Missing, malformed, invalid, or unavailable production map style config causes the browser map to show a visible error and avoids consuming community tile infrastructure.

Future outdoor, topographic, or satellite style choices should be made by changing the provider style URL, not by rewriting the renderer. Satellite imagery is out of scope for M8D-A.

## Indexing Safety

Public indexing is enabled only when all deterministic gates pass:

- `PUBLIC_INDEXING_ENABLED=true`
- if `VERCEL_ENV` is present, `VERCEL_ENV=production`
- `NODE_ENV=production`
- `NEXT_PUBLIC_SITE_URL` is valid HTTPS
- `TRAIL_REPOSITORY=supabase`
- public Supabase URL plus publishable/anon key are present

Preview, staging, and production before final data/smoke approval must leave `PUBLIC_INDEXING_ENABLED=false` or absent. Enable it only for the approved production deployment at `https://trails.jamesscottsullivan.com` after the final hostname is configured, production Supabase is ready, real non-demo published data is loaded, and smoke tests pass. A Vercel Preview deployment must remain non-indexable even if someone accidentally copies `PUBLIC_INDEXING_ENABLED=true` into Preview variables, because `VERCEL_ENV=preview` fails the gate. Outside Vercel, absence of `VERCEL_ENV` does not block an otherwise explicitly approved production deployment.

Do not treat robots/noindex as security, and do not use indexing eligibility as a substitute for the production data gate.

## Supabase Predeploy Gate

Before production cutover, explicitly designate the production Supabase project and verify migrations `001` through `013` are applied in order and in the expected state.

Pay special attention to:

- `007_activity_matching.sql`: creates completion evidence tables used later by reviewed GPS evidence.
- `009_accounts_persistence.sql`: hardens profiles and private activities.
- `010_completion_workflow.sql`: defines manual completion RLS and verified segment checks.
- `011_reviewed_evidence_materialization.sql`: materializes reviewed evidence through controlled service-role tooling.
- `012_evidence_confirmation.sql`: adds sanitized owner-only evidence list and explicit confirmation RPCs.
- `013_public_projection_hardening.sql`: makes `trail_segment_api` the only direct trail-network relation available to browser roles.

Migrations 011-013 have passed disposable local/runtime acceptance only. Do not describe them as production deployed until verified in the production Supabase project.

Migration 013 smoke acceptance must verify:

- anon and authenticated roles can `SELECT public.trail_segment_api`
- anon and authenticated roles cannot directly `SELECT public.trails`
- anon and authenticated roles cannot directly `SELECT public.trail_segments`
- `service_role` retains required administrative/publication access
- the projection exposes only verified public rows
- `SECURITY DEFINER`, owner-rights, `security_barrier`, RLS, and grant semantics match the documented contract

## Production Data Gate

Before public production promotion:

- `TRAIL_REPOSITORY=supabase`
- no demo artifact supplies public production trail content
- all public trail content is independently sourced and public-safe
- only verified and human-reviewed published rows are exposed
- the challenge inventory may be incomplete, but the app must not imply completeness
- map and trail pages remain `NOT FOR NAVIGATION`

M9 will address full challenge inventory and edition/versioning.

## Supabase Auth Checklist

Production Supabase Auth configuration for the approved host:

- Site URL: `https://trails.jamesscottsullivan.com`
- Required callback/redirect: `https://trails.jamesscottsullivan.com/auth/callback`
- Required email confirmation redirect: `https://trails.jamesscottsullivan.com/auth/confirm`

Actual app redirects:

- email Auth redirect destination generated by the app: `https://trails.jamesscottsullivan.com/auth/confirm?returnTo=<safe-relative-path>`
- Google OAuth redirect, if configured: `https://trails.jamesscottsullivan.com/auth/callback?returnTo=<safe-relative-path>`
- Apple OAuth redirect, if configured: `https://trails.jamesscottsullivan.com/auth/callback?returnTo=<safe-relative-path>`

`returnTo` is sanitized to same-app relative paths only. Do not permit arbitrary external redirects.

Production email Auth uses Supabase's SSR token-hash flow. `/auth/confirm` accepts `token_hash` and the supported email OTP type values `email`, `signup`, and `magiclink`; calls `supabase.auth.verifyOtp(...)` through the existing server SSR client; writes the resulting session into Supabase SSR cookies; redirects to the safe relative `returnTo` on success; and redirects to `/login?status=auth-error&returnTo=<safe-relative-path>` on verification failure. `/auth/callback` remains the Google/Apple OAuth authorization-code callback and continues to use `exchangeCodeForSession`.

Supabase Email Templates must be changed by a human operator after this code is deployed. Use these links in both relevant templates:

Confirm signup:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirm email address</a>
```

Magic Link:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Sign in</a>
```

This contract depends on the app-generated `emailRedirectTo` value already containing `/auth/confirm?returnTo=<safe-relative-path>`. Do not use arbitrary external return destinations, do not add broad preview-domain redirect patterns to production Auth, and do not send users to `/auth/callback` from email templates.

Preview/staging callback strategy should be configured separately when stable staging auth testing is needed. Do not point production OAuth providers at arbitrary preview URLs.

## Hosted Public Security Contract

- Supabase publishable/anon keys may be client-visible.
- RLS, grants, RPC ownership, and sanitized projections are the data security boundary.
- Robots/noindex are crawler guidance only, not security.
- `/admin/*` web routes are development-only and return not-found in production-like runtimes, including Vercel Preview. Future production admin functionality requires a separate explicit security design.
- Private artifact paths remain blocked in production.
- Evidence RPCs remain owner-scoped and sanitized.
- Completion RPC/action semantics remain unchanged.
- The service-role key must not be in Vercel public or private runtime env for the public app.

## Production Smoke Test Checklist

Public:

- `/`
- `/trails`
- search/filter
- `/trails/[trailSlug]`
- map tiles/styles
- map attribution
- map segment geometry
- `robots.txt`
- `sitemap.xml`
- canonical metadata

Auth:

- `/login`
- email magic-link/new-user confirmation through `/auth/confirm`
- Google OAuth if configured
- Apple OAuth if configured
- `/auth/callback`
- `/account`
- logout

Production email-auth acceptance procedure after deployment and human Supabase template/redirect configuration:

- Confirm Site URL is exactly `https://trails.jamesscottsullivan.com`.
- Confirm Redirect URLs include exactly the production OAuth callback and email confirmation route: `https://trails.jamesscottsullivan.com/auth/callback` and `https://trails.jamesscottsullivan.com/auth/confirm`.
- Confirm the Confirm signup template uses the `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email` link above.
- Confirm the Magic Link template uses the `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email` link above.
- From `/account/login` or `/login?returnTo=%2Faccount`, request a link for a new test email and click the Confirm signup email link.
- Verify the browser lands on `/account`, is signed in, and the URL contains no `token_hash`, access token, refresh token, or Supabase error fragment.
- Sign out, request another email link for the same address, and click the Magic Link email link.
- Verify the browser lands on `/account`, is signed in, and the URL contains no auth token material.
- Attempt `returnTo=https://evil.example/` through the login form/request path and verify success or failure stays on `trails.jamesscottsullivan.com`.
- Confirm Google and Apple OAuth still land through `/auth/callback` if those providers are configured.

Completion:

- manual completion
- manual uncompletion if supported
- reviewed GPS evidence list
- explicit evidence confirmation
- completion persistence after reload

Security:

- anon public projection
- base-table denial
- cross-user/private evidence denial
- admin access control
- service-role key not browser exposed

SEO:

- Vercel reports `VERCEL_ENV=production` when applicable
- public indexing opt-in is in the expected state
- preview URL remains noindex
- production URL remains noindex before data/smoke promotion
- production becomes indexable only after data/smoke approval and `PUBLIC_INDEXING_ENABLED=true`
- production canonical host
- indexability only when data gate passes
- no demo URLs

Map:

- production map style loads
- provider/domain restrictions work for the approved host
- bad provider configuration gives a visible map error instead of a blank map

Mobile:

- basic responsive smoke test for map, directory, trail detail, login, and account flows

## Rollback Expectations

Application problem: use Vercel deployment rollback to restore the previous production deployment.

DNS problem: restore or remove the subdomain record as appropriate.

Database problem: do not casually reverse migrations. Prefer application rollback, disable public promotion/indexing, and investigate against the predeploy checklist.

Bad published data: stop indexing/public promotion and correct publication data through the approved publication workflow.

Do not write destructive rollback SQL as part of routine first response.

## Cutover Blockers

Public cutover remains blocked until:

- a Vercel project is created and configured by a human operator
- `trails.jamesscottsullivan.com` DNS/domain setup is completed
- production Supabase is explicitly designated
- migrations 001-013 are verified/applied in production order
- production Supabase Auth Site URL and callbacks are configured
- production MapTiler/provider style URL and browser-safe key are configured with provider-side domain restrictions where available
- verified public non-demo trail data is loaded through the approved workflow
- production smoke tests pass
- `PUBLIC_INDEXING_ENABLED=true` is intentionally set only after the data gate and smoke tests pass

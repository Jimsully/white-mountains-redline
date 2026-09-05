# M8E Closeout

## Status

M8E responsive/accessibility/design polish is complete at the repository level. This was a targeted audit and hardening pass, not a redesign. The production identity, segment-oriented behavior, completion ownership, and explicit evidence-confirmation semantics remain unchanged.

The live M8D-C deployment had already passed human public/auth/account acceptance, including a new-user flow with an email address that had never used the site. This closeout did not deploy or mutate production.

## Audit coverage

The review covered the home map/progress experience, segment map/list synchronization, public directory and detail routes, login/account/profile surfaces, manual completion, evidence confirmation, primary navigation, map loading/failure behavior, directory/account empty and error states, production admin guards, repository selection, and the public database projection.

Responsive rules were evaluated for representative phone (320-430px), tablet (768-900px), laptop, and wide layouts from component structure and CSS breakpoint behavior. Local `/` and `/trails` routes returned 200 during the audit. The in-app browser had no available session, so fresh screenshot, keyboard, and touch-gesture execution could not be performed in this session; the post-deploy manual smoke below remains recommended release verification rather than a known product defect.

## Issues found and resolved

| Area | Finding | Resolution |
| --- | --- | --- |
| Environment labeling | The main map always said `PROTOTYPE`, while demo directory/detail pages described sample data as verified public data. | Runtime mode now drives consistent demo vs. production copy on map, directory, detail, and detail-map surfaces. |
| Hosted production safety | An incomplete production Supabase configuration could silently serve the demo repository. | Vercel Production now fails closed; an explicitly selected but incomplete Supabase adapter also fails closed in every environment. Development and Preview demo workflows remain available. |
| Public data minimization | The public view and repository could expose/fetch full internal publication provenance and source-review metadata. | Migration 014 defines a minimal public view; the adapter requests an exact field allowlist and rejects rows outside the verified/human-verified gate. Internal provenance remains protected on base tables. |
| Contrast/focus | Muted small text and the translucent focus ring did not consistently meet their intended contrast. | Darker muted text and an opaque high-contrast focus token now cover links, controls, textareas, and focusable map elements. |
| Semantics | Filter state was visual-only, progress lacked numeric progress semantics, and home section labels were generic elements. | Added `aria-pressed`, progressbar min/max/value text, real section headings, labeled filter/list groups, live completion state, and busy state. |
| Map accessibility | Essential list equivalence was implicit and map loading looked like an inert gray area. | Maps expose named regions, reference non-map/list alternatives, and announce loading/error state. Essential trail/progress facts remain outside the map. |
| Mobile interaction | Core controls were commonly 34-42px, the segment list contained scroll chaining, and maps could capture one-finger page scrolling. | Core public/auth/completion targets are at least 44px, narrow list scrolling chains to the page, coarse-pointer maps use cooperative gestures, and MapLibre controls enlarge for touch. |
| Mobile viewport | Fixed `vh` assumptions and the 800px split breakpoint could produce cramped portrait-tablet maps or mobile browser chrome conflicts. | Core surfaces use dynamic viewport units with fallbacks; the map/list layout stacks through 900px and uses a bounded mobile map height. |
| Detail-map overlay | The absolute error/badge layer could overlap the figure caption. | A positioned map viewport now contains loading/error/badge overlays separately from the caption. |
| Motion | The progress fill continued animating under reduced-motion preferences. | The transition is disabled under `prefers-reduced-motion: reduce`; existing map/list motion checks remain intact. |

## Regression protection

Focused tests cover responsive/accessibility source contracts, correct demo/production copy, repository fail-closed behavior, verified-only adapter mapping, exact public field selection, and the migration-014 public allowlist. Existing completion, evidence, RLS/grant, admin-runtime, SEO, trail rendering, map/list synchronization, and publication tests remain authoritative for unchanged behavior.

## Deferred non-blocking polish

- Re-run hands-on viewport, keyboard, and coarse-pointer smoke checks after deployment at 320, 390, 768, 900, 1280, and wide-desktop widths. No browser session was available during this closeout.
- With the full M9 inventory, revisit long-list keyboard efficiency (skip target or roving navigation) and list virtualization/performance. The current list remains operable with native buttons.
- Route-wide custom loading/error boundaries and pending states for profile/login submissions may be added if production latency demonstrates a need. Map and existing form/error states now cover the highest-value cases.
- Authenticated directory progress filters remain later product polish; the directory intentionally stays public-first.

## Post-deploy smoke checklist

- Confirm production displays `NOT FOR NAVIGATION` without `DEMO`/`PROTOTYPE`; development demo surfaces display explicit demo warnings.
- Verify `/`, `/trails`, one trail detail page, `/login`, and `/account` at the representative widths above with no horizontal overflow or obscured controls.
- Keyboard through primary navigation, filters, segment list, selected completion action, login/profile forms, and evidence confirmation; confirm visible focus and logical order.
- On a touch device, scroll past the segment list and maps without a one-finger page-scroll trap; verify two-finger/cooperative map gestures.
- Apply migration 014 through the reviewed production process before deploying the adapter allowlist, then verify anon/authenticated projection columns and base-table denial.
- Reconfirm manual mark/unmark, explicit evidence confirmation, no cross-user access, production `/admin/*` 404 behavior, robots/sitemap, and verified-only public rows.

# Mend: rebrand, landing page, pricing, demo auth

Date: 2026-10-09
Status: awaiting review

## Goal

Turn the AutoHeal Ops dashboard in `frontend/` into **Mend**: one product with an
animated marketing landing page, a pricing section, demo multi-tenant sign-in, and
the existing operations console, all in the visual style of `ref/refv.mp4` and
using the wave mark in `ref/logo.jpg`.

Success means: a visitor lands on `/`, sees the animated hero, compares plans,
signs in to a workspace, and reaches the console, on phone, tablet and desktop,
with no change to backend behaviour.

## Out of scope

- Real authentication or authorisation. The backend stays unauthenticated.
- Real billing. All prices are placeholders.
- Any change to `backend/`, `itsm_portal/`, `rpa/` or `sandbox_app/`.
- A dark theme.

## Stated by the user

- App name is Mend; logo is `ref/logo.jpg`.
- `ref/refv.mp4` is the site reference; the result must be animated.
- Pricing tabs, dummy authentication, tenants.
- Responsive, animated, with micro-interactions.
- Plus Jakarta Sans, paired with a matching heading font.
- The reference look applies to the whole app, console included.

## Assumptions (stated to the user, not corrected)

- "Tenant logging" means tenant login plus a per-tenant access log.
- The hero illustration is original line art in the reference's style, not a copy
  of its characters.
- Pricing tabs are a Monthly / Yearly switch over three plans.
- Heading font is Bricolage Grotesque.

## Dependencies

Added to `frontend/package.json`:

- `react-router-dom` (routing)
- `motion` (React transitions and layout animation, imported from `motion/react`)
- dev: `vitest`, `jsdom` (unit tests for the auth store), with a `test` script

## Routes

| Path | Page | Access |
|------|------|--------|
| `/` | Landing: hero, how it works, features, pricing, footer | public |
| `/login` | Sign in / Create workspace tabs | public; redirects to `/app` if signed in |
| `/app` | Console (the existing dashboard) | signed in; otherwise redirects to `/login` |

`/login` reads `?mode=signup` and `?plan=starter|team|enterprise` to preselect the
tab and plan. Unknown paths redirect to `/`.

## File layout

```
frontend/src/
  main.jsx                 router + AuthProvider
  index.css                tokens, base, shared primitives
  styles/                  landing.css, auth.css, console.css
  auth/
    store.js               pure functions over a storage object (tested)
    store.test.js
    AuthContext.jsx        React wrapper around store.js
    RequireAuth.jsx
  pages/
    Landing.jsx
    Login.jsx
    Console.jsx            state and data flow from today's App.jsx
  components/
    Logo.jsx               wave mark as inline SVG
    HeroScene.jsx          looping SVG illustration
    Pricing.jsx
    SiteNav.jsx
    Reveal.jsx             scroll-reveal wrapper
    console/               Header, Sidebar, Dashboard, IncidentView, AuditLog,
                           AccessLog, shared bits (StatusPill, MetricChart, ...)
  api.js, hooks/useSSE.js  unchanged
```

`App.jsx` is removed; its logic moves to `pages/Console.jsx` and its view
components to `components/console/`. Behaviour, API calls and SSE handling are
carried over unchanged.

## Visual system

| Token | Value | Use |
|-------|-------|-----|
| paper | `#F5F1EC` | page surface, with a faint SVG grain |
| ink | `#12232E` | text, lines, outer frame |
| accent | `#E8622C` | highlight words, primary buttons, pulses |
| line | ink at 14% | hairline borders |
| muted | ink at 60% | secondary text |
| good / warn / bad | `#1F8A5B` / `#B7791F` / `#C8372D` | service status on cream |

- Fonts, loaded from Google Fonts in `index.html`: Bricolage Grotesque 700/800
  (headings, uppercase, tight tracking), Plus Jakarta Sans 400 to 700 (body),
  JetBrains Mono 400/500 (small labels, data).
- Desktop pages sit inside an ink frame with a small radius, as in the reference;
  the frame is dropped under 800px.
- Panels are paper with hairline ink borders and small radii. No glows or
  gradients.
- Charts use ink grid lines, accent for error rate and ink for latency.

## Hero scene

`HeroScene.jsx` is one inline SVG in ink line art with accent fills, looping on
CSS keyframes:

- a status grid whose cells flip between accent and ink on a staggered cycle;
- a central core built from the Mend wave mark, gently bobbing;
- service nodes joined by circuit paths, with accent pulses travelling along them
  (`stroke-dasharray` / `stroke-dashoffset`);
- one link that breaks (dashed, node turns accent) and is mended each cycle.

Hero text follows the reference layout: small mono side label, short intro
paragraph at the left, large uppercase headline with accent words, one primary
button. Headline lines rise in on load. The `Logo` waves draw in on load and
ripple on hover.

Under `prefers-reduced-motion: reduce`, loops stop on a static frame and
transitions become instant.

## Landing sections

1. **Hero** as above.
2. **How it works**: Detect, Diagnose, Guard, Mend. Four numbered steps taken
   from what the product does (watcher, agent hypotheses, guard and human
   approval, verified fix).
3. **Features**: a small grid of capabilities (hypothesis tracking, guarded fix
   catalog, human approval, RPA for legacy portals, audit trail, escalation).
4. **Pricing** (below).
5. **Footer** with logo, nav links and a note that this is a sandbox demo.

## Pricing

- Monthly / Yearly tabs with a sliding pill (`motion` layout animation). Yearly
  shows a "save 20%" tag.
- Plans: Starter $0; Team $49 per month, or $39 per month billed yearly
  (highlighted); Enterprise "Custom".
- Changing tab rolls the price to its new value.
- Each plan lists five or six features and a button linking to
  `/login?mode=signup&plan=<id>`.
- Tabs are a proper `tablist` with arrow-key support.

## Demo auth and tenants

All state lives in `localStorage`; `store.js` takes the storage object as a
parameter so it can be tested with a fake.

Keys: `mend.tenants`, `mend.session`, `mend.accessLog`.

Seeded tenants (created on first read):

| Slug | Name | Plan |
|------|------|------|
| `acme` | Acme Retail | team |
| `northwind` | Northwind Logistics | starter |
| `globex` | Globex Health | enterprise |

The demo user `ops@mend.test` / `mend-demo` is a member of all three.

Store API:

- `listTenants()`
- `signIn({ workspace, email, password })` returns a session, or throws
  `unknown_workspace` / `bad_credentials`
- `createWorkspace({ name, email, password, plan })` creates a tenant with a slug
  derived from the name, adds the user, signs in; throws `workspace_exists` or
  `invalid_input`
- `switchTenant(slug)` only to tenants the current email belongs to
- `signOut()`
- `getSession()`
- `getAccessLog(slug)`

Session shape: `{ email, tenant: { slug, name, plan }, signedInAt }`.

Access log entries: `{ ts, tenant, email, event, detail }` where `event` is one of
`sign_in`, `sign_in_failed`, `sign_out`, `tenant_switch`, `workspace_created`.
Failed sign-ins against a known workspace are logged to that workspace. Each
tenant keeps its latest 200 entries.

Passwords are stored in plain text in `localStorage`. This is acceptable only
because it is a labelled demo; the login page says "Demo sign-in, no real
account is created" and the spec forbids reusing this for anything real.

Login page:

- Sign in tab: workspace, email, password; a "Use demo credentials" button fills
  them; seeded workspaces are offered as quick picks.
- Create workspace tab: workspace name, email, password, plan (preselected from
  `?plan`).
- Inline validation messages, a shake on a failed submit, a ~600ms simulated
  delay with a busy state on the button.
- On success, navigate to `/app`.

In the console:

- Header shows the tenant name and plan, a switcher listing the user's tenants,
  and Sign out.
- A new "Access log" tab lists the current tenant's entries, newest first.
- The sidebar "WORKSPACE" label shows the tenant name.

## Console reskin and responsiveness

- Same panels, data and behaviour as today, restyled with the tokens above.
- Under 800px the sidebar becomes a slide-in drawer opened from a header button;
  it closes on navigation, on Escape and on backdrop tap.
- Grid breakpoints: 1100px, 800px, 580px, as today.
- Landing: the hero stacks with the scene below the text under 800px; pricing
  cards stack to one column; the nav collapses to a menu button.
- Minimum supported width is 320px with no horizontal scroll.

## Micro-interactions

- Buttons: press scale, arrow nudge on hover, visible focus ring.
- Nav links: underline wipe.
- Cards and fault buttons: hover lift with border darkening.
- Sections: fade and rise on scroll into view, once.
- Pricing: sliding tab pill, price roll.
- Forms: focus ring, error shake, busy spinner in the submit button.
- Console: notices slide in as toasts, status pills pulse when their value
  changes, tab content cross-fades, modal scales in.
- Route changes cross-fade.

## Error handling

- Auth errors map to specific messages: unknown workspace, wrong email or
  password, workspace name taken, missing fields.
- If `localStorage` is unavailable or holds corrupt JSON, the store falls back to
  the seeded tenants in memory and no session.
- Backend-unavailable handling in the console is unchanged (notice banner).

## Verification

- `vitest` unit tests for `auth/store.js`: seeding, successful sign-in, unknown
  workspace, bad password, workspace creation and duplicate, tenant switch
  limited to memberships, sign-out, log entries and the 200-entry cap, corrupt
  storage.
- `npm run build` succeeds.
- The app is driven in a browser at roughly 1440, 820 and 390px wide: landing
  animation runs, pricing tabs switch, sign-in and workspace creation work, the
  route guard redirects, the console loads and the access log fills.

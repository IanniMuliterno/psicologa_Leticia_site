# psicologa-leticia-site

Professional site for a psychologist ([live](https://psicologaleticiaoliveira.netlify.app/)). Static frontend, no client framework, backed by a small set of Netlify Functions for a moderated testimonials feature.

This README documents the architecture and the reasoning behind a few non-obvious decisions, mostly for my own future reference and for anyone reviewing the code.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Homepage | Hand-authored `index.html` | The entire live site is a single page with anchor-linked sections (`#sobre`, `#depoimentos`, ...). Plain HTML/CSS/JS, no templating — the testimonial carousel/form needed full control over markup and behavior. |
| Interactivity | Vanilla JS (no build step, no framework) | Site is small enough that React/Vue would add tooling cost without a real payoff. |
| Backend | [Netlify Functions](https://docs.netlify.com/functions/overview/) (Node, ESM, web-standard `Request`/`Response`) | Only used where a static site fundamentally can't do the job: persisting and moderating user-submitted testimonials. |
| Storage | [Netlify Blobs](https://docs.netlify.com/blobs/overview/) | Key-value store, no database needed for a handful of testimonial records. |
| Email notifications | [Web3Forms](https://web3forms.com/) | Notifies the site owner by email when a testimonial needs review. |
| Hosting | Netlify | Static hosting + functions + blobs in one place. |

## Deployment model (important quirk)

`netlify.toml` has **no `[build.command]`** — Netlify publishes whatever is committed under `_site/` as-is:

```toml
[build]
  base = "."
  publish = "_site"
  functions = "netlify/functions"
```

That means `_site/` is a **pre-rendered, committed artifact**, not something Netlify's CI generates on push. In practice this means `index.html` (source) and `_site/index.html` (published copy) are hand-kept in sync — every edit to the homepage has to be applied to both files, or the deploy will silently serve the old version. There's no build step to catch drift.

This is a deliberate tradeoff for a low-traffic brochure site (no CI build minutes, no build-time surprises) at the cost of manual sync discipline.

## Testimonials feature

The one genuinely dynamic feature on the site: visitors can submit a testimonial, which is held for manual approval before it's shown publicly.

```
visitor                     Netlify Function              Netlify Blobs           admin (owner)
   |                              |                              |                        |
   |--POST submit-testimonial---->|                              |                        |
   |                              |--setJSON pending/{id}------->|                        |
   |                              |<-----------------------------|                        |
   |<--{success:true}-------------|                              |                        |
   |                                                                                       |
   |--POST api.web3forms.com/submit (client-side, direct)--------------------------------->|  email notification
   |                                                                                       |
   |                                                              |<--GET admin-api--------|  (Bearer ADMIN_SECRET)
   |                                                              |   list pending+approved|
   |                                                              |<--POST admin-api-------|  {action: approve|reject}
   |                                                              |   delete pending/{id}, write approved/{id} on approve
   |
   |--GET get-testimonials------->|--list approved/*------------>|
   |<--approved testimonials JSON-|<-----------------------------|
```

- **`netlify/functions/submit-testimonial.mjs`** — validates input, writes to Blobs under `pending/{uuid}`. Includes a honeypot field (`hp`); if it's filled the request silently reports success without persisting anything, to avoid tipping off bots.
- **`admin/index.html`** — a static, unlisted admin page. Not code-protected by Netlify at the routing level; it's gated by a shared secret entered client-side and sent as `Authorization: Bearer <secret>` on every request. Not linked from the public site.
- **`netlify/functions/admin-api.mjs`** — the only privileged endpoint. Compares the provided secret using `crypto.timingSafeEqual` rather than `===`, since a naive string comparison short-circuits on the first mismatched byte and leaks timing information an attacker could use to guess the secret one byte at a time. Approving moves a record from `pending/{id}` to `approved/{id}`; rejecting just deletes it. Pending is deleted *before* the approved write, not after, so a crash mid-request can't leave the same testimonial in both states.
- **`netlify/functions/get-testimonials.mjs`** — public, unauthenticated, read-only. Only ever serves `approved/*`, cached for 60s.
- **Email notification**: fires from the browser directly to Web3Forms' API after a successful submission, *not* from the Netlify Function. Web3Forms rejects server-to-server calls with a 403 unless you're on a paid plan with a whitelisted IP — impractical for a serverless function with dynamic egress IPs — so the notification call is client-side instead, which is Web3Forms' intended integration pattern. The `access_key` embedded in the page JS is not a secret: per Web3Forms' own docs it's safe to expose publicly, since it only allows *submitting* to the form (equivalent to knowing a public inbox address), not reading past submissions or touching account settings.

  This came up during setup as a real gotcha worth recording: Netlify's build-time secrets scanner will fail a deploy if a committed file's content matches the value of *any* registered environment variable, regardless of whether that value is meant to be public. The fix was to delete the now-unused `WEB3FORMS_KEY` env var from Netlify (nothing reads it server-side anymore) rather than fight the scanner with `SECRETS_SCAN_OMIT_KEYS` or rewrite git history — there was no actual secret to protect.

## Environment variables (Netlify site settings)

| Variable | Used by | Notes |
|---|---|---|
| `ADMIN_SECRET` | `admin-api.mjs` | Real secret. Never appears in any committed file — must stay server-side only. |

`WEB3FORMS_KEY` is intentionally **not** an env var (see above) — the Web3Forms access key lives directly in `index.html`/`_site/index.html` since it's designed to be public.

## Project structure

```
index.html                    the live homepage (hand-authored, single page, anchor nav)
styles.css                    shared styles
admin/index.html              unlisted moderation UI for testimonials
netlify/functions/
  submit-testimonial.mjs      POST — public, writes to pending/
  get-testimonials.mjs        GET  — public, reads approved/
  admin-api.mjs                GET/POST — Bearer-secret protected, list/approve/reject
_site/                        published output (committed; see "Deployment model")
netlify.toml                  publish dir, functions dir
```

## Local development

```bash
npm install
netlify dev            # serves _site/ + functions locally, needs Netlify CLI + linked site for env vars
```
To edit the homepage: edit `index.html` **and** copy the same change into `_site/index.html` before committing.

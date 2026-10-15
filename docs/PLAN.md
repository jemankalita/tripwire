# Tripwire: Website Change Detector (Build Plan)

> Watches public web pages and alerts you when something that matters changes. Timestamps, ad rotations and other noise are ignored.

---

## 0. Product thesis and design direction

**Purpose:** a monitoring tool people check every day. It should feel like a precise instrument, not a marketing toy.
**Audience:** people who watch competitor pricing, job boards, docs and changelogs, government notices, or stock/drop pages.
**Tone:** calm, dense, precise. Think seismograph or oscilloscope. Quiet when nothing is happening, loud only when it matters.

**Signature detail (the memorable part):** every watched page has a **pulse line**, a seismograph-style trace of its change activity.
- Flat line means the page is stable.
- A spike marks a meaningful change.
- A dotted grey segment marks an outage or block.

The pulse line shows up in three places: the dashboard row, the detail-page header, and the landing hero, where a Spline 3D lens sweeps across a page and draws the line.

| Token | Choice |
|---|---|
| Base | Graphite `#0B0D10` (dark) and paper `#F6F5F1` (light). Both are first-class. |
| Signal colors | Phosphor green `#3DDC97` (OK), amber `#FFB020` (changed), coral `#FF5C5C` (error), slate `#8A93A6` (blocked) |
| Diff colors | Additions in a green wash, removals in a red wash with strikethrough. Never rely on color alone: also use `+`/`−` gutters. |
| Type | **Geist Sans** for UI, **Geist Mono** for URLs, hashes, timestamps and numbers (tabular figures), **Instrument Serif** italic only for landing headlines |
| Radius / density | 10px radius, 1px hairline borders, 36px table rows, no cards nested in cards |
| Avoid | Purple gradients, blobs, glassmorphism everywhere, vague hero copy |

### How the reference sources get used
| Source | Use |
|---|---|
| **getdesign.md** | Start from a Linear/Vercel-style `DESIGN.md`, retune it with the tokens above, and commit it as `/DESIGN.md` so every AI or human contributor builds against the same spec |
| **motion.dev** (Motion for React) | All app motion: layout animations, shared-element transitions, the diff scan-line reveal, number tickers. Use `useReducedMotion` everywhere. |
| **21st.dev** (motion library) | Pull shadcn-compatible pieces: ⌘K command palette, animated tabs, a compare-slider base, a toast stack, a number ticker. Restyle each to our tokens. |
| **morphicons.com** | Morphing status icons (check → pulse → alert → x) so state changes animate instead of swapping |
| **spline.design** | One 3D scene only, on the landing hero: a glass lens scanning a stylized page. Lazy-loaded, static poster fallback, never inside the app. |
| **desengs.com / motionsites.ai** | Reference boards for landing composition and scroll choreography |
| **higgsfield.ai** | Generate 5–8 s product loop videos for the landing "how it works" section and the demo reel |

**Motion rules:** motion must explain a state change, never decorate.
- Enter: 180–240 ms, ease-out `[0.22, 1, 0.36, 1]`.
- Lists reorder with `layout` when a status changes.
- Opening a watch uses a shared-element morph from the row to the detail header.
- A diff reveals with a single scan-line sweep.
- Skip all of this under `prefers-reduced-motion`.

---

## 1. Architecture

```
┌──────────── apps/web (Next.js 15, App Router) ───────────┐
│ UI · Route handlers (REST) · Auth · RSS · Signed diff links │
└───────────────┬──────────────────────────┬─────────────────┘
                │ Postgres (Drizzle)        │ enqueue
                ▼                           ▼
        ┌──────────────┐          ┌──────────────────┐
        │  PostgreSQL  │◄────────►│ Redis + BullMQ   │
        └──────────────┘          └───────┬──────────┘
                                          │
          ┌───────────────────────────────┼──────────────────────┐
          ▼                               ▼                      ▼
 scheduler (repeatable tick)   check-worker (Playwright)   notify-worker
 → due targets, jitter         render → extract → diff     email / Telegram /
 → per-domain token bucket     → classify → snapshot       Discord / digest
                                          │
                                          ▼
                              S3-compatible storage (MinIO / R2)
                              screenshots + HTML, content-addressed
```

**Monorepo (pnpm + Turborepo)**
```
apps/web        Next.js UI + API
apps/worker     scheduler, check-worker, notify-worker (Node, Playwright)
apps/extension  MV3 browser extension (bonus)
apps/chaos      fixture site that misbehaves on purpose (tests + live demo)
packages/core   normalize, hash, diff, classify, noise rules (pure TS, heavily tested)
packages/db     Drizzle schema + migrations
packages/ui     shadcn + 21st.dev components themed to DESIGN.md
docker-compose  postgres, redis, minio, mailpit
```

**Stack**
- TypeScript, Next.js 15, Tailwind v4, shadcn/ui, Motion.
- Drizzle + Postgres; BullMQ + Redis.
- Playwright (Chromium) with `@ghostery/adblocker-playwright`.
- `diff` (jsdiff) for text, `pixelmatch` + `sharp` for images, `@medv/finder` for robust selectors.
- Resend for email, Telegram Bot API, Discord webhooks.
- Better Auth (magic link); Recharts/visx for number charts.
- Claude Haiku (`claude-haiku-5-5`) for one-line summaries.

---

## 2. Data model (the key idea: **Target ≠ Watch**)

```
targets      id, normalized_url (unique), domain, effective_interval, next_check_at,
             status (ok|error|blocked), consecutive_failures, etag, last_modified,
             volatile_rules jsonb (auto-learned), last_checked_at, last_changed_at
watches      id, user_id, target_id, name, interval, sensitivity (low|med|high),
             watch_selectors[], ignore_selectors[], keyword_rules jsonb,
             number_selector, digest (bool), paused
checks       id, target_id, started_at, duration_ms, http_status, result
             (ok|error|blocked), error_kind, content_hash   ← always written, tiny
snapshots    id, target_id, content_hash (unique per target), text, html_key,
             screenshot_key, region_texts jsonb, created_at  ← only when hash changes
changes      id, watch_id, from_snapshot, to_snapshot, fingerprint, score,
             summary, kind (content|keyword|number), created_at
deliveries   id, change_id, channel_id, status, sent_at
             UNIQUE(change_id, channel_id)  ← no duplicate alerts, by construction
channels     id, user_id, type (email|telegram|discord), config (encrypted)
number_points watch_id, snapshot_id, value, at
```

- A **Target** is fetched once.
- Each **Watch** applies one user's selectors, ignore rules and sensitivity to the shared snapshot.

---

## 3. Check pipeline (one job = one target)

1. **Pre-flight (cheap).**
   - Do an SSRF-safe DNS resolve.
   - Send a conditional `GET` with `If-None-Match` / `If-Modified-Since`.
   - On `304`, record an OK check and skip the render.
2. **Render.** Use a fresh Playwright context with:
   - `page.clock.install({ time: FIXED })` to freeze `Date`, and an init script that seeds `Math.random`. This kills a whole class of noise before it exists.
   - The adblocker plus a cookie-banner hide list.
   - CSS that disables animations, carets and autoplay.
   - `waitUntil: 'networkidle'` with a cap, then a short settle delay.
   - A hard 30 s timeout; downloads blocked.
3. **Extract.**
   - Full visible text.
   - Text for the union of every watcher's selectors (one render serves 200 watchers).
   - A full-page screenshot.
   - Element bounding boxes, so region crops come from the same screenshot.
4. **Classify** as OK, ERROR or BLOCKED (see §5, Q1).
5. **Normalize, then hash, per watch:** remove ignored regions, apply noise rules (§4), then `sha256`.
6. **Snapshot only if the target hash is new.** Otherwise only the `checks` row is written.
7. **Per watch, decide whether this is a meaningful change:** score it against sensitivity, apply rotation memory, confirm the change, fingerprint it, then create a `change`. Fan-out to `notify` follows.

Retries: BullMQ with `attempts: 3`, exponential backoff, and a job timeout of 60 s. Retries happen only on transient errors, never on BLOCKED.

---

## 4. Noise filtering (layered)

| Layer | Handles |
|---|---|
| **At source** | Frozen clock, seeded random, ad/tracker blocking, animations off, consent banners hidden |
| **Regex normalizers** | ISO and locale dates, times, "3 min ago", relative times, UUIDs, hex/base64 tokens ≥16 chars, CSRF/nonce values, cache-busting query strings |
| **Counter rules** | Numbers next to `views/likes/comments/online/followers` become `#` (unless the watch is number-tracking) |
| **Auto-calibration** | When a watch is created, render the page **3× back-to-back**. Anything that differs between those renders is volatile, so turn it into an auto ignore rule (selector or regex) and show the user: *"We'll ignore 4 regions that change on every load."* |
| **Rotation memory** | Keep the last K=8 hashes per target. A "new" hash that is actually in that set is a rotating banner or A/B flip, so suppress it. |
| **Sensitivity** | low/med/high map to (min changed tokens, min changed %, visual pixel %). For example, med = ≥3 tokens and ≥0.5 % text, or ≥1.5 % pixels. |
| **User rules** | Ignore regions from the picker, plus an "ignore this" action directly on any diff hunk (one click creates a rule) |

---

## 5. The four core questions (judges will ask these, so answer them in the UI too)

**Q1. Is a site outage or CAPTCHA a change?**
No. Classification runs **before** diffing.
- **ERROR:** DNS/TLS/timeout or 5xx.
- **BLOCKED:** 403/429, or challenge markers (`cf-chl`, "Just a moment", `g-recaptcha`, `hcaptcha`, `px-captcha`, "Access denied"), or the body shrinking by more than 80 % against the last snapshot along with a challenge-like title.

Neither result creates a snapshot or a change. Status changes produce a separate **health alert**, sent only after 3 consecutive failures and once more on recovery.

**Q2. If 200 users watch the same URL, is it fetched 200 times?**
No. URLs are normalized (lowercase host, sorted query, tracking params stripped, no fragment) into one **Target**.
- The effective interval is `min(watch.interval)`.
- One render extracts the union of all selectors.
- Each watch evaluates its own view of that shared snapshot.
- The dashboard shows "Shared with 199 other watchers · 1 fetch".

**Q3. How do we avoid endless alerts on pages that differ on every load?**
Four defenses work together:
1. Noise at source plus normalizers.
2. Auto-calibration on create.
3. Rotation memory.
4. **Confirm-before-alert:** re-render once after 60 s, and alert only if the same fingerprint persists.

A **flap guard** backs these up: if a page is still "changing" more than 50 % of checks after all that, alerts pause and the UI suggests ignore rules or a lower sensitivity. Duplicates are also impossible by construction, via the `fingerprint` (hash of the normalized diff hunks) and the `UNIQUE(change_id, channel_id)` constraint.

**Q4. How do we avoid hammering a site?**
- Targets are deduped (Q2), the interval floor is 15 min, and schedules get ±10 % jitter.
- A **per-domain Redis token bucket** allows 1 concurrent render per domain with a ≥10 s gap.
- A global concurrency cap applies.
- Conditional requests mean a `304` skips the render.
- `Retry-After` is honored, and 429/503 trigger exponential backoff.
- A per-domain circuit breaker backs off after repeated failures.
- `robots.txt` is respected.
- The User-Agent is honest: `TripwireBot/1.0 (+https://…/bot)`.

---

## 6. Security (non-negotiable)

- **SSRF:**
  - http/https only.
  - Resolve DNS and reject private, loopback, link-local and metadata ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`).
  - Re-check **every** Playwright request through `page.route` to stop DNS rebinding and redirects to internal hosts.
- Chromium runs in its own container with no credentials. Downloads are blocked, and pages are capped in size and time.
- Webhook URLs are allow-listed to `discord.com/api/webhooks/*`; Telegram is set up through the bot `/start` handshake. Channel secrets are encrypted at rest.
- The picker shows a **server-rendered screenshot**, so third-party scripts never run in our origin.
- Diff/RSS links use unguessable signed tokens. Every endpoint has Zod validation and per-user rate limits.

---

## 7. Screens and UX

### 7.1 Landing (`/`)
- **Hero:** Instrument Serif headline *"Know when it changes. Ignore when it doesn't."* beside the Spline lens scene, which draws the pulse line as you scroll.
- **Live demo strip:** paste a URL and get a real render plus a calibration preview in about 10 s, with no signup.
- **How it works:** three scroll-pinned steps (Pick → Filter noise → Get the diff), using higgsfield loops.
- The four core questions are answered as a "Built for the real web" section. This turns the judging criteria into a selling point.

### 7.2 Dashboard (`/app`)
- **KPI strip** with Motion number tickers: Watching · Changed today · Errors · Blocked.
- **Main table**, one dense row per watch:
  - favicon and name, plus the URL in mono
  - status pill with a morphicon
  - last checked as relative time, with the absolute time in a tooltip
  - last changed
  - a **pulse-line sparkline**
  - an interval chip
- **Filters:** status, tag, "changed in 24 h". Rows re-sort with `layout` animation when a status changes.
- **Empty state:** a single input. Paste a URL to start the add flow.
- **⌘K command palette:** add watch, jump to a page, pause all, open digest settings.

### 7.3 Add-watch flow (a sheet, not a page)
1. **URL**, which starts the server render and calibration. A skeleton shows a scanning shimmer over the page shape.
2. **Picker**, over the screenshot:
   - Hover outlines elements; click to **Watch** (amber) or **Ignore** (slate).
   - The chips list shows the generated CSS selectors, editable.
   - Auto-detected volatile regions are pre-marked as ignored, with an explanation.
3. **Settings:**
   - Name (auto-filled from `<title>`), and an interval slider snapping from 15 m to 24 h.
   - A sensitivity segmented control with a live preview of *"would have alerted N times in calibration"*.
   - Keyword rules and number tracking (bonus).
4. **Alerts:** channel toggles (email, Telegram, Discord) plus "Daily digest instead".

### 7.4 Watch detail (`/app/w/[id]`)
- **Left: version timeline.** A vertical rail of snapshots with a pulse marker on each. Errors and blocked spans show as hatched gaps. Clicking any two versions selects them for comparison (A/B badges).
- **Right: diff viewer tabs:**
  - **Text:** inline or split, word-level highlights, collapsed unchanged context, "ignore this hunk" on hover.
  - **Visual:** the screenshot with a pixelmatch heat overlay and boxes around changed regions; clicking a box scrolls to its text hunk.
  - **Side-by-side:** two screenshots with synced scroll and zoom.
  - **Slider:** a before/after swipe.
- **Header:** AI one-liner (*"Price for Pro plan dropped from $29 to $24"*), status, the "Shared fetch" badge, and Check now, Pause, RSS and Settings actions.
- **Numbers tab** (bonus): a line chart of tracked values, annotated with change events.

### 7.5 Alerts and settings
- Channel setup with a **Send test** button that shows a live preview of the exact message.
- A digest time picker in the user's time zone.

### UX quality bar
- Every async action shows optimistic UI with an undo toast.
- Skeletons match the final layout (zero layout shift).
- Full keyboard navigation: `j/k` moves through table rows, `[ ]` steps through versions, `d` toggles diff mode.
- Meet WCAG 2.2 AA: contrast, visible focus rings, diffs not dependent on color, and live regions announcing status changes.
- Responsive: the table collapses to stacked rows on mobile, and the diff defaults to inline under 768 px.

---

## 8. Alerts

- `notify` queue jobs are keyed by `(change_id, channel_id)`, so a retry can never double-send.
- **Message contents:** watch name, AI one-liner, a "+12 / −3 lines" stat, a cropped before/after thumbnail, and a signed diff link.
- **Formats:** Discord embed, Telegram MarkdownV2 with a photo, and an email built with React Email.
- **Digest:** changes for digest watches go into a pending list. A per-user cron at the chosen local time sends one grouped email and skips if the list is empty.
- **Keyword-only alerts:** the rule types are *appears*, *disappears* and *contains / not-contains*, evaluated on the normalized text of the watched region.

---

## 9. Bonus features (ranked by impact per hour)

1. **AI one-line summary.** Send the diff hunks (≤4k tokens) to Claude Haiku and get one sentence back. Cache it on the `change`, and fall back to "+N / −M lines" if the call fails.
2. **Per-page RSS:** `/feeds/[token].xml`, one item per change, linking to the diff.
3. **Number tracking with charts:** pick a selector, parse it with locale awareness (`₹1,299.00` → 1299), store it in `number_points`, and optionally alert on thresholds or percent change.
4. **Keyword alerts** (covered in §8).
5. **Browser extension (MV3):** "Watch this page", a live element picker that sends selectors to the API, and a badge with the unseen-change count.

---

## 10. Testing strategy

- **`apps/chaos`, the fixture site.** It is also the live demo. Routes:
  - `/timestamp`: clock plus random token on every load
  - `/rotating`: a banner that flips between 3 variants
  - `/captcha`: a fake Cloudflare challenge
  - `/flaky`: random 503s
  - `/ratelimit`: 429 with `Retry-After`
  - `/price`: changes only when you press a button
  - `/counter`: view counts ticking up
- **Unit tests** (Vitest, ≥80 % on `packages/core`): normalizers, URL canonicalization, classifier, fingerprinting, rotation memory, sensitivity scoring, SSRF IP checks.
- **Integration:** the worker against chaos routes. Each assertion maps to a core question: no change on `/timestamp`, BLOCKED on `/captcha`, a single alert on `/price`, backoff on `/ratelimit`, and one fetch for 200 watches.
- **E2E** (Playwright): add watch → picker → change → alert visible → diff view.

---

## 11. Build order

| Phase | Deliverable | Done when |
|---|---|---|
| **P0 Foundation** | Monorepo, docker-compose, Drizzle schema, auth, `DESIGN.md` + themed `packages/ui`, chaos app | `pnpm dev` boots everything and login works |
| **P1 Engine** | Scheduler, check-worker, render/extract/hash/snapshot, classifier, per-domain limiter, SSRF guard | Chaos routes behave correctly in integration tests |
| **P2 Noise** | Normalizers, calibration, rotation memory, confirm-before-alert, sensitivity, fingerprint | `/timestamp`, `/rotating` and `/counter` produce zero changes over 50 checks |
| **P3 Core UI** | Dashboard, add-watch flow with picker, watch detail with timeline + 4 diff modes | The full flow works on chaos + 3 real sites |
| **P4 Alerts** | Email, Telegram, Discord, dedupe, health alerts, digest | Exactly one alert per real change on every channel |
| **P5 Polish** | Motion pass, morphicons, ⌘K, a11y audit, mobile, landing + Spline + videos | Lighthouse ≥90 and the reduced-motion path verified |
| **P6 Bonus** | AI summaries → RSS → numbers → keywords → extension | Each item ships behind its own flag |

**Demo script (3 min):**
1. Paste the chaos `/price` URL. Calibration auto-ignores the timestamp and token.
2. Press "change price" on the chaos site. The Discord alert lands with the AI one-liner.
3. Open the diff: text view, then the visual heatmap, then the slider.
4. Show that `/captcha` reads as BLOCKED, not changed.
5. Show the shared-fetch badge: "200 watchers · 1 fetch".

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Heavy Playwright memory use | Reuse one browser, one context per job, worker concurrency 3–4 per container, recycle the browser every N jobs |
| Selector breaks after a site redesign | Store selector + text fingerprint + bbox. If the selector misses, fall back to fuzzy match and raise a "selector lost" health alert. |
| Strong bot protection | Classify as BLOCKED and tell the user honestly. No evasion; we stay a good citizen. |
| Screenshot storage grows | Store content-addressed only on hash change, as WebP; keep the last 50 versions per target on the free tier |

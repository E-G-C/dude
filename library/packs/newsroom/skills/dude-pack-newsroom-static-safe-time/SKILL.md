---
name: "dude-pack-newsroom-static-safe-time"
description: "Use when rendering time-relative content on a static Hugo/Docsy site — next/upcoming/past events, an events calendar, a countdown, or an 'In N days / Today / Tomorrow' chip — so freshness comes from the visitor's clock at page load instead of the build-time `now`, and the page never goes stale between rebuilds."
---

# Static-safe time-relative rendering (Hugo/Docsy)

## Purpose

On a static site, `now` is frozen at **build time**. Any "what's next / upcoming /
past / in N days" decision made in a template bakes a date into HTML and goes
**stale** between rebuilds — a finished event keeps showing as "coming up," a
countdown freezes. This skill is the proven recipe for rendering time-relative
content so the freshness comes from the **visitor's clock** at page load.

It has shipped three times in this repo (the `/news/events/` page, the event
detail "In N days" chip, and the home "Next event" strip). Reuse this instead of
re-deriving it — the gotchas below are easy to get wrong each time.

## The principle

**The build emits DATA, not time decisions. The browser decides.**

1. The template serializes the event/date DATA into a `<script type="application/json">`
   island — plus a server-rendered **no-JS fallback** (a plain list/link, indexable).
2. A small inline script reads the island, computes next/upcoming/past (or the
   countdown) from `new Date()` at page load, fills the DOM, and reveals it.
3. With no JS, the fallback stays visible. With nothing upcoming, the dynamic
   region hides gracefully.

Never branch on `now` / `.Format` in the template to choose which item is "next."

## Gotcha checklist (each of these has bitten us)

- **`jsonify` double-encodes inside `<script>`.** Go's `html/template` re-encodes
  the jsonify output in a JS context, yielding a *quoted string*, so
  `JSON.parse` returns a string and `.forEach` throws
  `forEach is not a function`. Fix: `{{ $data | jsonify | safeJS }}`.
- **`event_date` front matter is a STRING.** A YAML date read via `.Params.event_date`
  is a string; calling `.Format` on it fails. Wrap every read:
  `time.AsTime (.Params.event_date | default .Date)` before `.Format`.
- **Sort same-day ties by start time.** Sorting only by day picks an arbitrary
  event when several share the soonest day. Sort by **day, then `time`**
  (items without a time sort first), then pick `[0]`.
- **Hint at same-day siblings.** When N events share the chosen day, show
  "+N-1 more that day" → the calendar, instead of silently hiding them.
- **Build the date label from explicit arrays.** `toLocaleDateString` option
  combos can produce broken labels (e.g. "Jun 8 – 2026"); build month/day/dow
  from `MON[]` / `DOW[]` arrays you control.
- **Query from the document, not a stale scope.** A "today" badge or counter
  outside the data root won't update if you scope the lookup to the root; use
  `document.querySelector` for elements that live outside `[data-...]`.
- **Re-evaluate on return.** Re-run the selection on `visibilitychange` (and an
  occasional interval) so a long-open tab updates when the visitor comes back.
- **Graceful empty + no-JS.** Hide the dynamic strip when nothing is upcoming;
  keep the `<noscript>`/fallback list for crawlers and JS-off visitors.

## Workflow

1. In the shortcode/partial, gather the pages (e.g. events) and build a `$data`
   slice of plain dicts — only the fields the client needs (`day` as
   `2006-01-02`, `time`, `title`, `url`, optional `location`/`host`).
   Use `time.AsTime` for every date.
2. Emit `<script type="application/json" ...>{{ $data | jsonify | safeJS }}</script>`
   plus a no-JS fallback element.
3. Emit a hidden template/region with `data-*` hooks; the inline script fills it
   from the visitor's clock and reveals it.
4. Keep internal links static-safe too: resolve via `site.GetPage "/x" → .RelPermalink`
   (a leading-slash path through `relLangURL` drops the baseURL subpath — see
   `dude-pack-docsy-theme`).

A complete, copy-paste reference implementation (island builder + client
selector + fallback, with the same-day tiebreak and "+N more") lives in
[reference/next-event-template.html](reference/next-event-template.html).

## When NOT to use

- Content whose time label is genuinely fixed and never relative (a published
  date stamp is fine to render at build time).
- Server-rendered sites where `now` is per-request (not applicable here — this
  repo is static Hugo/Docsy).

## Verify

- Simulate the clock forward in the browser (override `Date`) and confirm the
  selection auto-advances and hides at the end **with no rebuild**.
- Confirm the JSON island starts with `[` (an array), not `"` (a quoted string).
- Confirm the no-JS fallback renders when scripts are disabled.

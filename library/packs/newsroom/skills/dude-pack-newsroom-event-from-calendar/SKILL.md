---
name: "dude-pack-newsroom-event-from-calendar"
description: "Use when turning a Microsoft 365 / Outlook / Teams calendar event into a published Event on this SECI AI Community site — e.g. 'add this calendar event to the site', 'publish the SkillUp / AI in 15 session under Events', 'create an event markdown from my calendar', or pulling an invite's details via WorkIQ into content/news/. Covers the WorkIQ query, the event front-matter schema, the filename convention, and the build verification."
---

# Publish a calendar event as a site Event

## Purpose

Take an event from the user's Microsoft 365 calendar (Outlook/Teams invite) and
publish it as an **Event** on this Hugo/Docsy site, correctly formatted so it
appears on the `/news/events/` calendar, the "Upcoming events" rail on `/news/`,
the home "Next event" strip, and its own facts-first detail page.

This codifies the format and naming so it does not have to be re-derived each
time. The authoritative human-facing reference is
[content/docs/contributing.md](../../../content/docs/contributing.md) (the
"Events" section) — keep this skill in sync with it.

## Prerequisites

- **WorkIQ must be connected** for the calendar lookup. The MCP tool is
  `mcp_workiq2_ask_work_iq` (the EULA must already be accepted). If it is not in
  the available tools, run a `tool_search` for "ask_work_iq WorkIQ calendar"
  first. If it still is not present, ask the user to enable WorkIQ, or accept the
  details pasted/shared from the invite instead. **Never invent event details.**

## Pipeline (skill = knowledge, agent = executor)

This skill is the **knowledge layer**. The repetitive, token-heavy per-event
deep fetch is delegated to the
[`Event Deep-Fetcher`](../../agents/dude-pack-newsroom-event-deep-fetcher.agent.md)
sub-agent (`@dude-pack-newsroom-event-deep-fetcher`):

1. The coordinator (or this skill) runs the **list query** once to find the
   candidate events and dedupe against `content/news/`.
2. For **each** surviving event, dispatch the Event Deep-Fetcher with the event
   identity (title + organizer + date). It loads this skill, runs the
   single-event verbatim deep fetch, writes/refreshes the markdown, and reports.
3. The coordinator runs final batch verification (`hugo --quiet`) and close.

Running the deep fetches inline is still fine (e.g. when the agent isn't
registered yet in the current session) — the agent just packages this same
workflow for reuse.

## Workflow

1. **Query the calendar via WorkIQ.** Ask for every field the schema needs in one
   question — including the **absolute start/end instant with UTC offset**, which
   is what drives per-visitor timezone conversion (see Timezones). For example:

   > Find the calendar event titled "<EVENT NAME>". Give me all details: exact
   > title, the date it happens, the start and end as ISO 8601 **with UTC offset**
   > (e.g. `2026-06-12T09:00:00-07:00`), the event's **native/stated time zone**
   > (do not convert to my zone), the location (or Teams/online join link), the
   > organizer/host name, any registration or join URL, and the full
   > description/agenda body.

2. **Extract and map** the response to front matter (see the mapping table). If a
   recommended field is genuinely absent, omit it rather than guessing.
2a. **Always deep-fetch each event you publish — one event per query.** Both a
   bulk "list all events" query *and* a multi-event "give me details for these 5"
   query under-fetch: they routinely return `Join URL: Not provided`, drop the
   description/agenda, and — worst of all — **silently convert times to YOUR
   viewer zone** (see Timezones). Do not publish from a list/multi query. For
   each event, run a **single-event, verbatim-body deep fetch** that asks for the
   raw invite body and every link, and explicitly tells WorkIQ not to convert:

   > Open the single calendar event titled exactly "<TITLE>" organized by
   > <ORGANIZER>, on <DATE>. I want the FULL invite body, not a summary. Return
   > verbatim: (1) the COMPLETE description/agenda body, preserving line breaks;
   > (2) EVERY hyperlink/URL anywhere in the body or meeting details, each on its
   > own line with its link text (Teams "Join" link, aka.ms links, registration
   > or event-page links, "View event page"); (3) the Teams Meeting ID and
   > passcode if present; (4) start and end as ISO 8601 with the correct UTC
   > offset **in the event's own stated time zone — do NOT convert to my zone**,
   > plus the native time-zone label; (5) location and organizer. If a field is
   > genuinely empty, say "empty in source" — but read the full HTML body, since
   > this invite is known to contain a description and links.

   This single-event form reliably recovers the agenda, the real `event_url`,
   the meeting ID/passcode, and the true native time. The verbatim body usually
   contains the ground-truth "When:" line and the sender's time-zone stamp (e.g.
   `(UTC-08:00) Pacific Time`) — cross-check the offset against those, not
   against the list query.

   > **Real example (why this matters):** A 5-event detail query reported
   > "GitHub Copilot Day - Labs" as `2026-06-18T13:00:00-04:00` (1 PM ET) with no
   > body or links. The single-event deep fetch revealed the invite actually says
   > **10:00 AM – 2:00 PM PT** (`-07:00`) — the multi query had shifted it +3h
   > into the viewer's Eastern zone — plus a full lab agenda, the Teams join link,
   > and `aka.ms/ghcpday`. 10 AM PT rendered as 1 PM ET: a silent, plausible-
   > looking error you only catch by reading the raw body.
3. **Pin the real time instant** (see Timezones) — store `event_start`/`event_end`
   as ISO 8601 with UTC offset, not just a display string.
4. **Create the file** at the correct path (see Filename) — do not edit an
   existing one unless updating a known event.
5. **Verify the build** (see Verification) before reporting done.

## Timezones (get the real instant, not yours)

**WorkIQ renders calendar times in the VIEWER's timezone — yours — not the
event's native zone.** A bulk "list events" query will silently hand you *your*
local times. Publishing those as-is posts wrong times for everyone else. (Seen
live: a 9:00 AM PT keynote came back as "12:30 PM" — the Eastern render.)

Always pin the absolute instant:

1. Ask WorkIQ for the **start and end as ISO 8601 with UTC offset**
   (e.g. `2026-06-12T09:00:00-07:00`), and/or the invite's **explicitly stated
   native zone** ("9:00 AM PT"). Cross-check the two.
2. Store that instant in `event_start` (+ `event_end`). Set `event_time` to the
   native zoned label (e.g. `"9:00–10:00 AM PT"`) as the no-JS fallback.
3. The site converts `event_start` to each visitor's own local zone in their
   browser (static-safe). Never bake a single zone in as "the" time, and never
   trust a bulk query's unlabeled times.

### Timezone escalation ladder (when the single-event fetch has no "When:" line)

Most invites carry a verbatim "When:" line or a sender timezone stamp in the
deep-fetched body — use it. When they don't (common for **Viva Engage / AMA /
Teams-native** events that never went out as an Outlook invite), escalate in
this order, stopping as soon as one yields an explicit zone:

1. **Single-event verbatim deep fetch** (Workflow 2a) — read the body for a
   "When:" line or a `(UTC-±hh:mm) <Zone>` stamp. *Primary; usually enough.*
2. **Email fallback** — ask WorkIQ to search **Outlook email** for the original
   invitation / forward / confirmation and read its raw body + headers
   ("From … Sent: …" block carries a zone stamp).
3. **ICS / Graph fallback** — ask for the calendar object's raw iCalendar fields:
   `TZID`, `DTSTART`/`DTEND`, and Graph's `originalStartTimeZone` /
   `originalEndTimeZone`.

**Known hard limit (record, don't re-litigate):** for Viva Engage-native events
the enterprise calendar index often exposes **only a viewer-rendered time** —
no email exists, and `TZID`/`DTSTART`/`originalStartTimeZone` are not surfaced.
All three rungs can come back empty. When that happens:

- Do **not** invent a zone. Fall back to the **viewer-rendered time**, and if a
  same-organizer sibling event has a *confirmed* zone (e.g. AI-900 → Eastern),
  use it as a **labeled assumption**, not a fact.
- Note the assumption in your report (`tz viewer-derived, unconfirmed`) and offer
  the user the authoritative manual path: open the event in Outlook desktop →
  **File → Properties → Internet headers**, or forward it to themselves as
  **iCalendar (.ics)** and read `DTSTART` / `TZID`.

> **Real example:** "Death + Taxes + Cowork" (Viva Engage AMA, Jun 18) returned a
> full agenda and join link, but **no** "When:" line. Email search found no invite;
> the ICS/TZID pull returned only "12 PM–3 PM" rendered. Time was kept as
> viewer-derived ET (matching the same organizer's confirmed-Eastern AI-900),
> flagged unconfirmed.


## Filename

```
content/news/<PUBLISH-DATE>-<slug>.md
```

- `<PUBLISH-DATE>` is the **publish** date (`YYYY-MM-DD`, usually today), and it
  must match the `date:` field — **not** `event_date`.
- `<slug>` is a short, lowercase, hyphenated form of the title
  (e.g. `skillup-ai-in-15-powerpoint-agent`).
- Events live in the **same folder as news** (`content/news/`), as flat
  `.md` files. What makes it an event is the front matter, not the location.

## Front-matter schema (calendar → field mapping)

| Front-matter field | Required | From the calendar | Notes |
| ------------------ | -------- | ----------------- | ----- |
| `title`            | **Yes**  | Event title       | Quote it (titles often contain `:` or `—`). Use the full invite title unless the user asks to trim it. |
| `date`             | **Yes**  | (publish date)    | When you publish, usually today. `YYYY-MM-DD`, matches the filename prefix. |
| `author`           | Rec.     | Organizer         | |
| `categories`       | **Yes**  | —                 | Exactly `["Events"]` — this routes it into the events behavior. |
| `summary`          | Rec.     | First line of the description | One-line description shown on cards and the detail page. |
| `event_date`       | **Yes**  | Date it happens   | `YYYY-MM-DD`. Drives sort + next/upcoming/past. **Distinct from `date`.** |
| `event_time`       | Rec.     | Native start–end  | **No-JS fallback** label in the event's *own* timezone (en-dash `–`), e.g. `"11:00–11:15 AM ET"`. Always label the zone. When `event_start` is set, visitors see this auto-converted to *their* local zone. |
| `event_start`      | Rec.     | Absolute start    | ISO 8601 **with UTC offset**, e.g. `"2026-06-10T11:00:00-04:00"`. Drives visitor-local time conversion in the browser. Get this from the calendar (see Timezones). |
| `event_end`        | Optional | Absolute end      | ISO 8601 with UTC offset, e.g. `"2026-06-10T11:15:00-04:00"`. Adds the end to the converted range. |
| `location`         | Rec.     | Location / "Teams Meeting" | e.g. `"Microsoft Teams · Online"`. |
| `host`             | Rec.     | Organizer         | Falls back to `author` if omitted. |
| `event_url`        | Optional | Teams join / registration link | Shows an **Event link** button. **Omit for reposts** with no real sign-up/join link. |
| `event_icon`       | Optional | (choose)          | A [Font Awesome 6 free](https://fontawesome.com/search?o=r&m=free) class. Default `fa-calendar-day`. Pick a topical one (e.g. `fa-wand-magic-sparkles` for an AI/PowerPoint demo). |
| `image`            | Optional | (only if provided) | Site-absolute 16:9 path under `static/assets/…`. **Omit when you have no real art** — a broken path looks worse than none. |
| `tags`             | Optional | Topic keywords    | Free-form list; first tag becomes the kicker if `kicker` is unset. |

### Body

Everything below the closing `---` is standard Markdown — an agenda, what to
bring, who should come, a recording note. Many reshared events have just a line
or two; that is fine. Lift it from the invite description; don't pad it.

## Template

```markdown
---
title: "SkillUp AI in 15: PowerPoint Agent"
date: 2026-06-09
author: "Daniel Seitz"
categories: ["Events"]
summary: "Discover the PowerPoint agent — turn ideas into polished slides…"
event_date: 2026-06-10
event_time: "11:00–11:15 AM ET"
event_start: "2026-06-10T11:00:00-04:00"
event_end: "2026-06-10T11:15:00-04:00"
location: "Microsoft Teams · Online"
host: "Daniel Seitz"
event_url: "https://teams.microsoft.com/l/meetup-join/…"
event_icon: "fa-wand-magic-sparkles"
tags: ["skillup", "powerpoint", "ai-in-15"]
---

Short body lifted from the invite — agenda, who should come, recording note.
```

## Gotchas (easy to get wrong)

- **Two different dates.** `date` = published; `event_date` = happens. Events need
  **both**, and the filename prefix tracks `date`, not `event_date`.
- **`categories` must be exactly `["Events"]`.** Anything else won't route it into
  the events system; using `Events` on a non-event pulls it out of the news lists.
- **Quote titles** containing `:`, `—`, or other YAML-special characters.
- **Omit empty optionals.** No real `image`/`event_url`? Leave them out — don't
  emit placeholders or broken paths.
- **Use the en-dash** `–` in `event_time`, not a hyphen `-`.
- **WorkIQ times are in YOUR zone, not the event's — even in "detailed" queries.**
  Both bulk *and* multi-event detail queries render times in the viewer's timezone,
  and a multi-event query can hand you an ISO offset that is silently your own zone,
  not the event's. The only reliable fix is a **single-event deep fetch** of the
  verbatim invite body (see Workflow step 2a) — cross-check the offset against the
  invite's "When:" line and the sender's time-zone stamp. See Timezones.
- **Recurring series = one file per instance.** "AI in 15" and similar weekly
  series get a separate dated file per session; offer to add the others, don't
  bake recurrence into one file.
- **Don't fabricate.** If WorkIQ is unavailable or a field is missing, ask — never
  guess dates, links, or hosts.

## Verification (before reporting done)

```powershell
hugo --quiet ; "EXIT: $LASTEXITCODE"
Test-Path 'public/news/<PUBLISH-DATE>-<slug>/index.html'
Select-String -Path 'public/news/events/index.html' -Pattern '<TITLE FRAGMENT>' -SimpleMatch
# Timezone: confirm the absolute instant carries a UTC offset (drives conversion)
Select-String -Path 'content/news/<PUBLISH-DATE>-<slug>.md' -Pattern 'event_start:.*[+-]\d\d:\d\d' 
```

Pass criteria: build exits `0`, the event's own detail page exists, the title
fragment appears on the `/news/events/` page, and `event_start` carries a UTC
offset so the time converts to each visitor's local zone. Then point the user at
`hugo server` → `/news/events/` to preview (the time shows in *your* local zone).

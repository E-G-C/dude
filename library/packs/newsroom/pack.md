---
name: newsroom
description: "Turn transcripts, notes, and calendar invites into Hugo news articles and events: a newsroom writer + event deep-fetcher, with article, calendar-event, and static-safe-time skills."
provides:
  agents:
    - dude-pack-newsroom-writer
    - dude-pack-newsroom-event-deep-fetcher
  skills:
    - dude-pack-newsroom-article
    - dude-pack-newsroom-event-from-calendar
    - dude-pack-newsroom-static-safe-time
requires:
  tools: [hugo]
---

# Newsroom Pack

A content-publishing team for a Hugo/Docsy site's News section: turn rough
source material (transcripts, meeting notes, calendar invites) into properly
front-mattered Hugo Markdown that the site's own templates render.

## Provides

### Agents

- `dude-pack-newsroom-writer` — turns a transcript, meeting notes, or scratch
  notes into one news article under `content/news/`, following the bundled
  article skill so output fits the site's content model and voice.
- `dude-pack-newsroom-event-deep-fetcher` — per-event calendar deep-fetch
  executor: given an event identity, runs a single-event verbatim fetch,
  extracts maximal detail (agenda, links, meeting ID/passcode, native time
  zone), and writes/refreshes the event markdown.

### Skills

- `dude-pack-newsroom-article` — rough-material → news-article procedure, with
  bundled `config/publication.yml`, `references/editorial-guide.md`, and
  `templates/article.md`.
- `dude-pack-newsroom-event-from-calendar` — turn a Microsoft 365 / Outlook /
  Teams calendar event into a published site Event (query, front-matter schema,
  filename convention, build verification).
- `dude-pack-newsroom-static-safe-time` — render time-relative content
  (next/upcoming/past events, countdowns, "in N days" chips) so freshness comes
  from the visitor's clock at page load, not the build-time `now`.

### Prompt

- `news-article.prompt.md` — drives the writer agent end to end.

## Requires

- `hugo` (extended) on PATH for build verification.
- **Project-specific assumptions.** This pack was extracted from a real site and
  encodes some local conventions you will likely adapt:
  - It writes to `content/news/` and assumes the site's news/event templates and
    front-matter schema.
  - The event tooling assumes WorkIQ (`workiq` / `workiq2`) MCP tools and
    Microsoft 365 / Outlook / Teams calendars. Without those, the
    `event-deep-fetcher` agent and the calendar skill won't have a data source;
    the article and static-safe-time skills still work standalone.
  - Editorial voice and publication config in `dude-pack-newsroom-article` carry
    the originating community's naming — review `config/publication.yml` and the
    editorial guide before first use.

## Install / remove

```bash
@dude add pack newsroom
@dude remove pack newsroom
```

## Related packs

- `hugo` / `docsy` — the engine and theme the news/event pages render on.
- `writing` — the `avoid-ai-writing-tropes` skill pairs well with article drafting.

---
name: dude-pack-newsroom-article
description: "Turn rough source material (a meeting or call transcript, raw meeting notes, or scratch notes) into a news article for the SECI AI Community Docsy site's News section (content/news/). Use when someone wants to write up, announce, or recap something for the community: a launch or milestone, a project update, a tech-talk recap, a 'what shipped' note, or 'turn these notes into a news post'. Produces ONE Hugo Markdown file with the site's news front matter, rendered by the site's own news template. No separate HTML and no inline styling. For event invites with a date, time, and RSVP, use the dude-pack-newsroom-event-from-calendar skill instead. Not for Word or legal docs, spreadsheets, or slides."
---

# Newsroom — rough material to a SECI AI Community news article

Turn a transcript or rough notes into a short news article for the SECI AI Community site's
News section. You write one Markdown file in `content/news/` with the site's front matter and a
plain-language body. The site's own template renders the title, summary, byline, category, and
tags, and the site theme handles all styling. There is no separate HTML and nothing to build by
hand.

## Files in this skill

All paths are relative to this `SKILL.md`.

| File | Role |
|------|------|
| [`./config/publication.yml`](./config/publication.yml) | Settings: community name, the news front-matter schema, the category list, tag style, and default voice. Read it every run. |
| [`./references/editorial-guide.md`](./references/editorial-guide.md) | The method and the voice: how to find the story, how it maps to the front matter and body, the AI writing tells to avoid, accuracy rules, and a final checklist. Read it fully before writing. |
| [`./templates/article.md`](./templates/article.md) | The Hugo article skeleton: news front matter plus a body outline. |

## Workflow

1. Gather inputs.
   - The rough material: a transcript, notes, pasted text, or a path the user gives.
   - Read [`./config/publication.yml`](./config/publication.yml) and
     [`./references/editorial-guide.md`](./references/editorial-guide.md) in full.
   - Take sensible defaults from config for anything minor. Ask only if something essential is
     genuinely unclear, such as which of several stories is the lead.

2. Find the story. Pull out what happened, why it matters and for whom, the specifics (names,
   numbers, dates), who did the work, and a real next step if there is one. (Editorial guide §4.)

3. Write one file at `content/news/YYYY-MM-DD-slug.md` from
   [`./templates/article.md`](./templates/article.md):
   - Front matter: `title`, `date`, `author`, `categories`, `summary`, `tags`, and optional `image`.
   - Body: a lead with no heading, then a few short sections. Do not repeat the title, byline,
     category, or tags in the body; the template renders them.
   - Pick one news category: `Breaking`, `Announcements`, `Community`, or `Learning`. Do not use
     `Events` or any `event_*` field (that routes to the event layout). Event invites belong in the
     `dude-pack-newsroom-event-from-calendar` skill.
   - Keep the tone plain and specific, and avoid the AI writing tells in editorial guide §3,
     including overused em dashes. Never invent facts or links; mark gaps with `[CONFIRM: ...]`.

4. Check it against the editorial guide §9 checklist. If a Hugo server is not already running, a
   quick build to a temp directory confirms the page renders. Then show the result and offer small
   fixes (title options, category, length, tags).

## Output

- One Markdown file in `content/news/`, named `YYYY-MM-DD-slug.md` with the date prefix matching
  the front-matter `date`.
- The site renders it through `layouts/news/single.html`. An article with no `event_*` field and
  without the `Events` category uses the standard news-article layout.

## Guardrails

- Plain and factual, not salesy. Follow the voice in editorial guide §2 and §3.
- Accuracy first: nothing invented, quotes attributed correctly, links only from the source or config.
- One news category, never `Events`. Keep event invites in the calendar-event skill.

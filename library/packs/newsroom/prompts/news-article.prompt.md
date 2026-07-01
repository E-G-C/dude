---
description: "Turn a meeting or call transcript or rough notes into a news article for the SECI AI Community site's News section (content/news/), using the bundled Newsroom skill. Use for write-ups, launch or milestone announcements, project updates, and tech-talk recaps."
name: "News article"
argument-hint: "path to a transcript/notes file (or select the text / open the file first)"
agent: Newsroom
---
Write a community news article from the source material using the bundled **Newsroom** skill.
Follow the skill's front-matter schema, file location, and voice instead of an ad hoc format.

**Source material:** ${input:source:path to a transcript/notes file, or leave blank to use the current selection or the open file}

Steps:
1. Resolve the source: use the path above; if blank, use `${selection}`; if still empty, use the
   active file `${file}`.
2. Follow [the Newsroom skill](../skills/dude-pack-newsroom-article/SKILL.md) end to end. First read
   [config/publication.yml](../skills/dude-pack-newsroom-article/config/publication.yml) and
   [references/editorial-guide.md](../skills/dude-pack-newsroom-article/references/editorial-guide.md) in full.
3. Write ONE Markdown file at `content/news/YYYY-MM-DD-slug.md` from
   [templates/article.md](../skills/dude-pack-newsroom-article/templates/article.md): the site's news front
   matter plus a plain-language body. Do not repeat the title, byline, category, or tags in the body.
4. Keep the tone plain and specific (editorial guide §2 and §3). Avoid em dashes and the listed AI
   writing tells. Never invent facts, quotes, numbers, dates, or links; mark gaps with `[CONFIRM: ...]`.
5. Pick a news category (Breaking, Announcements, Community, or Learning), not `Events`. Run the
   guide's checklist, then show the result and offer small fixes.

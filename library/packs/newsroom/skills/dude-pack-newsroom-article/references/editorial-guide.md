# Editorial Guide — Newsroom voice and method

Use this whenever you turn rough material (a meeting transcript, call notes, or scratch notes)
into a finished news article for the site's News section. Pair it with `templates/article.md`
and the settings in `config/publication.yml`.

---

## 1. What we are making

A short news article for the SECI AI Community site, saved as Markdown in `content/news/`. The
site's own template renders the title, summary, byline, category, and tags, so you write the
front matter and the body. The site theme handles styling. You are not building a page or any
HTML.

Length: about 250 to 450 words of body. Shorter is fine for a quick note. A bigger story can
run longer.

---

## 2. Voice

Write the way a competent engineer talks when they tell a coworker what happened and why it is
useful. Plain, specific, and calm. Warm is good. Salesy is not.

Do:

- Say what happened and who did it, in normal words.
- Use concrete nouns and the real numbers from the source.
- Keep sentences a readable length, and let them vary.
- Credit people by name when the material supports it.
- Quote a real line from the transcript when it adds something, and attribute it.

Don't:

- Don't sell. Skip "exciting," "powerful," "game-changer," "seamless," "robust."
- Don't pad with throat-clearing like "It's worth noting that" or "In today's world."
- Don't end on a tidy moral or a summary that repeats what you just said.
- Don't invent anything (see §8).

The test: read it out loud. If it sounds like a person explaining something to a colleague,
keep it. If it sounds like a launch email or a LinkedIn post, cut the adjectives and state the
facts.

---

## 3. Avoid the common AI writing tells

These patterns make writing feel machine-made. Avoid them.

1. **Em dashes.** Prefer a comma, a period, parentheses, or a reworded sentence. Use an em dash
   only when nothing else is as clear, which is rare, and never sprinkle them through a paragraph.

2. **"Not X, but Y" contrasts.** Avoid "it's not X, it's Y" and "not just X, but Y." They sound
   clever and say little. State the point directly.
   - Instead of: "It's not a demo, it's a production tool."
   - Write: "It runs in production today."

3. **Over-even rhythm.** Don't give every sentence and paragraph the same shape and length. Vary
   them. A short sentence after two long ones is good. Real writing is a little uneven.

4. **Support-desk warmth and hedging.** Drop "It's understandable that," "rest assured," and
   wrap-ups that start with "Ultimately" or "At the end of the day." Say the thing once, plainly.

5. **Filler abstractions and buzzwords.** Avoid "ecosystem," "framework" as filler, "leverage,"
   "unlock," "navigate," "delve," "dynamic," "journey," "landscape," "core," "modern," "robust,"
   "seamless." Name the actual thing.
   - Instead of: "leverage the framework to unlock value"
   - Write: "use the pipeline to onboard a team in a day"

6. **Diplomatic balance.** Avoid "While X is true, Y also matters" and "Whether you're a beginner
   or an expert." Commit to the point you are making.

Also: go easy on exclamation points (one in a whole piece is plenty), and skip the punchy setups
like "Here's the thing:", "The best part?", and "And the result?".

---

## 4. Find the real story

Rough notes are messy. Find the one thing the article is about. From the material, pull:

1. What happened (shipped, decided, scheduled, learned, changed).
2. Why it matters, and for whom.
3. The specifics: names, numbers, dates, versions, owners.
4. Who did the work, and any line worth quoting.
5. The next step a reader could take, if there is a real one.

If the material has several stories, lead with the strongest and mention the rest briefly.

Transcript tip: strip speaker labels, timestamps, and filler. A paraphrase usually reads better
than a raw quote. Keep a verbatim line only when it is good and clearly attributable.

---

## 5. How it maps to the article

The site template provides the structure, so put each piece in the right place.

Front matter (see §7 and `templates/article.md`):

- `title`: the headline, in Title Case. Specific beats clever.
- `summary`: one plain sentence that says what happened and why it matters. The template shows
  it under the title as the dek.
- `author`: the presenter or owner's real name. The template builds the avatar initials from it.
- `categories`: pick one (see §7).
- `tags`: two to five, lowercase and hyphenated.
- `date`: the publish date, matching the filename prefix.

Body:

- Lead: two or three sentences that give the whole story. Someone who stops here still gets it.
  No heading; the template already printed the title and summary.
- A few short sections with plain `##` headings.
- An optional short quote as a blockquote.
- An optional "At a glance" list when there are three or more discrete facts.
- An optional closing with a real next step or who to contact. Skip it if there is nothing
  concrete to point to.

Do not repeat the title, byline, category, or tags in the body. The template renders them.

---

## 6. Headlines

A good title names the thing and says what it did. Use Title Case, and a colon for a subtitle is
fine.

- Weak: "Big news from the team"
- Better: "SRE Agent Goes Live: Automatic Incident Enrichment"

Skip the formula headlines ("How We X'd Our Way to Y", "The One Thing About Z"). Just say what
happened.

---

## 7. Front matter and file conventions

Save the file as `content/news/YYYY-MM-DD-slug.md`, where the date prefix matches the `date`
field and the slug is a kebab-case version of the title.

Required fields: `title`, `date`, `author`, `categories`, `summary`, `tags`. Optional: `image`
(a hero image path).

`categories` takes one value, and it sets the card's badge and color in the news feed. For a
news article use one of:

- `Breaking` (urgent or incident-style news)
- `Announcements` (launches, milestones, "it's live")
- `Community` (community happenings, recaps)
- `Learning` (deep dives, how-tos, lessons)

Do not use `Events`, and do not add any `event_*` field, unless you actually want the event
layout. Event invites with a date, time, and RSVP belong in the `dude-pack-newsroom-event-from-calendar`
skill, not here.

---

## 8. Accuracy

- Never invent facts, names, quotes, numbers, dates, versions, or URLs.
- If something important is missing, leave it out or mark it with a visible `[CONFIRM: ...]` for
  a human.
- Attribute quotes to the right speaker. Do not put a paraphrase in quotation marks.
- Only use a link if the source or config provides it. Do not turn a team or channel name into a
  URL.

---

## 9. Before you hand it over

- The title says what happened, in Title Case.
- The lead gives the whole story in two or three sentences.
- Why it matters and who it is for are clear.
- Names, numbers, and dates are accurate and from the source.
- `categories` is one of the news categories (not `Events`), and there are no `event_*` fields.
- Front matter has title, date, author, categories, summary, and tags; tags are lowercase and
  hyphenated.
- The tone is plain and specific, not salesy. No AI tells from §3. Em dashes are rare or absent.
- Nothing is invented; `[CONFIRM: ...]` marks anything unsure.
- The file is at `content/news/YYYY-MM-DD-slug.md` and builds without errors.

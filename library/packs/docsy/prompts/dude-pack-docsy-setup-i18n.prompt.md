---
agent: agent
description: Add multilingual (i18n) support to a Docsy site.
---

Help the user set up multiple languages. Reference [skill §12](../skills/dude-pack-docsy-theme/SKILL.md#12-i18n).

## Critical ordering
In `hugo.toml`, the `[languages]` block **MUST appear before `[module]`**. Putting `[module]` first silently breaks multilingual sites. Fix this proactively.

## Minimal config
```yaml
contentDir: content/en
defaultContentLanguage: en
defaultContentLanguageInSubdir: false   # changes URLs site-wide — set deliberately
languages:
  en:
    languageName: English
    weight: 1
    params:
      title: "My Site"
      description: "..."
  no:
    languageName: Norsk
    contentDir: content/no
    weight: 2
    params:
      title: "Min side"
      time_format_default: "02.01.2006"
      time_format_blog: "02.01.2006"
```

## Content & UI strings
- Mirror content under each language's `contentDir` (e.g. `content/en/...`, `content/no/...`).
- Override UI strings in `i18n/<lang>.yaml` (project files override theme defaults).
- Debug missing translations: `hugo server --printI18nWarnings`.

## RTL languages
Set `languageDirection: rtl` on the language, then `npm install rtlcss --save-dev`.

## Verify
- The language selector appears in the navbar.
- Each language's home page renders; check the `defaultContentLanguageInSubdir` URL effect.

Point the user at [skill §12](../skills/dude-pack-docsy-theme/SKILL.md#12-i18n) for the full portable guide.

# Microsoft Visual Brand Bundle (Internal)

A drop-in bundle of **VS Code Copilot skills, instructions, prompts, design
tokens, and reference docs** for applying Microsoft's **visual identity**
(colors, typography, logo, layout) to internal projects.

> **Scope:** Visual elements only. This bundle is for **internal use** — it is
> not a legal/trademark policy. For anything customer-facing, partner-facing, or
> external, go to the official sources linked in
> [reference/provenance-and-licensing.md](reference/provenance-and-licensing.md).

## ELI5 — What this is

You drop this folder into a workspace. Copilot then knows:

- The official Microsoft brand colors (with hex codes and CSS variables)
- The official font family (Segoe UI) and a safe web fallback stack
- How the Microsoft logo should look, where it goes, and what not to do
- A clean visual layout for headers, footers, buttons, and cards

You can:

1. **Style a new page** → run
   [../../prompts/dude-pack-strata-apply-visual-system.prompt.md](../../prompts/dude-pack-strata-apply-visual-system.prompt.md)
2. **Import the design tokens** → drop in
   [tokens/strata.css](tokens/strata.css) or
   [tokens/tailwind.preset.js](tokens/tailwind.preset.js)

## Bundle map

Paths below are relative to this folder. In an installed workspace this folder
sits at `.github/skills/dude-pack-strata-visual/`, and `../../` is the
`.github/` root that VS Code auto-loads customizations from.

| Path                                                                                                       | What's in it                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`../../instructions/`](../../instructions/)                                                               | `.instructions.md` files auto-applied by file type                    |
| [`../../prompts/`](../../prompts/)                                                                         | `.prompt.md` workflows — apply branding and self-check                |
| [`../../agents/dude-pack-strata-stylist.agent.md`](../../agents/dude-pack-strata-stylist.agent.md)   | The `MS Brand Stylist` custom agent                                   |
| [`reference/`](reference/)                                                                                 | The visual brand explained: colors, typography, layout, sources       |
| [`tokens/`](tokens/)                                                                                       | Ready-to-use design tokens (CSS, SCSS, JSON, Tailwind preset)         |
| [`scripts/`](scripts/)                                                                                     | Smoke checks for brand-token drift                                    |
| [`examples/`](examples/)                                                                                   | Working HTML snippets (themed page, header/footer, buttons)           |
| [`SKILL.md`](SKILL.md)                                                                                     | The main skill entry — start here                                     |

## Quick start

### Use the tokens in plain CSS

```html
<link
  rel="stylesheet"
  href=".github/skills/dude-pack-strata-visual/tokens/strata.css"
/>
<button class="strata-btn strata-btn-primary">Get started</button>
```

### Use the tokens in Tailwind

```js
// tailwind.config.js
const strata = require('./.github/skills/dude-pack-strata-visual/tokens/tailwind.preset.js');
module.exports = { presets: [strata], content: ['./**/*.{html,jsx,tsx}'] };
```

### Ask Copilot to brand a page

> Apply the Microsoft visual brand bundle to `index.html`.

Copilot will follow
[../../instructions/dude-pack-strata-visual-system.instructions.md](../../instructions/dude-pack-strata-visual-system.instructions.md)
and the prompt in
[../../prompts/dude-pack-strata-apply-visual-system.prompt.md](../../prompts/dude-pack-strata-apply-visual-system.prompt.md).

## Core visual vocabulary at a glance

| Element         | Token            | Value                                                                     |
| --------------- | ---------------- | ------------------------------------------------------------------------- |
| Red (Office)    | `--strata-red`       | `#F25022`                                                                 |
| Green (Windows) | `--strata-green`     | `#7FBA00`                                                                 |
| Blue (Bing/Win) | `--strata-blue`      | `#00A4EF`                                                                 |
| Yellow (Office) | `--strata-yellow`    | `#FFB900`                                                                 |
| Wordmark gray   | `--strata-gray`      | `#737373`                                                                 |
| Body font       | `--strata-font-body` | `"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, …` |
| Docs surface    | `.strata-docs`       | Microsoft Learn-inspired article rhythm                                   |

Full details in [reference/colors.md](reference/colors.md) and
[reference/typography.md](reference/typography.md).

## Heads-up (the short version)

- **Don't use the Microsoft name as a verb, noun, or part of your product
  name.**
- **Internal use only.** Anything that ships outside Microsoft needs the
  official guidelines.

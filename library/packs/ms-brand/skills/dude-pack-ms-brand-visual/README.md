# Microsoft Visual Brand Bundle (Internal)

A drop-in bundle of **VS Code Copilot skills, instructions, prompts, design
tokens, and reference docs** for applying Microsoft's **visual identity**
(colors, typography, logo, layout) to internal projects.

> **Scope:** Visual elements only. This bundle is for **internal use** — it is
> not a legal/trademark policy. For anything customer-facing, partner-facing, or
> external, go to the official sources linked in
> [reference/sources.md](reference/sources.md).

## ELI5 — What this is

You drop this folder into a workspace. Copilot then knows:

- The official Microsoft brand colors (with hex codes and CSS variables)
- The official font family (Segoe UI) and a safe web fallback stack
- How the Microsoft logo should look, where it goes, and what not to do
- A clean visual layout for headers, footers, buttons, and cards

You can:

1. **Style a new page** → run
   [../../prompts/apply-ms-brand.prompt.md](../../prompts/apply-ms-brand.prompt.md)
2. **Check an existing page** → run
   [../../prompts/audit-ms-brand.prompt.md](../../prompts/audit-ms-brand.prompt.md)
3. **Import the design tokens** → drop in
   [tokens/ms-brand.css](tokens/ms-brand.css) or
   [tokens/tailwind.preset.js](tokens/tailwind.preset.js)

## Bundle map

This bundle lives at the workspace root under [`.github/`](../../). The skill
assets are in this folder (`.github/skills/dude-pack-ms-brand-visual/`); the
customizations VS Code auto-loads are nearby under `.github/`.

| Path                                                                                                       | What's in it                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`.github/copilot-instructions.md`](../../copilot-instructions.md)                                         | Workspace-wide hint Copilot loads first                               |
| [`.github/instructions/`](../../instructions/)                                                             | `.instructions.md` files auto-applied by file type                    |
| [`.github/prompts/`](../../prompts/)                                                                       | `.prompt.md` workflows — apply branding, audit a page                 |
| [`.github/agents/dude-pack-ms-brand-stylist.agent.md`](../../agents/dude-pack-ms-brand-stylist.agent.md) | The `MS Brand Stylist` custom agent                                   |
| [`reference/`](reference/)                                                                                 | The visual brand explained: colors, typography, logo, layout, sources |
| [`tokens/`](tokens/)                                                                                       | Ready-to-use design tokens (CSS, SCSS, JSON, Tailwind preset)         |
| [`scripts/`](scripts/)                                                                                     | Brand smoke checks for token drift in Hugo-authored surfaces          |
| [`examples/`](examples/)                                                                                   | Working HTML snippets (themed page, header/footer, buttons)           |
| [`SKILL.md`](SKILL.md)                                                                                     | The main skill entry — start here                                     |

## Quick start

### Use the tokens in plain CSS

```html
<link
  rel="stylesheet"
  href=".github/skills/dude-pack-ms-brand-visual/tokens/ms-brand.css"
/>
<button class="ms-btn ms-btn-primary">Get started</button>
```

### Use the tokens in Tailwind

```js
// tailwind.config.js
const msBrand = require('./.github/skills/dude-pack-ms-brand-visual/tokens/tailwind.preset.js');
module.exports = { presets: [msBrand], content: ['./**/*.{html,jsx,tsx}'] };
```

### Ask Copilot to brand a page

> Apply the Microsoft visual brand bundle to `index.html`.

Copilot will follow
[../../instructions/ms-visual-brand.instructions.md](../../instructions/ms-visual-brand.instructions.md)
and the prompt in
[../../prompts/apply-ms-brand.prompt.md](../../prompts/apply-ms-brand.prompt.md).

## Core visual vocabulary at a glance

| Element         | Token            | Value                                                                     |
| --------------- | ---------------- | ------------------------------------------------------------------------- |
| Red (Office)    | `--ms-red`       | `#F25022`                                                                 |
| Green (Windows) | `--ms-green`     | `#7FBA00`                                                                 |
| Blue (Bing/Win) | `--ms-blue`      | `#00A4EF`                                                                 |
| Yellow (Office) | `--ms-yellow`    | `#FFB900`                                                                 |
| Wordmark gray   | `--ms-gray`      | `#737373`                                                                 |
| Body font       | `--ms-font-body` | `"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, …` |
| Docs surface    | `.ms-docs`       | Microsoft Learn-inspired article rhythm                                   |

Full details in [reference/colors.md](reference/colors.md) and
[reference/typography.md](reference/typography.md).

## Heads-up (the short version)

- **Don't recolor, rotate, or restyle the four-square logo.** Use
  `.ms-logo-mark` for internal surfaces.
- **Don't put the logo on a busy background.** Keep clear space around it.
- **Don't use the Microsoft name as a verb, noun, or part of your product
  name.**
- **Internal use only.** Anything that ships outside Microsoft needs the
  official guidelines.

See [reference/logo.md](reference/logo.md) for the visual-only summary.

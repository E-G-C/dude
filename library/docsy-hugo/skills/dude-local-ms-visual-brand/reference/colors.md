# Microsoft Brand Colors (Visual Reference)

Microsoft's visual identity is anchored by the **four-square logo colors** plus a neutral **wordmark gray**. Use these as your primary palette for internal branded surfaces.

## The core palette

| Role | Name | HEX | RGB | CSS token |
|---|---|---|---|---|
| Top-left square | Red (Office-family accent) | `#F25022` | `242, 80, 34` | `--ms-red` |
| Top-right square | Green (Windows-family accent) | `#7FBA00` | `127, 186, 0` | `--ms-green` |
| Bottom-left square | Blue (Bing / Windows accent) | `#00A4EF` | `0, 164, 239` | `--ms-blue` |
| Bottom-right square | Yellow (Office-family accent) | `#FFB900` | `255, 185, 0` | `--ms-yellow` |
| Wordmark on light bg | Gray | `#737373` | `115, 115, 115` | `--ms-gray` |

> The four-square colors come from Microsoft's brand materials and are widely published — see [sources.md](sources.md). Treat them as **brand-protected**: don't tint, shade, or invent new "Microsoft" colors.

## Neutrals (suggested, internal use)

These are not "the" official neutrals (Microsoft Brand Central defines those) but they pair safely with the core palette for internal UI.

| Role | HEX | CSS token |
|---|---|---|
| Surface / page background (light) | `#FFFFFF` | `--ms-bg` |
| Subtle surface | `#F3F2F1` | `--ms-bg-subtle` |
| Divider / border | `#E1DFDD` | `--ms-border` |
| Body text | `#201F1E` | `--ms-text` |
| Secondary text | `#605E5C` | `--ms-text-muted` |
| Dark surface | `#1B1A19` | `--ms-bg-dark` |
| Text on dark | `#FFFFFF` | `--ms-text-on-dark` |

## How to use color

### Do

- Use **one accent color per surface** (e.g. blue for a dashboard, green for a success state).
- Use neutrals for the bulk of the UI; reserve the four squares as accents and highlights.
- Use `--ms-gray` (#737373) for the Microsoft wordmark on light backgrounds; white on dark.
- Keep text contrast at WCAG AA or better.

### Don't

- Don't recolor the four-square logo squares. Each square has its assigned color.
- Don't use the four squares as a gradient or as a continuous color wash.
- Don't introduce close-but-not-quite shades (e.g. "almost-Microsoft-blue").
- Don't put colored text on a colored background of similar luminance.

## Pairing guidance

| Surface | Background | Accent | Text |
|---|---|---|---|
| Light dashboard | `--ms-bg` | `--ms-blue` | `--ms-text` |
| Light marketing-style page | `--ms-bg-subtle` | `--ms-red` *or* `--ms-yellow` | `--ms-text` |
| Dark hero / header | `--ms-bg-dark` | `--ms-blue` *or* `--ms-green` | `--ms-text-on-dark` |
| Success / positive | (any) | `--ms-green` | (matching) |
| Warning / attention | (any) | `--ms-yellow` | `--ms-text` |
| Error / critical | (any) | `--ms-red` | (matching) |

## Code snippets

### CSS

```css
@import url("../tokens/ms-brand.css");

.hero {
  background: var(--ms-bg-dark);
  color: var(--ms-text-on-dark);
}
.hero .cta {
  background: var(--ms-blue);
  color: #fff;
}
```

### Tailwind

```html
<div class="bg-ms-bg-dark text-ms-text-on-dark">
  <button class="bg-ms-blue text-white">Get started</button>
</div>
```

## Sources

See [sources.md](sources.md) for the canonical public references.

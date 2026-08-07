# Microsoft Brand Colors (Visual Reference)

Microsoft's visual identity is anchored by the **four-square logo colors** plus a neutral **wordmark gray**. Use these as your primary palette for internal branded surfaces.

## The core palette

| Role | Name | HEX | RGB | CSS token |
|---|---|---|---|---|
| Top-left square | Red (Office-family accent) | `#F25022` | `242, 80, 34` | `--strata-red` |
| Top-right square | Green (Windows-family accent) | `#7FBA00` | `127, 186, 0` | `--strata-green` |
| Bottom-left square | Blue (Bing / Windows accent) | `#00A4EF` | `0, 164, 239` | `--strata-blue` |
| Bottom-right square | Yellow (Office-family accent) | `#FFB900` | `255, 185, 0` | `--strata-yellow` |
| Wordmark on light bg | Gray | `#737373` | `115, 115, 115` | `--strata-gray` |

> The four-square colors come from Microsoft's brand materials and are widely published — see [provenance-and-licensing.md](provenance-and-licensing.md). Treat them as **brand-protected**: don't tint, shade, or invent new "Microsoft" colors.

## Neutrals (suggested, internal use)

These are not "the" official neutrals (Microsoft Brand Central defines those) but they pair safely with the core palette for internal UI.

| Role | HEX | CSS token |
|---|---|---|
| Surface / page background (light) | `#FFFFFF` | `--strata-bg` |
| Subtle surface | `#F3F2F1` | `--strata-bg-subtle` |
| Divider / border | `#E1DFDD` | `--strata-border` |
| Body text | `#201F1E` | `--strata-text` |
| Secondary text | `#605E5C` | `--strata-text-muted` |
| Dark surface | `#1B1A19` | `--strata-bg-dark` |
| Text on dark | `#FFFFFF` | `--strata-text-on-dark` |

## How to use color

### Do

- Use **one accent color per surface** (e.g. blue for a dashboard, green for a success state).
- Use neutrals for the bulk of the UI; reserve the four squares as accents and highlights.
- Use `--strata-gray` (#737373) for the Microsoft wordmark on light backgrounds; white on dark.
- Keep text contrast at WCAG AA or better.

### Don't

- Don't recolor the four-square logo squares. Each square has its assigned color.
- Don't use the four squares as a gradient or as a continuous color wash.
- Don't introduce close-but-not-quite shades (e.g. "almost-Microsoft-blue").
- Don't put colored text on a colored background of similar luminance.

## Pairing guidance

| Surface | Background | Accent | Text |
|---|---|---|---|
| Light dashboard | `--strata-bg` | `--strata-blue` | `--strata-text` |
| Light marketing-style page | `--strata-bg-subtle` | `--strata-red` *or* `--strata-yellow` | `--strata-text` |
| Dark hero / header | `--strata-bg-dark` | `--strata-blue` *or* `--strata-green` | `--strata-text-on-dark` |
| Success / positive | (any) | `--strata-green` | (matching) |
| Warning / attention | (any) | `--strata-yellow` | `--strata-text` |
| Error / critical | (any) | `--strata-red` | (matching) |

## Code snippets

### CSS

```css
@import url("../tokens/strata.css");

.hero {
  background: var(--strata-bg-dark);
  color: var(--strata-text-on-dark);
}
.hero .cta {
  background: var(--strata-blue);
  color: #fff;
}
```

### Tailwind

```html
<div class="bg-strata-bg-dark text-strata-text-on-dark">
  <button class="bg-strata-blue text-white">Get started</button>
</div>
```

## Sources

See [provenance-and-licensing.md](provenance-and-licensing.md) for the canonical public references.

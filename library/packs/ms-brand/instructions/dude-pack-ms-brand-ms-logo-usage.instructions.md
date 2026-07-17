---
applyTo: '**/*.{html,jsx,tsx,vue,svelte,md,mdx,astro,svg}'
description:
  Rules for placing the Microsoft four-square logo on internal surfaces.
---

# Microsoft Logo — Placement Rules

When the user asks to **add the Microsoft logo** to an internal page, component,
slide, or doc, apply these rules.

## Internal implementation

- For internal surfaces, `.ms-logo-mark` from
  `.github/skills/dude-pack-ms-brand-visual/tokens/ms-brand.css` is the
  standard implementation.
- **Do not** generate alternate logos with AI images or altered geometry.
- When visible text already says "Microsoft," keep the mark `aria-hidden="true"`
  to avoid duplicate screen reader output.
- When the mark appears by itself, use `role="img" aria-label="Microsoft"`.

## Variants

| Background                       | File you want                             |
| -------------------------------- | ----------------------------------------- |
| Light (white / `--ms-bg-subtle`) | Gray-wordmark variant                     |
| Dark (`--ms-bg-dark`)            | White-wordmark variant                    |
| Photo / busy                     | Don't place — change the background first |

## Sizing

| Context     | Height   |
| ----------- | -------- |
| Footer      | 16–24 px |
| Header      | 24–32 px |
| Hero        | 48–64 px |
| Slide title | 32–48 px |

Minimums: **16 px** (mark only), **20 px** (full lockup with wordmark).

## Clear space

Reserve clear space on all four sides equal to the height of one of the four
squares (≈ ¼ of the lockup height). Do not place text, icons, dividers, or page
edges inside that zone.

## Don't list

- Don't recolor any square.
- Don't rearrange squares or change their relative sizes.
- Don't rotate, skew, stretch, or distort.
- Don't apply gradients, shadows, glows, outlines, or 3D effects.
- Don't animate the squares (rotation, hover, loading-spinner).
- Don't combine inside the clear-space zone with another logo, tagline, or
  product name.
- Don't use as a favicon, app icon, or social avatar of a non-Microsoft entity.

## Markup pattern

With visible wordmark text:

```html
<span class="ms-logo-mark" aria-hidden="true"></span>
<span class="wordmark">Microsoft</span>
```

Mark only:

```html
<span class="ms-logo-mark" role="img" aria-label="Microsoft"></span>
```

## See also

- [../skills/dude-pack-ms-brand-visual/reference/logo.md](../skills/dude-pack-ms-brand-visual/reference/logo.md)
- [../skills/dude-pack-ms-brand-visual/reference/sources.md](../skills/dude-pack-ms-brand-visual/reference/sources.md)
  for external-use references.

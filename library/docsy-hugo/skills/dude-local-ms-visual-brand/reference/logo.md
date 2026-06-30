# Microsoft Logo — Visual Usage (Internal)

The Microsoft logo is the **four colored squares + the "Microsoft" wordmark**. For internal branded surfaces, use the final internal implementation in [../tokens/ms-brand.css](../tokens/ms-brand.css): `.ms-logo-mark` for the four-square mark, paired with visible Microsoft wordmark text when the full lockup is needed.

## Anatomy

```
┌───────┬───────┐
│  red  │ green │   ◀ the four-square symbol (the "mark")
├───────┼───────┤
│ blue  │yellow │
└───────┴───────┘
   Microsoft        ◀ the wordmark (Segoe-family, gray on light / white on dark)
```

- **Symbol** = the four squares.
- **Wordmark** = the word "Microsoft".
- **Full logo** = symbol + wordmark, horizontal lockup.

| Element | Color (light bg) | Color (dark bg) |
|---|---|---|
| Top-left square | `#F25022` red | `#F25022` red |
| Top-right square | `#7FBA00` green | `#7FBA00` green |
| Bottom-left square | `#00A4EF` blue | `#00A4EF` blue |
| Bottom-right square | `#FFB900` yellow | `#FFB900` yellow |
| Wordmark | `#737373` gray | `#FFFFFF` white |

## Clear space

Maintain clear space around the logo equal to the **height of one square (X)** on all sides. Nothing — text, images, edges — enters this zone.

```
       ┃ X ┃
   ━━━━┏━━━━━━━━━━━━━━┓━━━━
   X   ┃  [logo]      ┃   X
   ━━━━┗━━━━━━━━━━━━━━┛━━━━
       ┃ X ┃
```

## Minimum sizes

| Medium | Minimum |
|---|---|
| Screen (mark only) | 16 px tall |
| Screen (full lockup) | 20 px tall |
| Print (mark only) | 0.25 in / 6 mm tall |
| Print (full lockup) | 0.375 in / 10 mm tall |

Below these sizes, the squares blur and the wordmark becomes illegible.

## Placement

- **Header:** top-left, aligned to the page's content gutter.
- **Footer:** small mark (16–24 px) before a copyright or attribution line.
- **Hero:** centered, with display-scale clear space, only when the page is *explicitly* a Microsoft-branded surface.
- **Cards / tiles:** avoid placing the full logo. Use the four-square mark only when it adds identity value.

## Do

- Use `.ms-logo-mark` from the token CSS for internal surfaces.
- Place on a **solid, calm background** (white, very light gray, or a brand-approved dark).
- Use the **gray wordmark on light**, **white wordmark on dark**.
- Keep at least **1 X** of clear space around it.

## Don't

- Don't recolor any square. Don't swap or rearrange them.
- Don't rotate, skew, stretch, distort, outline, drop-shadow, or animate the logo.
- Don't place it on a busy photo, gradient, or low-contrast surface.
- Don't combine it with other logos, taglines, or your own brand mark inside the clear-space zone.
- Don't create alternate geometry, alternate colors, or AI-generated versions of the mark.
- Don't use the four squares as a decorative pattern, loading spinner, or background motif.

## Visual examples (do / don't)

```
✅ DO                              ❌ DON'T
┌──────────────────────┐           ┌──────────────────────┐
│ [■■]  Microsoft      │           │ [■■]Microsoft        │  ← no clear space
│ [■■]                 │           │ [■■]                 │
└──────────────────────┘           └──────────────────────┘

✅ DO                              ❌ DON'T
white wordmark on dark bg          recolored squares
                                   (e.g. all blue)

✅ DO                              ❌ DON'T
flat, square edges                 rounded, beveled, or 3D squares
```

## In code

With visible wordmark text:

```html
<span class="ms-logo-mark" aria-hidden="true"></span>
<span class="wordmark">Microsoft</span>
```

Mark only:

```html
<span class="ms-logo-mark" role="img" aria-label="Microsoft"></span>
```

The token CSS preserves the 10x10-square / 1-unit-gap geometry and scales proportionally at 16 px, 24 px, and larger sizes.

## External use

If the artifact will leave Microsoft, stop and use the Brand Central guidance and review process listed in [sources.md](sources.md).

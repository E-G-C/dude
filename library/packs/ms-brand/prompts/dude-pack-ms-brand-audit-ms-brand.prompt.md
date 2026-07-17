---
mode: agent
description: Audit a file/page against the Microsoft visual brand bundle. Reports issues; offers to fix.
---

# Audit Microsoft Visual Brand

Check the given file (or workspace surface) against the Microsoft visual brand bundle and report a structured findings list.

## Scope check first

If the artifact is **external/customer-facing**, stop and warn the user to use official Brand Central guidance instead.

## Checklist

Run the checklist below and produce a markdown table of **Pass / Warn / Fail** per item, with file:line references.

### Colors

- [ ] No hardcoded brand hex values (`#F25022`, `#7FBA00`, `#00A4EF`, `#FFB900`, `#737373`) — must use tokens, except in token/reference files or visible swatch labels that document the token values.
- [ ] No "almost" brand colors (`#F35022`, `#0099E5`, `#00A1EE`, …) — flag any close-but-wrong shade.
- [ ] Only one accent color per surface (count unique brand accents per visible section).
- [ ] WCAG AA contrast satisfied on text and interactive elements.
- [ ] Four-square palette is **not** used as a gradient or background wash.

### Typography

- [ ] Body / heading font stack references `--ms-font-body` / `--ms-font-heading`, or lists `"Segoe UI Variable Text"` / `"Segoe UI Variable"` before `"Segoe UI"`.
- [ ] `font-optical-sizing: auto` is present when custom typography CSS bypasses `.ms-brand`.
- [ ] Documentation pages use `.ms-docs`; prose is constrained to `--ms-docs-readable-width`, while tables/code/reference blocks can use `--ms-docs-wide-width`.
- [ ] No Google-Font / CDN imports of Roboto, Open Sans, Inter, Calibri, etc. as a Microsoft substitute.
- [ ] Headings use Semibold (600) with tight line-height (≤ 1.3).
- [ ] Body size ≥ 14 px (default 16 px).
- [ ] No more than 2 weights per surface; no all-caps headings as a default.

### Logo

- [ ] If the logo appears on an internal surface, it uses `.ms-logo-mark` from the token CSS.
- [ ] Clear space ≥ height of one square preserved around it.
- [ ] Minimum size respected (16 px mark / 20 px lockup).
- [ ] Wordmark color matches background (gray on light, white on dark).
- [ ] No recoloring, rotation, distortion, animation, shadow, gradient, or rearrangement of squares.

### Layout

- [ ] Paddings / margins map to the `--ms-space-*` 8-pt scale (no random 7px, 13px, 19px).
- [ ] Buttons use `.ms-btn*` (or the equivalent token-driven styles).
- [ ] Radius values come from the radius scale (no `border-radius: 6px` etc.).
- [ ] Shadows use `--ms-elev-*` (no `0 10px 40px rgba(…)`-style dramatic shadows).

### Iconography

- [ ] Icons come from a single family (Fluent UI System Icons recommended).
- [ ] Icons inherit color via `currentColor` rather than hardcoded fills.

### Misc

- [ ] No emoji used as functional UI iconography.
- [ ] No third-party logos placed inside the Microsoft logo's clear space.
- [ ] File is not flagged as customer-facing (`README`, manifest, deployment config) without an external-use warning.

## Output format

```
| Area | Item | Status | Location | Notes |
|---|---|---|---|---|
| Colors | Hardcoded #00A4EF in primary button | Fail | src/Header.tsx:42 | Replace with var(--ms-blue) |
| Typography | Roboto loaded from Google Fonts | Fail | index.html:8 | Remove; use Segoe UI stack |
| Logo | Custom logo geometry | Warn | src/Logo.tsx | Use .ms-logo-mark from the token CSS |
| Layout | border-radius: 6px on card | Warn | styles.css:120 | Use --ms-radius-lg (8px) or --ms-radius-md (4px) |
```

After the table, offer the user **"Want me to fix the Fail and Warn items?"** and proceed if confirmed.

# Layout, Spacing & Iconography (Internal)

Visual rules of thumb that make an internal page *feel* like Microsoft — calm, grid-driven, high-contrast, and confidently typographic.

## Spacing scale

Use an 8-pt base scale. Tokens are exposed as `--ms-space-*`.

| Token | Px | Use |
|---|---|---|
| `--ms-space-0` | 0 | reset |
| `--ms-space-1` | 4 | icon ↔ label, dense controls |
| `--ms-space-2` | 8 | inside a control |
| `--ms-space-3` | 12 | between related items |
| `--ms-space-4` | 16 | default gap |
| `--ms-space-5` | 24 | between sections in a card |
| `--ms-space-6` | 32 | between cards |
| `--ms-space-7` | 48 | between page sections |
| `--ms-space-8` | 64 | hero padding |

## Radius scale

Microsoft surfaces favor **subtle rounding** — never pill-shaped except for chips.

| Token | Px | Use |
|---|---|---|
| `--ms-radius-sm` | 2 | inputs, small badges |
| `--ms-radius-md` | 4 | buttons, cards |
| `--ms-radius-lg` | 8 | dialogs, large cards |
| `--ms-radius-pill` | 9999 | tags, chips, status pills |

## Elevation

Keep shadows soft and short. Avoid dramatic drop shadows.

```css
--ms-elev-1: 0 1px 2px rgba(0,0,0,0.08);
--ms-elev-2: 0 2px 6px rgba(0,0,0,0.10);
--ms-elev-3: 0 4px 12px rgba(0,0,0,0.12);
```

## Grid

- **Page max width:** 1280 px content; allow gutters to breathe.
- **Columns:** 12-col grid is standard; 4-col on mobile.
- **Gutter:** 24 px desktop, 16 px mobile.

## Buttons

| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `--ms-blue` | white | none |
| Secondary | transparent | `--ms-text` | 1 px `--ms-border` |
| Subtle | `--ms-bg-subtle` | `--ms-text` | none |
| Destructive | `--ms-red` | white | none |

- Height: 32 px (compact), 40 px (default), 48 px (touch).
- Padding: 16 px horizontal at default height.
- Radius: `--ms-radius-md` (4 px).
- Weight: Segoe UI Semibold (600).

## Iconography

Microsoft uses the **Fluent UI System Icons** family for product UI.

- Source: <https://github.com/microsoft/fluentui-system-icons> (open-source, MIT).
- Two styles: **Regular** (outline) and **Filled**. Pair them — regular for inactive, filled for active/selected.
- Stroke icons are 1.5 px nominal at 24 px.
- Default sizes: **16, 20, 24, 32, 48**.

### Do

- Use Fluent icons in a single weight per surface.
- Color icons with `currentColor` so they inherit text color.
- Pair icon + label with `--ms-space-2` (8 px).

### Don't

- Don't mix Fluent with another icon set (Material, Bootstrap, etc.) on the same surface.
- Don't recolor the four-square logo into an "icon".
- Don't use emoji as functional UI icons.

## Imagery

For internal hero / illustration:

- Prefer **flat illustration** or **clean product photography** with calm backgrounds.
- Avoid stock photos that depict logos of other companies.
- If you need an image of a Microsoft product (Surface, Xbox, Teams UI), use Brand Central — don't pull from search results.

## Motion (light touch)

- Durations: 150 ms (micro), 250 ms (standard), 400 ms (entrance).
- Easing: `cubic-bezier(0.1, 0.9, 0.2, 1)` for entrances; `ease-out` for exits.
- Avoid bouncy or playful overshoot for enterprise contexts.

## Accessibility (non-negotiable, even internal)

- Maintain WCAG AA contrast: 4.5:1 for text, 3:1 for large text and UI components.
- Focus rings must be visible — use a 2 px `--ms-blue` outline with 2 px offset.
- Don't communicate state with color alone (pair with icon or label).

# Provenance and licensing

Where the values in this bundle come from, what is and is not licensed, and the
measured accessibility numbers behind the palettes.

## Provenance

**Strata is an original visual system.** It is not derived from, based on, or
compatible with any company's brand identity or any published design system. It
carries no affiliation with any organisation, product, or design system, and it
ships no logo, wordmark, product mark, or icon.

The values here were chosen and measured for this pack:

- **Planes and rules.** Chosen to give a flat, edge-read layering model, then
  measured against the WCAG non-text threshold on every plane in both themes.
- **Palettes.** Two sets. `pigment` names its slots after mineral pigments —
  azurite, verdigris, malachite, orpiment, cinnabar, amethyst, rhodochrosite —
  the colours ground out of rock and used in paint for millennia. `spectrum`
  takes a cooler ground and a broader spectral spread. The names are
  documentation; the token ids are role-based.
- **Scales.** The 4/8 spacing scale, the 2/4/8 radius scale, and the type ramp
  are conventional interface arithmetic, not anyone's proprietary system.
- **The 688px reading measure** is a standard long-form measure, arrived at from
  the usual 60–75 character target at 16px. It is a coincidence of arithmetic
  that many reading surfaces land near this number, not a derivation from one.

Nothing in this bundle should be read as legal or trademark advice. If you need
to apply a real organisation's identity, use that organisation's own current
brand guidelines and review process. This pack is not a substitute for one.

## Font licensing

Strata **ships no font files, declares no `@font-face`, and loads nothing from a
CDN.** It names families and falls through to the platform UI font. The
validator fails the build on any `@font-face` rule or remote font import inside
the pack.

| Family | Licence | Notes |
|---|---|---|
| Atkinson Hyperlegible | SIL Open Font License 1.1 | Designed for low-vision readability. Not installed by default on any mainstream OS. |
| Noto Sans / Noto Sans Mono | SIL Open Font License 1.1 | Not installed by default on most systems. |
| Liberation Mono | SIL Open Font License 1.1 | Common on Linux distributions. |
| `system-ui`, `ui-monospace`, and the platform fallbacks | n/a | Resolved by the OS; nothing is downloaded. |

**The realistic rendering on most machines is the platform default font**, and
that is a supported outcome rather than a fallback failure — every measurement
in this bundle is font-independent. If you want the named faces, install them or
self-host them in your own project, under their own licence terms.

## Optional icon dependency

Strata mandates no icon family and ships none. Generic guidance is in
[layout-and-iconography.md](layout-and-iconography.md).

If you want an off-the-shelf open-source set, **Fluent System Icons** is MIT
licensed and works well at the documented sizes:
<https://github.com/microsoft/fluentui-system-icons>

This is an **optional and unaffiliated** dependency. Strata has no relationship
with that project or its publisher. The MIT licence covers the icon *artwork*;
it does **not** grant any trademark rights, and the publisher's marks remain
theirs. Any other MIT- or SIL-licensed family is equally acceptable.

## Accessibility authority

**WCAG 2.2** is the authority for every contrast claim in this bundle.

| Criterion | Threshold | Applies to |
|---|---|---|
| 1.4.3 Contrast (Minimum), AA | 4.5:1 | body text |
| 1.4.3, AA large | 3:1 | ≥ 18.66px regular or ≥ 14px bold |
| 1.4.11 Non-text Contrast, AA | 3:1 | UI component boundaries, graphical objects needed to understand content |

Ratios are computed with the standard relative-luminance formula: sRGB channels
linearised at the 0.03928 threshold with `((v + 0.055) / 1.055) ^ 2.4`, luminance
`0.2126R + 0.7152G + 0.0722B`, ratio `(L1 + 0.05) / (L2 + 0.05)`.

**Hue separation is not a WCAG criterion.** It is used in this bundle only for
categorical series, where two colours at equal luminance are separable only by
hue — which fails for colour-vision deficiency and in greyscale. That is why the
non-colour-encoding rule for charts is mandatory rather than advisory.

## Measured results

All four palette/theme surfaces were measured before shipping — every text pair
on every plane, every pigment as text, every tint pair, the focus ring at both
zero and the mandated offset, and pairwise adjacency for the categorical ramp.

Findings that shaped the shipped values:

- **`--strata-rule` clears the 3:1 non-text floor on every plane in both themes**
  in each palette, so one shared rule token is enough and there is no
  `rule-strong` split. Its worst pairing clears the floor by a small margin,
  which is why the rule is never optional on a plane change.
- **Most vivid slots fail as text on a light plane** — the amber slots measure
  under 2:1. This is inherent to a real amber and is the reason the three-form
  model exists rather than a single value per slot.
- **White on the vivid danger slot fails AA normal in `pigment`** (4.21:1), so
  the destructive component fills with the deep form in both palettes.
- **Amber takes dark text**, via `--strata-on-warning`. White on it is
  unreadable, and darkening the amber until white worked would have turned it
  brown.
- **Every tint field is ~1.1:1 against every plane, and two tints can be
  identical in luminance.** Badges are therefore bordered in their own ink; the
  border is what makes the badge an object.
- **The focus ring fails below 3:1 against nearly every fill at
  `outline-offset: 0`** and clears comfortably at the mandated 2px, because the
  offset gap shows the parent plane rather than the fill. The offset is
  load-bearing.
- **The categorical ramp is hue-differentiated, not luminance-differentiated.**
  Even optimally ordered, adjacent series do not reach 3:1. Two slot pairs were
  re-tuned during design because they were separable on neither channel, and
  seven slots is the ceiling the hue space allows.

To re-measure after recolouring, compute the ratios with the formula above and
run `scripts/strata-check.sh`, which asserts the structural invariants —
cross-palette id parity, no structural token inside a palette block, no shadow,
no keyword easing, and no remote font.

## Legal guidance

For general, vendor-neutral guidance on using someone else's trademarks in
software and documentation, the International Trademark Association's public
fact sheets are a reasonable starting point:
<https://www.inta.org/fact-sheets/>

That is a pointer to neutral reference material, not legal advice, and not an
endorsement. Consult your own counsel for anything that matters.

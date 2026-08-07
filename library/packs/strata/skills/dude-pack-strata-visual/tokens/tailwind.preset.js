/**
 * Strata — Tailwind preset.
 *
 * One structural system, two colour palettes (pigment, spectrum) x two themes.
 *
 * IMPORTANT — colours resolve to CSS custom properties, not literals.
 * A compiled Tailwind preset cannot switch palettes at runtime: utility classes
 * resolve to fixed values at build time. So this preset exposes the token names
 * as var() references and lets tokens/strata.css do the switching. Import both:
 *
 *   // tailwind.config.js
 *   const strata = require('./path/to/tokens/tailwind.preset.js');
 *   module.exports = { presets: [strata], content: ['./**\/*.{html,jsx,tsx}'] };
 *
 *   <!-- and the stylesheet that carries the four palette/theme blocks -->
 *   <link rel="stylesheet" href="./path/to/tokens/strata.css">
 *   <html data-strata-palette="spectrum" data-strata-theme="dark">
 *
 * Consequence: Tailwind opacity modifiers (bg-strata-primary/50) do NOT work on
 * these colours, because the custom property holds a complete colour rather than
 * space-separated channels. Storing channels instead would double every colour
 * token across four blocks to serve a feature this pack does not itself use, so
 * it is deliberately not done. If you need per-utility opacity, use the CSS
 * component classes.
 *
 * Structure below IS literal, because it does not vary by palette. That split —
 * structure literal, colour by reference — mirrors the architecture exactly.
 *
 * There is NO boxShadow bucket. Depth is a plane plus a 1px rule.
 *
 * Unaffiliated with any company, product, or design system.
 */

const ref = (name) => `var(--strata-${name})`;

const series = {};
for (let i = 1; i <= 7; i += 1) {
  series[`s${i}`] = ref(`series-${i}`);
  series[`s${i}-deep`] = ref(`series-${i}-deep`);
  series[`s${i}-tint`] = ref(`series-${i}-tint`);
  series[`s${i}-tint-ink`] = ref(`series-${i}-tint-ink`);
}

module.exports = {
  theme: {
    extend: {
      colors: {
        strata: {
          // planes
          canvas: ref('canvas'),
          surface: ref('surface'),
          soft: ref('soft'),
          sunken: ref('sunken'),

          // ink
          ink: ref('ink'),
          muted: ref('muted'),
          'on-accent': ref('on-accent'),
          'on-warning': ref('on-warning'),

          // rules. `hair` is decorative only and must never be used as a
          // control boundary, a plane edge, or a field border.
          rule: ref('rule'),
          hair: ref('hair'),

          // semantic roles — prefer these in component code
          primary: ref('primary'),
          'primary-deep': ref('primary-deep'),
          hover: ref('hover'),
          focus: ref('focus'),
          info: ref('info'),
          'info-text': ref('info-text'),
          success: ref('success'),
          'success-text': ref('success-text'),
          warning: ref('warning'),
          'warning-text': ref('warning-text'),
          danger: ref('danger'),
          'danger-text': ref('danger-text'),

          // categorical slots — charts and data surfaces
          ...series,

          // code surface, dark in both themes
          'code-bg': ref('code-bg'),
          'code-text': ref('code-text'),
          'code-muted': ref('code-muted'),
        },
      },

      fontFamily: {
        'strata-sans': [
          'Atkinson Hyperlegible', 'Noto Sans', 'system-ui', '-apple-system',
          'BlinkMacSystemFont', 'sans-serif',
        ],
        'strata-mono': [
          'Noto Sans Mono', 'Liberation Mono', 'ui-monospace', 'SFMono-Regular',
          'Menlo', 'Consolas', 'monospace',
        ],
      },

      fontSize: {
        'strata-display': ['48px', { lineHeight: '1.15', fontWeight: '600' }],
        'strata-h1': ['36px', { lineHeight: '1.2', fontWeight: '600' }],
        'strata-h2': ['28px', { lineHeight: '1.25', fontWeight: '600' }],
        'strata-h3': ['22px', { lineHeight: '1.3', fontWeight: '600' }],
        'strata-h4': ['18px', { lineHeight: '1.35', fontWeight: '600' }],
        'strata-body-lg': ['18px', { lineHeight: '1.5' }],
        'strata-body': ['16px', { lineHeight: '1.5' }],
        'strata-caption': ['13px', { lineHeight: '1.4' }],
        'strata-micro': ['11px', { lineHeight: '1.3' }],
        'strata-reading-title': ['40px', { lineHeight: '52px', fontWeight: '600' }],
        'strata-reading-h2': ['32px', { lineHeight: '1.3', fontWeight: '600' }],
        'strata-reading-h3': ['28px', { lineHeight: '1.3', fontWeight: '600' }],
        'strata-reading-body': ['16px', { lineHeight: '28px' }],
        'strata-reading-compact': ['14px', { lineHeight: '1.5' }],
        'strata-reading-code': ['14px', { lineHeight: '19px' }],
      },

      letterSpacing: { 'strata-meta': '0.06em' },

      maxWidth: {
        'strata-reading': '100%',
        'strata-reading-measure': '688px',
        'strata-reading-wide': '100%',
      },

      spacing: {
        'strata-0': '0px',
        'strata-1': '4px',
        'strata-2': '8px',
        'strata-3': '12px',
        'strata-4': '16px',
        'strata-5': '24px',
        'strata-6': '32px',
        'strata-7': '48px',
        'strata-8': '64px',
      },

      borderRadius: {
        'strata-sm': '2px',
        'strata-md': '4px',   // default for everything interactive
        'strata-lg': '8px',   // ceiling
        'strata-pill': '9999px', // discouraged
      },

      borderWidth: { 'strata-rule': '1px' },

      // boxShadow: intentionally absent. Stratification replaces it.

      transitionDuration: {
        'strata-micro': '150ms',
        'strata-standard': '250ms',
        'strata-entrance': '400ms',
      },

      transitionTimingFunction: {
        'strata-enter': 'cubic-bezier(0.2, 0, 0, 1)',
        'strata-exit': 'cubic-bezier(0.2, 0, 0, 1)',
      },
    },
  },
};

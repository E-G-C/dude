# Project-supplied mark slot

Clearline ships no logo, wordmark, or symbol. Add a project-supplied asset only
when the surface needs an identifier. A page without a mark is complete.

## Clear-space pairs

Clear space belongs to the outer boundary of the combined lockup: a mark alone,
or a mark with its wordmark. Put navigation, page edges, and unrelated content
outside `.cl-lockup`. Its internal mark-to-wordmark gap is not clear space.

`.cl-lockup` defaults to the default pair. Use the compact or hero modifier so
mark size and clear space always change together.

| Context | Class | Mark size | Clear space |
| --- | --- | --- | --- |
| Compact footer | `.cl-lockup--compact` | 16 px | 16 px |
| Default header | `.cl-lockup` | 24 px | 24 px |
| Hero | `.cl-lockup--hero` | 40 px | 40 px |

The pair tokens are `--cl-mark-size-compact`,
`--cl-mark-clear-space-compact` (and their `default` / `hero` variants).

## Named lockup

When visible wordmark text supplies the project name, the adjacent mark is
decorative:

```html
<div class="cl-lockup">
  <span class="cl-mark"
        style="--cl-mark-bg: var(--cl-color-primary-bg);
               --cl-mark-fg: var(--cl-color-primary-fg);"
        aria-hidden="true">P</span>
  <span class="cl-wordmark">Project name</span>
</div>
```

This is the default 24 px pair. See [the header and footer
example](../examples/header-footer.html).

A supplied image remains decorative beside that visible name:

```html
<div class="cl-lockup cl-lockup--compact">
  <span class="cl-mark" aria-hidden="true">
    <img src="project-mark.svg" alt="" />
  </span>
  <span class="cl-wordmark">Project name</span>
</div>
```

## Standalone mark

When no adjacent visible wordmark provides the name, a standalone mark may use
an image role and label:

```html
<div class="cl-lockup cl-lockup--hero">
  <span class="cl-mark" role="img" aria-label="Project name">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 2h20v20H2z" />
    </svg>
  </span>
</div>
```

An SVG loaded through `<img>` controls its own presentation. It does not
inherit `currentColor` or `--cl-mark-fg` from the surrounding page.

Use a visible `.cl-mark-placeholder` only in a mockup. Remove or replace it
before production. It uses `box-sizing: border-box`, so a declared 24 px mark
is 24 px at its outer edge.

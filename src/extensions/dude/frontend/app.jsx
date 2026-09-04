import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Breadcrumb,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button,
  Caption1,
  Card,
  Combobox,
  Divider,
  Field,
  FluentProvider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Subtitle2,
  Text,
  Title3,
} from '@fluentui/react-components';

import { mergeClasses, useCanvasStyles } from './styles.js';
import {
  darkTheme,
  layout,
  lightTheme,
  useHostAppearance,
} from './theme.js';

const LIFECYCLE = Object.freeze(['Idea', 'Defined', 'In progress', 'Verified']);
const SURFACES = Object.freeze([
  Object.freeze({ label: 'Now', open: true, glyph: 'now' }),
  Object.freeze({ label: 'Work', open: false, glyph: 'work' }),
  Object.freeze({ label: 'Artifacts', open: false, glyph: 'document' }),
  Object.freeze({ label: 'Review', open: false, glyph: 'review' }),
  Object.freeze({ label: 'Memory', open: false, glyph: 'memory' }),
  Object.freeze({ label: 'Team', open: false, glyph: 'team' }),
]);
const CHOOSER_POSITIONING = Object.freeze({
  position: 'below',
  align: 'start',
  offset: Object.freeze({
    crossAxis: 0,
    mainAxis: layout.chooserSummaryPx,
  }),
});

async function readInitialProjection(signal) {
  const response = await fetch('/api/projection', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('projection request failed');
  return response.json();
}

async function readFreshness(signal) {
  const response = await fetch('/api/freshness', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('freshness request failed');
  return response.json();
}

async function refreshProjection(target, signal) {
  const response = await fetch('/api/refresh', {
    body: JSON.stringify(target ? { target } : {}),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });
  if (!response.ok) throw new Error('refresh request failed');
  return response.json();
}

function Glyph({ name, className }) {
  const paths = {
    chevron: <path d="m9 5 3 3-3 3" />,
    check: <path d="m4.5 8 2.25 2.25L11.75 5" />,
    clock: (
      <>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5v3.25l2 1.25" />
      </>
    ),
    document: (
      <>
        <path d="M4.5 2.5h4L11.5 5v8.5h-7z" />
        <path d="M8.5 2.5V5h3M6.5 8h3M6.5 10.5h3" />
      </>
    ),
    memory: (
      <>
        <path d="M3 3.5h4.25A1.75 1.75 0 0 1 9 5.25V13H4.75A1.75 1.75 0 0 0 3 14.75z" />
        <path d="M13 3.5H8.75A1.75 1.75 0 0 0 7 5.25" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2.1" y="4.3" width="11.8" height="7.4" rx="1.3" />
        <path d="M4.5 6.7h.01M6.6 6.7h.01M8.8 6.7h.01M11 6.7h.01M4.5 8.8h.01M11 8.8h.01M6.4 10.1h3.2" />
      </>
    ),
    now: (
      <>
        <circle cx="8" cy="8" r="5.5" />
        <circle cx="8" cy="8" r="1.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M12.5 5.5V2.75M12.5 2.75H9.75" />
        <path d="M12.1 4.1A5.5 5.5 0 1 0 13 9" />
      </>
    ),
    review: (
      <>
        <path d="M3 3h10v10H3z" />
        <path d="m5.5 8 1.5 1.5L10.75 6" />
      </>
    ),
    team: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="11.5" cy="6.5" r="1.5" />
        <path d="M2.75 12.5c.5-2 1.6-3 3.25-3s2.75 1 3.25 3M9.5 10c1.8-.4 3 .45 3.75 2.5" />
      </>
    ),
    warning: (
      <>
        <path d="M8 2.25 14 13H2z" />
        <path d="M8 6v3M8 11.25v.1" />
      </>
    ),
    window: (
      <>
        <rect x="2.25" y="3" width="11.5" height="10" rx="1.3" />
        <path d="M2.25 6h11.5" />
      </>
    ),
    work: (
      <>
        <path d="M3 4.5h10v8H3zM6 4.5V3h4v1.5" />
        <path d="M3 8h10" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      {paths[name] ?? paths.document}
    </svg>
  );
}

function selectedLabel(projection) {
  return projection?.selected?.title || projection?.selected?.slug || null;
}

function canonicalFeatureIdentifier(ideaPath) {
  if (typeof ideaPath !== 'string') return null;
  const match = /^\.dude\/ideas\/((?:00[1-9]|0[1-9][0-9]|[1-9][0-9]{2})-[a-z0-9][a-z0-9-]*)\.md$/.exec(ideaPath);
  return match?.[1] ?? null;
}

function selectableFeatureChoices(choices) {
  return choices
    .map((choice) => ({
      choice,
      identifier: canonicalFeatureIdentifier(choice.ideaPath),
    }))
    .filter(({ choice, identifier }) => (
      identifier !== null && typeof choice.slug === 'string'
    ));
}

function nextAuthorityReason(authority) {
  if (authority === 'tracked') {
    return 'The active work tracker identifies this as the next safe step.';
  }
  if (authority === 'lightweight') {
    return 'The canonical task board identifies this as the next safe step.';
  }
  return 'The current authority identifies this as the next safe step.';
}

function taskSummary(tasks) {
  if (!tasks) return null;
  return `${tasks.done} done · ${tasks.inProgress} in progress · ${tasks.blocked} blocked · ${tasks.open} open`;
}

function formatReadTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatNextStep(description) {
  const withoutInlineCodeDelimiters = description.replace(/(`+)([^`\r\n]+)\1/g, '$2');
  const scaffolded = /^After task,/i.test(description);
  const hasStructuredTail = /[:;](?=\s)|[.!?](?=\s)/.test(description);
  if (!scaffolded && !hasStructuredTail && !/[\r\n]/.test(description) && description.length <= 96) {
    return { headline: withoutInlineCodeDelimiters, condensed: false };
  }

  const source = scaffolded ? description.replace(/^After task,\s*/i, '') : description;
  const boundary = source.search(/[:;](?=\s)|[.!?](?=\s|$)/);
  const includesSentencePunctuation = boundary >= 0 && /[.!?]/.test(source[boundary]);
  const clause = (boundary < 0
    ? source
    : source.slice(0, boundary + (includesSentencePunctuation ? 1 : 0))).trim();
  const globCandidate = clause.replace(/[.!?]$/, '');
  const unsafe = clause.length === 0
    || clause.length > 80
    || clause.includes('`')
    || /[*?[\]{}]/.test(globCandidate)
    || /\bT\d{3}(?:@[a-z0-9._-]+)?\b/i.test(clause)
    || /\b(?:FR|SC)-\d+\b/i.test(clause)
    || /\b(?:sha(?:1|256|512):)?[a-f0-9]{7,64}\b/i.test(clause);
  if (unsafe) return { headline: withoutInlineCodeDelimiters, condensed: false };

  const capitalized = clause[0].toUpperCase() + clause.slice(1);
  return {
    headline: /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`,
    condensed: true,
  };
}

function machineReadableDate(value) {
  return value.endsWith(' UTC') ? value.slice(0, -4) : value;
}

function currentPhase(projection) {
  return projection?.phases?.find((phase) => phase.state === 'current')?.name ?? null;
}

function lifecycleStates(stage) {
  if (stage === 'Idea') return ['current', 'upcoming', 'upcoming', 'upcoming'];
  if (stage === 'Defined') return ['complete', 'complete', 'unknown', 'unknown'];
  if (stage === 'In progress' || stage === 'Blocked') {
    return ['complete', 'complete', 'current', 'upcoming'];
  }
  if (stage === 'Verified') return ['complete', 'complete', 'complete', 'complete'];
  if (stage === 'Completed without a package') return ['complete', 'unknown', 'unknown', 'complete'];
  return ['unknown', 'unknown', 'unknown', 'unknown'];
}

function deriveView(projection, freshness, busy) {
  if (!projection) {
    return {
      mode: busy ? 'loading' : 'unavailable',
      title: busy ? 'Reading repository state' : 'Repository state unavailable',
      stage: null,
    };
  }
  if (projection.status === 'choose') {
    const choices = Array.isArray(projection.choices) ? projection.choices : [];
    return {
      choices,
      mode: choices.length > 0 ? 'choose' : 'empty',
      stage: null,
      title: choices.length > 0 ? 'Choose a feature' : 'No features found',
    };
  }
  if (projection.status !== 'ok') {
    return {
      mode: 'unavailable',
      stage: projection.stage ?? null,
      title: selectedLabel(projection) || 'Repository state unavailable',
    };
  }
  return {
    mode: 'feature',
    stage: projection.stage ?? null,
    title: selectedLabel(projection) || 'Feature title withheld',
  };
}

function clientUnavailable(previous, projection) {
  return {
    checkedAt: new Date().toISOString(),
    diagnostics: [],
    message: 'The Dude canvas server could not be reached. The last complete view is preserved.',
    nextAction: {
      kind: 'refresh',
      label: 'Refresh from repository',
      method: 'POST',
      path: '/api/refresh',
    },
    readAt: previous?.readAt ?? projection?.readAt ?? null,
    state: 'unavailable',
  };
}

function ContextContent({ label, styles }) {
  return (
    <>
      <Glyph className={styles.icon} name="document" />
      <span className={styles.contextText}>
        <span className={styles.contextCaption}>Feature</span>
        <span className={styles.contextName}>{label}</span>
      </span>
    </>
  );
}

function FeatureChooser({
  choices,
  onSelect,
  selected,
  styles,
  busy = false,
}) {
  const [query, setQuery] = useState(null);
  const [open, setOpen] = useState(false);
  const [pendingIdentifier, setPendingIdentifier] = useState(null);
  const [failedIdentifier, setFailedIdentifier] = useState(null);
  const inputRef = useRef(null);
  const listboxRef = useRef(null);
  const selectedOptionRef = useRef(null);
  const pointerOpeningRef = useRef(false);
  const committedSlug = typeof selected?.slug === 'string' ? selected.slug : null;
  const committedIdentifier = canonicalFeatureIdentifier(selected?.ideaPath);
  const displayedValue = query ?? pendingIdentifier ?? committedIdentifier ?? '';
  const normalizedQuery = (query ?? '').trim().toLowerCase();
  const selectableChoices = selectableFeatureChoices(choices);
  const committedChoice = committedSlug && committedIdentifier
    ? selectableChoices.find(({ choice, identifier }) => (
        choice.slug === committedSlug && identifier === committedIdentifier
      ))
    : null;
  const selectedOptions = committedChoice ? [committedChoice.choice.slug] : [];
  const matchingChoices = selectableChoices.filter(
    ({ choice, identifier }) => identifier.toLowerCase().includes(normalizedQuery)
      || choice.slug.toLowerCase().includes(normalizedQuery),
  );
  const selectedSummary = committedChoice ? ` ${committedIdentifier} is selected.` : '';
  const matchSummary = query === null || !normalizedQuery
    ? `${selectableChoices.length} features.${selectedSummary} Scroll or type to narrow them.`
    : `${matchingChoices.length} of ${selectableChoices.length} features match "${query}".${committedChoice ? ` ${committedIdentifier} stays selected.` : ''}`;
  const failureSummary = failedIdentifier
    ? `${failedIdentifier} could not be opened. ${committedIdentifier
      ? `${committedIdentifier} is still the open feature.`
      : 'No feature is open.'}`
    : null;

  const beginBrowse = useCallback(() => {
    if (busy || open) return;
    setQuery(null);
    setOpen(true);
  }, [busy, open]);

  const closeChooser = useCallback(() => {
    setOpen(false);
    setQuery(null);
  }, []);

  const beginPointerOpen = useCallback((event) => {
    if (busy || listboxRef.current?.contains(event.target)) return;
    pointerOpeningRef.current = true;
    setFailedIdentifier(null);
    beginBrowse();
  }, [beginBrowse, busy]);

  const endPointerOpen = useCallback(() => {
    pointerOpeningRef.current = false;
  }, []);

  useEffect(() => {
    if (!open || query !== null) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input && document.activeElement === input) {
        input.setSelectionRange(0, input.value.length);
      }
      selectedOptionRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [committedIdentifier, open, query]);

  return (
    <div className={styles.chooser}>
      <Field
        className={styles.contextField}
        hint={open
          ? {
              'aria-live': 'polite',
              className: styles.chooserSummaryBand,
              children: (
                <span className={styles.chooserSummary} title={failureSummary ?? undefined}>
                  {failureSummary ?? matchSummary}
                </span>
              ),
              role: 'status',
            }
          : undefined}
        label="Feature"
        orientation="horizontal"
      >
        <Combobox
          aria-busy={busy}
          aria-disabled={busy}
          className={styles.chooserControl}
          disableAutoFocus
          freeform
          input={{
            'aria-autocomplete': 'list',
            'aria-invalid': failedIdentifier ? true : undefined,
            autoComplete: 'off',
            onFocus: beginBrowse,
            onKeyDownCapture: (event) => {
              if (busy || event.key !== 'Tab') return;
              setFailedIdentifier(null);
              setOpen(false);
              setQuery(null);
              event.stopPropagation();
            },
            spellCheck: false,
          }}
          inlinePopup
          listbox={matchingChoices.length > 0
            ? {
                'aria-label': 'Features',
                className: styles.chooserListbox,
                ref: listboxRef,
              }
            : null}
          onChange={(event) => {
            if (busy) return;
            setFailedIdentifier(null);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (busy) return;
            const typing = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
            if (query === null && (typing || event.key === 'Backspace' || event.key === 'Delete')) {
              setFailedIdentifier(null);
              setQuery('');
              event.currentTarget.value = '';
              if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
              }
              return;
            }
            if (event.key !== 'Escape') return;
            setFailedIdentifier(null);
            if (query !== null) {
              event.preventDefault();
              event.stopPropagation();
              setQuery(null);
              setOpen(false);
              window.requestAnimationFrame(() => setOpen(true));
            }
          }}
          onOpenChange={(_event, data) => {
            if (busy) return;
            if (data.open || pointerOpeningRef.current) {
              beginBrowse();
            } else {
              closeChooser();
            }
          }}
          onOptionSelect={async (_event, data) => {
            if (busy) return;
            if (typeof data.optionValue !== 'string') return;
            const selectedChoice = selectableChoices.find(
              ({ choice }) => choice.slug === data.optionValue,
            );
            if (!selectedChoice) return;
            setFailedIdentifier(null);
            setQuery(null);
            setOpen(false);
            setPendingIdentifier(selectedChoice.identifier);
            const accepted = await onSelect(
              selectedChoice.choice.slug,
              selectedChoice.identifier,
            );
            setPendingIdentifier(null);
            if (accepted) return;
            setFailedIdentifier(selectedChoice.identifier);
            setQuery(null);
            setOpen(true);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
          open={open}
          placeholder={`Choose from ${selectableChoices.length} features`}
          positioning={CHOOSER_POSITIONING}
          ref={inputRef}
          root={{
            'aria-disabled': busy,
            onClick: endPointerOpen,
            onClickCapture: beginPointerOpen,
            onMouseDown: endPointerOpen,
            onMouseDownCapture: beginPointerOpen,
          }}
          selectedOptions={selectedOptions}
          value={displayedValue}
        >
          {matchingChoices.length > 0
            ? matchingChoices.map(({ choice, identifier }) => (
                <Option
                  className={styles.chooserOption}
                  key={choice.ideaPath}
                  ref={choice === committedChoice?.choice ? selectedOptionRef : undefined}
                  text={identifier}
                  value={choice.slug}
                >
                  <span className={styles.chooserOptionText}>{identifier}</span>
                </Option>
              ))
            : null}
        </Combobox>
        {open && matchingChoices.length === 0 ? (
          <Caption1 block className={styles.chooserEmpty}>
            {`No features match "${query}".`}
          </Caption1>
        ) : null}
      </Field>
    </div>
  );
}

function CommandBar({
  busy,
  choices,
  contextLabel,
  onRefresh,
  onSelect,
  selected,
  styles,
}) {
  const chooser = choices.length > 0;
  return (
    <header className={styles.commandBar}>
      <p className={styles.brand}>
        <span aria-hidden="true" className={styles.brandMark}>
          <Glyph className={styles.smallIcon} name="window" />
        </span>
        Dude <span className={styles.brandSub}>Now</span>
      </p>
      <span aria-hidden="true" className={styles.commandRule} />
      <div className={styles.context}>
        {chooser ? (
          <FeatureChooser
            busy={busy}
            choices={choices}
            onSelect={onSelect}
            selected={selected}
            styles={styles}
          />
        ) : (
          <div className={styles.contextIdentity}>
            <ContextContent label={contextLabel} styles={styles} />
          </div>
        )}
      </div>
      <div className={styles.toolbar}>
        <Button
          aria-busy={busy}
          aria-disabled={busy}
          appearance="secondary"
          className={styles.refreshButton}
          icon={<Glyph className={styles.icon} name="refresh" />}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </div>
    </header>
  );
}

function ActivityRail({ announce, styles }) {
  return (
    <nav aria-label="Surfaces" className={styles.rail}>
      <ul className={styles.railList}>
        {SURFACES.map((surface) => (
          <li
            className={styles.railItem}
            key={surface.label}
            title={surface.open ? undefined : `${surface.label} — arrives in a later cycle`}
          >
            <Button
              aria-current={surface.open ? 'page' : undefined}
              aria-label={surface.open
                ? 'Now, the open surface'
                : `${surface.label} — arrives in a later cycle`}
              className={mergeClasses(
                styles.railButton,
                surface.open ? styles.railCurrent : styles.railButtonLater,
              )}
              disabled={!surface.open}
              icon={<Glyph className={styles.icon} name={surface.glyph} />}
              onClick={surface.open
                ? () => announce('Now is already the open surface.')
                : undefined}
              title={surface.open ? 'Now — the open surface' : undefined}
            />
            {!surface.open ? (
              <span aria-hidden="true" className={styles.railLater}>
                <Glyph className={styles.smallIcon} name="clock" />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BreadcrumbStrip({ view, styles }) {
  const parts = ['Dude', 'Features', view.title, 'Now'];
  return (
    <div className={styles.workStrip}>
      <Breadcrumb aria-label="Breadcrumb" className={styles.breadcrumb}>
        {parts.map((part, index) => (
          <React.Fragment key={`${part}-${index}`}>
            <BreadcrumbItem aria-current={index === parts.length - 1 ? 'page' : undefined}>
              <Text className={styles.breadcrumbText} size={200} weight={index === parts.length - 1 ? 'semibold' : 'regular'}>
                {part}
              </Text>
            </BreadcrumbItem>
            {index < parts.length - 1 ? <BreadcrumbDivider /> : null}
          </React.Fragment>
        ))}
      </Breadcrumb>
    </div>
  );
}

function IdentityStrip({ headingRef, projection, view, styles }) {
  const selected = projection?.selected;
  const identifier = canonicalFeatureIdentifier(selected?.ideaPath);
  const note = view.mode === 'choose'
    ? 'No feature was supplied and more than one is active, so nothing is selected until you choose one.'
    : view.mode === 'empty'
      ? 'The repository has no available feature to select.'
      : view.mode === 'unavailable'
        ? 'Unsupported values are withheld until one complete read succeeds.'
        : null;
  const badge = view.stage || (view.mode === 'choose' ? 'Nothing selected' : view.mode === 'empty' ? 'Nothing to show' : 'Stage withheld');
  const badgeAppearance = view.stage === 'Blocked' ? 'filled' : 'outline';
  const badgeColor = view.stage === 'Blocked' ? 'danger' : 'informative';

  return (
    <div className={styles.identity}>
      <Subtitle2 as="h2" className={styles.identityTitle} id="feature-heading" ref={headingRef} tabIndex={-1}>
        {view.title}
      </Subtitle2>
      <Badge appearance={badgeAppearance} color={badgeColor}>
        {badge}
      </Badge>
      {selected ? (
        <code className={styles.identityKey}>{identifier ?? 'Identifier unavailable'}</code>
      ) : null}
      {note ? <Body1 as="p" className={styles.identityNote}>{note}</Body1> : null}
    </div>
  );
}

function SectionHead({ children, aside, id, styles }) {
  return (
    <div className={styles.sectionHead}>
      <h3 className={styles.sectionTitle} id={id}>{children}</h3>
      {aside ? <Caption1 className={styles.caption}>{aside}</Caption1> : null}
    </div>
  );
}

function UnavailableRegion({ children, styles }) {
  return (
    <div className={styles.unavailableRegion}>
      <Glyph className={styles.icon} name="warning" />
      <Body1>{children}</Body1>
    </div>
  );
}

function FocalRegion({ projection, view, choices, styles }) {
  if (view.mode === 'choose') {
    const selectableChoices = selectableFeatureChoices(choices);
    return (
      <section aria-labelledby="choose-heading" className={styles.region}>
        <SectionHead id="choose-heading" styles={styles}>Select a feature</SectionHead>
        <Body1 as="p" className={styles.instructionLead}>
          The feature list is the Feature box in the command bar at the top of this window.
          It is the only place a feature is chosen.
        </Body1>
        <ol className={styles.instructionSteps}>
          <li>Click the Feature box, or Tab to it: the list opens on the first click, already showing options.</li>
          <li>Scroll the list to reach any feature, or type a number or name to filter it—for example, 052 or dude.</li>
          <li>Arrow keys move the highlight; Home and End jump to the ends of the list.</li>
          <li>Enter opens the highlighted feature. Escape clears the search, then closes the list.</li>
        </ol>
        <div className={styles.instructionFacts}>
          <div className={styles.fact}>
            <span className={styles.factLabel}>In the list</span>
            <span className={styles.factValue}>{selectableChoices.length} features from the complete projected inventory</span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Order</span>
            <span className={styles.factValue}>The order the idea files are read. Nothing is promoted by recency, number, or last use.</span>
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>Canonical identifier</span>
            <span className={styles.factValue}>Number and name exactly as filed; the slug remains the internal target.</span>
          </div>
        </div>
      </section>
    );
  }

  const next = projection?.next?.description ?? null;
  const why = next
    ? nextAuthorityReason(projection?.authority)
    : projection?.nextReason ?? null;
  const phase = currentPhase(projection);
  const unavailable = !next;
  const formattedNext = next ? formatNextStep(next) : null;
  const headline = formattedNext?.headline || (view.mode === 'empty'
    ? 'No Dude features were found in this repository.'
    : view.mode === 'loading'
      ? 'Reading the current projection…'
      : 'Next step unavailable');
  const detail = view.mode === 'empty'
    ? 'There is no selected project state from which to show a stage, step, or blocker.'
    : view.mode === 'loading'
      ? 'The view will appear only after one complete read.'
      : projection?.blockers?.length
        ? `${projection.blockers.length} authoritative blocker${projection.blockers.length === 1 ? ' is' : 's are'} recorded.`
        : null;

  return (
    <section aria-labelledby="next-heading" className={styles.region}>
      <Card
        appearance="outline"
        className={mergeClasses(styles.focalCard, unavailable && styles.focalUnavailable)}
      >
        <h3 className={mergeClasses(styles.eyebrow, unavailable && styles.eyebrowUnavailable)} id="next-heading">
          <Glyph className={styles.icon} name={unavailable ? 'warning' : 'chevron'} />
          Next step
        </h3>
        <Title3 as="p" className={styles.focalHeadline}>{headline}</Title3>
        {formattedNext?.condensed ? (
          <Caption1 block as="p" className={styles.focalCondensedCue}>
            Full next-step text is available in Evidence.
          </Caption1>
        ) : null}
        {detail ? <Body1 as="p" className={styles.focalDetail}>{detail}</Body1> : null}
        {phase || why ? <Divider /> : null}
        {phase || why ? (
          <div className={styles.focalFacts}>
            {phase ? (
              <div className={styles.fact}>
                <span className={styles.factLabel}>Current phase</span>
                <span className={styles.factValue}>{phase}</span>
              </div>
            ) : null}
            {why ? (
              <div className={styles.fact}>
                <span className={styles.factLabel}>Why</span>
                <span className={styles.factValue}>{why}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function LifecycleRegion({ projection, view, styles }) {
  const stage = projection?.stage ?? null;
  if (!stage) {
    if (view.mode !== 'choose') return null;
    return (
      <section aria-labelledby="lifecycle-heading" className={styles.region}>
        <SectionHead id="lifecycle-heading" styles={styles}>Lifecycle</SectionHead>
        <UnavailableRegion styles={styles}>
          No feature is selected, so there is no lifecycle to show. Opening a feature shows where it stands.
        </UnavailableRegion>
      </section>
    );
  }
  const states = lifecycleStates(stage);
  const tasks = projection.tasks;
  const segments = tasks ? [
    ['done', tasks.done, styles.segmentDone],
    ['in progress', tasks.inProgress, styles.segmentDoing],
    ['blocked', tasks.blocked, styles.segmentBlocked],
    ['open', tasks.open, styles.segmentOpen],
  ] : [];

  return (
    <section aria-labelledby="lifecycle-heading" className={styles.region}>
      <SectionHead id="lifecycle-heading" styles={styles}>Lifecycle</SectionHead>
      <ol className={styles.lifecycleList}>
        {LIFECYCLE.map((label, index) => {
          const state = states[index];
          const markerClass = state === 'complete'
            ? styles.stepComplete
            : state === 'current'
              ? styles.stepCurrent
              : state === 'unknown'
                ? styles.stepUnknown
                : null;
          const stateLabel = state === 'complete'
            ? 'Complete'
            : state === 'current'
              ? 'Current'
              : state === 'unknown'
                ? 'Unavailable'
                : 'Not started';
          return (
            <li
              aria-current={state === 'current' ? 'step' : undefined}
              className={styles.lifecycleItem}
              key={label}
            >
              <span aria-hidden="true" className={mergeClasses(styles.stepMarker, markerClass)}>
                {state === 'complete' ? <Glyph className={styles.smallIcon} name="check" /> : index + 1}
              </span>
              <span className={mergeClasses(styles.stepText, state === 'current' && styles.stepTextCurrent)}>
                {label}<span className={styles.stepState}>{stateLabel}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {tasks ? (
        <div className={styles.progress}>
          <div aria-hidden="true" className={styles.progressTrack}>
            {segments.filter(([, count]) => count > 0).map(([label, count, className]) => (
              <span
                className={mergeClasses(styles.progressSegment, className)}
                key={label}
                style={{ flexGrow: count }}
              />
            ))}
          </div>
          <ul className={styles.legend}>
            {segments.map(([label, count]) => (
              <li className={styles.legendItem} key={label}>
                <span className={styles.legendCount}>{count}</span> {label}
              </li>
            ))}
          </ul>
          <Caption1 block className={styles.caption}>{tasks.total} tasks make up this feature.</Caption1>
        </div>
      ) : null}
    </section>
  );
}

function phaseCount(phase) {
  const parts = [`${phase.done} of ${phase.total} done`];
  if (phase.inProgress) parts.push(`${phase.inProgress} in progress`);
  if (phase.blocked) parts.push(`${phase.blocked} blocked`);
  if (phase.open) parts.push(`${phase.open} open`);
  return parts.join(' · ');
}

function PhasesRegion({ projection, view, styles }) {
  const phases = Array.isArray(projection?.phases) ? projection.phases : [];
  return (
    <section aria-labelledby="phases-heading" className={styles.region}>
      <SectionHead id="phases-heading" styles={styles}>Phases</SectionHead>
      {phases.length > 0 ? (
        <>
          <ol className={styles.phaseList}>
            {phases.map((phase, index) => (
              <li
                aria-current={phase.state === 'current' ? 'step' : undefined}
                className={mergeClasses(styles.phaseRow, phase.state === 'current' && styles.phaseCurrent)}
                key={`${phase.name}-${index}`}
              >
                <span className={mergeClasses(
                  styles.phaseMark,
                  phase.state === 'done' && styles.stepComplete,
                  phase.state === 'current' && styles.stepCurrent,
                )}>
                  <Glyph className={styles.smallIcon} name={phase.state === 'done' ? 'check' : 'now'} />
                </span>
                <Body1 as="p" className={styles.phaseName}>
                  {phase.name}
                  {phase.state === 'current' ? <Badge color="brand">Current phase</Badge> : null}
                </Body1>
                <span aria-hidden="true" className={styles.phaseDistribution}>
                  {[
                    ['done', phase.done, styles.segmentDone],
                    ['doing', phase.inProgress, styles.segmentDoing],
                    ['blocked', phase.blocked, styles.segmentBlocked],
                    ['open', phase.open, styles.segmentOpen],
                  ].filter(([, count]) => count > 0).map(([label, count, className]) => (
                    <span
                      className={mergeClasses(styles.progressSegment, className)}
                      key={label}
                      style={{ flexGrow: count }}
                    />
                  ))}
                </span>
                <p className={styles.phaseCount}>{phaseCount(phase)}</p>
              </li>
            ))}
          </ol>
          <Caption1 block className={styles.caption}>
            This is a progress summary; individual task keys remain in Source details.
          </Caption1>
        </>
      ) : (
        <UnavailableRegion styles={styles}>
          {view.mode === 'choose'
            ? 'No feature is selected, so there is no phase breakdown to show.'
            : 'No source-backed phase breakdown is available from this authority.'}
        </UnavailableRegion>
      )}
    </section>
  );
}

function ActivityRegion({ projection, view, styles }) {
  const recent = Array.isArray(projection?.activity?.recent) ? projection.activity.recent : [];
  const latest = projection?.latestEvent;
  const events = latest
    ? [latest, ...recent.filter((event) => event.date !== latest.date || event.text !== latest.text)]
    : recent;
  return (
    <section aria-labelledby="activity-heading" className={styles.region}>
      <SectionHead aside="Most recent first" id="activity-heading" styles={styles}>Activity</SectionHead>
      {events.length > 0 ? (
        <>
          <ol className={styles.trail}>
            {events.map((event, index) => (
              <li className={styles.trailItem} key={`${event.date}-${event.text}-${index}`}>
                <span aria-hidden="true" className={mergeClasses(styles.trailNode, index === 0 && styles.trailNodeCurrent)} />
                <p className={styles.trailDate}>
                  <time dateTime={machineReadableDate(event.date)}>{event.date}</time>
                </p>
                <Body1 as="p" className={styles.trailText}>{event.text}</Body1>
              </li>
            ))}
          </ol>
          <Caption1 block className={styles.caption}>
            Showing source-backed lifecycle events. Exact source details remain in the evidence dock.
          </Caption1>
        </>
      ) : (
        <UnavailableRegion styles={styles}>
          {view.mode === 'choose'
            ? 'No feature is selected, so there is no recorded history to show.'
            : 'No source-backed lifecycle activity is available.'}
        </UnavailableRegion>
      )}
    </section>
  );
}

function attentionItems(projection, freshness, view) {
  const items = [];
  const state = freshness?.state;
  if (state && state !== 'current') {
    const titles = {
      changed: 'Repository changes detected',
      conflict: 'Refresh conflict',
      stale: 'Showing the last complete read',
      unavailable: 'Current read unavailable',
    };
    items.push({
      intent: state === 'unavailable' || state === 'conflict' ? 'error' : 'warning',
      message: `${freshness.message} Use Refresh from repository as the safe next action.`,
      title: titles[state] || 'Freshness needs attention',
    });
  }
  for (const attention of projection?.attention ?? []) {
    items.push({
      intent: attention.severity === 'error' ? 'error' : 'warning',
      message: attention.message,
      title: attention.severity === 'error' ? 'Repository state unavailable' : 'Repository attention',
    });
  }
  for (const blocker of projection?.blockers ?? []) {
    items.push({
      intent: 'error',
      message: blocker.reason,
      title: 'Authoritative blocker',
    });
  }
  if (projection?.status === 'unavailable' && items.length === 0) {
    items.push({
      intent: 'error',
      message: `${projection.nextReason || 'A complete projection is not available.'} Use Refresh from repository as the safe next action.`,
      title: 'Projection unavailable',
    });
  }
  if (view.mode === 'empty' && items.length === 0) {
    items.push({
      intent: 'info',
      message: 'No feature is available. Capture an idea in the Copilot session, then use Refresh from repository.',
      title: 'Nothing to show yet',
    });
  }
  if (Number.isInteger(projection?.unansweredQuestions) && projection.unansweredQuestions > 0) {
    items.push({
      intent: 'info',
      message: `${projection.unansweredQuestions} unanswered question${projection.unansweredQuestions === 1 ? ' is' : 's are'} recorded.`,
      title: 'Open questions',
    });
  }
  return items;
}

function AttentionSection({ projection, freshness, view, styles }) {
  const items = attentionItems(projection, freshness, view);
  const questions = projection?.unansweredQuestions;
  const noBlockers = projection?.complete && projection?.status === 'ok'
    && projection.blockers?.length === 0;
  if (items.length === 0 && !noBlockers && !Number.isInteger(questions)) return null;
  return (
    <section aria-labelledby="attention-heading" className={styles.dockSection}>
      <h3 className={styles.sectionTitle} id="attention-heading">Attention</h3>
      {items.length > 0 ? (
        <div className={styles.messageStack}>
          {items.map((item, index) => (
            <MessageBar
              icon={<Glyph className={styles.icon} name={item.intent === 'error' ? 'warning' : 'clock'} />}
              intent={item.intent}
              key={`${item.title}-${index}`}
              layout="multiline"
            >
              <MessageBarBody>
                <MessageBarTitle>{item.title}</MessageBarTitle>
                {item.message}
              </MessageBarBody>
            </MessageBar>
          ))}
        </div>
      ) : null}
      {noBlockers ? (
        <Body1 as="p" className={styles.statusSummary}>
          <Glyph className={styles.icon} name="check" /> No blockers are recorded.
        </Body1>
      ) : null}
      {Number.isInteger(questions) ? (
        <Caption1 block className={styles.caption}>
          {questions} unanswered question{questions === 1 ? '' : 's'}
        </Caption1>
      ) : null}
    </section>
  );
}

function FreshnessSection({ busy, freshness, projection, styles }) {
  const state = freshness?.state ?? 'unavailable';
  const label = busy
    ? 'Reading repository sources'
    : state === 'current'
      ? 'Current complete read'
      : state === 'changed'
        ? 'Repository changed'
        : state === 'stale'
          ? 'Preserved complete read'
          : state === 'conflict'
            ? 'Read conflict'
            : 'Read unavailable';
  const message = busy
    ? 'Sources are being read. The current complete view remains in place.'
    : freshness?.message;
  const readAt = formatReadTime(freshness?.readAt ?? projection?.readAt);
  return (
    <section aria-labelledby="freshness-heading" className={styles.dockSection}>
      <h3 className={styles.sectionTitle} id="freshness-heading">Freshness</h3>
      <Body1 as="p" className={styles.statusSummary}>
        <Glyph className={styles.icon} name={busy || state === 'current' ? 'clock' : 'warning'} />
        {label}
      </Body1>
      {message ? <Caption1 block className={styles.caption}>{message}</Caption1> : null}
      {readAt ? <Caption1 block className={styles.caption}>Last complete read: {readAt}</Caption1> : null}
      <Caption1 block className={styles.caption}>Refresh is in the command bar.</Caption1>
    </section>
  );
}

function PropertiesSection({ projection, view, freshness, styles }) {
  const rows = [];
  if (view.mode === 'choose' || view.mode === 'empty') {
    rows.push(['Features', `${selectableFeatureChoices(view.choices ?? []).length} available`]);
    rows.push(['Selected', 'None']);
  } else {
    rows.push(['Stage', projection?.stage ?? 'Withheld']);
    rows.push(['Phase', currentPhase(projection) ?? 'Not available']);
    rows.push([
      'Questions',
      Number.isInteger(projection?.unansweredQuestions)
        ? `${projection.unansweredQuestions} unanswered`
        : 'Withheld',
    ]);
    rows.push([
      'Blockers',
      projection?.complete ? `${projection.blockers?.length ?? 0} recorded` : 'Withheld',
    ]);
    rows.push(['Tasks', taskSummary(projection?.tasks) ?? 'Not available from this authority']);
  }
  const readAt = formatReadTime(freshness?.readAt ?? projection?.readAt);
  if (readAt) rows.push(['Last read', readAt]);

  return (
    <section aria-labelledby="properties-heading" className={styles.dockSection}>
      <h3 className={styles.sectionTitle} id="properties-heading">Properties</h3>
      <dl className={styles.properties}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt>{label}</dt><dd>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

function SurfacesSection({ styles }) {
  return (
    <section aria-labelledby="surfaces-heading" className={styles.dockSection}>
      <h3 className={styles.sectionTitle} id="surfaces-heading">Surfaces</h3>
      <ul className={styles.surfaces}>
        {SURFACES.map((surface) => (
          <li className={mergeClasses(styles.surface, surface.open && styles.surfaceOpen)} key={surface.label}>
            <Glyph className={styles.icon} name={surface.open ? 'now' : 'clock'} />
            {surface.label}
            <span className={styles.surfaceWhen}>{surface.open ? 'Open' : 'Later'}</span>
          </li>
        ))}
      </ul>
      <Caption1 block className={styles.caption}>
        Now is the only surface in this cycle. The others arrive later and cannot be opened yet.
      </Caption1>
    </section>
  );
}

function sourceDescription(source) {
  const parts = [];
  if (source.path) parts.push(source.path);
  if (source.paths) parts.push(source.paths.join(', '));
  if (source.command) parts.push(source.command);
  if (source.role) parts.push(`role: ${source.role}`);
  if (source.contentIdentity) parts.push(source.contentIdentity);
  if (source.details) parts.push(JSON.stringify(source.details));
  return parts.join(' · ');
}

function sourceRows(projection, freshness) {
  const rows = [];
  if (projection?.selected) {
    rows.push(['Selected slug', projection.selected.slug]);
    rows.push(['Idea path', projection.selected.ideaPath]);
    if (projection.selected.specPath) rows.push(['Specification path', projection.selected.specPath]);
    rows.push(['Selection', projection.selected.explicit ? 'Exact supplied target' : 'Single unambiguous feature']);
  }
  if (projection?.authority) rows.push(['Authority', projection.authority]);
  if (projection?.next?.source) rows.push(['Next source', JSON.stringify(projection.next.source)]);
  for (const blocker of projection?.blockers ?? []) {
    rows.push([
      blocker.classification ? `Blocker — ${blocker.classification}` : 'Blocker source',
      JSON.stringify(blocker.source),
    ]);
  }
  for (const diagnostic of projection?.diagnostics ?? []) {
    rows.push([`Diagnostic — ${diagnostic.code}`, `${diagnostic.path}: ${diagnostic.message}`]);
  }
  for (const diagnostic of freshness?.diagnostics ?? []) {
    rows.push([`Freshness diagnostic — ${diagnostic.code}`, diagnostic.message ?? JSON.stringify(diagnostic)]);
  }
  for (const source of projection?.sources ?? []) {
    rows.push([`Source — ${source.label}`, sourceDescription(source)]);
  }
  return rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
}

function EvidenceSection({ projection, freshness, styles }) {
  const rows = sourceRows(projection, freshness);
  return (
    <section aria-labelledby="evidence-heading" className={styles.dockSection}>
      <h3 className={styles.sectionTitle} id="evidence-heading">Evidence</h3>
      <Accordion collapsible>
        <AccordionItem value="source-details">
          <AccordionHeader>Source details</AccordionHeader>
          <AccordionPanel className={styles.accordionPanel}>
            {rows.length > 0 ? (
              <dl className={styles.sourceList}>
                {rows.map(([label, value], index) => (
                  <React.Fragment key={`${label}-${index}`}>
                    <dt>{label}</dt>
                    <dd><code className={styles.sourceCode}>{value}</code></dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : (
              <Caption1 block className={styles.caption}>No exact source detail is available.</Caption1>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function DetailsDock({ busy, freshness, projection, view, styles }) {
  return (
    <aside aria-label="Details" className={styles.dock}>
      <div className={styles.dockBody}>
        <h2 className={styles.visuallyHidden}>Details</h2>
        <AttentionSection freshness={freshness} projection={projection} styles={styles} view={view} />
        <FreshnessSection busy={busy} freshness={freshness} projection={projection} styles={styles} />
        <PropertiesSection freshness={freshness} projection={projection} styles={styles} view={view} />
        <SurfacesSection styles={styles} />
        <EvidenceSection freshness={freshness} projection={projection} styles={styles} />
      </div>
    </aside>
  );
}

function StatusBar({ busy, freshness, projection, view, styles }) {
  const summary = taskSummary(projection?.tasks) || 'Task detail unavailable';
  const freshnessLabel = busy
    ? 'Reading sources · current complete view preserved'
    : freshness?.state === 'current'
      ? 'Current complete read'
      : freshness?.state === 'changed'
        ? 'Repository changed'
        : freshness?.state === 'stale'
          ? 'Complete read preserved'
          : freshness?.state === 'conflict'
            ? 'Read conflict'
            : 'Read unavailable';
  return (
    <footer aria-label="Status" className={styles.statusBar}>
      <span className={styles.statusSegment}>
        <Glyph className={styles.smallIcon} name="now" />
        <span className={styles.statusStrong}>{view.stage || 'Stage withheld'}</span>
      </span>
      <span className={styles.statusSegment}>
        <Glyph className={styles.smallIcon} name="work" />
        {summary}
      </span>
      <span className={mergeClasses(styles.statusSegment, styles.statusKeyboard, styles.statusPush)}>
        <Glyph className={styles.smallIcon} name="keyboard" />
        <span><kbd>Tab</kbd> moves · <kbd>Enter</kbd> activates</span>
      </span>
      <span className={styles.statusSegment}>
        <Glyph className={styles.smallIcon} name={busy || freshness?.state === 'current' ? 'clock' : 'warning'} />
        {freshnessLabel}
      </span>
      <span className={styles.statusSegment}>
        <Glyph className={styles.smallIcon} name={projection?.complete ? 'check' : 'warning'} />
        {projection?.complete ? 'Complete projection' : 'Projection unavailable'}
      </span>
    </footer>
  );
}

function App() {
  const styles = useCanvasStyles();
  const appearance = useHostAppearance();
  const [projection, setProjection] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const requestEpochRef = useRef(0);
  const freshnessControllerRef = useRef(null);
  const headingRef = useRef(null);
  const pendingFeatureFocusRef = useRef(false);
  const liveRegionRef = useRef(null);

  const announce = useCallback((message) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = message;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    readInitialProjection(controller.signal).then((payload) => {
      setProjection(payload.projection);
      setFreshness(payload.freshness);
      announce('Repository state read.');
    }).catch((error) => {
      if (error.name !== 'AbortError') {
        setFreshness((previous) => clientUnavailable(previous, null));
        announce('Repository state is unavailable. Use Refresh from repository.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    });
    return () => controller.abort();
  }, [announce]);

  const checkFreshness = useCallback(() => {
    freshnessControllerRef.current?.abort();
    const controller = new AbortController();
    freshnessControllerRef.current = controller;
    const epoch = requestEpochRef.current;
    readFreshness(controller.signal).then((payload) => {
      if (requestEpochRef.current === epoch) setFreshness(payload.freshness);
    }).catch((error) => {
      if (error.name !== 'AbortError' && requestEpochRef.current === epoch) {
        setFreshness((previous) => clientUnavailable(previous, projection));
      }
    });
  }, [projection]);

  useEffect(() => {
    const onFocus = () => checkFreshness();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkFreshness();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      freshnessControllerRef.current?.abort();
    };
  }, [checkFreshness]);

  const runRefresh = useCallback(async (target = null, focusFeature = false, identifier = null) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    freshnessControllerRef.current?.abort();
    requestEpochRef.current += 1;
    const epoch = requestEpochRef.current;
    const controller = new AbortController();
    announce(identifier ? `Reading ${identifier}.` : 'Reading repository sources.');
    try {
      const payload = await refreshProjection(target, controller.signal);
      if (requestEpochRef.current !== epoch) return;
      if (payload.replaced === true) {
        if (focusFeature) pendingFeatureFocusRef.current = true;
        setProjection(payload.projection);
        setFreshness(payload.freshness);
        announce(identifier ? `Opened ${identifier}.` : 'One complete projection replaced the previous view.');
        return true;
      } else {
        setFreshness(payload.freshness);
        const committedIdentifier = canonicalFeatureIdentifier(projection?.selected?.ideaPath);
        announce(identifier
          ? `${identifier} could not be opened. ${committedIdentifier
            ? `${committedIdentifier} is still the open feature.`
            : 'No feature is open.'}`
          : 'The complete projection was preserved. Review freshness details, then refresh.');
        return false;
      }
    } catch (error) {
      if (error.name !== 'AbortError' && requestEpochRef.current === epoch) {
        setFreshness((previous) => clientUnavailable(previous, projection));
        const committedIdentifier = canonicalFeatureIdentifier(projection?.selected?.ideaPath);
        announce(identifier
          ? `${identifier} could not be opened. ${committedIdentifier
            ? `${committedIdentifier} is still the open feature.`
            : 'No feature is open.'}`
          : 'The Dude canvas server is unavailable. The complete projection was preserved.');
      }
      return false;
    } finally {
      if (requestEpochRef.current === epoch) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [announce, projection]);

  useEffect(() => {
    if (!pendingFeatureFocusRef.current || !projection?.selected) return;
    pendingFeatureFocusRef.current = false;
    headingRef.current?.focus();
  }, [projection]);

  const view = useMemo(
    () => deriveView(projection, freshness, busy),
    [projection, freshness, busy],
  );
  const choices = projection?.complete === true && Array.isArray(projection.choices)
    ? projection.choices
    : [];
  const contextLabel = selectedLabel(projection)
    || (view.mode === 'choose' ? 'No feature selected' : 'No feature available');

  return (
    <FluentProvider className={styles.app} theme={appearance === 'dark' ? darkTheme : lightTheme}>
      <div className={styles.shell}>
        <h1 className={styles.visuallyHidden}>Dude — Now</h1>
        <p
          aria-live="polite"
          className={styles.visuallyHidden}
          ref={liveRegionRef}
          role="status"
        />
        <CommandBar
          busy={busy}
          choices={choices}
          contextLabel={contextLabel}
          onRefresh={() => runRefresh()}
          onSelect={(slug, identifier) => runRefresh(slug, true, identifier)}
          selected={projection?.selected}
          styles={styles}
        />
        <div className={styles.shellBody}>
          <ActivityRail announce={announce} styles={styles} />
          <main aria-label="Now" className={styles.work}>
            <div className={styles.workBody}>
              <BreadcrumbStrip styles={styles} view={view} />
              <IdentityStrip headingRef={headingRef} projection={projection} styles={styles} view={view} />
              <FocalRegion
                choices={choices}
                projection={projection}
                styles={styles}
                view={view}
              />
              <LifecycleRegion projection={projection} styles={styles} view={view} />
              <PhasesRegion projection={projection} styles={styles} view={view} />
              <ActivityRegion projection={projection} styles={styles} view={view} />
            </div>
          </main>
          <DetailsDock busy={busy} freshness={freshness} projection={projection} styles={styles} view={view} />
        </div>
        <StatusBar busy={busy} freshness={freshness} projection={projection} styles={styles} view={view} />
      </div>
    </FluentProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);

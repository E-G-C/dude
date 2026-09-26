import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader,
  DataGridHeaderCell, DataGridRow, Dropdown, Field, Option, Tab, TabList, Text,
} from '@fluentui/react-components';
import { ChevronLeftRegular, ChevronRightRegular, DismissRegular, bundleIcon, Info20Filled, Info20Regular,
  PuzzlePiece20Filled, PuzzlePiece20Regular } from '@fluentui/react-icons';
import { AboutPanel } from './about.jsx';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { packActionReason, packPermission, packRequestStatus } from './use-canvas-data.js';

const PAGE_SIZE = 5;
const INITIAL_VIEW = { context: 'installed', tag: '', page: 1, selected: null };
const SECTIONS = [['packs', 'Packs', bundleIcon(PuzzlePiece20Filled, PuzzlePiece20Regular)],
  ['about', 'About', bundleIcon(Info20Filled, Info20Regular)]];
const CONTEXTS = [['installed', 'Installed'], ['available', 'Available']];
const OPERATIONS = { install: 'Install', remove: 'Remove', refresh: 'Refresh pack' };
const PHASES = {
  preparing: ['Preparing request', 'Checking the exact pack and joined session. This does not grant permission.'],
  prepared: ['Request prepared', 'Nothing has been sent. This receipt will not be submitted automatically on reload or return.'],
  submitting: ['Requesting owner action', 'Submitting this receipt once. Delivery and application are not yet confirmed.'],
  admitted: ['Admitted; delivery unconfirmed', 'The provider admitted this request. Delivery is not confirmed; nothing will be resent.'],
  delivered: ['Delivered to Dude', 'Waiting for the owner to preview the impact and request permission. No application is confirmed.'],
  waiting_permission: ['Permission requested', 'Inspect the actual impact and respond to this exact request in Needs you.'],
  waiting_owner: ['Waiting for owner result', 'A permission response is not an applied result. The owner must check, apply, and verify the operation.'],
  reading_result: ['Reading current pack facts', 'The owner reported success. Waiting for the current installed authority before displaying the result.'],
  applied: ['Applied', 'The provider validated the exact owner result and a fresh installed-state read. Current pack facts agree.'],
  declined: ['Declined', 'The owner recorded a decline. This request will not be repeated.'],
  failed: ['Failed', 'The owner did not establish a successful result. This request will not be repeated.'],
  unavailable: ['Unavailable', 'Current request authority is unavailable. Nothing will be retried automatically.'],
  stale: ['Stale request or result', 'The reviewed authority changed. A changed impact requires a fresh preview and confirmation.'],
  uncertain: ['Uncertain', 'Delivery or the resulting state is uncertain. Wait for owner reconciliation; do not repeat this request.'],
};
const MUTATIONS = {
  none: 'The owner reports no pack change.',
  restored: 'The owner verified restoration after a caught failure. This is not a crash-recovery guarantee.',
  uncertain: 'The owner could not establish the resulting state or restoration.',
  applied: 'The engine changed files; the owner did not establish a successful verified outcome.',
};
const isCurrent = coverage => ['current', 'empty'].includes(coverage?.state);
const tagsText = pack => pack.use_cases === null ? 'Use cases unavailable'
  : pack.use_cases.length ? pack.use_cases.join(', ') : 'No use cases declared';
const COLUMNS = [
  createTableColumn({ columnId: 'name', renderHeaderCell: () => 'Pack',
    renderCell: pack => <Text weight="semibold">{pack.name}</Text> }),
  createTableColumn({ columnId: 'tags', renderHeaderCell: () => 'Use cases',
    renderCell: pack => <Text>{tagsText(pack)}</Text> }),
];

function RecordedSource({ source }) {
  const s = useCanvasStyles();
  if (!source) return <Text>Recorded source unavailable.</Text>;
  const fields = source.type === 'local'
    ? [['Type', source.type], ['Location', source.location]]
    : [['Type', source.type], ['Repository', source.repository],
      ['Requested ref', source.requested_ref], ['Resolved commit', source.resolved_commit]];
  return <dl className={s.packMetadata}>{fields.map(([label, value]) => <React.Fragment key={label}>
    <dt>{label}</dt><dd className={s.code}>{value || 'Unavailable'}</dd>
  </React.Fragment>)}</dl>;
}

function trapTab(event, dialog) {
  if (event.key !== 'Tab') return;
  const stops = [...dialog.querySelectorAll('button:not(:disabled), summary, [tabindex="0"]')]
    .filter(node => node.getClientRects().length);
  const first = stops[0], last = stops.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/**
 * Settings holds two local sections. Packs stays mounted while About is shown,
 * so its view, selection, and request survive a section switch; only its
 * dialogs close, and they reopen on return under the existing focus rules.
 */
export function Settings({ data, active, section, onSection, onPermission }) {
  const { packs, packsLoading: loading, issues: { packs: issue } } = data;
  const s = useCanvasStyles(), id = useId();
  const packsShown = active && section === 'packs';
  const [view, setView] = useState(() => ({ ...INITIAL_VIEW, snapshot: packs }));
  const [requestView, setRequestView] = useState(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1099px)').matches);
  const heading = useRef(null), results = useRef(null), filter = useRef(null), detail = useRef(null);
  const closeButton = useRef(null), lastSelection = useRef(null), returnToRow = useRef(false);
  const requestDialog = useRef(null), requestClose = useRef(null), requestTrigger = useRef(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1099px)');
    const change = () => setNarrow(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  // A replacement (including a pending reload) resets only this browser. Do it
  // before committing detail, so no excluded or old-snapshot pack owns a pane.
  const current = view.snapshot === packs ? view : { ...INITIAL_VIEW, context: view.context, snapshot: packs };
  if (current !== view) setView(current);
  const installedCurrent = isCurrent(packs?.coverage.installed);
  const catalogCurrent = isCurrent(packs?.coverage.catalog);
  const installed = useMemo(() => packs?.installed && packs.items
    ? packs.items.filter(pack => pack.installed === true) : null, [packs]);
  const available = useMemo(() => installedCurrent && catalogCurrent && packs?.items
    ? packs.items.filter(pack => pack.installed === false) : null, [packs, installedCurrent, catalogCurrent]);
  const tags = useMemo(() => catalogCurrent
    ? [...new Set((packs?.catalog?.packs || []).flatMap(pack => pack.use_cases))] : [], [packs, catalogCurrent]);
  // Retain stale records for inspection, but a last empty read cannot establish
  // that the current installed authority is still empty.
  const context = current.context === 'available' ? available
    : (installedCurrent || installed?.length ? installed : null);
  const matches = useMemo(() => context?.filter(pack => !current.tag || pack.use_cases?.includes(current.tag)),
    [context, current.tag]);
  const pages = matches ? Math.ceil(matches.length / PAGE_SIZE) : 0;
  const page = Math.min(current.page, Math.max(1, pages));
  const offset = (page - 1) * PAGE_SIZE;
  const visible = matches?.slice(offset, offset + PAGE_SIZE) || [];
  const selected = visible.find(pack => pack.name === current.selected) || null;
  const unknownTags = installed?.filter(pack => pack.use_cases === null).length || 0;
  const partialTags = current.context === 'installed' && current.tag && unknownTags > 0;
  const staleInstalled = current.context === 'installed' && installed && !installedCurrent;
  const totals = { installed: installedCurrent && installed ? installed.length : null, available: available?.length ?? null };
  const coverage = key => packs?.coverage[key]?.state || (loading ? 'loading' : 'unavailable');
  const contextLabel = current.context === 'installed' ? 'Installed' : 'Available';
  const count = !matches ? 'Count unavailable' : !matches.length ? `0${partialTags ? ' known' : ''} matches`
    : `${offset + 1}–${offset + visible.length} of ${matches.length}${partialTags ? ' known matches'
      : staleInstalled ? ' last read' : current.tag ? ' matches' : ''}`;
  const pageLabel = !matches ? 'Unavailable' : !pages ? 'No pages' : `Page ${page} of ${pages}`;
  const latestRequest = packRequestStatus(data);
  const shownRequest = requestView ? packRequestStatus(data, requestView) : null;
  const permission = shownRequest && packPermission(data, shownRequest.record?.packReceipt);
  const outcome = shownRequest?.record?.receipt.acknowledgment;
  const actions = selected?.installed ? ['refresh', 'remove'] : ['install'];
  const actionReasons = selected ? Object.fromEntries(actions.map(operation =>
    [operation, packActionReason(data, operation, selected.name)])) : {};

  const rowFor = name => [...(results.current?.querySelectorAll('[data-pack-row]') || [])]
    .find(node => node.getAttribute('data-pack-row') === name);
  const close = () => { returnToRow.current = true; setView(previous => ({ ...previous, selected: null })); };
  const showRequest = binding => {
    requestTrigger.current = document.activeElement;
    setRequestView(binding);
  };
  useLayoutEffect(() => {
    const dialog = detail.current, request = requestDialog.current;
    const focused = document.activeElement;
    if (!packsShown) {
      if (request.open) request.close();
      if (dialog.open) dialog.close();
      return;
    }
    // The request is the top layer. Keep the native detail mode underneath it
    // until it closes; CSS removes a retained wide pane from narrow grid flow.
    if (requestView) {
      if (!request.open) {
        request.showModal();
        requestClose.current.focus({ preventScroll: true });
      }
      return;
    }
    const closingRequest = request.open;
    if (closingRequest) request.close();
    if (!selected) {
      const restore = closingRequest || returnToRow.current || (lastSelection.current
        && (dialog.contains(focused) || focused === document.body));
      // Native modal inertness ends before restoring a surviving row/heading.
      if (dialog.open) dialog.close();
      if (restore) (rowFor(lastSelection.current) || heading.current)?.focus({ preventScroll: true });
      else if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
      lastSelection.current = null;
      returnToRow.current = false;
      return;
    }
    const changedMode = dialog.open && dialog.matches(':modal') !== narrow;
    if (changedMode) dialog.close();
    if (!dialog.open) {
      if (narrow) dialog.showModal();
      else dialog.show();
    }
    const trigger = requestTrigger.current;
    if (closingRequest && trigger?.isConnected && trigger.getClientRects().length && !trigger.disabled
      && (!narrow || dialog.contains(trigger))) trigger.focus({ preventScroll: true });
    else if (closingRequest || lastSelection.current !== selected.name || changedMode) closeButton.current?.focus({ preventScroll: true });
    // A retained wide pane reopens beside the results without taking focus
    // from the section tab that revealed it; show() alone would move focus in.
    else if (!narrow && focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    lastSelection.current = selected.name;
  }, [packsShown, selected?.name, narrow, current.snapshot, requestView]);

  const changeFilter = tag => {
    setView(previous => {
      const firstPage = context?.filter(pack => !tag || pack.use_cases?.includes(tag)).slice(0, PAGE_SIZE) || [];
      return { ...previous, tag, page: 1,
        selected: firstPage.some(pack => pack.name === previous.selected) ? previous.selected : null };
    });
    if (results.current) results.current.scrollTop = 0;
  };
  const changePage = next => {
    setView(previous => ({ ...previous, page: next, selected: null }));
    results.current.scrollTop = 0;
    heading.current.focus({ preventScroll: true });
  };

  return <div className={s.settings} data-settings>
    <header className={s.settingsHeader}>
      <h1 ref={heading} id={`${id}-heading`} className={s.title} tabIndex={-1}>Settings</h1>
      <TabList className={s.settingsSections} aria-label="Settings sections" selectedValue={section} selectTabOnFocus
        onTabSelect={(_, input) => { if (input.value !== section) onSection(input.value); }}>
        {SECTIONS.map(([value, label, Icon]) => <Tab key={value} value={value} id={`${id}-section-${value}`}
          icon={<Icon />} className={s.sectionTab} data-settings-section={value} aria-controls={`${id}-${value}`}>
          {label}
        </Tab>)}
      </TabList>
    </header>
    <div role="tabpanel" id={`${id}-packs`} aria-labelledby={`${id}-section-packs`} hidden={section !== 'packs'}
      className={mergeClasses(s.packLayout, selected && !narrow && s.packLayoutSelected)}>
    <section className={s.packBrowser} aria-labelledby={`${id}-section-packs`}>
      <TabList className={s.packTabs} aria-label="Pack context" selectedValue={current.context} selectTabOnFocus
        onTabSelect={(_, input) => {
          if (input.value === current.context) return;
          setView({ ...INITIAL_VIEW, context: input.value, snapshot: packs });
          results.current.scrollTop = 0;
        }}>
        {CONTEXTS.map(([value, label]) => <Tab key={value} value={value} id={`${id}-${value}`}
          className={s.packTab} data-pack-context={value} aria-controls={`${id}-results`}
          aria-label={`${label} (${totals[value] ?? 'unknown'})`}>
          {label} <span className={s.packTabCount} data-pack-total={value}>{totals[value] ?? '?'}</span>
        </Tab>)}
      </TabList>
      <div className={s.packPanel} role="tabpanel" id={`${id}-results`} aria-labelledby={`${id}-${current.context}`}>
        <div className={s.packToolbar} data-pack-toolbar>
          <Field className={s.packFilterField} label="Use case">
            <Dropdown ref={filter} className={s.packFilter} inlinePopup
              disabled={!catalogCurrent} value={current.tag || 'All use cases'} selectedOptions={[current.tag]}
              onOptionSelect={(_, input) => changeFilter(input.optionValue)}>
              <Option value="" text="All use cases">All use cases</Option>
              {tags.map(tag => <Option key={tag} value={tag} text={tag}>{tag}</Option>)}
            </Dropdown>
          </Field>
          <Button className={s.packClear} onClick={() => { changeFilter(''); filter.current?.focus(); }}>Clear</Button>
        </div>
        <div ref={results} className={s.packScroll} data-pack-scroll aria-busy={loading}>
          {latestRequest && <div className={s.packReadNotice} data-pack-request-summary>
            <Text role="status" aria-live="polite" aria-atomic="true">
              {OPERATIONS[latestRequest.operation]} {latestRequest.name}: {PHASES[latestRequest.phase][0]}
            </Text>
            <Button className={s.back} onClick={() => showRequest(latestRequest.binding)}>View pack request</Button>
          </div>}
          {(issue || !installedCurrent || !catalogCurrent) && <div className={s.packReadNotice} role="status" data-pack-coverage>
            <Text weight="semibold">Installed: {coverage('installed')} · Catalog: {coverage('catalog')}</Text>
            <Text>{issue || (loading ? 'Reading pack information. Retained records are for inspection only.'
              : packs?.coverage.installed.message || packs?.coverage.catalog.message
                || 'Pack information is unavailable. Reload packs to try again.')}</Text>
            {!catalogCurrent && <Text>Use-case filtering and Available need a current catalog.
              {installed?.length > 0 && ' Recorded installed files and source remain inspectable.'}</Text>}
          </div>}
          {partialTags && <p className={s.packReadNotice} data-pack-tag-coverage>
            Incomplete tag coverage: {unknownTags} installed {unknownTags === 1 ? 'pack has' : 'packs have'} unavailable use cases.
            {' '}Only known matches are shown; All use cases includes them.
          </p>}
          {visible.length ? <DataGrid items={visible} columns={COLUMNS} getRowId={pack => pack.name}
            focusMode="composite" aria-label={`${contextLabel} packs`}>
            <DataGridHeader className={s.packTableHeader}><DataGridRow>
              {({ columnId, renderHeaderCell }) => <DataGridHeaderCell focusMode="none"
                className={mergeClasses(s.packCell, columnId === 'name' && s.packNameCell)}>{renderHeaderCell()}</DataGridHeaderCell>}
            </DataGridRow></DataGridHeader>
            <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId} data-pack-row={item.name}
              aria-label={`${item.name}. ${tagsText(item)}`} aria-selected={selected?.name === item.name}
              className={mergeClasses(s.packRow, selected?.name === item.name && s.workSelected)}
              onClick={() => setView(previous => ({ ...previous, selected: item.name }))}
              onKeyDown={event => {
                if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
                event.preventDefault(); setView(previous => ({ ...previous, selected: item.name }));
              }}>
              {({ columnId, renderCell }) => <DataGridCell focusMode="none"
                className={mergeClasses(s.packCell, columnId === 'name' ? s.packNameCell : s.packTagsCell)}>
                {renderCell(item)}
              </DataGridCell>}
            </DataGridRow>}</DataGridBody>
          </DataGrid> : <div className={s.empty} data-pack-empty>
            <Text weight="semibold">{!matches ? `${contextLabel} ${loading ? 'loading' : 'unavailable'}`
              : current.tag ? 'No matching packs' : current.context === 'installed' ? 'No installed packs' : 'No available packs'}</Text>
            <Text>{!matches ? 'This is not a confirmed empty list.'
              : current.tag ? 'Clear the use case to see all packs in this context.'
                : current.context === 'installed' ? 'The installed profile contains no packs.' : 'No catalog packs are outside installed membership.'}</Text>
            {catalogCurrent && packs?.catalog && <Text className={s.code}>Catalog origin: {packs.catalog.origin}</Text>}
          </div>}
        </div>
        <div className={s.packPager} data-pack-pager>
          <Button className={s.packPageButton} icon={<ChevronLeftRegular />} aria-label="Previous pack page"
            disabled={!matches || page <= 1} onClick={() => changePage(page - 1)}>
            <span className={s.packPageLabel}>Previous</span>
          </Button>
          <div className={s.packMetrics} role="status" aria-live="polite" aria-atomic="true">
            <span data-pack-count>{count}</span><span data-pack-page>{pageLabel}</span>
          </div>
          <Button className={s.packPageButton} icon={<ChevronRightRegular />} iconPosition="after" aria-label="Next pack page"
            disabled={!matches || page >= pages} onClick={() => changePage(page + 1)}>
            <span className={s.packPageLabel}>Next</span>
          </Button>
        </div>
      </div>
    </section>
    <dialog ref={detail} className={s.packDetail} aria-labelledby={`${id}-detail-heading`}
      aria-modal={selected && narrow ? true : undefined} data-pack-detail={selected?.name}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => {
        if (narrow && event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        }
      }}
      onKeyDown={event => {
        if (requestDialog.current.open) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (narrow) trapTab(event, detail.current);
      }}>
      {selected && <>
        <header className={s.packDetailHeader}>
          <div className={s.grow}><Text className={s.eyebrow}>{contextLabel} · Workspace scope</Text>
            <h2 id={`${id}-detail-heading`} className={s.subheading}>{selected.name}</h2></div>
          <Button ref={closeButton} appearance="subtle" icon={<DismissRegular />} aria-label="Close pack details" onClick={close} />
        </header>
        <div className={s.packDetailBody} tabIndex={0} role="region" aria-label="Pack metadata, source, and files" data-pack-detail-body>
          {(!installedCurrent || !catalogCurrent) && <Text className={s.packReadNotice}>
            Installed: {coverage('installed')} · Catalog: {coverage('catalog')}. Retained facts are for inspection only.
          </Text>}
          <p className={s.prose} data-pack-description>{selected.description === null
            ? 'Description unavailable; no readable catalog record.' : selected.description || 'No description declared.'}</p>
          <div className={s.tight}>
            <div className={s.actions} data-pack-actions>
              {actions.map(operation => <Button key={operation} data-pack-operation={operation}
                appearance={operation === 'install' ? 'primary' : 'secondary'}
                disabled={Boolean(actionReasons[operation])} aria-describedby={`${id}-action-reason`}
                onClick={() => {
                  const attempt = data.requestPack(operation, selected.name, packs);
                  if (attempt) showRequest(attempt);
                }}>{OPERATIONS[operation]}</Button>)}
            </div>
            <Text id={`${id}-action-reason`} className={s.eyebrow}>
              {[...new Set(Object.values(actionReasons).filter(Boolean))].join(' ')
                || 'Request this exact operation from Dude. The owner previews its impact and asks for literal permission before changing files.'}
            </Text>
          </div>
          <dl className={s.packMetadata}>
            <dt>Use cases</dt><dd>{tagsText(selected)}</dd>
            <dt>{catalogCurrent ? 'Current catalog origin' : 'Last read catalog origin'}</dt>
            <dd className={s.code} data-pack-origin>{packs?.catalog?.origin || 'Unavailable'}</dd>
            <dt>Declared tools</dt><dd>Not acquired in this snapshot.</dd>
          </dl>
          {selected.installed ? <>
            <h3 className={s.packMetadataHeading}>Recorded installed source</h3>
            <RecordedSource source={selected.source} />
            <details open className={s.packFiles}>
              <summary>Recorded files ({selected.files?.length ?? 'unknown'})</summary>
              {selected.files ? selected.files.length ? <ul>{selected.files.map(file =>
                <li key={file}><code className={s.code}>{file}</code></li>)}</ul> : <Text>No files recorded.</Text>
                : <Text>Recorded files unavailable.</Text>}
            </details>
            <Text className={s.eyebrow}>Membership and files: .dude/metadata/profile.md. Recorded source does not verify installed bytes.</Text>
          </> : <div className={s.tight}><h3 className={s.packMetadataHeading}>Projected files</h3>
            <Text>Not acquired in this snapshot.</Text></div>}
        </div>
        <footer className={s.packDetailFooter}><Button onClick={close}>Back to results</Button></footer>
      </>}
    </dialog>
    <dialog ref={requestDialog} className={s.packRequestDialog} aria-labelledby={`${id}-request-heading`}
      aria-describedby={`${id}-request-status`} data-pack-request-dialog
      onCancel={event => { event.preventDefault(); setRequestView(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRequestView(null); }
        else trapTab(event, requestDialog.current);
      }}>
      {shownRequest && <>
        <header className={s.packDetailHeader}>
          <div className={s.grow}><Text className={s.eyebrow}>Workspace pack request</Text>
            <h2 id={`${id}-request-heading`} className={s.subheading}>
              {OPERATIONS[shownRequest.operation]} {shownRequest.name}
            </h2></div>
          <Button ref={requestClose} appearance="subtle" icon={<DismissRegular />} aria-label="Close pack request"
            onClick={() => setRequestView(null)} />
        </header>
        <div className={s.packDetailBody} tabIndex={0} role="region" aria-label="Pack request outcome">
          <div id={`${id}-request-status`} role="status" aria-live="polite" aria-atomic="true"
            className={s.tight} data-pack-request-phase={shownRequest.phase}>
            <Text weight="semibold">{PHASES[shownRequest.phase][0]}</Text>
            <p className={s.prose}>{shownRequest.message || PHASES[shownRequest.phase][1]}</p>
            {outcome && <p className={s.prose}>{outcome.note}</p>}
            {outcome?.result?.ok === false && <p className={s.prose}>{outcome.result.error}</p>}
            {outcome && outcome.outcome !== 'applied' && <Text>{MUTATIONS[outcome.mutation]}</Text>}
          </div>
          {permission && <Button className={s.back} appearance="primary" data-pack-permission={permission.requestHandle}
            onClick={() => onPermission(shownRequest.record.packReceipt)}>Open Needs you</Button>}
          {shownRequest.record && <Text className={s.code}>Receipt: {shownRequest.record.packReceipt}</Text>}
          <Text className={s.eyebrow}>Closing or navigating away does not cancel an admitted request. Reading pack information never repeats it.</Text>
        </div>
        <footer className={s.packDetailFooter}><Button onClick={() => setRequestView(null)}>Return to packs</Button></footer>
      </>}
    </dialog>
    </div>
    <AboutPanel id={`${id}-about`} labelledBy={`${id}-section-about`} shown={active && section === 'about'}
      readAbout={data.readAbout} />
  </div>;
}

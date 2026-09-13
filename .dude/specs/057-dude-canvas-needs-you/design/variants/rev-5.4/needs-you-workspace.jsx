/**
 * T008 rev-5.4 · unapproved, memory-only design artifact.
 *
 * This is a new React composition, not an adapter around a previous mock DOM.
 * Publication/build is coordinator-owned. No fetch, SDK, filesystem, storage,
 * capture, or send path exists here. workspace-snapshots.js is read-only input.
 *
 * Source map:
 * - Inventory/intent/dispositions/next instruction: DUDE_MOCK_DATA (T003).
 * - Example requests: exact 057 spec § Request Coverage and idea § Session Scenarios.
 * - Typography observation: .dude/memory/context.md, Canvas typography flag.
 * - Theme: existing Canvas web themes + accessible neutral-stroke aliases.
 * - Navigation: explicit Context selection; full inventory only inside Browse.
 * - Review document: the same ContextBar/ContextDetail/CommandBar components as
 *   the proposal, frozen to the explicitly selected 057 snapshot. No DOM clone,
 *   remote page, essay masquerading as a mock, or HTML string insertion.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  FluentProvider, webLightTheme, webDarkTheme, tokens, makeStyles, mergeClasses, useRestoreFocusTarget,
  Button, Toolbar, ToolbarGroup, ToolbarButton, ToolbarDivider,
  ToolbarRadioGroup, ToolbarRadioButton, TabList, Tab, Listbox, Option,
  Combobox, Dropdown, Field, Input, Textarea, RadioGroup, Radio, Checkbox,
  MessageBar, MessageBarBody, MessageBarTitle, Text, Badge, Divider, Spinner,
  Accordion, AccordionItem, AccordionHeader, AccordionPanel, Tooltip,
  OverlayDrawer, DrawerHeader, DrawerHeaderTitle, DrawerBody,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  DataGrid, DataGridHeader, DataGridHeaderCell, DataGridBody, DataGridRow,
  DataGridCell, TableCellLayout, createTableColumn,
} from '@fluentui/react-components';
import {
  AddRegular, ArrowClockwiseRegular, InfoRegular, ArrowLeftRegular,
  CursorRegular, CommentRegular, SquareRegular, CircleRegular, ArrowUpRightRegular,
  LineRegular, HighlightRegular, ArrowUndoRegular, ArrowRedoRegular,
  DismissRegular, SearchRegular, DeleteRegular,
  DocumentRegular, LightbulbRegular,
} from '@fluentui/react-icons';

const OWNER = '.dude/ideas/057-dude-canvas-needs-you.md';
const SPEC = '.dude/specs/057-dude-canvas-needs-you/spec.md';
const ARTIFACT = '.dude/specs/057-dude-canvas-needs-you/design/needs-you-workspace.html';
const REVISION = 'rev-5.4';
const DATA = globalThis.DUDE_MOCK_DATA;
const SNAPSHOTS = DATA?.snapshots;
const SNAPSHOT_ERROR = snapshotLoadError(DATA);
const CURRENT = SNAPSHOT_ERROR ? null : SNAPSHOTS.workspace.projection;
const CANONICAL_CONTEXT = CURRENT?.contexts.find(c => c.ideaPath === OWNER);
const SOURCE_ASSETS = ['assets/workspace-snapshots.js', 'assets/needs-you-workspace.js'];

// Validate the fields this static composition consumes. Empty context arrays
// are valid data; a missing or malformed required snapshot is not a blank repo.
function snapshotLoadError(data) {
  if (!data) return 'Required snapshot data was not loaded.';
  const malformed = 'Required snapshot data is malformed or incomplete.';
  if (data.previewOnly !== true || !data.snapshots || typeof data.generatedAt !== 'string') return malformed;
  for (const key of ['workspace', 'blank', 'savedIdea']) {
    const snapshot = data.snapshots[key], p = snapshot?.projection;
    if (!snapshot || typeof snapshot.label !== 'string' || typeof snapshot.fixture !== 'boolean'
      || !p || !['blank', 'populated', 'unknown'].includes(p.workspace)
      || !Array.isArray(p.contexts) || !Array.isArray(p.choices) || !Array.isArray(p.sources)
      || typeof p.coverage?.inventory?.state !== 'string' || typeof p.coverage?.live?.state !== 'string') return malformed;
    if (p.next != null && typeof p.next.description !== 'string') return malformed;
    if (p.selected != null && typeof p.selected.ideaPath !== 'string') return malformed;
    if (p.sources.some(source => !source || typeof source.kind !== 'string')) return malformed;
    if (p.contexts.some(c => !c || typeof c.ideaPath !== 'string' || typeof c.title !== 'string'
      || typeof c.slug !== 'string' || !['idea', 'feature'].includes(c.kind)
      || !['draft', 'defined', 'resolved'].includes(c.status)
      || !(c.specPath === null || typeof c.specPath === 'string')
      || (c.intent != null && typeof c.intent.text !== 'string')
      || !Array.isArray(c.dispositions) || c.dispositions.some(d => !d || typeof d.text !== 'string'))) return malformed;
  }
  return null;
}

// Explicit source statements, not classifications inferred from intent/blank answers.
const RECORDED_BOUNDARIES = {
  '.dude/ideas/052-dude-canvas-ui.md': { title: 'Related work remains closed', text: '052 is not reopened by Needs You.', source: `${SPEC} § Scope And Surfaces`, terminal: true },
  '.dude/ideas/055-canvas-acceptance-reliability.md': { title: 'Related work remains closed', text: '055 is not reopened by Needs You.', source: `${SPEC} § Scope And Surfaces`, terminal: true },
  '.dude/ideas/056-ship-orphan-cleanup.md': { title: 'Recorded as deferred', text: 'The cleanup idea remains discoverable without an urgent request.', source: '.dude/memory/context.md · Future Canvas rediscovery', terminal: false, deferred: true },
};

function accessibleTheme(base) {
  return {
    ...base,
    colorNeutralStroke1: base.colorNeutralStrokeAccessible,
    colorNeutralStroke1Hover: base.colorNeutralStrokeAccessibleHover,
    colorNeutralStroke1Pressed: base.colorNeutralStrokeAccessiblePressed,
    colorNeutralStroke1Selected: base.colorNeutralStrokeAccessibleSelected,
  };
}
const THEMES = { light: accessibleTheme(webLightTheme), dark: accessibleTheme(webDarkTheme) };

// Fixed numbers below describe viewport breakpoints, document/shape geometry,
// and minimum hit areas. Fluent tokens own visual rhythm, color, and type.
const useStyles = makeStyles({
  page: {
    minHeight: '100dvh', backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    '@media (prefers-reduced-motion: reduce)': {
      '& *, & *::before, & *::after': { animationDuration: '0s', transitionDuration: '0s', scrollBehavior: 'auto' },
    },
  },
  app: { display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '480px', minWidth: 0 },
  titlebar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold },
  subheading: { margin: 0, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, fontWeight: tokens.fontWeightSemibold },
  eyebrow: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
  quiet: { color: tokens.colorNeutralForeground2 },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', minWidth: 0 },
  between: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  tight: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, minWidth: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  commands: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0, gap: tokens.spacingHorizontalXS, flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  viewTabs: { flexShrink: 0 },
  viewActions: { flexShrink: 0 },
  product: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, containerType: 'inline-size' },
  contextBar: {
    display: 'flex', alignItems: 'end', gap: tokens.spacingHorizontalS, flexShrink: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  contextField: { flex: '1 1 440px', maxWidth: '620px', minWidth: 0 },
  contextOptions: { maxHeight: 'min(360px, 50dvh)', overflowY: 'auto', maxWidth: 'min(680px, calc(100vw - 32px))' },
  contextOption: { flexShrink: 0 },
  requestList: { gap: tokens.spacingVerticalS },
  option: {
    minHeight: '52px', alignItems: 'center', whiteSpace: 'normal', overflowWrap: 'anywhere',
    paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS,
  },
  optionContent: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: 0 },
  optionTitle: { fontWeight: tokens.fontWeightSemibold },
  detail: {
    flex: 1, minWidth: 0, overflowY: 'auto', backgroundColor: tokens.colorNeutralBackground1,
    padding: tokens.spacingHorizontalXXL,
    '@container (max-width: 700px)': { padding: tokens.spacingHorizontalL },
  },
  measure: { maxWidth: '76ch', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  detailHeader: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  lead: { margin: 0, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400 },
  prose: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  instruction: {
    margin: 0, padding: tokens.spacingHorizontalL, backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium, fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
  },
  empty: { padding: tokens.spacingHorizontalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  footer: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  back: { alignSelf: 'flex-start' },
  disclosure: { borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  fields: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalL, '& > *': { flex: '1 1 200px', minWidth: 0 } },
  control: { minWidth: 0, width: '100%' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacingHorizontalS, paddingTop: tokens.spacingVerticalS },
  code: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 },
  scope: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS,
    borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    padding: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground2,
  },
  harness: { flexShrink: 0, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground3 },
  harnessBody: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, maxHeight: '42dvh', overflowY: 'auto', paddingBottom: tokens.spacingVerticalM },
  harnessGrid: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM, '& > *': { flex: '1 1 160px', minWidth: 0 } },
  viewport: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, width: '100%', alignSelf: 'center', backgroundColor: tokens.colorNeutralBackground1 },
  width360: { maxWidth: '360px', boxShadow: tokens.shadow8 },
  width768: { maxWidth: '768px', boxShadow: tokens.shadow8 },
  width1440: { maxWidth: '1440px', boxShadow: tokens.shadow8 },
  notice: { margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, flexShrink: 0 },
  drawer: { width: 'min(440px, 100vw)', maxWidth: '100vw' },
  drawerBody: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, paddingBottom: tokens.spacingVerticalXL, overflowWrap: 'anywhere' },
  dialog: { width: 'min(620px, calc(100vw - 32px))', maxHeight: '90dvh', overflowY: 'auto' },
  browseDialog: {
    width: 'min(1040px, calc(100vw - 32px))', maxWidth: 'calc(100vw - 32px)',
    height: 'min(780px, calc(100dvh - 32px))', maxHeight: 'calc(100dvh - 32px)',
    '@media (max-width: 700px)': { padding: tokens.spacingHorizontalL },
  },
  browse360: { width: 'min(360px, calc(100vw - 32px))' },
  browse768: { width: 'min(736px, calc(100vw - 32px))' },
  browseBody: { height: '100%', minHeight: 0 },
  browseContent: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minHeight: 0, overflow: 'hidden' },
  browseTools: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalM, '& > *': { flex: '1 1 180px', minWidth: 0 } },
  inventoryScroll: { flex: 1, minHeight: 0, overflowY: 'auto', border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  inventoryHeader: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: tokens.colorNeutralBackground2 },
  inventoryCell: { paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS, overflowWrap: 'anywhere' },
  columnName: { flex: '2 1 0px' },
  columnKind: { flex: '0.85 1 0px' },
  columnState: { flex: '1 1 0px' },
  columnSource: { flex: '2.3 1 0px' },
  cellLayout: { minWidth: 0, width: '100%', whiteSpace: 'normal' },
  candidate: { minHeight: '44px', overflowWrap: 'anywhere' },
  hidden: { display: 'none' },
  review: { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', containerType: 'inline-size' },
  reviewTitle: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, backgroundColor: tokens.colorNeutralBackground1 },
  drawingToolbar: {
    flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalS, backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  drawingTools: { flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' },
  toolLabel: { '@container (max-width: 1000px)': { display: 'none' } },
  toolButton: { minWidth: '36px', minHeight: '36px' },
  picker: { display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: tokens.spacingHorizontalS, padding: tokens.spacingHorizontalS },
  pickerField: { flex: '1 1 180px', minWidth: 0, maxWidth: '440px' },
  canvasScroll: {
    flex: 1, minHeight: '200px', minWidth: 0, overflow: 'auto', padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground3,
    '@container (max-width: 700px)': { padding: tokens.spacingHorizontalS },
  },
  canvas: { position: 'relative', minHeight: '600px', backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow8 },
  drawMode: { touchAction: 'none', cursor: 'crosshair', userSelect: 'none' },
  selectMode: { touchAction: 'pan-y' },
  document: { minHeight: '600px', pointerEvents: 'none', '& *': { caretColor: 'transparent' } },
  subject: { height: '740px', minHeight: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  sourceDetail: { overflowY: 'visible' },
  overlay: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' },
  shape: { stroke: tokens.colorPaletteRedBorder2, fill: 'none', strokeWidth: 2 },
  marker: { fill: tokens.colorNeutralBackground1, stroke: tokens.colorPaletteRedBorder2, strokeWidth: 2 },
  markerText: { fill: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase200, fontFamily: tokens.fontFamilyBase, fontWeight: tokens.fontWeightSemibold },
  arrowHead: { fill: tokens.colorPaletteRedBorder2 },
  highlight: { fill: tokens.colorPaletteYellowBackground2, fillOpacity: 0.45, stroke: tokens.colorPaletteYellowBorder2, strokeWidth: 2 },
  target: { fill: 'none', stroke: tokens.colorBrandStroke1, strokeWidth: 2, strokeDasharray: '6 3' },
  comments: { borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, flexShrink: 0, maxHeight: '36dvh', overflowY: 'auto', backgroundColor: tokens.colorNeutralBackground1 },
  commentLayout: { display: 'flex', gap: tokens.spacingHorizontalL, padding: tokens.spacingHorizontalM, alignItems: 'flex-start' },
  commentList: { flex: '0 0 220px', maxHeight: '190px', overflowY: 'auto', minWidth: 0 },
  commentEditor: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  drawerComments: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0,
    '& > *': { width: '100%', minWidth: 0, flexBasis: 'auto' } },
  geometry: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS, '& > *': { flex: '1 1 80px', minWidth: 0 } },
  live: { position: 'absolute', width: '1px', height: '1px', padding: 0, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
});

const EXAMPLES = [
  { id: 'onboarding', title: 'What would you like to make?', type: 'New idea', subject: 'A workspace without a feature',
    scope: 'Session only · no captured idea or selected feature',
    why: 'Describe the outcome you want. The coordinator can capture a draft without creating a spec or starting work.',
    source: 'Request Coverage · No feature yet; Session Scenarios · blank-slate and pre-selection', owner: 'Coordinator role (example)' },
  { id: 'fact', title: 'Should the Sharpie repository stay unchanged?', type: 'Clarification', subject: 'HTML annotation adoption',
    scope: 'Recorded 052 clarification · reference scenario',
    why: 'This decides whether adoption is a local copy or ongoing work in another repository. Technical research stays with the agent.',
    source: 'Request Coverage · Factual intent clarification; Session Scenarios · 052 clarification', owner: 'Definition owner role (example)' },
  { id: 'preview', title: 'Is the next action clear in this layout?', type: 'Design review', subject: 'Dude Canvas Needs You',
    scope: 'Dude Canvas Needs You · exactly owned design artifact', contextPath: OWNER,
    why: `Review the actual ${REVISION} proposal. Feedback asks for a design revision; approval is a separate decision.`,
    source: 'Request Coverage · Specific preview approval or revision; FR-017, FR-019–022', owner: 'Design owner through coordinator (example)' },
  { id: 'manual_observation', title: 'What appears after reopening Canvas?', type: 'Host observation', subject: 'Canvas host reload',
    scope: 'Historical 052/055 session observation · reference scenario',
    why: 'In this historical scenario, the host-only reopen follows the agent’s automated checks. Report what you see; the owner diagnoses it.',
    source: 'Request Coverage · Manual host action; Session Scenarios · 052/055 relaunch and reopen', owner: 'Requesting verification owner (example)' },
  { id: 'permission', title: 'Remove one claim and checkpoint pair?', type: 'Permission', subject: 'Exact-pair cleanup',
    scope: 'Historical operation-specific request · reference scenario',
    why: 'Removal affects only the named pair. Consent does not establish safety or execute cleanup.',
    source: 'Request Coverage · Exact operation-specific consent; Session Scenarios · September 4 T001@055ci001', owner: 'Work operation owner role (example)' },
  { id: 'scope_choice', title: 'Keep orphan cleanup separate from browser reliability?', type: 'Scope choice', subject: 'Browser reliability and orphan cleanup',
    scope: 'Recorded 052/056 scope discussion · reference scenario',
    why: 'Choose which outcome to pursue. Keeping the cleanup idea separate leaves browser reliability as the immediate scope.',
    source: 'Request Coverage · Genuine priority, recovery, or scope choice; Session Scenarios · 052 stops / 056 deferral', owner: 'Coordinator / Work owner role (example)' },
];
const STATES = [
  ['current', 'Current request'], ['responding', 'Responding'], ['awaiting', 'Awaiting acknowledgment'],
  ['accepted', 'Accepted'], ['applied', 'Applied'], ['declined', 'Declined'], ['deferred', 'Deferred'],
  ['completed', 'Successful completion'], ['stale', 'Stale context'], ['unavailable', 'Unavailable'],
];
const STATE_COPY = {
  current: ['info', 'Ready for a response', 'This is a labelled request example, not a current owner handoff.'],
  responding: ['info', 'Unsent response', 'Your input stays in this tab while you review the example.'],
  awaiting: ['info', 'Awaiting acknowledgment', 'Example: delivery was reported; application is not confirmed. Do not resend while the outcome is uncertain.'],
  accepted: ['success', 'Response accepted', 'Example: the owner accepted the response. Application still needs a fresh source read.'],
  applied: ['success', 'Response applied', 'Example: the owner acknowledged application and reread its source. There is no new question to answer.'],
  declined: ['warning', 'Response declined', 'Example: the owner needs more specific evidence. Keep the response; a fresh request is required before trying again.'],
  deferred: ['info', 'Deferred by the owner', 'Example: a source-backed disposition keeps this discoverable. It is not urgent or resolved.'],
  completed: ['success', 'Request complete', 'Example: nothing further is requested. Keep this result available without reopening the form.'],
  stale: ['warning', 'The request changed', 'Retain the response, but obtain the current owner context before acting.'],
  unavailable: ['warning', 'Owner context unavailable', 'The request cannot accept a response. Other ideas remain available.'],
};
const TOOLS = [
  ['select', 'Select', CursorRegular, 'V'], ['comment', 'Comment', CommentRegular, 'C'],
  ['box', 'Box', SquareRegular, 'B'], ['circle', 'Circle', CircleRegular, 'O'],
  ['arrow', 'Arrow', ArrowUpRightRegular, 'A'], ['line', 'Line', LineRegular, 'L'],
  ['highlight', 'Highlight', HighlightRegular, 'H'],
];
const isTerminal = state => ['accepted', 'applied', 'completed'].includes(state);
const hasInput = value => Object.values(value || {}).some(v => typeof v === 'string' ? v.length > 0 : v === true);

function SelectField({ label, value, options, onChange, disabled = false }) {
  const s = useStyles();
  const entries = options.map(o => Array.isArray(o) ? o : [o, o]);
  return <Field label={label}>
    <Dropdown className={s.control} disabled={disabled} value={entries.find(([key]) => key === value)?.[1] || value}
      selectedOptions={[value]} onOptionSelect={(_, d) => onChange(d.optionValue)}>
      {entries.map(([key, text]) => <Option key={key} value={key} text={text}>{text}</Option>)}
    </Dropdown>
  </Field>;
}

function Notice({ title, children, intent = 'info', className }) {
  return <MessageBar intent={intent} className={className}>
    <MessageBarBody>{title && <MessageBarTitle>{title}</MessageBarTitle>}{children}</MessageBarBody>
  </MessageBar>;
}

function SnapshotLoadFailure() {
  const s = useStyles();
  const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return <FluentProvider theme={THEMES[theme]} applyStylesToPortals={false}>
    <div className={mergeClasses(s.page, s.app)}>
      <header className={s.titlebar}><Text weight="semibold">Dude Canvas</Text>
        <Text className={s.eyebrow}>Snapshot unavailable · Design study {REVISION}</Text></header>
      <main className={s.detail}>
        <div className={s.measure}>
          <h1 className={s.title}>Workspace inventory could not be loaded</h1>
          <Notice intent="error" title={SNAPSHOT_ERROR}>
            Inventory counts and source contexts are unavailable. This is not a blank workspace or a no-current-requests result.
          </Notice>
          <p className={s.prose}>Restore the required snapshot asset and reload the design study. This page has not captured, deleted, or changed any work.</p>
          <code className={s.code}>assets/workspace-snapshots.js</code>
          <Text className={s.eyebrow}>Live handoff is also unavailable in this static mock.</Text>
        </div>
      </main>
    </div>
  </FluentProvider>;
}

function Disclosure({ title, children }) {
  const s = useStyles();
  return <Accordion collapsible className={s.disclosure}>
    <AccordionItem value="content">
      <AccordionHeader>{title}</AccordionHeader>
      <AccordionPanel>{children}</AccordionPanel>
    </AccordionItem>
  </Accordion>;
}

// Request details belong to Needs you; context and idea input are separate
// existing views. This is derived presentation, not another navigation state.
function currentWorkspaceView(view) {
  return view === 'request' ? 'needs' : view;
}

function CommandBar({ view, viewId, hasContext, onContext, onNeeds, onNew, onRefresh, onDetails, readOnly = false }) {
  const s = useStyles();
  const current = currentWorkspaceView(view);
  return <div className={s.commands} data-review-key="commands">
    <TabList className={s.viewTabs} aria-label="Workspace views" size="small"
      selectedValue={current} selectTabOnFocus={false}
      onTabSelect={(_, data) => {
        if (readOnly) return;
        if (data.value === 'context') onContext();
        if (data.value === 'needs') onNeeds();
        if (data.value === 'new') onNew();
      }}>
      {(hasContext || current === 'context') && <Tab value="context" id={`${viewId}-tab-context`}
        aria-controls={`${viewId}-panel-context`} data-review-key="command-context">Context</Tab>}
      <Tab value="needs" id={`${viewId}-tab-needs`} aria-controls={`${viewId}-panel-needs`}
        data-review-key="command-needs">Needs you</Tab>
      <Tab value="new" id={`${viewId}-tab-new`} aria-controls={`${viewId}-panel-new`}
        data-review-key="command-new">New idea</Tab>
    </TabList>
    <Toolbar aria-label="Workspace actions" className={s.viewActions}>
      <ToolbarGroup>
        <ToolbarButton icon={<ArrowClockwiseRegular />} onClick={readOnly ? undefined : onRefresh} data-review-key="command-refresh">Refresh</ToolbarButton>
        <ToolbarButton icon={<InfoRegular />} onClick={readOnly ? undefined : onDetails} data-review-key="command-details">Details</ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  </div>;
}

function WorkspaceViewPanels({ view, viewId, hasContext, children }) {
  const current = currentWorkspaceView(view);
  return ['context', 'needs', 'new'].map(value => <div key={value} role="tabpanel"
    id={`${viewId}-panel-${value}`}
    aria-labelledby={value !== 'context' || hasContext || current === 'context' ? `${viewId}-tab-${value}` : undefined}
    hidden={value !== current} tabIndex={value === current ? 0 : undefined}>
    {value === current ? children : null}
  </div>);
}

// Presentation helpers never infer disposition from arbitrary source prose.
function contextIsHistory(context) {
  return context.status === 'resolved' || RECORDED_BOUNDARIES[context.ideaPath]?.terminal === true;
}
function contextKind(context) {
  return context.kind === 'feature' ? 'Feature' : 'Idea';
}
function contextState(context) {
  const boundary = RECORDED_BOUNDARIES[context.ideaPath];
  if (context.status === 'resolved') return 'Resolved';
  if (boundary?.terminal) return `Closed · ${context.status}`;
  if (boundary?.deferred) return `Deferred · ${context.status}`;
  return context.status === 'draft' ? 'Draft' : 'Defined';
}
function alphabeticContexts(contexts) {
  return [...contexts].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
    || a.ideaPath.localeCompare(b.ideaPath, 'en'));
}
function matchesContext(context, query) {
  const q = query.trim().toLocaleLowerCase();
  return !q || [context.title, context.slug, context.ideaPath, context.specPath]
    .filter(Boolean).some(text => text.toLocaleLowerCase().includes(q));
}
function inventoryUnavailable(projection) {
  return projection.coverage.inventory.state === 'unavailable'
    || (projection.workspace === 'unknown' && projection.contexts.length === 0);
}
function confirmedBlank(projection) {
  return projection.workspace === 'blank' && projection.coverage.inventory.state === 'current'
    && projection.contexts.length === 0;
}

function ContextBar({ projection, selected, onCommit, onBrowse, readOnly = false }) {
  const s = useStyles();
  const [query, setQuery] = useState(null);
  const [open, setOpen] = useState(false);
  const context = projection.contexts.find(c => c.ideaPath === selected);
  const unavailable = inventoryUnavailable(projection);
  const label = context?.title || '';
  const options = alphabeticContexts(projection.contexts).filter(c => matchesContext(c, query || ''));
  useEffect(() => { setQuery(null); setOpen(false); }, [selected, projection]);
  return <div className={s.contextBar} data-review-key="context-picker">
    <Field label="Context" className={s.contextField}>
      {/* Keep Fluent width/collision handling; let contextOptions own the height cap. */}
      <Combobox className={s.control} listbox={{ className: s.contextOptions }}
        positioning={{ autoSize: 'width' }}
        value={query === null ? label : query} selectedOptions={context ? [context.ideaPath] : []}
        open={!readOnly && open} freeform readOnly={readOnly} disabled={unavailable}
        placeholder={unavailable ? 'Inventory unavailable' : confirmedBlank(projection) ? 'No captured context yet' : 'Choose a context'}
        onOpenChange={(_, d) => { setOpen(d.open); if (!d.open) setQuery(null); }}
        onChange={e => { if (!readOnly) { setQuery(e.target.value); setOpen(true); } }}
        onBlur={() => setQuery(null)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setQuery(null); setOpen(false); }
          // Fluent matches typeahead against the option's displayed title.
          // A unique slug/path search may have no active descendant; Enter is
          // still an explicit choice of that one visible, exact source record.
          if (!readOnly && !unavailable && e.key === 'Enter' && !e.nativeEvent.isComposing
            && query !== null && options.length === 1 && !e.currentTarget.getAttribute('aria-activedescendant')) {
            e.preventDefault(); setQuery(null); setOpen(false); onCommit(options[0].ideaPath);
          }
        }}
        onOptionSelect={(event, data) => {
          // Fluent may notify selection on Tab, blur, or input clear. Those are
          // not a user's commit. Keep query edits local and the form untouched.
          const explicit = event.type === 'click' || (event.type === 'keydown' && event.key === 'Enter');
          if (!readOnly && explicit && data.optionValue && projection.contexts.some(c => c.ideaPath === data.optionValue)) {
            setQuery(null); setOpen(false); onCommit(data.optionValue);
          }
        }}>
        {options.map(c => <Option key={c.ideaPath} value={c.ideaPath} text={c.title} className={mergeClasses(s.option, s.contextOption)}>
          <span className={s.optionContent}>
            <span className={s.optionTitle}>{c.title}</span>
            <span>{contextKind(c)} · {contextState(c)}</span>
            <span className={s.eyebrow}>{c.ideaPath}</span>
          </span>
        </Option>)}
        {!options.length && <Option disabled value="no-matches">{unavailable ? 'Inventory unavailable' : 'No matching context'}</Option>}
      </Combobox>
    </Field>
    <Button onClick={readOnly ? undefined : onBrowse} data-review-key="command-browse">Browse…</Button>
  </div>;
}

function SourceIdentity({ context }) {
  const s = useStyles();
  return <span className={s.code}>{context.ideaPath}</span>;
}

const BROWSE_COLUMNS = [
  createTableColumn({ columnId: 'name', renderHeaderCell: () => 'Name',
    renderCell: context => <TableCellLayout appearance="primary">{context.title}</TableCellLayout> }),
  createTableColumn({ columnId: 'kind', renderHeaderCell: () => 'Kind',
    renderCell: context => <TableCellLayout>{contextKind(context)}</TableCellLayout> }),
  createTableColumn({ columnId: 'state', renderHeaderCell: () => 'Recorded state',
    renderCell: context => <TableCellLayout>{contextState(context)}</TableCellLayout> }),
  createTableColumn({ columnId: 'source', renderHeaderCell: () => 'Source identity',
    renderCell: context => <TableCellLayout><SourceIdentity context={context} /></TableCellLayout> }),
];
const BROWSE_FILTERS = [
  ['all', 'All'], ['draft', 'Draft ideas'], ['feature', 'Defined features'],
  ['resolved', 'Resolved history'], ['deferred', 'Deferred work'],
];

function BrowseDialog({ open, onClose, onCommit, projection, selected, previewWidth }) {
  const s = useStyles();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [candidate, setCandidate] = useState(null);
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 700px)').matches);
  const contentRef = useRef(null);
  useEffect(() => {
    if (open) { setQuery(''); setFilter('all'); setCandidate(selected); }
  }, [open, selected, projection]);
  useLayoutEffect(() => {
    if (!open || !contentRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 620));
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [open]);
  const unavailable = inventoryUnavailable(projection);
  const visible = unavailable ? [] : alphabeticContexts(projection.contexts).filter(c => matchesContext(c, query)
    && (filter === 'all'
      || (filter === 'draft' && c.kind === 'idea' && c.status === 'draft' && !contextIsHistory(c))
      || (filter === 'feature' && c.kind === 'feature' && c.status === 'defined' && !contextIsHistory(c))
      || (filter === 'resolved' && contextIsHistory(c))
      || (filter === 'deferred' && RECORDED_BOUNDARIES[c.ideaPath]?.deferred === true)));
  const candidateContext = visible.find(c => c.ideaPath === candidate);
  const columnClasses = { name: s.columnName, kind: s.columnKind, state: s.columnState, source: s.columnSource };
  return <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
    <DialogSurface className={mergeClasses(s.browseDialog,
      previewWidth === '360' && s.browse360, previewWidth === '768' && s.browse768)}>
      <DialogBody className={s.browseBody}>
        <DialogTitle>Browse ideas &amp; features</DialogTitle>
        <DialogContent ref={contentRef} className={s.browseContent}>
          <div className={s.browseTools}>
            <Field label="Search inventory"><Input contentBefore={<SearchRegular />} className={s.control}
              value={query} disabled={unavailable} placeholder="Title, slug, or source path"
              onChange={(_, d) => { setQuery(d.value); setCandidate(null); }} /></Field>
            <SelectField label="Show" value={filter} disabled={unavailable} options={BROWSE_FILTERS}
              onChange={value => { setFilter(value); setCandidate(null); }} />
          </div>
          <Text className={s.eyebrow}>{unavailable ? 'Inventory unavailable; no count can be established.'
            : `${visible.length} of ${projection.contexts.length} recorded contexts · alphabetical, not priority order`}</Text>
          <Text className={s.eyebrow}>Select a candidate, then Open. Cancel keeps your current context and input.</Text>
          <div className={s.inventoryScroll}>
            {unavailable ? <div className={s.empty}><Notice intent="error" title="Inventory could not be read">
              This is not a blank workspace. Restore the source before choosing a context.
            </Notice></div> : !visible.length ? <div className={s.empty}>
              <Text weight="semibold">{confirmedBlank(projection) ? 'No captured ideas yet' : 'No matches'}</Text>
              <Text>{confirmedBlank(projection) ? 'Close Browse and use New idea to enter intent.'
                : 'Change the search or Show selection. Other contexts have not been removed.'}</Text>
            </div> : compact ? <Listbox aria-label="Browse inventory candidates" selectedOptions={candidateContext ? [candidate] : []}
              onOptionSelect={(_, d) => setCandidate(d.optionValue)}>
              {visible.map(c => <Option key={c.ideaPath} value={c.ideaPath} text={c.title} className={s.option}>
                <span className={s.optionContent}>
                  <span className={s.optionTitle}>{c.title}</span>
                  <span>{contextKind(c)} · {contextState(c)}</span>
                  <SourceIdentity context={c} />
                </span>
              </Option>)}
            </Listbox> : <DataGrid aria-label="Browse inventory candidates" items={visible} columns={BROWSE_COLUMNS}
              getRowId={item => item.ideaPath} selectionMode="single" focusMode="cell"
              selectedItems={new Set(candidateContext ? [candidate] : [])}
              onSelectionChange={(_, d) => setCandidate([...d.selectedItems][0] || null)}>
              <DataGridHeader className={s.inventoryHeader}><DataGridRow selectionCell={{ invisible: true }}>
                {({ columnId, renderHeaderCell }) => <DataGridHeaderCell className={mergeClasses(s.inventoryCell, columnClasses[columnId])}>
                  {renderHeaderCell()}
                </DataGridHeaderCell>}
              </DataGridRow></DataGridHeader>
              <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId}
                selectionCell={{ radioIndicator: { 'aria-label': `Select ${item.title}` } }}
                onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); setCandidate(item.ideaPath); }
                }}>
                {({ columnId, renderCell }) => <DataGridCell className={mergeClasses(s.inventoryCell, columnClasses[columnId])}>
                  <div className={s.cellLayout}>{renderCell(item)}</div>
                </DataGridCell>}
              </DataGridRow>}</DataGridBody>
            </DataGrid>}
          </div>
          <div className={s.candidate} role="status">
            {candidateContext ? <div className={s.tight}>
              <Text weight="semibold">{contextIsHistory(candidateContext) ? 'Open history: ' : 'Open: '}{candidateContext.title}</Text>
              <Text>{contextState(candidateContext)}{RECORDED_BOUNDARIES[candidate]?.deferred ? ' · explicitly recorded; no urgent request inferred' : ''}</Text>
            </div> : <Text className={s.quiet}>No candidate selected.</Text>}
          </div>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Cancel</Button>
          <Button appearance="primary" disabled={!candidateContext} onClick={() => {
            if (candidateContext) { onCommit(candidateContext.ideaPath); onClose(); }
          }}>Open</Button></DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>;
}

function NeedsYou({ examples, noRequestsExample, query, onQuery, selected, onSelect, drafts, responseState }) {
  const s = useStyles();
  const rows = examples && !noRequestsExample ? EXAMPLES.filter(r =>
    [r.title, r.subject, r.scope].some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) : [];
  return <div className={s.measure}>
    <header className={s.detailHeader}>
      <Text className={s.eyebrow}>Workspace-wide · independent of Context selection</Text>
      <h1 className={s.title}>Needs you{examples ? ' · examples' : ''}</h1>
      <p className={s.lead}>{examples ? 'Choose an example request to try its response.'
        : 'Requests appear here when an active owner asks for your input.'}</p>
    </header>
    {examples && !noRequestsExample && <Field label="Search example requests">
      <Input value={query} contentBefore={<SearchRegular />} onChange={(_, d) => onQuery(d.value)} />
    </Field>}
    {rows.length ? <Listbox className={s.requestList} aria-label="Example requests"
      selectedOptions={selected ? [selected] : []} onOptionSelect={(_, d) => onSelect(d.optionValue)}>
      {rows.map(r => <Option key={r.id} value={r.id} text={r.title} className={s.option}>
        <span className={s.optionContent}>
          <span className={s.optionTitle}>{r.title}</span>
          <span>{r.type} · {r.scope}</span>
          <span className={s.eyebrow}>{r.id === selected ? `Example: ${STATES.find(([key]) => key === responseState)?.[1]}` : 'Example request'}
            {hasInput(drafts[r.id]) ? ' · Unsent response' : ''}</span>
        </span>
      </Option>)}
    </Listbox> : <section className={s.stack}>
      <h2 className={s.subheading}>{noRequestsExample ? 'Example: no current requests'
        : examples ? 'No matching example' : 'Live requests are unavailable'}</h2>
      <p className={s.prose}>{noRequestsExample ? 'The simulated scope is fully read. Recorded ideas and deferred work remain available in Browse.'
        : examples ? 'Try a different search.'
          : 'The snapshot does not contain an admitted request feed. It cannot establish that nothing needs you. Context and Browse still open recorded work.'}</p>
    </section>}
  </div>;
}

function ContextDetail({ context, projection, onReview, onDetails, readOnly = false, reviewCondition = 'editing' }) {
  const s = useStyles();
  if (!context) return <div className={s.measure}>
    <h1 className={s.title}>Choose an idea or start a new one</h1>
    <p className={s.lead}>Use Context for a known title or Browse to inspect the inventory. Needs you shows requests across the workspace.</p>
  </div>;
  const canonical = context.ideaPath === OWNER;
  const boundary = RECORDED_BOUNDARIES[context.ideaPath];
  const resolved = context.status === 'resolved';
  const draft = context.kind === 'idea' && context.status === 'draft' && !context.specPath;
  const defined = context.kind === 'feature' && context.status === 'defined' && !!context.specPath;
  const terminal = resolved || ['closed', 'complete', 'completed'].includes(context.status) || boundary?.terminal;
  return <div className={s.measure}>
    <header className={s.detailHeader}>
      <Text className={s.eyebrow} data-review-key="context-kind">{terminal ? `${contextKind(context)} history · ${contextState(context)}`
        : draft ? 'Draft idea' : defined ? 'Defined feature' : context.kind === 'feature' ? 'Feature context' : 'Idea context'}</Text>
      <h1 className={s.title} data-review-key="context-title">{context.title}</h1>
      {canonical && <p className={s.lead} data-review-key="context-purpose">Find what needs your input. Respond without losing the work you were doing.</p>}
    </header>
    {canonical && !terminal && <section className={s.stack}>
      <div className={s.between}>
        <h2 className={s.subheading} data-review-key="next-heading">Review the workspace layout</h2>
        <Badge appearance="tint" color="informative">Exploring · {REVISION}</Badge>
      </div>
      <p className={s.prose} data-review-key="next-summary">The design is open for review. Try choosing a context and browsing the inventory, then mark the parts of this proposal that need to change.</p>
      {['missing', 'owner', 'draft'].includes(reviewCondition) ? <Notice intent="warning" title="Simulated Review prerequisite">
        {reviewCondition === 'missing' ? 'Restore the exact canonical mock before opening Review.'
          : reviewCondition === 'owner' ? 'Resolve the exact spec owner before opening writable Review.'
            : 'Define the draft explicitly before creating its mock or review storage.'}
      </Notice> : <div className={s.actions} data-review-key="review-entry">
        <Button appearance="primary" icon={<CommentRegular />} onClick={readOnly ? undefined : onReview}>Review this layout</Button>
        <Text className={s.eyebrow}>Design artifact · no live approval request</Text>
      </div>}
      <Disclosure title="Full task instructions">
        <p className={s.instruction} data-review-key="task-instruction">{projection.next?.description || CURRENT.next?.description}</p>
        <Text className={s.eyebrow}>Canonical task text from the recorded snapshot. The short heading above is a display summary.</Text>
      </Disclosure>
    </section>}
    {boundary ? <div className={s.scope}>
      <Text weight="semibold">{boundary.title}</Text><Text>{boundary.text}</Text><Text className={s.eyebrow}>{boundary.source}</Text>
    </div> : terminal && <Notice intent="success" title={resolved ? 'Resolved in the source' : 'Closed in the source'}>
      {resolved ? `This idea is retained as terminal history.${!context.specPath ? ' No active feature package is recorded.' : ''} No reopen or Define action is offered.`
        : 'This entry is retained for discovery. It does not reopen work.'}
    </Notice>}
    <section className={s.stack}>
      <h2 className={s.subheading}>{context.status === 'draft' ? 'What you wanted to do' : 'Captured intent'}</h2>
      <p className={s.prose} data-review-key="captured-intent">{context.intent?.text || 'No intent excerpt in this snapshot.'}</p>
      {context.intent?.truncated && <Text className={s.eyebrow}>Recorded excerpt ends here. The complete ledger source is identified in Details.</Text>}
    </section>
    {draft && !terminal && <Disclosure title="Before visual review">
      <p className={s.prose}>Define this idea explicitly before reviewing a canonical mock. This draft has no exactly owned design package; no artboard or review storage is created.</p>
    </Disclosure>}
    {!!context.dispositions?.length && <Disclosure title="Recorded owner dispositions">
      <div className={s.stack}>{context.dispositions.map((d, i) => <section className={s.stack} key={`${d.source?.section}-${i}`}>
        <Text weight="semibold">{d.source?.section || 'Source excerpt'}</Text>
        <p className={s.prose}>{d.text}</p>
        <Text className={s.eyebrow}>{d.truncated ? 'Excerpt only. ' : ''}Attributed source text, not an inferred current request.</Text>
      </section>)}</div>
    </Disclosure>}
    {canonical && !readOnly && <Disclosure title="Recorded design observation">
      <div className={s.stack}>
        <p className={s.prose}>The full Next step instruction was disproportionately large and bold. This proposal gives the subject a heading and keeps complete instructions at body size.</p>
        <Text className={s.eyebrow}>Read-only, source-backed typography flag · .dude/memory/context.md. It is not unsaved input and cannot be saved as another idea.</Text>
      </div>
    </Disclosure>}
    {!readOnly && <Button appearance="subtle" icon={<InfoRegular />} onClick={onDetails}>Source details</Button>}
  </div>;
}

function WorkspaceDocument() {
  const s = useStyles();
  const viewId = useId();
  return <div className={mergeClasses(s.subject, s.product)} aria-label={`Read-only ${REVISION} workspace proposal`}>
    <div className={s.titlebar} data-review-key="workspace-heading"><Text weight="semibold">Dude Canvas</Text><Text className={s.eyebrow}>Needs you workspace</Text></div>
    <CommandBar view="context" viewId={viewId} hasContext readOnly />
    <ContextBar projection={CURRENT} selected={OWNER} readOnly />
    <div className={mergeClasses(s.detail, s.sourceDetail)}>
      <WorkspaceViewPanels view="context" viewId={viewId} hasContext>
        <ContextDetail context={CANONICAL_CONTEXT} projection={CURRENT} readOnly />
      </WorkspaceViewPanels>
    </div>
  </div>;
}

function RequestForm({ request, value, onChange, responseState, permission, reviewCondition, onReview, onApprove, onPrepared, onDefer }) {
  const s = useStyles();
  const deferFocusTarget = useRestoreFocusTarget();
  const [attempted, setAttempted] = useState(false);
  const editable = responseState === 'current' || responseState === 'responding';
  const reviewUnavailable = ['missing', 'owner', 'draft'].includes(reviewCondition);
  const set = (key, val) => { onChange({ ...value, [key]: val }); };
  const target = permission === 'applicable-b' ? 'EXAMPLE-B' : 'EXAMPLE-A';
  const phrase = `remove ${target} claim and checkpoint`;
  const invalid = request.id === 'onboarding' ? !value.intent?.trim()
    : request.id === 'fact' ? !value.answer?.trim()
      : request.id === 'manual_observation' ? !value.outcome || !value.observation?.trim()
        : request.id === 'scope_choice' ? !value.choice
          : request.id === 'permission' ? value.phrase !== phrase : false;
  const required = key => attempted && !value[key]?.trim() ? { validationState: 'error', validationMessage: 'Enter a response before preparing it.' } : {};
  const prepare = e => {
    e.preventDefault();
    setAttempted(true);
    if (invalid) {
      const form = e.currentTarget;
      requestAnimationFrame(() => form.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    onPrepared({
      title: request.id === 'permission' ? 'Permission response prepared' : request.id === 'onboarding' ? 'Idea capture prepared' : 'Response prepared',
      description: request.id === 'permission' ? `Only the ${target} claim and checkpoint pair is in scope. This simulated confirmation grants no real permission.`
        : request.id === 'onboarding' ? 'The coordinator would match or capture this intent through brainstorm. No idea has been saved.'
          : 'The requesting owner would receive this response for evaluation. Nothing has been sent or applied.',
      payload: { class: request.id, example: true, ...value },
    });
  };
  return <div className={s.measure}>
    <header className={s.detailHeader}>
      <Text className={s.eyebrow}>Example request · {request.type} · {request.subject}</Text>
      <h1 className={s.title}>{request.title}</h1>
      <Text>Source context: {request.scope}</Text>
      <p className={s.lead}>{request.why}</p>
    </header>
    {responseState !== 'current' && <Notice intent={STATE_COPY[responseState][0]} title={`Simulated · ${STATE_COPY[responseState][1]}`}>{STATE_COPY[responseState][2]}</Notice>}
    {!editable ? <div className={s.stack}>
      {hasInput(value) && <Disclosure title="Retained response"><pre className={s.code}>{JSON.stringify(value, null, 2)}</pre></Disclosure>}
      {!isTerminal(responseState) && <Text className={s.quiet}>Use Preview controls to inspect a fresh-request example. This state does not revive the prior request.</Text>}
    </div> : <form className={s.stack} onSubmit={prepare} noValidate>
      {request.id === 'onboarding' && <>
        <Field label="What outcome do you want?" required {...required('intent')}>
          <Textarea value={value.intent || ''} onChange={(_, d) => set('intent', d.value)} rows={5} resize="vertical" />
        </Field>
        <Disclosure title="Remaining onboarding question (example)">
          <Field label="What should happen after capture?">
            <RadioGroup value={value.next || ''} onChange={(_, d) => set('next', d.value)}>
              <Radio value="define" label="Define the idea first" />
              <Radio value="implement" label="Ask the coordinator about implementation" />
            </RadioGroup>
          </Field>
          <Text className={s.eyebrow}>Only ask this if the entered intent has not already answered it. Capture itself authorizes neither option.</Text>
        </Disclosure>
      </>}
      {request.id === 'fact' && <>
        <Field label="Your answer" required {...required('answer')}>
          <Textarea value={value.answer || ''} onChange={(_, d) => set('answer', d.value)} rows={4} resize="vertical"
            placeholder="Describe the repository boundary you want." />
        </Field>
        <Text className={s.eyebrow}>The recorded decision was to copy the HTML subset and leave the external repository untouched. This form replays the interaction, not an unanswered question.</Text>
      </>}
      {request.id === 'preview' && <>
        <div className={s.scope}>
          <Text weight="semibold">Needs You workspace · {REVISION}</Text>
          <code className={s.code}>{ARTIFACT}</code>
          <Text>Approval would apply only to this design revision, not production implementation.</Text>
        </div>
        {reviewUnavailable ? <Notice intent="warning" title="Review prerequisite">
          {reviewCondition === 'missing' ? 'Example: the canonical mock is missing. Restore the exact artifact before Review.'
            : reviewCondition === 'owner' ? 'Example: ownership is ambiguous. Resolve the exact spec owner before opening writable Review.'
              : 'Example: this draft needs explicit definition and an exactly owned mock before Review.'}
        </Notice> : <div className={s.actions}>
          <Button appearance="primary" icon={<CommentRegular />} onClick={onReview}>Open Review</Button>
          <Button onClick={onApprove} disabled={reviewCondition === 'drift'}>Approval…</Button>
          <Button {...deferFocusTarget} type="button" onClick={onDefer}>Defer…</Button>
        </div>}
      </>}
      {request.id === 'manual_observation' && <>
        <div className={s.scope}>
          <Text weight="semibold">Historical host-step example · 052/055</Text>
          <Text>There is no current installed-build revision or host instruction in this snapshot. Do not restart your host for this example.</Text>
          <ol>
            <li>In an admitted request, verify the exact owner-named installed revision.</li>
            <li>Reopen the same Canvas only when the host step is authorized outside an active Work invocation.</li>
            <li>Report the first visible content and anything unexpected.</li>
          </ol>
        </div>
        <Field label="What happened?" required validationState={attempted && !value.outcome ? 'error' : 'none'}
          validationMessage={attempted && !value.outcome ? 'Choose an outcome.' : undefined}>
          <RadioGroup value={value.outcome || ''} onChange={(_, d) => set('outcome', d.value)}>
            <Radio value="completed" label="Completed the named steps" />
            <Radio value="problem" label="Encountered a problem" />
            <Radio value="observation" label="Observation only" />
          </RadioGroup>
        </Field>
        <Field label="What did you see?" required {...required('observation')}>
          <Textarea value={value.observation || ''} onChange={(_, d) => set('observation', d.value)} rows={4} resize="vertical" />
        </Field>
      </>}
      {request.id === 'permission' && <>
        <div className={s.scope}>
          <Text weight="semibold">{permission === 'missing' ? 'Historical pair · T001@055ci001' : `Applicable contract example · ${target}`}</Text>
          <Text>Targets: the claim and its matching checkpoint, and no other records.</Text>
          <Text>Effect: remove this pair. The operation owner must revalidate safety and decide whether a fresh claim is allowed. No invocation is revived.</Text>
        </div>
        {permission === 'missing' ? <Notice intent="warning" title="Technical eligibility is unavailable">
          The historical “none active” statement is testimony, not proof that the supervisor is absent. The stop remains. There is no useful confirmation to type.
        </Notice> : <>
          <Text className={s.eyebrow}>Form demonstration only: assume the example owner has supplied current exact-pair and supervisor-absence evidence. No such technical proof is asserted for this workspace.</Text>
          <Field label={`Type exactly: ${phrase}`} required validationState={attempted && invalid ? 'error' : 'none'}
            validationMessage={attempted && invalid ? 'The literal input must match exactly, including spaces and case.' : undefined}>
            <Input value={value.phrase || ''} onChange={(_, d) => set('phrase', d.value)} autoComplete="off" spellCheck={false} />
          </Field>
        </>}
      </>}
      {request.id === 'scope_choice' && <>
        <Field label="Choose an outcome" required validationState={attempted && !value.choice ? 'error' : 'none'}
          validationMessage={attempted && !value.choice ? 'Choose one outcome.' : undefined}>
          <RadioGroup value={value.choice || ''} onChange={(_, d) => set('choice', d.value)}>
            <Radio value="separate" label="Keep cleanup separate; continue the browser-reliability scope" />
            <Radio value="revisit" label="Revisit scope with the coordinator before continuing" />
          </RadioGroup>
        </Field>
        <Field label="Anything the owner should consider?">
          <Textarea value={value.note || ''} onChange={(_, d) => set('note', d.value)} rows={3} resize="vertical" />
        </Field>
        <Text className={s.eyebrow}>The recorded 056 idea stays discoverable. This example adds no Resume permission and cannot reopen closed 052 or 055 work.</Text>
      </>}
      {(request.id !== 'preview' || reviewUnavailable) && <div className={s.actions}>
        {request.id !== 'preview' && !(request.id === 'permission' && permission === 'missing') &&
          <Button appearance="primary" type="submit">{request.id === 'onboarding' ? 'Prepare idea capture'
            : request.id === 'manual_observation' ? 'Prepare observation' : request.id === 'permission' ? 'Prepare this permission' : 'Prepare response'}</Button>}
        <Button {...deferFocusTarget} type="button" onClick={onDefer}>Defer…</Button>
      </div>}
    </form>}
    <Disclosure title="Request context">
      <div className={s.stack}>
        <Text>{request.owner}</Text>
        <p className={s.prose}>{SPEC} § {request.source}</p>
        <Text className={s.eyebrow}>Examples are based on accepted coverage and recorded scenarios. They are not current requests, assigned owners, eligibility evidence, or live receipt states.</Text>
      </div>
    </Disclosure>
  </div>;
}

function NewIdea({ value, onChange, onPrepared, onDefer }) {
  const s = useStyles();
  const deferFocusTarget = useRestoreFocusTarget();
  const [attempted, setAttempted] = useState(false);
  return <form className={s.measure} onSubmit={e => {
    e.preventDefault(); setAttempted(true);
    if (!value.intent?.trim()) {
      const form = e.currentTarget;
      requestAnimationFrame(() => form.querySelector('textarea')?.focus());
      return;
    }
    if (value.intent?.trim()) onPrepared({ title: 'Idea capture prepared',
      description: 'The coordinator would capture or match this intent through brainstorm. No ledger, spec, task, or selection has been created.',
      payload: { class: 'onboarding', intent: value.intent } });
  }}>
    <header className={s.detailHeader}><Text className={s.eyebrow}>New idea · unsaved in this tab</Text>
      <h1 className={s.title}>What would you like to make?</h1>
      <p className={s.lead}>Start with the outcome. You can discover the draft here after the owner confirms capture.</p>
    </header>
    <Field label="Your idea" required validationState={attempted && !value.intent?.trim() ? 'error' : 'none'}
      validationMessage={attempted && !value.intent?.trim() ? 'Describe the intent you want to keep.' : undefined}>
      <Textarea rows={7} resize="vertical" value={value.intent || ''} onChange={(_, d) => onChange({ intent: d.value })} />
    </Field>
    <div className={s.actions}>
      <Button appearance="primary" type="submit">Prepare idea capture</Button>
      <Button {...deferFocusTarget} type="button" onClick={onDefer}>Defer…</Button>
    </div>
    <Text className={s.eyebrow}>Prototype input is kept only in this open tab. Preparation does not send or save it.</Text>
  </form>;
}

function DetailsDrawer({ open, onOpenChange, context, projection, snapshot, request }) {
  const s = useStyles();
  return <OverlayDrawer open={open} onOpenChange={(_, d) => onOpenChange(d.open)} position="end" className={s.drawer}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close Details" onClick={() => onOpenChange(false)} />}>Details</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody className={s.drawerBody}>
      <h2 className={s.subheading}>{request?.title || context?.title || 'Workspace snapshot'}</h2>
      {request && <><Badge appearance="tint">Example request</Badge><Text>{request.owner}</Text>
        <Text>Source context: {request.scope}</Text><p className={s.prose}>{request.source}</p></>}
      {context && <><Text weight="semibold">Exact source</Text><code className={s.code}>{context.ideaPath}</code>
        {context.specPath && <code className={s.code}>{context.specPath}</code>}
        <Text>Source status: {context.status}. Ledger kind: {context.kind}.</Text></>}
      {context?.ideaPath === OWNER && <Disclosure title="Canonical instructions and task identity">
        <div className={s.stack}>
          <p className={s.instruction}>{CURRENT.next?.description}</p>
          <code className={s.code}>{CURRENT.next?.source?.path}{'\n'}{CURRENT.next?.source?.taskKey}</code>
        </div>
      </Disclosure>}
      <Divider />
      <Text weight="semibold">{snapshot.label}</Text>
      <Text>{snapshot.fixture ? 'Disposable fixture, not current repository work.' : 'Read-only repository snapshot; not a live read.'}</Text>
      <Text>Read at: {projection.readAt || 'unavailable'}</Text>
      <Text>Generated at: {DATA?.generatedAt || 'unavailable'}</Text>
      <Text>{projection.contexts?.length || 0} recorded contexts · {projection.choices?.length || 0} selector choices · {projection.coverage?.inventory?.packages ?? 'unknown'} packages</Text>
      <Disclosure title="Coverage by scope">
        <pre className={s.code}>{JSON.stringify(projection.coverage, null, 2)}</pre>
      </Disclosure>
      <Disclosure title="Source provenance">
        <div className={s.stack}>
          {(projection.sources || []).filter(source => !context || source.path === context.ideaPath || source.path === context.specPath || source.kind === 'inventory').map((source, i) =>
            <pre className={s.code} key={`${source.path || source.kind}-${i}`}>{JSON.stringify(source, null, 2)}</pre>)}
        </div>
      </Disclosure>
      <Disclosure title="Static artifact limits">
        <p className={s.prose}>Refresh rereads the loaded snapshot, not disk or an agent. No current handoff, save, permission, approval, PNG capture, evidence seal, or send is implemented. Example states demonstrate the response contract. Review stores editable markup in memory only. Reload discards it.</p>
      </Disclosure>
    </DrawerBody>
  </OverlayDrawer>;
}

function PreparationDialog({ result, onClose }) {
  const s = useStyles();
  return <Dialog open={!!result} onOpenChange={(_, d) => !d.open && onClose()}>
    <DialogSurface className={s.dialog}><DialogBody>
      <DialogTitle>{result?.title}</DialogTitle>
      <DialogContent className={s.stack}>
        <Notice title="Prepared · not sent">{result?.description}</Notice>
        {result?.report && <p className={s.prose}>{result.report}</p>}
        {result?.payload && <Disclosure title="Prepared response (literal input)"><pre className={s.code}>{JSON.stringify(result.payload, null, 2)}</pre></Disclosure>}
      </DialogContent>
      <DialogActions><Button appearance="primary" onClick={onClose}>Keep editing</Button></DialogActions>
    </DialogBody></DialogSurface>
  </Dialog>;
}

function IntentDialog({ kind, text, onClose, onPrepared, onSave, sourceBacked }) {
  const s = useStyles();
  const [intent, setIntent] = useState(text || '');
  const [error, setError] = useState(false);
  return <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
    <DialogSurface className={s.dialog}><DialogBody>
      <DialogTitle>{kind === 'save' ? 'Save selected intent as an idea' : 'Defer this matter'}</DialogTitle>
      <DialogContent className={s.stack}>
        {kind === 'save' ? <>
          <Text>Choose the intent to capture through brainstorm. The owner would check for an existing match; capture would not define or start work.</Text>
          <Field label="Intent to retain" required validationState={error ? 'error' : 'none'} validationMessage={error ? 'Enter the intent you want captured.' : undefined}>
            <Textarea autoFocus value={intent} onChange={(_, d) => setIntent(d.value)} rows={5} resize="vertical" />
          </Field>
        </> : <Text>{sourceBacked
          ? 'The owner would record a disposition against the existing source. No duplicate idea is created. Until acknowledgment, it is not deferred.'
          : 'This input has no acknowledged canonical source. Defer does not save an idea or promise that it will return after reload. It remains visibly unsaved in this tab.'}</Text>}
      </DialogContent>
      <DialogActions fluid>
        <Button onClick={onClose}>Cancel</Button>
        {kind === 'defer' && !sourceBacked && <Button onClick={onSave}>Save as idea…</Button>}
        <Button appearance="primary" onClick={() => {
          if (kind === 'save' && !intent.trim()) { setError(true); return; }
          onPrepared({ title: kind === 'save' ? 'Idea capture prepared' : 'Deferral prepared',
            description: kind === 'save' ? 'Not saved. Capture requires owner acknowledgment and a reread of the canonical idea.'
              : sourceBacked ? 'Not deferred. The original source and request remain unchanged.' : 'Unsaved. This prototype has not created a source or durable deferral.',
            payload: kind === 'save' ? { action: 'save_as_idea', intent }
              : { action: 'defer', sourceBacked, ...(!sourceBacked ? { intent } : {}) } });
          onClose();
        }}>{kind === 'save' ? 'Prepare capture' : sourceBacked ? 'Prepare deferral' : 'Prepare unsaved deferral'}</Button>
      </DialogActions>
    </DialogBody></DialogSurface>
  </Dialog>;
}

function ApprovalDialog({ onClose, onPrepared, reviewed, stale }) {
  const s = useStyles();
  const [confirmed, setConfirmed] = useState(false);
  return <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
    <DialogSurface className={s.dialog}><DialogBody>
      <DialogTitle>Approval of {REVISION}</DialogTitle>
      <DialogContent className={s.stack}>
        <div className={s.scope}><Text weight="semibold">Dude Canvas Needs You · {REVISION}</Text><code className={s.code}>{ARTIFACT}</code>
          <Text>Only this mock revision is in scope. Sending annotations is not approval; future revisions inherit nothing.</Text></div>
        {!reviewed || stale ? <Notice intent="warning" title="Review this revision first">{stale ? 'Source or layout binding changed. Fresh review is required.' : 'Open Review before preparing an approval response.'}</Notice>
          : <Checkbox checked={confirmed} onChange={(_, d) => setConfirmed(d.checked === true)} label={`I intend to approve this exact ${REVISION} design in the example`} />}
        <Text className={s.eyebrow}>The real approval checkpoint remains with the coordinator. This form cannot approve the design or authorize production edits.</Text>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button appearance="primary" disabled={!reviewed || stale || !confirmed}
        onClick={() => { onPrepared({ title: 'Approval response prepared', description: 'Not approved or sent. The coordinator must obtain and record explicit approval through the existing design-owner path.',
          payload: { class: 'preview', decision: 'approve', revision: REVISION, artifact: ARTIFACT, example: true } }); onClose(); }}>Prepare approval</Button></DialogActions>
    </DialogBody></DialogSurface>
  </Dialog>;
}

function PreviewHarness({ settings, onChange, onNewExample }) {
  const s = useStyles();
  return <aside className={s.harness} aria-label="Prototype preview controls">
    <Accordion collapsible>
      <AccordionItem value="preview">
        <AccordionHeader>Preview controls · {REVISION} · unapproved</AccordionHeader>
        <AccordionPanel className={s.harnessBody}>
          <Text>Simulation only. Product data and response examples are separate; changing a state does not send, save, or acknowledge anything.</Text>
          <div className={s.harnessGrid}>
            <SelectField label="Snapshot" value={settings.snapshot} onChange={v => onChange('snapshot', v)}
              options={Object.entries(SNAPSHOTS).map(([key, value]) => [key, value.label])} />
            <SelectField label="Requests" value={settings.mode} onChange={v => onChange('mode', v)}
              options={[['actual', 'Actual snapshot'], ['examples', 'Labelled request examples']]} />
            <SelectField label="Theme" value={settings.theme} onChange={v => onChange('theme', v)} options={['light', 'dark']} />
            <SelectField label="Viewport" value={settings.width} onChange={v => onChange('width', v)}
              options={[['fluid', 'Fit window'], ['360', '360 px'], ['768', '768 px'], ['1440', '1440 px']]} />
          </div>
          <div className={s.harnessGrid}>
            <SelectField label="Coverage view" value={settings.coverage} onChange={v => onChange('coverage', v)}
              options={[['actual', 'Actual source coverage'], ['loading', 'Example: loading'], ['current', 'Example: no current requests'], ['partial', 'Example: partial'], ['stale', 'Example: stale'], ['unavailable', 'Example: unavailable']]} />
            <SelectField label="Response state (examples)" value={settings.response} onChange={v => onChange('response', v)} options={STATES} />
            <SelectField label="Permission scenario" value={settings.permission} onChange={v => onChange('permission', v)}
              options={[['missing', 'Historical: eligibility missing'], ['applicable-a', 'Applicable contract example A'], ['applicable-b', 'Changed target: example B']]} />
            <SelectField label="Review scenario" value={settings.review} onChange={v => onChange('review', v)}
              options={[['editing', 'Editing'], ['capture', 'Capture failure'], ['sealed', 'Sealed evidence example'], ['drift', 'Source / asset drift'],
                ['missing', 'Missing mock'], ['owner', 'Ambiguous owner'], ['draft', 'Define first']]} />
          </div>
          <Button onClick={onNewExample}>Open unsaved idea input</Button>
          <Text className={s.eyebrow}>Coverage and response states prefixed “Example” never replace the snapshot’s live-unavailable evidence. Smaller viewport settings constrain this surface; they do not resize the browser.</Text>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  </aside>;
}

// Geometry is document-root-relative. Lines retain both endpoints and direction.
function shapeBetween(type, a, b) {
  return { type, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
function shapeFromBounds(annotation, change) {
  const a = { ...annotation, ...change };
  if (a.type === 'line' || a.type === 'arrow') {
    const reverseX = annotation.x1 > annotation.x2, reverseY = annotation.y1 > annotation.y2;
    return { ...a, x1: reverseX ? a.x + a.w : a.x, x2: reverseX ? a.x : a.x + a.w,
      y1: reverseY ? a.y + a.h : a.y, y2: reverseY ? a.y : a.y + a.h };
  }
  return a;
}
function shapeContains(a, point) {
  const tolerance = 8;
  if (a.type === 'comment') return Math.hypot(point.x - a.x, point.y - a.y) <= 16;
  if (a.type === 'line' || a.type === 'arrow') {
    const dx = a.x2 - a.x1, dy = a.y2 - a.y1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x1) * dx + (point.y - a.y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - a.x1 - t * dx, point.y - a.y1 - t * dy) <= tolerance;
  }
  if (a.type === 'circle') {
    const rx = Math.max(1, a.w / 2), ry = Math.max(1, a.h / 2);
    return Math.abs(Math.hypot((point.x - a.x - rx) / rx, (point.y - a.y - ry) / ry) - 1) <= tolerance / Math.min(rx, ry);
  }
  const inside = point.x >= a.x - tolerance && point.x <= a.x + a.w + tolerance &&
    point.y >= a.y - tolerance && point.y <= a.y + a.h + tolerance;
  return inside && (a.type === 'highlight' || Math.min(Math.abs(point.x - a.x), Math.abs(point.x - a.x - a.w),
    Math.abs(point.y - a.y), Math.abs(point.y - a.y - a.h)) <= tolerance);
}
function visibleWithinDocument(element, root) {
  const b = element.getBoundingClientRect();
  if (!b.width || !b.height) return false;
  // A clipped list row must not become an invisible target in the picker.
  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
    if (parent === root || ['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowY)) {
      if (b.top < clip.top - 1 || b.bottom > clip.bottom + 1) return false;
    }
    if (parent === root || ['hidden', 'auto', 'scroll', 'clip'].includes(style.overflowX)) {
      if (b.left < clip.left - 1 || b.right > clip.right + 1) return false;
    }
    if (parent === root) break;
    parent = parent.parentElement;
  }
  return true;
}
function anchorCapture(element, root) {
  const key = element?.getAttribute('data-review-key');
  if (!key || !root?.contains(element)) return null;
  const selector = `#review-document [data-review-key="${CSS.escape(key)}"]`;
  const matches = root.querySelectorAll(`[data-review-key="${CSS.escape(key)}"]`).length;
  if (matches !== 1) return null;
  const box = element.getBoundingClientRect(), base = root.getBoundingClientRect();
  const style = getComputedStyle(element);
  return { selector, key, matches, text: element.textContent,
    style: { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, backgroundColor: style.backgroundColor },
    bounds: { x: box.left - base.left, y: box.top - base.top, w: box.width, h: box.height } };
}

function AnnotationShape({ annotation: a, index }) {
  const s = useStyles();
  if (a.type === 'comment') return <g>
    <circle className={s.marker} cx={a.x} cy={a.y} r="12" />
    <text className={s.markerText} x={a.x} y={a.y} textAnchor="middle" dominantBaseline="central">{index + 1}</text>
  </g>;
  if (a.type === 'box' || a.type === 'highlight') return <rect className={a.type === 'box' ? s.shape : s.highlight} x={a.x} y={a.y} width={a.w} height={a.h} rx="2" />;
  if (a.type === 'circle') return <ellipse className={s.shape} cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={Math.max(1, a.w / 2)} ry={Math.max(1, a.h / 2)} />;
  const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), size = 10;
  const points = `${a.x2},${a.y2} ${a.x2 - size * Math.cos(angle - 0.5)},${a.y2 - size * Math.sin(angle - 0.5)} ${a.x2 - size * Math.cos(angle + 0.5)},${a.y2 - size * Math.sin(angle + 0.5)}`;
  return <g><line className={s.shape} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />{a.type === 'arrow' && <polygon className={s.arrowHead} points={points} />}</g>;
}

function AnnotationInspector({ items, selected, onSelect, onEdit, onBeginEdit, onDelete,
  noteRef, selectionMemory, onRememberSelection, active, stale, mobile }) {
  const s = useStyles();
  const a = items.find(item => item.id === selected);
  const annotationId = a?.id;
  useLayoutEffect(() => {
    const note = noteRef.current;
    if (!active || !note || !annotationId) return;
    const remembered = selectionMemory.current;
    if (remembered?.id === annotationId) {
      note.focus({ preventScroll: true });
      note.setSelectionRange(remembered.start, remembered.end, remembered.direction);
    }
    // Keep the actual node: a mobile drawer clears its ref when it unmounts.
    return () => onRememberSelection(note, annotationId);
  }, [active, annotationId, noteRef, selectionMemory, onRememberSelection]);
  return <div className={mobile ? s.drawerComments : s.commentLayout}>
    <Listbox aria-label="Annotations" className={s.commentList} selectedOptions={selected ? [selected] : []} onOptionSelect={(_, d) => onSelect(d.optionValue)}>
      {items.map((item, i) => <Option className={s.option} key={item.id} value={item.id} text={`${i + 1}. ${item.type}`}>
        <span className={s.optionContent}><span>{i + 1}. {item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
          <span className={s.eyebrow}>{item.note ? item.note.split('\n')[0].slice(0, 64) : 'No comment yet'}</span></span>
      </Option>)}
    </Listbox>
    {a ? <div className={s.commentEditor}>
      <div className={s.between}><Text weight="semibold">Annotation {items.indexOf(a) + 1} · {a.type}</Text>
        <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => onDelete(a.id)} disabled={stale}>Delete selected</Button></div>
      <Field label="Comment">
        <Textarea key={a.id} ref={noteRef} className={s.control} value={a.note} onFocus={onBeginEdit} onChange={(_, d) => onEdit(a.id, { note: d.value })}
          rows={3} resize="vertical" readOnly={stale} />
      </Field>
      <Disclosure title="Text, style & geometry">
        <div className={s.stack}>
          {a.anchor && <>
            <Text className={s.eyebrow}>Unique captured target · {a.anchor.matches} match</Text>
            <code className={s.code}>{a.anchor.selector}</code>
            <Disclosure title="Captured text and computed style"><pre className={s.code}>{JSON.stringify({ text: a.anchor.text, style: a.anchor.style }, null, 2)}</pre></Disclosure>
            <Field label="Suggested replacement text">
              <Textarea className={s.control} value={a.replacement || ''} onFocus={onBeginEdit} onChange={(_, d) => onEdit(a.id, { replacement: d.value })} rows={2} readOnly={stale} />
            </Field>
            <Field label="Suggested style change">
              <Input className={s.control} value={a.styleNote || ''} onFocus={onBeginEdit} onChange={(_, d) => onEdit(a.id, { styleNote: d.value })} readOnly={stale} />
            </Field>
          </>}
          <Text className={s.eyebrow}>Geometry in CSS pixels from the reviewed document root. Suggestions do not edit the source.</Text>
          <div className={s.geometry}>{(a.type === 'comment' ? ['x', 'y'] : ['x', 'y', 'w', 'h']).map(key =>
            <Field label={{ x: 'X', y: 'Y', w: 'Width', h: 'Height' }[key]} key={key}>
              <Input className={s.control} type="number" min={0} value={String(Math.round(a[key] || 0))} readOnly={stale} onFocus={onBeginEdit}
                onChange={(_, d) => { const n = Number(d.value); if (d.value !== '' && Number.isFinite(n) && n >= 0) onEdit(a.id, shapeFromBounds(a, { [key]: n })); }} />
            </Field>)}</div>
        </div>
      </Disclosure>
    </div> : <Text className={s.quiet}>Choose an annotation to edit its comment.</Text>}
  </div>;
}

function ReviewEditor({ active, onReturn, condition, onConditionReset, theme, onPrepared, onStaleChange }) {
  const s = useStyles();
  const [tool, setTool] = useState('select');
  const [items, setItems] = useState([]);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [selected, setSelected] = useState(null);
  const [targets, setTargets] = useState([]);
  const [targetKey, setTargetKey] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [targetCapture, setTargetCapture] = useState(null);
  const [draft, setDraft] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
  const [archives, setArchives] = useState([]);
  const [message, setMessage] = useState('');
  const [binding, setBinding] = useState(null);
  const wrapperRef = useRef(null), rootRef = useRef(null), scrollRef = useRef(null), noteRef = useRef(null);
  const counter = useRef(0), drag = useRef(null), itemsRef = useRef(items), sizeRef = useRef(null);
  const focusMemory = useRef(null), themeRef = useRef(theme), activeRef = useRef(active);
  const rememberSelection = useCallback((note, id) => {
    if (!note || !id) return;
    focusMemory.current = { id, start: note.selectionStart, end: note.selectionEnd, direction: note.selectionDirection };
  }, []);
  function changeCommentsOpen(open) {
    if (!open) rememberSelection(noteRef.current, selected);
    setCommentsOpen(open);
  }
  const stale = invalidated || condition === 'drift';
  itemsRef.current = items;
  activeRef.current = active;
  useEffect(() => { onStaleChange(stale); }, [stale, onStaleChange]);

  function sourceBinding() {
    const root = rootRef.current, box = root?.getBoundingClientRect();
    return { artifact: ARTIFACT, revision: REVISION, owner: OWNER, spec: SPEC, assets: SOURCE_ASSETS,
      snapshotReadAt: CURRENT.readAt, theme,
      viewport: { width: Math.round(box?.width || 0), height: Math.round(box?.height || 0) },
      scroll: { top: scrollRef.current?.scrollTop || 0, left: scrollRef.current?.scrollLeft || 0 },
      captureMode: 'DOM inspection only; no PNG capture, file hashes, or seal' };
  }
  function inspectTargets() {
    const root = rootRef.current;
    if (!root) return;
    setTargets([...root.querySelectorAll('[data-review-key]')].filter(el => visibleWithinDocument(el, root))
      .map(el => ({ key: el.getAttribute('data-review-key'),
        label: (el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 90) || 'Workspace control' })));
  }
  useLayoutEffect(() => {
    if (!active) return;
    const node = rootRef.current;
    const resize = new ResizeObserver(() => {
      if (!activeRef.current) return;
      const box = node.getBoundingClientRect();
      if (!box.width) return;
      const size = [Math.round(box.width), Math.round(box.height)];
      setMobile((wrapperRef.current?.clientWidth || box.width) <= 700);
      if (sizeRef.current && size.some((v, i) => v !== sizeRef.current[i]) && itemsRef.current.length) setInvalidated(true);
      sizeRef.current = size;
      inspectTargets();
    });
    resize.observe(node);
    const frame = requestAnimationFrame(() => {
      inspectTargets();
      if (!binding) setBinding(sourceBinding());
      // The editor restores its own range when mounted; a closed drawer stays closed.
      if (!commentsOpen) scrollRef.current?.focus({ preventScroll: true });
    });
    return () => { resize.disconnect(); cancelAnimationFrame(frame); };
  }, [active]);
  useEffect(() => {
    if (themeRef.current !== theme && itemsRef.current.length) setInvalidated(true);
    themeRef.current = theme;
  }, [theme]);
  useEffect(() => {
    if (condition === 'drift') setInvalidated(true);
  }, [condition]);

  const commit = next => {
    setPast(p => [...p, items]);
    setFuture([]);
    setItems(next);
    if (!items.length) setBinding(sourceBinding());
  };
  const beginEdit = () => { if (!stale) { setPast(p => [...p, itemsRef.current]); setFuture([]); } };
  const edit = (id, changes) => { if (!stale) setItems(all => all.map(a => a.id === id ? { ...a, ...changes } : a)); };
  const undo = () => {
    if (stale || !past.length) return;
    const restored = past[past.length - 1];
    setFuture(f => [items, ...f]); setItems(restored); setPast(p => p.slice(0, -1));
    if (!restored.some(a => a.id === selected)) setSelected(restored.at(-1)?.id || null);
    setMessage('Annotation change undone.');
  };
  const redo = () => {
    if (stale || !future.length) return;
    setPast(p => [...p, items]); setItems(future[0]); setFuture(f => f.slice(1));
    if (!future[0].some(a => a.id === selected)) setSelected(future[0].at(-1)?.id || null);
    setMessage('Annotation change restored.');
  };
  function selectTarget(key) {
    setTargetKey(key);
    setTargetQuery(targets.find(t => t.key === key)?.label || '');
    const el = rootRef.current?.querySelector(`[data-review-key="${CSS.escape(key)}"]`);
    const capture = anchorCapture(el, rootRef.current);
    setTargetCapture(capture);
    // Scroll only the outer document viewport; never change the frozen source's
    // internal list/layout after capturing its geometry.
    if (capture && scrollRef.current) {
      const viewport = scrollRef.current;
      if (capture.bounds.y < viewport.scrollTop) viewport.scrollTop = capture.bounds.y;
      else if (capture.bounds.y + capture.bounds.h > viewport.scrollTop + viewport.clientHeight)
        viewport.scrollTop = Math.max(0, capture.bounds.y + capture.bounds.h - viewport.clientHeight);
    }
  }
  function addAnnotation(shape, anchor = null) {
    if (stale) return;
    const id = `annotation-${++counter.current}`;
    commit([...items, { ...shape, id, note: '', anchor }]);
    setSelected(id);
    setMessage(`${shape.type} added. Tool remains ${tool}.`);
    if (shape.type === 'comment') {
      setCommentsOpen(true);
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  }
  const addComment = () => {
    const el = rootRef.current?.querySelector(`[data-review-key="${CSS.escape(targetKey)}"]`);
    const capture = anchorCapture(el, rootRef.current);
    if (!capture) { setMessage('Select one unique element before adding a comment.'); return; }
    addAnnotation({ type: 'comment', x: capture.bounds.x + Math.min(16, capture.bounds.w / 2), y: capture.bounds.y + Math.min(16, capture.bounds.h / 2) }, capture);
  };
  const remove = id => { if (!stale) { commit(items.filter(a => a.id !== id)); setSelected(items.find(a => a.id !== id)?.id || null); } };
  const point = e => {
    const b = rootRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) };
  };
  function targetAt(p) {
    const root = rootRef.current, base = root.getBoundingClientRect();
    return [...root.querySelectorAll('[data-review-key]')].reverse().find(el => {
      if (!visibleWithinDocument(el, root)) return false;
      const b = el.getBoundingClientRect();
      return p.x + base.left >= b.left && p.x + base.left <= b.right && p.y + base.top >= b.top && p.y + base.top <= b.bottom;
    });
  }
  function pointerDown(e) {
    if (stale || e.button !== 0 || !e.isPrimary) return;
    const p = point(e);
    if (tool === 'select' || tool === 'comment') {
      // Touch scrolling must not create a comment on pointerdown.
      drag.current = { kind: 'pick', tool, start: p, pointerId: e.pointerId };
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: p, pointerId: e.pointerId };
    setDraft(shapeBetween(tool, p, p));
  }
  function pointerMove(e) {
    if (drag.current?.pointerId === e.pointerId && drag.current.kind !== 'pick') setDraft(shapeBetween(tool, drag.current.start, point(e)));
  }
  function pointerUp(e) {
    if (drag.current?.pointerId !== e.pointerId) return;
    if (drag.current.kind === 'pick') {
      const gesture = drag.current, p = point(e);
      drag.current = null;
      if (stale || Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 8) return;
      if (gesture.tool === 'select') {
        const hit = [...items].reverse().find(a => shapeContains(a, p));
        if (hit) { setSelected(hit.id); setCommentsOpen(true); return; }
      }
      const el = targetAt(p);
      if (el) {
        selectTarget(el.getAttribute('data-review-key'));
        if (gesture.tool === 'comment') addAnnotation({ type: 'comment', x: p.x, y: p.y }, anchorCapture(el, rootRef.current));
      }
      return;
    }
    const shape = shapeBetween(tool, drag.current.start, point(e));
    if (Math.hypot(shape.w, shape.h) >= 4) addAnnotation(shape);
    drag.current = null; setDraft(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function keyboard(e) {
    if (e.target.closest('input,textarea,[contenteditable="true"],[role="combobox"]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { setTool('select'); drag.current = null; setDraft(null); return; }
    if (e.key === 'Delete' && selected) { e.preventDefault(); remove(selected); return; }
    if (e.target.closest('button,[role="listbox"],[role="option"],[role="menuitem"]')) return;
    const match = TOOLS.find(t => t[3].toLowerCase() === e.key.toLowerCase());
    if (match) { e.preventDefault(); setTool(match[0]); }
  }
  function returnToWorkspace() {
    rememberSelection(noteRef.current, selected);
    onReturn();
  }
  function prepareFeedback() {
    if (!items.length) { setMessage('Add a comment or drawing before preparing feedback.'); return; }
    if (stale) { setMessage('Source binding changed. Old markup cannot be prepared for the new view.'); return; }
    const root = rootRef.current;
    for (const a of items) {
      if (a.x < 0 || a.y < 0 || a.x + (a.w || 0) > root.clientWidth || a.y + (a.h || 0) > root.clientHeight) {
        setSelected(a.id); setCommentsOpen(true);
        setMessage('The selected annotation extends beyond the reviewed document. Adjust its geometry before preparing feedback.');
        return;
      }
      if (!a.anchor) continue;
      const matches = root.querySelectorAll(`[data-review-key="${CSS.escape(a.anchor.key)}"]`);
      if (matches.length !== 1 || matches[0].textContent !== a.anchor.text) { setInvalidated(true); return; }
    }
    const noComment = items.find(a => a.type === 'comment' && !a.note.trim() && !a.replacement?.trim() && !a.styleNote?.trim());
    if (noComment) { setSelected(noComment.id); setCommentsOpen(true); setMessage('Add a comment or a text/style suggestion for the selected annotation.'); return; }
    onPrepared({ title: condition === 'capture' ? 'Capture failed · markup retained' : 'Feedback prepared',
      description: 'Semantic markup is retained in this tab. This static artifact cannot capture a source-aligned PNG, seal evidence, or send feedback. The owner would need both the report and actual image; this is not a completed submission or approval.',
      report: `Requested change: revise ${ARTIFACT} (${REVISION}). Do not treat this feedback as approval or production-edit authority.\n\n` +
        items.map((a, i) => `${i + 1}. ${a.type}\n${a.note || '(Drawing feedback)'}${a.replacement ? `\nSuggested text: ${a.replacement}` : ''}${a.styleNote ? `\nSuggested style: ${a.styleNote}` : ''}${a.anchor ? `\nTarget: ${a.anchor.selector}` : `\nDocument geometry: ${a.x}, ${a.y}; ${a.w} × ${a.h}`}`).join('\n\n'),
      payload: { class: 'preview', decision: 'request_revision', binding, viewed: sourceBinding(), annotations: items } });
  }
  function freshReview() {
    if (items.length) setArchives(a => [...a, { binding, annotations: items }]);
    setItems([]); setPast([]); setFuture([]); setSelected(null); setTargetCapture(null);
    setTargetKey(''); setTargetQuery(''); setInvalidated(false); setBinding(sourceBinding()); onConditionReset();
    setMessage('Fresh local review started. Previous markup remains historical and was not retargeted.');
  }
  const inspector = <AnnotationInspector items={items} selected={selected} onSelect={setSelected}
    onEdit={edit} onBeginEdit={beginEdit} onDelete={remove} noteRef={noteRef} selectionMemory={focusMemory}
    onRememberSelection={rememberSelection} active={active && commentsOpen} stale={stale} mobile={mobile} />;
  return <section ref={wrapperRef} className={mergeClasses(s.review, !active && s.hidden)} aria-label="Review editor" onKeyDown={keyboard}>
    <div className={mergeClasses(s.between, s.reviewTitle)}>
      <div className={s.row}><Button icon={<ArrowLeftRegular />} onClick={returnToWorkspace}>Back to workspace</Button>
        <div className={s.tight}><Text weight="semibold">Needs You workspace</Text><Text className={s.eyebrow}>Review · {REVISION} · markup in this tab</Text></div></div>
      <Button appearance="primary" onClick={prepareFeedback} disabled={stale}>Prepare feedback</Button>
    </div>
    <Toolbar aria-label="Drawing tools" className={s.drawingToolbar} checkedValues={{ tool: [tool] }}
      onCheckedValueChange={(_, d) => { if (d.name === 'tool') setTool(d.checkedItems[0] || 'select'); }}>
      <ToolbarRadioGroup aria-label="Drawing tool" className={s.drawingTools}>
        {TOOLS.map(([key, label, Icon, shortcut]) => <Tooltip key={key} content={`${label} (${shortcut})`} relationship="description">
          <ToolbarRadioButton className={s.toolButton} name="tool" value={key} icon={<Icon />} aria-label={label} disabled={stale}>
            <span className={s.toolLabel}>{label}</span>
          </ToolbarRadioButton>
        </Tooltip>)}
      </ToolbarRadioGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <Tooltip content="Undo annotation change (Ctrl/Cmd+Z)" relationship="description"><ToolbarButton icon={<ArrowUndoRegular />} aria-label="Undo annotation change" onClick={undo} disabled={!past.length || stale} /></Tooltip>
        <Tooltip content="Redo annotation change (Ctrl/Cmd+Shift+Z)" relationship="description"><ToolbarButton icon={<ArrowRedoRegular />} aria-label="Redo annotation change" onClick={redo} disabled={!future.length || stale} /></Tooltip>
      </ToolbarGroup>
      <div className={s.grow} />
      <ToolbarButton icon={<CommentRegular />} onClick={() => changeCommentsOpen(!commentsOpen)}>Comments ({items.length})</ToolbarButton>
    </Toolbar>
    {stale ? <Notice className={s.notice} intent="warning" title="Source binding changed">
      Old markup is retained and cannot be applied to this view. <Button size="small" onClick={freshReview}>Start fresh review</Button>
    </Notice> : condition === 'capture' ? <Notice className={s.notice} intent="warning" title="Capture failure example">
      Markup stays editable. No valid PNG means no submission.
    </Notice> : condition === 'sealed' ? <div className={s.notice}><Disclosure title="Sealed evidence example · no files created">
      <div className={s.stack}><Text>A submitted report and PNG would be immutable, with provenance written last. Reopening them would restore evidence, not a live request.</Text>
        <code className={s.code}>{'<exact target spec>/reviews/<provider-allocated-id>/{report.md, annotated.png, provenance.json}'}</code>
        <Text className={s.eyebrow}>This is a contract illustration, not a claimed seal, image, file link, or delivery receipt.</Text></div>
    </Disclosure></div> : null}
    <div className={s.picker}>
      <Field label="Choose an element" className={s.pickerField}>
        <Combobox className={s.control} placeholder="Search visible elements" value={targetQuery} selectedOptions={targetKey ? [targetKey] : []}
          onChange={e => { setTargetQuery(e.target.value); setTargetKey(''); setTargetCapture(null); }}
          onOptionSelect={(_, d) => d.optionValue && selectTarget(d.optionValue)} disabled={stale}>
          {targets.filter(t => !targetQuery || targetKey || t.label.toLowerCase().includes(targetQuery.toLowerCase())).map(t =>
            <Option key={t.key} value={t.key} text={t.label}>{t.label}</Option>)}
        </Combobox>
      </Field>
      <Button icon={<AddRegular />} disabled={!targetKey || stale} onClick={addComment}>Add comment</Button>
      {!['select', 'comment'].includes(tool) && <Button disabled={stale} onClick={() => {
        const w = rootRef.current.clientWidth;
        addAnnotation(shapeBetween(tool, { x: w / 4, y: 120 }, { x: Math.min(w - 16, w * 3 / 4), y: 220 }));
        setCommentsOpen(true);
      }}>Add {tool} at center</Button>}
    </div>
    <div ref={scrollRef} className={s.canvasScroll} tabIndex={0} aria-label="Reviewed workspace document. Use drawing tools or Choose an element to annotate.">
      <div className={mergeClasses(s.canvas, !['select', 'comment'].includes(tool) ? s.drawMode : s.selectMode)}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { drag.current = null; setDraft(null); }}>
        <div ref={rootRef} id="review-document" className={s.document} inert aria-hidden="true"><WorkspaceDocument /></div>
        <svg aria-hidden="true" className={s.overlay}>
          {targetCapture && !stale && <rect className={s.target} x={targetCapture.bounds.x} y={targetCapture.bounds.y} width={targetCapture.bounds.w} height={targetCapture.bounds.h} />}
          {items.map((a, index) => <AnnotationShape key={a.id} annotation={a} index={index} />)}
          {items.filter(a => a.id === selected).map(a => <rect key={`selection-${a.id}`} className={s.target}
            x={a.type === 'comment' ? a.x - 16 : a.x - 4} y={a.type === 'comment' ? a.y - 16 : a.y - 4}
            width={a.type === 'comment' ? 32 : a.w + 8} height={a.type === 'comment' ? 32 : a.h + 8} />)}
          {draft && <AnnotationShape annotation={draft} index={items.length} />}
        </svg>
      </div>
    </div>
    {commentsOpen && !mobile && <section className={s.comments} aria-label="Comments">
      <div className={mergeClasses(s.between, s.footer)}><Text weight="semibold">Annotations</Text>
        <Button appearance="subtle" icon={<DismissRegular />} aria-label="Hide comments" onClick={() => changeCommentsOpen(false)} /></div>
      {items.length ? inspector : <div className={s.empty}>Select an element and add a comment, or draw on the workspace.</div>}
    </section>}
    <OverlayDrawer open={active && commentsOpen && mobile} onOpenChange={(_, d) => changeCommentsOpen(d.open)} position="end" className={s.drawer}>
      <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close comments" onClick={() => changeCommentsOpen(false)} />}>Annotations</DrawerHeaderTitle></DrawerHeader>
      <DrawerBody className={s.drawerBody}>{items.length ? inspector : <Text>Select an element and add a comment, or draw on the workspace.</Text>}</DrawerBody>
    </OverlayDrawer>
    <div className={s.footer}>
      <Text className={s.eyebrow}>{message || `${tool.charAt(0).toUpperCase() + tool.slice(1)} tool · Choose an element is the keyboard alternative to pointing. Native text Undo stays in the text field.`}</Text>
      <Disclosure title="Review source & retained history">
        <div className={s.stack}><pre className={s.code}>{JSON.stringify(binding, null, 2)}</pre>
          <Text className={s.eyebrow}>This is a frozen rendering of the proposal’s own workspace components. No faithful-page PNG or source hash is claimed. Resize or theme drift invalidates existing coordinates.</Text>
          {archives.map((archive, i) => <Disclosure key={i} title={`Historical local markup ${i + 1} · not retargeted`}><pre className={s.code}>{JSON.stringify(archive, null, 2)}</pre></Disclosure>)}
        </div>
      </Disclosure>
    </div>
    <div role="status" aria-live="polite" className={s.live}>{message}</div>
  </section>;
}

function App() {
  const s = useStyles();
  const viewId = useId();
  const [settings, setSettings] = useState({ snapshot: 'workspace', mode: 'actual', theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    width: 'fluid', coverage: 'actual', response: 'current', permission: 'missing', review: 'editing' });
  // The chosen repository context and the workspace-wide request view are
  // independent. Browse candidate/query state lives entirely in its dialog.
  const [contextId, setContextId] = useState(CURRENT.selected?.explicit ? CURRENT.selected.ideaPath : null);
  const [view, setView] = useState(confirmedBlank(CURRENT) ? 'new' : 'context');
  const [requestId, setRequestId] = useState(null);
  const [requestQuery, setRequestQuery] = useState('');
  const [browseOpen, setBrowseOpen] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [details, setDetails] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [intentDialog, setIntentDialog] = useState(null);
  const [approval, setApproval] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMounted, setReviewMounted] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reviewStale, setReviewStale] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const detailRef = useRef(null), entryRef = useRef(null), detailScroll = useRef(0);
  const snapshot = SNAPSHOTS[settings.snapshot], projection = snapshot.projection;
  const context = projection.contexts.find(c => c.ideaPath === contextId);
  const request = settings.mode === 'examples' && settings.coverage !== 'current' && view === 'request'
    ? EXAMPLES.find(r => r.id === requestId) : null;
  const draftKey = view === 'new' ? 'new' : request?.id;
  const value = drafts[draftKey] || {};
  const updateDraft = next => { if (draftKey) setDrafts(all => ({ ...all, [draftKey]: next })); };
  const requestContext = request?.contextPath ? CURRENT.contexts.find(c => c.ideaPath === request.contextPath) : null;

  const openReview = () => {
    entryRef.current = document.activeElement;
    detailScroll.current = detailRef.current?.scrollTop || 0;
    setReviewMounted(true); setReviewOpen(true); setReviewed(true);
  };
  const returnReview = () => {
    setReviewOpen(false);
    requestAnimationFrame(() => {
      if (detailRef.current) detailRef.current.scrollTop = detailScroll.current;
      entryRef.current?.focus({ preventScroll: true });
    });
  };
  function focusWorkspace() {
    requestAnimationFrame(() => {
      detailRef.current?.focus({ preventScroll: true });
      if (detailRef.current) detailRef.current.scrollTop = 0;
    });
  }
  function commitContext(id) {
    if (inventoryUnavailable(projection) || !projection.contexts.some(c => c.ideaPath === id)) return;
    setContextId(id); setView('context');
    if (detailRef.current) detailRef.current.scrollTop = 0;
    // Opening a context is navigation only; previously entered answers remain
    // keyed to their original request and are never applied to this context.
  }
  function openNeeds() {
    setView('needs'); focusWorkspace();
  }
  function openRequest(id) {
    if (!EXAMPLES.some(r => r.id === id)) return;
    setRequestId(id); setView('request'); focusWorkspace();
  }
  function newIdea() {
    setView('new'); setContextId(null); focusWorkspace();
  }
  function changeSetting(key, val) {
    setSettings(old => ({ ...old, [key]: val, ...(key === 'response' ? { mode: 'examples' } : {}) }));
    if (key === 'snapshot') {
      setReviewOpen(false); setBrowseOpen(false); setRequestQuery('');
      const p = SNAPSHOTS[val].projection;
      setContextId(p.selected?.explicit ? p.selected.ideaPath : null);
      setView(confirmedBlank(p) ? 'new' : 'context');
      focusWorkspace();
    }
    if (key === 'mode') {
      setReviewOpen(false); setRequestQuery(''); openNeeds();
    }
    if (key === 'response') {
      setReviewOpen(false); openRequest(requestId || 'preview');
    }
    if (key === 'coverage' && val === 'current' && view === 'request') {
      setView('needs');
    }
    // Literal permission is bound to the scenario's exact target, never reused.
    if (key === 'permission') setDrafts(all => ({ ...all, permission: { ...all.permission, phrase: '' } }));
    if (key === 'review' && val === 'drift') setReviewStale(true);
    if ((key === 'width' || key === 'theme') && reviewMounted) {
      setSettings(old => ({ ...old, review: 'drift' }));
      setReviewStale(true); setReviewed(false);
    }
  }
  const coverageNotice = settings.coverage === 'actual'
    ? settings.mode === 'examples'
      ? 'Request examples are enabled, separate from the snapshot. Needs you opens them; input and markup stay in this tab.'
      : 'Live requests are unavailable. You can browse recorded ideas, draft input, and review this layout.'
    : { loading: 'Example: refreshing coverage. The last readable inventory and unsent input remain available.',
      current: 'Example: no current requests in a fully read scope. Captured ideas and recorded dispositions remain discoverable.',
      partial: 'Example: one source scope could not be read. Healthy contexts remain available; this is not an all-clear.',
      stale: 'Example: the selected source is stale. Preserve input and get fresh owner context before acting.',
      unavailable: 'Example: live coverage was lost. Saved sources remain readable; pending-session requests are not restored.' }[settings.coverage];
  return <FluentProvider theme={THEMES[settings.theme]} applyStylesToPortals={false}>
    <div className={mergeClasses(s.page, s.app)}>
      <header className={s.titlebar}><div className={s.row}><DocumentRegular /><Text weight="semibold">Dude Canvas</Text></div>
        <Text className={s.eyebrow}>{settings.mode === 'examples' ? 'Example requests' : snapshot.fixture ? 'Fixture preview' : 'Repository snapshot'} · Design study {REVISION}</Text></header>
      <div className={mergeClasses(s.viewport, settings.width !== 'fluid' && s[`width${settings.width}`])}>
        <section className={mergeClasses(s.product, reviewOpen && s.hidden)} aria-label="Needs you workspace">
          <CommandBar view={view} viewId={viewId} hasContext={!!context} onContext={() => commitContext(contextId)}
            onNeeds={openNeeds} onNew={newIdea} onRefresh={() => {
            setRefreshMessage('Loaded snapshot reread. No live read was performed; selection and unsent input are unchanged.');
          }} onDetails={() => setDetails(true)} />
          <ContextBar projection={projection} selected={contextId} onCommit={commitContext} onBrowse={() => setBrowseOpen(true)} />
          <Notice className={s.notice} title={settings.coverage === 'loading' ? <Spinner size="tiny" label="Loading example" /> : undefined}>
            {refreshMessage || coverageNotice}
          </Notice>
          <main ref={detailRef} tabIndex={-1} className={s.detail}>
            <WorkspaceViewPanels view={view} viewId={viewId} hasContext={!!context}>
            <div className={s.stack}>
              {view === 'request' && <Button className={s.back} icon={<ArrowLeftRegular />} onClick={openNeeds}>Back to Needs you</Button>}
              {view === 'new' ? <NewIdea value={value} onChange={updateDraft} onPrepared={setPrepared} onDefer={() => setIntentDialog('defer')} />
                : request ? <RequestForm key={`${request.id}-${settings.permission}`} request={request} value={value} onChange={updateDraft}
                  responseState={settings.response} permission={settings.permission} reviewCondition={settings.review}
                  onReview={openReview} onApprove={() => setApproval(true)} onPrepared={setPrepared}
                  onDefer={() => setIntentDialog('defer')} />
                  : view === 'context' ? inventoryUnavailable(projection) ? <Notice intent="error" title="Workspace inventory unavailable">
                    The source cannot establish a current context. This is not a blank workspace.
                  </Notice> : <ContextDetail context={context} projection={projection} onReview={openReview}
                    onDetails={() => setDetails(true)} reviewCondition={settings.review} />
                    : <NeedsYou examples={settings.mode === 'examples'} noRequestsExample={settings.coverage === 'current'}
                      query={requestQuery} onQuery={setRequestQuery} selected={requestId} onSelect={openRequest}
                      drafts={drafts} responseState={settings.response} />}
            </div>
            </WorkspaceViewPanels>
          </main>
          {hasInput(drafts.new) && view !== 'new' && <div className={s.footer}><Button appearance="subtle" icon={<LightbulbRegular />} onClick={newIdea}>Return to unsaved idea</Button></div>}
        </section>
        {reviewMounted && <ReviewEditor active={reviewOpen} onReturn={returnReview} condition={settings.review}
          onConditionReset={() => { setSettings(old => ({ ...old, review: 'editing' })); setReviewStale(false); }}
          theme={settings.theme} onPrepared={setPrepared} onStaleChange={setReviewStale} />}
      </div>
      <PreviewHarness settings={settings} onChange={(key, val) => { setRefreshMessage(''); changeSetting(key, val); }} onNewExample={() => { setReviewOpen(false); newIdea(); }} />
      <BrowseDialog open={browseOpen} onClose={() => setBrowseOpen(false)} onCommit={commitContext}
        projection={projection} selected={contextId} previewWidth={settings.width} />
      <DetailsDrawer open={details} onOpenChange={setDetails} context={request ? requestContext : view === 'context' ? context : null}
        request={request} projection={projection} snapshot={snapshot} />
      <PreparationDialog result={prepared} onClose={() => setPrepared(null)} />
      {intentDialog && <IntentDialog kind={intentDialog} text={value.intent} sourceBacked={view !== 'new' && request?.id !== 'onboarding'}
        onClose={() => setIntentDialog(null)} onSave={() => setIntentDialog('save')} onPrepared={setPrepared} />}
      {approval && <ApprovalDialog onClose={() => setApproval(false)} onPrepared={setPrepared} reviewed={reviewed}
        stale={reviewStale || settings.review === 'drift'} />}
    </div>
  </FluentProvider>;
}

createRoot(document.getElementById('root')).render(SNAPSHOT_ERROR ? <SnapshotLoadFailure /> : <App />);

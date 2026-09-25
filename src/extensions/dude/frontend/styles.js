import { makeStyles, tokens } from '@fluentui/react-components';
export { mergeClasses } from '@fluentui/react-components';

// The shortest vertical palette that still works: one complete 36px tool slot
// with room for its focus ring, beside the fixed 24px grip, the 36px
// orientation switch, their two gaps, the palette padding, and its borders.
const TOOLS_COLUMN_FLOOR = `calc(40px + 24px + 36px + 4 * ${tokens.spacingHorizontalXXS} + 2 * ${tokens.strokeWidthThin})`;

// The approved workspace composition. Fluent owns color, type and spacing;
// numbers below are responsive geometry and minimum interaction sizes.
export const useCanvasStyles = makeStyles({
  page: {
    minHeight: '100dvh', backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    '@media (prefers-reduced-motion: reduce)': {
      '& *, & *::before, & *::after': { animationDuration: '0s', transitionDuration: '0s', scrollBehavior: 'auto' },
    },
  },
  app: { display: 'flex', flexDirection: 'column', height: '100dvh', minWidth: 0 },
  titlebar: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexShrink: 0,
    paddingInlineEnd: tokens.spacingHorizontalM,
    borderInlineEnd: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  workspaceLabel: {
    color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200,
    '@media (max-width: 960px)': { display: 'none' },
  },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500, fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere' },
  subheading: { margin: 0, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, fontWeight: tokens.fontWeightSemibold },
  eyebrow: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, overflowWrap: 'anywhere' },
  quiet: { color: tokens.colorNeutralForeground2 },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', minWidth: 0 },
  between: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  tight: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, minWidth: 0 },
  grow: { flexGrow: 1, minWidth: 0 },
  commands: {
    position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0, minWidth: 0,
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 719px)': { gap: tokens.spacingHorizontalS, paddingInline: tokens.spacingHorizontalS },
  },
  refresh: { marginInlineStart: 'auto', flexShrink: 0, padding: 0 },
  refreshButton: { '@media (max-width: 719px)': { minWidth: '32px', width: '32px', minHeight: '32px', height: '32px', padding: 0 } },
  refreshLabel: {
    '@media (max-width: 719px)': {
      position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
    },
  },
  shellBody: {
    display: 'flex', flex: 1, minWidth: 0, minHeight: 0,
  },
  rail: {
    boxSizing: 'border-box', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
    width: '48px', minHeight: 0, flexShrink: 0, gap: tokens.spacingVerticalL, paddingBlock: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderInlineEnd: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  railExpanded: {
    width: '208px', alignItems: 'stretch', paddingInline: tokens.spacingHorizontalS,
    '& > button': { alignSelf: 'flex-start' },
  },
  railToggle: { flexShrink: 0, width: '32px', minWidth: '32px', height: '32px', padding: 0 },
  railContents: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, width: '100%' },
  railList: { padding: 0, flex: 1, minHeight: 0, minWidth: 0, width: '100%' },
  railDestinations: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0,
    overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none',
    padding: tokens.spacingHorizontalXXS, gap: tokens.spacingVerticalXS,
  },
  railFooter: {
    display: 'flex', justifyContent: 'center', flexShrink: 0, marginTop: 'auto',
    marginInline: tokens.spacingHorizontalXS, paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  railTab: {
    boxSizing: 'border-box', width: '32px', minWidth: '32px', height: '32px', minHeight: '32px', padding: 0,
    justifyContent: 'center', flexShrink: 0,
  },
  railTabExpanded: {
    width: '100%', justifyContent: 'flex-start', paddingInline: tokens.spacingHorizontalS,
  },
  railLabel: {
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  navLayer: { position: 'fixed', inset: 0, zIndex: 1000001 },
  navDimmer: { position: 'fixed', inset: 0, backgroundColor: tokens.colorBackgroundOverlay },
  navOverlay: {
    position: 'relative', boxSizing: 'border-box', width: '260px', maxWidth: 'calc(100vw - 16px)',
    height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    padding: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow16,
  },
  navHeading: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS, paddingBottom: tokens.spacingVerticalS, flexShrink: 0,
  },
  product: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, containerType: 'inline-size' },
  detail: {
    flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable',
    backgroundColor: tokens.colorNeutralBackground1, padding: tokens.spacingHorizontalXXL,
    '@container (max-width: 700px)': { padding: tokens.spacingHorizontalL },
  },
  measure: { maxWidth: '76ch', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  overviewPanel: { padding: 0, scrollbarGutter: 'auto', '@container (max-width: 700px)': { padding: 0 } },
  settingsPanel: { padding: 0, overflow: 'hidden', scrollbarGutter: 'auto', '@container (max-width: 700px)': { padding: 0 } },
  packLayout: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', height: '100%', minHeight: 0, minWidth: 0 },
  packLayoutSelected: {
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    '@media (max-width: 1099px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  packBrowser: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, containerType: 'inline-size' },
  packHeading: {
    display: 'flex', alignItems: 'center', flexShrink: 0, gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    '& h1:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
    '@media (max-width: 479px)': { padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}` },
  },
  packScope: { '@media (max-width: 479px)': { position: 'absolute', clipPath: 'inset(50%)', width: '1px', height: '1px', overflow: 'hidden' } },
  packTabs: { flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', maxWidth: '360px', minWidth: 0 },
  packTab: {
    minWidth: 0, minHeight: '36px', padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, justifyContent: 'center',
    '& > span': { minWidth: 0 },
    '@container (max-width: 300px)': { paddingInline: tokens.spacingHorizontalXXS, minHeight: '32px' },
  },
  packTabCount: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  packPanel: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 },
  packToolbar: {
    // The inline Fluent listbox must paint above the sticky table header.
    position: 'relative', zIndex: 2,
    display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexShrink: 0, minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@container (max-width: 479px)': {
      padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    },
  },
  packFilterField: {
    display: 'grid', gridTemplateColumns: 'minmax(80px, 1fr) minmax(0, 280px)', alignItems: 'center',
    columnGap: tokens.spacingHorizontalS, flex: '1 1 540px', minWidth: 0, maxWidth: '660px',
    '& label': { padding: 0, margin: 0, fontWeight: tokens.fontWeightSemibold },
    '@container (max-width: 479px)': {
      gridTemplateColumns: 'minmax(0, 1fr)', gap: tokens.spacingVerticalXS,
      '& label': { minHeight: '32px', display: 'flex', alignItems: 'center', fontSize: tokens.fontSizeBase200, paddingRight: '52px' },
    },
  },
  packFilter: {
    minWidth: 0, width: '100%',
    '& button': { minWidth: 0 },
    '@container (max-width: 300px)': { '& button': { paddingInline: tokens.spacingHorizontalXS } },
  },
  packClear: {
    flexShrink: 0, minWidth: 0,
    '@container (max-width: 479px)': { position: 'absolute', top: tokens.spacingVerticalXS, right: tokens.spacingHorizontalS, paddingInline: tokens.spacingHorizontalS },
  },
  packScroll: { flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain' },
  packTableHeader: {
    position: 'sticky', top: 0, zIndex: 1, backgroundColor: tokens.colorNeutralBackground2,
    '& [role="columnheader"]': { paddingBlock: 0, color: tokens.colorNeutralForeground2 },
    '@container (max-width: 479px)': { position: 'absolute', clipPath: 'inset(50%)', width: '1px', height: '1px', overflow: 'hidden' },
  },
  packRow: {
    cursor: 'pointer', minHeight: '44px',
    '@container (max-width: 479px)': { flexDirection: 'column', alignItems: 'stretch', paddingBlock: tokens.spacingVerticalXS },
  },
  packCell: {
    boxSizing: 'border-box', flex: '1 1 0px', minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`, overflowWrap: 'anywhere',
    '@container (max-width: 479px)': { flex: 'auto', minHeight: 0, padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}` },
  },
  packNameCell: {
    flexBasis: '45%', flexGrow: 0, color: tokens.colorBrandForeground2,
    '@container (max-width: 479px)': { flexBasis: 'auto', minHeight: '28px' },
  },
  packTagsCell: {
    color: tokens.colorNeutralForeground2,
    '@container (max-width: 479px)': { '& > span': { fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 } },
  },
  packReadNotice: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, margin: 0,
    padding: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere',
  },
  packPager: {
    display: 'flex', alignItems: 'center', flexShrink: 0, gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`, minWidth: 0,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2,
    '@container (max-width: 479px)': { paddingInline: tokens.spacingHorizontalS, gap: tokens.spacingHorizontalXS },
  },
  packMetrics: {
    flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'center',
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, overflowWrap: 'anywhere',
  },
  packPageButton: { flexShrink: 0, '@container (max-width: 479px)': { width: '28px', minWidth: '28px', paddingInline: tokens.spacingHorizontalXXS } },
  packPageLabel: { '@container (max-width: 479px)': { display: 'none' } },
  packDetail: {
    position: 'static', margin: 0, padding: 0, boxSizing: 'border-box', width: '320px', height: '100%', maxHeight: 'none',
    minWidth: 0, minHeight: 0, maxWidth: 'none', overflow: 'hidden', color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1, border: 0, borderInlineStart: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '&[open]': { display: 'flex', flexDirection: 'column' },
    '&:modal': {
      position: 'fixed', inset: '0 0 0 auto', width: 'min(420px, calc(100vw - 16px))', height: '100dvh',
      border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStrokeAccessible}`, boxShadow: tokens.shadow16,
    },
    '&::backdrop': { backgroundColor: tokens.colorBackgroundOverlay },
    '@media (max-width: 1099px)': {
      position: 'fixed', inset: '0 0 0 auto', width: 'min(420px, calc(100vw - 16px))', height: '100dvh',
    },
  },
  packRequestDialog: {
    padding: 0, boxSizing: 'border-box', width: 'min(560px, calc(100vw - 16px))',
    maxWidth: 'none', maxHeight: 'calc(100dvh - 16px)', overflow: 'hidden',
    color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStrokeAccessible}`,
    borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16,
    '&[open]': { display: 'flex', flexDirection: 'column' },
    '&::backdrop': { backgroundColor: tokens.colorBackgroundOverlay },
  },
  packDetailHeader: {
    display: 'flex', alignItems: 'flex-start', flexShrink: 0, gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '& h2': { overflowWrap: 'anywhere' },
  },
  packDetailBody: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL,
    flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: tokens.spacingHorizontalM,
    '&:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  packDetailFooter: { flexShrink: 0, padding: tokens.spacingHorizontalS, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  packMetadata: {
    margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: tokens.spacingVerticalXS,
    '& dt': { color: tokens.colorNeutralForeground2 },
    '& dd': { margin: 0, minWidth: 0, overflowWrap: 'anywhere' },
    '& dd + dt': { marginTop: tokens.spacingVerticalS },
  },
  packMetadataHeading: { margin: 0, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300, fontWeight: tokens.fontWeightSemibold },
  packFiles: {
    '& summary': { cursor: 'pointer', minHeight: '28px', color: tokens.colorBrandForeground1 },
    '& summary:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
    '& ul': { paddingInlineStart: tokens.spacingHorizontalXL, marginBlock: tokens.spacingVerticalS },
    '& li + li': { marginTop: tokens.spacingVerticalXS },
  },
  settingsFooter: { maxHeight: '20dvh', overflowY: 'auto', overflowWrap: 'anywhere' },
  overview: { width: '100%', height: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' },
  overviewHeader: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalL, flexShrink: 0 },
  overviewIntro: { margin: 0, maxWidth: '85ch', color: tokens.colorNeutralForeground2, overflowWrap: 'anywhere' },
  selector: {
    position: 'relative', flex: '1 1 440px', minWidth: 0, maxWidth: '620px',
    '@media (max-width: 719px)': { position: 'static' },
  },
  workingOn: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0,
    boxSizing: 'border-box', minHeight: '32px', paddingInline: tokens.spacingHorizontalS,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `${tokens.strokeWidthThicker} solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1,
  },
  workingIdentity: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  workingCaption: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase100 },
  workingNumber: { lineHeight: tokens.lineHeightBase200 },
  workingTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, lineHeight: tokens.lineHeightBase200 },
  workControls: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0,
    '@media (max-width: 479px)': { flexWrap: 'wrap', '& > :first-child': { flexBasis: '100%' } },
  },
  searchField: { flex: 1, minWidth: 0 },
  scopeField: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0, flexShrink: 0,
    '& label': { padding: 0, margin: 0, fontSize: tokens.fontSizeBase200 },
  },
  scopeSelect: { minWidth: 0, width: '88px' },
  finderPopup: {
    position: 'absolute', top: `calc(100% + ${tokens.spacingVerticalS})`, insetInlineStart: 0, zIndex: 20,
    display: 'flex', width: 'min(620px, calc(100vw - 200px))', maxHeight: 'min(560px, 60dvh)',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium, boxShadow: tokens.shadow16,
    '@media (max-width: 719px)': {
      insetInline: tokens.spacingHorizontalL, width: 'auto', top: '100%',
    },
  },
  workResults: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 },
  workSummary: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, flexShrink: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  workScroll: {
    flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', minHeight: 0, minWidth: 0,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  workName: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalM, minWidth: 0, overflowWrap: 'anywhere' },
  workNumber: {
    flexShrink: 0, minWidth: '3ch', fontFamily: tokens.fontFamilyMonospace,
    fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1,
  },
  workHeader: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: tokens.colorNeutralBackground2 },
  workCell: { paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS, overflowWrap: 'anywhere' },
  workRow: { cursor: 'pointer' },
  workSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    boxShadow: `inset 3px 0 ${tokens.colorBrandStroke1}`,
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Selected },
    '& [data-work-number]': { color: tokens.colorBrandForeground2 },
  },
  workItem: {
    minHeight: '48px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '&:last-child': { borderBottomWidth: 0 },
  },
  workItemText: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: 0, flexGrow: 1 },
  columnName: { flex: '2.6 1 0px' },
  columnStatus: { flex: '1 1 0px' },
  columnProgress: { flex: '1.2 1 0px' },
  progressCell: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: 0, width: '100%' },
  cellLayout: { minWidth: 0, width: '100%', whiteSpace: 'normal' },
  detailHeader: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  lead: { margin: 0, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400 },
  prose: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  instruction: {
    margin: 0, padding: tokens.spacingHorizontalL, backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium, fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
  },
  contextView: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, minWidth: 0 },
  contextGrid: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: tokens.spacingHorizontalXXL,
    alignItems: 'start', minWidth: 0,
    '@media (max-width: 1079px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  contextMain: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXL, minWidth: 0 },
  objectHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL, minWidth: 0,
    '& > div': { minWidth: 0 },
  },
  objectTitle: {
    display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalM, margin: 0,
    fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700, fontWeight: tokens.fontWeightSemibold,
    overflowWrap: 'anywhere', minWidth: 0,
    '& > span:last-child': { minWidth: 0 },
    '@media (max-width: 719px)': { fontSize: tokens.fontSizeBase600, lineHeight: tokens.lineHeightBase600, gap: tokens.spacingHorizontalS },
  },
  nextRegion: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0,
    padding: tokens.spacingHorizontalL, borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `${tokens.strokeWidthThicker} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    '& > p, & > div': { maxWidth: '85ch' },
  },
  contextSection: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0,
    '& > p': { maxWidth: '85ch' },
  },
  contextDock: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, minWidth: 0,
    paddingInlineStart: tokens.spacingHorizontalL,
    borderInlineStart: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 1079px)': {
      paddingInlineStart: 0, borderInlineStartWidth: 0,
      borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalL,
    },
  },
  propertySection: {
    minWidth: 0,
    '& > summary': {
      cursor: 'pointer', minHeight: '32px', paddingBlock: tokens.spacingVerticalXS,
      fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere',
    },
    '& > summary:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
    '& > summary + *': { marginTop: tokens.spacingVerticalS },
  },
  taskFilters: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS },
  taskCount: { fontVariantNumeric: 'tabular-nums', marginInlineStart: tokens.spacingHorizontalXS },
  taskPhase: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, minWidth: 0 },
  taskLabel: {
    margin: 0, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300,
    fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere',
  },
  taskRows: { listStyleType: 'none', margin: 0, padding: 0, minWidth: 0 },
  taskRow: {
    display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', alignItems: 'start',
    gap: tokens.spacingHorizontalS, width: '100%', minWidth: 0, minHeight: '48px', textAlign: 'start',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid transparent`,
    borderBottomColor: tokens.colorNeutralStroke2, borderRadius: tokens.borderRadiusNone,
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  taskMark: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' },
  taskTitle: { whiteSpace: 'normal', overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  taskDoing: {
    boxShadow: `inset 3px 0 ${tokens.colorBrandStroke1}`,
    '& > span:first-child': { color: tokens.colorBrandForeground1 },
  },
  taskBlocked: {
    boxShadow: `inset 3px 0 ${tokens.colorPaletteRedBorder2}`,
    '& > span:first-child': { color: tokens.colorPaletteRedForeground1 },
  },
  taskInspected: {
    backgroundColor: tokens.colorNeutralBackground2,
    borderColor: tokens.colorNeutralStrokeAccessible, borderRadius: tokens.borderRadiusMedium,
    '&:hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  taskChip: {
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStrokeAccessible}`,
    borderRadius: tokens.borderRadiusSmall, paddingInline: tokens.spacingHorizontalXS,
  },
  taskEmpty: {
    margin: 0, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStrokeAccessible}`, borderRadius: tokens.borderRadiusMedium,
  },
  taskDetail: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0,
    padding: tokens.spacingHorizontalM, marginBlock: tokens.spacingVerticalXS,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStrokeAccessible}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    '&:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
  },
  taskDetailDock: {
    marginBlock: 0,
    '& [data-task-instruction]': { maxHeight: '38dvh', overflowY: 'auto', overscrollBehavior: 'contain' },
  },
  taskSource: {
    margin: 0, padding: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', tabSize: 2,
    '&:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
  },
  taskDependencies: {
    listStyleType: 'none', margin: 0, padding: 0,
    '& > li': { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  },
  empty: { padding: tokens.spacingHorizontalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  footer: {
    display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', flexShrink: 0,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
  },
  // Like an editor's status strip, focused Review keeps one line available by
  // keyboard/scroll instead of letting wrapped status text consume its stage.
  focusedFooter: {
    flexWrap: 'nowrap', whiteSpace: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
    boxSizing: 'border-box', height: '25px', minHeight: '25px',
    '& > span': { flexShrink: 0 },
    '&:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  readTime: { marginInlineStart: 'auto' },
  back: { alignSelf: 'flex-start', flexShrink: 0 },
  control: { minWidth: 0, width: '100%' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacingHorizontalS, paddingTop: tokens.spacingVerticalS },
  code: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 },
  scope: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS,
    borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    padding: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground2,
  },
  notice: {
    minWidth: 0, overflowWrap: 'anywhere', flexShrink: 0,
    '&[tabindex="-1"]:focus': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' },
  },
  requestOption: { width: '100%', justifyContent: 'start', textAlign: 'left', minHeight: '48px', whiteSpace: 'normal', overflowWrap: 'anywhere' },
  hidden: { display: 'none' },
  // The frozen mock can pan inside the stage; chrome stays outside its scroller.
  review: { flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', containerType: 'inline-size' },
  reviewBar: {
    flexShrink: 0, display: 'flex', alignItems: 'center', minWidth: 0,
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  // Keep complete request identity readable without letting changed browsing
  // labels or wrapping resize the already pinned review frame.
  reviewIdentity: {
    minWidth: 0, flexGrow: 1, height: `calc(${tokens.lineHeightBase200} + ${tokens.lineHeightBase300})`,
    lineHeight: tokens.lineHeightBase200, overflowY: 'auto', overscrollBehavior: 'contain',
    '&:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  reviewPrompt: {
    margin: 0, minWidth: 0, overflowWrap: 'anywhere',
    fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300, fontWeight: tokens.fontWeightSemibold,
  },
  reviewBarItem: { flexShrink: 0 },
  // Exact path and revision stay one click away in an overlay, so revealing
  // them cannot resize the admitted frame or push the mock down the panel.
  // Like Notes and more, the surface scrolls itself once Fluent caps it at the
  // room left in a short panel: a page scrollbar would still narrow the frame.
  // It takes focus on open, so keyboard scrolling shows where focus is.
  sourceSurface: {
    boxSizing: 'border-box', overflowY: 'auto', overscrollBehavior: 'contain',
    '&:focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '-2px' },
  },
  sourceDetails: { maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  // The stage fills the actual remaining pane, not an estimated dvh band.
  // Notices and forms live in a popover; their arrival, wrapping, or disclosure
  // cannot resize an annotated iframe. The status strip has a stable height.
  workspace: {
    flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column',
    gap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalXS,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  canvasBand: { position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex' },
  toolsMenuDismiss: { position: 'absolute', inset: 0, zIndex: 1 },
  engineHost: {
    flex: 1, minHeight: 0, minWidth: 0, display: 'flex',
    // The unannotated frame fills the stage. The engine pins its validated
    // size on first annotation and scrolls inside this host, below the palette.
    '& .dude-review-engine': { minHeight: 0 },
    '& .dude-review-frame': { minHeight: 0 },
  },
  // Both placements float over the stable stage. Horizontal leaves the entire
  // vertical lane clear, even at 360px: a target covered by one is exposed by
  // the other, including the bottom-left corner.
  drawingToolbar: {
    position: 'absolute', zIndex: 1, display: 'flex', boxSizing: 'border-box',
    transform: 'translate(0px, 0px)', willChange: 'transform',
    alignItems: 'center', minHeight: 0, minWidth: 0, gap: tokens.spacingHorizontalXXS,
    padding: tokens.spacingHorizontalXXS,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium, boxShadow: tokens.shadow16,
  },
  // A short stage would otherwise spend its entire budget on the grip and the
  // orientation switch, leaving the scroller under one tool slot, where no
  // scroll offset can wholly reveal a tool. Keep the 8px float inset while it
  // fits, then trade the bottom inset for that slot, and never the stage.
  drawingToolbarVertical: {
    insetInlineStart: tokens.spacingHorizontalS, top: tokens.spacingVerticalS,
    flexDirection: 'column', alignItems: 'flex-start', width: '60px',
    maxHeight: `clamp(calc(100% - 16px), ${TOOLS_COLUMN_FLOOR}, calc(100% - 8px))`,
  },
  drawingToolbarHorizontal: {
    insetInlineEnd: tokens.spacingHorizontalS, bottom: tokens.spacingVerticalS,
    width: 'max-content', maxWidth: 'calc(100% - 88px)',
  },
  // Vertical stays a single column: native wheel and Fluent arrow-key focus
  // reveal tools inside the palette, without moving the mock. Horizontal rows
  // wrap within their painted width. The orientation button never scrolls.
  drawingTools: {
    flex: '1 1 auto', padding: 0, minWidth: 0, minHeight: 0, flexWrap: 'nowrap',
    gap: tokens.spacingHorizontalXXS, overscrollBehavior: 'contain',
  },
  drawingToolsVertical: {
    // Leave room beside the buttons for either classic or overlay scrollbars.
    width: '100%', alignItems: 'flex-start', overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable',
  },
  drawingToolsHorizontal: { flexWrap: 'wrap' },
  toolButton: { flexShrink: 0, width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' },
  // A grab strip, never a tool slot. It sits outside the scroller beside the
  // orientation switch, so parked tools can always be moved back. Fluent's
  // icon-only maximum would otherwise cap this strip at 32px.
  toolGrip: {
    flexShrink: 0, padding: 0, minWidth: '24px', minHeight: '24px', maxWidth: 'none', maxHeight: 'none',
    touchAction: 'none', userSelect: 'none', cursor: 'grab',
    '&:active': { cursor: 'grabbing' },
  },
  toolGripVertical: { width: '100%', height: '24px' },
  toolGripHorizontal: { width: '24px', alignSelf: 'stretch' },
  visuallyHidden: {
    position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: 0,
    overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
  },
  // Fixed rows keep counts and disabled/saving states from changing the stage.
  reviewActions: {
    position: 'relative',
    flexShrink: 0, display: 'grid', gridTemplateColumns: 'auto auto auto minmax(0, 1fr)', gridAutoRows: '28px', minWidth: 0,
    gap: tokens.spacingHorizontalXS, padding: `0 ${tokens.spacingHorizontalXXS}`,
    '@container (max-width: 600px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  },
  sendAction: { justifySelf: 'end', '@container (max-width: 600px)': { justifySelf: 'stretch' } },
  reviewFeedback: {
    position: 'absolute', zIndex: 2, insetInlineEnd: 0, top: `calc(100% + ${tokens.spacingVerticalXS})`,
    width: '480px', maxWidth: '100%', maxHeight: '50dvh', overflowY: 'auto', overflowWrap: 'anywhere',
  },
  reviewFeedbackBody: {
    display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalXS,
    '& > div': { flex: 1, minWidth: 0 },
  },
  reviewStatus: {
    height: '28px', flexShrink: 0, minWidth: 0, display: 'flex', alignItems: 'center',
    paddingInline: tokens.spacingHorizontalXS, gap: tokens.spacingHorizontalXS,
  },
  statusText: { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  reviewNotice: { flex: '1 1 auto', minWidth: 0, maxWidth: '100%', justifyContent: 'flex-start' },
  reviewDetails: {
    boxSizing: 'border-box', width: 'min(600px, calc(100vw - 32px))',
    overflowY: 'auto', overscrollBehavior: 'contain',
  },
  stage: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  picker: { display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  pickerField: { flex: '1 1 100%', minWidth: 0 },
  drawer: { width: 'min(440px, 100vw)', maxWidth: '100vw' },
  drawerBody: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, paddingBottom: tokens.spacingVerticalXL, overflowWrap: 'anywhere' },
  // Finishing and the capture answer stay out of the scroller, so a short
  // panel keeps both visible without changing what the drawer body holds.
  drawerFooter: {
    flexShrink: 0, flexWrap: 'wrap', alignItems: 'center',
    paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalM,
    columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS,
  },
  // Master-detail, the way a mail list, a file list, or a layers panel does it:
  // the list keeps its own bounded scrollport so revealing the marked row never
  // moves the editor below it, and a long list cannot bury that editor. This
  // lives inside the drawer overlay, so it cannot resize the reviewed frame.
  annotationList: {
    flexShrink: 0, maxHeight: 'min(320px, 40dvh)', overflowY: 'auto', overscrollBehavior: 'contain',
    scrollbarGutter: 'stable', minWidth: 0,
  },
  annotationItem: {
    position: 'relative',
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    '&:active': { backgroundColor: tokens.colorNeutralBackground1Pressed },
  },
  // Fluent's own NavItem selection marker: a rounded brand bar on the leading
  // edge, over the selected surface fill. The bar is a shape that only the
  // selected row has, so the state does not rest on color alone, and Fluent's
  // separate focus outline stays readable as the other state.
  annotationItemSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Selected },
    '&::after': {
      content: '""', position: 'absolute', insetInlineStart: tokens.spacingHorizontalXS,
      top: '50%', transform: 'translateY(-50%)',
      width: '4px', height: '20px', borderRadius: tokens.borderRadiusCircular,
      backgroundColor: tokens.colorCompoundBrandForeground1,
      '@media (forced-colors: active)': { backgroundColor: 'Highlight', forcedColorAdjust: 'none' },
    },
  },
  // The selected fill is lighter than the surface it sits on, so brand text
  // needs the ramp step Fluent reserves for text, not the one it uses for the
  // marker and the selected icon. `colorNeutralForeground2BrandSelected` is
  // Fluent's selected-*icon* token in NavItem, and on the dark selected fill it
  // clears the 3:1 graphics bar but not the 4.5:1 text bar.
  // `colorBrandForeground2` is what Fluent's own Tab uses for selected label
  // text on a tinted selected surface, one ramp step further from the fill.
  annotationSelectedLabel: { color: tokens.colorBrandForeground2 },
  commentEditor: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  // The selected element's context summary is the mock's literal `textContent`,
  // so it carries the source markup's own newlines and indentation. Rendered
  // with the shared `prose` rule, that authoring whitespace paints as hundreds
  // of empty pixels between a few words. Collapse it here the way a browser
  // renders ordinary body copy: only this paragraph's display changes, the
  // stored annotation text stays literal, and wrapping with `overflowWrap`
  // from `prose` still carries long unbroken strings at any panel width.
  contextText: { whiteSpace: 'normal' },
  // The heading and its pending marker share one row, so naming the unsent
  // state costs a short panel no height at all.
  selectionHeading: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS, minWidth: 0,
  },
  selectionState: { flexShrink: 0 },
  // One reserved line beside the finish action, so wording changes never move
  // that target. Fluent tokens carry the light and dark contrast.
  commentStatus: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS,
    flex: '1 1 0px', minWidth: 0, minHeight: tokens.lineHeightBase200,
  },
  commentStatusMark: { flexShrink: 0, fontSize: '16px', color: tokens.colorStatusSuccessForeground1 },
  geometry: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS, '& > *': { flex: '1 1 80px', minWidth: 0 } },
  historyImage: { display: 'block', width: '100%', height: 'auto', border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
});

import { makeStyles, tokens } from '@fluentui/react-components';
export { mergeClasses } from '@fluentui/react-components';

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
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS, padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
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
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
    gap: tokens.spacingHorizontalXS, flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  viewTabs: { flexShrink: 0, minWidth: 0, maxWidth: '100%', flexWrap: 'wrap' },
  product: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, containerType: 'inline-size' },
  detail: {
    flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable',
    backgroundColor: tokens.colorNeutralBackground1, padding: tokens.spacingHorizontalXXL,
    '@container (max-width: 700px)': { padding: tokens.spacingHorizontalL },
  },
  measure: { maxWidth: '76ch', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  overview: { width: '100%', maxWidth: '1120px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXL },
  focal: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0,
    padding: tokens.spacingHorizontalL, backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium, boxShadow: tokens.shadow4,
    borderLeft: `${tokens.strokeWidthThicker} solid ${tokens.colorBrandStroke1}`,
  },
  focalProgress: { maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, minWidth: 0 },
  focalStep: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalM },
  workControls: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: tokens.spacingHorizontalM,
    '& > *:first-child': { flex: '2 1 260px', minWidth: 0 },
    '& > *:nth-child(2)': { flex: '1 1 180px', minWidth: 0, maxWidth: '240px' },
  },
  workScroll: {
    maxHeight: 'min(560px, 60dvh)', overflowY: 'auto', minWidth: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
  },
  workHeader: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: tokens.colorNeutralBackground2 },
  workCell: { paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS, overflowWrap: 'anywhere' },
  workRow: { cursor: 'pointer' },
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
  empty: { padding: tokens.spacingHorizontalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  footer: {
    display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', flexShrink: 0,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
  },
  back: { alignSelf: 'flex-start', flexShrink: 0 },
  control: { minWidth: 0, width: '100%' },
  actions: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacingHorizontalS, paddingTop: tokens.spacingVerticalS },
  code: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 },
  scope: {
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS,
    borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    padding: tokens.spacingHorizontalM, backgroundColor: tokens.colorNeutralBackground2,
  },
  notice: { minWidth: 0, overflowWrap: 'anywhere', flexShrink: 0 },
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
  reviewPrompt: {
    margin: 0, minWidth: 0, flexGrow: 1,
    fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300, fontWeight: tokens.fontWeightSemibold,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  reviewBarItem: { flexShrink: 0 },
  // Exact path and revision stay one click away in an overlay, so revealing
  // them cannot resize the admitted frame or push the mock down the panel.
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
  drawingToolbarVertical: {
    insetInlineStart: tokens.spacingHorizontalS, top: tokens.spacingVerticalS,
    flexDirection: 'column', alignItems: 'flex-start', width: '60px', maxHeight: 'calc(100% - 16px)',
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

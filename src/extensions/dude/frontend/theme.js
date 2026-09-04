import { useSyncExternalStore } from 'react';
import { webDarkTheme, webLightTheme } from '@fluentui/react-components';

const DARK_APPEARANCE_QUERY = '(prefers-color-scheme: dark)';

function accessibleInteractiveTheme(theme) {
  return Object.freeze({
    ...theme,
    colorNeutralStroke1: theme.colorNeutralStrokeAccessible,
    colorNeutralStroke1Hover: theme.colorNeutralStrokeAccessibleHover,
    colorNeutralStroke1Pressed: theme.colorNeutralStrokeAccessiblePressed,
    colorNeutralStroke1Selected: theme.colorNeutralStrokeAccessibleSelected,
  });
}

export const lightTheme = accessibleInteractiveTheme(webLightTheme);
export const darkTheme = accessibleInteractiveTheme(webDarkTheme);

export const layout = Object.freeze({
  commandBar: '44px',
  activityRail: '48px',
  statusBar: '26px',
  detailsDockMin: '300px',
  detailsDock: '320px',
  detailsDockMax: '340px',
  workMin: '640px',
  commandControl: '32px',
  contextBasis: '220px',
  contextMax: '420px',
  chooserRow: '36px',
  // The summary band and the positioned-listbox offset share this exact height.
  chooserSummary: '20px',
  chooserSummaryPx: 20,
  dockTileMin: '260px',
  phaseDistribution: '116px',
  propertyLabel: '96px',
  proseMeasure: '68ch',
  headlineMeasure: '36ch',
  breakpoints: Object.freeze({
    lifecycle: 440,
    phases: 520,
    facts: 560,
    medium: 720,
    wide: 1080,
    tall: 1000,
  }),
});

function hostPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia(DARK_APPEARANCE_QUERY).matches;
}

function subscribeToHostAppearance(onStoreChange) {
  const query = window.matchMedia(DARK_APPEARANCE_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

export function useHostAppearance() {
  return useSyncExternalStore(subscribeToHostAppearance, hostPrefersDark, () => false)
    ? 'dark'
    : 'light';
}

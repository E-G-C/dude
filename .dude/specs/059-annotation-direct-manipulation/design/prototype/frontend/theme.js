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

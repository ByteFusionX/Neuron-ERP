import { clearAccessToken } from '../../core/auth/token-store';

// Per-device UI preferences that should survive sign-out (sidebar layout, theme),
// plus the MSAL account cache so the saved Microsoft account stays in the picker.
const PERSISTED_KEY = /^(sidebar_|app-theme$|msal\.)/;

export function clearSessionStorage(): void {
  clearAccessToken();
  const kept: [string, string][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = key ? localStorage.getItem(key) : null;
    if (key && value !== null && PERSISTED_KEY.test(key)) kept.push([key, value]);
  }
  localStorage.clear();
  sessionStorage.clear();
  kept.forEach(([key, value]) => localStorage.setItem(key, value));
}

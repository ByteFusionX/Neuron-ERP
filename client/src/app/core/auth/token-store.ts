import { environment } from 'src/environments/environment';

// The short-lived access JWT lives only in memory, so page scripts (XSS) cannot read it from storage.
// After a reload it is restored from the httpOnly refresh cookie by restoreSession().
let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;
export const setAccessToken = (token: string): void => { accessToken = token; };
export const clearAccessToken = (): void => { accessToken = null; };

/** App start: drops any token a previous version left in localStorage, then renews from the refresh cookie. */
export async function restoreSession(): Promise<void> {
  try { localStorage.removeItem('employeeToken'); } catch { /* storage unavailable */ }
  try {
    const response = await fetch(`${environment.api}/employee/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) return;
    const body = await response.json();
    if (body?.token) accessToken = body.token;
  } catch {
    // offline or server down: stay signed out; the login guard sends the user to /login
  }
}

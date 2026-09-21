export interface SfOption<V = any> {
  label: string;
  value: V;
  description?: string;
  disabled?: boolean;
}

/** Shared control styles. Angular's ng-invalid/ng-touched classes land on each control's host element. */
export const SF_STYLES = `
  :host { display: block; }
  .sf-input { width: 100%; min-height: 2.25rem; padding: 0 0.75rem; font-size: 0.8125rem; color: #111827; background: #fff;
    border: 1px solid #d1d5db; border-radius: 0.5rem; outline: none; transition: border-color 120ms ease, box-shadow 120ms ease; }
  .sf-input::placeholder, .sf-bare::placeholder { color: #9ca3af; }
  .sf-input:hover { border-color: #9ca3af; }
  .sf-input:focus, .sf-input:focus-within { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15); }
  .sf-input:disabled, .sf-input.sf-disabled { background: #f9fafb; color: #9ca3af; cursor: not-allowed; border-color: #e5e7eb; }
  :host(.ng-invalid.ng-touched) .sf-input { border-color: #ef4444; }
  :host(.ng-invalid.ng-touched) .sf-input:focus, :host(.ng-invalid.ng-touched) .sf-input:focus-within { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15); }
  .sf-bare { flex: 1; min-width: 0; height: 2.125rem; border: 0; outline: 0; background: transparent; font: inherit; color: inherit; padding: 0; }
  .sf-bare:disabled { cursor: not-allowed; }
  .sf-check, .sf-radio { appearance: none; flex-shrink: 0; width: 1rem; height: 1rem; margin-top: 0.125rem; background: #fff;
    border: 1px solid #d1d5db; cursor: pointer; transition: all 120ms ease; }
  .sf-check { border-radius: 0.25rem; background-position: center; background-size: 100%; }
  .sf-check:checked { background-color: #6d28d9; border-color: #6d28d9;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='white'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E"); }
  .sf-radio { border-radius: 9999px; }
  .sf-radio:checked { border: 5px solid #6d28d9; }
  .sf-check:focus-visible, .sf-radio:focus-visible, .sf-focus:focus-visible { outline: 2px solid #7c3aed; outline-offset: 2px; }
  .sf-check:disabled, .sf-radio:disabled { opacity: 0.5; cursor: not-allowed; }
  :host(.ng-invalid.ng-touched) .sf-check { border-color: #ef4444; }

  /* Dark mode */
  :host-context(html.dark) .sf-input { color: #ededed; background: #111111; border-color: #262626; }
  :host-context(html.dark) .sf-input::placeholder, :host-context(html.dark) .sf-bare::placeholder { color: #8f8f8f; }
  :host-context(html.dark) .sf-input:hover { border-color: #525252; }
  :host-context(html.dark) .sf-input:focus, :host-context(html.dark) .sf-input:focus-within { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25); }
  :host-context(html.dark) .sf-input:disabled, :host-context(html.dark) .sf-input.sf-disabled { background: #1a1a1a; color: #8f8f8f; border-color: #262626; }
  :host-context(html.dark) .sf-check, :host-context(html.dark) .sf-radio { background-color: #111111; border-color: #525252; }
  :host-context(html.dark) .sf-check:checked { background-color: #6d28d9; border-color: #6d28d9; }
  :host-context(html.dark) .sf-radio:checked { border-color: #6d28d9; }
`;

/** "approved" -> "Approved", "on_hold" -> "On hold". Raw status keys should never reach the screen. */
export function statusLabel(value: unknown): string {
  const text = String(value ?? '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

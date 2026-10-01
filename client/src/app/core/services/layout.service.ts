import { Injectable, computed, signal } from '@angular/core';
import { SidebarPreferencesService } from './sidebar-preferences.service';

export const SIDEBAR_RAIL_WIDTH = 72;
export const SIDEBAR_MIN_FULL_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 240;
const MOBILE_BREAKPOINT = 768;
const SNAP_TO_RAIL_BELOW = 140;
const SNAP_TO_FULL_ABOVE = 190;
const KEYBOARD_STEP = 16;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly sidebarWidth = signal(SIDEBAR_DEFAULT_WIDTH);
  readonly hidden = signal(false);
  readonly isMobile = signal(false);
  readonly dragging = signal(false);
  /** Overlay sidebar is currently revealed (mobile drawer, or hover-peek while hidden). */
  readonly overlayOpen = signal(false);

  /** Sidebar floats above the page instead of taking space (mobile, or hidden on desktop). */
  readonly overlay = computed(() => this.isMobile() || this.hidden());
  readonly showFullBar = computed(() => this.overlay() || this.sidebarWidth() >= SIDEBAR_MIN_FULL_WIDTH);
  /** Width of the sidebar panel itself. */
  readonly panelWidth = computed(() =>
    this.overlay() ? Math.max(this.sidebarWidth(), SIDEBAR_MIN_FULL_WIDTH) : this.sidebarWidth(),
  );
  /** Space the sidebar reserves in the page flow. */
  readonly dockedWidth = computed(() => (this.overlay() ? 0 : this.sidebarWidth()));

  private loadedFor: string | null = null;

  constructor(private prefs: SidebarPreferencesService) {
    this.onViewportChange(window.innerWidth);
  }

  /** Load persisted layout for the current employee (safe to call repeatedly). */
  init(): void {
    const owner = this.prefs.ownerKey();
    if (this.loadedFor === owner) return;
    this.loadedFor = owner;

    const stored = this.prefs.getSidebarWidth();
    const width = stored ?? (this.prefs.getShowFullBar() ? SIDEBAR_DEFAULT_WIDTH : SIDEBAR_RAIL_WIDTH);
    this.sidebarWidth.set(this.normalise(width, this.sidebarWidth()));
    this.hidden.set(this.prefs.getSidebarHidden());
  }

  onViewportChange(viewportWidth: number): void {
    const mobile = viewportWidth < MOBILE_BREAKPOINT;
    if (mobile !== this.isMobile()) {
      this.isMobile.set(mobile);
      this.overlayOpen.set(false);
    }
  }

  /** Navbar hamburger: mobile drawer, un-hide, or toggle rail/full. */
  toggleFromNavbar(): void {
    if (this.isMobile()) {
      this.overlayOpen.update((open) => !open);
    } else if (this.hidden()) {
      this.setHidden(false);
    } else {
      this.setWidth(this.showFullBar() ? SIDEBAR_RAIL_WIDTH : SIDEBAR_DEFAULT_WIDTH);
    }
  }

  /** Ctrl+B */
  toggleHidden(): void {
    if (this.isMobile()) {
      this.overlayOpen.update((open) => !open);
    } else {
      this.setHidden(!this.hidden());
    }
  }

  setHidden(hidden: boolean): void {
    this.hidden.set(hidden);
    this.overlayOpen.set(false);
    this.prefs.setSidebarHidden(hidden);
  }

  peek(open: boolean): void {
    if (this.hidden() && !this.isMobile()) this.overlayOpen.set(open);
  }

  closeOverlay(): void {
    this.overlayOpen.set(false);
  }

  /** Live width while dragging (snaps between rail and full range). */
  dragTo(rawWidth: number): void {
    this.sidebarWidth.set(this.normalise(rawWidth, this.sidebarWidth()));
  }

  startDrag(): void {
    this.dragging.set(true);
  }

  endDrag(): void {
    this.dragging.set(false);
    this.prefs.setSidebarWidth(this.sidebarWidth());
  }

  nudge(direction: 1 | -1): void {
    const current = this.sidebarWidth();
    if (direction === 1 && current < SIDEBAR_MIN_FULL_WIDTH) {
      this.setWidth(SIDEBAR_MIN_FULL_WIDTH);
    } else if (direction === -1 && current <= SIDEBAR_MIN_FULL_WIDTH) {
      this.setWidth(SIDEBAR_RAIL_WIDTH);
    } else {
      this.setWidth(current + direction * KEYBOARD_STEP);
    }
  }

  reset(): void {
    this.setWidth(SIDEBAR_DEFAULT_WIDTH);
  }

  private setWidth(width: number): void {
    this.sidebarWidth.set(this.normalise(width, this.sidebarWidth()));
    this.prefs.setSidebarWidth(this.sidebarWidth());
  }

  /** Rail below the snap threshold (with hysteresis), otherwise clamped full width. */
  private normalise(width: number, current: number): number {
    const threshold = current < SIDEBAR_MIN_FULL_WIDTH ? SNAP_TO_FULL_ABOVE : SNAP_TO_RAIL_BELOW;
    if (width < threshold) return SIDEBAR_RAIL_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_FULL_WIDTH, Math.round(width)));
  }
}

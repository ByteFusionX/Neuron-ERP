import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { DetailSectionComponent } from '../detail-panel/detail-section.component';
import { DetailFieldsMenuComponent, DetailFieldsMenuItem } from '../detail-panel/detail-fields-menu.component';
import { DetailFieldComponent } from '../detail-panel/detail-field.component';
import { DetailBadgeComponent } from '../detail-panel/detail-badge.component';
import { DetailProgressComponent } from '../detail-panel/detail-progress.component';
import { DetailAvatarComponent } from '../detail-panel/detail-avatar.component';
import { DetailTone } from '../detail-panel/detail-tone';
import { DetailOverviewSection } from '../detail-panel/detail-panel.model';

export interface DetailViewBreadcrumb {
  label: string;
  link?: any[] | string;
}

export interface DetailViewBadge {
  label: string;
  /** Semantic tone; preferred. */
  tone?: DetailTone;
  /** Legacy raw-class escape hatch, used only when `tone` is not set. */
  class?: string;
}

export interface DetailViewStat {
  label: string;
  value: string;
  danger?: boolean;
  /** Unchecked in the Summary fields menu until the user turns it on. */
  hiddenByDefault?: boolean;
  /** 0-100; renders a progress bar under the value when set. */
  progress?: number;
  progressClass?: string;
}

export interface DetailViewTab {
  id: string;
  label: string;
}

/**
 * Generic single-record detail-view shell: skeleton / not-found states, a header with
 * breadcrumbs + badges + KPI stats, a tab strip, a scrollable body with an optional right
 * panel, and a toast slot. Layout only — all data and tab content are supplied by the
 * consumer via inputs and content projection, so it can back any module's single-view page
 * (home-landing's project detail, a quotation, a job, etc.) with its own data shape.
 *
 * Content projection slots:
 *   [headerTitle]    - custom title block, used instead of the default one when `customTitle` is set
 *   [headerActions]  - buttons shown top-right of the header
 *   [beforeStats]    - columns placed before the stats in the 'fields' row
 *   [afterStats]     - columns placed after the stats in the 'fields' row
 *   [tabToolbar]    - controls at the right end of the tab strip, before the panel toggle
 *   [tabBody]        - the active tab's content (consumer does its own *ngSwitch on activeTab)
 *   [sidebar]        - right panel body (only rendered while panelOpen)
 *   [sidebarFooter]  - sticky bottom area of the right panel (e.g. a comment box)
 *   [footerLeft]     - bottom bar, left: optional / tab-dependent actions (outline buttons)
 *   [footerRight]    - bottom bar, right: permanent actions shown on every tab (filled buttons)
 *
 * `sections` renders a structured key/value block (title + fields, same shape as detail-panel's
 * `DetailOverviewSection`/`app-detail-overview`, minus the 'dg' field type which is data-grid-only)
 * above the projected `[sidebar]` content — for an "Overview"-style summary without hand-rolled markup.
 */
@Component({
  selector: 'app-detail-view-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, ActionButtonComponent, DetailSectionComponent, DetailFieldsMenuComponent, DetailFieldComponent, DetailBadgeComponent, DetailProgressComponent, DetailAvatarComponent],
  templateUrl: './detail-view-shell.component.html',
  styleUrls: ['./detail-view-shell.component.css'],
})
export class DetailViewShellComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ transform: booleanAttribute }) loading = false;
  @Input({ transform: booleanAttribute }) empty = false;
  @Input() emptyTitle = 'Not found';
  @Input() emptyMessage = '';
  @Input() emptyLink: any[] | null = null;
  @Input() emptyLinkLabel = 'Back';

  @Input() breadcrumbs: DetailViewBreadcrumb[] = [];
  @Input() avatarText = '';
  @Input() title = '';
  @Input() badges: DetailViewBadge[] = [];
  @Input() subtitle = '';
  @Input() headerTone: 'default' | 'contrast' = 'default';
  /** Replace the avatar/title/badges/subtitle block with the projected [headerTitle] content. */
  @Input({ transform: booleanAttribute }) customTitle = false;
  @Input() stats: DetailViewStat[] = [];
  /** 'kpi' = bold inline strip inside the header; 'fields' = plain 3-column label/value grid below it. */
  @Input() statsLayout: 'kpi' | 'fields' = 'kpi';
  /** 'fields' layout only: when set, the stats render as a titled card instead of a bare list. */
  @Input() statsTitle = '';
  /** With `statsTitle`: adds a 3-dot menu to the card to show or hide each stat, remembered under this key. */
  @Input() statsStorageKey = '';
  statItems: DetailFieldsMenuItem[] = [];
  hiddenStats = new Set<string>();
  statsOrder: string[] = [];
  get visibleStats(): DetailViewStat[] {
    if (!this.statsStorageKey) return this.stats;
    const pos = (k: string) => { const i = this.statsOrder.indexOf(k); return i < 0 ? this.statsOrder.length : i; };
    return this.stats.filter((s) => !this.hiddenStats.has(s.label)).sort((a, b) => pos(a.label) - pos(b.label));
  }

  @Input() tabs: DetailViewTab[] = [];
  @Input() activeTab = '';
  @Output() activeTabChange = new EventEmitter<string>();
  /**
   * Query-param name that mirrors the active tab in the URL (e.g. `?tab=history`), so tabs are
   * deep-linkable and the browser back button steps between them. Set to '' to turn it off.
   * The tab the shell starts on is the default and is kept out of the URL.
   */
  @Input() tabParam = 'tab';

  @Input({ transform: booleanAttribute }) panelOpen = true;
  @Input({ transform: booleanAttribute }) showPanelToggle = true;
  @Input() showPanelLabel = 'Show panel';
  @Input() hidePanelLabel = 'Hide panel';
  @Output() panelOpenChange = new EventEmitter<boolean>();

  @Input() hasSidebar = true;
  /** Right panel without padding or its own scroll, wider, for [sidebar] content that brings its own tabs and scrolling. */
  @Input({ transform: booleanAttribute }) sidebarBare = false;
  /** Header + details, body and right panel as separate cards instead of one bordered block. */
  @Input({ transform: booleanAttribute }) sectioned = false;
  /** Title for the body's bar, shown when there are no tabs (the bar also holds [tabToolbar] and the panel toggle). */
  @Input() bodyTitle = '';
  /** Body card is only the projected [tabBody]: no title bar, no padding (so a table can run edge to edge). */
  @Input({ transform: booleanAttribute }) bodyBare = false;

  /** Panel width in px once dragged; null keeps the default width. */
  panelWidth: number | null = null;
  dragging = false;

  get resizable(): boolean {
    return this.sectioned && this.sidebarBare;
  }

  /** Drag the divider: the panel stays between 1/4 and 1/2 of the row (starts at 1/4). */
  startResize(ev: PointerEvent, row: HTMLElement): void {
    ev.preventDefault();
    const rect = row.getBoundingClientRect();
    const min = rect.width / 4;
    const max = rect.width / 2;
    this.dragging = true;
    const move = (e: PointerEvent) => {
      this.panelWidth = Math.round(Math.min(max, Math.max(min, rect.right - e.clientX)));
    };
    const up = () => {
      this.dragging = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Structured key/value summary rendered above [sidebar]; 'dg' fields are skipped (data-grid-only). */
  @Input() sections: DetailOverviewSection[] = [];

  @Input() toast = '';

  private defaultTab = '';
  private urlTab: string | null = null;
  private sub?: Subscription;

  constructor(private _route: ActivatedRoute, private _router: Router) {}

  ngOnInit(): void {
    this.defaultTab = this.activeTab || this.tabs[0]?.id || '';
    if (!this.tabParam) return;
    this.sub = this._route.queryParamMap.subscribe((p) => {
      this.urlTab = p.get(this.tabParam);
      this.syncFromUrl();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Tabs can arrive late (e.g. a role-gated tab), so re-check a deep link when the list changes.
    if (changes['tabs'] && !changes['tabs'].firstChange) this.syncFromUrl();
    if (changes['stats']) this.statItems = this.stats.map((s) => ({ key: s.label, label: s.label, hiddenByDefault: s.hiddenByDefault }));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Adopt the tab named in the URL; no param means the default tab. Unknown ids are ignored. */
  private syncFromUrl(): void {
    const id = this.urlTab ?? this.defaultTab;
    if (!id || id === this.activeTab || !this.tabs.some((t) => t.id === id)) return;
    this.activeTab = id;
    // Deferred: this can run during the parent's change detection, and the parent mirrors the tab.
    Promise.resolve().then(() => this.activeTabChange.emit(id));
  }

  selectTab(id: string): void {
    if (id === this.activeTab) return;
    this.activeTab = id;
    this.activeTabChange.emit(id);
    if (!this.tabParam) return;
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: { [this.tabParam]: id === this.defaultTab ? null : id },
      queryParamsHandling: 'merge',
    });
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    this.panelOpenChange.emit(this.panelOpen);
  }
}

import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { DetailSectionComponent } from '../detail-panel/detail-section.component';
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
 *   [headerActions]  - buttons shown top-right of the header
 *   [tabToolbar]     - controls at the right end of the tab strip, before the panel toggle
 *   [tabBody]        - the active tab's content (consumer does its own *ngSwitch on activeTab)
 *   [sidebar]        - right panel body (only rendered while panelOpen)
 *   [sidebarFooter]  - sticky bottom area of the right panel (e.g. a comment box)
 *
 * `sections` renders a structured key/value block (title + fields, same shape as detail-panel's
 * `DetailOverviewSection`/`app-detail-overview`, minus the 'dg' field type which is data-grid-only)
 * above the projected `[sidebar]` content — for an "Overview"-style summary without hand-rolled markup.
 */
@Component({
  selector: 'app-detail-view-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, ActionButtonComponent, DetailSectionComponent, DetailFieldComponent, DetailBadgeComponent, DetailProgressComponent, DetailAvatarComponent],
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
  @Input() stats: DetailViewStat[] = [];

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

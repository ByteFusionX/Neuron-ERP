import {
  Component, EventEmitter, HostBinding, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailPanelTab } from './detail-panel.model';
import { DetailPanelIconComponent } from './detail-panel-icon.component';

/**
 * Standalone detail sidebar, fixed to the right edge between the nav bar and the bottom of the screen
 * (override with the --dp-top / --dp-width CSS variables). Render it with *ngIf; the list underneath
 * stays mounted, so closing the panel keeps its scroll position. Below 1024px it is full-screen.
 *
 *   <app-detail-panel *ngIf="selected" [breadcrumb]="['Quotations']" [subtitle]="selected.refNo"
 *     [title]="selected.subject" [tabs]="tabs" [(activeTab)]="tab" (closed)="selected = null">
 *     <ng-container panelActions>...top bar icon buttons...</ng-container>
 *     <ng-container panelAside>...status badge...</ng-container>
 *     <ng-container panelMeta>...key facts cells (customer, amount, date)...</ng-container>
 *     ...body (switch on activeTab, use <app-detail-section> + <app-detail-field>)...
 *     <ng-container panelFooter>...primary actions...</ng-container>
 *   </app-detail-panel>
 */
@Component({
  selector: 'app-detail-panel',
  // A `title` input must not leak onto the host as a native browser tooltip.
  host: { '[attr.title]': 'null' },
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  templateUrl: './detail-panel.component.html',
  styleUrls: ['./detail-panel.component.css'],
})
export class DetailPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() title = '';
  @Input() subtitle = '';
  /** Trail shown in the top bar before the title, e.g. ['Customers']. */
  @Input() breadcrumb: string[] = [];
  @Input() tabs: DetailPanelTab[] = [];
  @Input() activeTab = '';
  /** Close on Escape. Disable when the host already handles Escape (e.g. to close menus first). */
  @Input() closeOnEscape = true;

  @Output() activeTabChange = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @HostBinding('attr.role') role = 'complementary';
  @HostBinding('attr.aria-label') get ariaLabel(): string {
    return this.title || 'Details';
  }

  private returnFocusTo: HTMLElement | null = null;

  ngOnInit(): void {
    const el = document.activeElement;
    this.returnFocusTo = el instanceof HTMLElement && el !== document.body ? el : null;
    this.ensureActiveTab();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabs'] || changes['activeTab']) this.ensureActiveTab();
  }

  ngOnDestroy(): void {
    this.returnFocusTo?.focus({ preventScroll: true });
  }

  selectTab(id: string): void {
    if (id === this.activeTab) return;
    this.activeTab = id;
    this.activeTabChange.emit(id);
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.closeOnEscape) this.close();
  }

  private ensureActiveTab(): void {
    if (this.tabs.length && !this.tabs.some((t) => t.id === this.activeTab)) {
      // defer so the parent isn't updated during its own change detection pass
      const first = this.tabs[0].id;
      this.activeTab = first;
      queueMicrotask(() => this.activeTabChange.emit(first));
    }
  }
}

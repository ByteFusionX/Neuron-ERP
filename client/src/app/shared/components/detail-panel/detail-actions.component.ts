import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DetailAction } from './detail-panel.model';
import { DetailPanelIconComponent } from './detail-panel-icon.component';

/**
 * The panel's button row — normally projected into `[panelFooter]`. Callers describe actions as data
 * and receive the clicked action's id; an action carrying `link` renders as a router anchor instead.
 * Host is `display: contents` so buttons participate in the footer's own flex layout.
 *
 *   <app-detail-actions panelFooter [actions]="footerFor(row)" (action)="onFooterAction($event, row)">
 */
@Component({
  selector: 'app-detail-actions',
  standalone: true,
  imports: [CommonModule, RouterLink, DetailPanelIconComponent],
  template: `
    <ng-container *ngFor="let a of actions">
      <a *ngIf="a.link; else plainButton" [routerLink]="a.link" class="dpa" [ngClass]="'dpa-' + (a.variant || 'secondary')">
        <app-dp-icon *ngIf="a.icon" [name]="a.icon" size="w-3.5 h-3.5"></app-dp-icon>{{ a.label }}
      </a>
      <ng-template #plainButton>
        <button type="button" class="dpa" [ngClass]="'dpa-' + (a.variant || 'secondary')"
          [disabled]="!!a.disabled" (click)="action.emit(a.id)">
          <app-dp-icon *ngIf="a.icon" [name]="a.icon" size="w-3.5 h-3.5"></app-dp-icon>{{ a.label }}
        </button>
      </ng-template>
    </ng-container>
  `,
  styles: [`
    :host { display: contents; }
    .dpa { display: inline-flex; align-items: center; gap: 0.375rem; height: 2rem; padding: 0 0.75rem;
      font-size: 0.8125rem; font-weight: 500; border-radius: 0.5rem; transition: background-color 120ms ease; }
    .dpa:disabled { opacity: 0.5; cursor: default; }
    .dpa-secondary { color: #374151; background: #fff; border: 1px solid #e5e7eb; }
    .dpa-secondary:hover:not(:disabled) { background: #f9fafb; }
    .dpa-primary { color: #fff; background: #6d28d9; }
    .dpa-primary:hover:not(:disabled) { background: #5b21b6; }
    .dpa-danger { color: #fff; background: #dc2626; }
    .dpa-danger:hover:not(:disabled) { background: #b91c1c; }
    :host-context(html.dark) .dpa-secondary { color: #d4d4d4; background: #1a1a1a; border-color: #262626; }
    :host-context(html.dark) .dpa-secondary:hover:not(:disabled) { background: #262626; }
  `],
})
export class DetailActionsComponent {
  @Input() actions: DetailAction[] = [];
  /** Emits the clicked action's `id`. Actions with a `link` navigate and never emit. */
  @Output() action = new EventEmitter<string>();
}

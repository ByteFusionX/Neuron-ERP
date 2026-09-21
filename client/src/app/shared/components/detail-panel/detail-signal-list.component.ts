import { Component, EventEmitter, Input, Output, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailSignal } from './detail-panel.model';
import { toneClasses } from './detail-tone';

/**
 * "What needs attention" list: a tone dot, a headline and the reason. With `clickable`, the whole
 * row becomes the target and (select) emits the signal.
 *
 *   <app-detail-signal-list [items]="rep.signals"></app-detail-signal-list>
 */
@Component({
  selector: 'app-detail-signal-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ul [ngClass]="clickable ? '' : 'space-y-3'">
      <li *ngFor="let s of items">
        <button *ngIf="clickable; else staticRow" type="button" class="dps dps-btn" (click)="select.emit(s)">
          <ng-container *ngTemplateOutlet="body; context: { $implicit: s }"></ng-container>
        </button>
        <ng-template #staticRow>
          <div class="dps"><ng-container *ngTemplateOutlet="body; context: { $implicit: s }"></ng-container></div>
        </ng-template>
      </li>
    </ul>

    <ng-template #body let-s>
      <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" [ngClass]="dot(s)"></span>
      <span class="min-w-0 flex-1 text-left">
        <span class="flex items-baseline gap-2">
          <span class="truncate text-[13px] font-medium text-gray-800 dark:text-gray-100">{{ s.title }}</span>
          <span *ngIf="s.ref" class="shrink-0 text-xs text-gray-400 tabular-nums">{{ s.ref }}</span>
        </span>
        <span *ngIf="s.label" class="mt-0.5 block text-xs font-medium" [ngClass]="text(s)">{{ s.label }}</span>
        <span *ngIf="s.detail" class="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{{ s.detail }}</span>
      </span>
      <span *ngIf="s.value !== undefined || s.meta" class="shrink-0 text-right">
        <span *ngIf="s.value !== undefined" class="block text-[13px] tabular-nums text-gray-700 dark:text-gray-200">{{ s.value }}</span>
        <span *ngIf="s.meta" class="block text-[11px] text-gray-400">{{ s.meta }}</span>
      </span>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .dps { display: flex; gap: 0.625rem; align-items: flex-start; }
    .dps-btn { width: 100%; padding: 0.5rem 0.625rem; margin: 0 -0.625rem; border-radius: 0.5rem;
      transition: background-color 120ms ease; }
    .dps-btn:hover { background: #f9fafb; }
    li + li .dps-btn { margin-top: 0.125rem; }
    :host-context(html.dark) .dps-btn:hover { background: #1f1f1f; }
  `],
})
export class DetailSignalListComponent {
  @Input() items: DetailSignal[] = [];
  @Input({ transform: booleanAttribute }) clickable = false;
  @Output() select = new EventEmitter<DetailSignal>();

  dot(s: DetailSignal): string {
    return toneClasses(s.tone).dot;
  }

  text(s: DetailSignal): string {
    return toneClasses(s.tone).text;
  }
}

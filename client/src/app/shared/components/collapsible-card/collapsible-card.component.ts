import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';

/**
 * Bordered card with a clickable header that folds the whole body away.
 * The body stays mounted (display:none) so form values and validation survive a collapse.
 * The parent owns the collapsed state: bind [collapsed] and handle (toggle).
 */
@Component({
  selector: 'app-collapsible-card',
  standalone: true,
  imports: [NgIf],
  template: `
    <div class="rounded-lg border border-gray-200 p-3 dark:border-erp-border-dark">
      <div class="flex items-center justify-between gap-2" [class.mb-3]="!collapsed">
        <div class="flex min-w-0 cursor-pointer items-center gap-2" (click)="toggle.emit()">
          <svg class="h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform" [class.-rotate-90]="collapsed" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/></svg>
          <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">{{ title }}</span>
          <span *ngIf="collapsed && summary" class="truncate text-xs text-gray-500">{{ summary }}</span>
          <span *ngIf="primary" class="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Primary</span>
        </div>
        <div class="flex items-center gap-3">
          <button *ngIf="canSetPrimary && !primary" type="button" class="text-xs text-violet-600 hover:underline dark:text-violet-400" (click)="setPrimary.emit()">Set as primary</button>
          <button *ngIf="canRemove" type="button" class="text-xs text-red-600 hover:underline dark:text-red-400" (click)="remove.emit()">Remove</button>
        </div>
      </div>
      <!-- inline display so it can't lose to a utility class like grid -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2" [style.display]="collapsed ? 'none' : null">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class CollapsibleCardComponent {
  @Input() title = '';
  @Input() summary = '';
  @Input() collapsed = false;
  @Input() primary = false;
  @Input() canSetPrimary = true;
  @Input() canRemove = true;

  @Output() toggle = new EventEmitter<void>();
  @Output() setPrimary = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
}

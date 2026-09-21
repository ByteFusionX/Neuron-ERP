import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DetailRelatedItem } from './detail-panel.model';
import { DetailBadgeComponent } from './detail-badge.component';

/**
 * Compact list of linked records (related projects, open POs…). A row with `link` is clickable.
 *
 *   <app-detail-related-list [items]="relatedProjects" emptyMessage="None for this customer."></app-detail-related-list>
 */
@Component({
  selector: 'app-detail-related-list',
  standalone: true,
  imports: [CommonModule, RouterLink, DetailBadgeComponent],
  template: `
    <ul class="space-y-1.5">
      <li *ngFor="let i of items">
        <a *ngIf="i.link; else action" [routerLink]="i.link" [queryParams]="i.queryParams" class="block rounded-lg px-3 py-2 text-[13px] bg-gray-50 hover:ring-1 hover:ring-violet-300 dark:bg-gray-800/40">
          <ng-container *ngTemplateOutlet="row; context: { $implicit: i }"></ng-container>
        </a>
        <ng-template #action>
          <button *ngIf="i.clickable; else plain" type="button" (click)="itemClick.emit(i)" class="block w-full rounded-lg px-3 py-2 text-left text-[13px] bg-gray-50 hover:ring-1 hover:ring-violet-300 dark:bg-gray-800/40">
            <ng-container *ngTemplateOutlet="row; context: { $implicit: i }"></ng-container>
          </button>
        </ng-template>
        <ng-template #plain>
          <div class="rounded-lg px-3 py-2 text-[13px] bg-gray-50 dark:bg-gray-800/40">
            <ng-container *ngTemplateOutlet="row; context: { $implicit: i }"></ng-container>
          </div>
        </ng-template>
      </li>
    </ul>
    <p *ngIf="!items.length" class="text-xs text-gray-500 dark:text-gray-400">{{ emptyMessage }}</p>

    <ng-template #row let-i>
      <div class="flex items-center justify-between gap-2">
        <span class="font-medium text-gray-900 dark:text-gray-100">{{ i.title }}</span>
        <app-detail-badge *ngIf="i.badge; else meta" [label]="i.badge" [tone]="i.tone || 'neutral'"></app-detail-badge>
        <ng-template #meta><span *ngIf="i.meta" class="tabular-nums text-gray-900 dark:text-gray-100">{{ i.meta }}</span></ng-template>
      </div>
      <p *ngIf="i.subtitle" class="truncate text-xs text-gray-500 dark:text-gray-400">{{ i.subtitle }}</p>
      <p *ngFor="let l of i.lines" class="truncate text-xs text-gray-500 dark:text-gray-400">{{ l }}</p>
    </ng-template>
  `,
  styles: [':host{display:block}'],
})
export class DetailRelatedListComponent {
  @Input() items: DetailRelatedItem[] = [];
  @Input() emptyMessage = 'Nothing linked.';
  @Output() itemClick = new EventEmitter<DetailRelatedItem>();
}

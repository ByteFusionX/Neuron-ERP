import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailComment } from './detail-panel.model';
import { DetailAvatarComponent } from './detail-avatar.component';

/**
 * Comment thread, oldest first.
 *
 *   <app-detail-comments [comments]="comments"></app-detail-comments>
 */
@Component({
  selector: 'app-detail-comments',
  standalone: true,
  imports: [CommonModule, DetailAvatarComponent],
  template: `
    <ul class="space-y-3">
      <li *ngFor="let c of comments" class="flex gap-2">
        <app-detail-avatar [name]="c.by"></app-detail-avatar>
        <div class="min-w-0 text-[13px]">
          <p><span class="font-medium text-gray-900 dark:text-gray-100">{{ c.by }}</span> <span class="text-xs text-gray-500 dark:text-gray-400">· {{ c.date | date: 'dd MMM' }}</span></p>
          <p class="break-words text-gray-800 dark:text-gray-200">{{ c.text }}</p>
        </div>
      </li>
    </ul>
    <p *ngIf="!comments.length" class="text-[13px] text-gray-500 dark:text-gray-400">{{ emptyMessage }}</p>
  `,
  styles: [':host{display:block}'],
})
export class DetailCommentsComponent {
  @Input() comments: DetailComment[] = [];
  @Input() emptyMessage = 'No comments yet.';
}

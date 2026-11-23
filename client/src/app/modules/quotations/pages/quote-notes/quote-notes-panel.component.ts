import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';
import { QuoteNote } from 'src/app/shared/interfaces/quotation.interface';

/** Read-only list of a quotation's notes, newest first. Shared by the list's detail panel and the quotation view's side panel. */
@Component({
  selector: 'app-quote-notes-panel',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  template: `
    <p *ngIf="!sorted.length" class="text-[13px] text-gray-500 dark:text-gray-400">No notes added yet.</p>
    <ul *ngIf="sorted.length" class="space-y-3">
      <li *ngFor="let n of sorted" class="rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
        <div class="flex items-start justify-between gap-2">
          <p class="text-[13px] font-medium text-gray-900 dark:text-gray-100">{{ n.title }}</p>
          <span *ngIf="!readonly" class="flex shrink-0 gap-1">
            <button *ngIf="!locked" type="button" title="Edit note" aria-label="Edit note"
              class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-neutral-800"
              (click)="edit.emit(n)"><app-dp-icon name="edit"></app-dp-icon></button>
            <button type="button" title="Delete note" aria-label="Delete note"
              class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-neutral-800"
              (click)="remove.emit(n)"><app-dp-icon name="trash"></app-dp-icon></button>
          </span>
        </div>
        <p class="mt-1 whitespace-pre-line break-words text-[13px] text-gray-700 dark:text-gray-300">{{ n.note }}</p>
        <p class="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {{ n.createdByName || 'Unknown' }} · {{ n.createdAt | date: 'dd MMM yyyy, HH:mm' }}
        </p>
      </li>
    </ul>
  `,
})
export class QuoteNotesPanelComponent {
  /** True once the quote is Won: notes can no longer be edited (delete stays available). */
  @Input() locked = false;
  /** Hides both edit and delete (deal sheet / job sheet views). */
  @Input() readonly = false;
  @Output() edit = new EventEmitter<QuoteNote>();
  @Output() remove = new EventEmitter<QuoteNote>();

  @Input() set notes(value: QuoteNote[] | null | undefined) {
    this.sorted = [...(value ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  sorted: QuoteNote[] = [];
}

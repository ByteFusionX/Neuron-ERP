import { Component, EventEmitter, Input, Output, booleanAttribute, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailDocument } from './detail-panel.model';
import { DetailPanelIconComponent } from './detail-panel-icon.component';
import { ConfirmDialogService } from '../confirm-dialog/confirm-dialog.service';

const KIND_CLASSES: Record<string, string> = {
  PDF: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  XLSX: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  DOCX: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  DWG: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
};

/**
 * Document list for a detail panel tab.
 *
 *   <app-detail-documents [documents]="docs" uploadable (upload)="..." (download)="..."></app-detail-documents>
 */
@Component({
  selector: 'app-detail-documents',
  standalone: true,
  imports: [CommonModule, DetailPanelIconComponent],
  template: `
    <div class="mb-3 flex items-center justify-between gap-3">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {{ title }} <span class="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{{ documents.length }}</span>
      </p>
      <button *ngIf="uploadable" type="button" (click)="upload.emit()"
        class="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">
        <app-dp-icon name="upload" size="w-3.5 h-3.5"></app-dp-icon>Upload
      </button>
    </div>

    <ul *ngIf="documents.length; else empty" class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-erp-border-dark dark:border-erp-border-dark">
      <li *ngFor="let d of documents; trackBy: trackById"
        class="group flex items-center gap-3 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50 dark:bg-erp-surface-dark dark:hover:bg-gray-800/60">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-md text-[10px] font-semibold" [ngClass]="kindClass(d)">{{ kindOf(d) }}</span>
        <button type="button" class="min-w-0 flex-1 text-left" [disabled]="!viewable" [class.cursor-default]="!viewable" (click)="viewable && open.emit(d)">
          <p class="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100" [ngClass]="viewable ? 'group-hover:text-violet-700 dark:group-hover:text-violet-400' : ''">{{ d.name }}</p>
          <p class="truncate text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="d.size">{{ d.size }}</ng-container>
            <ng-container *ngIf="d.uploadedBy"> · {{ d.uploadedBy }}</ng-container>
            <ng-container *ngIf="d.date"> · {{ d.date | date: 'dd MMM yyyy' }}</ng-container>
          </p>
        </button>
        <button *ngIf="downloadable" type="button" (click)="download.emit(d)" [attr.aria-label]="'Download ' + d.name"
          class="grid h-7 w-7 shrink-0 place-content-center rounded-md text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-gray-200">
          <app-dp-icon name="download"></app-dp-icon>
        </button>
        <button *ngIf="removable" type="button" (click)="onRemove(d)" [attr.aria-label]="'Remove ' + d.name"
          class="grid h-7 w-7 shrink-0 place-content-center rounded-md text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400">
          <app-dp-icon name="close"></app-dp-icon>
        </button>
      </li>
    </ul>

    <ng-template #empty>
      <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-erp-border-dark">
        <app-dp-icon name="files" size="w-6 h-6" class="text-gray-400"></app-dp-icon>
        <p class="text-[13px] text-gray-500 dark:text-gray-400">{{ emptyMessage }}</p>
      </div>
    </ng-template>
  `,
  styles: [':host{display:block}'],
})
export class DetailDocumentsComponent {
  private confirm = inject(ConfirmDialogService);

  @Input() documents: DetailDocument[] = [];
  @Input() title = 'Documents';
  @Input() emptyMessage = 'No documents uploaded yet.';
  @Input({ transform: booleanAttribute }) uploadable = false;
  @Input({ transform: booleanAttribute }) removable = false;
  @Input({ transform: booleanAttribute }) viewable = true;
  @Input({ transform: booleanAttribute }) downloadable = true;
  /** Extra key facts shown in the delete confirmation dialog, e.g. record id, customer name. */
  @Input() removeDetails: (d: DetailDocument) => { label: string; value: string }[] = () => [];

  @Output() upload = new EventEmitter<void>();
  @Output() open = new EventEmitter<DetailDocument>();
  @Output() download = new EventEmitter<DetailDocument>();
  @Output() remove = new EventEmitter<DetailDocument>();

  async onRemove(d: DetailDocument): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete Document',
      message: `Are you sure you want to delete "${d.name}"? This action cannot be undone.`,
      details: this.removeDetails(d),
      typeToConfirm: 'delete',
      confirmLabel: 'Delete',
    });
    if (confirmed) { this.remove.emit(d); }
  }

  kindOf(d: DetailDocument): string {
    return (d.kind || d.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
  }

  kindClass(d: DetailDocument): string {
    return KIND_CLASSES[this.kindOf(d)] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  }

  trackById = (_: number, d: DetailDocument) => d.id;
}

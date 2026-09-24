import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { DetailPanelIconComponent } from 'src/app/shared/components/detail-panel/detail-panel-icon.component';

export interface LpoUploadModalData {
  /** Quote number shown as a chip in the header. */
  context?: string;
  acceptedFiles: string;
}

/**
 * Upload-files modal for the quotation detail panel's Documents tab, mirroring
 * EventCreateModalComponent's layout so both "add" flows feel the same.
 *
 *   modal.open<File[]>(LpoUploadModalComponent, { width: '520px', data: { context, acceptedFiles } })
 */
@Component({
  selector: 'app-lpo-upload-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SmartFormModule, DetailPanelIconComponent],
  template: `
    <div class="flex max-h-[90vh] flex-col bg-white text-gray-900 dark:bg-erp-surface-dark dark:text-gray-100">
      <header class="flex items-start gap-3 border-b border-gray-100 px-6 py-4 dark:border-erp-border-dark">
        <span class="grid h-9 w-9 shrink-0 place-content-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-900">
          <app-dp-icon name="upload" size="w-5 h-5"></app-dp-icon>
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold leading-6">Upload customer LPO</h2>
          <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <ng-container *ngIf="data?.context; else noCtx">
              Adding to
              <span class="inline-flex max-w-[16rem] items-center truncate rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{{ data?.context }}</span>
            </ng-container>
            <ng-template #noCtx>Attach the customer's LPO document.</ng-template>
          </p>
        </div>
        <button type="button" (click)="close()" aria-label="Close"
          class="grid h-8 w-8 place-content-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
          <app-dp-icon name="close" size="w-4 h-4"></app-dp-icon>
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-6 py-6 min-h-[280px]">
        <p class="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Files</p>
        <app-sf-file [(ngModel)]="files" [accept]="data?.acceptedFiles || ''" [maxSizeMb]="5" [disabled]="uploading"></app-sf-file>
      </div>

      <footer class="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/70 px-6 py-3 dark:border-erp-border-dark dark:bg-black/20">
        <div class="flex gap-2 ml-auto">
          <button type="button" (click)="close()" [disabled]="uploading"
            class="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-erp-border-dark dark:bg-erp-surface-dark dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" (click)="submit()" [disabled]="uploading || !files.length"
            class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">
            {{ uploading ? 'Uploading…' : 'Upload' + (files.length ? ' (' + files.length + ')' : '') }}
          </button>
        </div>
      </footer>
    </div>
  `,
  styles: [':host{display:block}'],
})
export class LpoUploadModalComponent {
  private dialogRef = inject<ModalRef<File[]>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as LpoUploadModalData | null;

  files: File[] = [];
  uploading = false;

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    if (!this.files.length || this.uploading) return;
    this.dialogRef.close(this.files);
  }
}

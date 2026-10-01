import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from 'src/app/shared/components/modal';
import { SmartFormModule } from 'src/app/shared/components/smart-form';

export interface DocumentUploadModalData {
  /** Record reference shown as a chip in the header, e.g. the enquiry id. */
  context?: string;
  acceptedFiles: string;
  title?: string;
  maxSizeMb?: number;
}

export interface DocumentUploadModalResult {
  files: File[];
}

/**
 * Generic upload-files modal for detail panels' Documents tab, using the same header/footer
 * layout as EventCreateModalComponent (FormModalShellComponent).
 *
 *   modal.open<DocumentUploadModalResult>(DocumentUploadModalComponent, { width: '680px', data: { context, acceptedFiles } })
 */
@Component({
  selector: 'app-document-upload-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SmartFormModule, FormModalShellComponent],
  template: `
    <app-form-modal-shell
      icon="upload" tone="sky" [title]="data?.title || 'Upload documents'"
      [context]="data?.context" contextEmptyText="Attach one or more files."
      formId="document-upload-form" [invalid]="submitted && !files.length" invalidText="Add at least one file"
      [submitLabel]="'Upload' + (files.length ? ' (' + files.length + ')' : '')" submitIcon="upload" submitShortcutVerb="upload"
      (closed)="close()">
      <form id="document-upload-form" (ngSubmit)="submit()" novalidate>
        <app-sf-section title="Files" columns="1">
          <app-sf-file [(ngModel)]="files" name="files" [accept]="data?.acceptedFiles || ''" [maxSizeMb]="data?.maxSizeMb || 5"></app-sf-file>
        </app-sf-section>
      </form>
    </app-form-modal-shell>
  `,
  styles: [':host{display:block}'],
})
export class DocumentUploadModalComponent {
  private dialogRef = inject<ModalRef<DocumentUploadModalResult>>(ModalRef);
  data = inject(MODAL_DATA, { optional: true }) as DocumentUploadModalData | null;

  files: File[] = [];
  submitted = false;

  close(): void {
    this.dialogRef.close();
  }

  submit(): void {
    this.submitted = true;
    if (!this.files.length) return;
    this.dialogRef.close({ files: this.files });
  }
}

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { RevisionHistoryComponent, RevisionHistoryData } from 'src/app/shared/components/revision-history/revision-history.component';

export type RevisionHistoryModalData = RevisionHistoryData;

/** The revision browser in a dialog, for places with no room for it inline (e.g. the list). */
@Component({
  selector: 'app-revision-history-modal',
  standalone: true,
  imports: [ModalLayoutComponent, RevisionHistoryComponent],
  template: `
    <app-modal-layout
      title="Revision History"
      [subtitle]="data.ref ? 'Commercial content of ' + data.ref + ' at each revision' : 'Commercial content at each revision'"
      [onClose]="close.bind(this)"
      [footerButtons]="footerButtons"
    >
      <app-revision-history class="block p-4" [data]="data"></app-revision-history>
    </app-modal-layout>
  `,
})
export class RevisionHistoryModalComponent {
  readonly footerButtons: ModalFooterButton[] = [{ label: 'Close', theme: 'cancel', onClick: () => this.close() }];

  constructor(
    public dialogRef: MatDialogRef<RevisionHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RevisionHistoryModalData,
  ) {}

  close(): void {
    this.dialogRef.close(null);
  }
}

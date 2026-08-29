import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';

export interface LeaveFormConfirmationDialogData {
  title: string;
  description: string;
  draftButtonText?: string;
  discardButtonText?: string;
}

export type LeaveFormConfirmationResult = 'draft' | 'discard' | null;

@Component({
  selector: 'app-leave-form-confirmation-dialog',
  templateUrl: './leave-form-confirmation-dialog.component.html',
  imports: [CommonModule, NgIconsModule],
})
export class LeaveFormConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<
      LeaveFormConfirmationDialogComponent,
      LeaveFormConfirmationResult
    >,
    @Inject(MAT_DIALOG_DATA) public data: LeaveFormConfirmationDialogData,
  ) {}

  onClose() {
    this.dialogRef.close(null);
  }

  onDiscardAndContinue() {
    this.dialogRef.close('discard');
  }

  onDraftAndContinue() {
    this.dialogRef.close('draft');
  }
}

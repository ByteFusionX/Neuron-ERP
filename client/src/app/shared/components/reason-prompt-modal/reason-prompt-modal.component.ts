import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from '../modal-layout/modal-layout.component';

export interface ReasonPromptModalData {
  title: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
}

@Component({
  selector: 'app-reason-prompt-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalLayoutComponent],
  templateUrl: './reason-prompt-modal.component.html'
})
export class ReasonPromptModalComponent {
  reason = '';
  touched = false;

  constructor(
    public dialogRef: MatDialogRef<ReasonPromptModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ReasonPromptModalData
  ) {}

  onCancel(): void {
    this.dialogRef.close(null);
  }

  get footerButtons(): ModalFooterButton[] {
    return [
      { label: 'Cancel', theme: 'cancel', onClick: () => this.dialogRef.close(null) },
      { label: this.data.confirmLabel || 'Confirm', theme: 'primary', onClick: () => this.onConfirm() }
    ];
  }

  onConfirm(): void {
    this.touched = true;
    if (!this.reason.trim()) {
      return;
    }
    this.dialogRef.close(this.reason.trim());
  }
}

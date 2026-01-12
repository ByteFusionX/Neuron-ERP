import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface ActionConfirmationDialogData {
  title: string;
  description: string;
  icon?: string;
  iconColor?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  commentLabel?: string;
  commentPlaceholder?: string;
  showComment?: boolean;
  requireComment?: boolean;
}

export interface ActionConfirmationDialogResult {
  isConfirmed: boolean;
  comment: string;
}

@Component({
  selector: 'app-action-confirmation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './action-confirmation-dialog.component.html'
})
export class ActionConfirmationDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ActionConfirmationDialogComponent, ActionConfirmationDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: ActionConfirmationDialogData
  ) {
    // Set default values if not provided
    this.data = {
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel',
      commentLabel: 'Comment',
      commentPlaceholder: 'Enter your comment here...',
      showComment: true,
      requireComment: false,
      ...this.data
    };

    // Initialize form
    this.form = this.fb.group({
      comment: ['', this.data.requireComment ? [Validators.required] : []]
    });
  }

  onConfirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close({
      isConfirmed: true,
      comment: this.form.get('comment')?.value?.trim() || ''
    });
  }

  onCancel(): void {
    this.dialogRef.close({
      isConfirmed: false,
      comment: ''
    });
  }
} 
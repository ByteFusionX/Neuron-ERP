import { NgFor, NgIf } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  ModalFooterButton,
  ModalLayoutComponent,
} from 'src/app/shared/components/modal-layout/modal-layout.component';

@Component({
  selector: 'app-view-comment',
  templateUrl: './view-comment.component.html',
  styleUrls: ['./view-comment.component.css'],
  standalone: true,
  imports: [ModalLayoutComponent, NgIf, NgFor],
})
export class ViewCommentComponent {
  footerButtons: ModalFooterButton[] = [
    { label: 'Close', theme: 'cancel', onClick: () => this.onClose() },
  ];

  constructor(
    private dialogRef: MatDialogRef<ViewCommentComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: {
      comment?: string;
      revisionComment?: string[];
      feedbackComment?: string;
    },
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }
}

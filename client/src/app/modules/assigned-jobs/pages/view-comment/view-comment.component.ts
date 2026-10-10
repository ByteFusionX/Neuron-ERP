import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ModalLayoutComponent, ModalFooterButton } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { NgIf, NgFor } from '@angular/common';

@Component({
    selector: 'app-view-comment',
    templateUrl: './view-comment.component.html',
    styleUrls: ['./view-comment.component.css'],
    imports: [ModalLayoutComponent, NgIf, NgFor]
})
export class ViewCommentComponent {
  footerButtons: ModalFooterButton[] = [
    { label: 'Close', theme: 'cancel', onClick: () => this.onClose() },
  ];

  constructor(
    private dialogRef: MatDialogRef<ViewCommentComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { revisionComment?: string[], feedbackComment?: string },
  ) { }

  onClose() {
    this.dialogRef.close()
  }

}

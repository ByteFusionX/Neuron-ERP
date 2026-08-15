import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { NgIf, NgFor } from '@angular/common';

@Component({
    selector: 'app-view-comment',
    templateUrl: './view-comment.component.html',
    styleUrls: ['./view-comment.component.css'],
    imports: [NgIcon, NgIf, NgFor]
})
export class ViewCommentComponent {

  constructor(
    private dialogRef: MatDialogRef<ViewCommentComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { comment: string, revisionComment?: string[], feedbackComment?: string },
  ) { }

  onClose() {
    this.dialogRef.close()
  }

}

import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'app-view-comment',
  standalone: true,
  imports: [CommonModule, NgIcon],
  templateUrl: './view-comment.component.html',
  styleUrl: './view-comment.component.css'
})
export class ViewCommentComponent {
  constructor(
    private dialogRef: MatDialogRef<ViewCommentComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { comment: string }
  ) { }

  onClose() {
    this.dialogRef.close();
  }
}

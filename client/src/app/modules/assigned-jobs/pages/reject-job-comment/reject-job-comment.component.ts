import { Component } from '@angular/core';
import {  MatDialogRef,  } from '@angular/material/dialog';
import { FormBuilder, Validators } from '@angular/forms';
import { FormGroup } from '@angular/forms';

@Component({
    selector: 'app-reject-job-comment',
    templateUrl: './reject-job-comment.component.html',
    styleUrls: ['./reject-job-comment.component.css'],
    standalone: false
})
export class RejectJobCommentComponent {
  rejectForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<RejectJobCommentComponent>,
  ) {
    this.rejectForm = this.fb.group({
      comment: ['', Validators.required]
    });
  }

  ngOnInit(): void {}

  onSubmit(): void {
    if (this.rejectForm.valid) {
      const comment = this.rejectForm.value.comment;
      this.dialogRef.close(comment)
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}

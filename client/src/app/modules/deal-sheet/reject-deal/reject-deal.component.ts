import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NgIf } from '@angular/common';

@Component({
    selector: 'app-reject-deal',
    templateUrl: './reject-deal.component.html',
    styleUrls: ['./reject-deal.component.css'],
    imports: [NgIf, FormsModule, ReactiveFormsModule]
})
export class RejectDealComponent {
  rejectForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<RejectDealComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { reject: boolean  },
  ) {
    this.rejectForm = this.fb.group({
      comment: ['', Validators.required]
    });
  }

  ngOnInit(): void {}

  onSubmit(): void {
    if (this.rejectForm.valid || !this.data.reject) {
      const comment = this.rejectForm.value.comment;
      this.dialogRef.close({submit:true,comment})
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}

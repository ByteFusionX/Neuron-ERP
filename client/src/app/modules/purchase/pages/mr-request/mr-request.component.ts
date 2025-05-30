import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-mr-request',
  imports: [
    NgIcon,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
  ],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent implements OnInit {

  private fb = inject(FormBuilder);
  private toaster = inject(ToastrService)
  isSubmitted = signal<boolean>(false);

  mrForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    engineer: ['', [Validators.required]],
    message: ['', [Validators.required]]
  })

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private dialogRef: MatDialogRef<MrRequestComponent>) { }

  ngOnInit(): void {
    if (this.data.job.jobId) {
      this.mrForm.patchValue({
        jobId: this.data.job.job,
        engineer: this.data.job?.mrRequest?.engineer || '',
        message: this.data.job?.mrRequest?.message || '',
      })
    }
  }

  onCloseClicks() {
    this.mrForm.reset()
    this.dialogRef.close()
  }

  onSubmit() {
    if (this.mrForm.invalid) {
      this.toaster.warning("Please fill all required fields correctly")
    } else {
      this.dialogRef.close(this.mrForm.value)
    }
  }

  onClearClicks(){
    this.mrForm.get('engineer')?.reset()
    this.mrForm.get('message')?.reset()
    this.dialogRef.close(this.mrForm.value)
  }

  get f() {
    return this.mrForm.controls;
  }
}

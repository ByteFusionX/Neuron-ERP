import { Component, Inject, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { getJob } from 'src/app/shared/interfaces/job.interface';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';

@Component({
  selector: 'app-mr-request',
  imports: [
    NgIcon,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormFieldComponent,
    SelectDropdownComponent
  ],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent implements OnInit {

  private fb = inject(FormBuilder);
  isSubmitted = signal<boolean>(false);

  jobSheets = signal<getJob[]>([]);
  mrForm: FormGroup = this.fb.group({
    jobId: ['', [Validators.required]],
    engineer: ['', [Validators.required]],
    message: ['', [Validators.required]]
  })

  constructor(@Inject(MAT_DIALOG_DATA) public data: any, private dialogRef: MatDialogRef<MrRequestComponent>) { }

  ngOnInit(): void {
    if (this.data.job.jobId) {
      this.mrForm.patchValue({
        jobId: this.data.job.jobId
      })
    } else {
      this.jobSheets.set(this.data.job)
    }
  }

  onCloseClicks() {
    this.dialogRef.close()
  }

  onSubmit() { }

  get f() {
    return this.mrForm.controls;
  }
}

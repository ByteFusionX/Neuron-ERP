import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { NgIconsModule } from '@ng-icons/core';

export interface AssignEngineerDialogData {
  engineerOptions: { label: string; value: string }[];
  priorityOptions: { label: string; value: string }[];
  selectedEngineer?: string;
  selectedPriority?: string;
  assignComment?: string;
}

export interface AssignEngineerDialogResult {
  engineerId: string;
  priority: string;
  comment: string;
}

@Component({
  selector: 'app-assign-engineer-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    DropdownModule,
    NgIconsModule
  ],
  templateUrl: './assign-engineer-dialog.component.html',
  styleUrls: ['./assign-engineer-dialog.component.css']
})
export class AssignEngineerDialogComponent implements OnInit {
  form: FormGroup;
  engineerOptions: { label: string; value: string }[] = [];
  priorityOptions: { label: string; value: string }[] = [];

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<AssignEngineerDialogComponent, AssignEngineerDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: AssignEngineerDialogData
  ) {
    this.engineerOptions = data.engineerOptions || [];
    this.priorityOptions = data.priorityOptions || [];

    this.form = this.fb.group({
      engineerId: ['', Validators.required],
      priority: ['', Validators.required],
      comment: ['']
    });

    // Set initial values if provided
    if (data.selectedEngineer) {
      this.form.patchValue({ engineerId: data.selectedEngineer });
    }
    if (data.selectedPriority) {
      this.form.patchValue({ priority: data.selectedPriority });
    }
    if (data.assignComment) {
      this.form.patchValue({ comment: data.assignComment });
    }
  }

  ngOnInit(): void {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.value;
    this.dialogRef.close({
      engineerId: formValue.engineerId,
      priority: formValue.priority,
      comment: formValue.comment || ''
    });
  }
}





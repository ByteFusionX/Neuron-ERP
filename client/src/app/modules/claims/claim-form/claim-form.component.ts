import { CommonModule } from '@angular/common';
import { Component, inject, Inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { FormFieldComponent } from 'src/app/shared/components/forms/form-field/form-field.component';
import { UploadFileComponent } from 'src/app/shared/components/upload-file/upload-file.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { SelectDropdownComponent } from 'src/app/shared/components/forms/select-dropdown/select-dropdown.component';

export interface ClaimFormData {
  claim?: any;
  type: 'normal' | 'project';
  mode: 'create' | 'edit';
  technicalId?: string;
  jobId?: string;
}

@Component({
  selector: 'app-claim-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    UploadFileComponent,
    ButtonComponent,
    SelectDropdownComponent
  ],
  templateUrl: './claim-form.component.html',
  styleUrls: ['./claim-form.component.css']
})
export class ClaimFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  
  claimForm: FormGroup;
  isSubmitted = signal(false);
  isSaving = signal(false);
  selectedFiles: any[] = [];
  categoryOptions = [
    { name: 'Manpower', value: 'manpower' },
    { name: 'Others', value: 'others' }
  ];

  constructor(
    public dialogRef: MatDialogRef<ClaimFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ClaimFormData
  ) {
    console.log(this.data);
    this.claimForm = this.fb.group({
      reason: ['', [Validators.required]],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      jobId: [''],
      type: [this.data.type, [Validators.required]],
      category: ['']
    });
  }

  ngOnInit(): void {
    if (this.data.claim && this.data.mode === 'edit') {
      this.populateForm(this.data.claim);
    }
  }

  populateForm(claim: any): void {
    this.claimForm.patchValue({
      reason: claim.reason,
      amount: claim.amount,
      type: claim.type
    });

    if (claim.attachements && claim.attachements.length > 0) {
      this.selectedFiles = claim.attachements.map((att: any) => ({
        name: att.originalname || att.fileName,
        originalname: att.originalname,
        fileName: att.fileName
      }));
    }
  }

  onFileUpload(files: File[]): void {
    this.selectedFiles = files;
    console.log(this.selectedFiles, "selectedFiles")
  }

  onSubmit(): void {
    this.isSubmitted.set(true);

    if (this.claimForm.invalid) {
      return;
    }

    this.isSaving.set(true);

    const formValue = this.claimForm.value;
    const formData = new FormData();
    
    formData.append('reason', formValue.reason);
    formData.append('amount', formValue.amount.toString());
    formData.append('type', formValue.type);
    if(formValue.jobId){
      formData.append('jobId', formValue.jobId);
    }

    if (this.data.technicalId) {
      formData.append('technicalId', this.data.technicalId);
    }

    

    // Handle file attachments
    const newFiles = this.selectedFiles.filter(file => file instanceof File);
    
    // For edit mode, handle new attachments separately
    if (this.data.mode === 'edit') {
      newFiles.forEach((file) => {
        formData.append('newAttachments', file);
      });

      const removedFiles = this.data.claim.attachements.filter((file: any) => {
        return file.originalname && 
               !this.selectedFiles.some(f => f.originalname === file.originalname);
      });

      formData.append('filesToRemove', JSON.stringify(removedFiles));
    } else {
      newFiles.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    this.dialogRef.close(formData);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  get f() {
    return this.claimForm.controls;
  }

  get formTitle(): string {
    const typeText = this.data.type === 'project' ? 'Project' : '';
    const modeText = this.data.mode === 'edit' ? 'Edit' : 'Create';
    return `${modeText} ${typeText} Claim`;
  }
}

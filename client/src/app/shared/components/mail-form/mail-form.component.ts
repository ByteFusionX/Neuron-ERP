import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, Inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormFieldComponent } from '../forms/form-field/form-field.component';
import { EmailTagInputComponent } from '../forms/email-tag-input/email-tag-input.component';
import { UploadFileComponent } from '../upload-file/upload-file.component';
import { ButtonComponent } from '../button/button.component';
import { NgIconsModule } from '@ng-icons/core';
import { MsalService } from '@azure/msal-angular';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';

export interface ProjectUpdate {
  _id?: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  message: string;
  attachments: { fileName: string; originalname: string }[];
  status: 'Drafted' | 'Sent';
  updatedBy: string;
  updatedAt: Date;
}

export interface MailFormData {
  mailData?: ProjectUpdate;
  currentUser?: string;
}

@Component({
  selector: 'app-mail-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormFieldComponent,
    EmailTagInputComponent,
    UploadFileComponent,
    ButtonComponent,
    NgIconsModule,
    ModalLayoutComponent
  ],
  templateUrl: './mail-form.component.html',
  styleUrl: './mail-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MailFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private msalService = inject(MsalService);
  
  mailForm: FormGroup;
  isSubmitted = signal(false);
  isSaving = signal(false);
  selectedFiles: any[] = [];
  showCC = signal(false);

  constructor(
    public dialogRef: MatDialogRef<MailFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MailFormData
  ) {
    this.mailForm = this.fb.group({
      subject: ['', [Validators.required]],
      from: ['', [Validators.required, Validators.email]],
      to: [[], [Validators.required]],
      cc: [[]],
      message: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    const activeAccount = this.msalService.instance.getActiveAccount();
    if (activeAccount?.username) {
      this.mailForm.patchValue({
        from: activeAccount.username
      });
    } else if (this.data?.currentUser) {
      this.mailForm.patchValue({
        from: this.data.currentUser
      });
    }

    if (this.data?.mailData) {
      this.populateForm(this.data.mailData);
    }
  }

  populateForm(mailData: ProjectUpdate): void {
    this.mailForm.patchValue({
      subject: mailData.subject,
      from: mailData.from,
      to: mailData.to,
      cc: mailData.cc || [],
      message: mailData.message
    });

    if (mailData.attachments && mailData.attachments.length > 0) {
      this.selectedFiles = mailData.attachments.map(att => ({
        name: att.originalname,
        fileName: att.fileName
      }));
    }

    if (mailData.cc && mailData.cc.length > 0) {
      this.showCC.set(true);
    }
  }

  toggleCC(): void {
    this.showCC.set(!this.showCC());
    if (!this.showCC()) {
      this.mailForm.patchValue({ cc: [] });
    }
  }

  onFileUpload(files: File[]): void {
    this.selectedFiles = files;
  }

  onDraft(): void {
    this.submitForm('Drafted');
  }

  onSend(): void {
    this.submitForm('Sent');
  }

  private submitForm(status: 'Drafted' | 'Sent'): void {
    this.isSubmitted.set(true);

    if (this.mailForm.invalid) {
      return;
    }

    this.isSaving.set(true);

    const formValue = this.mailForm.value;
    
    const formData = new FormData();
    
    if (this.data?.mailData?._id) {
      formData.append('_id', this.data.mailData._id);
    }
    formData.append('subject', formValue.subject);
    formData.append('from', formValue.from);
    formData.append('to', formValue.to);
    formData.append('cc', formValue.cc);
    formData.append('message', formValue.message);
    formData.append('status', status);
    
    this.selectedFiles.forEach((file, index) => {
      if (file instanceof File) {
        formData.append('attachments', file);
      } else if (file.file && file.file instanceof File) {
        formData.append('attachments', file.file);
      }
    });

    this.dialogRef.close(formData);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getFooterButtons(): any[] {
    const buttons: any[] = [
      { label: 'Cancel', onClick: this.onCancel.bind(this), theme: 'cancel' }
    ];
    
    if (!this.data.mailData) {
      buttons.push({
        label: 'Save Draft',
        onClick: this.onDraft.bind(this),
        theme: 'secondary',
        disabled: this.isSaving(),
        icon: 'heroCloudArrowUp'
      });
    }
    
    buttons.push({
      label: this.data.mailData ? 'Edit & Send' : 'Send',
      onClick: this.onSend.bind(this),
      theme: 'primary',
      loading: this.isSaving(),
      disabled: this.isSaving(),
      icon: 'heroPaperAirplane'
    });
    
    return buttons;
  }

  get f() {
    return this.mailForm.controls;
  }
}

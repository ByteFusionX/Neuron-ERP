import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MailFormComponent, MailFormData, ProjectUpdate } from './mail-form.component';

@Injectable()
export class MailFormService {
  private dialog = inject(MatDialog);

  // Open mail form for composing new email
  openComposeMail(currentUser: string): Promise<ProjectUpdate | undefined> {
    const dialogRef = this.dialog.open(MailFormComponent, {
      width: '800px',
      maxWidth: '90vw',
      height: 'auto',
      maxHeight: '90vh',
      data: {
        currentUser: currentUser
      } as MailFormData,
      disableClose: false,
      autoFocus: false
    });

    return dialogRef.afterClosed().toPromise();
  }

  // Open mail form for editing existing email
  openEditMail(mailData: ProjectUpdate, currentUser: string): Promise<ProjectUpdate | undefined> {
    const dialogRef = this.dialog.open(MailFormComponent, {
      width: '800px',
      maxWidth: '90vw',
      height: 'auto',
      maxHeight: '90vh',
      data: {
        mailData: mailData,
        currentUser: currentUser
      } as MailFormData,
      disableClose: false,
      autoFocus: false
    });

    return dialogRef.afterClosed().toPromise();
  }
}

/* 
USAGE EXAMPLE IN COMPONENT:

import { Component, inject } from '@angular/core';
import { MailFormService } from './path/to/mail-form-service';

@Component({
  selector: 'app-example',
  template: `
    <button (click)="openComposeMail()">Compose Mail</button>
    <button (click)="openEditMail()" *ngIf="existingMail">Edit Mail</button>
  `
})
export class ExampleComponent {
  private mailFormService = inject(MailFormService);
  
  existingMail: ProjectUpdate | null = null;
  currentUser = 'user@example.com'; // Get from auth service
  
  async openComposeMail() {
    try {
      const result = await this.mailFormService.openComposeMail(this.currentUser);
      if (result) {
        console.log('Mail data:', result);
        // Handle the result based on status
        if (result.status === 'Sent') {
          // Send the email
          await this.sendEmail(result);
        } else if (result.status === 'Drafted') {
          // Save as draft
          await this.saveDraft(result);
        }
      }
    } catch (error) {
      console.error('Error opening mail form:', error);
    }
  }
  
  async openEditMail() {
    if (!this.existingMail) return;
    
    try {
      const result = await this.mailFormService.openEditMail(this.existingMail, this.currentUser);
      if (result) {
        console.log('Updated mail data:', result);
        // Handle the updated result
        if (result.status === 'Sent') {
          await this.sendEmail(result);
        } else if (result.status === 'Drafted') {
          await this.updateDraft(result);
        }
      }
    } catch (error) {
      console.error('Error opening edit mail form:', error);
    }
  }
  
  private async sendEmail(mailData: ProjectUpdate) {
    // Implement email sending logic
    console.log('Sending email:', mailData);
  }
  
  private async saveDraft(mailData: ProjectUpdate) {
    // Implement draft saving logic
    console.log('Saving draft:', mailData);
  }
  
  private async updateDraft(mailData: ProjectUpdate) {
    // Implement draft updating logic
    console.log('Updating draft:', mailData);
  }
}

// Don't forget to provide MailFormService in your component or module:
// providers: [MailFormService]
*/ 
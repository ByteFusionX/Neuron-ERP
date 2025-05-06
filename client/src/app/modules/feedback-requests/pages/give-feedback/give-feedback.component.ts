import { Component } from '@angular/core';
import {  MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { FormsModule } from '@angular/forms';
import { NgClass, NgIf } from '@angular/common';

@Component({
    selector: 'app-give-feedback',
    templateUrl: './give-feedback.component.html',
    styleUrls: ['./give-feedback.component.css'],
    imports: [NgIcon, FormsModule, NgClass, NgIf]
})
export class GiveFeedbackComponent {
  feedback!:string;
  showError:boolean = false;
  constructor(
    public dialogRef: MatDialogRef<GiveFeedbackComponent>,
  ) {  }

  onSubmit(){
    if(this.feedback){
      this.dialogRef.close(this.feedback)
    }else{
      this.showError = true;
    }
  }

  validateComment() {
    if (!this.feedback) {
      this.showError = true;
    } else {
      this.showError = false;
    }
  }

  onClose() {
    this.dialogRef.close()
  }
}

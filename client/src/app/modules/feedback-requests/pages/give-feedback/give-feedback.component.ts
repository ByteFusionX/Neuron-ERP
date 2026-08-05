import { Component } from '@angular/core';
import {  MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-give-feedback',
    templateUrl: './give-feedback.component.html',
    styleUrls: ['./give-feedback.component.css'],
    standalone: false
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

import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-mr-request',
  imports: [NgIcon, CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './mr-request.component.html',
  styleUrl: './mr-request.component.css'
})
export class MrRequestComponent {
  constructor(private dialogRef: MatDialogRef<MrRequestComponent>) { }

  onCloseClicks() {
    this.dialogRef.close()
  }
}

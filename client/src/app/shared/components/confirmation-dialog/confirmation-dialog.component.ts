import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';

@Component({
    selector: 'app-confirmation-dialog',
    templateUrl: './confirmation-dialog.component.html',
    styleUrls: ['./confirmation-dialog.component.css'],
    imports: [CommonModule, NgIconsModule]
})
export class ConfirmationDialogComponent implements OnInit {
  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string, description: string, icon: string, IconColor: string },
  ) { }

  textColor!: string;

  ngOnInit(): void {
    this.textColor = `text-${this.data.IconColor}-500`;
  }

  onClose() {
    this.dialogRef.close(false)
  }

  onApproved() {
    this.dialogRef.close(true)
  }
}

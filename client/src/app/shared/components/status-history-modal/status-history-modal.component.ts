import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ButtonComponent } from '../button/button.component';

export interface StatusHistoryItem {
  rejectedBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  comment: string;
  rejectedAt: string;
  _id: string;
}

export interface StatusHistoryData {
  title: string;
  history: StatusHistoryItem[];
}

@Component({
  selector: 'app-status-history-modal',
  standalone: true,
  imports: [CommonModule, IconsModule, ButtonComponent],
  templateUrl: './status-history-modal.component.html',
  styleUrls: ['./status-history-modal.component.css']
})
export class StatusHistoryModalComponent {
  constructor(
    public dialogRef: MatDialogRef<StatusHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: StatusHistoryData
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

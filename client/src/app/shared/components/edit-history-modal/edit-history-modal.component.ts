import { Component, Inject } from '@angular/core';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { EditHistoryEntry } from 'src/app/shared/interfaces/quotation.interface';

interface HistoryStep {
  title: string;
  person?: string;
  note?: string;
  date?: string | Date | null;
  icon: string;
  state: 'done' | 'current' | 'rejected';
}

@Component({
  selector: 'app-edit-history-modal',
  standalone: true,
  imports: [NgIcon, NgFor, NgIf, DatePipe],
  templateUrl: './edit-history-modal.component.html',
  styleUrls: ['./edit-history-modal.component.css']
})
export class EditHistoryModalComponent {
  steps: HistoryStep[] = [];

  constructor(
    public dialogRef: MatDialogRef<EditHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { editHistory: EditHistoryEntry[] }
  ) {
    this.steps = this.buildSteps(data?.editHistory || []);
  }

  private name(person: any): string {
    if (!person) return '';
    return `${person.firstName || ''} ${person.lastName || ''}`.trim();
  }

  private buildSteps(history: EditHistoryEntry[]): HistoryStep[] {
    return history.map((entry) => {
      const who = this.name(entry.editedBy) || 'Unknown';
      let title = `Updated by ${who}`;
      let icon = 'heroPencilSquare';
      let state: HistoryStep['state'] = 'done';

      switch (entry.action) {
        case 'Created':
          title = `Drafted by ${who}`;
          icon = 'heroDocumentPlus';
          break;
        case 'Updated':
          title = `Edited by ${who}`;
          icon = 'heroPencilSquare';
          break;
        case 'StatusChanged':
          title = `Status changed by ${who}`;
          icon = 'heroArrowPath';
          break;
        case 'DealApproved':
          title = `Deal approved by ${who}`;
          icon = 'heroCheckCircle';
          break;
        case 'DealRejected':
          title = `Deal rejected by ${who}`;
          icon = 'heroXMark';
          state = 'rejected';
          break;
        case 'DealRevoked':
          title = `Approval revoked by ${who}`;
          icon = 'heroExclamationCircle';
          state = 'current';
          break;
      }

      return {
        title,
        note: entry.fromStatus || entry.toStatus
          ? `${entry.fromStatus || '—'} → ${entry.toStatus || '—'}`
          : entry.reason,
        person: entry.reason && (entry.fromStatus || entry.toStatus) ? entry.reason : undefined,
        date: entry.editedAt,
        icon,
        state
      };
    });
  }

  closeModal(): void {
    this.dialogRef.close();
  }
}

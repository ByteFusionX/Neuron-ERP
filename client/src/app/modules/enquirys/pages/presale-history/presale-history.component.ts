import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';

interface HistoryStep {
  title: string;
  person?: string;
  role?: string;
  note?: string;
  date?: string | Date | null;
  icon: string;
  state: 'done' | 'current' | 'rejected';
}

@Component({
  selector: 'app-presale-history',
  templateUrl: './presale-history.component.html',
  imports: [NgIcon, NgFor, NgIf, DatePipe, MatTooltipModule],
})
export class PresaleHistoryComponent {
  steps: HistoryStep[] = [];

  constructor(
    private dialogRef: MatDialogRef<PresaleHistoryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.steps = this.buildSteps(data);
  }

  get statusText(): string {
    return this.statusLabel(this.data?.status);
  }

  private statusLabel(status: string): string {
    const inPresales = [
      'Assigned To Presale Manager',
      'Assigned To Presale Engineer',
      'Rejected by Presale Engineer',
    ];
    if (inPresales.includes(status)) return 'In Presales';
    if (status === 'Work In Progress') return 'In Progress';
    return status;
  }

  private name(person: any): string {
    if (!person) return '';
    return `${person.firstName || ''} ${person.lastName || ''}`.trim();
  }

  private buildSteps(enquiry: any): HistoryStep[] {
    const steps: HistoryStep[] = [];
    const preSale = enquiry?.preSale;
    const history = enquiry?.assignmentHistory || [];

    if (history.length) {
      history.forEach((entry: any) => {
        const who = entry?.employeeName || this.name(entry?.employee);
        steps.push({
          title:
            entry?.action === 'reassigned'
              ? `Reassigned to ${who || 'Presale Engineer'}`
              : `Assigned to ${who || 'Presale Manager'}`,
          role: entry?.role,
          note: entry?.assignedByName ? `By ${entry.assignedByName}` : undefined,
          date: entry?.date,
          icon: entry?.action === 'reassigned' ? 'heroArrowPath' : 'heroUserPlus',
          state: 'done',
        });
      });
    } else {
      if (preSale?.presalePerson) {
        steps.push({
          title: `Assigned to ${this.name(preSale.presalePerson) || 'Presale Manager'}`,
          role:
            preSale.presalePerson?.category?.role ||
            preSale.presalePerson?.designation ||
            'Presale Manager',
          date: preSale?.createdDate,
          icon: 'heroUserPlus',
          state: 'done',
        });
      }

      if (enquiry?.reAssigned) {
        steps.push({
          title: `Reassigned to ${this.name(enquiry.reAssigned) || 'Presale Engineer'}`,
          role:
            enquiry.reAssigned?.category?.role ||
            enquiry.reAssigned?.designation ||
            'Presale Engineer',
          date: enquiry?.reAssignedDate,
          icon: 'heroArrowPath',
          state: 'done',
        });
      }
    }

    (preSale?.rejectionHistory || []).forEach((rejection: any) => {
      steps.push({
        title: `Rejected by ${this.name(rejection?.employeeId) || rejection?.rejectedRole || 'Presale'}`,
        role: rejection?.rejectedRole,
        note: rejection?.rejectionReason,
        date: rejection?.rejectedAt,
        icon: 'heroXMark',
        state: 'rejected',
      });
    });

    steps.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    if (preSale?.estimations) {
      steps.push({
        title: 'Estimation Uploaded',
        person: this.name(enquiry?.reAssigned || preSale?.presalePerson),
        icon: 'heroCheckCircle',
        state: 'done',
      });
    } else {
      steps.push({
        title: 'Estimation Pending',
        note: 'Awaiting estimation upload from presales',
        icon: 'heroClock',
        state: 'current',
      });
    }

    return steps;
  }

  onFollowUp() {
    // TODO: wire follow-up action (ask presales for an update on this enquiry)
  }

  closeModal() {
    this.dialogRef.close();
  }
}

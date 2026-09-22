import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { SmartFormModule } from 'src/app/shared/components/smart-form';
import { ActionButtonComponent } from 'src/app/shared/components/action-button/action-button.component';

export interface RejectionEntry {
  rejectionReason?: string;
  rejectedRole?: string;
  employeeId?: { firstName?: string; lastName?: string } | null;
  rejectedAt?: string | Date | null;
}

/** Read-only slide-over listing an enquiry's presale rejections. The host binds `open` and `rejections`. */
@Component({
  selector: 'app-rejection-history-drawer',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, SmartFormModule, ActionButtonComponent],
  template: `
    <app-sf-drawer title="Rejection History" subtitle="Presale rejections for this enquiry" width="480px"
        [open]="open" (closed)="closed.emit()">
      <p *ngIf="!rejections?.length" class="py-8 text-center text-sm italic text-gray-500 dark:text-gray-400">No rejections</p>
      <ul class="space-y-3">
        <li *ngFor="let r of rejections" class="rounded-lg border border-gray-200 dark:border-erp-border-dark px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ r.employeeId?.firstName ? r.employeeId?.firstName + ' ' + (r.employeeId?.lastName || '') : (r.rejectedRole || 'Presale') }}
            </p>
            <p *ngIf="r.rejectedAt" class="shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ r.rejectedAt | date: 'dd MMM yyyy' }}</p>
          </div>
          <p class="mt-1 text-[13px] text-gray-700 dark:text-gray-300">{{ r.rejectionReason || 'No reason given' }}</p>
        </li>
      </ul>
      <ng-container sfDrawerFooter>
        <app-action-button variant="secondary" (click)="closed.emit()">Close</app-action-button>
      </ng-container>
    </app-sf-drawer>
  `,
})
export class RejectionHistoryDrawerComponent {
  @Input() open = false;
  @Input() rejections: RejectionEntry[] | null = null;
  @Output() closed = new EventEmitter<void>();
}

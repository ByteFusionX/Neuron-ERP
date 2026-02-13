import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconsModule } from 'src/app/lib/icons/icons.module';
import { ModalLayoutComponent } from '../modal-layout/modal-layout.component';
import { JobHistoryService } from 'src/app/core/services/job/job-history.service';
import { JobWorkflowTimeline, TimelineEvent } from 'src/app/shared/interfaces/job-history.interface';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-job-history-modal',
  standalone: true,
  imports: [CommonModule, IconsModule, ModalLayoutComponent],
  templateUrl: './job-history-modal.component.html',
  styleUrls: ['./job-history-modal.component.css']
})
export class JobHistoryModalComponent implements OnInit {
  timelineData: JobWorkflowTimeline | null = null;
  isLoading: boolean = true;
  expandedEvents: Set<string> = new Set();

  constructor(
    public dialogRef: MatDialogRef<JobHistoryModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { jobId: string; jobIdString?: string },
    private jobHistoryService: JobHistoryService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadJobHistory();
  }

  loadJobHistory(): void {
    this.isLoading = true;
    this.jobHistoryService.getJobHistory(this.data.jobId).subscribe({
      next: (response) => {
        if (response.success) {
          this.timelineData = response.data;
        } else {
          this.toastr.error('Failed to load job history');
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading job history:', error);
        this.toastr.error('Error loading job history');
        this.isLoading = false;
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getRelativeTime(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return this.formatDate(date);
  }

  getEventIcon(event: TimelineEvent): string {
    switch (event.eventType) {
      case 'drafted':
      case 'created':
        return 'heroPlusCircle';
      case 'sent_for_approval':
        return 'heroArrowRightCircle';
      case 'approved':
        return 'heroCheckCircle';
      case 'rejected':
        return 'heroXCircle';
      case 'resubmitted':
        return 'heroArrowPath';
      case 'revoked':
        return 'heroNoSymbol';
      case 'closed':
      case 'completed':
        return 'heroCheckBadge';
      case 'assigned':
        return 'heroUserPlus';
      default:
        return 'heroInformationCircle';
    }
  }

  getEventColorClass(event: TimelineEvent): string {
    switch (event.status) {
      case 'success':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'info':
      default:
        return 'bg-blue-100 text-blue-700 border-blue-300';
    }
  }

  getPipelineBadgeClass(pipeline: string): string {
    switch (pipeline) {
      case 'purchaseRequest':
        return 'bg-purple-100 text-purple-700';
      case 'purchaseOrder':
        return 'bg-indigo-100 text-indigo-700';
      case 'grn':
        return 'bg-teal-100 text-teal-700';
      case 'technical':
        return 'bg-orange-100 text-orange-700';
      case 'deliveryNote':
        return 'bg-pink-100 text-pink-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  getPipelineLabel(pipeline: string): string {
    switch (pipeline) {
      case 'purchaseRequest':
        return 'PR';
      case 'purchaseOrder':
        return 'PO';
      case 'grn':
        return 'GRN';
      case 'technical':
        return 'Technical';
      case 'deliveryNote':
        return 'DN';
      default:
        return pipeline;
    }
  }

  toggleEvent(eventId: string): void {
    if (this.expandedEvents.has(eventId)) {
      this.expandedEvents.delete(eventId);
    } else {
      this.expandedEvents.add(eventId);
    }
  }

  isEventExpanded(eventId: string): boolean {
    return this.expandedEvents.has(eventId);
  }

  getStatusBadgeClass(status: string | null): string {
    if (!status) return 'bg-gray-100 text-gray-600';
    
    const statusLower = status.toLowerCase();
    if (statusLower.includes('approved') || statusLower.includes('completed') || statusLower === 'closed') {
      return 'bg-green-100 text-green-700';
    }
    if (statusLower.includes('rejected') || statusLower.includes('cancelled')) {
      return 'bg-red-100 text-red-700';
    }
    if (statusLower.includes('pending') || statusLower.includes('draft')) {
      return 'bg-yellow-100 text-yellow-700';
    }
    return 'bg-blue-100 text-blue-700';
  }

  trackByEventId(index: number, event: TimelineEvent): string {
    return event.id;
  }
}

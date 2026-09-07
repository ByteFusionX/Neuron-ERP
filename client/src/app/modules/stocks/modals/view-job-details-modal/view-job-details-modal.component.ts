import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { ModalLayoutComponent } from 'src/app/shared/components/modal-layout/modal-layout.component';
import { JobService } from 'src/app/core/services/job/job.service';

export interface ViewJobDetailsModalData {
  jobId: string;
}

@Component({
  selector: 'app-view-job-details-modal',
  standalone: true,
  imports: [CommonModule, ModalLayoutComponent],
  templateUrl: './view-job-details-modal.component.html',
  styleUrls: ['./view-job-details-modal.component.css']
})
export class ViewJobDetailsModalComponent implements OnInit {
  job: any = null;
  isLoading = signal<boolean>(true);

  constructor(
    public dialogRef: MatDialogRef<ViewJobDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ViewJobDetailsModalData,
    private jobService: JobService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadJob();
  }

  loadJob(): void {
    this.isLoading.set(true);
    this.jobService.getOneJob(this.data.jobId).subscribe({
      next: (response: any) => {
        this.job = Array.isArray(response) ? response[0] : (response?.data || response);
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error fetching job details:', error);
        this.toastr.error('Failed to load job details');
        this.isLoading.set(false);
      }
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatEmployeeName(employee: any): string {
    if (!employee) return 'N/A';
    if (typeof employee === 'string') return employee;
    if (employee.firstName && employee.lastName) {
      return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.firstName || employee.lastName || 'N/A';
  }
}

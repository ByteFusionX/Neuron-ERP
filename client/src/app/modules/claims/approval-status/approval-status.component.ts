import { CommonModule } from '@angular/common';
import { Component, inject, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgIconComponent } from '@ng-icons/core';
import { Observable } from 'rxjs';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';

@Component({
  selector: 'app-approval-status',
  standalone: true,
  imports: [CommonModule, ButtonComponent, NgIconComponent],
  templateUrl: './approval-status.component.html',
  styleUrls: ['./approval-status.component.css']
})
export class ApprovalStatusComponent {
  
  openAccordions: boolean[] = [];
  
  constructor(
    public dialogRef: MatDialogRef<ApprovalStatusComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { claim: any }
  ) {
    // Initialize accordion states - open the current (last) one by default
    this.initializeAccordionStates();
  }

  private initializeAccordionStates(): void {
    const histories = this.getApprovalHistories();
    this.openAccordions = new Array(histories.length).fill(false);
    // Open the current (last) history by default
    if (histories.length > 0) {
      this.openAccordions[histories.length - 1] = true;
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'approved': return 'text-green-600 bg-green-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'approved': return 'heroCheckCircle';
      case 'rejected': return 'heroXCircle';
      case 'pending': return 'heroClock';
      default: return 'heroQuestionMarkCircle';
    }
  }

  getManagerApprovalStatus(approval: any): string {
    if (approval.updatedBy) {
      return approval.status || 'approved';
    }
    return 'pending';
  }

  getManagerApprovalClasses(approval: any): string {
    const status = this.getManagerApprovalStatus(approval);
    switch (status) {
      case 'approved': return 'bg-green-50 border-green-200';
      case 'rejected': return 'bg-red-50 border-red-200';
      case 'pending': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  }

  getManagerApprovalIconClasses(approval: any): string {
    const status = this.getManagerApprovalStatus(approval);
    switch (status) {
      case 'approved': return 'bg-green-500 text-white';
      case 'rejected': return 'bg-red-500 text-white';
      case 'pending': return 'bg-yellow-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }

  getManagerApprovalTextClasses(approval: any): string {
    const status = this.getManagerApprovalStatus(approval);
    switch (status) {
      case 'approved': return 'text-green-800';
      case 'rejected': return 'text-red-800';
      case 'pending': return 'text-yellow-800';
      default: return 'text-gray-800';
    }
  }

  getManagerApprovalSubtextClasses(approval: any): string {
    const status = this.getManagerApprovalStatus(approval);
    switch (status) {
      case 'approved': return 'text-green-600';
      case 'rejected': return 'text-red-600';
      case 'pending': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  }

  getStepClasses(approval: any): string {
    const baseClasses = 'flex items-center gap-4 p-4 border rounded-lg';
    switch (approval.status) {
      case 'approved': return `${baseClasses} border-green-200 bg-green-50`;
      case 'rejected': return `${baseClasses} border-red-200 bg-red-50`;
      case 'pending': return `${baseClasses} border-yellow-200 bg-yellow-50`;
      default: return `${baseClasses} border-gray-200 bg-gray-50`;
    }
  }

  getStepNumberClasses(approval: any): string {
    const baseClasses = 'flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center font-semibold';
    switch (approval.status) {
      case 'approved': return `${baseClasses} border-green-500 bg-green-500 text-white`;
      case 'rejected': return `${baseClasses} border-red-500 bg-red-500 text-white`;
      case 'pending': return `${baseClasses} border-yellow-500 bg-yellow-500 text-white`;
      default: return `${baseClasses} border-gray-300 bg-white text-gray-600`;
    }
  }

  getApprovalHistories(): any[] {
    if (!this.data.claim.approvalStatus || this.data.claim.approvalStatus.length === 0) {
      return [];
    }

    const histories: any[] = [];
    let currentHistory: any[] = [];
    let lastStep = 0;

    for (const approval of this.data.claim.approvalStatus) {
      // If step number is less than or equal to last step, it's a new cycle
      if (approval.step <= lastStep && currentHistory.length > 0) {
        histories.push([...currentHistory]);
        currentHistory = [];
      }
      
      currentHistory.push(approval);
      lastStep = approval.step;
    }

    // Add the last history
    if (currentHistory.length > 0) {
      histories.push(currentHistory);
    }

    return histories;
  }

  getHistoryTitle(history: any[], index: number): string {
    const histories = this.getApprovalHistories();
    const isCurrentHistory = index === histories.length - 1;
    
    if (isCurrentHistory) {
      return 'Current';
    }

    // Find who rejected in this history
    const rejectedApproval = history.find(approval => approval.status === 'rejected');
    if (rejectedApproval && rejectedApproval.updatedBy) {
      return `Rejected by ${rejectedApproval.updatedBy.firstName} ${rejectedApproval.updatedBy.lastName}`;
    }

    return `History ${index + 1}`;
  }

  getHistoryStatus(history: any[]): string {
    const hasRejected = history.some(approval => approval.status === 'rejected');
    const allApproved = history.every(approval => approval.status === 'approved');
    
    if (hasRejected) return 'rejected';
    if (allApproved) return 'approved';
    return 'pending';
  }

  isPreviousStepApprovedInHistory(approval: any, history: any[]): boolean {
    if (approval.step <= 1) return true;
    const previousStep = history.find((a: any) => a.step === approval.step - 1);
    return previousStep?.status === 'approved';
  }

  toggleAccordion(index: number): void {
    this.openAccordions[index] = !this.openAccordions[index];
  }

  isAccordionOpen(index: number): boolean {
    return this.openAccordions[index] || false;
  }

  getAccordionHeaderClasses(index: number): string {
    const histories = this.getApprovalHistories();
    const isCurrentHistory = index === histories.length - 1;
    
    if (isCurrentHistory) {
      return 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100';
    } else {
      return 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100';
    }
  }

  getHistoryIcon(index: number): string {
    const histories = this.getApprovalHistories();
    const isCurrentHistory = index === histories.length - 1;
    
    if (isCurrentHistory) {
      return 'heroArrowPath';
    } else {
      return 'heroXCircle';
    }
  }
}

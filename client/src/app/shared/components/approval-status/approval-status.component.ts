import { CommonModule, NgClass, TitleCasePipe } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormModalShellComponent, MODAL_DATA, ModalRef } from '../modal';

export interface ApprovalStatusData {
  entity: any;
  entityType?: 'purchaseRequest' | 'claim' | 'generic';
}

@Component({
  selector: 'app-approval-status',
  standalone: true,
  imports: [CommonModule, NgClass, TitleCasePipe, FormModalShellComponent],
  templateUrl: './approval-status.component.html',
  styleUrls: ['./approval-status.component.css']
})
export class ApprovalStatusComponent {

  openAccordions: boolean[] = [];
  
  constructor(
    public modalRef: ModalRef<void>,
    @Inject(MODAL_DATA) public data: ApprovalStatusData
  ) {
    this.initializeAccordionStates();
  }

  private initializeAccordionStates(): void {
    const histories = this.getApprovalHistories();
    this.openAccordions = new Array(histories.length).fill(false);
    if (histories.length > 0) {
      this.openAccordions[histories.length - 1] = true;
    }
  }

  onClose(): void {
    this.modalRef.close();
  }

  get title(): string {
    return 'Workflow Status';
  }

  get subtitle(): string {
    const count = this.getApprovalStatus().length;
    return count ? `${count} workflow step${count === 1 ? '' : 's'} recorded` : 'No workflow activity recorded yet';
  }

  get context(): string | null {
    const entity = this.getEntityData();
    return entity?.purchaseNo || entity?.claimNo || entity?.referenceNo || entity?.title || null;
  }

  get contextLabel(): string {
    if (this.data.entityType === 'purchaseRequest') return 'Purchase request';
    if (this.data.entityType === 'claim') return 'Claim';
    return 'Record';
  }

  getApprovalStatus(): any[] {
    const entity = this.data.entity;
    if (this.data.entityType === 'purchaseRequest') {
      return entity?.approvalStatus || [];
    } else if (this.data.entityType === 'claim') {
      return entity?.approvalStatus || [];
    } else {
      return entity?.approvalStatus || entity?.approvalStatus || [];
    }
  }

  getEntityData(): any {
    return this.data.entity;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'approved': return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
      case 'rejected': return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300';
      case 'pending': return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
      default: return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'approved': return 'check';
      case 'rejected': return 'close';
      case 'pending': return 'schedule';
      default: return 'help';
    }
  }

  getManagerApprovalStatus(approval: any): string {
    if (approval.updatedBy) {
      return approval.status || 'approved';
    }
    return 'pending';
  }

  getActor(approval: any): string {
    if (approval.updatedBy) return `${approval.updatedBy.firstName ?? ''} ${approval.updatedBy.lastName ?? ''}`.trim();
    if (approval.managerApproval && this.getEntityData()?.raisedBy?.reportingTo) {
      const manager = this.getEntityData().raisedBy.reportingTo;
      return `${manager.firstName ?? ''} ${manager.lastName ?? ''}`.trim() || 'Reporting Manager';
    }
    return approval.role?.categoryName || (approval.managerApproval ? 'Reporting Manager' : 'Pending approver');
  }

  getStepTitle(approval: any): string {
    return approval.managerApproval ? 'Manager Approval' : (approval.role?.categoryName || 'Approval Step');
  }

  getStepSubtitle(approval: any, history: any[]): string {
    const status = approval.managerApproval ? this.getManagerApprovalStatus(approval) : (approval.status || 'pending');
    const actor = approval.updatedBy ? this.getActor(approval) : `Waiting for ${this.getActor(approval)}`;
    const date = approval.updatedDate || approval.updatedAt;
    const parts = [`Step ${approval.step || 1}`, status, actor];
    if (date) parts.push(date);
    if (!this.isPreviousStepApprovedInHistory(approval, history)) parts.push('Waiting for previous step');
    return parts.filter(Boolean).join(' · ');
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
    const approvalStatus = this.getApprovalStatus();
    if (!approvalStatus || approvalStatus.length === 0) {
      return [];
    }

    const histories: any[] = [];
    let currentHistory: any[] = [];
    let lastStep = 0;

    for (const approval of approvalStatus) {
      if (approval.step <= lastStep && currentHistory.length > 0) {
        histories.push([...currentHistory]);
        currentHistory = [];
      }
      
      currentHistory.push(approval);
      lastStep = approval.step;
    }

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

















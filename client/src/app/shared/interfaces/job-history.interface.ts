export interface TimelineEvent {
  id: string;
  timestamp: string | Date;
  pipeline: 'purchaseRequest' | 'purchaseOrder' | 'grn' | 'technical' | 'deliveryNote';
  eventType: string;
  title: string;
  description: string;
  performedBy: {
    _id: string;
    firstName: string;
    lastName: string;
  } | null;
  metadata: {
    prNo?: string;
    poNo?: string;
    grnNo?: string;
    dnNo?: string;
    supplierName?: string;
    comment?: string;
    reason?: string;
    step?: number;
    role?: string;
    status?: string;
    itemsCount?: number;
    projectType?: string;
    assignedTo?: {
      _id: string;
      firstName: string;
      lastName: string;
    };
    itemName?: string;
    taskName?: string;
    subject?: string;
    comments?: string;
  };
  status: 'success' | 'warning' | 'error' | 'info';
}

export interface CurrentStatus {
  purchaseRequest: string | null;
  purchaseOrder: string | null;
  technical: string | null;
  deliveryNote: number;
}

export interface WorkflowSummary {
  totalPRs: number;
  approvedPRs: number;
  rejectedPRs: number;
  totalPOs: number;
  approvedPOs: number;
  closedPOs: number;
  totalGRNs: number;
  totalDNs: number;
  hasTechnical: boolean;
}

export interface JobWorkflowTimeline {
  jobId: string;
  currentStatus: CurrentStatus;
  timeline: TimelineEvent[];
  summary: WorkflowSummary;
}

export interface JobHistoryResponse {
  success: boolean;
  data: JobWorkflowTimeline;
}

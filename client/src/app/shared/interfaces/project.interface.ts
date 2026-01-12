import { getQuotatation } from './quotation.interface';

export interface Project {
  _id?: string;
  projectName: string;
  assignedEngineer: {
    _id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  };
  projectType: ProjectType;
  jobId: string;
  status: ProjectStatus;
  allocatedDate: string;
  createdDate?: string;
  updatedDate?: string;
  createdBy?: string;
}

interface MaterialRequest {
  itemName: string;
  quantity: number;
  estimatedCost: number;
  requiredOn: Date;    
  remarks: string;
}

interface Task {
  taskName: string;
  description: string;
  priority: string;
  timeline: {
      expectedStartDate: Date;
      expectedEndDate: Date;
      expectedDuration: number;
  };
  progress: number;
  notes: string;
  associatedWith: {_id:string, firstName:string, lastName:string}[];
  status: string;
}


interface Issue {
  subject: string;
  customer: {
    _id?:string;
    companyName:string;
  };
  issueType: string;
  raisedBy: string;
  description: string;
  status: string;
  respondedOn: Date;
  closedBy: {
    _id?:string;
    firstName:string;
    lastName:string;
  };
  closedOn: Date;
  comments: string;
  updatedBy: {
    _id?:string;
    firstName:string;
    lastName:string;
  };
  updatedAt: Date;
}

interface ActivityPlan {
  activityName: string;
  startDate: Date;
  endDate: Date;
  orginalStartDate: Date;
  orginalEndDate: Date;
  includedEmployees: {_id:string, firstName:string, lastName:string}[];
  status: string;
  comment: string;
}

export interface getProject {
  _id?:string;
  jobId: {
    _id?:string;
    jobId:string;
    quotation?: getQuotatation;
  };
  customer: {
    _id?:string;
    companyName:string;
  };
  materialRequest: MaterialRequest[];
  tasks: Task[];
  issues: Issue[];
  assignedTo: {_id:string, firstName:string, lastName:string};
  comment: string;
  status: string;
  projectType: string;
  assignedBy: {_id:string, firstName:string, lastName:string};
  assignedAt: Date;
  updatedBy: {_id:string, firstName:string, lastName:string};
  updatedAt: Date;
  priority: string;
  activityPlan: ActivityPlan[];
}

export enum ProjectType {
  SupplyOnly = 'Supply Only',
  ProjectWithSupply = 'Project With Supply',
  ProjectsWithOutSupply = 'Projects With Out Supply',
  AMC = 'AMC'
}

export enum ProjectStatus {
  Pending = 'Pending',
  InProgress = 'In Progress',
  Completed = 'Completed',
  OnHold = 'On Hold',
  Cancelled = 'Cancelled'
}

export interface ProjectFilter {
  search?: string;
  page: number;
  row: number;
  projectType?: string;
  status?: ProjectStatus[];
  assignedEngineer?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ProjectResponse {
  data: Project[];
  message: string;
  success: boolean;
  total?: number;
} 
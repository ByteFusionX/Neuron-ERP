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
} 
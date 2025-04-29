export interface TableColumn {
    key: string;
    label: string;
    type: 'text' | 'date' | 'number' | 'currency' | 'status' | 'badge' | 'image' | 'boolean' | 'custom' | 'action';
    pipe?: string; // For formatting (date, number, etc.)
    pipeParams?: any; // Parameters for the pipe
    sortable?: boolean;
    filterable?: boolean;
    width?: string;
    visible?: boolean;
    customTemplate?: string; // Template reference name
    actions?: TableAction[]; // For action columns
    cellClass?: string; // CSS class for the cell
    headerClass?: string; // CSS class for the header
  }
  
  export interface TableAction {
    icon: string; // NgIcon name
    tooltip?: string;
    color?: string;
    condition?: (item: any) => boolean; // Show action only if this returns true
    action: string; // Identifier for the action
    buttonClass?: string;
  }
  
  export interface TableEvent {
    type: 'row' | 'action';
    action?: string;
    item: any;
  }
  
  export interface TableFilter {
    column: string;
    value: any;
    operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'startsWith' | 'endsWith';
  }
  
  export interface TablePaginationEvent {
    page: number;
    pageSize: number;
  }
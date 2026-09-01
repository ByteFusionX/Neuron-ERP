export interface TableColumn {
    key: string;
    label: string;
    type: 'text' | 'date' | 'number' | 'currency' | 'status' | 'badge' | 'image' | 'boolean' | 'custom' | 'action' | 'statusDropdown';
    pipe?: string; // For formatting (date, number, etc.)
    pipeParams?: any; // Parameters for the pipe
    sortable?: boolean;
    filterable?: boolean;
    filterType?: 'text' | 'select' | 'date' | 'number'; // Type of filter to use
    filterOptions?: { label: string; value: any }[]; // Options for select filter
    filterPlaceholder?: string; // Placeholder text for filter input
    width?: string;
    visible?: boolean;
    customTemplate?: string; // Template reference name
    actions?: TableAction[]; // For action columns
    cellClass?: string; // CSS class for the cell
    headerClass?: string; // CSS class for the header
    tooltip?: boolean;
    list?: ApprovalRejectionList[]; // List data for tooltip modal
    cellRenderer?: (item: any) => any;
    truncateText?: boolean;
    clickable?: boolean;
    clickFunction?: (item: any) => void;
    clickableValue?: (item: any) => any;
    // For statusDropdown type
    statusOptions?: string[]; // Available status options
    confirmationMessage?: (oldValue: string, newValue: string) => string; // Custom confirmation message
    // For inline button in text columns
    inlineButton?: {
        icon: string;
        tooltip: string;
        buttonClass?: string;
        condition?: (item: any) => boolean;
        onClick: (item: any, event: Event) => void;
    };
}

export type InlineEditorType = 'text' | 'number' | 'select' | 'date' | 'textarea';

export interface InlineEditColumnConfig {
    type: InlineEditorType;
    options?: { label: string; value: any }[];
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
}

export interface InlineEditConfig {
    enabled: boolean;
    rowIdentityKey?: string;
    allowDelete?: boolean;
    showActionsColumn?: boolean;
    columns: Record<string, InlineEditColumnConfig>;
}

export interface TableAction {
    icon: string | ((item: any) => string); // NgIcon name
    tooltip?: string | ((item: any) => string);
    color?: string;
    condition?: (item: any) => boolean; // Show action only if this returns true
    disabled?: (item: any) => boolean; // Disable the button (still shown) if this returns true
    action: string; // Identifier for the action
    buttonClass?: string | ((item: any) => string);
}

export interface TableEvent {
    type: 'row' | 'action' | 'statusChange';
    action?: string;
    item: any;
    column?: string; // For status change events
    oldValue?: any; // For status change events
    newValue?: any; // For status change events
}

export interface DateRange {
    from: string;
    to: string;
}

export interface TableFilter {
    column: string;
    value: any | DateRange;
    operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'startsWith' | 'endsWith';
    type: 'text' | 'select' | 'date' | 'number';
}

export interface TablePaginationEvent {
    page: number;
    pageSize: number;
}

export interface ApprovalRejectionList {
    date: string;
    reason: string;
    rejectedBy?: {
        firstName: string;
        lastName: string;
    };
    approvedBy?: {
        firstName: string;
        lastName: string;
    };
}
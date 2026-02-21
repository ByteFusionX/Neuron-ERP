import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, TemplateRef, ContentChild, model, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';

// PrimeNG imports
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';

import { TableColumn, TableFilter, DateRange, ApprovalRejectionList, InlineEditConfig, InlineEditColumnConfig } from './table.model';
import { SkeltonLoadingComponent } from '../skelton-loading/skelton-loading.component';
import { PaginationComponent } from '../pagination/pagination.component';
import { PaginationService } from 'src/app/core/services/pagination.service'; 
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
// import { ListModalComponent } from '../list-modal/list-modal.component';
import * as XLSX from 'xlsx';

@Component({
  selector: 'data-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatMenuModule,
    MatTooltipModule,
    NgIconsModule,
    SkeltonLoadingComponent,
    PaginationComponent,
    // PrimeNG imports
    InputTextModule,
    DatePickerModule,
    DropdownModule,
    InputNumberModule,
  ],
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.css']
})
export class TableComponent implements OnInit, OnChanges {
  @Input() data: any[] = [];
  @Input() columns: TableColumn[] = [];
  @Input() defaultColumns: string[] = [];
  @Input() title: string = 'Table';
  @Input() isLoading: boolean = false;
  @Input() enableColumnCustomization: boolean = true;
  @Input() totalItems: number = 0;
  @Input() isEmpty: boolean = true;
  @Input() tableId: string = '';
  @Input() showPagination: boolean = true;
  @Input() enableExport: boolean = false;
  @Input() exportFileName?: string;
  @Input() inlineEditConfig?: InlineEditConfig | null = null;

  @Output() rowClick = new EventEmitter<any>();
  @Output() actionClick = new EventEmitter<{ action: string, item: any, event: Event }>();
  @Output() filterChange = new EventEmitter<TableFilter[]>();
  @Output() paginationChange = new EventEmitter<{ page: number, row: number }>();
  @Output() statusChange = new EventEmitter<any>();
  @Output() inlineEditSave = new EventEmitter<{ rowId: any, updated: any, original: any }>();
  @Output() inlineDelete = new EventEmitter<any>();
  @Output() exportRequest = new EventEmitter<void>();

  @ContentChild('sideColumn') sideColumns!: TemplateRef<any>;

  public paginationService = inject(PaginationService);

  displayedColumns: string[] = [];
  searchQuery: string = '';
  filteredData: any[] = [];
  availableColumns: TableColumn[] = [];
  activeFilters: TableFilter[] = [];
  dateRanges: { [key: string]: DateRange } = {};
  filterValues: { [key: string]: any } = {};
  editingRowId: any = null;
  editableRowDraft: any = null;
  originalRowReference: any = null;

  constructor(private dialog: MatDialog) {}

  ngOnInit(): void {
    this.initializeColumns();
    this.filteredData = [...this.data];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['totalItems']) {
      this.paginationService.updatePaginationState(
        {
          page: this.paginationService.paginationState().page,
          row: this.paginationService.paginationState().row,
          total: this.totalItems
        }
      )
    }
    if (changes['data']) {
      this.filteredData = [...this.data];
    }

    if (changes['columns'] || changes['defaultColumns']) {
      this.initializeColumns();
    }
  }

  initializeColumns(): void {
    this.availableColumns = [...this.columns];

    const currentKeys = this.defaultColumns && this.defaultColumns.length > 0
      ? [...this.defaultColumns]
      : this.columns.map(col => col.key);

    if (this.tableId) {
      const savedColumns = localStorage.getItem(`table_columns_${this.tableId}`);
      if (savedColumns) {
        const saved: string[] = JSON.parse(savedColumns);
        const newKeys = currentKeys.filter(k => !saved.includes(k));
        if (newKeys.length > 0) {
          this.displayedColumns = [...saved, ...newKeys];
          localStorage.setItem(`table_columns_${this.tableId}`, JSON.stringify(this.displayedColumns));
        } else {
          this.displayedColumns = saved;
        }
        return;
      }
    }

    this.displayedColumns = currentKeys;
  }

  onRowClick(row: any): void {
    this.rowClick.emit(row);
  }

  onTooltipClick(item: any, column: TableColumn): void {
    if (column.tooltip) {
      const status = this.getCellValue(item, column);
      let historyList: ApprovalRejectionList[] = [];
      let title = '';

      if (status === 'Approved' && item.approvedHistory) {
        historyList = item.q;
        title = 'Approval History';
      } else if (status === 'Rejected' && item.rejectHistory) {
        historyList = item.rejectHistory;
        title = 'Rejection History';
      }

      // if (historyList.length > 0) {
      //   console.log(historyList);
      //   const dialogRef = this.dialog.open(ListModalComponent, {
      //     data: {
      //       title: title,
      //       list: historyList
      //     },
      //     width: '600px'
      //   });
      // }
    }
  }

  onActionClick(action: string, item: any, event: Event): void {
    event.stopPropagation();
    this.actionClick.emit({ action, item, event });
  }

  toggleColumnVisibility(column: TableColumn): void {
    const columnIndex = this.displayedColumns.indexOf(column.key);

    if (columnIndex > -1) {
      this.displayedColumns.splice(columnIndex, 1);
    } else {
      // Find original index from columns array to maintain order
      const originalIndex = this.columns.findIndex(col => col.key === column.key);

      // Find where to insert in displayedColumns
      let insertIndex = 0;
      for (let i = 0; i < originalIndex; i++) {
        if (this.displayedColumns.includes(this.columns[i].key)) {
          insertIndex = this.displayedColumns.indexOf(this.columns[i].key) + 1;
        }
      }

      this.displayedColumns.splice(insertIndex, 0, column.key);
    }

    // Save column preferences to localStorage if tableId is provided
    if (this.tableId) {
      localStorage.setItem(`table_columns_${this.tableId}`, JSON.stringify(this.displayedColumns));
    }
  }

  isColumnVisible(column: TableColumn): boolean {
    return this.displayedColumns.includes(column.key);
  }

  getCellValue(item: any, column: TableColumn): any {
    if (typeof column.cellRenderer === 'function') {
      return column.cellRenderer(item);
    }
    if (!column.key.includes('.')) {
      return item[column.key];
    }
    return column.key.split('.').reduce((obj, key) =>
      (obj && obj[key] !== undefined) ? obj[key] : null, item);
  }

  getStatusColorClass(status: any): string {
    if (!status) return 'bg-slate-100 text-slate-700';
    
    const statusLower = String(status).toLowerCase().trim();
    
    switch (statusLower) {
      case 'delivered':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'cancelled':
        return 'bg-red-100 text-red-700 border border-red-200';
      case 'draft':
      case 'drafted':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'deducted':
        return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'reversed':
        return 'bg-orange-100 text-orange-700 border border-orange-200';
      case 'not ordered':
        return 'bg-rose-100 text-rose-700 border border-rose-200';
      case 'ordered':
        return 'bg-sky-100 text-sky-700 border border-sky-200';
      case 'partially received':
        return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'received':
        return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  }

  formatCurrencyWithSpace(item: any, column: TableColumn): string {
    const value = this.getCellValue(item, column);
    if (value == null || value === undefined) return '';
    
    const currencyCode = column.pipeParams?.currency || 'USD';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
    
    // Add space between currency symbol and number
    return formatted.replace(/([^\d.,\s])(\d)/, '$1 $2');
  }

  preventClick(event: Event): void {
    event.stopPropagation();
  }

  onFilterChange(column: TableColumn, value: any): void {
    const filterKey = column.key.split('.').pop() || column.key;
    this.filterValues[filterKey] = value;
    
    if (!value) {
      // Remove filter if value is empty
      this.activeFilters = this.activeFilters.filter(f => f.column !== filterKey);
      delete this.filterValues[filterKey];
    } else {
      // Add or update filter
      const existingFilter = this.activeFilters.find(f => f.column === filterKey);
      if (existingFilter) {
        existingFilter.value = value;
      } else {
        this.activeFilters.push({
          column: filterKey,
          value,
          type: column.filterType || 'text',
          operator: column.filterType === 'text' ? 'contains' : 'eq'
        });
      }
    }

    // Emit filter changes to parent
    this.filterChange.emit(this.activeFilters);
  }

  clearFilter(column: TableColumn): void {
    this.activeFilters = this.activeFilters.filter(f => f.column !== column.key);
    delete this.filterValues[column.key];
    this.filterChange.emit(this.activeFilters);
  }

  getFilterValue(column: TableColumn): any {
    return this.filterValues[column.key];
  }

  onCellClick(column: TableColumn, item: any, event: Event): void {
    if (column.clickFunction) {
      column.clickFunction(item);
      event.stopPropagation();
    }
  }

  isClickableValue(column: TableColumn, item: any): boolean {
    if (!column.clickableValue || typeof column.clickableValue !== 'function') {
      return false;
    }
    return column.clickableValue(item);
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems
    });
    this.paginationChange.emit(event);
  }

  onStatusChange(item: any, column: TableColumn, oldValue: string, newValue: string): void {
    // Create confirmation message
    let confirmMessage = `Are you sure you want to change status from "${oldValue}" to "${newValue}"?`;
    
    if (column.confirmationMessage) {
      confirmMessage = column.confirmationMessage(oldValue, newValue);
    }

    // Show confirmation dialog
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Confirm Status Change',
        description: confirmMessage,
        icon: 'heroExclamationCircle',
        IconColor: 'orange'
      },
      width: '400px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.statusChange.emit({
          type: 'statusChange',
          item: item,
          column: column.key,
          oldValue: oldValue,
          newValue: newValue
        });
      }
    });
  }

  exportToExcel(): void {
    if (!this.enableExport) {
      return;
    }
    this.exportRequest.emit();
  }

  exportAllData(data: any[]): void {
    if (!data || data.length === 0) {
      return;
    }

    const columnsToExport = this.displayedColumns.filter(colKey => colKey !== 'actions');
    
    const rows = data.map((item) => {
      const row: Record<string, any> = {};
      columnsToExport.forEach((columnKey) => {
        const column = this.columns.find((col) => col.key === columnKey);
        if (!column) return;

        let value = this.getCellValue(item, column);
        if (column.type === 'date' && value) {
          value = new Date(value);
        }
        row[column.label] = value ?? '';
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, this.title || 'Sheet1');
    const filename = this.exportFileName || `${this.title || 'table-data'}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  isInlineEditEnabled(): boolean {
    return !!this.inlineEditConfig?.enabled;
  }

  private getRowId(item: any): any {
    if (!this.inlineEditConfig) return null;
    const key = this.inlineEditConfig.rowIdentityKey || '_id';
    return key.split('.').reduce((obj, part) => (obj ? obj[part] : null), item);
  }

  isRowEditing(item: any): boolean {
    if (!this.isInlineEditEnabled()) return false;
    return this.getRowId(item) === this.editingRowId;
  }

  isColumnInlineEditable(columnKey: string): boolean {
    if (!this.inlineEditConfig?.columns) return false;
    return !!this.inlineEditConfig.columns[columnKey];
  }

  getInlineColumnConfig(columnKey: string): InlineEditColumnConfig | null {
    if (!this.inlineEditConfig?.columns) return null;
    return this.inlineEditConfig.columns[columnKey] || null;
  }

  getInlineSelectValue(columnKey: string): any {
    const value = this.getDraftValue(columnKey);
    if (value && typeof value === 'object') {
      return value._id ?? value.id ?? value.value ?? value.key ?? null;
    }
    return value ?? null;
  }

  startInlineEdit(item: any, event?: Event): void {
    event?.stopPropagation();
    this.editingRowId = this.getRowId(item);
    this.editableRowDraft = item ? JSON.parse(JSON.stringify(item)) : null;
    this.originalRowReference = item;
  }

  cancelInlineEdit(event?: Event): void {
    event?.stopPropagation();
    this.editingRowId = null;
    this.editableRowDraft = null;
    this.originalRowReference = null;
  }

  saveInlineEdit(event?: Event): void {
    event?.stopPropagation();
    if (!this.inlineEditConfig || !this.editableRowDraft) return;
    this.inlineEditSave.emit({
      rowId: this.editingRowId,
      updated: this.editableRowDraft,
      original: this.originalRowReference
    });
    this.cancelInlineEdit();
  }

  deleteInlineRow(item: any, event?: Event): void {
    event?.stopPropagation();
    this.inlineDelete.emit(item);
  }

  getDraftValue(columnKey: string): any {
    if (!this.editableRowDraft) return null;
    return columnKey.split('.').reduce((obj, key) => (obj ? obj[key] : null), this.editableRowDraft);
  }

  updateDraftValue(columnKey: string, value: any): void {
    if (!this.editableRowDraft) return;
    this.setDraftValue(columnKey, value);

    if (['quantity', 'unitCost'].includes(columnKey)) {
      const qty = Number(this.getDraftValue('quantity'));
      const cost = Number(this.getDraftValue('unitCost'));
      if (!isNaN(qty) && !isNaN(cost) && this.isColumnInlineEditable('totalCost')) {
        this.setDraftValue('totalCost', Number((qty * cost).toFixed(2)));
      }
    }
  }

  private setDraftValue(columnKey: string, value: any): void {
    const keys = columnKey.split('.');
    let target = this.editableRowDraft;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (target[key] === undefined || target[key] === null) {
        target[key] = {};
      }
      target = target[key];
    }
    target[keys[keys.length - 1]] = value;
  }
}
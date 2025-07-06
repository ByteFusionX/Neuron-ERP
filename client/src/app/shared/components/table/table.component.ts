import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, TemplateRef, ContentChild, model, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { NgIconsModule } from '@ng-icons/core';
import { heroChevronDown, heroAdjustmentsHorizontal, heroChevronLeft, heroChevronRight, heroXMark } from '@ng-icons/heroicons/outline';

// PrimeNG imports
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';

import { TableColumn, TableFilter, DateRange, ApprovalRejectionList } from './table.model';
import { SkeltonLoadingComponent } from '../skelton-loading/skelton-loading.component';
import { PaginationComponent } from '../pagination/pagination.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
// import { ListModalComponent } from '../list-modal/list-modal.component';

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
    InputNumberModule
  ],
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.css'],
  providers: [PaginationService]
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

  @Output() rowClick = new EventEmitter<any>();
  @Output() actionClick = new EventEmitter<{ action: string, item: any, event: Event }>();
  @Output() filterChange = new EventEmitter<TableFilter[]>();

  @ContentChild('sideColumn') sideColumns!: TemplateRef<any>;

  public paginationService = inject(PaginationService);

  displayedColumns: string[] = [];
  searchQuery: string = '';
  filteredData: any[] = [];
  availableColumns: TableColumn[] = [];
  activeFilters: TableFilter[] = [];
  dateRanges: { [key: string]: DateRange } = {};
  filterValues: { [key: string]: any } = {};

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

    // Try to load saved columns from localStorage if tableId is provided
    if (this.tableId) {
      const savedColumns = localStorage.getItem(`table_columns_${this.tableId}`);
      if (savedColumns) {
        this.displayedColumns = JSON.parse(savedColumns);
        return;
      }
    }

    // If no saved columns or no tableId, use default columns or all columns
    if (this.defaultColumns && this.defaultColumns.length > 0) {
      this.displayedColumns = [...this.defaultColumns];
    } else {
      this.displayedColumns = this.columns.map(col => col.key);
    }
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
    if (!column.key.includes('.')) {
      return item[column.key];
    }

    // Handle nested properties like 'client.companyName'
    return column.key.split('.').reduce((obj, key) =>
      (obj && obj[key] !== undefined) ? obj[key] : null, item);
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
}
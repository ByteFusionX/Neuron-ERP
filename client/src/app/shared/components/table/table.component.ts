import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, TemplateRef, ContentChild, model, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgIconsModule } from '@ng-icons/core';
import { heroChevronDown, heroAdjustmentsHorizontal, heroChevronLeft, heroChevronRight } from '@ng-icons/heroicons/outline';

import { TableColumn } from './table.model';
import { SkeltonLoadingComponent } from '../skelton-loading/skelton-loading.component';
import { PaginationComponent } from '../pagination/pagination.component';
import { PaginationService } from 'src/app/core/services/pagination.service';

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
    PaginationComponent
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

  @Output() rowClick = new EventEmitter<any>();
  @Output() actionClick = new EventEmitter<{ action: string, item: any, event: Event }>();

  @ContentChild('sideColumn') sideColumns!: TemplateRef<any>;

  public paginationService = inject(PaginationService);

  displayedColumns: string[] = [];
  searchQuery: string = '';
  filteredData: any[] = [];
  availableColumns: TableColumn[] = [];

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

    // If defaultColumns are provided, use them, otherwise use all columns
    if (this.defaultColumns && this.defaultColumns.length > 0) {
      this.displayedColumns = [...this.defaultColumns];
    } else {
      this.displayedColumns = this.columns.map(col => col.key);
    }
  }

  onRowClick(row: any): void {
    this.rowClick.emit(row);
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
}
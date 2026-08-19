import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { TableComponent } from 'src/app/shared/components/table/table.component';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { TableColumn, TableFilter } from 'src/app/shared/components/table/table.model';
import { ProductService, Product, ProductQueryParams } from 'src/app/core/services/product/product.service';
import { CreateProductComponent } from './modals/create-product/create-product.component';
import { PaginationService } from 'src/app/core/services/pagination.service';
import { NgIcon } from '@ng-icons/core';
import { SearchComponent } from 'src/app/shared/components/search/search.component';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { ProfileService } from 'src/app/core/services/profile/profile.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';

@Component({
  selector: 'app-all-products',
  standalone: true,
  imports: [
    CommonModule,
    TableComponent,
    ButtonComponent,
    NgIcon,
    SearchComponent
  ],
  templateUrl: './all-products.component.html',
  styleUrl: './all-products.component.css',
  providers: [PaginationService]
})
export class AllProductsComponent implements OnInit {
  private productService = inject(ProductService);
  private dialog = inject(MatDialog);
  private toastr = inject(ToastrService);
  private paginationService = inject(PaginationService);
  private productCategoryService = inject(ProductCategoryService);
  private profileService = inject(ProfileService);
  private warehouseService = inject(WarehouseService);

  tableData = signal<Product[]>([]);
  tableColumns: TableColumn[] = [];
  defaultColumns: string[] = ['partNo', 'productDescription', 'productCategory', 'productSegment', 'warehouse', 'createdBy'];
  isLoading = signal<boolean>(false);
  isEmpty = signal<boolean>(false);
  totalItems = signal<number>(0);
  categoryOptions = signal<{ label: string; value: string }[]>([]);
  segmentOptions = signal<{ label: string; value: string }[]>([]);
  warehouseOptions = signal<{ label: string; value: string }[]>([]);

  private appliedFilters: Record<string, any> = {};
  private searchTerm: string = '';

  ngOnInit(): void {
    this.setupTableColumns();
    this.loadFilterOptions();
    this.loadProducts();
  }

  loadFilterOptions(): void {
    this.productCategoryService.getProductCategories().subscribe({
      next: (categories) => {
        const options = (categories ?? []).map(category => ({
          label: category.categoryName,
          value: category._id as string
        }));
        this.categoryOptions.set(options);
        this.updateColumnFilterOptions('productCategory', options);
      },
      error: () => {
        this.toastr.error('Failed to load product categories');
      }
    });

    this.profileService.getDepartments().subscribe({
      next: (departments) => {
        const options = (departments ?? []).map(department => ({
          label: department.departmentName,
          value: department._id as string
        }));
        this.segmentOptions.set(options);
        this.updateColumnFilterOptions('productSegment', options);
      },
      error: () => {
        this.toastr.error('Failed to load product segments');
      }
    });

    this.warehouseService.getWarehouses().subscribe({
      next: (warehouses) => {
        const options = (warehouses ?? []).map(wh => ({
          label: wh.wareHouseName,
          value: wh._id as string
        }));
        this.warehouseOptions.set(options);
        this.updateColumnFilterOptions('warehouse', options);
      },
      error: () => {
        this.toastr.error('Failed to load warehouses');
      }
    });
  }

  private updateColumnFilterOptions(columnKey: string, options: { label: string; value: string }[]): void {
    const column = this.tableColumns.find(col => col.key === columnKey);
    if (column) {
      column.filterOptions = options;
    }
  }

  setupTableColumns(): void {
    this.tableColumns = [
      {
        key: 'partNo',
        label: 'Part No',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search part no...'
      },
      {
        key: 'productDescription',
        label: 'Product Description',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search description...'
      },
      {
        key: 'productCategory',
        label: 'Product Category',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.categoryOptions(),
        filterPlaceholder: 'Select category...',
        cellRenderer: (item: any) => item?.productCategory?.categoryName || ''
      },
      {
        key: 'productSegment',
        label: 'Product Segment',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.segmentOptions(),
        filterPlaceholder: 'Select segment...',
        cellRenderer: (item: any) => item?.productSegment?.departmentName || ''
      },
      {
        key: 'warehouse',
        label: 'Warehouse',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'select',
        filterOptions: this.warehouseOptions(),
        filterPlaceholder: 'Select warehouse...',
        cellRenderer: (item: any) => item?.warehouse?.wareHouseName || ''
      },
      {
        key: 'createdBy',
        label: 'Created By',
        type: 'text',
        sortable: true,
        filterable: true,
        filterType: 'text',
        filterPlaceholder: 'Search creator...',
        cellRenderer: (item: any) => {
          if (item?.createdBy) {
            return `${item.createdBy.firstName || ''} ${item.createdBy.lastName || ''}`.trim();
          }
          return '';
        }
      }
    ];
  }

  loadProducts(extraParams: Partial<ProductQueryParams> = {}): void {
    this.isLoading.set(true);
    const paginationState = this.paginationService.paginationState();

    const params: ProductQueryParams = {
      page: extraParams.page ?? paginationState.page,
      row: extraParams.row ?? paginationState.row,
      search: this.searchTerm || undefined,
      ...this.appliedFilters,
      ...extraParams
    };

    this.productService.getProducts(params).subscribe({
      next: (response) => {
        const products = response.data?.products ?? [];
        const pagination = response.data?.pagination;

        this.tableData.set(products);
        this.isEmpty.set(products.length === 0);

        if (pagination) {
          this.totalItems.set(pagination.total);
          this.paginationService.updatePaginationState({
            page: pagination.page,
            row: pagination.limit,
            total: pagination.total
          });
        }

        this.isLoading.set(false);
      },
      error: () => {
        this.toastr.error('Failed to load products');
        this.isLoading.set(false);
        this.isEmpty.set(true);
      }
    });
  }

  onCreateProduct(): void {
    const dialogRef = this.dialog.open(CreateProductComponent, {
      disableClose: true,
      maxHeight: '90vh',
      width:'50vw'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadProducts();
      }
    });
  }

  onRowClick(row: Product): void {
  }

  onActionClick(event: { action: string, item: any, event: Event }): void {
  }

  onFilterChange(filters: TableFilter[]): void {
    const parsedFilters: Record<string, any> = {};

    filters.forEach(filter => {
      if (filter.value) {
        parsedFilters[filter.column] = filter.value;
      }
    });

    this.appliedFilters = parsedFilters;

    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });

    this.loadProducts({ page: 1 });
  }

  onPaginationChange(event: { page: number, row: number }): void {
    this.paginationService.updatePaginationState({
      page: event.page,
      row: event.row,
      total: this.totalItems()
    });
    this.loadProducts({ page: event.page, row: event.row });
  }

  onSearch(term: string): void {
    this.searchTerm = term?.trim() || '';
    const currentState = this.paginationService.paginationState();
    this.paginationService.updatePaginationState({
      page: 1,
      row: currentState.row,
      total: currentState.total
    });
    this.loadProducts({ page: 1 });
  }
}

import { Component, inject } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { ModalService } from 'src/app/shared/components/modal';
import { ProductCategoryService } from 'src/app/core/services/product-category/product-category.service';
import { WarehouseService } from 'src/app/core/services/warehouse/warehouse.service';
import { QuickAddDialogComponent, QuickAddDialogData } from 'src/app/modules/products/modals/quick-add-dialog/quick-add-dialog.component';
import { MasterCustomRow, MasterDataGridComponent, MasterTab } from './master-data-grid.component';

@Component({
  selector: 'app-product-data',
  standalone: true,
  imports: [MasterDataGridComponent],
  template: `
    <app-master-data-grid label="Product Data" storageKey="product" [tabs]="tabs"
      description="Product setup lists used by product records."></app-master-data-grid>
  `,
})
export class ProductDataComponent {
  private modal = inject(ModalService);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  private categoryService = inject(ProductCategoryService);
  private warehouseService = inject(WarehouseService);

  tabs: MasterTab[] = [
    { id: 'brand', label: 'Brands', title: 'Brand', list: 'brand', hint: 'Used by the Brand field on Product records.' },
    {
      id: 'category', label: 'Categories', title: 'Category', hint: 'Used by the Category field on Product records.',
      custom: this.named('Category', {
        load: () => this.categoryService.getProductCategories(),
        nameOf: (c: any) => c.categoryName,
        create: (name, isActive) => this.categoryService.createProductCategory({ categoryName: name, createdDate: new Date(), isActive } as any),
        update: (id, name, isActive) => this.categoryService.updateProductCategory(id, { categoryName: name, isActive } as any),
        remove: (id) => this.categoryService.deleteProductCategory(id),
      }),
    },
    {
      id: 'warehouse', label: 'Warehouses', title: 'Warehouse', hint: 'Used by the Warehouse field on Product records.',
      custom: this.named('Warehouse', {
        load: () => this.warehouseService.getWarehouses(),
        nameOf: (w: any) => w.wareHouseName,
        create: (name, isActive) => this.warehouseService.createWarehouse({ wareHouseName: name, createdDate: new Date(), isActive } as any),
        update: (id, name, isActive) => this.warehouseService.updateWarehouse(id, { wareHouseName: name, isActive } as any),
        remove: (id) => this.warehouseService.deleteWarehouse(id),
      }),
    },
    { id: 'unit', label: 'Units of Measure', title: 'Unit', list: 'unit', hint: 'Used by Product records and quantity-based sales documents.' },
    { id: 'availability', label: 'Availability', title: 'Availability', list: 'availability', hideStyle: true, hint: 'Options for the Availability column in estimation, quotation and purchase item entry. Hidden options disappear from the dropdown.' },
  ];

  /** A name-only collection (category, warehouse) as a custom tab: add, rename and delete. */
  private named(noun: string, api: {
    load: () => Observable<any[]>;
    nameOf: (item: any) => string;
    create: (name: string, isActive: boolean) => Observable<any>;
    update: (id: string, name: string, isActive: boolean) => Observable<any>;
    remove: (id: string) => Observable<any>;
  }): MasterTab['custom'] {
    const dialog = (data: QuickAddDialogData) =>
      firstValueFrom(this.modal.open<any, QuickAddDialogData>(QuickAddDialogComponent, { width: '480px', data }).afterClosed());
    return {
      load: () => api.load().pipe(map((items): MasterCustomRow[] => (items ?? []).map((item) => ({
        _id: item._id,
        name: api.nameOf(item),
        createdBy: item.createdBy?.firstName ? `${item.createdBy.firstName} ${item.createdBy.lastName ?? ''}`.trim() : '',
        createdAt: item.createdDate ? new Date(item.createdDate).toISOString() : '',
        status: item.isActive === false ? 'Inactive' : 'Active',
        source: item,
      })))),
      create: async () => !!(await dialog({ title: noun, showActive: true, create: api.create })),
      edit: async (row) => !!(await dialog({ title: noun, showActive: true, initial: row.name, initialActive: row.status !== 'Inactive', create: (name, isActive) => api.update(row._id, name, isActive) })),
      remove: async (row) => {
        const { confirmed } = await this.confirm.open({
          tone: 'reject',
          title: `Delete ${noun}?`,
          message: `Delete "${row.name}"?`,
          consequence: `Products already using this ${noun.toLowerCase()} may block the delete.`,
          confirmLabel: 'Delete',
        });
        if (!confirmed) return false;
        try {
          await firstValueFrom(api.remove(row._id));
          this.toast.success(`${noun} deleted successfully`);
          return true;
        } catch (e: any) {
          this.toast.error(e?.error?.message || `Failed to delete ${noun.toLowerCase()}`);
          return false;
        }
      },
    };
  }
}

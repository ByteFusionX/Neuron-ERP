import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { RecycleService, Trash } from 'src/app/core/services/recycle/recycle.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import {
  DataGridBreadcrumb,
  DataGridColumn,
  DataGridRowAction,
  DataGridRowActionEvent,
} from 'src/app/shared/components/data-grid/data-grid.model';

@Component({
  selector: 'app-recycle',
  templateUrl: './recycle.component.html',
  styleUrls: ['./recycle.component.css'],
  imports: [NgIf, DataGridComponent],
})
export class RecycleComponent implements OnInit, OnDestroy {
  trash: Trash[] = [];
  isLoading = true;
  loadError = '';

  readonly breadcrumbs: DataGridBreadcrumb[] = [
    { label: 'Home', link: '/' },
    { label: 'Recycle Bin' },
  ];

  readonly columns: DataGridColumn<Trash>[] = [
    {
      key: 'deletedFrom',
      label: 'From',
      sortable: true,
      locked: true,
      valueGetter: (row) => this.deletedFromLabel(row),
    },
    {
      key: 'record',
      label: 'Name / ID',
      sortable: true,
      valueGetter: (row) => this.deletedRecordLabel(row),
    },
    {
      key: 'date',
      label: 'Deleted Date',
      type: 'date',
      sortable: true,
      width: '150px',
    },
    {
      key: 'deletedBy',
      label: 'Deleted By',
      sortable: true,
      valueGetter: (row) => this.deletedByLabel(row),
    },
  ];

  readonly rowActions: DataGridRowAction<Trash>[] = [
    { id: 'restore', label: 'Restore', icon: 'refresh', quick: true },
  ];

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly recycleService: RecycleService,
    private readonly confirm: ConfirmDialogService,
    private readonly toast: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadTrash();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadTrash(): void {
    this.isLoading = true;
    this.loadError = '';
    this.subscriptions.add(
      this.recycleService.fetchTrash().subscribe({
        next: (trash) => {
          this.trash = trash;
          this.isLoading = false;
        },
        error: (error) => {
          this.trash = [];
          this.isLoading = false;
          this.loadError = error?.error?.message || 'Could not load deleted records.';
        },
      }),
    );
  }

  onRowAction(event: DataGridRowActionEvent<Trash>): void {
    if (event.action.id === 'restore') this.restore(event.row);
  }

  private async restore(trash: Trash): Promise<void> {
    const recordLabel = this.deletedRecordLabel(trash);
    const fromLabel = this.deletedFromLabel(trash);
    const { confirmed } = await this.confirm.open({
      tone: 'approve',
      title: `Restore ${fromLabel}?`,
      message: `${recordLabel} will be restored and removed from the Recycle Bin.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    this.subscriptions.add(
      this.recycleService.restoreTrash({
        from: trash.deletedFrom,
        dataId: trash.deletedData._id,
      }).subscribe({
        next: (response) => {
          this.trash = this.trash.filter((item) => item._id !== trash._id);
          this.toast.success(response.message);
        },
        error: (error) => {
          this.toast.error(error?.error?.message || 'Failed to restore record');
        },
      }),
    );
  }

  private deletedFromLabel(trash: Trash): string {
    if (trash.deletedFrom === 'Department') {
      return trash.deletedData?.forCustomerContact ? 'Customer Department' : 'Department';
    }
    if (trash.deletedFrom === 'InternalDepartment') return 'Internal Department';
    if (trash.deletedFrom === 'CustomerType') return 'Customer Type';
    return trash.deletedFrom;
  }

  private deletedRecordLabel(trash: Trash): string {
    const data = trash.deletedData;
    if (!data) return '—';

    const fieldsByType: Record<string, string[]> = {
      Department: ['departmentName'],
      InternalDepartment: ['departmentName'],
      Category: ['categoryName'],
      Employee: ['employeeId'],
      Customer: ['clientRef'],
      CustomerType: ['typeName', 'customerType'],
      Enquiry: ['enquiryId'],
      Quotation: ['quoteId'],
      Job: ['jobId'],
    };
    const field = fieldsByType[trash.deletedFrom]?.find((key) => data[key]);
    return field ? String(data[field]) : String(data.name || data._id || '—');
  }

  private deletedByLabel(trash: Trash): string {
    const firstName = trash.deletedBy?.firstName ?? '';
    const lastName = trash.deletedBy?.lastName ?? '';
    return `${firstName} ${lastName}`.trim() || '—';
  }
}

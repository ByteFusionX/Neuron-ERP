import { Component, Input, OnInit, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { Observable, firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { MasterListItem, MasterListName, MasterListService } from 'src/app/core/services/master-list.service';
import { settingsEditAccess } from '../../settings-edit-access';
import { MasterListItemDialog } from './master-list-item-dialog.component';

export interface MasterRow {
  _id: string;
  tab: string;
  name: string;
  detail: string;
  status: string;
  source: any;
}

/** Rows a custom tab supplies; the grid fills in `tab`. */
export type MasterCustomRow = Omit<MasterRow, 'tab'>;

export interface MasterTab {
  id: string;
  label: string;
  /** Singular noun for the add button and dialogs, e.g. "Enquiry source". */
  title: string;
  hint: string;
  /** Backed by a master list: the grid handles load, add, edit, activate and delete. */
  list?: MasterListName;
  /** Column label for the numeric value of a list item (e.g. "Days", "Rate %"). */
  valueLabel?: string;
  /** Backed by another API: the host supplies rows and the add/edit/delete flows (resolve true when data changed). */
  custom?: {
    load: () => Observable<MasterCustomRow[]>;
    create: () => Promise<boolean>;
    edit: (row: MasterCustomRow) => Promise<boolean>;
    remove: (row: MasterCustomRow) => Promise<boolean>;
  };
}

/** Master-data body: one data grid whose view tabs are the lists of a section, like HR Departments. */
@Component({
  selector: 'app-master-data-grid',
  standalone: true,
  imports: [NgIf, DataGridComponent],
  template: `
    <div class="h-full">
      <div class="h-full min-h-0">
        <app-data-grid
          class="flex-1 min-h-0"
          [fillHeight]="true"
          [data]="rows"
          [columns]="columns"
          [views]="views"
          [rowActions]="canEdit() ? rowActions : []"
          [breadcrumbs]="breadcrumbs"
          [loading]="loading"
          [selectable]="false"
          [showToolbarTools]="false"
          [createLabel]="canEdit() ? createLabel : ''"
          [title]="label"
          [subtitle]="currentTab?.hint ?? description"
          rowKey="_id"
          [storageKey]="'settings-master-' + storageKey"
          emptyMessage="Nothing here yet"
          searchPlaceholder="Search…"
          [detailTitle]="detailTitle"
          [detailSubtitle]="detailSubtitle"
          [detailBreadcrumb]="label"
          (viewChange)="onViewChange($event)"
          (create)="onCreate()"
          (rowAction)="onRowAction($event)">
          <ng-template #detailTemplate let-row>
            <section class="rounded-xl border border-gray-100 bg-white p-4 dark:border-erp-border-dark dark:bg-erp-surface-dark">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Summary</h3>
              <dl class="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Name</dt>
                  <dd class="mt-1 text-gray-900 dark:text-gray-100">{{ row.name }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</dt>
                  <dd class="mt-1 text-gray-900 dark:text-gray-100">{{ row.status }}</dd>
                </div>
                <div *ngIf="row.detail" class="sm:col-span-2">
                  <dt class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Details</dt>
                  <dd class="mt-1 text-gray-900 dark:text-gray-100">{{ row.detail }}</dd>
                </div>
              </dl>
            </section>
          </ng-template>
        </app-data-grid>
      </div>
    </div>
  `,
})
export class MasterDataGridComponent implements OnInit {
  @Input({ required: true }) tabs!: MasterTab[];
  @Input() label = '';
  @Input() description = '';
  @Input() storageKey = '';

  private svc = inject(MasterListService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  readonly canEdit = settingsEditAccess('masterDataEdit');

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Settings', link: '/settings' }, { label: 'Master Data' }];
  columns: DataGridColumn<MasterRow>[] = [
    { key: 'name', label: 'Name', sortable: true, locked: true, valueGetter: (r) => r.name },
    { key: 'detail', label: 'Details', sortable: false, valueGetter: (r) => r.detail || '—' },
    { key: 'status', label: 'Status', sortable: true, width: '120px', valueGetter: (r) => r.status },
  ];
  views: DataGridView<MasterRow>[] = [];
  rowActions: DataGridRowAction<MasterRow>[] = [
    { id: 'edit', label: 'Edit', icon: 'edit', quick: true, panel: true },
    { id: 'activate', label: 'Activate', hidden: (r) => !this.isList(r) || r.status === 'Active' },
    { id: 'deactivate', label: 'Deactivate', hidden: (r) => !this.isList(r) || r.status !== 'Active' },
    { id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger' },
  ];

  rows: MasterRow[] = [];
  loading = true;
  activeTabId = '';
  private rowsByTab: Record<string, MasterRow[]> = {};

  get currentTab(): MasterTab | undefined {
    return this.tabs?.find((t) => t.id === this.activeTabId);
  }

  get createLabel(): string {
    const t = this.currentTab;
    return t ? `Add ${t.title}` : '';
  }

  detailTitle = (row: MasterRow): string => row.name;
  detailSubtitle = (row: MasterRow): string => this.tabs?.find((t) => t.id === row.tab)?.title ?? '';

  ngOnInit(): void {
    this.views = this.tabs.map((t) => ({ id: t.id, label: t.label, predicate: (r: MasterRow) => r.tab === t.id }));
    this.activeTabId = this.tabs[0]?.id ?? '';
    let pending = this.tabs.length;
    for (const t of this.tabs) {
      this.loadTab(t, () => { if (--pending === 0) this.loading = false; });
    }
    if (!pending) this.loading = false;
  }

  onViewChange(view: DataGridView<MasterRow>): void {
    this.activeTabId = view.id;
  }

  private isList(row: MasterRow): boolean {
    return !!this.tabs.find((t) => t.id === row.tab)?.list;
  }

  private tabOf(id: string): MasterTab {
    return this.tabs.find((t) => t.id === id)!;
  }

  private setRows(tabId: string, rows: MasterRow[]): void {
    this.rowsByTab[tabId] = rows;
    this.rows = this.tabs.flatMap((t) => this.rowsByTab[t.id] ?? []);
  }

  private loadTab(tab: MasterTab, done?: () => void): void {
    const finish = () => done?.();
    if (tab.list) {
      this.svc.getItems(tab.list).subscribe({
        next: (res) => {
          this.setRows(tab.id, (res.data ?? []).map((i) => this.listRow(tab, i)));
          finish();
        },
        error: () => finish(),
      });
    } else if (tab.custom) {
      tab.custom.load().subscribe({
        next: (rows) => { this.setRows(tab.id, rows.map((r) => ({ ...r, tab: tab.id }))); finish(); },
        error: () => finish(),
      });
    } else finish();
  }

  private listRow(tab: MasterTab, i: MasterListItem): MasterRow {
    return {
      _id: i._id,
      tab: tab.id,
      name: i.label,
      detail: tab.valueLabel ? `${tab.valueLabel}: ${i.value ?? '—'}` : '',
      status: i.isActive ? 'Active' : 'Inactive',
      source: i,
    };
  }

  async onCreate(): Promise<void> {
    const tab = this.currentTab;
    if (!tab) return;
    if (tab.custom) {
      if (await tab.custom.create()) this.loadTab(tab);
      return;
    }
    const result = await this.askItem(tab);
    if (!result) return;
    this.svc.createItem(tab.list!, result).subscribe({
      next: () => this.loadTab(tab),
      error: (e) => this.toast.error(e?.error?.message || 'Could not add item'),
    });
  }

  async onRowAction(event: DataGridRowActionEvent<MasterRow>): Promise<void> {
    const row = event.row;
    const tab = this.tabOf(row.tab);
    switch (event.action.id) {
      case 'edit': return this.edit(tab, row);
      case 'activate':
      case 'deactivate': return this.setActive(tab, row, event.action.id === 'activate');
      case 'delete': return this.remove(tab, row);
    }
  }

  private async edit(tab: MasterTab, row: MasterRow): Promise<void> {
    if (tab.custom) {
      if (await tab.custom.edit(row)) this.loadTab(tab);
      return;
    }
    const result = await this.askItem(tab, row.source);
    if (!result) return;
    this.svc.updateItem(tab.list!, row._id, result).subscribe({
      next: () => this.loadTab(tab),
      error: (e) => this.toast.error(e?.error?.message || 'Could not save changes'),
    });
  }

  private setActive(tab: MasterTab, row: MasterRow, isActive: boolean): void {
    this.svc.updateItem(tab.list!, row._id, { isActive }).subscribe({
      next: () => this.loadTab(tab),
      error: () => this.toast.error('Could not update'),
    });
  }

  private async remove(tab: MasterTab, row: MasterRow): Promise<void> {
    if (tab.custom) {
      if (await tab.custom.remove(row)) this.loadTab(tab);
      return;
    }
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete item?',
      message: `Delete "${row.name}"?`,
      consequence: 'Deactivate it instead if you only want to hide it from new records.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.svc.deleteItem(tab.list!, row._id).subscribe({
      next: () => this.loadTab(tab),
      error: (e) => this.toast.error(e?.error?.message || 'Could not delete'),
    });
  }

  private askItem(tab: MasterTab, item?: MasterListItem): Promise<{ label: string; value: number | null } | undefined> {
    const ref = this.dialog.open(MasterListItemDialog, {
      width: '440px',
      maxWidth: '95vw',
      data: { title: tab.title, valueLabel: tab.valueLabel, label: item?.label, value: item?.value },
    });
    return firstValueFrom(ref.afterClosed());
  }
}

import { Component, Input, OnInit, inject } from '@angular/core';
import { DatePipe, NgIf } from '@angular/common';
import { ModalService } from 'src/app/shared/components/modal/modal.service';
import { Observable, firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { DataGridComponent } from 'src/app/shared/components/data-grid/data-grid.component';
import { DataGridBreadcrumb, DataGridColumn, DataGridRowAction, DataGridRowActionEvent, DataGridView } from 'src/app/shared/components/data-grid/data-grid.model';
import { MasterListItem, MasterListName, MasterListService } from 'src/app/core/services/master-list.service';
import { settingsEditAccess } from '../../settings-edit-access';
import { MasterListItemDialog, MasterListItemDialogData, MasterListItemResult } from './master-list-item-dialog.component';

export interface MasterRow {
  _id: string;
  tab: string;
  name: string;
  /** Shown in the Type column when the section's tabs hold more than one kind of entry. */
  type?: string;
  createdBy: string;
  createdAt: string;
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
  /** Show Hide/Unhide (Visible/Hidden) instead of Activate/Deactivate (Active/Inactive). */
  hideStyle?: boolean;
  /** Adds a Type column to the grid (rows set `type`). */
  typeColumn?: boolean;
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
  imports: [NgIf, DatePipe, DataGridComponent],
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
          [showViewPill]="false"
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
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Created by</dt>
                  <dd class="mt-1 text-gray-900 dark:text-gray-100">{{ row.createdBy || '—' }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Created at</dt>
                  <dd class="mt-1 text-gray-900 dark:text-gray-100">{{ row.createdAt ? (row.createdAt | date: 'dd MMM yyyy, HH:mm') : '—' }}</dd>
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
  private modal = inject(ModalService);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  readonly canEdit = settingsEditAccess('masterDataEdit');

  breadcrumbs: DataGridBreadcrumb[] = [{ label: 'Settings', link: '/settings' }, { label: 'Master Data' }];
  columns: DataGridColumn<MasterRow>[] = [
    { key: 'name', label: 'Name', sortable: true, locked: true, valueGetter: (r) => r.name },
    { key: 'createdBy', label: 'Created By', sortable: true, valueGetter: (r) => r.createdBy || '—' },
    { key: 'createdAt', label: 'Created At', sortable: true, type: 'date', valueGetter: (r) => r.createdAt },
    {
      key: 'status', label: 'Status', type: 'badge', sortable: true, width: '120px',
      valueGetter: (r) => r.status,
      badgeClasses: {
        Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        Visible: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        Hidden: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      },
    },
  ];
  views: DataGridView<MasterRow>[] = [];
  rowActions: DataGridRowAction<MasterRow>[] = [
    { id: 'edit', label: 'Edit', icon: 'pencil', quick: true, panel: true },
    { id: 'activate', label: 'Activate', hidden: (r) => !this.isList(r) || this.isHideStyle(r) || r.status === 'Active' },
    { id: 'deactivate', label: 'Deactivate', hidden: (r) => !this.isList(r) || this.isHideStyle(r) || r.status !== 'Active' },
    { id: 'unhide', label: 'Unhide', icon: 'eye', quick: true, hidden: (r) => !this.isHideStyle(r) || r.status === 'Visible' },
    { id: 'hide', label: 'Hide', icon: 'eyeOff', quick: true, hidden: (r) => !this.isHideStyle(r) || r.status !== 'Visible' },
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
    if (this.tabs.some((t) => t.typeColumn)) {
      this.columns = [
        this.columns[0],
        { key: 'type', label: 'Type', sortable: true, width: '180px', valueGetter: (r) => r.type || '—' },
        ...this.columns.slice(1),
      ];
    }
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

  private isHideStyle(row: MasterRow): boolean {
    return !!this.tabs.find((t) => t.id === row.tab)?.hideStyle;
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
      createdBy: i.createdBy ? `${i.createdBy.firstName ?? ''} ${i.createdBy.lastName ?? ''}`.trim() : '',
      createdAt: i.createdAt ?? '',
      status: tab.hideStyle ? (i.isActive ? 'Visible' : 'Hidden') : (i.isActive ? 'Active' : 'Inactive'),
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
    await this.saveItem(tab, undefined, (r) => this.svc.createItem(tab.list!, r), 'Could not add item');
  }

  /** Asks for the item and saves it. A failed save (e.g. a duplicate name) reopens the dialog with what was typed instead of discarding it. */
  private async saveItem(tab: MasterTab, item: MasterListItem | undefined, save: (r: MasterListItemResult) => Observable<unknown>, failMessage: string): Promise<void> {
    let draft: MasterListItemResult | undefined;
    for (;;) {
      const result = await this.askItem(tab, item, draft);
      if (!result) return;
      try {
        await firstValueFrom(save(result));
        this.loadTab(tab);
        return;
      } catch (e: any) {
        this.toast.error(e?.error?.message || failMessage);
        draft = result;
      }
    }
  }

  async onRowAction(event: DataGridRowActionEvent<MasterRow>): Promise<void> {
    const row = event.row;
    const tab = this.tabOf(row.tab);
    switch (event.action.id) {
      case 'edit': return this.edit(tab, row);
      case 'activate':
      case 'unhide': return this.setActive(tab, row, true);
      case 'deactivate':
      case 'hide': return this.setActive(tab, row, false);
      case 'delete': return this.remove(tab, row);
    }
  }

  private async edit(tab: MasterTab, row: MasterRow): Promise<void> {
    if (tab.custom) {
      if (await tab.custom.edit(row)) this.loadTab(tab);
      return;
    }
    await this.saveItem(tab, row.source, (r) => this.svc.updateItem(tab.list!, row._id, r), 'Could not save changes');
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
      consequence: 'It is removed from the table and from dropdowns. The record is kept in the database.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.svc.deleteItem(tab.list!, row._id).subscribe({
      next: () => this.loadTab(tab),
      error: (e) => this.toast.error(e?.error?.message || 'Could not delete'),
    });
  }

  private askItem(tab: MasterTab, item?: MasterListItem, draft?: MasterListItemResult): Promise<MasterListItemResult | undefined> {
    const by = item?.createdBy ? `${item.createdBy.firstName ?? ''} ${item.createdBy.lastName ?? ''}`.trim() : '';
    const ref = this.modal.open<MasterListItemResult, MasterListItemDialogData>(MasterListItemDialog, {
      width: '480px',
      data: {
        title: tab.title, valueLabel: tab.valueLabel, hideStyle: tab.hideStyle,
        edit: !!item,
        label: draft?.label ?? item?.label, value: draft ? draft.value : item?.value, isActive: draft?.isActive ?? item?.isActive,
        createdBy: by, createdAt: item?.createdAt,
      },
    });
    return firstValueFrom(ref.afterClosed());
  }
}

import { Component, Input, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { MasterListItem, MasterListName, MasterListService } from 'src/app/core/services/master-list.service';

@Component({
  selector: 'app-master-list-editor',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule],
  template: `
    <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ title }}</h3>
    <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">{{ hint }}</p>

    <form class="mb-3 flex flex-wrap items-end gap-3" (ngSubmit)="add()">
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
        <input [name]="list + 'label'" [(ngModel)]="newLabel" required maxlength="60" [placeholder]="placeholder"
          class="w-56 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
      </label>
      <label class="block" *ngIf="valueLabel">
        <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ valueLabel }}</span>
        <input type="number" min="0" [name]="list + 'value'" [(ngModel)]="newValue"
          class="w-28 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
      </label>
      <button type="submit" [disabled]="!newLabel.trim() || saving"
        class="rounded-md bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-600 disabled:opacity-50">+ Add</button>
    </form>
    <p *ngIf="error" class="mb-3 text-sm text-red-600" role="alert">{{ error }}</p>

    <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      <table class="w-full text-sm">
        <thead class="bg-gray-100 dark:bg-gray-800 text-left text-[13px] font-medium text-gray-700 dark:text-gray-300">
          <tr><th class="px-4 py-3">Name</th><th class="px-4 py-3" *ngIf="valueLabel">{{ valueLabel }}</th><th class="px-4 py-3">Active</th><th class="px-4 py-3"></th></tr>
        </thead>
        <tbody>
          <tr *ngIf="loading"><td [attr.colspan]="valueLabel ? 4 : 3" class="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
          <tr *ngIf="!loading && !items.length"><td [attr.colspan]="valueLabel ? 4 : 3" class="px-4 py-6 text-center text-gray-500">Nothing here yet.</td></tr>
          <tr *ngFor="let i of items" class="border-t border-gray-100 dark:border-gray-800">
            <ng-container *ngIf="editingId !== i._id; else editRow">
              <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ i.label }}</td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-400" *ngIf="valueLabel">{{ i.value ?? '-' }}</td>
              <td class="px-4 py-3">
                <input type="checkbox" [checked]="i.isActive" (change)="toggleActive(i)" class="h-4 w-4 cursor-pointer accent-violet-600" [attr.aria-label]="'Active: ' + i.label">
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button type="button" class="mr-3 text-violet-700 hover:underline" (click)="startEdit(i)">Edit</button>
                <button type="button" class="text-red-600 hover:underline" (click)="remove(i)">Delete</button>
              </td>
            </ng-container>
            <ng-template #editRow>
              <td class="px-4 py-2"><input [(ngModel)]="editLabel" maxlength="60" class="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"></td>
              <td class="px-4 py-2" *ngIf="valueLabel"><input type="number" min="0" [(ngModel)]="editValue" class="w-24 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"></td>
              <td class="px-4 py-2"></td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <button type="button" class="mr-3 text-violet-700 hover:underline" [disabled]="!editLabel.trim()" (click)="saveEdit(i)">Save</button>
                <button type="button" class="text-gray-600 hover:underline" (click)="editingId = null">Cancel</button>
              </td>
            </ng-template>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class MasterListEditorComponent implements OnInit {
  @Input({ required: true }) list!: MasterListName;
  @Input() title = '';
  @Input() hint = '';
  @Input() placeholder = '';
  /** Column/field label for the numeric value (e.g. "Days", "Rate %"). Omit for name-only lists. */
  @Input() valueLabel = '';

  private svc = inject(MasterListService);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);

  items: MasterListItem[] = [];
  loading = true;
  saving = false;
  error = '';

  newLabel = '';
  newValue: number | null = null;

  editingId: string | null = null;
  editLabel = '';
  editValue: number | null = null;

  ngOnInit(): void {
    this.svc.getItems(this.list).subscribe({
      next: (res) => { this.items = res.data; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  add(): void {
    if (!this.newLabel.trim()) return;
    this.saving = true;
    this.error = '';
    this.svc.createItem(this.list, { label: this.newLabel.trim(), value: this.valueLabel ? this.newValue : null }).subscribe({
      next: (res) => {
        this.items = [...this.items, res.data].sort((a, b) => a.label.localeCompare(b.label));
        this.newLabel = '';
        this.newValue = null;
        this.saving = false;
      },
      error: (e) => { this.saving = false; this.error = e?.error?.message || 'Could not add item'; },
    });
  }

  startEdit(i: MasterListItem): void {
    this.editingId = i._id;
    this.editLabel = i.label;
    this.editValue = i.value;
  }

  saveEdit(i: MasterListItem): void {
    this.svc.updateItem(this.list, i._id, { label: this.editLabel.trim(), value: this.valueLabel ? this.editValue : null }).subscribe({
      next: (res) => { Object.assign(i, res.data); this.editingId = null; },
      error: (e) => this.toast.error(e?.error?.message || 'Could not save changes'),
    });
  }

  toggleActive(i: MasterListItem): void {
    this.svc.updateItem(this.list, i._id, { isActive: !i.isActive }).subscribe({
      next: (res) => { i.isActive = res.data.isActive; },
      error: () => this.toast.error('Could not update'),
    });
  }

  async remove(i: MasterListItem): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete item?',
      message: `Delete "${i.label}"?`,
      consequence: 'Deactivate it instead if you only want to hide it from new records.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.svc.deleteItem(this.list, i._id).subscribe({
      next: () => { this.items = this.items.filter((x) => x !== i); },
      error: (e) => this.toast.error(e?.error?.message || 'Could not delete'),
    });
  }
}

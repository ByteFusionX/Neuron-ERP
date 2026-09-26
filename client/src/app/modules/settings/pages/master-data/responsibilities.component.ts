import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService } from 'src/app/core/services/employee/employee.service';
import { ConfirmDialogService } from 'src/app/shared/components/confirm-dialog';
import { Responsibility } from 'src/app/shared/interfaces/employee.interface';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';
import { settingsEditAccess } from '../../settings-edit-access';

@Component({
  selector: 'app-responsibilities',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <div class="w-full min-h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="master-data" label="Responsibilities"
        description="Role accountability lists used by HR roles and future approval routing."></app-settings-section-header>

      <div class="space-y-6">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Responsibilities</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          What a role can be accountable for, such as approving finance items. Tick them per role in HR, Roles &amp; Privileges.
        </p>

        <form *ngIf="canEdit()" class="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 p-5 dark:border-gray-700" (ngSubmit)="add()">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
            <input name="label" [(ngModel)]="newLabel" required maxlength="60" placeholder="e.g. Procurement buyer"
              class="w-64 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          </label>
          <label class="block grow">
            <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Description (optional)</span>
            <input name="description" [(ngModel)]="newDescription" maxlength="140"
              class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          </label>
          <button type="submit" [disabled]="!newLabel.trim() || saving"
            class="rounded-md bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-600 disabled:opacity-50">+ Add</button>
        </form>
        <p *ngIf="error" class="text-sm text-red-600" role="alert">{{ error }}</p>

        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="w-full text-sm">
            <thead class="bg-gray-100 dark:bg-gray-800 text-left text-[13px] font-medium text-gray-700 dark:text-gray-300">
              <tr><th class="px-4 py-3">Name</th><th class="px-4 py-3">Key</th><th class="px-4 py-3">Description</th><th class="px-4 py-3">Active</th><th class="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              <tr *ngIf="loading"><td colspan="5" class="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
              <tr *ngIf="!loading && !items.length"><td colspan="5" class="px-4 py-6 text-center text-gray-500">No responsibilities yet.</td></tr>
              <tr *ngFor="let r of items" class="border-t border-gray-100 dark:border-gray-800">
                <ng-container *ngIf="editingId !== r._id; else editRow">
                  <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ r.label }}</td>
                  <td class="px-4 py-3 text-gray-500">{{ r.key }}</td>
                  <td class="px-4 py-3 text-gray-600 dark:text-gray-400">{{ r.description || '-' }}</td>
                  <td class="px-4 py-3">
                    <input type="checkbox" [checked]="r.isActive" (change)="toggleActive(r)" class="h-4 w-4 cursor-pointer accent-violet-600" [disabled]="!canEdit()" [attr.aria-label]="'Active: ' + r.label">
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap" *ngIf="canEdit()">
                    <button type="button" class="mr-3 text-violet-700 hover:underline" (click)="startEdit(r)">Edit</button>
                    <button type="button" class="text-red-600 hover:underline" (click)="remove(r)">Delete</button>
                  </td>
                </ng-container>
                <ng-template #editRow>
                  <td class="px-4 py-2"><input [(ngModel)]="editLabel" maxlength="60" class="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"></td>
                  <td class="px-4 py-2 text-gray-500">{{ r.key }}</td>
                  <td class="px-4 py-2"><input [(ngModel)]="editDescription" maxlength="140" class="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"></td>
                  <td class="px-4 py-2"></td>
                  <td class="px-4 py-2 text-right whitespace-nowrap">
                    <button type="button" class="mr-3 text-violet-700 hover:underline" [disabled]="!editLabel.trim()" (click)="saveEdit(r)">Save</button>
                    <button type="button" class="text-gray-600 hover:underline" (click)="editingId = null">Cancel</button>
                  </td>
                </ng-template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ResponsibilitiesComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private toast = inject(ToastrService);
  private confirm = inject(ConfirmDialogService);
  readonly canEdit = settingsEditAccess('masterDataEdit');

  items: Responsibility[] = [];
  loading = true;
  saving = false;
  error = '';

  newLabel = '';
  newDescription = '';

  editingId: string | null = null;
  editLabel = '';
  editDescription = '';

  ngOnInit(): void {
    this.employeeService.getResponsibilities().subscribe({
      next: (list) => { this.items = list; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  add(): void {
    if (!this.newLabel.trim()) return;
    this.saving = true;
    this.error = '';
    this.employeeService.createResponsibility({ label: this.newLabel.trim(), description: this.newDescription.trim() }).subscribe({
      next: (created) => {
        this.items = [...this.items, created].sort((a, b) => a.label.localeCompare(b.label));
        this.newLabel = this.newDescription = '';
        this.saving = false;
      },
      error: (e) => { this.saving = false; this.error = typeof e.error === 'string' ? e.error : 'Could not add responsibility'; },
    });
  }

  startEdit(r: Responsibility): void {
    this.editingId = r._id ?? null;
    this.editLabel = r.label;
    this.editDescription = r.description ?? '';
  }

  saveEdit(r: Responsibility): void {
    this.employeeService.updateResponsibility(r._id!, { label: this.editLabel.trim(), description: this.editDescription.trim() }).subscribe({
      next: (updated) => { Object.assign(r, updated); this.editingId = null; },
      error: () => this.toast.error('Could not save changes'),
    });
  }

  toggleActive(r: Responsibility): void {
    this.employeeService.updateResponsibility(r._id!, { isActive: !r.isActive }).subscribe({
      next: (updated) => { r.isActive = updated.isActive; },
      error: () => this.toast.error('Could not update'),
    });
  }

  async remove(r: Responsibility): Promise<void> {
    const { confirmed } = await this.confirm.open({
      tone: 'reject',
      title: 'Delete responsibility?',
      message: `Delete "${r.label}"?`,
      consequence: 'Roles still using it will block the delete; deactivate it instead to hide it from new roles.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.employeeService.deleteResponsibility(r._id!).subscribe({
      next: () => { this.items = this.items.filter((x) => x !== r); },
      error: (e) => this.toast.error(e.error?.message ?? 'Could not delete'),
    });
  }
}

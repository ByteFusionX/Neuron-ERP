import { Component, Inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface MasterListItemDialogData {
  title: string;
  valueLabel?: string;
  label?: string;
  value?: number | null;
}

@Component({
  selector: 'app-master-list-item-dialog',
  standalone: true,
  imports: [NgIf, FormsModule],
  template: `
    <form class="p-6" (ngSubmit)="save()">
      <h3 class="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">{{ data.label ? 'Edit' : 'Add' }} {{ data.title }}</h3>
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
        <input name="label" [(ngModel)]="label" required maxlength="60" autofocus
          class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
      </label>
      <label class="mt-4 block" *ngIf="data.valueLabel">
        <span class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">{{ data.valueLabel }}</span>
        <input type="number" min="0" name="value" [(ngModel)]="value"
          class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
      </label>
      <div class="mt-6 flex justify-end gap-3">
        <button type="button" class="rounded-md px-3 py-2 text-sm text-gray-600 hover:underline" (click)="ref.close()">Cancel</button>
        <button type="submit" [disabled]="!label.trim()"
          class="rounded-md bg-violet-700 px-3 py-2 text-sm text-white hover:bg-violet-600 disabled:opacity-50">Save</button>
      </div>
    </form>
  `,
})
export class MasterListItemDialog {
  label: string;
  value: number | null;

  constructor(public ref: MatDialogRef<MasterListItemDialog>, @Inject(MAT_DIALOG_DATA) public data: MasterListItemDialogData) {
    this.label = data.label ?? '';
    this.value = data.value ?? null;
  }

  save(): void {
    if (!this.label.trim()) return;
    this.ref.close({ label: this.label.trim(), value: this.data.valueLabel ? this.value : null });
  }
}

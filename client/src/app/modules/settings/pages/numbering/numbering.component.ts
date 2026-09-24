import { Component, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MasterListService, NumberingSeries } from 'src/app/core/services/master-list.service';
import { SettingsSectionHeaderComponent } from '../settings-section-header.component';

interface SeriesRow extends NumberingSeries {
  editNext: number | null;
  saving: boolean;
  error: string;
}

@Component({
  selector: 'app-numbering',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, SettingsSectionHeaderComponent],
  template: `
    <div class="w-full h-full bg-white dark:bg-erp-surface-dark p-6 rounded-md">
      <app-settings-section-header sectionId="numbering"></app-settings-section-header>
      <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
        The number format is fixed. You can move a series forward, for example after migrating from another system. It can never go back, so a number is not issued twice.
      </p>

      <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="w-full text-sm">
          <thead class="bg-gray-100 dark:bg-gray-800 text-left text-[13px] font-medium text-gray-700 dark:text-gray-300">
            <tr><th class="px-4 py-3">Series</th><th class="px-4 py-3">Format</th><th class="px-4 py-3">Last issued</th><th class="px-4 py-3">Next number</th><th class="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            <tr *ngIf="loading"><td colspan="5" class="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
            <tr *ngFor="let s of rows" class="border-t border-gray-100 dark:border-gray-800 align-top">
              <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{{ s.label }}</td>
              <td class="px-4 py-3">
                <p class="text-gray-700 dark:text-gray-300">{{ s.format }}</p>
                <p class="text-xs text-gray-500">e.g. {{ s.example }}</p>
              </td>
              <td class="px-4 py-3 text-gray-600 dark:text-gray-400">{{ s.lastNumber || '-' }}</td>
              <td class="px-4 py-3">
                <input type="number" min="1" [(ngModel)]="s.editNext" [name]="s.key"
                  class="w-28 rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1">
                <p *ngIf="s.error" class="mt-1 text-xs text-red-600">{{ s.error }}</p>
              </td>
              <td class="px-4 py-3 text-right">
                <button type="button" class="text-violet-700 hover:underline disabled:opacity-50"
                  [disabled]="s.saving || s.editNext === s.nextNumber" (click)="save(s)">{{ s.saving ? 'Saving…' : 'Save' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class NumberingComponent implements OnInit {
  private svc = inject(MasterListService);

  rows: SeriesRow[] = [];
  loading = true;

  ngOnInit(): void {
    this.svc.getNumbering().subscribe({
      next: (res) => {
        this.rows = res.data.map((s) => ({ ...s, editNext: s.nextNumber, saving: false, error: '' }));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  save(s: SeriesRow): void {
    if (s.editNext == null) return;
    s.saving = true;
    s.error = '';
    this.svc.setNextNumber(s.key, s.editNext).subscribe({
      next: (res) => {
        s.lastNumber = res.data.lastNumber;
        s.nextNumber = res.data.nextNumber;
        s.editNext = res.data.nextNumber;
        s.saving = false;
      },
      error: (e) => { s.saving = false; s.error = e?.error?.message || 'Failed to update'; },
    });
  }
}

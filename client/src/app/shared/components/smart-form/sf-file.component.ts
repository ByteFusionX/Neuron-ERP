import { Component, Input, booleanAttribute, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES } from './sf.model';

/** Drag-and-drop picker. Value is always File[]; uploading is the host's job on submit. */
@Component({
  selector: 'app-sf-file',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfFileComponent), multi: true }],
  template: `
    <label [attr.for]="inputId" class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors"
      [ngClass]="dragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-gray-300 dark:border-erp-border-dark hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'"
      [class.pointer-events-none]="disabled" [class.opacity-50]="disabled"
      (dragover)="$event.preventDefault(); dragging = true" (dragleave)="dragging = false" (drop)="onDrop($event)">
      <svg class="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <span class="text-[13px] text-gray-700 dark:text-gray-300"><span class="font-medium text-violet-700 dark:text-violet-400">Click to upload</span> or drag and drop</span>
      <span class="text-xs text-gray-500 dark:text-gray-500">{{ accept || 'Any file' }}{{ maxSizeMb ? ' · up to ' + maxSizeMb + ' MB' : '' }}</span>
      <input #picker type="file" class="sr-only" [id]="inputId" [accept]="accept" [multiple]="multiple" [disabled]="disabled"
        (change)="add(picker.files); picker.value = ''" />
    </label>

    <p *ngFor="let r of rejected" class="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{{ r }}</p>

    <ul *ngIf="files.length" class="mt-2 divide-y divide-gray-100 dark:divide-erp-border-dark rounded-lg border border-gray-200 dark:border-erp-border-dark">
      <li *ngFor="let f of files; let i = index" class="flex items-center gap-3 px-3 py-2 text-[13px]">
        <span class="grid h-8 w-8 shrink-0 place-content-center rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">{{ ext(f) }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-gray-900 dark:text-gray-100">{{ f.name }}</span>
          <span class="block text-xs text-gray-500 dark:text-gray-500">{{ size(f) }}</span>
        </span>
        <button type="button" class="sf-focus rounded px-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400" [disabled]="disabled" [attr.aria-label]="'Remove ' + f.name"
          (click)="remove(i)">&times;</button>
      </li>
    </ul>
  `,
  styles: [SF_STYLES],
})
export class SfFileComponent extends SfControl<File[]> {
  @Input() accept = '';
  @Input() maxSizeMb: number | null = null;
  @Input({ transform: booleanAttribute }) multiple = true;

  dragging = false;
  rejected: string[] = [];

  get files(): File[] {
    return this.value ?? [];
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging = false;
    if (!this.disabled) this.add(e.dataTransfer?.files ?? null);
  }

  add(list: FileList | null): void {
    if (!list?.length) return;
    this.rejected = [];
    const accepted = Array.from(list).filter((f) => {
      if (this.maxSizeMb && f.size > this.maxSizeMb * 1024 * 1024) {
        this.rejected.push(`${f.name} is larger than ${this.maxSizeMb} MB`);
        return false;
      }
      if (!this.isAllowedType(f)) {
        this.rejected.push(`${f.name} is not an allowed file type`);
        return false;
      }
      return true;
    });
    this.update(this.multiple ? [...this.files, ...accepted] : accepted.slice(0, 1));
    this.touch();
  }

  remove(i: number): void {
    this.update(this.files.filter((_, idx) => idx !== i));
  }

  /** Enforces `accept` (extensions like .pdf, mime types like image/*) for drops and "All files" picks too. */
  private isAllowedType(f: File): boolean {
    const tokens = this.accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length) return true;
    const name = f.name.toLowerCase();
    const type = (f.type || '').toLowerCase();
    return tokens.some((t) =>
      t.startsWith('.') ? name.endsWith(t) : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t
    );
  }

  ext(f: File): string {
    return f.name.includes('.') ? f.name.split('.').pop()!.slice(0, 4) : 'file';
  }

  size(f: File): string {
    return f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`;
  }
}

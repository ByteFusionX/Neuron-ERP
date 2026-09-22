import { Component, ElementRef, HostListener, Input, booleanAttribute, forwardRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { SfControl } from './sf-control';
import { SF_STYLES, SfOption } from './sf.model';

/** Searchable select. With `multiple`, the value is an array and selections render as chips. */
@Component({
  selector: 'app-sf-combobox',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SfComboboxComponent), multi: true }],
  template: `
    <div class="relative" #wrapper>
      <div class="sf-input flex cursor-text flex-wrap items-center gap-1 !pr-8" [class.py-1]="multiple && selected.length"
        [class.sf-disabled]="disabled" (click)="input.focus()">
        <ng-container *ngIf="multiple">
          <span *ngFor="let o of selected" class="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-950/40 py-0.5 pl-1.5 pr-1 text-xs text-violet-700 dark:text-violet-300">
            {{ o.label }}
            <button type="button" class="sf-focus rounded px-0.5 hover:bg-violet-100 dark:hover:bg-violet-900/50" [disabled]="disabled" [attr.aria-label]="'Remove ' + o.label"
              (click)="toggle(o); $event.stopPropagation()">&times;</button>
          </span>
        </ng-container>
        <input #input class="sf-bare min-w-[5rem]" [class.!h-7]="multiple && selected.length" role="combobox" autocomplete="off"
          [id]="inputId" [attr.aria-expanded]="open" [value]="open || multiple ? query : selectedLabel"
          [placeholder]="multiple && selected.length ? '' : (selectedLabel || placeholder)" [disabled]="disabled" [readOnly]="readonly"
          (focus)="onFocus()" (blur)="close()" (input)="query = $any($event.target).value; open = true; active = 0; positionDropdown()"
          (keydown)="onKey($event)" />
      </div>
      <svg class="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
      <ul *ngIf="open" role="listbox" class="fixed z-[999] max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-erp-border-dark bg-white dark:bg-erp-surface-dark py-1 shadow-lg"
        [style.top.px]="dropdownTop" [style.left.px]="dropdownLeft" [style.width.px]="dropdownWidth">
        <li *ngFor="let o of filtered; let i = index" role="option" [attr.aria-selected]="isSelected(o)"
          class="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-[13px] text-gray-800 dark:text-gray-200"
          [ngClass]="{ 'bg-gray-50 dark:bg-gray-800': i === active, 'cursor-not-allowed text-gray-300 dark:text-gray-600': o.disabled }"
          (mousedown)="$event.preventDefault(); choose(o)" (mouseenter)="active = i">
          <span class="min-w-0">
            <span class="block truncate">{{ o.label }}</span>
            <span *ngIf="o.description" class="block truncate text-xs text-gray-500 dark:text-gray-500">{{ o.description }}</span>
          </span>
          <svg *ngIf="isSelected(o)" class="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clip-rule="evenodd" />
          </svg>
        </li>
        <li *ngIf="!filtered.length" class="px-3 py-2 text-[13px] text-gray-500 dark:text-gray-500">No matches</li>
      </ul>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfComboboxComponent extends SfControl {
  @Input() options: SfOption[] = [];
  @Input({ transform: booleanAttribute }) multiple = false;

  @ViewChild('wrapper') private wrapper!: ElementRef<HTMLElement>;

  open = false;
  query = '';
  active = 0;

  dropdownTop = 0;
  dropdownLeft = 0;
  dropdownWidth = 0;

  private elementRef = inject(ElementRef);

  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(e: MouseEvent): void {
    if (this.open && !this.elementRef.nativeElement.contains(e.target)) {
      this.close();
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.open) this.positionDropdown();
  }

  onFocus(): void {
    if (this.readonly) return;
    this.open = true;
    this.active = 0;
    this.positionDropdown();
  }

  positionDropdown(): void {
    const rect = this.wrapper.nativeElement.getBoundingClientRect();
    this.dropdownTop = rect.bottom + 4;
    this.dropdownLeft = rect.left;
    this.dropdownWidth = rect.width;
  }

  get values(): any[] {
    return Array.isArray(this.value) ? this.value : [];
  }

  get selected(): SfOption[] {
    return this.options.filter((o) => this.isSelected(o));
  }

  get selectedLabel(): string {
    return this.multiple ? '' : this.options.find((o) => o.value === this.value)?.label ?? '';
  }

  get filtered(): SfOption[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.options.filter((o) => o.label.toLowerCase().includes(q)) : this.options;
  }

  isSelected(o: SfOption): boolean {
    return this.multiple ? this.values.includes(o.value) : o.value === this.value;
  }

  choose(o: SfOption | undefined): void {
    if (!o || o.disabled) return;
    if (this.multiple) {
      this.toggle(o);
      this.query = '';
    } else {
      this.update(o.value);
      this.open = false;
      this.query = '';
    }
  }

  toggle(o: SfOption): void {
    this.update(this.isSelected(o) ? this.values.filter((v) => v !== o.value) : [...this.values, o.value]);
  }

  close(): void {
    this.open = false;
    this.query = '';
    this.touch();
  }

  onKey(e: KeyboardEvent): void {
    const count = this.filtered.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); this.open = true; this.active = count ? (this.active + 1) % count : 0; break;
      case 'ArrowUp': e.preventDefault(); this.active = count ? (this.active - 1 + count) % count : 0; break;
      case 'Enter': if (this.open) { e.preventDefault(); this.choose(this.filtered[this.active]); } break;
      case 'Escape': if (this.open) { e.stopPropagation(); this.open = false; this.query = ''; } break;
      case 'Backspace': if (this.multiple && !this.query && this.values.length) this.update(this.values.slice(0, -1)); break;
    }
  }
}

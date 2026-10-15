import { Component, ElementRef, EventEmitter, HostListener, Input, Output, booleanAttribute, forwardRef, inject, ViewChild } from '@angular/core';
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
        [class.sf-disabled]="disabled" (click)="input.focus(); reopen()">
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
      <button *ngIf="clearable && !multiple && value && !disabled && !readonly" type="button" aria-label="Clear selection"
        class="sf-focus absolute right-7 top-2 h-5 w-5 rounded text-base leading-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        (mousedown)="$event.preventDefault()" (click)="update(null); query = ''; open = false">&times;</button>
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
        <li *ngIf="!filtered.length && !creatable" class="px-3 py-2 text-[13px] text-gray-500 dark:text-gray-500">{{ !options.length && emptyText ? emptyText : 'No matches' }}</li>
        <li *ngIf="footerLabel" class="sticky bottom-0 border-t border-gray-100 bg-white dark:border-erp-border-dark dark:bg-erp-surface-dark">
          <button type="button" class="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] font-medium text-violet-700 hover:bg-gray-50 dark:text-violet-300 dark:hover:bg-gray-800"
            (mousedown)="$event.preventDefault(); open = false; query = ''; footerAction.emit()">
            <span aria-hidden="true">+</span>
            <span class="truncate">{{ footerLabel }}</span>
          </button>
        </li>
        <li *ngIf="creatable" class="sticky bottom-0 border-t border-gray-100 bg-white dark:border-erp-border-dark dark:bg-erp-surface-dark">
          <button type="button" [disabled]="!canCreate" class="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] font-medium text-violet-700 hover:bg-gray-50 disabled:cursor-default disabled:text-gray-400 disabled:hover:bg-transparent dark:text-violet-300 dark:hover:bg-gray-800 dark:disabled:text-gray-500"
            (mousedown)="$event.preventDefault(); createFromQuery()">
            <span aria-hidden="true">+</span>
            <span class="truncate">{{ canCreate ? 'Add “' + query.trim() + '”' : 'Enter to add' }}</span>
          </button>
        </li>
      </ul>
    </div>
  `,
  styles: [SF_STYLES],
})
export class SfComboboxComponent extends SfControl {
  @Input() options: SfOption[] = [];
  /** Shown instead of "No matches" while there are no options at all (e.g. "Select a client first"). */
  @Input() emptyText = '';
  @Input({ transform: booleanAttribute }) multiple = false;
  /** Single-select only: shows a button that resets the value to null. */
  @Input({ transform: booleanAttribute }) clearable = false;

  /** Adds an "Add …" row to the dropdown; the host creates the option and sets the value. */
  @Input({ transform: booleanAttribute }) creatable = false;
  @Output() createOption = new EventEmitter<string>();

  /** Adds a pinned button at the bottom of the dropdown (e.g. "Add category"); the host handles the click. */
  @Input() footerLabel = '';
  @Output() footerAction = new EventEmitter<void>();

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

  /** A field that kept focus after a choice gets no new focus event on click, so reopen the list here. */
  reopen(): void {
    if (!this.open && !this.disabled) this.onFocus();
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
    // A narrow field (e.g. a UoM cell) still gets a list wide enough to read, kept inside the viewport.
    this.dropdownWidth = Math.max(rect.width, 200);
    this.dropdownLeft = Math.max(8, Math.min(rect.left, window.innerWidth - this.dropdownWidth - 8));
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

  get canCreate(): boolean {
    const q = this.query.trim().toLowerCase();
    return this.creatable && !!q && !this.options.some((o) => o.label.trim().toLowerCase() === q);
  }

  createFromQuery(): void {
    if (!this.canCreate) return;
    this.createOption.emit(this.query.trim());
    this.open = false;
    this.query = '';
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
      case 'Enter': if (this.open) { e.preventDefault(); if (this.filtered.length) this.choose(this.filtered[this.active]); else this.createFromQuery(); } break;
      case 'Escape': if (this.open) { e.stopPropagation(); this.open = false; this.query = ''; } break;
      case 'Backspace': if (this.multiple && !this.query && this.values.length) this.update(this.values.slice(0, -1)); break;
    }
  }
}

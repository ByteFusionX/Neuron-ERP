import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DetailFieldsMenuItem {
  key: string;
  label: string;
  /** Starts unchecked; the user can still turn it on. */
  hiddenByDefault?: boolean;
}

/**
 * 3-dot button for a section header that lists its fields with checkboxes to show or hide them.
 * Choices are remembered per browser under `storageKey`; `hiddenByDefault` items are hidden only
 * the first time they are seen. The parent hides fields by listening to (hiddenChange).
 *
 *   <app-detail-fields-menu sectionActions [items]="items" storageKey="x" (hiddenChange)="hidden = $event">
 */
@Component({
  selector: 'app-detail-fields-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" class="dt-dots" title="Show or hide fields" aria-label="Show or hide fields" (click)="toggle($event)">
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><circle cx="10" cy="4" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="10" cy="16" r="1.6"/></svg>
    </button>
    <div *ngIf="open" class="fixed z-50 max-h-80 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-[13px] shadow-lg dark:border-erp-border-dark dark:bg-erp-surface-dark" [style.top.px]="top" [style.right.px]="right">
      <p class="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Fields</p>
      <label *ngFor="let i of ordered" draggable="true" (dragstart)="dragKey = i.key" (dragover)="$event.preventDefault()" (drop)="drop(i.key)" (dragend)="dragKey = ''"
        class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5" [class.opacity-40]="dragKey === i.key">
        <span class="cursor-grab select-none text-gray-400" title="Drag to reorder" aria-hidden="true">&#8942;&#8942;</span>
        <input type="checkbox" class="h-3.5 w-3.5 accent-violet-600" [checked]="!hidden.has(i.key)" (change)="flip(i.key)" />
        <span class="truncate">{{ i.label }}</span>
      </label>
      <button type="button" *ngIf="hidden.size" (click)="showAll()" class="mt-1 w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs font-medium text-violet-600 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5">Show all</button>
    </div>
  `,
  styles: [
    ':host{display:inline-flex}',
    '.dt-dots{display:inline-flex;align-items:center;justify-content:center;border-radius:.375rem;padding:.125rem;color:#6b7280}',
    '.dt-dots:hover{background:rgba(124,58,237,.1);color:#6d28d9}',
  ],
})
export class DetailFieldsMenuComponent implements OnChanges {
  @Input() items: DetailFieldsMenuItem[] = [];
  @Input() storageKey = '';
  @Output() hiddenChange = new EventEmitter<Set<string>>();
  /** Field keys in the order the user arranged them (drag a row to move it). */
  @Output() orderChange = new EventEmitter<string[]>();

  hidden = new Set<string>();
  ordered: DetailFieldsMenuItem[] = [];
  dragKey = '';
  private order: string[] = [];
  open = false;
  top = 0;
  right = 0;
  private loaded = false;
  private seen = new Set<string>();

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    if (!this.loaded) {
      this.loaded = true;
      try {
        const saved = JSON.parse(localStorage.getItem('df-hidden:' + this.storageKey) || '[]');
        if (Array.isArray(saved)) this.hidden = new Set(saved.map(String));
        const known = JSON.parse(localStorage.getItem('df-seen:' + this.storageKey) || '[]');
        if (Array.isArray(known)) this.seen = new Set(known.map(String));
        const order = JSON.parse(localStorage.getItem('df-order:' + this.storageKey) || '[]');
        if (Array.isArray(order)) this.order = order.map(String);
      } catch {}
    }
    this.applyOrder();
    let changed = false;
    for (const i of this.items) {
      if (!this.seen.has(i.key)) {
        this.seen.add(i.key);
        if (i.hiddenByDefault) this.hidden.add(i.key);
        changed = true;
      }
    }
    if (changed) this.persist();
    // Emit a fresh Set each time so the parent's change detection sees it.
    // Deferred: emitting mid-change-detection would change the parent's bindings after they were checked.
    const snapshot = new Set(this.hidden);
    const keys = this.ordered.map((i) => i.key);
    Promise.resolve().then(() => {
      this.hiddenChange.emit(snapshot);
      this.orderChange.emit(keys);
    });
  }

  /** Items sorted by the saved order; ones it doesn't know yet keep their given order, after the known ones. */
  private applyOrder(): void {
    const pos = (k: string) => { const i = this.order.indexOf(k); return i < 0 ? this.order.length : i; };
    this.ordered = [...this.items].sort((a, b) => pos(a.key) - pos(b.key));
  }

  drop(targetKey: string): void {
    const from = this.dragKey;
    this.dragKey = '';
    if (!from || from === targetKey) return;
    const keys = this.ordered.map((i) => i.key);
    keys.splice(keys.indexOf(from), 1);
    keys.splice(keys.indexOf(targetKey), 0, from);
    this.order = keys;
    this.applyOrder();
    this.persist();
    this.orderChange.emit(keys);
  }

  toggle(e: MouseEvent): void {
    e.stopPropagation();
    if (this.open) {
      this.open = false;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.top = r.bottom + 4;
    this.right = Math.max(8, window.innerWidth - r.right);
    this.open = true;
  }

  flip(key: string): void {
    if (this.hidden.has(key)) this.hidden.delete(key);
    else this.hidden.add(key);
    this.persist();
    this.hiddenChange.emit(new Set(this.hidden));
  }

  showAll(): void {
    this.hidden.clear();
    this.persist();
    this.hiddenChange.emit(new Set(this.hidden));
  }

  private persist(): void {
    if (!this.storageKey) return;
    try {
      localStorage.setItem('df-hidden:' + this.storageKey, JSON.stringify([...this.hidden]));
      localStorage.setItem('df-seen:' + this.storageKey, JSON.stringify([...this.seen]));
      localStorage.setItem('df-order:' + this.storageKey, JSON.stringify(this.order));
    } catch {}
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (this.open && !this.host.nativeElement.contains(e.target as Node)) this.open = false;
  }
}

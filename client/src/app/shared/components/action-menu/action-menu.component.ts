import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ActionMenuItem {
  id: string;
  label: string;
  /** Greyed out and not clickable; `hint` is shown as its tooltip. */
  disabled?: boolean;
  hint?: string;
  /** Draws a rule above this item, to group related actions. */
  separator?: boolean;
}

/** An overflow ("More") button with a dropdown list, for secondary actions that would crowd a header. */
@Component({
  selector: 'app-action-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      <button type="button" class="am-trigger" aria-haspopup="menu" [attr.aria-expanded]="open" (click)="open = !open">
        {{ label }}
        <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
      </button>
      <div *ngIf="open" role="menu" class="am-panel">
        <ng-container *ngFor="let i of items; trackBy: trackById">
          <div *ngIf="i.separator" class="am-sep"></div>
          <button type="button" role="menuitem" class="am-item" [disabled]="i.disabled" [attr.title]="i.hint || null" (click)="pick(i)">{{ i.label }}</button>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    :host { display: inline-flex; }
    .am-trigger { display: inline-flex; align-items: center; gap: 0.375rem; height: 2rem; padding: 0 0.75rem; font-size: 0.75rem; font-weight: 500;
      border-radius: 0.5rem; border: 1px solid #d1d5db; color: #374151; background: transparent; }
    .am-trigger:hover { background: #f9fafb; }
    .am-panel { position: absolute; right: 0; top: calc(100% + 4px); z-index: 40; min-width: 13rem; padding: 0.25rem; border-radius: 0.5rem;
      border: 1px solid #e5e7eb; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
    .am-item { display: block; width: 100%; padding: 0.4rem 0.625rem; text-align: left; font-size: 0.75rem; color: #374151; border-radius: 0.375rem; }
    .am-item:hover:not(:disabled) { background: #f3f4f6; }
    .am-item:disabled { opacity: 0.45; cursor: default; }
    .am-sep { height: 1px; margin: 0.25rem 0; background: #f3f4f6; }
    :host-context(html.dark) .am-trigger { color: #d4d4d4; border-color: #3f3f46; }
    :host-context(html.dark) .am-trigger:hover { background: #1a1a1a; }
    :host-context(html.dark) .am-panel { background: #1a1a1a; border-color: #262626; }
    :host-context(html.dark) .am-item { color: #d4d4d4; }
    :host-context(html.dark) .am-item:hover:not(:disabled) { background: #262626; }
    :host-context(html.dark) .am-sep { background: #262626; }
  `],
})
export class ActionMenuComponent {
  @Input() label = 'More';
  @Input() items: ActionMenuItem[] = [];
  @Output() selected = new EventEmitter<string>();
  open = false;
  private host = inject(ElementRef<HTMLElement>);

  trackById = (_: number, i: ActionMenuItem) => i.id;

  pick(i: ActionMenuItem): void {
    if (i.disabled) return;
    this.open = false;
    this.selected.emit(i.id);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (this.open && !this.host.nativeElement.contains(e.target)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.open = false;
  }
}

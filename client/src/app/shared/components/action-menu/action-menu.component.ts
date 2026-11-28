import { Component, ElementRef, EmbeddedViewRef, EventEmitter, HostListener, Input, OnDestroy, Output, TemplateRef, ViewChild, ViewContainerRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconsModule } from 'src/app/lib/icons/icons.module';

export interface ActionMenuItem {
  id: string;
  label: string;
  /** Greyed out and not clickable; `hint` is shown as its tooltip. */
  disabled?: boolean;
  hint?: string;
  /** Optional icon shown before the label. */
  icon?: string;
  /** Draws a rule above this item, to group related actions. */
  separator?: boolean;
}

/** An overflow ("More") button with a dropdown list, for secondary actions that would crowd a header. */
@Component({
  selector: 'app-action-menu',
  standalone: true,
  imports: [CommonModule, IconsModule],
  template: `
    <div class="relative">
      <button type="button" class="am-trigger" [class.am-icon-only]="icon" aria-haspopup="menu" [attr.aria-expanded]="open"
        [attr.aria-label]="icon ? label : null" [attr.title]="icon ? label : null" (click)="toggle($event)">
        <ng-icon *ngIf="icon; else textTrigger" [name]="icon" class="text-base"></ng-icon>
        <ng-template #textTrigger>
          {{ label }}
          <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
        </ng-template>
      </button>
      <!-- Rendered into <body> while open, so no ancestor's overflow, height or transform can clip it. -->
      <ng-template #panelTpl>
        <div role="menu" class="am-panel" [ngStyle]="panelStyle">
          <ng-container *ngFor="let i of items; trackBy: trackById">
            <div *ngIf="i.separator" class="am-sep"></div>
            <button type="button" role="menuitem" class="am-item" [disabled]="i.disabled" [attr.title]="i.hint || null" (click)="pick(i)">
              <ng-icon *ngIf="i.icon" [name]="i.icon" class="text-sm shrink-0"></ng-icon>
              {{ i.label }}
            </button>
          </ng-container>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: inline-flex; }
    .am-trigger { display: inline-flex; align-items: center; gap: 0.375rem; height: 2rem; padding: 0 0.75rem; font-size: 0.75rem; font-weight: 500;
      border-radius: 0.5rem; border: 1px solid #d1d5db; color: #374151; background: transparent; }
    .am-trigger:hover { background: #f9fafb; }
    .am-trigger.am-icon-only { width: 2rem; padding: 0; justify-content: center; border: 0; outline: none; box-shadow: none; }
    .am-panel { position: fixed; z-index: 1000; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; width: max-content; min-width: 8rem; white-space: nowrap; padding: 0.25rem; border-radius: 0.5rem;
      border: 1px solid #e5e7eb; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
    .am-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.4rem 0.625rem; text-align: left; font-size: 0.75rem; color: #374151; border-radius: 0.375rem; }
    .am-item:hover:not(:disabled) { background: #f3f4f6; }
    .am-item:disabled { opacity: 0.45; cursor: default; }
    .am-sep { height: 1px; margin: 0.25rem 0; background: #f3f4f6; }
    :host-context(html.dark) .am-trigger { color: #d4d4d4; border-color: #3f3f46; }
    :host-context(html.dark) .am-trigger:hover { background: #1a1a1a; }
    /* The panel lives in <body> while open, outside :host, so its dark rules key off <html> directly. */
    ::ng-deep html.dark .am-panel { background: #1a1a1a; border-color: #262626; }
    ::ng-deep html.dark .am-item { color: #d4d4d4; }
    ::ng-deep html.dark .am-item:hover:not(:disabled) { background: #262626; }
    ::ng-deep html.dark .am-sep { background: #262626; }
  `],
})
export class ActionMenuComponent implements OnDestroy {
  @Input() label = 'More';
  /** Icon name; when set the trigger is an icon-only button (label becomes its tooltip / aria-label). */
  @Input() icon = '';
  @Input() items: ActionMenuItem[] = [];
  @Output() selected = new EventEmitter<string>();
  @ViewChild('panelTpl', { static: true }) private panelTpl!: TemplateRef<unknown>;
  open = false;
  private host = inject(ElementRef<HTMLElement>);
  private vcr = inject(ViewContainerRef);
  private panelView: EmbeddedViewRef<unknown> | null = null;

  /**
   * Fixed to the viewport and capped to the room left on screen, so a long list scrolls instead of running off;
   * opens upward when there's more room above.
   */
  panelStyle: Record<string, string> = {};

  ngOnDestroy(): void {
    this.close();
  }

  toggle(e: Event): void {
    if (this.open) { this.close(); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const gap = 4, margin = 8;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const up = below < 240 && above > below;
    this.panelStyle = {
      right: `${Math.max(margin, window.innerWidth - r.right)}px`,
      maxHeight: `${Math.max(120, up ? above : below)}px`,
      ...(up ? { bottom: `${window.innerHeight - r.top + gap}px` } : { top: `${r.bottom + gap}px` }),
    };
    this.panelView = this.vcr.createEmbeddedView(this.panelTpl);
    this.panelView.detectChanges();
    this.panelView.rootNodes.forEach((n) => document.body.appendChild(n));
    document.addEventListener('scroll', this.onScroll, true);
    this.open = true;
  }

  /** Scrolling the page closes the menu, but scrolling inside the list itself must not. */
  @HostListener('window:resize')
  onViewportChange(): void {
    this.close();
  }

  /** Capture phase, so scrolling any container (not just the window) closes the now-misplaced list. */
  private onScroll = (e: Event): void => {
    if (this.open && !this.panelContains(e.target)) this.close();
  };

  trackById = (_: number, i: ActionMenuItem) => i.id;

  pick(i: ActionMenuItem): void {
    if (i.disabled) return;
    this.close();
    this.selected.emit(i.id);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (this.open && !this.host.nativeElement.contains(e.target) && !this.panelContains(e.target)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.close();
  }

  private close(): void {
    this.open = false;
    document.removeEventListener('scroll', this.onScroll, true);
    if (!this.panelView) return;
    this.panelView.destroy();
    this.panelView = null;
  }

  private panelContains(target: EventTarget | null): boolean {
    return !!this.panelView?.rootNodes.some((n: Node) => n === target || (target instanceof Node && n.contains(target)));
  }
}

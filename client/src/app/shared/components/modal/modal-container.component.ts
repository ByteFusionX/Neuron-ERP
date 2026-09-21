import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input, OnDestroy, OnInit, Output,
  Type, ViewChild, ViewContainerRef, inject,
} from '@angular/core';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EXIT_MS = 140;

/** Backdrop, animated centered panel, focus trap and Escape handling. Created by ModalService — don't use directly. */
@Component({
  selector: 'app-modal-container',
  standalone: true,
  template: `
    <div class="md-backdrop fixed inset-0 bg-gray-900/40 dark:bg-black/60" [class.md-blur]="layer === 'default'" [class.md-in]="visible" [style.zIndex]="backdropZ" (click)="onBackdrop()"></div>
    <div class="pointer-events-none fixed inset-0 flex items-end justify-center sm:items-center sm:p-4" [style.zIndex]="panelZ">
      <div #panel [attr.role]="role" aria-modal="true" tabindex="-1"
        class="md-panel pointer-events-auto w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none ring-1 ring-gray-900/5 sm:rounded-xl dark:bg-erp-surface-dark dark:ring-erp-border-dark"
        [style.maxWidth]="width" [class.md-in]="visible" (keydown)="onKeydown($event)">
        <ng-template #host></ng-template>
      </div>
    </div>
  `,
  styles: [`
    .md-backdrop { opacity: 0; transition: opacity ${EXIT_MS}ms ease; }
    .md-backdrop.md-blur { backdrop-filter: blur(2px); }
    .md-panel { opacity: 0; transform: translateY(12px) scale(0.97); transition: opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in; }
    .md-backdrop.md-in { opacity: 1; transition-duration: 200ms; }
    .md-panel.md-in { opacity: 1; transform: none; transition: opacity 200ms ease-out, transform 220ms cubic-bezier(0.16, 1, 0.3, 1); }
    @media (prefers-reduced-motion: reduce) { .md-panel, .md-panel.md-in { transform: none; } }
  `],
})
export class ModalContainerComponent implements OnInit, AfterViewInit, OnDestroy {
  private static seq = 0;
  @Input({ required: true }) component!: Type<unknown>;
  @Input({ required: true }) contentInjector!: Injector;
  @Input() width = '640px';
  @Input() closeOnBackdrop = true;
  /** 'alertdialog' for confirm-style dialogs that demand an explicit choice. */
  @Input() role: 'dialog' | 'alertdialog' = 'dialog';
  /** 'confirm' stacks above a regular modal (e.g. confirming inside a form modal) and skips the backdrop blur. */
  @Input() layer: 'default' | 'confirm' = 'default';
  @Output() closed = new EventEmitter<unknown>();

  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;
  @ViewChild('host', { read: ViewContainerRef, static: true }) host!: ViewContainerRef;

  visible = false;
  private closing = false;
  private cdr = inject(ChangeDetectorRef);
  private returnFocus = document.activeElement as HTMLElement | null;
  // capture phase on window runs before document listeners (e.g. the drawer's Escape), so one Escape closes only the topmost layer
  private escListener = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    this.close();
  };

  get backdropZ(): number {
    return this.layer === 'confirm' ? 70 : 65;
  }

  get panelZ(): number {
    return this.layer === 'confirm' ? 71 : 66;
  }

  ngOnInit(): void {
    this.host.createComponent(this.component, { injector: this.contentInjector });
  }

  ngAfterViewInit(): void {
    const el = this.panel.nativeElement;
    const heading = el.querySelector<HTMLElement>('h1, h2');
    if (heading) {
      heading.id ||= `md-title-${++ModalContainerComponent.seq}`;
      el.setAttribute('aria-labelledby', heading.id);
    }
    window.addEventListener('keydown', this.escListener, true);
    requestAnimationFrame(() => {
      this.visible = true;
      this.cdr.detectChanges();
      const autofocus = el.querySelector<HTMLElement>('[data-modal-autofocus]');
      (autofocus ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.escListener, true);
    this.returnFocus?.focus?.();
  }

  close(result?: unknown): void {
    if (this.closing) return;
    this.closing = true;
    this.visible = false;
    this.cdr.detectChanges();
    setTimeout(() => this.closed.emit(result), EXIT_MS);
  }

  onBackdrop(): void {
    if (this.closeOnBackdrop) this.close();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((f) => f.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === this.panel.nativeElement)) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
}

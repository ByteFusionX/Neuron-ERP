import { ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild, inject } from '@angular/core';

/**
 * One-row tab strip: hidden scrollbar, left/right arrow buttons, wheel scrolls sideways,
 * hold-and-drag with the mouse (touch scrolls natively). Project the role="tab" buttons inside.
 * Arrows only show when the tabs overflow.
 */
@Component({
  selector: 'app-scroll-tabs',
  standalone: true,
  template: `
    @if (canScrollLeft || canScrollRight) {
      <button type="button" class="st-arrow" [disabled]="!canScrollLeft" aria-label="Scroll tabs left" (click)="scrollTabs(-1)">
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.83 10l3.94 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clip-rule="evenodd"/></svg>
      </button>
    }
    <nav #strip role="tablist" (scroll)="update()" (wheel)="onWheel($event)"
      (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)" (pointercancel)="onPointerUp($event)"
      class="st-strip flex h-full min-w-0 flex-1 flex-nowrap items-stretch overflow-x-auto overflow-y-hidden select-none"
      [class]="gapClass" [class.cursor-grabbing]="dragging">
      <ng-content></ng-content>
    </nav>
    @if (canScrollLeft || canScrollRight) {
      <button type="button" class="st-arrow" [disabled]="!canScrollRight" aria-label="Scroll tabs right" (click)="scrollTabs(1)">
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd"/></svg>
      </button>
    }
  `,
  styles: [`
    :host { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
    .st-strip { scrollbar-width: none; }
    .st-strip::-webkit-scrollbar { display: none; }
    .st-arrow { display: grid; place-content: center; flex-shrink: 0; width: 1.75rem; height: 1.75rem; border-radius: 0.5rem; color: #6b7280; }
    .st-arrow:hover:not(:disabled) { background: #f3f4f6; color: #111827; }
    .st-arrow:disabled { opacity: 0.3; cursor: default; }
    :host-context(html.dark) .st-arrow:hover:not(:disabled) { background: #262626; color: #f3f4f6; }
  `],
})
export class ScrollTabsComponent implements OnDestroy {
  /** Tailwind gap between tabs. */
  @Input() gapClass = 'gap-x-4';

  @ViewChild('strip') set stripRef(r: ElementRef<HTMLElement> | undefined) {
    const el = r?.nativeElement;
    if (el === this.el) return;
    this.resize?.disconnect();
    this.mutation?.disconnect();
    this.el?.removeEventListener('click', this.onClickCapture, true);
    this.el = el;
    if (!el) return;
    el.addEventListener('click', this.onClickCapture, true);
    this.resize = new ResizeObserver(() => this.schedule());
    this.resize.observe(el);
    // tabs added/removed or relabelled change the scroll width without resizing the strip
    this.mutation = new MutationObserver(() => this.schedule());
    this.mutation.observe(el, { childList: true, subtree: true, characterData: true });
    this.schedule();
  }

  canScrollLeft = false;
  canScrollRight = false;
  dragging = false;

  private cdr = inject(ChangeDetectorRef);
  private el?: HTMLElement;
  private resize?: ResizeObserver;
  private mutation?: MutationObserver;
  private frame = 0;
  private drag: { id: number; x: number; left: number; moved: boolean } | null = null;
  private suppressClick = false;

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.mutation?.disconnect();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.update(); });
  }

  update(): void {
    const el = this.el;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    if (left !== this.canScrollLeft || right !== this.canScrollRight) {
      this.canScrollLeft = left;
      this.canScrollRight = right;
      this.cdr.detectChanges();
    }
  }

  scrollTabs(dir: 1 | -1): void {
    const el = this.el;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' });
  }

  /** Mouse wheel over the strip scrolls it sideways instead of the page. */
  onWheel(e: WheelEvent): void {
    const el = this.el;
    if (!el || el.scrollWidth <= el.clientWidth || e.ctrlKey) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    const atStart = el.scrollLeft <= 0 && delta < 0;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && delta > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    el.scrollLeft += delta;
  }

  onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !this.el) return;
    if (this.el.scrollWidth <= this.el.clientWidth) return;
    this.drag = { id: e.pointerId, x: e.clientX, left: this.el.scrollLeft, moved: false };
  }

  onPointerMove(e: PointerEvent): void {
    const d = this.drag, el = this.el;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 5) return;
      d.moved = true;
      this.dragging = true;
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.left - dx;
  }

  onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (d.moved) {
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false));
      if (this.el?.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    }
    this.drag = null;
    this.dragging = false;
  }

  /** A drag that ends over a tab must not also switch to it. */
  private onClickCapture = (e: MouseEvent): void => {
    if (!this.suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
    this.suppressClick = false;
  };
}

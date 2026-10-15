import { Directive, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, inject } from '@angular/core';

/**
 * Put on a scrolling list box (fixed max height, overflow-y-auto). Emits `loadMore` when the user
 * scrolls within `loadMoreThreshold` px of the bottom, at most once per `loadMoreThrottle` ms, so a
 * fast scroll asks for one more page rather than flooding the host. The host appends the next page
 * and, if the box is still not full, can call it again; `loadMoreDisabled` stops it at the end.
 */
@Directive({ selector: '[appLoadMore]', standalone: true })
export class LoadMoreOnScrollDirective implements OnInit, OnDestroy {
  @Input() loadMoreThreshold = 80;
  @Input() loadMoreThrottle = 150;
  /** True while there is nothing more to load or a page is already on its way. */
  @Input() loadMoreDisabled = false;
  @Output() loadMore = new EventEmitter<void>();

  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onScroll = () => this.schedule();

  ngOnInit(): void {
    // Outside Angular so scrolling does not run change detection; only a real emit re-enters.
    this.zone.runOutsideAngular(() => this.el.nativeElement.addEventListener('scroll', this.onScroll, { passive: true }));
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('scroll', this.onScroll);
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.timer) return;
    const wait = Math.max(0, this.loadMoreThrottle - (Date.now() - this.last));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check();
    }, wait);
  }

  private check(): void {
    const box = this.el.nativeElement;
    if (this.loadMoreDisabled) return;
    if (box.scrollHeight - box.scrollTop - box.clientHeight > this.loadMoreThreshold) return;
    this.last = Date.now();
    this.zone.run(() => this.loadMore.emit());
  }
}

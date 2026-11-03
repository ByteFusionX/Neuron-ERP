import { Directive, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';

/**
 * Tells a line whether it is near the viewport. The template renders a line's fields only while
 * `inView` is true, and the host keeps its last measured height meanwhile, so scrolling doesn't jump.
 * Unlike @defer this also tears the fields down again once the line is far off-screen, so a 100-line
 * item stays as cheap to check at the bottom as at the top.
 */
@Directive({ selector: '[appLineViewport]', standalone: true, exportAs: 'lineViewport' })
export class LineViewportDirective implements OnInit, OnDestroy {
  inView = false;
  private io?: IntersectionObserver;
  private height = 112;

  constructor(private el: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngOnInit(): void {
    const host = this.el.nativeElement;
    this.zone.runOutsideAngular(() => {
      this.io = new IntersectionObserver(entries => {
        const visible = entries[entries.length - 1].isIntersecting;
        if (visible === this.inView) return;
        if (visible) {
          this.zone.run(() => {
            this.inView = true;
            host.style.minHeight = '';
          });
        } else {
          // Never tear down the line being edited.
          if (host.contains(document.activeElement)) return;
          const h = host.offsetHeight;
          if (h > 0) this.height = h;
          host.style.minHeight = h > 0 ? this.height + 'px' : '';
          this.zone.run(() => { this.inView = false; });
        }
      }, { rootMargin: '600px 0px' });
      this.io.observe(host);
    });
  }

  ngOnDestroy(): void { this.io?.disconnect(); }
}

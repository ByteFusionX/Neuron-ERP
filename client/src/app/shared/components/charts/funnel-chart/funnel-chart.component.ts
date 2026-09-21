import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FunnelSegment, FunnelStage } from './funnel-chart.model';
import { FunnelGeometryOptions, buildRings, segmentSize } from './funnel-geometry';

/**
 * A standalone, dependency-free funnel chart.
 *
 * Draws each stage as a set of concentric translucent SVG paths inside one
 * measured SVG; labels sit in an overlay that doubles as the hover hit target
 * (the paths themselves are pointer-events:none). Motion is plain CSS, so no
 * animation library is needed and the chart still works with animations off.
 *
 * Colours come from the caller or from the surrounding theme, so light/dark is
 * handled by the existing Tailwind `dark` class without any JS.
 */
@Component({
  selector: 'app-funnel-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './funnel-chart.component.html',
  styleUrls: ['./funnel-chart.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FunnelChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLElement>;

  /** Stages in flow order. The largest value becomes 100%. */
  @Input() data: FunnelStage[] = [];
  @Input() orientation: 'horizontal' | 'vertical' = 'horizontal';
  /** Base fill. Any CSS colour; per-stage `color` overrides it. */
  @Input() color = '#7c3aed';
  /** Concentric copies per segment. 1 gives a flat shape (better for print). */
  @Input() layers = 3;
  @Input() edges: 'curved' | 'straight' = 'curved';
  /** Gap in px between segments. */
  @Input() gap = 4;
  /** Entrance stagger per stage, in ms. */
  @Input() staggerDelay = 120;
  /** Share of the box the widest segment fills, halved per side. */
  @Input() heightFactor = 0.44;
  @Input() showValues = true;
  @Input() showPercentage = true;
  @Input() showLabels = true;
  /** Turns off entrance and hover motion entirely. */
  @Input() animate = true;
  /** Formats the value text when a stage has no `displayValue`. */
  @Input() valueFormatter: (value: number) => string = (v) => v.toLocaleString();
  /** Formats the percentage text. */
  @Input() percentFormatter: (percent: number) => string = (p) => `${Math.round(p)}%`;

  /** Drive hover from outside (e.g. a legend); leave unset for self-managed hover. */
  @Input()
  set hoveredIndex(value: number | null) {
    this.hovered = value ?? null;
  }
  get hoveredIndex(): number | null {
    return this.hovered;
  }
  @Output() hoveredIndexChange = new EventEmitter<number | null>();

  segments: FunnelSegment[] = [];
  width = 0;
  height = 0;
  hovered: number | null = null;
  /** Flipped on after the first measured paint so the entrance transition runs. */
  entered = false;

  private observer?: ResizeObserver;
  private enterTimer?: number;

  constructor(private cdr: ChangeDetectorRef, private zone: NgZone) {}

  ngAfterViewInit(): void {
    const el = this.hostRef.nativeElement;

    // Measurement fires often; keep it out of the zone and only re-enter when
    // the box actually changed size.
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w === this.width && h === this.height) return;
        this.zone.run(() => {
          this.width = w;
          this.height = h;
          this.build();
          this.scheduleEnter();
          this.cdr.markForCheck();
        });
      });
      this.observer.observe(el);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (Object.keys(changes).some((k) => k !== 'hoveredIndex')) {
      this.build();
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.enterTimer) clearTimeout(this.enterTimer);
  }

  onEnter(index: number): void {
    if (this.hovered === index) return;
    this.hovered = index;
    this.hoveredIndexChange.emit(index);
  }

  onLeave(index: number): void {
    if (this.hovered !== index) return;
    this.hovered = null;
    this.hoveredIndexChange.emit(null);
  }

  /** True when another segment is hovered, so this one should recede. */
  isDimmed(index: number): boolean {
    return this.hovered !== null && this.hovered !== index;
  }

  trackByIndex(_: number, segment: FunnelSegment): number {
    return segment.index;
  }

  /** Segment geometry. Called on resize and whenever the inputs change. */
  private build(): void {
    const stages = (this.data ?? []).filter((s) => s && Number.isFinite(s.value));
    if (!stages.length || this.width <= 0 || this.height <= 0) {
      this.segments = [];
      return;
    }

    // Normalising against the largest value (not simply the first) keeps
    // percentages at or below 100% even if the data is not sorted.
    const max = Math.max(...stages.map((s) => Math.abs(s.value)), 0);
    const norms = stages.map((s) => (max > 0 ? Math.abs(s.value) / max : 0));

    const horizontal = this.orientation === 'horizontal';
    const count = stages.length;
    const along = horizontal
      ? segmentSize(this.width, count, this.gap)
      : segmentSize(this.height, count, this.gap);
    const cross = horizontal ? this.height : this.width;

    const opts: FunnelGeometryOptions = {
      width: this.width,
      height: this.height,
      gap: this.gap,
      layers: this.layers,
      edges: this.edges,
      orientation: this.orientation,
      heightFactor: this.heightFactor,
    };

    this.segments = stages.map((stage, i) => {
      const offset = i * (along + this.gap);
      const normStart = norms[i];
      // The last stage keeps a flat trailing edge rather than tapering to nothing.
      const normEnd = i + 1 < norms.length ? norms[i + 1] : norms[i];
      const percent = norms[i] * 100;

      return {
        index: i,
        label: stage.label,
        value: stage.value,
        valueText: stage.displayValue ?? this.valueFormatter(stage.value),
        percentText: this.percentFormatter(percent),
        percent,
        fill: stage.color ?? this.color,
        rings: buildRings(offset, normStart, normEnd, along, cross, opts),
        box: horizontal
          ? { left: offset, top: 0, width: along, height: this.height }
          : { left: 0, top: offset, width: this.width, height: along },
        delay: this.animate ? i * this.staggerDelay : 0,
      };
    });
  }

  /** Runs the entrance once, on the first frame after the chart has a size. */
  private scheduleEnter(): void {
    if (this.entered) return;
    if (!this.animate) {
      this.entered = true;
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.enterTimer = window.setTimeout(() => {
        this.zone.run(() => {
          this.entered = true;
          this.cdr.markForCheck();
        });
      }, 16);
    });
  }
}

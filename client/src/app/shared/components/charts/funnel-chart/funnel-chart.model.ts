/** One stage of a funnel. Stages are drawn left-to-right (or top-to-bottom) in array order. */
export interface FunnelStage {
  /** Name shown under the segment. */
  label: string;
  /** Numeric weight. The largest value in the set becomes 100%. */
  value: number;
  /** Overrides the formatted value text (e.g. a pre-formatted currency string). */
  displayValue?: string;
  /** Overrides the segment fill for this stage only. */
  color?: string;
}

/** A single drawn ring: one of the concentric translucent copies of a segment. */
export interface FunnelRing {
  d: string;
  opacity: number;
  /** scaleY applied to this ring while its segment is hovered. */
  hoverScale: number;
  /** ms, so outer rings settle slightly after inner ones. */
  duration: number;
}

/** Everything needed to render one stage, geometry plus overlay text. */
export interface FunnelSegment {
  index: number;
  label: string;
  value: number;
  valueText: string;
  percentText: string;
  percent: number;
  fill: string;
  rings: FunnelRing[];
  /** Overlay box, in px, used both for the labels and as the hover hit target. */
  box: { left: number; top: number; width: number; height: number };
  /** ms, entrance stagger for this stage. */
  delay: number;
}

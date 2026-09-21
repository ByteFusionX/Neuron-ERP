import { FunnelRing } from './funnel-chart.model';

/**
 * Pure geometry for the funnel. Kept free of Angular so the same paths can be
 * serialised into a static SVG string later (reports, exports) without a DOM.
 */

export interface FunnelGeometryOptions {
  /** Box the whole funnel is drawn into. */
  width: number;
  height: number;
  /** Gap in px between neighbouring segments. */
  gap: number;
  /** Concentric translucent copies drawn per segment. */
  layers: number;
  /** Curved uses cubic beziers between stages; straight uses plain edges. */
  edges: 'curved' | 'straight';
  orientation: 'horizontal' | 'vertical';
  /**
   * Share of the box's cross-axis the widest segment fills, halved per side.
   * 0.44 matches the reference look (widest segment fills 88% of the box).
   */
  heightFactor: number;
}

/** Half-thickness of a segment edge, for one ring. */
function halfSize(norm: number, cross: number, factor: number, layerScale: number): number {
  return norm * cross * factor * layerScale;
}

/** A horizontal segment: thickness runs vertically, flow runs left to right. */
export function hSegmentPath(
  x: number,
  normStart: number,
  normEnd: number,
  segW: number,
  height: number,
  layerScale: number,
  factor: number,
  straight: boolean,
): string {
  const my = height / 2;
  const h0 = halfSize(normStart, height, factor, layerScale);
  const h1 = halfSize(normEnd, height, factor, layerScale);
  const x1 = x + segW;

  if (straight) {
    return `M ${x} ${my - h0} L ${x1} ${my - h1} L ${x1} ${my + h1} L ${x} ${my + h0} Z`;
  }

  const c = segW * 0.55;
  const top = `M ${x} ${my - h0} C ${x + c} ${my - h0}, ${x1 - c} ${my - h1}, ${x1} ${my - h1}`;
  const bottom = `L ${x1} ${my + h1} C ${x1 - c} ${my + h1}, ${x + c} ${my + h0}, ${x} ${my + h0}`;
  return `${top} ${bottom} Z`;
}

/** A vertical segment: the same shape transposed, flowing top to bottom. */
export function vSegmentPath(
  y: number,
  normStart: number,
  normEnd: number,
  segH: number,
  width: number,
  layerScale: number,
  factor: number,
  straight: boolean,
): string {
  const mx = width / 2;
  const w0 = halfSize(normStart, width, factor, layerScale);
  const w1 = halfSize(normEnd, width, factor, layerScale);
  const y1 = y + segH;

  if (straight) {
    return `M ${mx - w0} ${y} L ${mx - w1} ${y1} L ${mx + w1} ${y1} L ${mx + w0} ${y} Z`;
  }

  const c = segH * 0.55;
  const left = `M ${mx - w0} ${y} C ${mx - w0} ${y + c}, ${mx - w1} ${y1 - c}, ${mx - w1} ${y1}`;
  const right = `L ${mx + w1} ${y1} C ${mx + w1} ${y1 - c}, ${mx + w0} ${y + c}, ${mx + w0} ${y}`;
  return `${left} ${right} Z`;
}

/**
 * Builds the concentric rings for one segment: same path repeated at shrinking
 * scale and rising opacity, which is what produces the layered "halo" look.
 */
export function buildRings(
  offset: number,
  normStart: number,
  normEnd: number,
  along: number,
  cross: number,
  opts: FunnelGeometryOptions,
): FunnelRing[] {
  const layers = Math.max(1, Math.floor(opts.layers));
  const straight = opts.edges === 'straight';
  const rings: FunnelRing[] = [];

  for (let l = 0; l < layers; l++) {
    const layerScale = 1 - (l / layers) * 0.35;
    const opacity = layers === 1 ? 0.83 : 0.18 + (l / (layers - 1)) * 0.65;

    const d =
      opts.orientation === 'vertical'
        ? vSegmentPath(offset, normStart, normEnd, along, cross, layerScale, opts.heightFactor, straight)
        : hSegmentPath(offset, normStart, normEnd, along, cross, layerScale, opts.heightFactor, straight);

    rings.push({
      d,
      opacity,
      // Inner rings swell most on hover, so the shape reads as breathing.
      hoverScale: 1 + (l / Math.max(layers - 1, 1)) * 0.12,
      // Outer rings settle last, leaving a short trailing echo.
      duration: 300 + (layers - 1 - l) * 90,
    });
  }

  return rings;
}

/** Size of one segment along the flow axis, once gaps are taken out. */
export function segmentSize(total: number, count: number, gap: number): number {
  if (count <= 0) return 0;
  return Math.max(0, (total - gap * (count - 1)) / count);
}

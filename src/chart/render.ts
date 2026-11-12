// Drawing of a chart as an SVG picture (a text), from the model of src/chart/spec.ts. The same picture is shown in the note, in the
// preview of the export, in the PDF (drawn as a picture) and in the HTML page. This file does not depend on Obsidian.
import { ChartSpec, seriesColor } from "./spec";

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 380;

const FONT = `font-family="Helvetica, Arial, sans-serif"`;
const TEXT = `#222222`;
const MUTED = `#666666`;
const GRID = `#d9d9d9`;
const AXIS = `#888888`;

export interface RenderOptions {
  // Decimal sign of the numbers shown: `,` or `.`.
  decimal?: `,` | `.`;
}

function esc(value: string): string {
  return value.replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/"/g, `&quot;`);
}

function r(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Width of a text in pixels, estimated (no font is measured here).
export function textWidth(value: string, size: number): number {
  return value.length * size * 0.56;
}

function shorten(value: string, size: number, max: number): string {
  if (textWidth(value, size) <= max) return value;
  const keep = Math.max(1, Math.floor(max / (size * 0.56)) - 1);
  return `${value.slice(0, keep)}…`;
}

// A number written with at most two decimals.
export function formatNumber(n: number, decimal: `,` | `.` = `.`): string {
  const s = String(Math.round(n * 100) / 100);
  return decimal === `,` ? s.replace(`.`, `,`) : s;
}

export interface Scale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

// A readable scale (1, 2, 5 times a power of ten) that holds [min, max].
export function niceScale(min: number, max: number, target = 5): Scale {
  let lo = min;
  let hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) {
    if (hi === 0) hi = 1;
    else if (hi > 0) lo = 0;
    else hi = 0;
  }
  const raw = (hi - lo) / Math.max(1, target);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start, i = 0; v <= end + step / 2 && i < 200; v += step, i++) ticks.push(Math.round((v / step) * 1e6) / 1e6 * step);
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

function label(x: number, y: number, content: string, size: number, anchor: `start` | `middle` | `end`, fill = TEXT, extra = ``): string {
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" ${FONT} text-anchor="${anchor}" fill="${fill}"${extra}>${esc(content)}</text>`;
}

// Legend in one or several rows, centred; returns the drawing (from y = top) and its height.
function legend(names: string[], colors: string[], width: number, top: number): { svg: string; height: number } {
  const size = 12;
  const items = names.map((n, i) => ({ name: shorten(n === `` ? String(i + 1) : n, size, 160), color: colors[i] }));
  const rows: { name: string; color: string; w: number }[][] = [[]];
  let used = 0;
  for (const it of items) {
    const w = 16 + textWidth(it.name, size) + 18;
    if (used + w > width - 24 && rows[rows.length - 1].length > 0) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push({ ...it, w });
    used += w;
  }
  let svg = ``;
  rows.forEach((row, ri) => {
    const total = row.reduce((s, it) => s + it.w, 0);
    let x = (width - total) / 2;
    const y = top + ri * 20;
    for (const it of row) {
      svg += `<rect x="${r(x)}" y="${r(y - 10)}" width="11" height="11" rx="2" fill="${it.color}"/>`;
      svg += label(x + 16, y, it.name, size, `start`);
      x += it.w;
    }
  });
  return { svg, height: rows.length * 20 + 6 };
}

function frame(inner: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="6" fill="#ffffff"/>${inner}</svg>`;
}

// Chart drawn on axes: bars, or lines.
function drawAxes(spec: ChartSpec, opts: RenderOptions): string {
  const W = CHART_WIDTH;
  const H = CHART_HEIGHT;
  const dec = opts.decimal ?? `.`;
  const horizontal = spec.type === `bar` && spec.horizontal;
  const stacked = spec.type === `bar` && spec.stacked;
  const n = spec.categories.length;
  const m = spec.series.length;
  const colors = spec.series.map((_s, i) => seriesColor(spec, i));

  // Range of the values.
  let lo = 0;
  let hi = 0;
  if (stacked) {
    for (let c = 0; c < n; c++) {
      let pos = 0;
      let neg = 0;
      for (const s of spec.series) {
        const v = s.values[c] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    }
  } else {
    for (const s of spec.series) {
      for (const v of s.values) {
        if (v === null) continue;
        hi = Math.max(hi, v);
        lo = Math.min(lo, v);
      }
    }
  }
  if (spec.type === `line`) {
    // A line chart does not have to start at zero when all the values are far from it.
    const all = spec.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
    if (all.length > 0 && Math.min(...all) > 0 && Math.min(...all) > (Math.max(...all) - Math.min(...all)) * 1.5) lo = Math.min(...all);
  }
  const scale = niceScale(lo, hi);
  const tickLabels = scale.ticks.map((t) => formatNumber(t, dec));

  // Margins.
  const labelSize = 12;
  const showLegend = spec.showLegend && m > 1;
  const names = spec.series.map((s) => s.name);
  const legendInfo = showLegend ? legend(names, colors, W, 0) : { svg: ``, height: 0 };
  const maxCat = Math.max(0, ...spec.categories.map((c) => textWidth(c, labelSize)));
  const maxTick = Math.max(0, ...tickLabels.map((t) => textWidth(t, labelSize)));
  let left = 14 + (horizontal ? Math.min(150, maxCat) : maxTick) + (spec.yTitle !== `` ? 20 : 0);
  let bottom = 16 + (spec.xTitle !== `` ? 20 : 0) + legendInfo.height;
  const top = spec.showValues ? 22 : 14;
  const right = 18;
  let rotate = false;
  if (!horizontal) {
    const band = (W - left - right) / Math.max(1, n);
    rotate = maxCat > band - 6;
    bottom += rotate ? Math.min(90, maxCat * 0.7 + 8) : 20;
  } else {
    bottom += 18;
    left = Math.max(left, 40);
  }
  const x0 = left;
  const x1 = W - right;
  const y0 = top;
  const y1 = H - bottom;

  let svg = ``;
  const vPos = (v: number): number => (horizontal ? x0 + ((v - scale.min) / (scale.max - scale.min)) * (x1 - x0) : y1 - ((v - scale.min) / (scale.max - scale.min)) * (y1 - y0));

  // Grid and value axis.
  scale.ticks.forEach((t, i) => {
    const p = vPos(t);
    if (spec.showGrid || t === 0) {
      const color = t === 0 ? AXIS : GRID;
      svg += horizontal ? `<line x1="${r(p)}" y1="${y0}" x2="${r(p)}" y2="${y1}" stroke="${color}" stroke-width="1"/>` : `<line x1="${x0}" y1="${r(p)}" x2="${x1}" y2="${r(p)}" stroke="${color}" stroke-width="1"/>`;
    }
    svg += horizontal ? label(p, y1 + 16, tickLabels[i], labelSize, `middle`, MUTED) : label(x0 - 6, p + 4, tickLabels[i], labelSize, `end`, MUTED);
  });
  svg += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="${AXIS}"/>`;
  if (!horizontal) svg += `<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${AXIS}"/>`;

  // Categories.
  const band = (horizontal ? y1 - y0 : x1 - x0) / Math.max(1, n);
  const catCenter = (c: number): number => (horizontal ? y0 : x0) + band * (c + 0.5);
  spec.categories.forEach((c, i) => {
    const p = catCenter(i);
    if (horizontal) svg += label(x0 - 6, p + 4, shorten(c, labelSize, left - 14), labelSize, `end`);
    else if (rotate) svg += label(p, y1 + 14, shorten(c, labelSize, 110), labelSize, `end`, TEXT, ` transform="rotate(-35 ${r(p)} ${r(y1 + 14)})"`);
    else svg += label(p, y1 + 16, shorten(c, labelSize, band - 4), labelSize, `middle`);
  });

  const valueLabel = (v: number, cx: number, cy: number, anchor: `start` | `middle` | `end`): string => label(cx, cy, formatNumber(v, dec), 11, anchor, MUTED);

  if (spec.type === `bar`) {
    const groupW = band * 0.74;
    const barW = stacked ? groupW : groupW / Math.max(1, m);
    for (let c = 0; c < n; c++) {
      let pos = 0;
      let neg = 0;
      spec.series.forEach((s, si) => {
        const v = s.values[c];
        if (v === null || v === undefined) return;
        let a: number;
        let b: number;
        if (stacked) {
          if (v >= 0) {
            a = pos;
            b = pos + v;
            pos = b;
          } else {
            a = neg;
            b = neg + v;
            neg = b;
          }
        } else {
          a = 0;
          b = v;
        }
        const along = catCenter(c) - groupW / 2 + (stacked ? 0 : si * barW);
        const p0 = vPos(Math.min(a, b));
        const p1 = vPos(Math.max(a, b));
        const lowEdge = Math.min(p0, p1);
        const size = Math.abs(p1 - p0);
        const thick = barW - (stacked ? 0 : 1);
        svg += horizontal ? `<rect x="${r(lowEdge)}" y="${r(along)}" width="${r(size)}" height="${r(thick)}" fill="${colors[si]}"/>` : `<rect x="${r(along)}" y="${r(lowEdge)}" width="${r(thick)}" height="${r(size)}" fill="${colors[si]}"/>`;
        if (spec.showValues) {
          if (stacked) svg += horizontal ? label(lowEdge + size / 2, along + barW / 2 + 4, formatNumber(v, dec), 11, `middle`, `#ffffff`) : label(along + barW / 2, lowEdge + size / 2 + 4, formatNumber(v, dec), 11, `middle`, `#ffffff`);
          else svg += horizontal ? valueLabel(v, v >= 0 ? lowEdge + size + 4 : lowEdge - 4, along + barW / 2 + 4, v >= 0 ? `start` : `end`) : valueLabel(v, along + barW / 2, v >= 0 ? lowEdge - 4 : lowEdge + size + 12, `middle`);
        }
      });
    }
  } else {
    spec.series.forEach((s, si) => {
      let path = ``;
      let pen = false;
      s.values.forEach((v, c) => {
        if (v === null) {
          pen = false;
          return;
        }
        path += `${pen ? `L` : `M`} ${r(catCenter(c))} ${r(vPos(v))} `;
        pen = true;
      });
      if (path !== ``) svg += `<path d="${path.trim()}" fill="none" stroke="${colors[si]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.values.forEach((v, c) => {
        if (v === null) return;
        svg += `<circle cx="${r(catCenter(c))}" cy="${r(vPos(v))}" r="3.5" fill="${colors[si]}" stroke="#ffffff" stroke-width="1"/>`;
        if (spec.showValues) svg += valueLabel(v, catCenter(c), vPos(v) - 8, `middle`);
      });
    });
  }

  // Titles of the axes, and legend.
  if (spec.xTitle !== ``) svg += label((x0 + x1) / 2, H - legendInfo.height - 6, shorten(spec.xTitle, 13, x1 - x0), 13, `middle`, TEXT, ` font-weight="bold"`);
  if (spec.yTitle !== ``) svg += label(14, (y0 + y1) / 2, shorten(spec.yTitle, 13, y1 - y0), 13, `middle`, TEXT, ` font-weight="bold" transform="rotate(-90 14 ${r((y0 + y1) / 2)})"`);
  if (showLegend) svg += `<g transform="translate(0 ${H - legendInfo.height + 4})">${legend(names, colors, W, 10).svg}</g>`;
  return svg;
}

// Pie chart: the first series, one slice per category.
function drawPie(spec: ChartSpec, opts: RenderOptions): string {
  const W = CHART_WIDTH;
  const H = CHART_HEIGHT;
  const dec = opts.decimal ?? `.`;
  const values = spec.categories.map((_c, i) => {
    const v = spec.series[0]?.values[i];
    return v !== null && v !== undefined && v > 0 ? v : 0;
  });
  const total = values.reduce((s, v) => s + v, 0);
  // One colour per slice: the colours of the series are those of the slices.
  const colors = spec.categories.map((_c, i) => seriesColor(spec, i));
  const legendInfo = spec.showLegend ? legend(spec.categories, colors, W, 0) : { svg: ``, height: 0 };
  const cx = W / 2;
  const cy = (H - legendInfo.height) / 2;
  const rad = Math.max(20, Math.min(W / 2, (H - legendInfo.height) / 2) - 28);
  let svg = ``;
  if (total <= 0) return svg + label(cx, cy, `—`, 24, `middle`, MUTED);
  let angle = -Math.PI / 2;
  const nonZero = values.filter((v) => v > 0).length;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const share = v / total;
    const next = angle + share * Math.PI * 2;
    if (nonZero === 1) svg += `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" fill="${colors[i]}" stroke="#ffffff" stroke-width="2"/>`;
    else {
      const x1 = cx + rad * Math.cos(angle);
      const y1 = cy + rad * Math.sin(angle);
      const x2 = cx + rad * Math.cos(next);
      const y2 = cy + rad * Math.sin(next);
      svg += `<path d="M ${r(cx)} ${r(cy)} L ${r(x1)} ${r(y1)} A ${r(rad)} ${r(rad)} 0 ${share > 0.5 ? 1 : 0} 1 ${r(x2)} ${r(y2)} Z" fill="${colors[i]}" stroke="#ffffff" stroke-width="2"/>`;
    }
    if (spec.showValues) {
      const mid = (angle + next) / 2;
      const inside = share >= 0.08;
      const rr = inside ? rad * 0.62 : rad + 14;
      const px = cx + rr * Math.cos(mid);
      const py = cy + rr * Math.sin(mid);
      const shown = `${formatNumber(share * 100, dec)} %`;
      svg += label(px, py + 4, shown, 12, inside ? `middle` : Math.cos(mid) >= 0 ? `start` : `end`, inside ? `#ffffff` : TEXT, inside ? ` font-weight="bold"` : ``);
    }
    angle = next;
  });
  if (spec.showLegend) svg += `<g transform="translate(0 ${H - legendInfo.height + 4})">${legend(spec.categories, colors, W, 10).svg}</g>`;
  return svg;
}

// The SVG picture of a chart (a text). The title of the chart is not drawn: it is the caption of the figure.
export function renderChart(spec: ChartSpec, opts: RenderOptions = {}): string {
  const inner = spec.type === `pie` ? drawPie(spec, opts) : drawAxes(spec, opts);
  return frame(inner, CHART_WIDTH, CHART_HEIGHT);
}

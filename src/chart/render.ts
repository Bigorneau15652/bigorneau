// Drawing of a chart as an SVG picture (a text), from the model of src/chart/spec.ts. The same picture is shown in the note, in the
// preview of the export, in the PDF (drawn as a picture) and in the HTML page. This file does not depend on Obsidian.
import { ChartLine, ChartSpec, grayLine, isSliceChart, parseNumber, seriesColor, ValueMode } from "./spec";

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

// How the numbers shown are written: a unit after the number and a fixed number of decimals (null: at most two, as needed).
export interface NumberStyle {
  unit?: string;
  decimals?: number | null;
}

// A number written with the decimals asked for (at most two when none is asked), without unit.
export function formatNumber(n: number, decimal: `,` | `.` = `.`, decimals: number | null = null): string {
  const s = decimals === null ? String(Math.round(n * 100) / 100) : n.toFixed(Math.min(6, Math.max(0, decimals)));
  return decimal === `,` ? s.replace(`.`, `,`) : s;
}

// A number followed by its unit (a no-break space between them).
export function withUnit(text: string, unit: string): string {
  return unit === `` ? text : `${text}\u00a0${unit}`;
}

// What is written for a value: nothing, the value (with its unit), its percentage of `total`, or both.
export function valueText(mode: ValueMode, value: number, total: number, decimal: `,` | `.`, style: NumberStyle = {}): string {
  if (mode === `none`) return ``;
  const decimals = style.decimals ?? null;
  const plain = withUnit(formatNumber(value, decimal, decimals), style.unit ?? ``);
  const percent = `${formatNumber(total === 0 ? 0 : (value / total) * 100, decimal, decimals)} %`;
  return mode === `value` ? plain : mode === `percent` ? percent : `${plain} (${percent})`;
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
  for (let v = start, i = 0; v <= end + step / 2 && i < 200; v += step, i++) ticks.push((Math.round((v / step) * 1e6) / 1e6) * step);
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

function label(x: number, y: number, content: string, size: number, anchor: `start` | `middle` | `end`, fill = TEXT, extra = ``): string {
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" ${FONT} text-anchor="${anchor}" fill="${fill}"${extra}>${esc(content)}</text>`;
}

// Ink for a text written on a colour: dark on a light colour, white on a dark one.
function inkOn(color: string): string {
  const part = (k: number): number => parseInt(color.slice(1 + 2 * k, 3 + 2 * k), 16);
  return part(0) * 0.299 + part(1) * 0.587 + part(2) * 0.114 > 160 ? TEXT : `#ffffff`;
}

function styleOf(spec: ChartSpec): NumberStyle {
  return { unit: spec.unit, decimals: spec.decimals };
}

// Value of a threshold line: its own value, or the mean of the numbers given.
function lineValue(line: ChartLine, numbers: number[]): number | null {
  if (line.kind === `value`) return line.value;
  return numbers.length === 0 ? null : numbers.reduce((sum, v) => sum + v, 0) / numbers.length;
}

// Threshold lines drawn across a plot area. `at` gives the position of a value along the value axis; the line is horizontal, or vertical for horizontal bars.
function drawLines(spec: ChartSpec, numbers: number[], at: (v: number) => number, box: { x0: number; x1: number; y0: number; y1: number }, vertical: boolean, dec: `,` | `.`): string {
  const gray = spec.palette === `gray`;
  const ink = gray ? `#222222` : `#c0392b`;
  let svg = ``;
  spec.lines.forEach((line, i) => {
    const v = lineValue(line, numbers);
    if (v === null) return;
    const p = at(v);
    const text = `${line.label === `` ? (line.kind === `mean` ? (dec === `,` ? `Moyenne` : `Mean`) : ``) : line.label}`;
    const shownValue = withUnit(formatNumber(v, dec, spec.decimals), spec.unit);
    const content = text === `` ? shownValue : `${text} (${shownValue})`;
    const halo = ` stroke="#ffffff" stroke-width="3" paint-order="stroke"`;
    const dash = i % 2 === 0 ? `7 4` : `2 3`;
    if (vertical) {
      svg += `<line x1="${r(p)}" y1="${r(box.y0)}" x2="${r(p)}" y2="${r(box.y1)}" stroke="${ink}" stroke-width="1.8" stroke-dasharray="${dash}"/>`;
      svg += label(p + 4, box.y0 + 12 + i * 14, content, 11, `start`, ink, halo);
    } else {
      svg += `<line x1="${r(box.x0)}" y1="${r(p)}" x2="${r(box.x1)}" y2="${r(p)}" stroke="${ink}" stroke-width="1.8" stroke-dasharray="${dash}"/>`;
      svg += label(box.x1 - 4, p - 4, content, 11, `end`, ink, halo);
    }
  });
  return svg;
}

// How a series (or a slice) is painted: a fill, a line colour and a dash for the lines. The black and white style uses hatched fills.
interface Paint {
  fill: string;
  stroke: string;
  dash: string;
}

const HATCH_COUNT = 6;
const DASHES = [``, `7 4`, `2 3`, `9 3 2 3`, `4 4`, `12 4`];

// Definition of the hatched fill number `i` (black and white style): a grey ground and lines, grid or dots of black.
function hatchDef(id: string, tone: string, kind: number): string {
  const ink = `#222222`;
  const ground = `<rect width="8" height="8" fill="${tone}"/>`;
  let marks = ``;
  let transform = ``;
  if (kind === 1) {
    marks = `<line x1="0" y1="0" x2="0" y2="8" stroke="${ink}" stroke-width="1.6"/>`;
    transform = ` patternTransform="rotate(45)"`;
  } else if (kind === 2) marks = `<line x1="0" y1="4" x2="8" y2="4" stroke="${ink}" stroke-width="1.6"/>`;
  else if (kind === 3) marks = `<line x1="4" y1="0" x2="4" y2="8" stroke="${ink}" stroke-width="1.6"/>`;
  else if (kind === 4) marks = `<line x1="0" y1="4" x2="8" y2="4" stroke="${ink}" stroke-width="1.2"/><line x1="4" y1="0" x2="4" y2="8" stroke="${ink}" stroke-width="1.2"/>`;
  else if (kind === 5) marks = `<circle cx="4" cy="4" r="1.5" fill="${ink}"/>`;
  return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"${transform}>${ground}${marks}</pattern>`;
}

// Paints of the `count` series (or slices) of a chart, and the definitions that they need.
function paintsOf(spec: ChartSpec, count: number): { paints: Paint[]; defs: string } {
  const paints: Paint[] = [];
  let defs = ``;
  for (let i = 0; i < count; i++) {
    if (spec.palette === `gray`) {
      const tone = seriesColor({ ...spec, colors: [] }, i, count);
      const id = `mmw-hatch-${i}`;
      defs += hatchDef(id, tone, i % HATCH_COUNT);
      paints.push({ fill: `url(#${id})`, stroke: grayLine(i, count), dash: DASHES[i % DASHES.length] });
    } else {
      const color = seriesColor(spec, i, count);
      paints.push({ fill: color, stroke: color, dash: `` });
    }
  }
  return { paints, defs: defs === `` ? `` : `<defs>${defs}</defs>` };
}

// Space taken by the legend on each side, and its drawing (already placed in the picture).
interface LegendBox {
  svg: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const NO_LEGEND: LegendBox = { svg: ``, top: 0, bottom: 0, left: 0, right: 0 };

// Legend above or below (items in rows) or at the left or the right (items in a column).
function legendBox(spec: ChartSpec, names: string[], paints: Paint[]): LegendBox {
  if (spec.legend === `none` || names.length === 0) return NO_LEGEND;
  const W = spec.width;
  const H = spec.height;
  const size = 12;
  const items = names.map((n, i) => ({ name: shorten(n === `` ? String(i + 1) : n, size, 170), paint: paints[i] }));
  const swatch = (x: number, y: number, paint: Paint): string => `<rect x="${r(x)}" y="${r(y - 10)}" width="14" height="12" rx="2" fill="${paint.fill}" stroke="${spec.palette === `gray` ? `#222222` : `none`}" stroke-width="0.8"/>`;
  if (spec.legend === `left` || spec.legend === `right`) {
    const width = 22 + Math.max(...items.map((it) => textWidth(it.name, size))) + 14;
    const height = items.length * 20;
    const x = spec.legend === `left` ? 10 : W - width;
    let y = (H - height) / 2 + 12;
    let svg = ``;
    for (const it of items) {
      svg += swatch(x, y, it.paint) + label(x + 20, y, it.name, size, `start`);
      y += 20;
    }
    return { svg, top: 0, bottom: 0, left: spec.legend === `left` ? width + 6 : 0, right: spec.legend === `right` ? width + 6 : 0 };
  }
  const rows: { name: string; paint: Paint; w: number }[][] = [[]];
  let used = 0;
  for (const it of items) {
    const w = 20 + textWidth(it.name, size) + 18;
    if (used + w > W - 24 && rows[rows.length - 1].length > 0) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push({ ...it, w });
    used += w;
  }
  const height = rows.length * 20 + 6;
  const first = spec.legend === `top` ? 18 : H - height + 16;
  let svg = ``;
  rows.forEach((row, ri) => {
    const total = row.reduce((sum, it) => sum + it.w, 0);
    let x = (W - total) / 2;
    const y = first + ri * 20;
    for (const it of row) {
      svg += swatch(x, y, it.paint) + label(x + 20, y, it.name, size, `start`);
      x += it.w;
    }
  });
  return { svg, top: spec.legend === `top` ? height : 0, bottom: spec.legend === `bottom` ? height : 0, left: 0, right: 0 };
}

function frame(inner: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="6" fill="#ffffff"/>${inner}</svg>`;
}

// Chart drawn on axes: bars, or lines.
function drawAxes(spec: ChartSpec, opts: RenderOptions): string {
  const W = spec.width;
  const H = spec.height;
  const dec = opts.decimal ?? `.`;
  const horizontal = spec.type === `bar` && spec.horizontal;
  const stacked = (spec.type === `bar` || spec.type === `area`) && spec.stacked;
  const n = spec.categories.length;
  const m = spec.series.length;
  const gray = spec.palette === `gray`;
  const { paints, defs } = paintsOf(spec, m);

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
  // Numbers that a mean line averages: every value, or the total of each category for stacked charts.
  const lineNumbers = stacked
    ? spec.categories.map((_c, c) => spec.series.reduce((sum, x) => sum + (x.values[c] ?? 0), 0))
    : spec.series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  // The scale holds the threshold lines too.
  for (const line of spec.lines) {
    const v = lineValue(line, lineNumbers);
    if (v === null) continue;
    hi = Math.max(hi, v);
    lo = Math.min(lo, v);
  }
  const scale = niceScale(lo, hi);
  const tickLabels = scale.ticks.map((t) => formatNumber(t, dec));
  // Total of each category (for the percentages).
  const totals = spec.categories.map((_c, c) => spec.series.reduce((sum, s) => sum + Math.abs(s.values[c] ?? 0), 0));

  // Margins.
  const labelSize = 12;
  const legendInfo = m > 1 ? legendBox(spec, spec.series.map((s) => s.name), paints) : NO_LEGEND;
  const maxCat = Math.max(0, ...spec.categories.map((c) => textWidth(c, labelSize)));
  const maxTick = Math.max(0, ...tickLabels.map((t) => textWidth(t, labelSize)));
  let left = 14 + (horizontal ? Math.min(150, maxCat) : maxTick) + (spec.yTitle !== `` ? 20 : 0) + legendInfo.left;
  let bottom = 16 + (spec.xTitle !== `` ? 20 : 0) + legendInfo.bottom;
  const top = (spec.valueMode !== `none` ? 22 : 14) + legendInfo.top;
  const right = 18 + legendInfo.right;
  let rotate = false;
  if (!horizontal) {
    const band = (W - left - right) / Math.max(1, n);
    rotate = maxCat > band - 6;
    bottom += rotate ? Math.min(90, maxCat * 0.7 + 8) : 20;
  } else {
    bottom += 18;
    left = Math.max(left, 40 + legendInfo.left);
  }
  const x0 = left;
  const x1 = W - right;
  const y0 = top;
  const y1 = H - bottom;

  let svg = defs;
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
    if (horizontal) svg += label(x0 - 6, p + 4, shorten(c, labelSize, left - legendInfo.left - 14), labelSize, `end`);
    else if (rotate) svg += label(p, y1 + 14, shorten(c, labelSize, 110), labelSize, `end`, TEXT, ` transform="rotate(-35 ${r(p)} ${r(y1 + 14)})"`);
    else svg += label(p, y1 + 16, shorten(c, labelSize, band - 4), labelSize, `middle`);
  });

  const shown = (v: number, c: number): string => valueText(spec.valueMode, v, totals[c], dec, styleOf(spec));
  const valueLabel = (v: number, c: number, cx: number, cy: number, anchor: `start` | `middle` | `end`): string => label(cx, cy, shown(v, c), 11, anchor, MUTED);
  // Labels inside a filled shape: white on a colour, dark with a white halo on a hatched fill.
  const insideLabel = (v: number, c: number, cx: number, cy: number, paint: Paint): string => (gray ? label(cx, cy, shown(v, c), 11, `middle`, TEXT, ` stroke="#ffffff" stroke-width="3" paint-order="stroke" font-weight="bold"`) : label(cx, cy, shown(v, c), 11, `middle`, inkOn(paint.fill)));

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
        const edge = gray ? ` stroke="#222222" stroke-width="0.8"` : ``;
        svg += horizontal ? `<rect x="${r(lowEdge)}" y="${r(along)}" width="${r(size)}" height="${r(thick)}" fill="${paints[si].fill}"${edge}/>` : `<rect x="${r(along)}" y="${r(lowEdge)}" width="${r(thick)}" height="${r(size)}" fill="${paints[si].fill}"${edge}/>`;
        if (spec.valueMode !== `none`) {
          if (stacked) svg += horizontal ? insideLabel(v, c, lowEdge + size / 2, along + barW / 2 + 4, paints[si]) : insideLabel(v, c, along + barW / 2, lowEdge + size / 2 + 4, paints[si]);
          else svg += horizontal ? valueLabel(v, c, v >= 0 ? lowEdge + size + 4 : lowEdge - 4, along + barW / 2 + 4, v >= 0 ? `start` : `end`) : valueLabel(v, c, along + barW / 2, v >= 0 ? lowEdge - 4 : lowEdge + size + 12, `middle`);
        }
      });
    }
  } else {
    // Height of a point: its value, or its value on top of the series below it for stacked areas.
    const stackedTop = (si: number, c: number, v: number): number => (stacked ? spec.series.slice(0, si).reduce((sum, other) => sum + (other.values[c] ?? 0), 0) + v : v);
    // Areas: each series is a filled surface between its line and the zero line (or the top of the series below it when stacked).
    if (spec.type === `area`) {
      const below: number[] = spec.categories.map(() => 0);
      spec.series.forEach((s, si) => {
        const lower = stacked ? [...below] : spec.categories.map(() => 0);
        const upper = spec.categories.map((_c, c) => (s.values[c] === null || s.values[c] === undefined ? null : lower[c] + (s.values[c] as number)));
        let c = 0;
        while (c < n) {
          if (upper[c] === null) {
            c++;
            continue;
          }
          const start = c;
          while (c < n && upper[c] !== null) c++;
          const upperPoints: string[] = [];
          const lowerPoints: string[] = [];
          for (let k = start; k < c; k++) {
            upperPoints.push(`${r(catCenter(k))} ${r(vPos(upper[k] as number))}`);
            lowerPoints.unshift(`${r(catCenter(k))} ${r(vPos(lower[k]))}`);
          }
          const opacity = gray ? `` : ` fill-opacity="0.55"`;
          svg += `<path d="M ${upperPoints.join(` L `)} L ${lowerPoints.join(` L `)} Z" fill="${paints[si].fill}"${opacity} stroke="none"/>`;
        }
        if (stacked) s.values.forEach((v, k) => (below[k] += v ?? 0));
      });
    }
    spec.series.forEach((s, si) => {
      let path = ``;
      let pen = false;
      s.values.forEach((v, c) => {
        if (v === null) {
          pen = false;
          return;
        }
        path += `${pen ? `L` : `M`} ${r(catCenter(c))} ${r(vPos(stackedTop(si, c, v)))} `;
        pen = true;
      });
      const dash = paints[si].dash !== `` ? ` stroke-dasharray="${paints[si].dash}"` : ``;
      if (path !== ``) svg += `<path d="${path.trim()}" fill="none" stroke="${paints[si].stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${dash}/>`;
      s.values.forEach((v, c) => {
        if (v === null) return;
        const y = vPos(stackedTop(si, c, v));
        if (spec.type === `line`) svg += `<circle cx="${r(catCenter(c))}" cy="${r(y)}" r="3.5" fill="${paints[si].stroke}" stroke="#ffffff" stroke-width="1"/>`;
        if (spec.valueMode !== `none`) svg += valueLabel(v, c, catCenter(c), y - 8, `middle`);
      });
    });
  }

  // Threshold lines, titles of the axes, and legend.
  svg += drawLines(spec, lineNumbers, vPos, { x0, x1, y0, y1 }, horizontal, dec);
  if (spec.xTitle !== ``) svg += label((x0 + x1) / 2, H - legendInfo.bottom - 6, shorten(spec.xTitle, 13, x1 - x0), 13, `middle`, TEXT, ` font-weight="bold"`);
  if (spec.yTitle !== ``) svg += label(14 + legendInfo.left, (y0 + y1) / 2, shorten(spec.yTitle, 13, y1 - y0), 13, `middle`, TEXT, ` font-weight="bold" transform="rotate(-90 ${14 + legendInfo.left} ${r((y0 + y1) / 2)})"`);
  return svg + legendInfo.svg;
}

// Pie chart: the first series, one slice per category.
function drawPie(spec: ChartSpec, opts: RenderOptions): string {
  const W = spec.width;
  const H = spec.height;
  const dec = opts.decimal ?? `.`;
  const values = spec.categories.map((_c, i) => {
    const v = spec.series[0]?.values[i];
    return v !== null && v !== undefined && v > 0 ? v : 0;
  });
  const total = values.reduce((s, v) => s + v, 0);
  const gray = spec.palette === `gray`;
  // One paint per slice: the colours of the style (or those chosen) are those of the slices.
  const { paints, defs } = paintsOf(spec, spec.categories.length);
  const legendInfo = legendBox(spec, spec.categories, paints);
  const areaW = W - legendInfo.left - legendInfo.right;
  const areaH = H - legendInfo.top - legendInfo.bottom;
  const cx = legendInfo.left + areaW / 2;
  const cy = legendInfo.top + areaH / 2;
  const rad = Math.max(20, Math.min(areaW / 2, areaH / 2) - 30);
  // A donut is a pie with a hole: the total is written in the hole.
  const donut = spec.type === `donut`;
  const hole = donut ? rad * 0.55 : 0;
  let svg = defs;
  if (total <= 0) return svg + label(cx, cy, `—`, 24, `middle`, MUTED) + legendInfo.svg;
  let angle = -Math.PI / 2;
  const nonZero = values.filter((v) => v > 0).length;
  const edge = gray ? `#222222` : `#ffffff`;
  values.forEach((v, i) => {
    if (v <= 0) return;
    const share = v / total;
    const next = angle + share * Math.PI * 2;
    if (nonZero === 1) {
      if (donut) svg += `<path d="M ${r(cx - rad)} ${r(cy)} a ${r(rad)} ${r(rad)} 0 1 0 ${r(2 * rad)} 0 a ${r(rad)} ${r(rad)} 0 1 0 ${r(-2 * rad)} 0 Z M ${r(cx - hole)} ${r(cy)} a ${r(hole)} ${r(hole)} 0 1 0 ${r(2 * hole)} 0 a ${r(hole)} ${r(hole)} 0 1 0 ${r(-2 * hole)} 0 Z" fill-rule="evenodd" fill="${paints[i].fill}" stroke="${edge}" stroke-width="${gray ? 1 : 2}"/>`;
      else svg += `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" fill="${paints[i].fill}" stroke="${edge}" stroke-width="${gray ? 1 : 2}"/>`;
    } else if (donut) {
      const large = share > 0.5 ? 1 : 0;
      const p = (radius: number, a: number): string => `${r(cx + radius * Math.cos(a))} ${r(cy + radius * Math.sin(a))}`;
      svg += `<path d="M ${p(rad, angle)} A ${r(rad)} ${r(rad)} 0 ${large} 1 ${p(rad, next)} L ${p(hole, next)} A ${r(hole)} ${r(hole)} 0 ${large} 0 ${p(hole, angle)} Z" fill="${paints[i].fill}" stroke="${edge}" stroke-width="${gray ? 1 : 2}"/>`;
    } else {
      const x1 = cx + rad * Math.cos(angle);
      const y1 = cy + rad * Math.sin(angle);
      const x2 = cx + rad * Math.cos(next);
      const y2 = cy + rad * Math.sin(next);
      svg += `<path d="M ${r(cx)} ${r(cy)} L ${r(x1)} ${r(y1)} A ${r(rad)} ${r(rad)} 0 ${share > 0.5 ? 1 : 0} 1 ${r(x2)} ${r(y2)} Z" fill="${paints[i].fill}" stroke="${edge}" stroke-width="${gray ? 1 : 2}"/>`;
    }
    if (spec.valueMode !== `none`) {
      const mid = (angle + next) / 2;
      const inside = share >= 0.08 && spec.valueMode !== `both`;
      const rr = inside ? (donut ? (rad + hole) / 2 : rad * 0.62) : rad + 14;
      const px = cx + rr * Math.cos(mid);
      const py = cy + rr * Math.sin(mid);
      const shown = valueText(spec.valueMode, v, total, dec, styleOf(spec));
      if (inside) svg += gray ? label(px, py + 4, shown, 12, `middle`, TEXT, ` stroke="#ffffff" stroke-width="3" paint-order="stroke" font-weight="bold"`) : label(px, py + 4, shown, 12, `middle`, inkOn(paints[i].fill), ` font-weight="bold"`);
      else svg += label(px, py + 4, shown, 12, Math.cos(mid) >= 0 ? `start` : `end`, TEXT);
    }
    angle = next;
  });
  if (donut) svg += label(cx, cy + 7, withUnit(formatNumber(total, dec, spec.decimals), spec.unit), 22, `middle`, TEXT, ` font-weight="bold"`);
  return svg + legendInfo.svg;
}

// Scatter chart: each row is a point, the first column gives X (a number) and each series gives a Y.
function drawScatter(spec: ChartSpec, opts: RenderOptions): string {
  const W = spec.width;
  const H = spec.height;
  const dec = opts.decimal ?? `.`;
  const m = spec.series.length;
  const { paints, defs } = paintsOf(spec, m);
  const xs = spec.categories.map((c, i) => {
    const n = parseNumber(c);
    return n !== null && !Number.isNaN(n) ? n : i + 1;
  });
  const ys = spec.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const xScale = niceScale(Math.min(...xs, 0), Math.max(...xs, 0) === Math.min(...xs, 0) ? Math.max(...xs, 0) + 1 : Math.max(...xs, 0));
  const lineValues = spec.lines.map((line) => lineValue(line, ys)).filter((v): v is number => v !== null);
  const yScale = niceScale(Math.min(...ys, ...lineValues, 0), Math.max(...ys, ...lineValues, 0));
  const xLabels = xScale.ticks.map((t) => formatNumber(t, dec));
  const yLabels = yScale.ticks.map((t) => formatNumber(t, dec));
  const legendInfo = m > 1 ? legendBox(spec, spec.series.map((x) => x.name), paints) : NO_LEGEND;
  const maxTick = Math.max(0, ...yLabels.map((t) => textWidth(t, 12)));
  const x0 = 14 + maxTick + (spec.yTitle !== `` ? 20 : 0) + legendInfo.left;
  const x1 = W - 18 - legendInfo.right;
  const y0 = (spec.valueMode !== `none` ? 22 : 14) + legendInfo.top;
  const y1 = H - (16 + (spec.xTitle !== `` ? 20 : 0) + legendInfo.bottom + 20);
  const px = (x: number): number => x0 + ((x - xScale.min) / (xScale.max - xScale.min)) * (x1 - x0);
  const py = (y: number): number => y1 - ((y - yScale.min) / (yScale.max - yScale.min)) * (y1 - y0);
  let svg = defs;
  xScale.ticks.forEach((t, i) => {
    if (spec.showGrid) svg += `<line x1="${r(px(t))}" y1="${y0}" x2="${r(px(t))}" y2="${y1}" stroke="${GRID}" stroke-width="1"/>`;
    svg += label(px(t), y1 + 16, xLabels[i], 12, `middle`, MUTED);
  });
  yScale.ticks.forEach((t, i) => {
    if (spec.showGrid) svg += `<line x1="${x0}" y1="${r(py(t))}" x2="${x1}" y2="${r(py(t))}" stroke="${GRID}" stroke-width="1"/>`;
    svg += label(x0 - 6, py(t) + 4, yLabels[i], 12, `end`, MUTED);
  });
  svg += `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="${AXIS}"/><line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${AXIS}"/>`;
  const gray = spec.palette === `gray`;
  spec.series.forEach((s, si) => {
    s.values.forEach((v, i) => {
      if (v === null) return;
      const cx = px(xs[i]);
      const cy = py(v);
      // Black and white: the series differ by their shape (circle, square, diamond, triangle) and not only by their grey.
      const shape = gray ? si % 4 : 0;
      const fill = paints[si].stroke;
      if (shape === 1) svg += `<rect x="${r(cx - 4.5)}" y="${r(cy - 4.5)}" width="9" height="9" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`;
      else if (shape === 2) svg += `<path d="M ${r(cx)} ${r(cy - 6)} L ${r(cx + 6)} ${r(cy)} L ${r(cx)} ${r(cy + 6)} L ${r(cx - 6)} ${r(cy)} Z" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`;
      else if (shape === 3) svg += `<path d="M ${r(cx)} ${r(cy - 6)} L ${r(cx + 6)} ${r(cy + 5)} L ${r(cx - 6)} ${r(cy + 5)} Z" fill="${fill}" stroke="#ffffff" stroke-width="1"/>`;
      else svg += `<circle cx="${r(cx)}" cy="${r(cy)}" r="5" fill="${fill}" fill-opacity="${gray ? 1 : 0.85}" stroke="#ffffff" stroke-width="1"/>`;
      if (spec.valueMode !== `none`) svg += label(cx, cy - 9, withUnit(formatNumber(v, dec, spec.decimals), spec.unit), 11, `middle`, MUTED);
    });
  });
  svg += drawLines(spec, ys, py, { x0, x1, y0, y1 }, false, dec);
  if (spec.xTitle !== ``) svg += label((x0 + x1) / 2, H - legendInfo.bottom - 6, shorten(spec.xTitle, 13, x1 - x0), 13, `middle`, TEXT, ` font-weight="bold"`);
  if (spec.yTitle !== ``) svg += label(14 + legendInfo.left, (y0 + y1) / 2, shorten(spec.yTitle, 13, y1 - y0), 13, `middle`, TEXT, ` font-weight="bold" transform="rotate(-90 ${14 + legendInfo.left} ${r((y0 + y1) / 2)})"`);
  return svg + legendInfo.svg;
}

// Radar chart: each category is an axis from the centre, each series is a polygon.
function drawRadar(spec: ChartSpec, opts: RenderOptions): string {
  const W = spec.width;
  const H = spec.height;
  const dec = opts.decimal ?? `.`;
  const n = spec.categories.length;
  const m = spec.series.length;
  const { paints, defs } = paintsOf(spec, m);
  const legendInfo = m > 1 ? legendBox(spec, spec.series.map((x) => x.name), paints) : NO_LEGEND;
  const areaW = W - legendInfo.left - legendInfo.right;
  const areaH = H - legendInfo.top - legendInfo.bottom;
  const cx = legendInfo.left + areaW / 2;
  const cy = legendInfo.top + areaH / 2;
  if (n < 3) return defs + label(cx, cy, `—`, 24, `middle`, MUTED) + legendInfo.svg;
  const widest = Math.max(0, ...spec.categories.map((c) => textWidth(c, 12)));
  const rad = Math.max(30, Math.min(areaW / 2 - Math.min(widest, 110) - 14, areaH / 2 - 34));
  const all = spec.series.flatMap((x) => x.values).filter((v): v is number => v !== null);
  const scale = niceScale(0, Math.max(0, ...all));
  const angle = (k: number): number => -Math.PI / 2 + (k * 2 * Math.PI) / n;
  const point = (k: number, v: number): [number, number] => {
    const length = ((v - scale.min) / (scale.max - scale.min)) * rad;
    return [cx + length * Math.cos(angle(k)), cy + length * Math.sin(angle(k))];
  };
  let svg = defs;
  // Rings, axes and names of the categories.
  scale.ticks.slice(1).forEach((t) => {
    const ring = spec.categories.map((_c, k) => point(k, t)).map(([x, y]) => `${r(x)} ${r(y)}`);
    if (spec.showGrid) svg += `<path d="M ${ring.join(` L `)} Z" fill="none" stroke="${GRID}" stroke-width="1"/>`;
    svg += label(cx + 4, point(0, t)[1] - 2, formatNumber(t, dec), 10, `start`, MUTED);
  });
  spec.categories.forEach((c, k) => {
    const [ex, ey] = point(k, scale.max);
    svg += `<line x1="${r(cx)}" y1="${r(cy)}" x2="${r(ex)}" y2="${r(ey)}" stroke="${GRID}" stroke-width="1"/>`;
    // The name of the axis at the top stands higher, clear of the value written on the first axis.
    const away = rad + 12 + (Math.sin(angle(k)) < -0.9 ? 12 : 0);
    const lx = cx + away * Math.cos(angle(k));
    const ly = cy + away * Math.sin(angle(k)) + 4;
    const cos = Math.cos(angle(k));
    svg += label(lx, ly, shorten(c, 12, 110), 12, Math.abs(cos) < 0.2 ? `middle` : cos > 0 ? `start` : `end`);
  });
  const gray = spec.palette === `gray`;
  const totals = spec.categories.map((_c, k) => spec.series.reduce((sum, x) => sum + Math.abs(x.values[k] ?? 0), 0));
  spec.series.forEach((s, si) => {
    const points = spec.categories.map((_c, k) => point(k, s.values[k] ?? 0)).map(([x, y]) => `${r(x)} ${r(y)}`);
    const dash = paints[si].dash !== `` ? ` stroke-dasharray="${paints[si].dash}"` : ``;
    svg += `<path d="M ${points.join(` L `)} Z" fill="${gray ? `none` : paints[si].fill}"${gray ? `` : ` fill-opacity="0.22"`} stroke="${paints[si].stroke}" stroke-width="2.5" stroke-linejoin="round"${dash}/>`;
    s.values.forEach((v, k) => {
      if (v === null) return;
      const [x, y] = point(k, v);
      svg += `<circle cx="${r(x)}" cy="${r(y)}" r="3.5" fill="${paints[si].stroke}" stroke="#ffffff" stroke-width="1"/>`;
      if (spec.valueMode !== `none`) svg += label(x, y - 8, valueText(spec.valueMode, v, totals[k], dec, styleOf(spec)), 11, `middle`, MUTED);
    });
  });
  return svg + legendInfo.svg;
}

// The SVG picture of a chart (a text). The title of the chart is not drawn: it is the caption of the figure.
export function renderChart(spec: ChartSpec, opts: RenderOptions = {}): string {
  const inner = isSliceChart(spec.type) ? drawPie(spec, opts) : spec.type === `scatter` ? drawScatter(spec, opts) : spec.type === `radar` ? drawRadar(spec, opts) : drawAxes(spec, opts);
  return frame(inner, spec.width, spec.height);
}

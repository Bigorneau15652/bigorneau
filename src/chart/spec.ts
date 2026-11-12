// Charts written in a note: the model of a chart, and its text form. A chart lives in the note as a fenced block named
// bigorneau-chart, with a few `key: value` lines then the numbers as a small table. This file does not depend on Obsidian.

export type ChartType = `bar` | `line` | `pie`;

export const CHART_TYPES: ChartType[] = [`bar`, `line`, `pie`];

// Name of the fenced block that holds a chart.
export const CHART_LANG = `bigorneau-chart`;

export const MAX_SERIES = 12;
export const MAX_CATEGORIES = 200;
export const MAX_TEXT = 120;

// Styles of colours of a chart.
export type ChartPalette = `default` | `acid` | `pastel` | `blue` | `red` | `green` | `gray`;

export const CHART_PALETTES: ChartPalette[] = [`default`, `acid`, `pastel`, `blue`, `red`, `green`, `gray`];

// Where the legend stands, or no legend.
export type LegendPosition = `bottom` | `top` | `left` | `right` | `none`;

export const LEGEND_POSITIONS: LegendPosition[] = [`bottom`, `top`, `left`, `right`, `none`];

// What is written on the bars, the points and the slices: nothing, the data, the percentage, or both.
export type ValueMode = `none` | `value` | `percent` | `both`;

export const VALUE_MODES: ValueMode[] = [`none`, `value`, `percent`, `both`];

// Colours of the styles that have a fixed list (colour-blind friendly for the default one: the Tableau 10 series).
const COLOR_LISTS: Record<`default` | `acid` | `pastel`, string[]> = {
  default: [`#4e79a7`, `#f28e2b`, `#e15759`, `#76b7b2`, `#59a14f`, `#edc948`, `#b07aa1`, `#ff9da7`, `#9c755f`, `#bab0ac`, `#1f3b5c`, `#7f7f7f`],
  acid: [`#ff006e`, `#fb5607`, `#ffbe0b`, `#8ac926`, `#3a86ff`, `#8338ec`, `#00f5d4`, `#f15bb5`, `#00bbf9`, `#fee440`, `#ff4d6d`, `#9b5de5`],
  pastel: [`#a8d8ea`, `#ffb7b2`, `#b5ead7`, `#ffdac1`, `#c7ceea`, `#e2f0cb`, `#f8c8dc`, `#fdfd96`, `#cdb4db`, `#aec6cf`, `#ffd8be`, `#d4e09b`],
};

// Styles made of shades of one colour: from the darkest to the lightest, spread over the series (or the slices).
const COLOR_RAMPS: Record<`blue` | `red` | `green` | `gray`, [string, string]> = {
  blue: [`#08306b`, `#c6dbef`],
  red: [`#67000d`, `#fcbba1`],
  green: [`#00441b`, `#c7e9c0`],
  gray: [`#f4f4f4`, `#8c8c8c`],
};

// Darker greys for the lines of the black and white style (the fills are hatched).
export const GRAY_LINES: [string, string] = [`#111111`, `#6e6e6e`];

function mixHex(a: string, b: string, t: number): string {
  const part = (hex: string, k: number): number => parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
  const out = [0, 1, 2].map((k) => Math.round(part(a, k) + (part(b, k) - part(a, k)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, `0`)).join(``)}`;
}

// Colour of a rank in a style, when `count` series (or slices) share the style.
export function paletteColor(id: ChartPalette, index: number, count: number): string {
  if (id === `default` || id === `acid` || id === `pastel`) return COLOR_LISTS[id][index % COLOR_LISTS[id].length];
  const [dark, light] = COLOR_RAMPS[id];
  return mixHex(dark, light, count <= 1 ? 0.3 : Math.min(1, index / (count - 1)));
}

// Shade of grey of a line at a rank (black and white style).
export function grayLine(index: number, count: number): string {
  return mixHex(GRAY_LINES[0], GRAY_LINES[1], count <= 1 ? 0 : Math.min(1, index / (count - 1)));
}

export interface ChartSeries {
  name: string;
  // One value per category; null for an empty cell.
  values: (number | null)[];
}

export interface ChartSpec {
  type: ChartType;
  title: string;
  categories: string[];
  series: ChartSeries[];
  // Colours, `#rrggbb` or an empty text for the one of the palette: one per series (bars, lines) or one per category (pie).
  colors: string[];
  // Bars: horizontal bars, and bars stacked on each other.
  horizontal: boolean;
  stacked: boolean;
  valueMode: ValueMode;
  legend: LegendPosition;
  palette: ChartPalette;
  showGrid: boolean;
  xTitle: string;
  yTitle: string;
}

export function defaultChart(): ChartSpec {
  return {
    type: `bar`,
    title: ``,
    categories: [`A`, `B`, `C`],
    series: [{ name: `1`, values: [3, 5, 2] }],
    colors: [],
    horizontal: false,
    stacked: false,
    valueMode: `none`,
    legend: `bottom`,
    palette: `default`,
    showGrid: true,
    xTitle: ``,
    yTitle: ``,
  };
}

// `#rgb` or `#rrggbb` becomes `#rrggbb` in lower case; anything else is refused (null).
export function cleanColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

// Colour at a rank (a series, or a slice of a pie): the colour chosen for it, or the one of the style. `count` is the number of series
// (or of slices) that share the style.
export function seriesColor(spec: ChartSpec, index: number, count: number): string {
  return cleanColor(spec.colors[index] ?? ``) ?? paletteColor(spec.palette, index, count);
}

// A line of text without line breaks, at most MAX_TEXT characters.
function cleanText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ` `).trim().slice(0, MAX_TEXT);
}

// Number written by a person: a decimal comma or point, spaces allowed as thousands separators. An empty cell gives null; text that is not a number gives NaN.
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/[\s  ]/g, ``);
  if (t === ``) return null;
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  const n = Number(t.replace(`,`, `.`));
  return Number.isFinite(n) ? n : NaN;
}

const LEGEND_WORDS: Record<string, LegendPosition> = {
  bottom: `bottom`, dessous: `bottom`, bas: `bottom`, true: `bottom`, oui: `bottom`, yes: `bottom`,
  top: `top`, dessus: `top`, haut: `top`,
  left: `left`, gauche: `left`,
  right: `right`, droite: `right`,
  none: `none`, aucune: `none`, aucun: `none`, false: `none`, non: `none`, no: `none`,
};

const VALUE_WORDS: Record<string, ValueMode> = {
  none: `none`, aucune: `none`, aucun: `none`, false: `none`, non: `none`, no: `none`,
  value: `value`, donnee: `value`, donnees: `value`, true: `value`, oui: `value`, yes: `value`,
  percent: `percent`, pourcentage: `percent`, pourcentages: `percent`,
  both: `both`, les_deux: `both`,
};

const BOOLS: Record<string, boolean> = { true: true, false: false, oui: true, non: false, yes: true, no: false };

function readBool(value: string, fallback: boolean): boolean {
  const b = BOOLS[value.trim().toLowerCase()];
  return b === undefined ? fallback : b;
}

// The data lines are written with `;` between cells (a decimal comma stays usable); a tab or a comma is also read when a line has no `;`.
function splitCells(line: string): string[] {
  const sep = line.includes(`;`) ? `;` : line.includes(`\t`) ? `\t` : `,`;
  return line.split(sep).map((c) => c.trim());
}

// Reads the text of a chart block (what is between the fences). Unknown lines are ignored; numbers that cannot be read become empty cells.
export function parseChart(source: string): ChartSpec {
  const spec = defaultChart();
  const lines = source.replace(/\r\n?/g, `\n`).split(`\n`);
  let at = 0;
  const colors: string[] = [];
  spec.colors = colors;
  for (; at < lines.length; at++) {
    const line = lines[at].trim();
    if (line === ``) continue;
    if (/^data\s*:\s*$/i.test(line)) {
      at++;
      break;
    }
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2];
    if (key === `type`) spec.type = (CHART_TYPES as string[]).includes(value.trim().toLowerCase()) ? (value.trim().toLowerCase() as ChartType) : spec.type;
    else if (key === `title`) spec.title = cleanText(value);
    else if (key === `x-title`) spec.xTitle = cleanText(value);
    else if (key === `y-title`) spec.yTitle = cleanText(value);
    else if (key === `horizontal`) spec.horizontal = readBool(value, spec.horizontal);
    else if (key === `stacked`) spec.stacked = readBool(value, spec.stacked);
    else if (key === `values`) spec.valueMode = VALUE_WORDS[value.trim().toLowerCase().replace(/[éè]/g, `e`)] ?? spec.valueMode;
    else if (key === `legend`) spec.legend = LEGEND_WORDS[value.trim().toLowerCase()] ?? spec.legend;
    else if (key === `palette`) spec.palette = (CHART_PALETTES as string[]).includes(value.trim().toLowerCase()) ? (value.trim().toLowerCase() as ChartPalette) : spec.palette;
    else if (key === `grid`) spec.showGrid = readBool(value, spec.showGrid);
    else if (key === `colors`) colors.push(...value.split(`,`).map((c) => (cleanColor(c) ?? ``)));
  }
  const table = parseTable(lines.slice(at).join(`\n`));
  if (table) {
    spec.categories = table.categories;
    spec.series = table.series;
  }
  return spec;
}

// A table of numbers written as text (cells separated by `;`, a tab or a comma; first row: names of the series; first column: categories),
// for instance cells copied from a spreadsheet. Null when the text has no usable data.
export function parseTable(source: string): { categories: string[]; series: ChartSeries[] } | null {
  const rows = source
    .replace(/\r\n?/g, `\n`)
    .split(`\n`)
    .filter((l) => l.trim() !== ``)
    .map(splitCells);
  if (rows.length < 2) return null;
  const header = rows[0];
  const width = Math.min(MAX_SERIES, Math.max(0, Math.max(...rows.map((r) => r.length)) - 1));
  const body = rows.slice(1, MAX_CATEGORIES + 1);
  if (width === 0 || body.length === 0) return null;
  const series: ChartSeries[] = [];
  for (let s = 0; s < width; s++) {
    series.push({
      name: cleanText(header[s + 1] ?? ``),
      values: body.map((r) => {
        const n = parseNumber(r[s + 1] ?? ``);
        return n === null || Number.isNaN(n) ? null : n;
      }),
    });
  }
  return { categories: body.map((r) => cleanText(r[0] ?? ``)), series };
}

function numberText(n: number | null): string {
  return n === null ? `` : String(n);
}

// Text of the chart block (without the fences). Cells that contain `;` or a line break are cleaned.
export function serializeChart(spec: ChartSpec): string {
  const cell = (t: string): string => t.replace(/[;\r\n\t]+/g, ` `).trim();
  const out: string[] = [`type: ${spec.type}`];
  if (spec.title !== ``) out.push(`title: ${cleanText(spec.title)}`);
  if (spec.xTitle !== ``) out.push(`x-title: ${cleanText(spec.xTitle)}`);
  if (spec.yTitle !== ``) out.push(`y-title: ${cleanText(spec.yTitle)}`);
  if (spec.type === `bar`) {
    out.push(`horizontal: ${spec.horizontal}`);
    out.push(`stacked: ${spec.stacked}`);
  }
  out.push(`values: ${spec.valueMode}`);
  out.push(`legend: ${spec.legend}`);
  out.push(`palette: ${spec.palette}`);
  if (spec.type !== `pie`) out.push(`grid: ${spec.showGrid}`);
  if (spec.colors.some((c) => cleanColor(c) !== null)) out.push(`colors: ${spec.colors.map((c) => cleanColor(c) ?? ``).join(`, `)}`);
  out.push(`data:`);
  out.push([``, ...spec.series.map((s) => cell(s.name))].join(`;`));
  spec.categories.forEach((c, i) => out.push([cell(c), ...spec.series.map((s) => numberText(s.values[i] ?? null))].join(`;`)));
  return out.join(`\n`);
}

// The whole fenced block, ready to write in a note.
export function chartBlock(spec: ChartSpec): string {
  return `\`\`\`${CHART_LANG}\n${serializeChart(spec)}\n\`\`\``;
}

// Small stable number for a text (FNV-1a): names the picture of a chart in the export.
export function chartHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// Target of the figure that stands for a chart in the export tree.
export const CHART_TARGET_PREFIX = `${CHART_LANG}:`;

export function chartTarget(source: string): string {
  return `${CHART_TARGET_PREFIX}${chartHash(source.replace(/\r\n?/g, `\n`).trim())}`;
}

export function isChartTarget(target: string): boolean {
  return target.startsWith(CHART_TARGET_PREFIX);
}

// A chart block found in a note: its lines (from the opening fence to the closing fence, 0-based) and the text between the fences.
export interface FoundChart {
  startLine: number;
  endLine: number;
  source: string;
}

// Chart blocks of a text, in order. A block that is not closed is ignored.
export function findCharts(text: string): FoundChart[] {
  const lines = text.replace(/\r\n?/g, `\n`).split(`\n`);
  const found: FoundChart[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^( {0,3})(`{3,}|~{3,})\s*bigorneau-chart\s*$/.exec(lines[i]);
    if (!open) continue;
    const fence = open[2];
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(lines[j])) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    found.push({ startLine: i, endLine: end, source: lines.slice(i + 1, end).join(`\n`) });
    i = end;
  }
  return found;
}

// A text with a chart block replaced: the lines of `found` give way to `block` (the text of a whole fenced block).
export function replaceChart(text: string, found: FoundChart, block: string): string {
  const eol = text.includes(`\r\n`) ? `\r\n` : `\n`;
  const lines = text.split(/\r\n|\n|\r/);
  lines.splice(found.startLine, found.endLine - found.startLine + 1, ...block.split(`\n`));
  return lines.join(eol);
}

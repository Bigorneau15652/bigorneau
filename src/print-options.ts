// Options of the printing (pages, sheet, orientation, colour, printer): pure functions, tested without Obsidian.

export type PrintOrientation = `auto` | `portrait` | `landscape`;
export type PrintPaper = `note` | `a4` | `a3` | `a5` | `letter`;
export type PrintColor = `color` | `gray` | `bw`;
export type PrintDuplex = `none` | `long` | `short`;

// What the maintainer chose in the Print tab. An empty printer means the printing box of the system.
export interface PrintOptions {
  // Pages to print, as typed: empty for all of them, or a list like `2-5, 8`.
  pages: string;
  orientation: PrintOrientation;
  paper: PrintPaper;
  color: PrintColor;
  printer: string;
  copies: number;
  duplex: PrintDuplex;
}

export const PRINT_ORIENTATIONS: PrintOrientation[] = [`auto`, `portrait`, `landscape`];
export const PRINT_PAPERS: PrintPaper[] = [`note`, `a4`, `a3`, `a5`, `letter`];
export const PRINT_COLORS: PrintColor[] = [`color`, `gray`, `bw`];
export const PRINT_DUPLEXES: PrintDuplex[] = [`none`, `long`, `short`];

export interface Sheet {
  width: number;
  height: number;
}

// Sizes of the papers in points, in portrait.
export const PAPER_SIZES: Record<Exclude<PrintPaper, `note`>, Sheet> = {
  a4: { width: 595.276, height: 841.89 },
  a3: { width: 841.89, height: 1190.551 },
  a5: { width: 419.528, height: 595.276 },
  letter: { width: 612, height: 792 },
};

export function defaultPrintOptions(): PrintOptions {
  return { pages: ``, orientation: `auto`, paper: `note`, color: `color`, printer: ``, copies: 1, duplex: `none` };
}

// Options read from the saved settings: each value is checked, a wrong one goes back to its default.
export function sanitizePrintOptions(raw: unknown): PrintOptions {
  const d = defaultPrintOptions();
  if (typeof raw !== `object` || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: T[], fallback: T): T => (typeof value === `string` && (allowed as string[]).includes(value) ? (value as T) : fallback);
  const pages = typeof r.pages === `string` ? r.pages.slice(0, 100) : ``;
  const printer = typeof r.printer === `string` && !/[\u0000-\u001f]/.test(r.printer) ? r.printer.slice(0, 200) : ``;
  const copies = typeof r.copies === `number` && Number.isFinite(r.copies) ? Math.min(99, Math.max(1, Math.round(r.copies))) : 1;
  return {
    pages: isPageListSyntax(pages) ? pages : ``,
    orientation: pick(r.orientation, PRINT_ORIENTATIONS, d.orientation),
    paper: pick(r.paper, PRINT_PAPERS, d.paper),
    color: pick(r.color, PRINT_COLORS, d.color),
    printer,
    copies,
    duplex: pick(r.duplex, PRINT_DUPLEXES, d.duplex),
  };
}

// Is the text a list of pages like `2-5, 8` or `3-` (from page 3 to the end)? Empty means all the pages.
export function isPageListSyntax(text: string): boolean {
  const t = text.trim();
  if (t === ``) return true;
  return t.split(/[,;]/).every((part) => /^\s*\d+\s*(-\s*\d*\s*)?$/.test(part) && !/^\s*0+\s*(-|$)/.test(part));
}

// Numbers of the pages to print (from 1, in order, without repeats) among `count` pages, or null when the text is wrong or selects
// no page of this document.
export function parsePageList(text: string, count: number): number[] | null {
  if (!isPageListSyntax(text)) return null;
  if (text.trim() === ``) return Array.from({ length: count }, (_v, i) => i + 1);
  const chosen = new Set<number>();
  for (const part of text.split(/[,;]/)) {
    const m = /^\s*(\d+)\s*(-\s*(\d*))?\s*$/.exec(part);
    if (!m) return null;
    const from = parseInt(m[1], 10);
    const to = m[2] === undefined ? from : m[3] === `` ? count : parseInt(m[3], 10);
    if (to < from) return null;
    for (let p = from; p <= Math.min(to, count); p++) chosen.add(p);
  }
  return chosen.size === 0 ? null : [...chosen].sort((a, b) => a - b);
}

// Sheet on which a page is printed: the size of the page itself, or the chosen paper, turned as the orientation says (automatic:
// the sheet follows the orientation of the page).
export function sheetFor(page: Sheet, options: Pick<PrintOptions, `orientation` | `paper`>): Sheet {
  const base = options.paper === `note` ? page : PAPER_SIZES[options.paper];
  const short = Math.min(base.width, base.height);
  const long = Math.max(base.width, base.height);
  if (options.orientation === `portrait`) return { width: short, height: long };
  if (options.orientation === `landscape`) return { width: long, height: short };
  if (options.paper === `note`) return { width: page.width, height: page.height };
  return page.width > page.height ? { width: long, height: short } : { width: short, height: long };
}

// Scale and offset that put a page in the middle of its sheet, as large as possible without cutting it. Same size: no change.
export function placement(page: Sheet, sheet: Sheet): { scale: number; x: number; y: number } {
  if (Math.abs(page.width - sheet.width) < 0.5 && Math.abs(page.height - sheet.height) < 0.5) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min(sheet.width / page.width, sheet.height / page.height);
  return { scale, x: (sheet.width - page.width * scale) / 2, y: (sheet.height - page.height * scale) / 2 };
}

// The one sheet size of the whole printing, or null when the sheets differ (the printer then needs the box of the system).
export function commonSheet(sheets: Sheet[]): Sheet | null {
  if (sheets.length === 0) return null;
  return sheets.every((s) => Math.abs(s.width - sheets[0].width) < 0.5 && Math.abs(s.height - sheets[0].height) < 0.5) ? sheets[0] : null;
}

// Settings sent to the printing of the window when a printer is chosen in the plugin (no box of the system). The sheet is given in
// portrait with the landscape flag, in microns, as the printing of the window expects it.
export function directPrintOptions(printer: string, sheet: Sheet, options: Pick<PrintOptions, `color` | `copies` | `duplex`>): Record<string, unknown> {
  const micron = (points: number): number => Math.round((points * 25400) / 72);
  return {
    silent: true,
    printBackground: true,
    deviceName: printer,
    color: options.color === `color`,
    copies: options.copies,
    landscape: sheet.width > sheet.height,
    pageSize: { width: micron(Math.min(sheet.width, sheet.height)), height: micron(Math.max(sheet.width, sheet.height)) },
    margins: { marginType: `none` },
    duplexMode: options.duplex === `long` ? `longEdge` : options.duplex === `short` ? `shortEdge` : `simplex`,
  };
}

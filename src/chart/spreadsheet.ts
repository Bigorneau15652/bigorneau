// Reading of spreadsheet files for the charts: CSV (and TSV), xlsx (Excel) and ods (LibreOffice). A file gives sheets of text cells; a
// sheet gives the table of numbers of a chart. No library: xlsx and ods are zip archives of XML files, read with the zip reader of the
// plugin. The old binary xls format is not read. This file does not depend on Obsidian.
import { Inflate, zipFiles } from "../zip";
import { ChartSeries, cleanText, MAX_CATEGORIES, MAX_SERIES, parseNumber, rowHasNumbers } from "./spec";

export interface Sheet {
  name: string;
  rows: string[][];
}

// Largest sheet kept (a chart needs far less).
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 200;

export const SPREADSHEET_EXT = /\.(csv|tsv|txt|xlsx|ods)$/i;

// ---------------------------------------------------------------- small helpers

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    const k = e.toLowerCase();
    if (k === `amp`) return `&`;
    if (k === `lt`) return `<`;
    if (k === `gt`) return `>`;
    if (k === `quot`) return `"`;
    if (k === `apos`) return `'`;
    const code = k.startsWith(`#x`) ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ``;
  });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name.replace(/[:.-]/g, `\\$&`)}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? decodeEntities(m[1]) : null;
}

// Number of a column from its letters (A is 0).
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// A number read in a file, written without the rounding noise of the binary form (0.30000000000000004 becomes 0.3).
function cleanNumberText(text: string): string {
  const n = Number(text);
  return Number.isFinite(n) ? String(Number(n.toPrecision(12))) : text;
}

// ---------------------------------------------------------------- CSV

// Text of a CSV file: UTF-8, or the Windows encoding that Excel uses in France when the file is not valid UTF-8.
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder(`utf-8`, { fatal: true }).decode(bytes).replace(/^﻿/, ``);
  } catch {
    return new TextDecoder(`windows-1252`).decode(bytes);
  }
}

// Rows of a CSV text: the separator (`;`, tab or `,`) is guessed on the first lines, fields may be quoted with "" inside.
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, ``).replace(/\r\n?/g, `\n`);
  const sample = clean.split(`\n`).slice(0, 5).join(`\n`);
  const count = (c: string): number => sample.split(c).length - 1;
  const sep = count(`;`) >= Math.max(count(`\t`), count(`,`)) && count(`;`) > 0 ? `;` : count(`\t`) >= count(`,`) && count(`\t`) > 0 ? `\t` : `,`;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = ``;
  let quoted = false;
  for (let i = 0; i < clean.length && rows.length < MAX_ROWS; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === `"`) {
        if (clean[i + 1] === `"`) {
          field += `"`;
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === `"` && field === ``) quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = ``;
    } else if (ch === `\n`) {
      row.push(field);
      rows.push(row.slice(0, MAX_COLUMNS));
      row = [];
      field = ``;
    } else field += ch;
  }
  if (field !== `` || row.length > 0) {
    row.push(field);
    rows.push(row.slice(0, MAX_COLUMNS));
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ``));
}

// ---------------------------------------------------------------- xlsx

// Texts shared by the cells of an xlsx sheet.
function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const withoutPhonetic = m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, ``);
    let text = ``;
    for (const t of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
    out.push(decodeEntities(text));
  }
  return out;
}

// Rows of an xlsx worksheet.
function xlsxRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const cell of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /^([A-Za-z]+)(\d+)$/.exec(attr(cell[1], `r`) ?? ``);
    if (!ref) continue;
    const col = columnIndex(ref[1]);
    const rowNo = Number(ref[2]) - 1;
    if (col < 0 || col >= MAX_COLUMNS || rowNo < 0 || rowNo >= MAX_ROWS) continue;
    const kind = attr(cell[1], `t`) ?? `n`;
    const body = cell[2] ?? ``;
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let text = ``;
    if (kind === `inlineStr`) {
      for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += decodeEntities(t[1]);
    } else if (v !== undefined) {
      if (kind === `s`) text = shared[Number(v)] ?? ``;
      else if (kind === `str` || kind === `e`) text = decodeEntities(v);
      else if (kind === `b`) text = v === `1` ? `true` : `false`;
      else text = cleanNumberText(v);
    }
    while (rows.length <= rowNo) rows.push([]);
    const line = rows[rowNo];
    while (line.length <= col) line.push(``);
    line[col] = text;
  }
  return rows;
}

// Sheets of an xlsx file, in the order of the workbook.
export async function readXlsx(bytes: Uint8Array, inflate: Inflate): Promise<Sheet[]> {
  const files = await zipFiles(bytes, inflate, (path) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/i.test(path));
  const text = (path: string): string => {
    const f = files.find((e) => e.path.toLowerCase() === path.toLowerCase());
    return f ? new TextDecoder().decode(f.data) : ``;
  };
  const workbook = text(`xl/workbook.xml`);
  const rels = text(`xl/_rels/workbook.xml.rels`);
  const shared = sharedStrings(text(`xl/sharedStrings.xml`));
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1], `Id`);
    const target = attr(m[1], `Target`);
    if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, `xl/`));
  }
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = attr(m[1], `name`);
    const id = attr(m[1], `r:id`);
    const target = id ? targets.get(id) : undefined;
    if (!name || !target) continue;
    sheets.push({ name, rows: xlsxRows(text(target), shared) });
  }
  // A file without readable workbook: the worksheets are taken in the order of their names.
  if (sheets.length === 0) {
    files
      .filter((e) => /^xl\/worksheets\/[^/]+\.xml$/i.test(e.path))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
      .forEach((e, i) => sheets.push({ name: `${i + 1}`, rows: xlsxRows(new TextDecoder().decode(e.data), shared) }));
  }
  return sheets;
}

// ---------------------------------------------------------------- ods

// Text of an ods cell: its paragraphs, one per line.
function odsText(body: string): string {
  const parts: string[] = [];
  for (const p of body.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
    const inner = p[1]
      .replace(/<text:s\b[^>]*\/>/g, (tag) => ` `.repeat(Math.min(100, Number(attr(tag, `text:c`) ?? 1))))
      .replace(/<text:(?:tab|line-break)\s*\/>/g, ` `)
      .replace(/<[^>]+>/g, ``);
    parts.push(decodeEntities(inner));
  }
  return parts.join(` `);
}

// Rows of an ods table (the repeated cells and rows are written out, within limits; empty rows at the end are dropped).
function odsRows(xml: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<table:table-row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
    const repeatRows = Math.min(50, Math.max(1, Number(attr(rowMatch[1], `table:number-rows-repeated`) ?? 1)));
    const line: string[] = [];
    for (const cell of (rowMatch[2] ?? ``).matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
      const repeat = Math.min(MAX_COLUMNS, Math.max(1, Number(attr(cell[1], `table:number-columns-repeated`) ?? 1)));
      const type = attr(cell[1], `office:value-type`);
      let text = ``;
      if (type === `float` || type === `percentage` || type === `currency`) text = cleanNumberText(attr(cell[1], `office:value`) ?? ``);
      else if (type === `boolean`) text = attr(cell[1], `office:boolean-value`) ?? ``;
      else if (type === `date`) text = attr(cell[1], `office:date-value`) ?? ``;
      else text = odsText(cell[2] ?? ``);
      for (let k = 0; k < repeat && line.length < MAX_COLUMNS; k++) line.push(text);
    }
    while (line.length > 0 && line[line.length - 1] === ``) line.pop();
    for (let k = 0; k < repeatRows && rows.length < MAX_ROWS; k++) rows.push([...line]);
  }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
  return rows;
}

// Sheets of an ods file.
export async function readOds(bytes: Uint8Array, inflate: Inflate): Promise<Sheet[]> {
  const files = await zipFiles(bytes, inflate, (path) => path === `content.xml`);
  const xml = files[0] ? new TextDecoder().decode(files[0].data) : ``;
  const sheets: Sheet[] = [];
  for (const m of xml.matchAll(/<table:table\b([^>]*?)>([\s\S]*?)<\/table:table>/g)) {
    const name = attr(m[1], `table:name`);
    if (name) sheets.push({ name, rows: odsRows(m[2]) });
  }
  return sheets;
}

// ---------------------------------------------------------------- any file

export class SpreadsheetError extends Error {
  constructor(readonly code: `unsupported` | `empty` | `unreadable`, message: string) {
    super(message);
  }
}

// Sheets of a file, by its extension. An old xls file, or a file that cannot be read, raises a SpreadsheetError.
export async function readSpreadsheet(fileName: string, bytes: Uint8Array, inflate: Inflate): Promise<Sheet[]> {
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1].toLowerCase() ?? ``;
  let sheets: Sheet[];
  try {
    if (ext === `xlsx`) sheets = await readXlsx(bytes, inflate);
    else if (ext === `ods`) sheets = await readOds(bytes, inflate);
    else if (ext === `csv` || ext === `tsv` || ext === `txt`) sheets = [{ name: fileName.replace(/^.*[\\/]/, ``), rows: parseCsv(decodeText(bytes)) }];
    else throw new SpreadsheetError(`unsupported`, ext);
  } catch (e) {
    if (e instanceof SpreadsheetError) throw e;
    throw new SpreadsheetError(`unreadable`, e instanceof Error ? e.message : String(e));
  }
  if (sheets.length === 0 || sheets.every((s) => s.rows.length === 0)) throw new SpreadsheetError(`empty`, fileName);
  return sheets;
}

// ---------------------------------------------------------------- from a sheet to a chart

// Cells of a range written A1:D10 (columns and rows are counted from 1; a single cell or an open range is accepted). Null when the text is not a range.
export function parseRange(text: string): { c0: number; r0: number; c1: number; r1: number } | null {
  const m = /^\s*([A-Za-z]{1,3})(\d{1,7})(?:\s*:\s*([A-Za-z]{1,3})(\d{1,7}))?\s*$/.exec(text);
  if (!m) return null;
  const c0 = columnIndex(m[1]);
  const r0 = Number(m[2]) - 1;
  const c1 = m[3] ? columnIndex(m[3]) : c0;
  const r1 = m[4] ? Number(m[4]) - 1 : r0;
  return { c0: Math.min(c0, c1), r0: Math.min(r0, r1), c1: Math.max(c0, c1), r1: Math.max(r0, r1) };
}

export interface ImportOptions {
  // Part of the sheet to read (A1:D10), or empty for all of it.
  range: string;
  // Rows become columns and columns become rows.
  transpose: boolean;
  // True: the first row gives the names of the series. False: it is a row of data. Absent: it is a row of names unless it holds numbers.
  header?: boolean;
}

export interface ImportedTable {
  categories: string[];
  series: ChartSeries[];
  // True when rows or columns were left out because a chart holds at most MAX_CATEGORIES categories and MAX_SERIES series.
  truncated: boolean;
}

// The chart table of a sheet: the first column gives the categories, the first row the names of the series (when it holds no number), the other
// cells are the numbers. Null when the part chosen has no usable row of numbers.
export function tableOfSheet(rows: string[][], options: ImportOptions): ImportedTable | null {
  let grid = rows;
  const range = options.range.trim() === `` ? null : parseRange(options.range);
  if (options.range.trim() !== `` && !range) return null;
  if (range) grid = rows.slice(range.r0, range.r1 + 1).map((r) => r.slice(range.c0, range.c1 + 1));
  if (options.transpose) {
    const width = Math.max(0, ...grid.map((r) => r.length));
    grid = Array.from({ length: width }, (_x, c) => grid.map((r) => r[c] ?? ``));
  }
  grid = grid.filter((r) => r.some((c) => c.trim() !== ``));
  if (grid.length === 0) return null;
  const hasHeader = options.header ?? !rowHasNumbers(grid[0]);
  if (hasHeader && grid.length < 2) return null;
  const width = Math.max(...grid.map((r) => r.length)) - 1;
  if (width < 1) return null;
  const body = hasHeader ? grid.slice(1) : grid;
  const seriesCount = Math.min(width, MAX_SERIES);
  const used = body.slice(0, MAX_CATEGORIES);
  const series: ChartSeries[] = [];
  for (let s = 0; s < seriesCount; s++) {
    series.push({
      name: hasHeader ? cleanText(grid[0][s + 1] ?? ``) : ``,
      values: used.map((r) => {
        const n = parseNumber(r[s + 1] ?? ``);
        return n === null || Number.isNaN(n) ? null : n;
      }),
    });
  }
  return { categories: used.map((r) => cleanText(r[0] ?? ``)), series, truncated: width > MAX_SERIES || body.length > MAX_CATEGORIES };
}

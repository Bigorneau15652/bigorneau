// Edition des tableaux Markdown dans le texte d'une note : retrouver le tableau sous le curseur, ajouter, supprimer et deplacer des
// lignes et des colonnes, regler l'alignement, ecrire le style (repere %% mmw-table %%) et la legende (ligne « Tableau : ... »), et
// creer un tableau. Ce module ne depend pas d'Obsidian : il se teste avec node --test.
import { formatTableMarker, parseTableMarker, TableStyle } from "./table-marker";

export type Align = `none` | `left` | `center` | `right`;

export interface TableData {
  // La premiere ligne est l'en-tete.
  rows: string[][];
  align: Align[];
}

export interface TableSpan {
  // Plage du texte (premiere et derniere ligne du tableau, sans le retour a la ligne final) et numeros de ligne (a partir de 0).
  from: number;
  to: number;
  startLine: number;
  endLine: number;
}

const SEP_CELL_RE = /^:?-+:?$/;

function eolOf(text: string): string {
  return text.includes(`\r\n`) ? `\r\n` : `\n`;
}

function linesOf(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let pos = 0;
  for (const raw of text.split(`\n`)) {
    out.push({ text: raw.endsWith(`\r`) ? raw.slice(0, -1) : raw, start: pos });
    pos += raw.length + 1;
  }
  return out;
}

// Cellules d'une ligne de tableau : sans les barres des bords, coupees aux barres non precedees d'une barre oblique inverse.
export function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith(`|`)) s = s.slice(1);
  if (s.endsWith(`|`) && !s.endsWith(`\\|`)) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = ``;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === `\\` && s[i + 1] === `|`) {
      cur += `\\|`;
      i++;
    } else if (s[i] === `|`) {
      cells.push(cur.trim());
      cur = ``;
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparator(line: string): boolean {
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((c) => SEP_CELL_RE.test(c));
}

function alignOf(cell: string): Align {
  const l = cell.startsWith(`:`);
  const r = cell.endsWith(`:`);
  return l && r ? `center` : l ? `left` : r ? `right` : `none`;
}

// Tableau qui contient la ligne du decalage donne : lignes consecutives qui commencent par une barre, la deuxieme etant la ligne de
// separation. Renvoie null si le decalage n'est pas dans un tableau.
export function findTable(text: string, offset: number): (TableSpan & TableData) | null {
  const lines = linesOf(text);
  let at = lines.findIndex((l, i) => offset >= l.start && (i === lines.length - 1 || offset < lines[i + 1].start));
  if (at < 0) at = 0;
  const isRow = (i: number): boolean => i >= 0 && i < lines.length && lines[i].text.trim().startsWith(`|`);
  if (!isRow(at)) return null;
  let first = at;
  while (isRow(first - 1)) first--;
  let last = at;
  while (isRow(last + 1)) last++;
  if (last - first < 1 || !isSeparator(lines[first + 1].text)) return null;
  const header = splitCells(lines[first].text);
  const cols = header.length;
  const sep = splitCells(lines[first + 1].text);
  const align: Align[] = [];
  for (let c = 0; c < cols; c++) align.push(sep[c] ? alignOf(sep[c]) : `none`);
  const rows: string[][] = [header];
  for (let i = first + 2; i <= last; i++) {
    const cells = splitCells(lines[i].text);
    while (cells.length < cols) cells.push(``);
    rows.push(cells.slice(0, cols));
  }
  return { from: lines[first].start, to: lines[last].start + lines[last].text.length, startLine: first, endLine: last, rows, align };
}

function sepCell(a: Align): string {
  return a === `left` ? `:---` : a === `center` ? `:---:` : a === `right` ? `---:` : `---`;
}

export function renderTable(data: TableData, eol = `\n`): string {
  const line = (cells: string[]): string => `| ${cells.map((c) => (c === `` ? ` ` : c)).join(` | `)} |`.replace(/\| {2}\|/g, `|   |`);
  const out = [line(data.rows[0]), `| ${data.align.map(sepCell).join(` | `)} |`];
  for (let i = 1; i < data.rows.length; i++) out.push(line(data.rows[i]));
  return out.join(eol);
}

// Numero de colonne d'un decalage dans une ligne de tableau (nombre de barres non echappees avant lui, moins la barre du bord).
export function columnAt(line: string, column: number): number {
  const lead = line.length - line.trimStart().length;
  let bars = 0;
  for (let i = lead; i < Math.min(column, line.length); i++) {
    if (line[i] === `|` && line[i - 1] !== `\\`) bars++;
  }
  const cols = splitCells(line).length;
  return Math.max(0, Math.min(cols - 1, line.trimStart().startsWith(`|`) ? bars - 1 : bars));
}

// ---------------------------------------------------------------- modifications d'un tableau

const clone = (d: TableData): TableData => ({ rows: d.rows.map((r) => [...r]), align: [...d.align] });

// Ajoute une ligne vide au-dessus ou en dessous de la ligne donnee (l'en-tete reste la premiere ligne).
export function addRow(d: TableData, row: number, where: `above` | `below`): TableData {
  const out = clone(d);
  const at = Math.max(1, where === `above` ? row : row + 1);
  out.rows.splice(at, 0, d.align.map(() => ``));
  return out;
}

export function addColumn(d: TableData, col: number, where: `left` | `right`): TableData {
  const out = clone(d);
  const at = where === `left` ? col : col + 1;
  for (const r of out.rows) r.splice(at, 0, ``);
  out.align.splice(at, 0, `none`);
  return out;
}

// Supprime une ligne ; l'en-tete ne se supprime pas.
export function deleteRow(d: TableData, row: number): TableData | null {
  if (row <= 0 || row >= d.rows.length) return null;
  const out = clone(d);
  out.rows.splice(row, 1);
  return out;
}

// Supprime une colonne ; la derniere colonne ne se supprime pas.
export function deleteColumn(d: TableData, col: number): TableData | null {
  if (d.align.length <= 1 || col < 0 || col >= d.align.length) return null;
  const out = clone(d);
  for (const r of out.rows) r.splice(col, 1);
  out.align.splice(col, 1);
  return out;
}

export function setAlign(d: TableData, col: number, align: Align): TableData {
  const out = clone(d);
  if (col >= 0 && col < out.align.length) out.align[col] = align;
  return out;
}

// Deplace une ligne du corps vers le haut ou le bas (l'en-tete reste en tete).
export function moveRow(d: TableData, row: number, dir: -1 | 1): TableData | null {
  const to = row + dir;
  if (row < 1 || to < 1 || to >= d.rows.length) return null;
  const out = clone(d);
  [out.rows[row], out.rows[to]] = [out.rows[to], out.rows[row]];
  return out;
}

export function moveColumn(d: TableData, col: number, dir: -1 | 1): TableData | null {
  const to = col + dir;
  if (col < 0 || to < 0 || to >= d.align.length) return null;
  const out = clone(d);
  for (const r of out.rows) [r[col], r[to]] = [r[to], r[col]];
  [out.align[col], out.align[to]] = [out.align[to], out.align[col]];
  return out;
}

// Texte de la note ou le tableau est remplace par sa nouvelle version.
export function replaceTable(text: string, span: TableSpan, data: TableData): string {
  return text.slice(0, span.from) + renderTable(data, eolOf(text)) + text.slice(span.to);
}

// ---------------------------------------------------------------- style et legende

// Debut d'une ligne de legende : « Tableau : » en francais, « Table: » en anglais.
export function captionPrefix(word: string): string {
  return word === `Table` ? `Table: ` : `${word} : `;
}

const CAPTION_RE = /^(Tableau|Table)[ \t\u00A0]*:[ \t\u00A0]*(.*)$/i;

export interface TableContext {
  style: TableStyle;
  // Numeros de ligne (a partir de 0) du repere de style et de la legende, quand ils existent.
  markerLine?: number;
  captionLine?: number;
  caption?: string;
}

// Legende et repere de style d'un tableau : au-dessus de lui, dans cet ordre (repere, legende, tableau), avec des lignes vides possibles
// entre eux.
export function tableContext(text: string, span: TableSpan): TableContext {
  const lines = linesOf(text);
  const out: TableContext = { style: {} };
  let i = span.startLine - 1;
  const skipBlank = (): void => {
    while (i >= 0 && lines[i].text.trim() === ``) i--;
  };
  skipBlank();
  const cap = i >= 0 ? CAPTION_RE.exec(lines[i].text.trim()) : null;
  if (cap) {
    out.captionLine = i;
    out.caption = cap[2].trim();
    i--;
    skipBlank();
  }
  const marker = i >= 0 ? parseTableMarker(lines[i].text) : null;
  if (marker) {
    out.markerLine = i;
    out.style = marker;
  }
  return out;
}

// Ecrit le style du tableau : le repere est remplace, ajoute au-dessus de la legende (ou du tableau), ou retire quand plus aucun choix
// n'est actif. Renvoie le nouveau texte.
export function setTableStyle(text: string, span: TableSpan, style: TableStyle): string {
  const eol = eolOf(text);
  const ctx = tableContext(text, span);
  const lines = linesOf(text);
  const marker = formatTableMarker(style);
  if (ctx.markerLine !== undefined) {
    const line = lines[ctx.markerLine];
    if (marker !== null) return text.slice(0, line.start) + marker + text.slice(line.start + line.text.length);
    // Retrait : la ligne et la ligne vide qui la suit.
    const next = lines[ctx.markerLine + 1];
    const end = next && next.text.trim() === `` ? next.start + next.text.length + eol.length : line.start + line.text.length + eol.length;
    return text.slice(0, line.start) + text.slice(Math.min(end, text.length));
  }
  if (marker === null) return text;
  const anchor = ctx.captionLine ?? span.startLine;
  const at = lines[anchor].start;
  const before = anchor > 0 && lines[anchor - 1].text.trim() !== `` ? eol : ``;
  return `${text.slice(0, at)}${before}${marker}${eol}${eol}${text.slice(at)}`;
}

// Ecrit la legende : remplacee, ajoutee juste au-dessus du tableau, ou retiree quand `caption` est null.
export function setCaption(text: string, span: TableSpan, caption: string | null, word = `Tableau`): string {
  const eol = eolOf(text);
  const ctx = tableContext(text, span);
  const lines = linesOf(text);
  if (ctx.captionLine !== undefined) {
    const line = lines[ctx.captionLine];
    if (caption !== null) return text.slice(0, line.start) + `${captionPrefix(word)}${caption}` + text.slice(line.start + line.text.length);
    const next = lines[ctx.captionLine + 1];
    const end = next && next.text.trim() === `` ? next.start + next.text.length + eol.length : line.start + line.text.length + eol.length;
    return text.slice(0, line.start) + text.slice(Math.min(end, text.length));
  }
  if (caption === null) return text;
  const at = lines[span.startLine].start;
  const before = span.startLine > 0 && lines[span.startLine - 1].text.trim() !== `` ? eol : ``;
  return `${text.slice(0, at)}${before}${captionPrefix(word)}${caption}${eol}${eol}${text.slice(at)}`;
}

// ---------------------------------------------------------------- creation

export interface NewTable {
  rows: number;
  cols: number;
  style: TableStyle;
  // Ajoute la ligne de legende (a remplir).
  caption: boolean;
  word?: string;
}

// Bloc de texte d'un tableau neuf : repere de style, legende a remplir, tableau a cellules vides. `cursor` est le decalage, dans le
// bloc, ou placer le curseur (apres « Tableau : » pour taper le nom, sinon dans la premiere cellule).
export function newTableBlock(n: NewTable, eol = `\n`): { text: string; cursor: number } {
  const parts: string[] = [];
  const marker = formatTableMarker(n.style);
  if (marker) parts.push(marker);
  let cursor = -1;
  if (n.caption) {
    const head = parts.length > 0 ? parts.join(eol + eol) + eol + eol : ``;
    const prefix = captionPrefix(n.word ?? `Tableau`);
    parts.push(prefix);
    cursor = head.length + prefix.length;
  }
  const data: TableData = { rows: Array.from({ length: n.rows }, () => Array.from({ length: n.cols }, () => ``)), align: Array.from({ length: n.cols }, () => `none`) };
  const table = renderTable(data, eol);
  const head = parts.length > 0 ? parts.join(eol + eol) + eol + eol : ``;
  if (cursor < 0) cursor = head.length + 2;
  return { text: head + table, cursor };
}

// Texte de la note avec un bloc insere a la position du curseur : le bloc est separe du texte voisin par des lignes vides. Renvoie le
// nouveau texte et la position du curseur.
export function insertBlock(text: string, at: number, block: { text: string; cursor: number }): { text: string; cursor: number; edit: { from: number; to: number; insert: string } } {
  const eol = eolOf(text);
  const lines = linesOf(text);
  const idx = Math.max(0, lines.findIndex((l, i) => at >= l.start && (i === lines.length - 1 || at < lines[i + 1].start)));
  const line = lines[idx];
  const blank = line.text.trim() === ``;
  // Ligne vide : le bloc la remplace. Sinon il s'insere apres la ligne, separe d'elle par une ligne vide.
  const from = blank ? line.start : line.start + line.text.length;
  const to = blank ? line.start + line.text.length : from;
  const before = blank ? (idx > 0 && lines[idx - 1].text.trim() !== `` ? eol : ``) : eol + eol;
  const nextLine = lines[idx + 1];
  // Le texte qui suit commence par le retour a la ligne de la ligne du curseur : une seule ligne vide est a ajouter.
  const after = nextLine !== undefined && nextLine.text.trim() !== `` ? eol : ``;
  const insert = `${before}${block.text}${after}`;
  return { text: text.slice(0, from) + insert + text.slice(to), cursor: from + before.length + block.cursor, edit: { from, to, insert } };
}

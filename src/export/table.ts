// Export de haute qualite : composition d'un tableau. Style sobre (filet en haut, filet sous la ligne d'en-tete, filet en
// bas, en-tete en gras, pas de quadrillage). Largeur des colonnes adaptee au contenu, texte des cellules compose comme celui
// d'un paragraphe, alignement des colonnes repris du Markdown. Un tableau long se coupe entre deux lignes : l'en-tete est
// repete en haut de la page suivante (voir paginate.ts).
import type { ColumnAlign } from "./doc-tree";
import { FontStyle, measureText } from "./font-metrics";
import { InlineText, plainOf } from "./inline";
import type { TypesetParagraph } from "./paragraph";
import { INF_PENALTY } from "./tex-params";
import type { Row, RowCell } from "./typeset";

// Espace entre deux colonnes et marges verticales d'une ligne du tableau, en points.
export const TABLE_GAP = 12;
export const TABLE_PAD_TOP = 2;
export const TABLE_PAD_BOTTOM = 2;
const MIN_COLUMN = 18;

export interface TableOptions {
  textWidth: number;
  fontSize: number;
  leading: number;
  // Prepare le texte d'une cellule (notes de bas de page, renvois, mise en forme).
  prepare(text: string): InlineText;
  // Compose le texte d'une cellule dans la largeur donnee, au fer a gauche.
  typeset(text: InlineText, width: number, style: FontStyle): TypesetParagraph;
}

export interface TableLayout {
  rows: Row[];
  width: number;
  height: number;
  // Lignes de l'en-tete (copies sans lien avec les autres), a repeter apres un saut de page.
  header: Row[];
}

// Largeurs des colonnes : largeur naturelle si le tableau tient, sinon partage de la place disponible entre les colonnes
// selon ce que chacune peut gagner a etre elargie (jamais en dessous du mot le plus long).
export function columnWidths(natural: number[], min: number[], available: number): number[] {
  const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
  if (sum(natural) <= available) return natural.slice();
  const sumMin = sum(min);
  if (sumMin >= available) return min.map((m) => (m * available) / sumMin);
  const spare = available - sumMin;
  const demand = natural.map((n, i) => n - min[i]);
  const total = sum(demand);
  return min.map((m, i) => m + (spare * demand[i]) / total);
}

export function layoutTable(rowsText: string[][], align: ColumnAlign[], opts: TableOptions, tableId: number): TableLayout {
  const cols = Math.max(1, ...rowsText.map((r) => r.length));
  const cells = rowsText.map((r, ri) => {
    const out: { inline: InlineText; style: FontStyle }[] = [];
    for (let c = 0; c < cols; c++) out.push({ inline: opts.prepare(r[c] ?? ``), style: ri === 0 ? `bold` : `regular` });
    return out;
  });
  // Largeurs naturelles et minimales de chaque colonne.
  const natural: number[] = [];
  const min: number[] = [];
  for (let c = 0; c < cols; c++) {
    let nat = 0;
    let mn = MIN_COLUMN;
    for (const row of cells) {
      const plain = plainOf(row[c].inline.text);
      nat = Math.max(nat, measureText(plain, opts.fontSize, row[c].style).width);
      for (const w of plain.split(/\s+/)) if (w !== ``) mn = Math.max(mn, measureText(w, opts.fontSize, row[c].style).width);
    }
    natural.push(Math.max(nat, mn));
    min.push(mn);
  }
  const available = opts.textWidth - TABLE_GAP * (cols - 1);
  const widths = columnWidths(natural, min, available);
  const tableWidth = widths.reduce((a, b) => a + b, 0) + TABLE_GAP * (cols - 1);
  const left = Math.max(0, (opts.textWidth - tableWidth) / 2);
  const xs: number[] = [];
  let x = 0;
  for (const w of widths) {
    xs.push(x);
    x += w + TABLE_GAP;
  }

  const rows: Row[] = [];
  let headerCount = 0;
  cells.forEach((row, ri) => {
    const composed = row.map((cell, c) => opts.typeset(cell.inline, widths[c], cell.style));
    const count = Math.max(1, ...composed.map((p) => p.lines.length));
    const start = rows.length;
    for (let k = 0; k < count; k++) {
      const lineCells: RowCell[] = [];
      const notes: number[] = [];
      let text = ``;
      composed.forEach((p, c) => {
        const l = p.lines[k];
        if (!l) return;
        const free = Math.max(0, widths[c] - l.width);
        const dx = align[c] === `right` ? free : align[c] === `center` ? free / 2 : 0;
        lineCells.push({ x: xs[c] + dx, width: widths[c] - dx, text: l.text, runs: l.runs });
        text += (text === `` ? `` : ` | `) + l.text;
        for (const n of l.notes) if (!notes.includes(n)) notes.push(n);
      });
      const first = k === 0;
      const last = k === count - 1;
      const top = first ? TABLE_PAD_TOP : 0;
      const bottom = last ? TABLE_PAD_BOTTOM : 0;
      rows.push({
        kind: `table`,
        text,
        x: left,
        width: tableWidth,
        fontSize: opts.fontSize,
        height: opts.leading + top + bottom,
        wordSpacing: 0,
        // Les lignes d'une meme rangee restent ensemble, et l'en-tete reste avec la premiere rangee.
        breakAfter: !last || ri === 0 ? INF_PENALTY : 0,
        align: `left`,
        cells: lineCells,
        inset: { top, bottom },
        ...(notes.length > 0 ? { notes } : {}),
      });
    }
    if (ri === 0) headerCount = rows.length - start;
  });
  if (rows.length > 0) {
    rows[0].rules = { ...rows[0].rules, top: true };
    rows[headerCount - 1].rules = { ...rows[headerCount - 1].rules, bottom: true };
    rows[rows.length - 1].rules = { ...rows[rows.length - 1].rules, bottom: true };
  }
  const header = rows.slice(0, headerCount).map((r) => ({ ...r, ...(r.rules ? { rules: { ...r.rules } } : {}) }));
  const out = rows.map((r) => ({ ...r, table: { id: tableId, header } }));
  return { rows: out, width: tableWidth, height: out.reduce((a, r) => a + r.height, 0), header };
}

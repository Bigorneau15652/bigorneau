// Collage de cellules copiees dans un tableur (Excel, LibreOffice Calc, Google Sheets...) dans un tableau Markdown de la note : le
// texte brut du presse-papiers (colonnes separees par des tabulations, lignes par des retours a la ligne) est lu, puis ecrit dans les
// cellules a partir de la cellule visee. Le tableau grandit si besoin, sans rien couper. Ce module ne depend pas d'Obsidian : il se
// teste avec node --test.
import { t } from "./i18n";
import { findTable, replaceTable, TableData } from "./table-edit";

// Cellules lues dans le texte du presse-papiers : une liste de lignes, toutes de meme largeur. Renvoie null s'il n'y a aucune cellule.
// Une cellule entre guillemets (celle qui contient une tabulation, un retour a la ligne ou un guillemet) est lue en entier, ses
// guillemets doublés redevenant un seul guillemet.
export function parseSpreadsheet(plain: string): string[][] | null {
  const text = plain.replace(/\r\n?/g, `\n`);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = ``;
  let i = 0;
  const endCell = (): void => {
    row.push(cell);
    cell = ``;
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === `"` && cell === ``) {
      // Cellule entre guillemets : elle se termine au guillemet suivi d'une tabulation, d'un retour a la ligne ou de la fin.
      let j = i + 1;
      let quoted = ``;
      let closed = false;
      while (j < text.length) {
        if (text[j] === `"`) {
          if (text[j + 1] === `"`) {
            quoted += `"`;
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        quoted += text[j];
        j++;
      }
      if (closed && (j >= text.length || text[j] === `\t` || text[j] === `\n`)) {
        cell = quoted;
        i = j;
        continue;
      }
      // Guillemet sans fin : il est garde tel quel, comme du texte ordinaire.
    }
    if (ch === `\t`) {
      endCell();
      i++;
    } else if (ch === `\n`) {
      endCell();
      rows.push(row);
      row = [];
      i++;
    } else {
      cell += ch;
      i++;
    }
  }
  if (cell !== `` || row.length > 0) {
    endCell();
    rows.push(row);
  }
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const padded = r.map(markdownCell);
    while (padded.length < width) padded.push(``);
    return padded;
  });
}

// Texte d'une cellule du tableur ecrit pour une cellule de tableau Markdown : espaces des bords retires, barre protegee, retour a la
// ligne remplace par la balise <br>.
export function markdownCell(raw: string): string {
  return raw
    .replace(/\n/g, `<br>`)
    .replace(/\t/g, ` `)
    .replace(/\|/g, `\\|`)
    .trim();
}

// Vrai si le presse-papiers ressemble a des cellules de tableur : au moins deux cellules, c'est-a-dire une tabulation entre deux
// valeurs ou plusieurs lignes issues d'un tableau HTML.
export function looksLikeSpreadsheet(plain: string, html = ``): boolean {
  const cells = parseSpreadsheet(plain);
  if (!cells) return false;
  const many = cells.length > 1 || cells[0].length > 1;
  if (!many) return false;
  if (plain.includes(`\t`)) return true;
  return /<table[\s>]/i.test(html);
}

export interface PasteResult {
  data: TableData;
  rowsAdded: number;
  colsAdded: number;
  rows: number;
  cols: number;
}

// Ecrit les cellules dans le tableau, la premiere dans la cellule (row, col) ; ligne 0 : l'en-tete. Les lignes et les colonnes qui
// manquent sont ajoutees a droite et en bas ; les cellules du tableau en dehors du collage ne changent pas.
export function fillTable(data: TableData, row: number, col: number, cells: string[][]): PasteResult {
  const rows = data.rows.map((r) => [...r]);
  const align = [...data.align];
  const height = cells.length;
  const width = Math.max(...cells.map((r) => r.length));
  const startRow = Math.max(0, row);
  const startCol = Math.max(0, col);
  const neededCols = startCol + width;
  const neededRows = startRow + height;
  let colsAdded = 0;
  while (align.length < neededCols) {
    align.push(`none`);
    colsAdded++;
  }
  for (const r of rows) while (r.length < align.length) r.push(``);
  let rowsAdded = 0;
  while (rows.length < neededRows) {
    rows.push(align.map(() => ``));
    rowsAdded++;
  }
  cells.forEach((line, i) => line.forEach((value, j) => (rows[startRow + i][startCol + j] = value)));
  return { data: { rows, align }, rowsAdded, colsAdded, rows: height, cols: width };
}

export interface TablePaste {
  text: string;
  message: string;
}

// Message affiche apres un collage : les dimensions collees, puis l'agrandissement du tableau s'il a eu lieu.
export function pasteMessage(r: Pick<PasteResult, `rows` | `cols` | `rowsAdded` | `colsAdded`>): string {
  const base = t(`Tableur : {0} ligne(s) et {1} colonne(s) collée(s).`, String(r.rows), String(r.cols));
  if (r.rowsAdded === 0 && r.colsAdded === 0) return base;
  return `${base} ${t(`Lignes ajoutées : {0}. Colonnes ajoutées : {1}.`, String(r.rowsAdded), String(r.colsAdded))}`;
}

// Nouveau texte de la note quand les cellules du tableur sont collees dans le tableau qui contient le decalage donne, a partir de la
// cellule (row, col). Renvoie null hors tableau ou sans cellule.
export function pasteIntoTable(text: string, offset: number, target: { row: number; col: number }, plain: string): TablePaste | null {
  const cells = parseSpreadsheet(plain);
  if (!cells) return null;
  const found = findTable(text, offset);
  if (!found) return null;
  const result = fillTable({ rows: found.rows, align: found.align }, target.row, target.col, cells);
  return { text: replaceTable(text, found, result.data), message: pasteMessage(result) };
}

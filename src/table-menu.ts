// Menu d'un tableau (clic droit et palette de commandes) : ajouter, supprimer et deplacer des lignes et des colonnes, aligner une
// colonne, regler le style (en-tete fonce, alternance, colonnes egales) et le nom du tableau. Chaque entree calcule le nouveau texte de
// la note a partir de l'ancien ; l'application (editeur Obsidian) n'a qu'a l'ecrire. Ce module ne depend pas d'Obsidian.
import { captionWord } from "./export/insert";
import { t } from "./i18n";
import { addColumn, addRow, Align, deleteColumn, deleteRow, findTable, moveColumn, moveRow, replaceTable, setAlign, setCaption, setTableStyle, TableData, tableContext, TableSpan } from "./table-edit";
import type { TableStyle } from "./table-marker";

export interface MenuSpec {
  title?: string;
  icon?: string;
  checked?: boolean;
  disabled?: boolean;
  // Nouveau texte de la note, ou null quand l'action ne change rien.
  run?: (text: string) => string | null;
  submenu?: MenuSpec[];
  separator?: boolean;
}

export interface CellTarget {
  row: number;
  col: number;
}

// Entrees du menu d'un tableau pour la cellule visee (ligne 0 : l'en-tete). Renvoie null si le decalage n'est pas dans un tableau.
export function tableMenu(text: string, offset: number, target?: Partial<CellTarget>): MenuSpec[] | null {
  const found = findTable(text, offset);
  if (!found) return null;
  const span: TableSpan = found;
  const data: TableData = { rows: found.rows, align: found.align };
  const row = Math.max(0, Math.min(data.rows.length - 1, target?.row ?? data.rows.length - 1));
  const col = Math.max(0, Math.min(data.align.length - 1, target?.col ?? 0));
  const ctx = tableContext(text, span);
  // Le texte est relu a chaque action : le tableau peut avoir ete deplace par une action precedente.
  const apply = (change: (d: TableData) => TableData | null): ((current: string) => string | null) => (current) => {
    const now = findTable(current, span.from);
    if (!now) return null;
    const next = change({ rows: now.rows, align: now.align });
    return next ? replaceTable(current, now, next) : null;
  };
  const style = (key: keyof TableStyle): ((current: string) => string | null) => (current) => {
    const now = findTable(current, span.from);
    if (!now) return null;
    const c = tableContext(current, now);
    return setTableStyle(current, now, { ...c.style, [key]: !c.style[key] });
  };
  const word = captionWord(text);
  const align = (a: Align): ((current: string) => string | null) => apply((d) => setAlign(d, col, a));
  const inHeader = row === 0;
  return [
    { title: t(`Insérer une ligne au-dessus`), icon: `between-horizontal-start`, disabled: inHeader, run: apply((d) => addRow(d, row, `above`)) },
    { title: t(`Insérer une ligne en dessous`), icon: `between-horizontal-end`, run: apply((d) => addRow(d, row, `below`)) },
    { title: t(`Insérer une colonne à gauche`), icon: `between-vertical-start`, run: apply((d) => addColumn(d, col, `left`)) },
    { title: t(`Insérer une colonne à droite`), icon: `between-vertical-end`, run: apply((d) => addColumn(d, col, `right`)) },
    { separator: true },
    { title: t(`Supprimer la ligne`), icon: `trash`, disabled: inHeader, run: apply((d) => deleteRow(d, row)) },
    { title: t(`Supprimer la colonne`), icon: `trash`, disabled: data.align.length <= 1, run: apply((d) => deleteColumn(d, col)) },
    { separator: true },
    { title: t(`Déplacer la ligne vers le haut`), icon: `arrow-up`, disabled: row <= 1, run: apply((d) => moveRow(d, row, -1)) },
    { title: t(`Déplacer la ligne vers le bas`), icon: `arrow-down`, disabled: row < 1 || row >= data.rows.length - 1, run: apply((d) => moveRow(d, row, 1)) },
    { title: t(`Déplacer la colonne vers la gauche`), icon: `arrow-left`, disabled: col <= 0, run: apply((d) => moveColumn(d, col, -1)) },
    { title: t(`Déplacer la colonne vers la droite`), icon: `arrow-right`, disabled: col >= data.align.length - 1, run: apply((d) => moveColumn(d, col, 1)) },
    { separator: true },
    {
      title: t(`Alignement de la colonne`),
      icon: `align-left`,
      submenu: [
        { title: t(`À gauche`), icon: `align-left`, checked: data.align[col] === `left`, run: align(`left`) },
        { title: t(`Centré`), icon: `align-center`, checked: data.align[col] === `center`, run: align(`center`) },
        { title: t(`À droite`), icon: `align-right`, checked: data.align[col] === `right`, run: align(`right`) },
      ],
    },
    { separator: true },
    { title: t(`Ligne d'en-tête foncée`), icon: `panel-top`, checked: ctx.style.header === true, run: style(`header`) },
    { title: t(`Alternance de lignes`), icon: `rows-3`, checked: ctx.style.stripes === true, run: style(`stripes`) },
    { title: t(`Colonnes de largeur égale`), icon: `columns-3`, checked: ctx.style.equal === true, run: style(`equal`) },
    {
      title: t(`Nom du tableau`),
      icon: `captions`,
      checked: ctx.captionLine !== undefined,
      run: (current) => {
        const now = findTable(current, span.from);
        if (!now) return null;
        return setCaption(current, now, tableContext(current, now).captionLine !== undefined ? null : ``, word);
      },
    },
  ];
}

// Premiere ligne-colonne visee par une position (ligne et colonne du curseur dans le texte brut du tableau). Renvoie null hors tableau.
export function cellAtLine(text: string, lineIndex: number, column: number, columnOf: (line: string, column: number) => number): CellTarget | null {
  const lines = text.split(`\n`);
  let offset = 0;
  for (let i = 0; i < lineIndex && i < lines.length; i++) offset += lines[i].length + 1;
  const found = findTable(text, offset);
  if (!found) return null;
  const rel = lineIndex - found.startLine;
  const row = rel <= 1 ? 0 : rel - 1;
  return { row, col: columnOf((lines[lineIndex] ?? ``).replace(/\r$/, ``), column) };
}

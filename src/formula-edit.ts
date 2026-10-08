// Edition des formules dans le texte d'une note : retrouver la formule sous le curseur, ecrire une formule ($...$ ou bloc $$...$$)
// et inserer un modele de la palette dans la zone de saisie. Ce module ne depend pas d'Obsidian : il se teste avec node --test.
import { lineStartAt } from "./text-lines";
import type { InsertResult } from "./export/insert";

export interface FoundFormula {
  from: number;
  to: number;
  tex: string;
  display: boolean;
}

// Formule qui contient le decalage donne : bloc $$...$$ (sur plusieurs lignes) ou formule en ligne $...$ de la meme ligne.
export function findFormula(text: string, offset: number): FoundFormula | null {
  const block = /(^|[^\\])\$\$([\s\S]+?)\$\$/g;
  for (let m = block.exec(text); m; m = block.exec(text)) {
    const from = m.index + m[1].length;
    const to = block.lastIndex;
    if (offset >= from && offset <= to) return { from, to, tex: m[2].trim(), display: true };
  }
  const lineStart = lineStartAt(text, offset);
  const lineEndAt = text.indexOf(`\n`, offset);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const line = text.slice(lineStart, lineEnd);
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === `\\`) {
      i += 2;
      continue;
    }
    if (c !== `$` || line[i + 1] === `$`) {
      i += line[i + 1] === `$` && c === `$` ? 2 : 1;
      continue;
    }
    let j = i + 1;
    while (j < line.length && line[j] !== `$`) j += line[j] === `\\` ? 2 : 1;
    if (j >= line.length) break;
    if (j > i + 1 && line[j + 1] !== `$`) {
      const from = lineStart + i;
      const to = lineStart + j + 1;
      if (offset >= from && offset <= to) return { from, to, tex: line.slice(i + 1, j).trim(), display: false };
    }
    i = j + 1;
  }
  return null;
}

// Ecrit la formule a la place de la plage donnee : en ligne $tex$, ou en bloc sur ses propres lignes, separe du texte voisin par
// une ligne vide. Le curseur est place apres la formule.
export function writeFormula(text: string, from: number, to: number, tex: string, display: boolean): InsertResult {
  const body = tex.trim();
  if (!display) {
    const insert = `$${body}$`;
    return { edits: [{ from, to, insert }], cursor: from + insert.length };
  }
  const eol = text.includes(`\r\n`) ? `\r\n` : `\n`;
  const lineStart = lineStartAt(text, from);
  const lineEndAt = text.indexOf(`\n`, to);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const before = text.slice(lineStart, from).trim() !== `` ? eol + eol : ``;
  const after = text.slice(to, lineEnd).trim() !== `` ? eol + eol : ``;
  const insert = `${before}$$${eol}${body}${eol}$$${after}`;
  return { edits: [{ from, to, insert }], cursor: from + insert.length - after.length };
}

export interface TextState {
  text: string;
  start: number;
  end: number;
}

// Insere un modele de la palette a la place de la selection. Un modele a des emplacements vides « {} » : le texte selectionne
// entre dans le premier, qui reçoit le curseur ; un modele sans emplacement laisse le curseur apres lui. Une commande qui se
// termine par une lettre (\alpha) est suivie d'une espace, pour ne pas se coller au texte suivant.
export function insertTemplate(state: TextState, template: string): TextState {
  const selected = state.text.slice(state.start, state.end);
  let tpl = template;
  if (tpl.includes(`{}`)) {
    const slot = tpl.indexOf(`{}`);
    const filled = tpl.slice(0, slot + 1) + selected + tpl.slice(slot + 1);
    const text = state.text.slice(0, state.start) + filled + state.text.slice(state.end);
    const caret = state.start + slot + 1 + selected.length;
    return { text, start: caret, end: caret };
  }
  if (/[A-Za-z]$/.test(tpl) && !/^\s/.test(state.text.slice(state.end))) tpl += ` `;
  const text = state.text.slice(0, state.start) + tpl + state.text.slice(state.end);
  const caret = state.start + tpl.length;
  return { text, start: caret, end: caret };
}

// Emplacement vide suivant le curseur (touche Tab) : decalage place entre les accolades, ou -1.
export function nextSlot(text: string, caret: number): number {
  const at = text.indexOf(`{}`, caret);
  return at < 0 ? -1 : at + 1;
}

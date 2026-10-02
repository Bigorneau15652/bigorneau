// Commandes qui ecrivent dans la note pour preparer l'export : note de bas de page, table des matieres, legende de tableau,
// formules. Ce module calcule seulement les modifications a faire (sans dependre d'Obsidian, pour pouvoir etre teste avec
// node --test) ; main.ts les applique dans l'editeur, ce qui garde l'historique d'annulation.

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

export interface InsertResult {
  edits: TextEdit[];
  // Position du curseur dans le texte apres modification ; absente : le curseur ne bouge pas.
  cursor?: number;
}

// Applique des modifications calculees sur le texte d'origine (de la derniere a la premiere, pour que les positions restent justes).
export function applyEdits(text: string, edits: TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return out;
}

const eolOf = (text: string): string => (text.includes(`\r\n`) ? `\r\n` : `\n`);

// Note de bas de page ecrite dans le texte (^[texte]), apres la selection : le curseur est place a l'interieur pour taper la note.
export function insertFootnote(_text: string, _from: number, to: number): InsertResult {
  return { edits: [{ from: to, to, insert: `^[]` }], cursor: to + 2 };
}

// Formule en ligne : $selection$, ou $$ avec le curseur entre les deux signes.
export function insertInlineMath(text: string, from: number, to: number): InsertResult {
  if (to > from) return { edits: [{ from, to, insert: `$${text.slice(from, to)}$` }], cursor: from + (to - from) + 2 };
  return { edits: [{ from, to, insert: `$$` }], cursor: from + 1 };
}

// Formule en bloc : $$ sur sa propre ligne, la formule, $$ ; separee du texte voisin par une ligne vide.
export function insertBlockMath(text: string, from: number, to: number): InsertResult {
  const eol = eolOf(text);
  const lineStart = text.lastIndexOf(`\n`, from - 1) + 1;
  const lineEndAt = text.indexOf(`\n`, to);
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt;
  const before = text.slice(lineStart, from).trim() !== `` ? eol + eol : ``;
  const after = text.slice(to, lineEnd).trim() !== `` ? eol + eol : ``;
  const body = text.slice(from, to);
  const insert = `${before}$$${eol}${body}${eol}$$${after}`;
  return { edits: [{ from, to, insert }], cursor: from + before.length + 2 + eol.length + body.length };
}

// Legende de tableau : ligne « Tableau : » (« Table: » pour une note en anglais) juste au-dessus du tableau ou le curseur se
// trouve, sinon au-dessus de la ligne du curseur.
// Mot qui ouvre une legende de tableau : « Table » pour une note en anglais (propriete lang), « Tableau » sinon.
export function captionWord(text: string): string {
  const english = /^(?:lang|langue|language)[ \t]*:[ \t]*[\x22\x27\x60]?en/im.test(text.slice(0, Math.max(0, text.indexOf(`\n---`, 3))));
  return english ? `Table` : `Tableau`;
}

export function insertTableCaption(text: string, from: number): InsertResult {
  const eol = eolOf(text);
  const english = /^(?:lang|langue|language)[ \t]*:[ \t]*[\x22\x27\x60]?en/im.test(text.slice(0, Math.max(0, text.indexOf(`\n---`, 3))));
  const prefix = english ? `Table: ` : `Tableau : `;
  const lines = text.split(`\n`);
  // Ligne du curseur et debut de chaque ligne.
  const starts: number[] = [];
  let pos = 0;
  for (const l of lines) {
    starts.push(pos);
    pos += l.length + 1;
  }
  let index = Math.max(0, starts.findIndex((s, i) => from >= s && (i === lines.length - 1 || from < starts[i + 1])));
  if (lines[index].trim().startsWith(`|`)) while (index > 0 && lines[index - 1].trim().startsWith(`|`)) index--;
  const targetBlank = lines[index].trim() === ``;
  const prevFilled = index > 0 && lines[index - 1].trim() !== ``;
  const insert = (prevFilled ? eol : ``) + prefix + (targetBlank ? `` : eol + eol);
  const at = starts[index];
  return { edits: [{ from: at, to: at, insert }], cursor: at + (prevFilled ? eol.length : 0) + prefix.length };
}

// Table des matieres de la note : bascule la propriete toc de l'en-tete (cree l'en-tete au besoin). Renvoie aussi le nouvel etat.
export function toggleToc(text: string): InsertResult & { enabled: boolean } {
  const eol = eolOf(text);
  // Lignes avec leur fin de ligne.
  const lines: string[] = text.match(/[^\n]*\n|[^\n]+/g) ?? [];
  const isFence = (l: string): boolean => /^---[ \t]*\r?\n?$/.test(l);
  let close = -1;
  if (lines.length > 1 && isFence(lines[0])) for (let i = 1; i < lines.length; i++) if (isFence(lines[i])) {
    close = i;
    break;
  }
  if (close < 0) return { edits: [{ from: 0, to: 0, insert: `---${eol}toc: true${eol}---${eol}` }], enabled: true };
  let offset = lines[0].length;
  for (let i = 1; i < close; i++) {
    const m = /^toc[ \t]*:[ \t]*(.*?)[ \t]*(\r?\n?)$/i.exec(lines[i]);
    if (m) {
      const on = /^[\x22\x27]?(true|yes|oui|vrai|1)[\x22\x27]?$/i.test(m[1]);
      return { edits: [{ from: offset, to: offset + lines[i].length, insert: `toc: ${on ? `false` : `true`}${m[2]}` }], enabled: !on };
    }
    offset += lines[i].length;
  }
  // Pas de propriete toc : elle est ajoutee en fin d'en-tete.
  return { edits: [{ from: offset, to: offset, insert: `toc: true${eol}` }], enabled: true };
}

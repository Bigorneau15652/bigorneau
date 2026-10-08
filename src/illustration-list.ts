// Listes des illustrations : une ligne de commentaire seule, `%% liste: figures %%` ou `%% liste: tableaux %%`, place a cet endroit de la
// note la liste des figures (images et dessins nommes) ou des tableaux nommes, avec leur numero de page. Sans etiquette, il n'y a pas de
// liste. Ce module ne depend pas d'Obsidian.
import { lineStartAt } from "./text-lines";
import { blockStart } from "./page-zone";

export type ListKind = `figures` | `tables`;

export const LIST_MARKER_RE = /^[ \t]*%%[ \t]*(?:liste|list)[ \t]*:[ \t]*([^%\n]*?)[ \t]*%%[ \t]*$/;

const norm = (s: string): string => s.normalize(`NFD`).replace(/[̀-ͯ]/g, ``).toLowerCase().trim();

export function parseListKind(spec: string): ListKind | null {
  const w = norm(spec);
  if (w === `figures` || w === `figure` || w === `images`) return `figures`;
  if (w === `tableaux` || w === `tableau` || w === `tables` || w === `table`) return `tables`;
  return null;
}

export const formatListMarker = (kind: ListKind): string => `%% liste: ${kind === `figures` ? `figures` : `tableaux`} %%`;

// Liste demandee sur cette ligne, ou null.
export function readListMarker(line: string): ListKind | null {
  const m = LIST_MARKER_RE.exec(line.replace(/\r$/, ``));
  return m ? parseListKind(m[1]) : null;
}

// Repere pose avant l'analyse du texte (les commentaires sont alors retires), hors blocs de code.
export const LIST_SENTINEL = `\u0002l `;
export const LIST_SENTINEL_END = `\u0003`;

export function markListMarkers(text: string): string {
  if (!/%%[ \t]*(liste|list)[ \t]*:/.test(text)) return text;
  let fence: string | null = null;
  return text
    .split(`\n`)
    .map((line) => {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (f) {
        if (fence === null) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
        return line;
      }
      if (fence !== null) return line;
      const kind = readListMarker(line);
      return kind ? `${LIST_SENTINEL}${kind}${LIST_SENTINEL_END}` : line;
    })
    .join(`\n`);
}

export function listFromSentinel(line: string): ListKind | null {
  if (!line.startsWith(LIST_SENTINEL) || !line.endsWith(LIST_SENTINEL_END)) return null;
  const kind = line.slice(LIST_SENTINEL.length, -LIST_SENTINEL_END.length);
  return kind === `figures` || kind === `tables` ? kind : null;
}

// Listes demandees dans la note, dans l'ordre (hors blocs de code).
export function listMarkersIn(text: string): ListKind[] {
  if (!/%%[ \t]*(liste|list)[ \t]*:/.test(text)) return [];
  const out: ListKind[] = [];
  for (const line of markListMarkers(text).split(`\n`)) {
    const kind = listFromSentinel(line);
    if (kind) out.push(kind);
  }
  return out;
}

// Retire les etiquettes de ce genre de liste (et la ligne vide qui suit chacune), hors blocs de code.
export function removeListMarker(text: string, kind: ListKind): string {
  if (!/%%[ \t]*(liste|list)[ \t]*:/.test(text)) return text;
  const lines = text.split(`\n`);
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    } else if (fence === null && readListMarker(lines[i]) === kind) {
      if (lines[i + 1] !== undefined && lines[i + 1].trim() === ``) i++;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join(`\n`);
}

// Place l'etiquette de ce genre de liste a l'endroit du curseur : sous le titre quand le curseur est sur une ligne de titre, sinon avant
// le bloc de `offset`. L'etiquette est une ligne seule, entouree de lignes vides ; celle qui existait deja est retiree (la liste n'a
// qu'une place).
export function placeListMarker(text: string, offset: number, kind: ListKind): string {
  const lineStart = lineStartAt(text, offset);
  const nl = text.indexOf(`\n`, offset);
  const underHeading = /^ {0,3}#{1,6}[ \t]/.test(text.slice(lineStart, nl === -1 ? text.length : nl));
  const point = underHeading ? (nl === -1 ? text.length : nl + 1) : blockStart(text, offset);
  const lead = underHeading && nl === -1 ? `\n` : ``;
  // Retire l'ancienne etiquette de part et d'autre du point d'insertion, puis insere.
  const head = removeListMarker(text.slice(0, point), kind);
  const tail = removeListMarker(text.slice(point), kind);
  const before = underHeading || head === `` || head.endsWith(`\n\n`) ? `` : head.endsWith(`\n`) ? `\n` : `\n\n`;
  return `${head}${lead}${before}${formatListMarker(kind)}\n\n${tail}`;
}

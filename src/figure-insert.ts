// Figures et dessins ecrits dans la note : ![[cible|Nom]]. Le nom devient la legende « Figure N : Nom » a l'export ; sans nom, la figure
// n'a ni legende ni numero. Ce module ne depend pas d'Obsidian.
import { mediaKindOf } from "./export/doc-tree";
import { isImageTarget, isWebTarget } from "./export/image";

// Nom prepare pour la barre verticale du lien : retours a la ligne, barres et crochets retires.
export function cleanFigureName(name: string): string {
  return name.replace(/[\r\n]+/g, ` `).replace(/[|\[\]]/g, `-`).trim();
}

export function figureMarkup(target: string, name: string): string {
  const n = cleanFigureName(name);
  return n === `` ? `![[${target}]]` : `![[${target}|${n}]]`;
}

export interface DrawingEmbed {
  start: number;
  end: number;
  text: string;
  target: string;
}

const EMBED_RE = /!\[\[([^\]|]+?\.excalidraw(?:\.md)?)(\|[^\]]*)?\]\]/gi;

// Dessins Excalidraw integres dans un texte, dans l'ordre.
export function drawingEmbeds(text: string): DrawingEmbed[] {
  const out: DrawingEmbed[] = [];
  for (let m = EMBED_RE.exec(text); m; m = EMBED_RE.exec(text)) out.push({ start: m.index, end: m.index + m[0].length, text: m[0], target: m[1].trim() });
  EMBED_RE.lastIndex = 0;
  return out;
}

// Dessin ajoute entre deux etats du texte (celui que le plugin Excalidraw vient d'inserer), ou null.
export function addedDrawing(before: string, after: string): DrawingEmbed | null {
  const seen = new Map<string, number>();
  for (const e of drawingEmbeds(before)) seen.set(e.text, (seen.get(e.text) ?? 0) + 1);
  for (const e of drawingEmbeds(after)) {
    const left = seen.get(e.text) ?? 0;
    if (left > 0) seen.set(e.text, left - 1);
    else return e;
  }
  return null;
}

// Le dessin `embed` du texte recoit un nom : ![[dessin.excalidraw]] devient ![[dessin.excalidraw|Nom]]. Une taille deja ecrite est gardee.
export function nameDrawing(embed: DrawingEmbed, name: string): { from: number; to: number; insert: string } {
  const n = cleanFigureName(name);
  const size = /\|(\d+(?:x\d+)?)\]\]$/.exec(embed.text);
  const parts = [embed.target, ...(n === `` ? [] : [n]), ...(size ? [size[1]] : [])];
  return { from: embed.start, to: embed.end, insert: `![[${parts.join(`|`)}]]` };
}

// Modification qui met `markup` (une figure) seul sur sa ligne a la place de `edit` : les figures ne sont reconnues que seules sur leur
// ligne. Si le dessin est deja seul, c'est un simple remplacement.
export function isolateFigure(text: string, edit: { from: number; to: number; insert: string }): { from: number; to: number; insert: string } {
  const lineStart = text.lastIndexOf(`\n`, edit.from - 1) + 1;
  const nl = text.indexOf(`\n`, edit.to);
  const lineEnd = nl === -1 ? text.length : nl;
  const before = text.slice(lineStart, edit.from);
  const after = text.slice(edit.to, lineEnd).replace(/\r$/, ``);
  if (before.trim() === `` && after.trim() === ``) return edit;
  const head = before.trim() === `` ? `` : `${before.trimEnd()}\n\n`;
  const tail = after.trim() === `` ? `` : `\n\n${after.trimStart()}`;
  return { from: lineStart, to: lineEnd, insert: `${head}${edit.insert}${tail}` };
}

// Figures nommees d'une note, avec leur numero : celles que l'export legende « Figure N : Nom ». Les figures sans nom n'y sont pas.
export interface FigureLine {
  // Numero de ligne (a partir de 0) et cible de la figure.
  line: number;
  target: string;
  caption: string;
  number: number;
  // Legende complete, dans la langue de la note : « Figure 3 : Nom » (« Figure 3: Name » en anglais).
  text: string;
  // Partie en gras de la legende : « Figure 3 ».
  label: string;
}

const WIKI_FIGURE = /^!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\](?:[ \t]+\^[A-Za-z0-9-]+)?[ \t]*$/;
const MD_FIGURE = /^!\[([^\]]*)\]\(([^)]+)\)(?:[ \t]+\^[A-Za-z0-9-]+)?[ \t]*$/;

// Cible et nom d'une ligne de figure, ou null si la ligne n'en est pas une (la taille |400 n'est pas un nom).
export function parseFigureLine(line: string): { target: string; caption: string } | null {
  const wiki = WIKI_FIGURE.exec(line);
  const md = wiki ? null : MD_FIGURE.exec(line);
  if (!wiki && !md) return null;
  const parts = (wiki ? (wiki[2] ?? ``) : md![1]).split(`|`).map((x) => x.trim());
  if (parts.length > 0 && /^\d+(x\d+)?$/.test(parts[parts.length - 1])) parts.pop();
  return { target: wiki ? wiki[1].trim() : md![2].trim(), caption: parts.join(`|`).trim() };
}

export function figureLines(text: string): FigureLine[] {
  const english = /^---[ \t]*\r?\n(?:[^\n]*\r?\n)*?lang:[ \t]*["']?en/i.test(text);
  const out: FigureLine[] = [];
  let fence: string | null = null;
  let n = 0;
  text.split(`\n`).forEach((raw, i) => {
    const line = raw.replace(/\r$/, ``);
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const fig = parseFigureLine(line);
    if (!fig || fig.caption === `` || mediaKindOf(fig.target) !== undefined || !(isImageTarget(fig.target) || isWebTarget(fig.target))) return;
    n++;
    const label = english ? `Figure ${n}` : `Figure ${n}`;
    out.push({ line: i, target: fig.target, caption: fig.caption, number: n, label, text: english ? `${label}: ${fig.caption}` : `${label}\u00a0: ${fig.caption}` });
  });
  return out;
}

// Legendes de tableaux nommes d'une note, avec leur numero : la ligne « Tableau : Nom » placee au-dessus d'un tableau (comme l'export,
// les lignes vides et la ligne de style du tableau peuvent s'intercaler). Les tableaux sans nom ne sont pas numerotes.
export interface TableCaptionLine {
  line: number;
  // Decalage, dans la ligne, de la fin du mot « Tableau » ou « Table » : c'est la que s'affiche le numero.
  wordEnd: number;
  number: number;
}

const TABLE_CAPTION = /^(Tableau|Table)[ \t\u00a0]*:[ \t\u00a0]*(.+)$/i;
const TABLE_MARKER = /^%%[ \t]*mmw-table\b.*%%[ \t]*$/;
const TABLE_ROW = /^[ \t]*\|.*\|[ \t]*$/;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;

export function tableCaptionLines(text: string): TableCaptionLine[] {
  const lines = text.split(`\n`).map((l) => l.replace(/\r$/, ``));
  const out: TableCaptionLine[] = [];
  let fence: string | null = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    // Debut d'un tableau : une ligne de cellules suivie de la ligne de separation.
    if (!TABLE_ROW.test(line) || i + 1 >= lines.length || !TABLE_SEPARATOR.test(lines[i + 1]) || !lines[i + 1].includes(`-`)) continue;
    if (i > 0 && TABLE_ROW.test(lines[i - 1])) continue;
    let j = i - 1;
    while (j >= 0 && (lines[j].trim() === `` || TABLE_MARKER.test(lines[j].trim()))) j--;
    if (j < 0) continue;
    const m = TABLE_CAPTION.exec(lines[j].trim());
    if (!m) continue;
    // La legende est un paragraphe a elle seule : la ligne qui la precede est vide, un repere de style ou un titre.
    let k = j - 1;
    while (k >= 0 && TABLE_MARKER.test(lines[k].trim())) k--;
    if (k >= 0 && lines[k].trim() !== `` && !/^#{1,6}[ \t]/.test(lines[k]) && !/^---[ \t]*$/.test(lines[k])) continue;
    n++;
    out.push({ line: j, wordEnd: lines[j].indexOf(m[1]) + m[1].length, number: n });
  }
  return out;
}

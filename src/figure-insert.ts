// Figures et dessins ecrits dans la note : ![[cible|Nom]]. Le nom devient la legende « Figure N : Nom » a l'export ; sans nom, la figure
// n'a ni legende ni numero. Ce module ne depend pas d'Obsidian.

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

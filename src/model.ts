// Modele de donnees de la note : analyse d'un fichier Markdown en arbre de noeuds
// et reconstruction du fichier a partir de cet arbre, sans perte de contenu.
import { formatMetaLine, isEmptyMeta, MmMeta, parseMetaLine } from "./style";

export interface MmNode {
  // Niveau du titre Markdown (1 a 6). La racine (le nom de la note) a le niveau 0.
  level: number;
  title: string;
  // Ligne de titre d'origine, terminateur de ligne compris. Vaut null si le titre
  // a ete modifie : la ligne est alors regeneree a partir du niveau et du titre.
  heading: string | null;
  // Texte situe sous le titre, tel qu'il figure dans le fichier.
  body: string;
  children: MmNode[];
  // Position dans le fichier (numeros de ligne a partir de 0) : ligne du titre et ligne qui suit la fin du texte.
  // Pour la racine, `line` est la premiere ligne apres les proprietes.
  line?: number;
  endLine?: number;
  // Commentaire de style place juste sous le titre, et numero de sa ligne dans le fichier.
  meta?: MmMeta;
  metaLine?: number;
}

export interface MmDoc {
  frontmatter: string;
  // La racine est toujours le nom de la note : elle n'a pas de titre dans le fichier. Tous les titres Markdown,
  // y compris un titre de niveau 1 unique, sont des chapitres.
  root: MmNode;
  eol: string;
}

export interface MmStats {
  nodeCount: number;
  maxDepth: number;
  skippedLevels: number;
  emptyTitles: number;
}

const HEADING_RE = /^(#{1,6})(?:[ \t]+([^\r\n]*))?$/;
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

interface Fence {
  ch: string;
  len: number;
}

interface InlineState {
  percent: boolean;
  html: boolean;
  math: boolean;
}

export function splitLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < text.length) {
    const i = text.indexOf(`\n`, start);
    if (i === -1) {
      lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, i + 1));
    start = i + 1;
  }
  return lines;
}

function stripEol(line: string): string {
  return line.replace(/(\r\n|\n|\r)$/, ``);
}

// Fait evoluer l'etat "on est dans un commentaire ou une formule" en lisant une ligne.
function scanInline(s: string, st: InlineState): void {
  let i = 0;
  for (;;) {
    if (st.percent) {
      const k = s.indexOf(`%%`, i);
      if (k === -1) return;
      st.percent = false;
      i = k + 2;
    } else if (st.html) {
      const k = s.indexOf(`-->`, i);
      if (k === -1) return;
      st.html = false;
      i = k + 3;
    } else if (st.math) {
      const k = s.indexOf(`$$`, i);
      if (k === -1) return;
      st.math = false;
      i = k + 2;
    } else {
      const p = s.indexOf(`%%`, i);
      const h = s.indexOf(`<!--`, i);
      const m = s.indexOf(`$$`, i);
      const found = [
        { k: p, flag: `percent` as const, len: 2 },
        { k: h, flag: `html` as const, len: 4 },
        { k: m, flag: `math` as const, len: 2 },
      ].filter((c) => c.k !== -1);
      if (found.length === 0) return;
      found.sort((a, b) => a.k - b.k);
      const first = found[0];
      st[first.flag] = true;
      i = first.k + first.len;
    }
  }
}

// Repere les lignes qui sont de vrais titres : hors blocs de code, commentaires et formules.
function findHeadings(lines: string[]): (RegExpExecArray | null)[] {
  const result: (RegExpExecArray | null)[] = [];
  let fence: Fence | null = null;
  const st: InlineState = { percent: false, html: false, math: false };
  for (const line of lines) {
    const s = stripEol(line);
    if (fence) {
      const c = FENCE_CLOSE_RE.exec(s);
      if (c && c[1][0] === fence.ch && c[1].length >= fence.len) fence = null;
      result.push(null);
      continue;
    }
    if (st.percent || st.html || st.math) {
      scanInline(s, st);
      result.push(null);
      continue;
    }
    const o = FENCE_OPEN_RE.exec(s);
    if (o && !(o[1][0] === `\`` && o[2].includes(`\``))) {
      fence = { ch: o[1][0], len: o[1].length };
      result.push(null);
      continue;
    }
    result.push(HEADING_RE.exec(s));
    scanInline(s, st);
  }
  return result;
}

function extractFrontmatter(lines: string[]): number {
  if (lines.length === 0 || stripEol(lines[0]) !== `---`) return 0;
  for (let j = 1; j < lines.length; j++) {
    const s = stripEol(lines[j]);
    if (s === `---` || s === `...`) return j + 1;
  }
  return 0;
}

export function renderHeading(level: number, title: string, eol: string): string {
  const hashes = `#`.repeat(level);
  return (title ? `${hashes} ${title}` : hashes) + eol;
}

export interface ParseOptions {
  // Faux pour analyser un simple morceau de texte, sans chercher de proprietes YAML au debut.
  frontmatter?: boolean;
}

export function parseNote(text: string, fileName: string, opts: ParseOptions = {}): MmDoc {
  const eol = text.includes(`\r\n`) ? `\r\n` : `\n`;
  const allLines = splitLines(text);
  const fmCount = opts.frontmatter === false ? 0 : extractFrontmatter(allLines);
  const frontmatter = allLines.slice(0, fmCount).join(``);
  const lines = allLines.slice(fmCount);
  const matches = findHeadings(lines);

  const headingIdx: number[] = [];
  matches.forEach((m, i) => {
    if (m) headingIdx.push(i);
  });

  const firstHeading = headingIdx.length > 0 ? headingIdx[0] : lines.length;
  const introText = lines.slice(0, firstHeading).join(``);

  const nodes: MmNode[] = headingIdx.map((idx, n) => {
    const end = n + 1 < headingIdx.length ? headingIdx[n + 1] : lines.length;
    const m = matches[idx]!;
    const found = idx + 1 < end ? parseMetaLine(lines[idx + 1]) : null;
    return {
      level: m[1].length,
      title: (m[2] ?? ``).trim(),
      heading: lines[idx],
      body: lines.slice(idx + 1, end).join(``),
      children: [],
      line: fmCount + idx,
      endLine: fmCount + end,
      ...(found ? { meta: found, metaLine: fmCount + idx + 1 } : {}),
    };
  });

  const found = firstHeading > 0 ? parseMetaLine(lines[0]) : null;
  const root: MmNode = {
    level: 0,
    title: fileName.replace(/\.md$/i, ``),
    heading: null,
    body: introText,
    children: [],
    line: fmCount,
    endLine: fmCount + firstHeading,
    ...(found ? { meta: found, metaLine: fmCount } : {}),
  };

  const stack: MmNode[] = [root];
  for (const node of nodes) {
    while (stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return { frontmatter, root, eol };
}

function pushPiece(out: string[], piece: string, eol: string): void {
  if (piece === ``) return;
  if (out.length > 0) {
    const last = out[out.length - 1];
    if (!last.endsWith(`\n`) && !last.endsWith(`\r`)) out[out.length - 1] = last + eol;
  }
  out.push(piece);
}

function emitNode(node: MmNode, out: string[], eol: string): void {
  if (node.heading !== null) {
    pushPiece(out, node.heading, eol);
  } else if (node.level > 0) {
    pushPiece(out, renderHeading(node.level, node.title, eol), eol);
  }
  pushPiece(out, node.body, eol);
  for (const child of node.children) emitNode(child, out, eol);
}

export function serializeNote(doc: MmDoc): string {
  const out: string[] = [];
  pushPiece(out, doc.frontmatter, doc.eol);
  emitNode(doc.root, out, doc.eol);
  return out.join(``);
}

// Modification du titre d'un noeud : la ligne de titre sera regeneree a la reconstruction.
export function renameNode(node: MmNode, title: string): void {
  node.title = title;
  node.heading = null;
}

export function computeStats(doc: MmDoc): MmStats {
  const stats: MmStats = { nodeCount: 0, maxDepth: 0, skippedLevels: 0, emptyTitles: 0 };
  const walk = (node: MmNode, depth: number): void => {
    for (const child of node.children) {
      stats.nodeCount++;
      stats.maxDepth = Math.max(stats.maxDepth, depth + 1);
      if (child.level > node.level + 1) stats.skippedLevels++;
      if (child.title === ``) stats.emptyTitles++;
      walk(child, depth + 1);
    }
  };
  walk(doc.root, 0);
  return stats;
}

// Section d'un texte : un titre (absent pour le texte place avant le premier titre) et le texte qui le suit.
export interface Section {
  heading: string | null;
  level: number;
  title: string;
  body: string;
}

// Decoupe un texte en sections, dans l'ordre du document, avec les memes regles de detection des titres.
export function splitSections(text: string): Section[] {
  const lines = splitLines(text);
  const matches = findHeadings(lines);
  const out: Section[] = [];
  let cur: Section = { heading: null, level: 0, title: ``, body: `` };
  let buf: string[] = [];
  lines.forEach((line, i) => {
    const m = matches[i];
    if (m) {
      cur.body = buf.join(``);
      out.push(cur);
      cur = { heading: line, level: m[1].length, title: (m[2] ?? ``).trim(), body: `` };
      buf = [];
    } else {
      buf.push(line);
    }
  });
  cur.body = buf.join(``);
  out.push(cur);
  return out;
}

// Retrouve un noeud a partir de sa cle : `r` pour la racine, `r.2.0` pour le premier enfant du troisieme noeud.
export function nodeByKey(doc: MmDoc, key: string): MmNode | null {
  const parts = key.split(`.`);
  if (parts[0] !== `r`) return null;
  let node: MmNode = doc.root;
  for (let i = 1; i < parts.length; i++) {
    const child = node.children[Number(parts[i])];
    if (!child) return null;
    node = child;
  }
  return node;
}

// Tous les noeuds dans l'ordre du document (racine comprise), avec leur cle.
export function flattenDoc(doc: MmDoc): { key: string; node: MmNode }[] {
  const out: { key: string; node: MmNode }[] = [];
  const walk = (node: MmNode, key: string): void => {
    out.push({ key, node });
    node.children.forEach((c, i) => walk(c, `${key}.${i}`));
  };
  walk(doc.root, `r`);
  return out;
}

// Titres de la racine jusqu'au noeud, pour afficher le chemin.
export function pathTitles(doc: MmDoc, key: string): string[] {
  const parts = key.split(`.`);
  const titles: string[] = [];
  let node: MmNode | undefined = doc.root;
  titles.push(node.title);
  for (let i = 1; i < parts.length && node; i++) {
    node = node.children[Number(parts[i])];
    if (node) titles.push(node.title === `` ? `(sans titre)` : node.title);
  }
  return titles;
}

// Le texte d'un noeud est affiche sans les lignes vides qui l'entourent, qui sont conservees a part.
export interface BodyParts {
  lead: string;
  core: string;
  trail: string;
}

export function splitBody(body: string): BodyParts {
  const lead = /^(?:[ \t]*\r?\n)*/.exec(body)![0];
  const rest = body.slice(lead.length);
  const trail = /(?:\r?\n[ \t]*)*$/.exec(rest)![0];
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

export function joinBody(parts: BodyParts, core: string): string {
  return parts.lead + core + parts.trail;
}

// Position du curseur dans un texte contenant des titres : numero de la section qui le contient
// (0 pour le texte avant le premier titre) et position dans le texte affiche de cette section.
export function locateInSections(text: string, cursor: number): { count: number; index: number; offset: number } {
  const sections = splitSections(text);
  const starts: number[] = [];
  let acc = 0;
  for (const sec of sections) {
    starts.push(acc);
    acc += (sec.heading?.length ?? 0) + sec.body.length;
  }
  let index = 0;
  starts.forEach((start, i) => {
    if (cursor >= start) index = i;
  });
  const sec = sections[index];
  const lead = splitBody(sec.body).lead.length;
  const offset = Math.max(0, cursor - starts[index] - (sec.heading?.length ?? 0) - lead);
  return { count: sections.length, index, offset };
}

// Noeud dont le texte contient une ligne du fichier (numero a partir de 0), avec sa cle.
export function nodeAtLine(doc: MmDoc, line: number): { key: string; node: MmNode } {
  const flat = flattenDoc(doc);
  for (const entry of flat) {
    const n = entry.node;
    if (n.line !== undefined && n.endLine !== undefined && line >= n.line && line < n.endLine) return entry;
  }
  return line < (doc.root.line ?? 0) ? flat[0] : flat[flat.length - 1];
}

// Derniere ligne (exclue) du noeud et de toute sa descendance.
export function branchEnd(node: MmNode): number {
  let n = node;
  while (n.children.length > 0) n = n.children[n.children.length - 1];
  return n.endLine ?? node.endLine ?? 0;
}

// Lignes du chapitre actif : le noeud et ses sous-titres. Le noeud racine fait exception : seule son
// introduction est active, les proprietes du debut de la note y sont comprises.
export function activeLines(doc: MmDoc, key: string, includeSubtitles: boolean): { startLine: number; endLine: number } | null {
  const node = nodeByKey(doc, key);
  if (!node || node.line === undefined || node.endLine === undefined) return null;
  if (node === doc.root) return { startLine: 0, endLine: node.endLine };
  return { startLine: node.line, endLine: includeSubtitles ? branchEnd(node) : node.endLine };
}

// Modification d'une ligne du fichier : inserer, remplacer ou supprimer la ligne numero `line` (a partir de 0).
export interface LineEdit {
  kind: `insert` | `replace` | `delete`;
  line: number;
  text: string;
}

// Modification a faire pour donner a un noeud le commentaire de style voulu (null : le retirer).
export function planMetaEdit(doc: MmDoc, key: string, meta: MmMeta | null): LineEdit | null {
  const node = nodeByKey(doc, key);
  if (!node || node.line === undefined) return null;
  const has = node.metaLine !== undefined;
  if (!meta || isEmptyMeta(meta)) return has ? { kind: `delete`, line: node.metaLine!, text: `` } : null;
  const text = formatMetaLine(meta);
  if (has) return { kind: `replace`, line: node.metaLine!, text };
  // Le noeud racine sans titre n'a pas de ligne de titre : le commentaire va en tete du texte.
  const at = node === doc.root ? node.line : node.line + 1;
  return { kind: `insert`, line: at, text };
}

// Applique des modifications de ligne a un texte (les numeros de ligne sont ceux du texte d'origine).
export function applyLineEdits(text: string, edits: LineEdit[], eol: string): string {
  const lines = splitLines(text);
  const sorted = [...edits].sort((a, b) => b.line - a.line);
  for (const e of sorted) {
    if (e.kind === `delete`) {
      lines.splice(e.line, 1);
    } else if (e.kind === `replace`) {
      const old = lines[e.line] ?? ``;
      const ending = /(\r\n|\n|\r)$/.exec(old)?.[0] ?? ``;
      lines[e.line] = e.text + ending;
    } else {
      if (e.line >= lines.length) {
        if (lines.length > 0 && !/[\r\n]$/.test(lines[lines.length - 1])) lines[lines.length - 1] += eol;
        lines.push(e.text + eol);
      } else {
        lines.splice(e.line, 0, e.text + eol);
      }
    }
  }
  return lines.join(``);
}

// Vrai si le titre est masque, lui-meme ou par l'un de ses parents.
export function isHiddenKey(doc: MmDoc, key: string): boolean {
  let node: MmNode = doc.root;
  const parts = key === `r` ? [] : key.split(`.`).slice(1);
  for (const p of parts) {
    if (node.meta?.hidden && node !== doc.root) return true;
    const child = node.children[Number(p)];
    if (!child) return false;
    node = child;
  }
  return node !== doc.root && !!node.meta?.hidden;
}

// Plages de lignes (numeros a partir de 0, fin comprise) des titres masques, sous-titres compris.
// Un titre masque dont un parent l'est aussi est deja compris dans la plage du parent.
export function hiddenLineRanges(doc: MmDoc): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const lastLine = (n: MmNode): number => (n.children.length > 0 ? lastLine(n.children[n.children.length - 1]) : (n.endLine ?? 1) - 1);
  const walk = (n: MmNode): void => {
    for (const c of n.children) {
      if (c.meta?.hidden && c.line !== undefined) out.push({ start: c.line, end: Math.max(c.line, lastLine(c)) });
      else walk(c);
    }
  };
  walk(doc.root);
  return out;
}

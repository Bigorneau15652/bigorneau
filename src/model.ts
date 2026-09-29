// Modele de donnees de la note : analyse d'un fichier Markdown en arbre de noeuds
// et reconstruction du fichier a partir de cet arbre, sans perte de contenu.

export interface MmNode {
  // Niveau du titre Markdown (1 a 6). Le noeud racine sans titre general a le niveau 0.
  level: number;
  title: string;
  // Ligne de titre d'origine, terminateur de ligne compris. Vaut null si le titre
  // a ete modifie : la ligne est alors regeneree a partir du niveau et du titre.
  heading: string | null;
  // Texte situe sous le titre, tel qu'il figure dans le fichier.
  body: string;
  children: MmNode[];
}

export interface MmDoc {
  frontmatter: string;
  // Texte place entre les proprietes et le titre general (uniquement si un titre general existe).
  preamble: string;
  root: MmNode;
  hasGeneralTitle: boolean;
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

function splitLines(text: string): string[] {
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

export function parseNote(text: string, fileName: string): MmDoc {
  const eol = text.includes(`\r\n`) ? `\r\n` : `\n`;
  const allLines = splitLines(text);
  const fmCount = extractFrontmatter(allLines);
  const frontmatter = allLines.slice(0, fmCount).join(``);
  const lines = allLines.slice(fmCount);
  const matches = findHeadings(lines);

  const headingIdx: number[] = [];
  matches.forEach((m, i) => {
    if (m) headingIdx.push(i);
  });

  const h1Count = headingIdx.filter((i) => matches[i]![1].length === 1).length;
  const hasGeneralTitle =
    headingIdx.length > 0 && h1Count === 1 && matches[headingIdx[0]]![1].length === 1;

  const firstHeading = headingIdx.length > 0 ? headingIdx[0] : lines.length;
  const introText = lines.slice(0, firstHeading).join(``);

  const nodes: MmNode[] = headingIdx.map((idx, n) => {
    const end = n + 1 < headingIdx.length ? headingIdx[n + 1] : lines.length;
    const m = matches[idx]!;
    return {
      level: m[1].length,
      title: (m[2] ?? ``).trim(),
      heading: lines[idx],
      body: lines.slice(idx + 1, end).join(``),
      children: [],
    };
  });

  let root: MmNode;
  let preamble = ``;
  let rest: MmNode[];
  if (hasGeneralTitle) {
    root = nodes[0];
    preamble = introText;
    rest = nodes.slice(1);
  } else {
    root = {
      level: 0,
      title: fileName.replace(/\.md$/i, ``),
      heading: null,
      body: introText,
      children: [],
    };
    rest = nodes;
  }

  const stack: MmNode[] = [root];
  for (const node of rest) {
    while (stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return { frontmatter, preamble, root, hasGeneralTitle, eol };
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
  pushPiece(out, doc.preamble, doc.eol);
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

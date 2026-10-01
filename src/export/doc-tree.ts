// Export de haute qualite, etage 1 : extraction de la structure du document.
// A partir du texte d'une note, produit un arbre neutre (titres, paragraphes, listes, citations, code, tableaux, figures)
// sans aucune information de mise en page. Les commentaires du plugin (%% ... %%) n'y apparaissent jamais.
// Ce module ne depend pas d'Obsidian : il se teste avec node --test.
import { MmNode, parseNote, splitLines } from "../model";

export interface DocListItem {
  text: string;
  // Profondeur d'imbrication : 0 pour le premier niveau.
  depth: number;
}

export type DocBlock =
  | { type: `paragraph`; text: string }
  | { type: `list`; ordered: boolean; items: DocListItem[] }
  | { type: `quote`; text: string }
  | { type: `code`; lang: string; text: string }
  | { type: `table`; rows: string[][] }
  | { type: `figure`; target: string; caption: string };

export interface DocSection {
  level: number;
  title: string;
  blocks: DocBlock[];
  sections: DocSection[];
}

export interface ExportDoc {
  // Nom de la note.
  title: string;
  // Langue indiquee par la propriete lang (ou langue, language) en en-tete de la note, par exemple fr ou en-GB.
  language?: string;
  // Texte place avant le premier titre.
  blocks: DocBlock[];
  sections: DocSection[];
  // Texte des notes de bas de page, par identifiant. Les definitions sont reprises de toute la note, y compris des chapitres
  // masques : un appel d'un chapitre exporte peut renvoyer a une definition ecrite ailleurs.
  footnotes: Record<string, string>;
}

export interface ExtractOptions {
  // Par defaut, les titres masques (et leurs sous-titres) et les sujets flottants ne sont pas exportes.
  includeHidden?: boolean;
  includeFloats?: boolean;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const LIST_RE = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/;
const RULE_RE = /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^[ \t]*>[ \t]?(.*)$/;
const TABLE_SEP_RE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const WIKI_FIGURE_RE = /^!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\][ \t]*$/;
const MD_FIGURE_RE = /^!\[([^\]]*)\]\(([^)]+)\)[ \t]*$/;

const stripEol = (s: string): string => s.replace(/(\r\n|\n|\r)$/, ``);

// Ouvre-t-on un bloc de code avec cette ligne ?
function fenceOpen(line: string): { ch: string; len: number } | null {
  const o = FENCE_RE.exec(line);
  if (!o || (o[1][0] === `\`` && o[2].includes(`\``))) return null;
  return { ch: o[1][0], len: o[1].length };
}

function fenceCloses(line: string, fence: { ch: string; len: number }): boolean {
  const c = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!c && c[1][0] === fence.ch && c[1].length >= fence.len;
}

// Retire les commentaires %% ... %% (sur une ou plusieurs lignes), hors blocs de code. Une ligne qui ne contenait
// qu'un commentaire disparait entierement, pour ne pas creer de saut de paragraphe.
export function stripComments(text: string): string {
  const out: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  let inComment = false;
  for (const raw of splitLines(text)) {
    const line = stripEol(raw);
    if (!inComment) {
      if (fence) {
        out.push(line);
        if (fenceCloses(line, fence)) fence = null;
        continue;
      }
      const opened = fenceOpen(line);
      if (opened) {
        fence = opened;
        out.push(line);
        continue;
      }
    }
    let result = ``;
    let hadComment = inComment;
    let i = 0;
    while (i < line.length) {
      const k = line.indexOf(`%%`, i);
      if (inComment) {
        if (k === -1) {
          i = line.length;
        } else {
          inComment = false;
          i = k + 2;
        }
      } else if (k === -1) {
        result += line.slice(i);
        i = line.length;
      } else {
        result += line.slice(i, k);
        inComment = true;
        hadComment = true;
        i = k + 2;
      }
    }
    if (hadComment && result.trim() === ``) continue;
    out.push(result);
  }
  return out.join(`\n`);
}

// Appel de note de bas de page : [^id] dans le texte, ou ^[texte] ecrit directement dans la phrase.
export const FOOTNOTE_CALL_RE = /\[\^([^\]\s]+)\]|\^\[([^\]]*)\]/g;
const FOOTNOTE_DEF_RE = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;

// Separe les definitions de notes de bas de page ([^id]: texte, avec suite indentee) du reste du texte. Le texte a deja
// perdu ses commentaires.
export function splitFootnoteDefinitions(text: string): { text: string; defs: Record<string, string> } {
  const out: string[] = [];
  const defs: Record<string, string> = {};
  let fence: { ch: string; len: number } | null = null;
  let cur: { id: string; parts: string[] } | null = null;
  let blank = false;
  const finish = (): void => {
    if (cur && !(cur.id in defs)) defs[cur.id] = cur.parts.filter((p) => p !== ``).join(` `);
    cur = null;
  };
  for (const line of text.split(`\n`)) {
    if (fence) {
      out.push(line);
      if (fenceCloses(line, fence)) fence = null;
      continue;
    }
    if (cur) {
      if (/^[ \t]+\S/.test(line)) {
        cur.parts.push(line.trim());
        blank = false;
        continue;
      }
      if (line.trim() === ``) {
        blank = true;
        continue;
      }
      finish();
      if (blank) out.push(``);
      blank = false;
    }
    const m = FOOTNOTE_DEF_RE.exec(line);
    if (m) {
      cur = { id: m[1], parts: [m[2].trim()] };
      continue;
    }
    const opened = fenceOpen(line);
    if (opened) fence = opened;
    out.push(line);
  }
  finish();
  return { text: out.join(`\n`), defs };
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith(`|`)) s = s.slice(1);
  if (s.endsWith(`|`)) s = s.slice(0, -1);
  return s.split(`|`).map((c) => c.trim());
}

function indentWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch === `\t` ? 4 : 1;
  return w;
}

// Decoupe le texte situe sous un titre en blocs.
export function parseBlocks(text: string): DocBlock[] {
  const lines = splitFootnoteDefinitions(stripComments(text)).text.split(`\n`);
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  const flushPara = (): void => {
    if (para.length > 0) blocks.push({ type: `paragraph`, text: para.join(` `) });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === ``) {
      flushPara();
      i++;
      continue;
    }

    const fence = fenceOpen(line);
    if (fence) {
      flushPara();
      const lang = (FENCE_RE.exec(line)![2] ?? ``).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !fenceCloses(lines[i], fence)) body.push(lines[i++]);
      i++;
      blocks.push({ type: `code`, lang, text: body.join(`\n`) });
      continue;
    }

    if (RULE_RE.test(line)) {
      flushPara();
      i++;
      continue;
    }

    const wiki = WIKI_FIGURE_RE.exec(line);
    const md = wiki ? null : MD_FIGURE_RE.exec(line);
    if (wiki || md) {
      flushPara();
      if (wiki) {
        // Dans [[image.png|400]], le texte apres la barre est une taille et non une legende.
        const alias = wiki[2] ?? ``;
        blocks.push({ type: `figure`, target: wiki[1].trim(), caption: /^\d+(x\d+)?$/.test(alias.trim()) ? `` : alias.trim() });
      } else {
        blocks.push({ type: `figure`, target: md![2].trim(), caption: md![1].trim() });
      }
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      flushPara();
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) body.push(QUOTE_RE.exec(lines[i++])![1]);
      blocks.push({ type: `quote`, text: body.join(`\n`).trim() });
      continue;
    }

    if (line.trim().startsWith(`|`)) {
      flushPara();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith(`|`)) {
        if (!TABLE_SEP_RE.test(lines[i])) {
          const cells = splitRow(lines[i]);
          // Une ligne dont toutes les cellules sont vides n'apporte rien a l'export.
          if (cells.some((c) => c !== ``)) rows.push(cells);
        }
        i++;
      }
      blocks.push({ type: `table`, rows });
      continue;
    }

    if (LIST_RE.test(line)) {
      flushPara();
      const first = LIST_RE.exec(line)!;
      const items: DocListItem[] = [];
      const indents: number[] = [];
      while (i < lines.length && lines[i].trim() !== ``) {
        const m = LIST_RE.exec(lines[i]);
        if (m && !RULE_RE.test(lines[i])) {
          const w = indentWidth(m[1]);
          while (indents.length > 0 && indents[indents.length - 1] > w) indents.pop();
          if (indents.length === 0 || indents[indents.length - 1] < w) indents.push(w);
          items.push({ text: m[3].trim(), depth: indents.length - 1 });
        } else if (/^[ \t]/.test(lines[i]) && items.length > 0) {
          // Suite d'un element de liste sur la ligne suivante.
          items[items.length - 1].text += ` ` + lines[i].trim();
        } else {
          break;
        }
        i++;
      }
      blocks.push({ type: `list`, ordered: /^\d/.test(first[2]), items });
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return blocks;
}

// Transforme le Markdown d'une ligne en texte brut : liens, accentuations et code en ligne perdent leurs signes.
// Provisoire : les styles (gras, italique) seront conserves par les etages suivants.
export function inlineToPlain(text: string): string {
  return text
    .replace(/!\[\[[^\]]*\]\]/g, ``)
    .replace(/\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (_m, file: string, heading: string | undefined, alias: string | undefined) => {
      if (alias) return alias;
      if (heading) return heading;
      return file.split(`/`).pop() ?? file;
    })
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, `$1`)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, `$1`)
    .replace(/`([^`]*)`/g, `$1`)
    .replace(/\*\*([^*]+)\*\*/g, `$1`)
    .replace(/__([^_]+)__/g, `$1`)
    .replace(/~~([^~]+)~~/g, `$1`)
    .replace(/==([^=]+)==/g, `$1`)
    .replace(/\*([^*\s][^*]*)\*/g, `$1`)
    .replace(/(?<![\w])_([^_]+)_(?![\w])/g, `$1`);
}

function buildSection(node: MmNode, opts: ExtractOptions): DocSection {
  return {
    level: node.level,
    title: node.title,
    blocks: parseBlocks(node.body),
    sections: visibleChildren(node, opts),
  };
}

function visibleChildren(node: MmNode, opts: ExtractOptions): DocSection[] {
  return node.children.filter((c) => opts.includeHidden || !c.meta?.hidden).map((c) => buildSection(c, opts));
}

// Construit l'arbre du document a partir du texte de la note, dans l'ordre de ses titres.
export function buildExportDoc(text: string, fileName: string, opts: ExtractOptions = {}): ExportDoc {
  const doc = parseNote(text, fileName);
  const sections = visibleChildren(doc.root, opts);
  if (opts.includeFloats) {
    for (const f of doc.floats) if (opts.includeHidden || !f.meta?.hidden) sections.push(buildSection(f, opts));
  }
  const footnotes: Record<string, string> = {};
  const collect = (n: MmNode): void => {
    for (const [id, text] of Object.entries(splitFootnoteDefinitions(stripComments(n.body)).defs)) if (!(id in footnotes)) footnotes[id] = text;
    n.children.forEach(collect);
  };
  collect(doc.root);
  doc.floats.forEach(collect);
  const lang = /^(?:lang|langue|language)[ \t]*:[ \t]*[\x22\x27\x60]?([A-Za-z]{2}(?:-[A-Za-z]+)?)/m.exec(doc.frontmatter);
  return { title: doc.root.title, ...(lang ? { language: lang[1] } : {}), blocks: parseBlocks(doc.root.body), sections, footnotes };
}

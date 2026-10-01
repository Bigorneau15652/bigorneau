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

// Alignement d'une colonne de tableau, d'apres la ligne de separation (:--- gauche, :---: centre, ---: droite).
export type ColumnAlign = `left` | `center` | `right`;

// `id` : identifiant de bloc Obsidian (^identifiant a la fin du bloc), qui permet de renvoyer au bloc.
export type DocBlock =
  | { type: `paragraph`; text: string; id?: string }
  | { type: `list`; ordered: boolean; items: DocListItem[] }
  | { type: `quote`; text: string; id?: string }
  | { type: `code`; lang: string; text: string }
  // La premiere ligne est l'en-tete. `caption` : texte de la ligne « Tableau : ... » placee juste au-dessus.
  | { type: `table`; rows: string[][]; align: ColumnAlign[]; caption?: string; id?: string }
  // `width` : largeur demandee en pixels (![[image.png|400]]).
  | { type: `figure`; target: string; caption: string; width?: number; id?: string };

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
  // Auteur indique par la propriete author (ou auteur) en en-tete de la note.
  author?: string;
  // Table des matieres demandee par la propriete toc: true (toc-depth: n limite les niveaux, 3 par defaut).
  toc?: { depth: number };
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
const WIKI_FIGURE_RE = /^!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\](?:[ \t]+\^([A-Za-z0-9-]+))?[ \t]*$/;
const MD_FIGURE_RE = /^!\[([^\]]*)\]\(([^)]+)\)(?:[ \t]+\^([A-Za-z0-9-]+))?[ \t]*$/;
// Identifiant de bloc Obsidian a la fin d'une ligne : « texte ^identifiant ».
const BLOCK_ID_RE = /[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
const BLOCK_ID_LINE_RE = /^\^([A-Za-z0-9-]+)[ \t]*$/;
const TABLE_CAPTION_RE = /^(?:Tableau|Table)[ \t\u00a0]*:[ \t\u00a0]*(.+)$/i;

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
    if (para.length > 0) {
      const text = para.join(` `);
      const m = BLOCK_ID_RE.exec(text);
      blocks.push(m ? { type: `paragraph`, text: text.slice(0, m.index), id: m[1] } : { type: `paragraph`, text });
    }
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
      // Le texte apres la barre est une legende, une taille (400 ou 400x300) ou les deux : [[image.png|Legende|400]].
      const parts = (wiki ? wiki[2] ?? `` : md![1]).split(`|`).map((x) => x.trim());
      let width: number | undefined;
      const last = parts[parts.length - 1];
      if (parts.length > 0 && /^\d+(x\d+)?$/.test(last)) {
        width = Number(last.split(`x`)[0]);
        parts.pop();
      }
      const caption = (wiki ? parts.join(`|`) : parts.join(`|`)).trim();
      const target = wiki ? wiki[1].trim() : md![2].trim();
      const id = wiki ? wiki[3] : md![3];
      blocks.push({ type: `figure`, target, caption, ...(width ? { width } : {}), ...(id ? { id } : {}) });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      flushPara();
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) body.push(QUOTE_RE.exec(lines[i++])![1]);
      const quoteText = body.join(`\n`).trim();
      const q = BLOCK_ID_RE.exec(quoteText);
      blocks.push(q ? { type: `quote`, text: quoteText.slice(0, q.index), id: q[1] } : { type: `quote`, text: quoteText });
      continue;
    }

    if (line.trim().startsWith(`|`)) {
      flushPara();
      const rows: string[][] = [];
      let align: ColumnAlign[] = [];
      while (i < lines.length && lines[i].trim().startsWith(`|`)) {
        if (TABLE_SEP_RE.test(lines[i])) {
          align = splitRow(lines[i]).map((c) => (c.startsWith(`:`) && c.endsWith(`:`) && c.length > 1 ? `center` : c.endsWith(`:`) ? `right` : `left`));
        } else {
          const cells = splitRow(lines[i]);
          // Une ligne dont toutes les cellules sont vides n'apporte rien a l'export.
          if (cells.some((c) => c !== ``)) rows.push(cells);
        }
        i++;
      }
      // Identifiant de bloc ecrit sur la ligne qui suit le tableau, ou apres une ligne vide (c'est ainsi qu'Obsidian l'ecrit).
      let id: string | undefined;
      const idAt = i < lines.length && stripEol(lines[i]).trim() === `` ? i + 1 : i;
      if (idAt < lines.length && BLOCK_ID_LINE_RE.test(stripEol(lines[idAt]))) {
        id = BLOCK_ID_LINE_RE.exec(stripEol(lines[idAt]))![1];
        i = idAt + 1;
      }
      blocks.push({ type: `table`, rows, align, ...(id ? { id } : {}) });
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
  // La ligne « Tableau : legende » placee juste au-dessus d'un tableau devient sa legende.
  const out: DocBlock[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.type === `table` && prev && prev.type === `paragraph`) {
      const m = TABLE_CAPTION_RE.exec(prev.text.trim());
      if (m) {
        out.pop();
        out.push({ ...b, caption: m[1].trim(), ...(prev.id && !b.id ? { id: prev.id } : {}) });
        continue;
      }
    }
    out.push(b);
  }
  return out;
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
  const author = /^(?:author|auteur)[ \t]*:[ \t]*[\x22\x27\x60]?([^\x22\x27\x60\r\n]+?)[\x22\x27\x60]?[ \t]*$/m.exec(doc.frontmatter);
  const toc = /^toc[ \t]*:[ \t]*[\x22\x27]?(true|yes|oui|vrai|1)[\x22\x27]?[ \t]*$/im.test(doc.frontmatter);
  const depth = /^toc-depth[ \t]*:[ \t]*[\x22\x27]?([1-6])[\x22\x27]?[ \t]*$/im.exec(doc.frontmatter);
  return { title: doc.root.title, ...(toc ? { toc: { depth: depth ? Number(depth[1]) : 3 } } : {}), ...(lang ? { language: lang[1] } : {}), ...(author ? { author: author[1].trim() } : {}), blocks: parseBlocks(doc.root.body), sections, footnotes };
}

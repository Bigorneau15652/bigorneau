// Export de haute qualite, etage 1 : extraction de la structure du document.
// A partir du texte d'une note, produit un arbre neutre (titres, paragraphes, listes, citations, code, tableaux, figures)
// sans aucune information de mise en page. Les commentaires du plugin (%% ... %%) n'y apparaissent jamais.
// Ce module ne depend pas d'Obsidian : il se teste avec node --test.
import { listFromSentinel, ListKind, markListMarkers } from "../illustration-list";
import { markPageZones, PageZone, zoneFromSentinel } from "../page-zone";
import { markParagraphMarkers, ParagraphFormat, splitParagraphSentinel } from "../paragraph-format";
import { markTableMarkers, styleFromSentinel, TABLE_MARKER_SENTINEL, TableStyle } from "../table-marker";
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
  // `format` : exception ecrite au debut du paragraphe (%% p: droite %%), voir paragraph-format.ts.
  | { type: `paragraph`; text: string; id?: string; format?: ParagraphFormat }
  | { type: `list`; ordered: boolean; items: DocListItem[] }
  | { type: `quote`; text: string; id?: string }
  | { type: `code`; lang: string; text: string }
  // La premiere ligne est l'en-tete. `caption` : texte de la ligne « Tableau : ... » placee juste au-dessus.
  | { type: `table`; rows: string[][]; align: ColumnAlign[]; caption?: string; id?: string; style?: TableStyle }
  // `width` : largeur demandee en pixels (![[image.png|400]]).
  | { type: `figure`; target: string; caption: string; width?: number; id?: string }
  // Formule en bloc ($$ ... $$), ecrite en TeX.
  | { type: `math`; tex: string; id?: string }
  // Media qui ne se lit pas sur papier (video, son, document, contenu integre) : `target` est un fichier du coffre ou une adresse.
  | { type: `media`; kind: MediaKind; target: string; caption: string; id?: string }
  // Etiquette de zone (%% page: paysage %%) : la feuille change d'orientation a partir d'ici, voir page-zone.ts.
  | { type: `zone`; zone: PageZone }
  // Etiquette de liste (%% liste: figures %%) : la liste des figures ou des tableaux se place ici, voir illustration-list.ts.
  | { type: `illustrations`; kind: ListKind };

export type MediaKind = `video` | `audio` | `document` | `embed`;

export interface DocSection {
  level: number;
  title: string;
  blocks: DocBlock[];
  sections: DocSection[];
}

export interface TocProps {
  enabled?: boolean;
  depth?: number;
}

export interface ExportDoc {
  // Nom de la note.
  title: string;
  // Langue indiquee par la propriete lang (ou langue, language) en en-tete de la note, par exemple fr ou en-GB.
  language?: string;
  // Auteur indique par la propriete author (ou auteur) en en-tete de la note.
  author?: string;
  // Table des matieres generale : proprietes toc (true ou false) et toc-depth (1 a 6) de la note. Une propriete absente laisse la
  // main aux reglages du plugin ; une propriete presente l'emporte sur eux.
  toc?: TocProps;
  // Table des matieres de chaque chapitre : proprietes chapter-toc et chapter-toc-depth.
  chapterToc?: TocProps;
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

const VIDEO_EXT = /\.(mp4|webm|ogv|mov|m4v|mkv)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|oga|flac|aac|opus)$/i;
const VIDEO_HOST = /^https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|dailymotion\.com|dai\.ly)(?:[\/?#:]|$)/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg|bmp|avif|excalidraw(\.md)?)$/i;

// Sorte de media d'une cible de figure ![[...]] ou ![](...), ou undefined si c'est une image.
export function mediaKindOf(target: string): MediaKind | undefined {
  const path = target.split(/[?#]/)[0];
  if (IMAGE_EXT_RE.test(path)) return undefined;
  if (VIDEO_EXT.test(path) || VIDEO_HOST.test(target)) return `video`;
  if (AUDIO_EXT.test(path)) return `audio`;
  if (/\.pdf$/i.test(path)) return `document`;
  if (/^https?:\/\//i.test(target)) return `embed`;
  return undefined;
}

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
  const lines = splitFootnoteDefinitions(stripComments(markTableMarkers(markParagraphMarkers(markListMarkers(markPageZones(text)))))).text.split(`\n`);
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  // Exception d'un repere seul sur sa ligne : elle s'applique au paragraphe suivant.
  let pendingFormat: ParagraphFormat | null = null;
  const flushPara = (): void => {
    if (para.length > 0) {
      const joined = para.join(` `);
      const split = splitParagraphSentinel(joined);
      const format = split.format ?? pendingFormat;
      const text = split.text;
      if (text !== `` || split.format === null) pendingFormat = null;
      if (text === `` && split.format !== null) {
        // Repere seul : il attend le paragraphe suivant.
        pendingFormat = split.format;
      } else {
        const m = BLOCK_ID_RE.exec(text);
        const fmt = format && Object.keys(format).length > 0 ? { format } : {};
        blocks.push(m ? { type: `paragraph`, text: text.slice(0, m.index), id: m[1], ...fmt } : { type: `paragraph`, text, ...fmt });
      }
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

    const listKind = listFromSentinel(line);
    if (listKind) {
      flushPara();
      blocks.push({ type: `illustrations`, kind: listKind });
      i++;
      continue;
    }

    const zone = zoneFromSentinel(line);
    if (zone) {
      flushPara();
      blocks.push({ type: `zone`, zone });
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

    // Formule en bloc : $$ ... $$ sur une ou plusieurs lignes.
    if (line.trim().startsWith(`$$`)) {
      flushPara();
      let body = line.trim().slice(2);
      let end = body.indexOf(`$$`);
      i++;
      while (end < 0 && i < lines.length) {
        body += `\n${lines[i++]}`;
        end = body.indexOf(`$$`);
      }
      const tex = (end < 0 ? body : body.slice(0, end)).trim();
      const rest = end < 0 ? `` : body.slice(end + 2);
      const idm = BLOCK_ID_RE.exec(` ${rest}`);
      if (tex !== ``) blocks.push({ type: `math`, tex, ...(idm ? { id: idm[1] } : {}) });
      continue;
    }

    // Contenu integre en HTML : <iframe>, <video>, <audio>.
    const html = /^\s*<(iframe|video|audio)\b/i.exec(line);
    if (html) {
      flushPara();
      let tag = line;
      i++;
      while (!/>/.test(tag) && i < lines.length) tag += ` ${lines[i++]}`;
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? ``;
      const title = /\btitle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? ``;
      // Le contenu et la balise fermante, s'ils sont sur les lignes suivantes, sont passes.
      const closer = new RegExp(`</${html[1]}>`, `i`);
      if (!closer.test(tag) && !/\/>\s*$/.test(tag)) {
        let j = i;
        while (j < lines.length && !closer.test(lines[j]) && lines[j].trim() !== ``) j++;
        if (j < lines.length && closer.test(lines[j])) i = j + 1;
      }
      const kind: MediaKind = html[1].toLowerCase() === `audio` ? `audio` : mediaKindOf(src) ?? (html[1].toLowerCase() === `video` ? `video` : `embed`);
      if (src !== ``) blocks.push({ type: `media`, kind, target: src, caption: title });
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
      const kind = mediaKindOf(target);
      if (kind) blocks.push({ type: `media`, kind, target, caption, ...(id ? { id } : {}) });
      else blocks.push({ type: `figure`, target, caption, ...(width ? { width } : {}), ...(id ? { id } : {}) });
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

    // Repere de style de tableau : bloc a part, attache plus bas au tableau qui suit.
    if (line.startsWith(TABLE_MARKER_SENTINEL)) {
      flushPara();
      blocks.push({ type: `paragraph`, text: line });
      i++;
      continue;
    }

    // Chaque ligne de texte est un paragraphe : un retour a la ligne simple et un retour suivi de lignes vides donnent la meme mise en page.
    para.push(line.trim());
    flushPara();
    i++;
  }
  flushPara();
  // Les reperes de style se rattachent au tableau qui suit, directement ou apres sa legende ; ceux qui n'ont pas de tableau disparaissent.
  const styled: DocBlock[] = [];
  let pending: TableStyle | null = null;
  for (const b of blocks) {
    if (b.type === `paragraph`) {
      const st = styleFromSentinel(b.text);
      if (st) {
        pending = st;
        continue;
      }
      if (pending && !TABLE_CAPTION_RE.test(b.text.trim())) pending = null;
    } else if (b.type === `table`) {
      styled.push(pending ? { ...b, style: pending } : b);
      pending = null;
      continue;
    } else pending = null;
    styled.push(b);
  }
  // La ligne « Tableau : legende » placee juste au-dessus d'un tableau devient sa legende.
  const out: DocBlock[] = [];
  for (const b of styled) {
    const prev = out[out.length - 1];
    if (b.type === `table` && prev && prev.type === `paragraph`) {
      // Une legende restee vide (« Tableau : » sans nom) ne s'imprime pas.
      if (/^(?:Tableau|Table)[ \t\u00a0]*:[ \t\u00a0]*$/i.test(prev.text.trim())) out.pop();
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
// Lit les proprietes `nom` (true, false, oui, non...) et `nom-depth` (1 a 6) de l'en-tete de la note.
function tocProps(frontmatter: string, name: string): TocProps | undefined {
  const flag = new RegExp(`^${name}[ \\t]*:[ \\t]*[\\x22\\x27]?(true|yes|oui|vrai|1|false|no|non|faux|0)[\\x22\\x27]?[ \\t]*$`, `im`).exec(frontmatter);
  const depth = new RegExp(`^${name}-depth[ \\t]*:[ \\t]*[\\x22\\x27]?([1-6])[\\x22\\x27]?[ \\t]*$`, `im`).exec(frontmatter);
  if (!flag && !depth) return undefined;
  const out: TocProps = {};
  if (flag) out.enabled = /^(true|yes|oui|vrai|1)$/i.test(flag[1]);
  if (depth) out.depth = Number(depth[1]);
  return out;
}

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
  const toc = tocProps(doc.frontmatter, `toc`);
  const chapterToc = tocProps(doc.frontmatter, `chapter-toc`);
  return { title: doc.root.title, ...(toc ? { toc } : {}), ...(chapterToc ? { chapterToc } : {}), ...(lang ? { language: lang[1] } : {}), ...(author ? { author: author[1].trim() } : {}), blocks: parseBlocks(doc.root.body), sections, footnotes };
}

// Export de haute qualite : composition d'un document entier. Transforme l'arbre du document (etage 1) en lignes composees,
// avec la feuille de style du premier gabarit (A4, recto simple), puis les repartit en pages.
// Phase 2 : seuls les paragraphes, titres et listes utilisent la coupure de lignes de Knuth et Plass ; la pagination est
// encore grossiere (elle sera remplacee a la phase 3) et les tableaux, formules et figures sont des reperes provisoires.
import { DocBlock, DocSection, ExportDoc, inlineToPlain } from "./doc-tree";
import { LanguageCode } from "./hyphenate";
import { typesetParagraph, TypesetLine } from "./paragraph";
import { DEFAULT_TEX_PARAMS, TexParams } from "./tex-params";

export interface PageSetup {
  // Dimensions de la page et marges, en points (1 pt = 1/72 de pouce).
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  // Corps du texte et interligne.
  fontSize: number;
  leading: number;
}

// A4 recto simple, marges de 2,54 cm : premier gabarit.
export const A4_SETUP: PageSetup = {
  width: 595.28,
  height: 841.89,
  marginTop: 72,
  marginBottom: 72,
  marginLeft: 72,
  marginRight: 72,
  fontSize: 11,
  leading: 14,
};

export type RowKind = `title` | `heading` | `text` | `list` | `quote` | `code` | `figure` | `space`;

export interface RowQuality {
  badness: number;
  hyphenated: boolean;
  overfull: boolean;
  // Ligne dont les espaces sont tres etires (laideur de plus de 99) ou comprimes (de plus de 12).
  loose: boolean;
  tight: boolean;
}

export interface Row {
  kind: RowKind;
  text: string;
  // Position horizontale a partir de la marge gauche et largeur de la zone, en points.
  x: number;
  width: number;
  fontSize: number;
  // Hauteur occupee sur la page, en points.
  height: number;
  wordSpacing: number;
  // On ne coupe pas la page apres cette ligne (titre qui doit rester avec son texte).
  keepWithNext: boolean;
  align: `left` | `center`;
  // Puce ou numero place dans la marge d'un element de liste.
  marker?: string;
  quality?: RowQuality;
}

export interface TypesetStats {
  paragraphs: number;
  lines: number;
  hyphenatedLines: number;
  consecutiveHyphens: number;
  looseLines: number;
  tightLines: number;
  overfullLines: number;
  // Nombre de paragraphes resolus par chacune des trois passes.
  passes: [number, number, number];
  wordCount: number;
}

export interface TypesetDoc {
  rows: Row[];
  stats: TypesetStats;
  // Caracteres absents de la police, a signaler dans le rapport d'export.
  missing: number[];
}

// Langue de composition : les propriétés de la note indiquent fr ou en ; le francais est la langue principale.
export function languageOf(code: string | undefined): LanguageCode {
  return code && code.toLowerCase().startsWith(`en`) ? `en` : `fr`;
}

const HEADING_SIZES = [22, 17, 14, 12, 11, 11];

class Typesetter {
  rows: Row[] = [];
  stats: TypesetStats = { paragraphs: 0, lines: 0, hyphenatedLines: 0, consecutiveHyphens: 0, looseLines: 0, tightLines: 0, overfullLines: 0, passes: [0, 0, 0], wordCount: 0 };
  missing: number[] = [];
  private textWidth: number;

  constructor(private setup: PageSetup, private params: TexParams, private language: LanguageCode) {
    this.textWidth = setup.width - setup.marginLeft - setup.marginRight;
  }

  private space(height: number, keep = false): void {
    this.rows.push({ kind: `space`, text: ``, x: 0, width: this.textWidth, fontSize: this.setup.fontSize, height, wordSpacing: 0, keepWithNext: keep, align: `left` });
  }

  private addLines(lines: TypesetLine[], kind: RowKind, x: number, width: number, fontSize: number, height: number, firstMarker?: string): void {
    let prevHyphen = false;
    lines.forEach((l, i) => {
      this.stats.lines++;
      if (l.hyphenated) this.stats.hyphenatedLines++;
      if (l.hyphenated && prevHyphen) this.stats.consecutiveHyphens++;
      prevHyphen = l.hyphenated;
      const loose = !l.last && l.ratio > 0 && l.badness > 99;
      const tight = !l.last && l.ratio < 0 && l.badness > 12;
      if (loose) this.stats.looseLines++;
      if (tight) this.stats.tightLines++;
      if (l.overfull) this.stats.overfullLines++;
      this.rows.push({
        kind,
        text: l.text,
        x: x + l.offset,
        width: width - l.offset,
        fontSize,
        height,
        wordSpacing: l.wordSpacing,
        keepWithNext: false,
        align: `left`,
        ...(i === 0 && firstMarker ? { marker: firstMarker } : {}),
        quality: { badness: l.badness, hyphenated: l.hyphenated, overfull: l.overfull, loose, tight },
      });
    });
  }

  // Compose un texte en lignes et les ajoute ; renvoie le nombre de lignes ajoutees.
  private paragraph(text: string, kind: RowKind, x: number, width: number, opts: { indent: number; justify: boolean; hyphenate: boolean; fontSize: number; marker?: string }): number {
    // Phase 2 : le Markdown en ligne (gras, liens, code) est reduit a du texte brut ; les styles viendront plus tard.
    const r = typesetParagraph(inlineToPlain(text), {
      language: this.language,
      fontSize: opts.fontSize,
      lineWidth: width,
      indent: opts.indent,
      align: opts.justify ? `justify` : `left`,
      hyphenate: opts.hyphenate,
      params: this.params,
    });
    this.missing.push(...r.missing);
    if (r.pass > 0) this.stats.passes[r.pass - 1]++;
    this.stats.paragraphs++;
    this.addLines(r.lines, kind, x, width, opts.fontSize, this.setup.leading * (opts.fontSize / this.setup.fontSize), opts.marker);
    return r.lines.length;
  }

  title(text: string): void {
    const size = HEADING_SIZES[0];
    const before = this.rows.length;
    this.paragraph(text, `title`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: size });
    for (let i = before; i < this.rows.length; i++) this.rows[i].keepWithNext = true;
    this.space(this.setup.leading * 1.2, true);
  }

  heading(section: DocSection): void {
    const size = HEADING_SIZES[Math.min(Math.max(section.level, 1), 5)];
    const lead = this.setup.leading;
    this.space(lead * (section.level <= 1 ? 1.6 : section.level === 2 ? 1.2 : 0.8));
    const before = this.rows.length;
    this.paragraph(section.title || `(sans titre)`, `heading`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: size });
    for (let i = before; i < this.rows.length; i++) this.rows[i].keepWithNext = true;
    this.space(lead * 0.5, true);
  }

  block(b: DocBlock): void {
    const lead = this.setup.leading;
    const size = this.setup.fontSize;
    switch (b.type) {
      case `paragraph`:
        this.paragraph(b.text, `text`, 0, this.textWidth, { indent: size * this.params.parIndent, justify: true, hyphenate: true, fontSize: size });
        break;
      case `list`: {
        const counters: number[] = [];
        for (const item of b.items) {
          counters.length = item.depth + 1;
          counters[item.depth] = (counters[item.depth] ?? 0) + 1;
          const x = 6 + item.depth * 18;
          const marker = b.ordered ? `${counters[item.depth]}.` : `–`;
          this.paragraph(item.text, `list`, x + 16, this.textWidth - x - 16, { indent: 0, justify: false, hyphenate: true, fontSize: size, marker });
        }
        this.space(lead * 0.5);
        break;
      }
      case `quote`:
        for (const para of b.text.split(/\n{2,}/)) this.paragraph(para, `quote`, 24, this.textWidth - 36, { indent: 0, justify: true, hyphenate: true, fontSize: size });
        this.space(lead * 0.5);
        break;
      case `code`:
        this.codeRows(b.text.split(`\n`));
        break;
      case `table`:
        this.codeRows(b.rows.map((r) => r.map(inlineToPlain).join(` | `)));
        break;
      case `figure`:
        this.stats.lines++;
        this.rows.push({ kind: `figure`, text: `[Figure : ${inlineToPlain(b.caption) || b.target}]`, x: 0, width: this.textWidth, fontSize: size, height: lead * 1.5, wordSpacing: 0, keepWithNext: false, align: `center` });
        this.space(lead * 0.5);
        break;
    }
  }

  // Code et tableaux : provisoirement en chasse fixe, coupes aux 80 caracteres, sans composition.
  private codeRows(lines: string[]): void {
    for (const line of lines) {
      for (let i = 0; i === 0 || i < line.length; i += 80) {
        this.rows.push({ kind: `code`, text: line.slice(i, i + 80), x: 0, width: this.textWidth, fontSize: 9, height: 11.5, wordSpacing: 0, keepWithNext: false, align: `left` });
      }
    }
    this.space(this.setup.leading * 0.5);
  }

  section(s: DocSection): void {
    this.heading(s);
    for (const b of s.blocks) this.block(b);
    for (const c of s.sections) this.section(c);
  }
}

function countWords(blocks: DocBlock[]): number {
  const words = (s: string): number => s.split(/\s+/).filter((w) => w !== ``).length;
  let n = 0;
  for (const b of blocks) {
    if (b.type === `paragraph` || b.type === `quote`) n += words(b.text);
    else if (b.type === `list`) for (const it of b.items) n += words(it.text);
    else if (b.type === `table`) for (const r of b.rows) for (const c of r) n += words(c);
  }
  return n;
}

function sectionWords(s: DocSection): number {
  return countWords(s.blocks) + s.sections.reduce((a, c) => a + sectionWords(c), 0);
}

// Compose le document en lignes (sans les repartir en pages).
export function typesetDoc(doc: ExportDoc, setup: PageSetup = A4_SETUP, params: TexParams = DEFAULT_TEX_PARAMS): TypesetDoc {
  const t = new Typesetter(setup, params, languageOf(doc.language));
  t.title(doc.title);
  for (const b of doc.blocks) t.block(b);
  for (const s of doc.sections) t.section(s);
  t.stats.wordCount = countWords(doc.blocks) + doc.sections.reduce((a, s) => a + sectionWords(s), 0);
  return { rows: t.rows, stats: t.stats, missing: [...new Set(t.missing)] };
}

// Repartit les lignes en pages, au plus court : une page est pleine quand la ligne suivante ne tient plus. Un titre n'est
// jamais laisse seul en bas de page, et une page ne commence pas par un espace.
export function paginateRows(rows: Row[], setup: PageSetup = A4_SETUP): Row[][] {
  const available = setup.height - setup.marginTop - setup.marginBottom;
  const pages: Row[][] = [];
  let page: Row[] = [];
  let used = 0;
  const close = (): void => {
    let cut = page.length;
    while (cut > 0 && page[cut - 1].keepWithNext) cut--;
    if (cut === 0) cut = page.length;
    const closed = page.slice(0, cut);
    while (closed.length > 1 && closed[closed.length - 1].kind === `space`) closed.pop();
    const carry = page.slice(cut);
    while (carry.length > 0 && carry[0].kind === `space`) carry.shift();
    pages.push(closed);
    page = carry;
    used = carry.reduce((a, r) => a + r.height, 0);
  };
  for (const row of rows) {
    if (used + row.height > available + 1e-6 && page.length > 0) close();
    if (page.length === 0 && row.kind === `space`) continue;
    page.push(row);
    used += row.height;
  }
  while (page.length > 0 && page[page.length - 1].kind === `space`) page.pop();
  if (page.length > 0) pages.push(page);
  return pages;
}

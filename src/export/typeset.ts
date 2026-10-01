// Export de haute qualite : composition d'un document entier. Transforme l'arbre du document (etage 1) en lignes composees,
// avec la feuille de style du premier gabarit (A4, recto simple). La repartition des lignes en pages est faite par paginate.ts.
// Phase 3 : notes de bas de page, penalites de pagination (lignes veuves et orphelines, titres), chapitres courants. Les
// tableaux, formules et figures sont encore des reperes provisoires.
import { DocBlock, DocSection, ExportDoc, FOOTNOTE_CALL_RE } from "./doc-tree";
import { FontStyle, measureText } from "./font-metrics";
import { LanguageCode } from "./hyphenate";
import { parseInline, plainOf } from "./inline";
import { LineRun, typesetParagraph, TypesetLine } from "./paragraph";
import { DEFAULT_TEX_PARAMS, INF_PENALTY, TexParams } from "./tex-params";

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
  // Corps et interligne des notes de bas de page.
  noteFontSize: number;
  noteLeading: number;
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
  noteFontSize: 9,
  noteLeading: 11.5,
};

// Choix de mise en page du gabarit. Ils seront reglables dans le panneau des reglages (phase 7).
export interface PageStyle {
  // En-tete courant : titre du chapitre en cours (sauf sur sa premiere page), titre de la note, ou rien.
  header: `chapter` | `title` | `none`;
  // Pied de page : numero de page centre, ou rien.
  footer: `number` | `none`;
  // Pages alignees en bas (les espaces verticaux sont etires pour que toutes les pages finissent a la meme hauteur,
  // option flushbottom de LaTeX) ou pages qui finissent a des hauteurs differentes (raggedbottom).
  flushBottom: boolean;
  // Chaque chapitre de premier niveau commence sur une nouvelle page.
  chapterBreak: `none` | `level1`;
  // Numerotation des notes : continue sur tout le document, ou repartant de 1 a chaque chapitre.
  footnoteNumbering: `continuous` | `perChapter`;
}

export const DEFAULT_PAGE_STYLE: PageStyle = {
  header: `chapter`,
  footer: `number`,
  flushBottom: false,
  chapterBreak: `none`,
  footnoteNumbering: `continuous`,
};

export type RowKind = `title` | `heading` | `text` | `list` | `quote` | `code` | `figure` | `space` | `footnote`;

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
  // Penalite de coupure de page apres cette ligne : 0 libre, 10000 ou plus interdit (un titre reste avec son texte), 150
  // apres la premiere ligne d'un paragraphe (orpheline) ou avant sa derniere (veuve), 100 apres une ligne cesuree.
  breakAfter: number;
  // La page doit se terminer avant cette ligne (saut de page obligatoire).
  breakBefore?: boolean;
  // Etirement vertical de la ligne (espaces entre blocs), en points, utilise quand les pages sont alignees en bas.
  stretch?: number;
  align: `left` | `center`;
  // Puce ou numero place dans la marge d'un element de liste, ou numero d'une note de bas de page.
  marker?: string;
  quality?: RowQuality;
  // Titre du chapitre en cours et indication qu'il s'agit de la premiere ligne de son titre.
  chapter?: string;
  chapterStart?: boolean;
  // Notes de bas de page appelees sur la ligne (cles) et intervalles du texte a afficher en exposant.
  notes?: number[];
  sups?: [number, number][];
  // Texte de la ligne decoupe par police (gras, italique, liens), absent pour les lignes qui n'en ont pas besoin.
  runs?: LineRun[];
  // Titre dont la ligne est la premiere : sert au plan de navigation du PDF.
  heading?: { level: number; title: string };
}

// Note de bas de page composee : ses lignes et leur hauteur totale.
export interface FootnoteBlock {
  key: number;
  label: string;
  rows: Row[];
  height: number;
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
  footnotes: number;
}

export interface TypesetDoc {
  rows: Row[];
  footnotes: Map<number, FootnoteBlock>;
  stats: TypesetStats;
  // Caracteres absents de la police, a signaler dans le rapport d'export.
  missing: number[];
  // Problemes a signaler a l'utilisateur (note de bas de page sans definition, par exemple).
  warnings: string[];
  title: string;
}

// Langue de composition : les proprietes de la note indiquent fr ou en ; le francais est la langue principale.
export function languageOf(code: string | undefined): LanguageCode {
  return code && code.toLowerCase().startsWith(`en`) ? `en` : `fr`;
}

const HEADING_SIZES = [22, 17, 14, 12, 11, 11];
// Largeur reservee au numero d'une note, a gauche de son texte.
const NOTE_INDENT = 14;

class Typesetter {
  rows: Row[] = [];
  footnotes = new Map<number, FootnoteBlock>();
  stats: TypesetStats = { paragraphs: 0, lines: 0, hyphenatedLines: 0, consecutiveHyphens: 0, looseLines: 0, tightLines: 0, overfullLines: 0, passes: [0, 0, 0], wordCount: 0, footnotes: 0 };
  missing: number[] = [];
  warnings: string[] = [];
  private textWidth: number;
  // Chapitre en cours et niveau de titre qui sert de chapitre (le plus haut niveau present dans la note).
  private chapter: string | undefined;
  private chapterLevel = 1;
  private nextKey = 1;
  private counter = 1;
  private ids = new Map<string, { key: number; label: string }>();
  private firstChapter = true;

  constructor(private setup: PageSetup, private params: TexParams, private style: PageStyle, private language: LanguageCode, private defs: Record<string, string>) {
    this.textWidth = setup.width - setup.marginLeft - setup.marginRight;
  }

  setChapterLevel(level: number): void {
    this.chapterLevel = level;
  }

  private push(row: Omit<Row, `breakAfter` | `chapter`> & { breakAfter?: number }): Row {
    const full: Row = { breakAfter: 0, ...(this.chapter !== undefined ? { chapter: this.chapter } : {}), ...row };
    this.rows.push(full);
    return full;
  }

  private space(height: number, opts: { breakBefore?: boolean } = {}): void {
    this.push({ kind: `space`, text: ``, x: 0, width: this.textWidth, fontSize: this.setup.fontSize, height, wordSpacing: 0, align: `left`, stretch: height, ...(opts.breakBefore ? { breakBefore: true } : {}) });
  }

  // Penalites de coupure de page d'une ligne d'un paragraphe de `count` lignes.
  private penaltyFor(index: number, count: number, hyphenated: boolean): number {
    let p = 0;
    if (count > 1) {
      if (index === 0) p += this.params.clubPenalty;
      if (index === count - 2) p += this.params.widowPenalty;
    }
    if (hyphenated) p += this.params.brokenPenalty;
    return p;
  }

  private addLines(lines: TypesetLine[], kind: RowKind, x: number, width: number, fontSize: number, height: number, opts: { marker?: string; keep?: boolean } = {}): void {
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
      this.push({
        kind,
        text: l.text,
        x: x + l.offset,
        width: width - l.offset,
        fontSize,
        height,
        wordSpacing: l.wordSpacing,
        breakAfter: opts.keep ? INF_PENALTY : this.penaltyFor(i, lines.length, l.hyphenated),
        align: `left`,
        ...(i === 0 && opts.marker ? { marker: opts.marker } : {}),
        runs: l.runs,
        ...(l.notes.length > 0 ? { notes: l.notes, sups: l.sups } : {}),
        quality: { badness: l.badness, hyphenated: l.hyphenated, overfull: l.overfull, loose, tight },
      });
    });
  }

  // Remplace les appels de notes de bas de page ([^id] ou ^[texte]) par des reperes que la composition du paragraphe
  // transforme en numeros en exposant, et compose le texte de chaque note appelee.
  private withNoteCalls(text: string): string {
    return text.replace(FOOTNOTE_CALL_RE, (whole: string, id: string | undefined, inline: string | undefined) => {
      let key: number;
      let label: string;
      if (id !== undefined) {
        const known = this.ids.get(id);
        if (known) {
          // Plusieurs appels de la meme note portent le meme numero ; la note n'est imprimee qu'une fois.
          return `${known.key},${known.label}`;
        }
        const def = this.defs[id];
        if (def === undefined) {
          this.warnings.push(`note:${id}`);
          return whole;
        }
        key = this.nextKey++;
        label = String(this.counter++);
        this.ids.set(id, { key, label });
        this.registerNote(key, label, def);
      } else {
        key = this.nextKey++;
        label = String(this.counter++);
        this.registerNote(key, label, inline ?? ``);
      }
      return `${key},${label}`;
    });
  }

  private registerNote(key: number, label: string, text: string): void {
    const s = this.setup;
    const r = typesetParagraph(parseInline(text), {
      language: this.language,
      fontSize: s.noteFontSize,
      lineWidth: this.textWidth - NOTE_INDENT,
      indent: 0,
      align: `justify`,
      hyphenate: true,
      params: this.params,
    });
    this.missing.push(...r.missing);
    const rows: Row[] = r.lines.map((l, i) => ({
      kind: `footnote` as const,
      text: l.text,
      x: NOTE_INDENT,
      width: this.textWidth - NOTE_INDENT,
      fontSize: s.noteFontSize,
      height: s.noteLeading,
      wordSpacing: l.wordSpacing,
      breakAfter: 0,
      align: `left` as const,
      runs: l.runs,
      ...(i === 0 ? { marker: label } : {}),
    }));
    // Petit espace apres chaque note.
    if (rows.length > 0) rows[rows.length - 1].height += 2;
    const height = rows.reduce((a, row) => a + row.height, 0);
    this.footnotes.set(key, { key, label, rows, height });
    this.stats.footnotes++;
  }

  // Compose un texte en lignes et les ajoute ; renvoie le nombre de lignes ajoutees.
  private paragraph(text: string, kind: RowKind, x: number, width: number, opts: { indent: number; justify: boolean; hyphenate: boolean; fontSize: number; marker?: string; keep?: boolean; notes?: boolean; style?: FontStyle }): number {
    // Le Markdown en ligne (gras, liens, code) est reduit a du texte brut ; les styles viendront plus tard.
    const prepared = opts.notes === false ? text : this.withNoteCalls(text);
    const r = typesetParagraph(parseInline(prepared), {
      language: this.language,
      fontSize: opts.fontSize,
      lineWidth: width,
      indent: opts.indent,
      align: opts.justify ? `justify` : `left`,
      hyphenate: opts.hyphenate,
      style: opts.style ?? `regular`,
      params: this.params,
    });
    this.missing.push(...r.missing);
    if (r.pass > 0) this.stats.passes[r.pass - 1]++;
    this.stats.paragraphs++;
    this.addLines(r.lines, kind, x, width, opts.fontSize, this.setup.leading * (opts.fontSize / this.setup.fontSize), { marker: opts.marker, keep: opts.keep });
    return r.lines.length;
  }

  title(text: string): void {
    const first = this.rows.length;
    this.paragraph(text, `title`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: HEADING_SIZES[0], keep: true, notes: false, style: `bold` });
    if (this.rows.length > first) this.rows[first].heading = { level: 0, title: plainOf(parseInline(text).text) };
    this.space(this.setup.leading * 1.2);
    // L'espace qui suit le titre reste avec lui.
    this.rows[this.rows.length - 1].breakAfter = INF_PENALTY;
  }

  heading(section: DocSection): void {
    const size = HEADING_SIZES[Math.min(Math.max(section.level, 1), 5)];
    const lead = this.setup.leading;
    const isChapter = section.level === this.chapterLevel;
    if (isChapter) {
      this.chapter = plainOf(parseInline(section.title).text) || undefined;
      if (this.style.footnoteNumbering === `perChapter`) this.counter = 1;
    }
    const breakBefore = isChapter && this.style.chapterBreak === `level1` && !this.firstChapter;
    if (isChapter) this.firstChapter = false;
    this.space(lead * (section.level <= 1 ? 1.6 : section.level === 2 ? 1.2 : 0.8), { breakBefore });
    const before = this.rows.length;
    this.paragraph(section.title || `(sans titre)`, `heading`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: size, keep: true, notes: false, style: `bold` });
    if (this.rows.length > before) {
      this.rows[before].heading = { level: section.level, title: plainOf(parseInline(section.title).text) || `(sans titre)` };
      if (isChapter) this.rows[before].chapterStart = true;
    }
    this.space(lead * 0.5);
    this.rows[this.rows.length - 1].breakAfter = INF_PENALTY;
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
        this.codeRows(b.rows.map((r) => r.map((c) => plainOf(parseInline(c).text)).join(` | `)));
        break;
      case `figure`:
        this.stats.lines++;
        this.push({ kind: `figure`, text: `[Figure : ${plainOf(parseInline(b.caption).text) || b.target}]`, x: 0, width: this.textWidth, fontSize: size, height: lead * 1.5, wordSpacing: 0, align: `center` });
        this.space(lead * 0.5);
        break;
    }
  }

  // Code et tableaux : provisoirement en chasse fixe, coupes a la largeur de la colonne, sans composition.
  private codeRows(lines: string[]): void {
    const columns = Math.max(10, Math.floor(this.textWidth / measureText(`0`, 9, `mono`).width));
    for (const line of lines) {
      for (let i = 0; i === 0 || i < line.length; i += columns) {
        const text = line.slice(i, i + columns);
        this.push({ kind: `code`, text, x: 0, width: this.textWidth, fontSize: 9, height: 11.5, wordSpacing: 0, align: `left`, runs: [{ text, style: `mono` }] });
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

// Niveau de titre le plus haut present dans le document : c'est lui qui sert de chapitre (en-tete courant, saut de page).
function topLevel(sections: DocSection[]): number {
  let level = 6;
  const walk = (s: DocSection): void => {
    level = Math.min(level, s.level);
    s.sections.forEach(walk);
  };
  sections.forEach(walk);
  return level;
}

// Compose le document en lignes (sans les repartir en pages).
export function typesetDoc(doc: ExportDoc, setup: PageSetup = A4_SETUP, params: TexParams = DEFAULT_TEX_PARAMS, style: PageStyle = DEFAULT_PAGE_STYLE): TypesetDoc {
  const t = new Typesetter(setup, params, style, languageOf(doc.language), doc.footnotes);
  t.setChapterLevel(topLevel(doc.sections));
  t.title(doc.title);
  for (const b of doc.blocks) t.block(b);
  for (const s of doc.sections) t.section(s);
  t.stats.wordCount = countWords(doc.blocks) + doc.sections.reduce((a, s) => a + sectionWords(s), 0);
  return { rows: t.rows, footnotes: t.footnotes, stats: t.stats, missing: [...new Set(t.missing)], warnings: [...new Set(t.warnings)], title: doc.title };
}

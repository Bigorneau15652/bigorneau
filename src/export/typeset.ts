// Export de haute qualite : composition d'un document entier. Transforme l'arbre du document (etage 1) en lignes composees,
// avec la feuille de style du premier gabarit (A4, recto simple). La repartition des lignes en pages est faite par paginate.ts.
// Phase 3 : notes de bas de page, penalites de pagination (lignes veuves et orphelines, titres), chapitres courants. Les
// tableaux, formules et figures sont encore des reperes provisoires.
import { defaultParagraphSettings, PARAGRAPH_SPACE_POINTS, ParagraphSettings } from "../paragraph-format";
import { DocBlock, DocSection, ExportDoc, FOOTNOTE_CALL_RE } from "./doc-tree";
import { FontStyle, measureText } from "./font-metrics";
import { LanguageCode } from "./hyphenate";
import { displaySize, figureBounds, ImageAsset, isImageTarget, isWebTarget } from "./image";
import { InlineContext, InlineText, normalizeHeading, parseInline, plainOf } from "./inline";
import type { MathAsset } from "./math";
import { mathKey } from "./math";
import { LineRun, typesetParagraph, TypesetLine } from "./paragraph";
import type { PageZone } from "../page-zone";
import { layoutTable } from "./table";
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
  // Figures et tableaux : flottants (en haut ou en bas de la page ou ils tiennent, comme en LaTeX) ou places la ou ils sont
  // ecrits.
  floats: `float` | `inline`;
  // Legende des figures : sous l'image ou au-dessus.
  figureCaption: `below` | `above`;
  // Renvois vers un titre, une figure ou un tableau : ajoutent « (page N) » apres le texte du renvoi.
  pageRefs: boolean;
  // Medias (video, son, contenu integre) : un cadre avec le titre et l'adresse, ou une simple ligne de texte.
  media: `frame` | `text`;
  // Protrusion (microtypographie) : la ponctuation et les tirets en bout de ligne justifiee depassent un peu dans la marge.
  protrusion: boolean;
  // Table des matieres generale au debut du document, et niveaux de titres qu'elle liste (1 a 6). Une propriete de la note
  // (toc, toc-depth) l'emporte sur ces choix.
  toc: boolean;
  tocDepth: number;
  // Table des matieres de chaque chapitre (titre de plus haut niveau), placee sous le titre du chapitre : sous-titres du chapitre
  // jusqu'au niveau indique. Propriete de la note : chapter-toc, chapter-toc-depth.
  chapterToc: boolean;
  chapterTocDepth: number;
}

export const DEFAULT_PAGE_STYLE: PageStyle = {
  header: `chapter`,
  footer: `number`,
  flushBottom: false,
  chapterBreak: `none`,
  footnoteNumbering: `continuous`,
  floats: `float`,
  figureCaption: `below`,
  pageRefs: false,
  media: `frame`,
  protrusion: true,
  toc: false,
  tocDepth: 3,
  chapterToc: false,
  chapterTocDepth: 3,
};

// Tables des matieres a produire : niveaux de la table generale et de celle de chaque chapitre (0 : aucune). Les proprietes de la
// note l'emportent, champ par champ, sur les choix de la feuille de style.
export function tocPlan(doc: Pick<ExportDoc, `toc` | `chapterToc`>, style: PageStyle): { general: number; chapter: number } {
  const general = doc.toc?.enabled ?? style.toc;
  const chapter = doc.chapterToc?.enabled ?? style.chapterToc;
  return { general: general ? (doc.toc?.depth ?? style.tocDepth) : 0, chapter: chapter ? (doc.chapterToc?.depth ?? style.chapterTocDepth) : 0 };
}

export type RowKind = `title` | `heading` | `text` | `list` | `quote` | `code` | `figure` | `math` | `media` | `caption` | `table` | `toc` | `float` | `space` | `footnote`;

export interface RowQuality {
  badness: number;
  hyphenated: boolean;
  overfull: boolean;
  // Ligne dont les espaces sont tres etires (laideur de plus de 99) ou comprimes (de plus de 12).
  loose: boolean;
  tight: boolean;
}

// Cellule d'une ligne de tableau : position a partir du bord gauche du tableau, largeur, texte et morceaux.
export interface RowCell {
  x: number;
  width: number;
  text: string;
  runs: LineRun[];
}

// Figure ou tableau flottant : lignes a placer ensemble, et espace qui les separe du texte.
export interface FloatBlock {
  rows: Row[];
  gap: number;
  // Hauteur totale, espace compris.
  height: number;
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
  // Ligne de tableau : cellules, marges interieures haute et basse (comprises dans la hauteur) et filets horizontaux sur
  // toute la largeur du tableau. `table` relie la ligne a son tableau et garde son en-tete, repete apres un saut de page.
  cells?: RowCell[];
  inset?: { top: number; bottom: number };
  rules?: { top?: boolean; bottom?: boolean };
  // Fond de la ligne (gris, 0 noir et 1 blanc) et, pour un fond fonce, ecriture blanche.
  shade?: { fill: number; text?: `white` };
  table?: { id: number; header: Row[] };
  // Image d'une figure, centree dans la ligne.
  image?: { target: string; width: number; height: number };
  // Repere de la ligne pour les renvois (titre : hid:N, bloc avec identifiant : b:identifiant).
  anchor?: string;
  // Second repere de la meme ligne : celui de la legende d'une figure ou d'un tableau pour les listes d'illustrations (lst:Figure 1).
  alias?: string;
  // Ligne de la table des matieres : repere du titre, numero de sa page (inconnu a la premiere composition).
  toc?: { anchor: string; page: number };
  // Repere de flottant : la figure ou le tableau se place a la page, pas ici.
  float?: FloatBlock;
  // Formule en bloc : dessin et corps (taille de l'em, en points) ; elle est centree dans la ligne.
  math?: { asset: MathAsset; size: number };
  // Cadre d'un media : bords gauche et droit sur toute la largeur du texte, bord haut et bord bas sur la premiere et la derniere ligne.
  frame?: { width: number; top: boolean; bottom: boolean };
  // Ligne sans hauteur qui marque le debut d'une zone d'une autre orientation (null : retour a la mise en page de la note). Elle sert a
  // couper le texte en parties mises en pages separement, voir compose.ts.
  zoneStart?: { zone: PageZone | null };
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
  // Problemes a signaler a l'utilisateur (note de bas de page sans definition, image introuvable, renvoi sans cible).
  warnings: string[];
  title: string;
}

// Informations qui viennent d'Obsidian ou d'une composition precedente.
export interface TypesetOptions {
  // Images des figures, par cible (nom ecrit dans la note).
  images?: Map<string, ImageAsset>;
  // Dessins des formules (voir mathKey).
  formulas?: Map<string, MathAsset>;
  // Numero de page d'une ancre, connu apres une premiere mise en page (table des matieres, renvois avec page).
  pageOf?: (anchor: string) => number | undefined;
  // Reglage des paragraphes de la note : retrait ou espace entre paragraphes, alignement (voir paragraph-format.ts).
  paragraphs?: ParagraphSettings;
  // Reglages de composition (une colonne de texte et ses marges) d'une zone d'orientation differente ; null : la note. Absent : les
  // etiquettes de zone sont ignorees (feuille imposee).
  zoneSetup?: (zone: PageZone | null) => PageSetup;
}

// Repere des titres et des blocs, et numero des figures et tableaux, calcules avant la composition pour que les renvois
// puissent viser un endroit situe plus loin dans la note.
interface Anchors {
  sections: Map<DocSection, string>;
  headings: Map<string, string>;
  blocks: Map<string, { anchor: string; label?: string }>;
  labels: Map<DocBlock, string>;
}

function labelWords(language: LanguageCode): { figure: string; table: string } {
  return language === `en` ? { figure: `Figure`, table: `Table` } : { figure: `Figure`, table: `Tableau` };
}

function collectAnchors(doc: ExportDoc, language: LanguageCode): Anchors {
  const words = labelWords(language);
  const a: Anchors = { sections: new Map(), headings: new Map(), blocks: new Map(), labels: new Map() };
  let figures = 0;
  let tables = 0;
  let sections = 0;
  const blocks = (list: DocBlock[]): void => {
    for (const b of list) {
      let label: string | undefined;
      // Une figure sans nom n'a ni numero ni legende : elle n'est pas referencee.
      if (b.type === `figure` && b.caption.trim() !== `` && (isImageTarget(b.target) || isWebTarget(b.target))) label = `${words.figure} ${++figures}`;
      else if (b.type === `table` && b.caption) label = `${words.table} ${++tables}`;
      if (label) a.labels.set(b, label);
      if ((b.type === `paragraph` || b.type === `quote` || b.type === `table` || b.type === `figure` || b.type === `math` || b.type === `media`) && b.id) a.blocks.set(b.id, { anchor: `b:${b.id}`, ...(label ? { label } : {}) });
    }
  };
  const walk = (s: DocSection): void => {
    const anchor = `hid:${++sections}`;
    a.sections.set(s, anchor);
    const key = normalizeHeading(s.title);
    if (!a.headings.has(key)) a.headings.set(key, anchor);
    blocks(s.blocks);
    s.sections.forEach(walk);
  };
  blocks(doc.blocks);
  doc.sections.forEach(walk);
  return a;
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
  // Liste ou vont les lignes composees : le corps du document, ou un bloc en cours de preparation (figure, tableau).
  private sink: Row[] = this.rows;
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

  private tableCount = 0;
  private inlineCtx: InlineContext;

  constructor(private setup: PageSetup, private params: TexParams, private style: PageStyle, private language: LanguageCode, private defs: Record<string, string>, private anchors: Anchors, private opts: TypesetOptions, noteName: string) {
    this.textWidth = setup.width - setup.marginLeft - setup.marginRight;
    this.inlineCtx = {
      noteName,
      headingAnchor: (title) => this.anchors.headings.get(normalizeHeading(title)),
      block: (id) => this.anchors.blocks.get(id),
      pageOf: (anchor) => this.opts.pageOf?.(anchor),
      pageRefs: style.pageRefs,
      warn: (m) => this.warnings.push(m),
      math: (tex) => this.opts.formulas?.get(mathKey(tex, false)) ?? this.opts.formulas?.get(mathKey(tex, true)),
    };
  }

  // Texte d'un paragraphe prepare pour la composition : appels de notes, renvois internes, gras, italique, liens.
  private inline(text: string): InlineText {
    return parseInline(this.withNoteCalls(text), this.inlineCtx);
  }

  setChapterLevel(level: number): void {
    this.chapterLevel = level;
  }

  private chapterTocDepth = 0;

  setChapterTocDepth(depth: number): void {
    this.chapterTocDepth = depth;
  }

  private push(row: Omit<Row, `breakAfter` | `chapter`> & { breakAfter?: number }): Row {
    const full: Row = { breakAfter: 0, ...(this.chapter !== undefined ? { chapter: this.chapter } : {}), ...row };
    this.sink.push(full);
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

  private addLines(lines: TypesetLine[], kind: RowKind, x: number, width: number, fontSize: number, height: number, opts: { marker?: string; keep?: boolean; shift?: `right` | `center` } = {}): void {
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
      // Une formule plus haute que l'interligne agrandit la ligne.
      let lineHeight = height;
      for (const r of l.runs) if (r.math) lineHeight = Math.max(lineHeight, ((r.math.ascent + r.math.descent) * fontSize) / 1000 + 2);
      // Texte a droite ou centre : la ligne, composee au fil de l'eau, est decalee de ce qui reste de la largeur.
      const slack = Math.max(0, width - l.width);
      const offset = opts.shift === `right` ? slack : opts.shift === `center` ? slack / 2 : l.offset;
      this.push({
        kind,
        text: l.text,
        x: x + offset,
        width: width - offset,
        fontSize,
        height: lineHeight,
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
      protrusion: this.style.protrusion,
      params: this.params,
    });
    this.missing.push(...r.missing);
    const rows: Row[] = r.lines.map((l, i) => ({
      kind: `footnote` as const,
      text: l.text,
      x: NOTE_INDENT + l.offset,
      width: this.textWidth - NOTE_INDENT - l.offset,
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
  private paragraph(text: string, kind: RowKind, x: number, width: number, opts: { indent: number; justify: boolean; hyphenate: boolean; fontSize: number; marker?: string; keep?: boolean; notes?: boolean; style?: FontStyle; shift?: `right` | `center` }): number {
    const r = typesetParagraph(opts.notes === false ? parseInline(text) : this.inline(text), {
      language: this.language,
      fontSize: opts.fontSize,
      lineWidth: width,
      indent: opts.indent,
      align: opts.justify ? `justify` : `left`,
      hyphenate: opts.hyphenate,
      protrusion: this.style.protrusion,
      style: opts.style ?? `regular`,
      params: this.params,
    });
    this.missing.push(...r.missing);
    if (r.pass > 0) this.stats.passes[r.pass - 1]++;
    this.stats.paragraphs++;
    this.addLines(r.lines, kind, x, width, opts.fontSize, this.setup.leading * (opts.fontSize / this.setup.fontSize), { marker: opts.marker, keep: opts.keep, ...(opts.shift ? { shift: opts.shift } : {}) });
    return r.lines.length;
  }

  title(text: string): void {
    const first = this.sink.length;
    this.paragraph(text, `title`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: HEADING_SIZES[0], keep: true, notes: false, style: `bold` });
    if (this.sink.length > first) this.sink[first].heading = { level: 0, title: plainOf(parseInline(text).text) };
    this.space(this.setup.leading * 1.2);
    // L'espace qui suit le titre reste avec lui.
    this.sink[this.sink.length - 1].breakAfter = INF_PENALTY;
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
    const before = this.sink.length;
    this.paragraph(section.title || `(sans titre)`, `heading`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: size, keep: true, notes: false, style: `bold` });
    if (this.sink.length > before) {
      this.sink[before].heading = { level: section.level, title: plainOf(parseInline(section.title).text) || `(sans titre)` };
      const anchor = this.anchors.sections.get(section);
      if (anchor) this.sink[before].anchor = anchor;
      if (isChapter) this.sink[before].chapterStart = true;
    }
    this.space(lead * 0.5);
    this.sink[this.sink.length - 1].breakAfter = INF_PENALTY;
    if (isChapter && this.chapterTocDepth > 0) this.chapterToc(section, this.chapterTocDepth);
    this.afterHeading = section.title;
  }

  // Repere de renvoi pose sur la premiere ligne ajoutee depuis `from`.
  private anchorFrom(from: number, id: string | undefined): void {
    if (id !== undefined && this.sink[from]) this.sink[from].anchor = `b:${id}`;
  }

  // Vrai quand le bloc precedent etait un paragraphe de texte (pour l'espace entre paragraphes).
  private afterParagraph = false;

  // Zone en cours (null : la mise en page de la note) et zone a retrouver apres le prochain bloc (etiquette « seulement »).
  private zone: PageZone | null = null;
  private restore: { zone: PageZone | null } | undefined;

  // Passe a une autre feuille : un repere coupe le texte, la largeur de composition change.
  private enterZone(zone: PageZone | null): void {
    const next = this.opts.zoneSetup;
    if (!next) return;
    const setup = next(zone);
    const same = setup.width === this.setup.width && setup.height === this.setup.height && setup.marginLeft === this.setup.marginLeft && setup.marginTop === this.setup.marginTop;
    this.zone = zone;
    if (same) return;
    this.setup = setup;
    this.textWidth = setup.width - setup.marginLeft - setup.marginRight;
    this.push({ kind: `space`, text: ``, x: 0, width: this.textWidth, fontSize: setup.fontSize, height: 0, wordSpacing: 0, align: `left`, zoneStart: { zone } });
  }

  // Titre ecrit juste avant le bloc en cours : une liste d'illustrations placee sous un titre qui la nomme (« Liste des figures »)
  // n'ajoute pas le sien.
  private afterHeading: string | undefined;

  block(b: DocBlock): void {
    const previousHeading = this.afterHeading;
    this.afterHeading = undefined;
    if (b.type === `illustrations`) {
      this.illustrationList(b.kind, previousHeading !== undefined && namesList(previousHeading, b.kind));
      this.afterParagraph = false;
      return;
    }
    if (b.type === `zone`) {
      if (this.restore === undefined || !b.zone.once) this.restore = b.zone.once ? { zone: this.zone } : undefined;
      this.enterZone(b.zone);
      this.afterParagraph = false;
      return;
    }
    this.blockContent(b);
    // Etiquette « seulement » : la feuille reprend son orientation apres le bloc.
    if (this.restore !== undefined) {
      const back = this.restore.zone;
      this.restore = undefined;
      this.enterZone(back);
    }
  }

  private blockContent(b: DocBlock): void {
    let paragraphDone = false;
    const lead = this.setup.leading;
    const size = this.setup.fontSize;
    const from = this.sink.length;
    switch (b.type) {
      case `paragraph`: {
        // Reglage du document, puis exception de ce paragraphe (%% p: ... %%) : alignement, retrait ou espace entre paragraphes.
        const base = this.opts.paragraphs ?? defaultParagraphSettings();
        const align = b.format?.align ?? base.align;
        const mode = b.format?.mode ?? base.mode;
        const gap = PARAGRAPH_SPACE_POINTS[b.format?.size ?? base.size];
        if (mode === `space` && this.afterParagraph) this.space(gap);
        // Le retrait n'a de sens que pour du texte a gauche ou justifie.
        const indent = mode === `indent` && (align === `justify` || align === `left`) ? size * this.params.parIndent : 0;
        this.paragraph(b.text, `text`, 0, this.textWidth, { indent, justify: align === `justify`, hyphenate: true, fontSize: size, ...(align === `right` || align === `center` ? { shift: align } : {}) });
        this.anchorFrom(from, b.id);
        paragraphDone = true;
        break;
      }
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
        this.anchorFrom(from, b.id);
        this.space(lead * 0.5);
        break;
      case `code`:
        this.codeRows(b.text.split(`\n`));
        break;
      case `table`:
        this.table(b);
        break;
      case `figure`:
        this.figure(b);
        break;
      case `math`:
        this.math(b);
        break;
      case `media`:
        this.media(b);
        break;
    }
    this.afterParagraph = paragraphDone;
  }

  // Formule en bloc : centree, mise a l'echelle de la colonne si elle est trop large. Un dessin absent est remplace par le texte
  // TeX et signale.
  private math(b: Extract<DocBlock, { type: `math` }>): void {
    const lead = this.setup.leading;
    const size = this.setup.fontSize;
    const from = this.sink.length;
    const asset = this.opts.formulas?.get(mathKey(b.tex, true));
    if (!asset) {
      this.warnings.push(`formule:${b.tex}`);
      const text = `$$ ${b.tex.replace(/\s+/g, ` `)} $$`;
      this.codeRows([text]);
      this.anchorFrom(from, b.id);
      return;
    }
    const scale = Math.min(1, this.textWidth / ((asset.width * size) / 1000));
    const k = (size * scale) / 1000;
    const pad = lead * 0.4;
    const width = asset.width * k;
    this.stats.lines++;
    this.push({ kind: `math`, text: ``, x: (this.textWidth - width) / 2, width, fontSize: size, height: Math.max(lead, (asset.ascent + asset.descent) * k) + 2 * pad, wordSpacing: 0, align: `left`, math: { asset, size: size * scale } });
    this.anchorFrom(from, b.id);
    this.space(lead * 0.2);
  }

  // Media : cadre (ou ligne de texte) avec la sorte de media, son titre, et son adresse cliquable quand c'est une adresse web.
  private media(b: Extract<DocBlock, { type: `media` }>): void {
    const lead = this.setup.leading;
    const size = this.setup.fontSize;
    const en = this.language === `en`;
    const labels: Record<string, string> = en ? { video: `Video`, audio: `Audio`, document: `PDF document`, embed: `Embedded content` } : { video: `Vidéo`, audio: `Audio`, document: `Document PDF`, embed: `Contenu intégré` };
    const web = isWebTarget(b.target);
    const caption = plainOf(parseInline(b.caption).text) || (web ? `` : (b.target.split(/[\\/]/).pop() ?? b.target));
    this.warnings.push(`media:${b.target}`);
    const framed = this.style.media === `frame`;
    const inner = framed ? 10 : 0;
    const innerWidth = this.textWidth - 2 * inner;
    this.space(lead * 0.4);
    const start = this.sink.length;
    this.paragraph(`**${labels[b.kind]}**${en ? `:` : ` :`}${caption === `` ? `` : ` ${caption}`}`, `media`, inner, innerWidth, { indent: 0, justify: false, hyphenate: false, fontSize: size, notes: false });
    // Adresse en chasse fixe, coupee a la largeur du cadre apres un signe de ponctuation d'adresse quand c'est possible.
    const charWidth = measureText(`0`, 9, `mono`).width;
    const columns = Math.max(8, Math.floor(innerWidth / charWidth));
    let rest = b.target;
    while (rest.length > 0) {
      let cut = Math.min(columns, rest.length);
      if (rest.length > columns) {
        const at = Math.max(rest.lastIndexOf(`/`, cut), rest.lastIndexOf(`&`, cut), rest.lastIndexOf(`?`, cut), rest.lastIndexOf(`-`, cut), rest.lastIndexOf(`.`, cut));
        if (at > columns * 0.5) cut = at + 1;
      }
      const piece = rest.slice(0, cut);
      rest = rest.slice(cut);
      this.push({ kind: `media`, text: piece, x: inner, width: innerWidth, fontSize: 9, height: 12, wordSpacing: 0, align: `left`, breakAfter: INF_PENALTY, runs: [{ text: piece, style: `mono`, ...(web ? { link: b.target } : {}) }] });
    }
    const end = this.sink.length;
    // Les lignes du bloc restent ensemble ; le cadre est trace sur toutes, et ses marges haute et basse sont comprises dans la
    // premiere et la derniere ligne (la page peut se couper apres le bloc sans perdre le bas du cadre).
    for (let k = start; k < end; k++) {
      this.sink[k].breakAfter = k === end - 1 ? 0 : INF_PENALTY;
      if (framed) {
        if (k === start) this.sink[k].height += 4;
        if (k === end - 1) this.sink[k].height += 4;
        this.sink[k].frame = { width: this.textWidth, top: k === start, bottom: k === end - 1 };
      }
    }
    this.anchorFrom(start, b.id);
    this.space(lead * 0.5);
    this.stats.lines++;
  }

  // Legende « Figure 1 : texte » ou « Tableau 2 : texte » : etiquette en gras, centree si elle tient sur une ligne.
  private caption(label: string, text: string): void {
    const sep = this.language === `en` ? `:` : ` :`;
    const body = text.trim();
    const source = `**${label}**${sep}${body === `` ? `` : ` ${body}`}`;
    const size = this.setup.fontSize - 1;
    const first = this.sink.length;
    this.paragraph(source, `caption`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: true, fontSize: size });
    if (this.sink[first]) this.sink[first].alias = `lst:${label}`;
    const lines = this.sink.length - first;
    if (lines === 1) this.sink[first].align = `center`;
    if (lines > 1) for (let k = first; k < this.sink.length - 1; k++) this.sink[k].breakAfter = INF_PENALTY;
  }

  // Prepare un bloc (figure, tableau) : lignes ecrites dans une liste a part.
  private collect(build: () => void): Row[] {
    const saved = this.sink;
    this.sink = [];
    build();
    const out = this.sink;
    this.sink = saved;
    return out;
  }

  // Place un bloc : flottant (un repere dans le texte, la page est choisie ensuite) ou a l'endroit ou il est ecrit.
  private emit(block: Row[], anchorId: string | undefined, floatable: boolean): void {
    if (block.length === 0) return;
    if (anchorId !== undefined) block[0].anchor = `b:${anchorId}`;
    const lead = this.setup.leading;
    if (floatable && this.style.floats === `float`) {
      const gap = lead * 0.9;
      const height = block.reduce((a, r) => a + r.height, 0) + gap;
      this.push({ kind: `float`, text: ``, x: 0, width: this.textWidth, fontSize: this.setup.fontSize, height: 0, wordSpacing: 0, align: `left`, float: { rows: block, gap, height } });
      return;
    }
    // Ecrit a sa place : un peu d'air avant, et le bloc reste d'un seul tenant tant qu'il tient sur la page.
    this.space(lead * 0.4);
    for (const r of block) this.sink.push(r);
    this.space(lead * 0.5);
  }

  private figure(b: Extract<DocBlock, { type: `figure` }>): void {
    const lead = this.setup.leading;
    const size = this.setup.fontSize;
    const label = this.anchors.labels.get(b);
    const image = isImageTarget(b.target) || isWebTarget(b.target);
    const asset = this.opts.images?.get(b.target);
    const caption = plainOf(parseInline(b.caption).text);
    const above = label !== undefined && this.style.figureCaption === `above`;
    const block = this.collect(() => {
      this.stats.lines++;
      if (above) {
        this.caption(label as string, caption);
        this.space(lead * 0.4);
        this.sink[this.sink.length - 1].breakAfter = INF_PENALTY;
      }
      if (image && asset && !isWebTarget(b.target)) {
        const bounds = figureBounds(this.setup);
        const d = displaySize(asset.naturalWidth, asset.naturalHeight, b.width, bounds.maxWidth, bounds.maxHeight);
        this.push({ kind: `figure`, text: ``, x: (this.textWidth - d.width) / 2, width: d.width, fontSize: size, height: d.height, wordSpacing: 0, align: `left`, breakAfter: INF_PENALTY, image: { target: b.target, width: d.width, height: d.height } });
      } else {
        // Image introuvable, image du web (non telechargee) ou autre media : un repere a la place.
        let text: string;
        if (image && isWebTarget(b.target)) {
          text = this.language === `en` ? `[Web image: ${b.target}]` : `[Image du web : ${b.target}]`;
          this.warnings.push(`webimage:${b.target}`);
        } else if (image) {
          text = this.language === `en` ? `[Image not found: ${b.target}]` : `[Image introuvable : ${b.target}]`;
          this.warnings.push(`image:${b.target}`);
        } else {
          text = `[Figure : ${caption || b.target}]`;
        }
        this.push({ kind: `figure`, text, x: 0, width: this.textWidth, fontSize: size, height: lead * 1.5, wordSpacing: 0, align: `center`, runs: [{ text, style: `regular` }], breakAfter: label ? INF_PENALTY : 0 });
      }
      if (label && !above) {
        this.space(lead * 0.4);
        this.sink[this.sink.length - 1].breakAfter = INF_PENALTY;
        this.caption(label, caption);
      }
    });
    this.emit(block, b.id, label !== undefined);
  }

  private table(b: Extract<DocBlock, { type: `table` }>): void {
    const lead = this.setup.leading;
    const size = this.setup.fontSize;
    const label = this.anchors.labels.get(b);
    const id = ++this.tableCount;
    const layout = layoutTable(
      b.rows,
      b.align,
      {
        textWidth: this.textWidth,
        fontSize: size,
        leading: lead,
        prepare: (text) => this.inline(text),
        typeset: (text, width, style) => {
          const r = typesetParagraph(text, { language: this.language, fontSize: size, lineWidth: width, indent: 0, align: `left`, hyphenate: true, style, params: this.params });
          this.missing.push(...r.missing);
          if (r.pass > 0) {
            this.stats.passes[r.pass - 1]++;
            this.stats.paragraphs++;
          }
          this.stats.lines += r.lines.length;
          return r;
        },
      },
      id,
      b.style ?? {}
    );
    const block = this.collect(() => {
      if (label) {
        const first = this.sink.length;
        this.caption(label, plainOf(parseInline(b.caption ?? ``).text));
        for (let k = first; k < this.sink.length; k++) this.sink[k].breakAfter = INF_PENALTY;
        this.space(lead * 0.4);
        this.sink[this.sink.length - 1].breakAfter = INF_PENALTY;
      }
      for (const r of layout.rows) this.sink.push(r);
    });
    // Un tableau flotte seulement s'il porte une legende et ne depasse pas 60 % de la hauteur de la page.
    const textHeight = this.setup.height - this.setup.marginTop - this.setup.marginBottom;
    const floatable = label !== undefined && layout.height < textHeight * 0.6;
    if (label === undefined && b.id === undefined) {
      this.space(lead * 0.4);
      for (const r of block) this.sink.push(r);
      this.space(lead * 0.5);
    } else {
      this.emit(block, b.id, floatable);
    }
  }

  // Code : provisoirement en chasse fixe, coupe a la largeur de la colonne, sans composition.
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

  // Table des matieres : un titre par ligne (ou plusieurs), le numero de page a droite, relies par des points de conduite.
  tableOfContents(doc: ExportDoc, depth: number): void {
    this.tocRows(doc.sections, depth, this.language === `en` ? `Contents` : `Table des matières`);
  }

  // Table des matieres d'un chapitre : ses sous-titres, sous son titre, sans titre propre.
  chapterToc(section: DocSection, depth: number): void {
    this.tocRows(section.sections, depth, undefined);
  }

  // Lignes d'une table des matieres : un titre par ligne (ou plusieurs), le numero de page a droite, relies par des points de
  // conduite. `heading` : titre de la table (absent pour la table d'un chapitre, plus compacte).
  private tocRows(sections: DocSection[], depth: number, heading: string | undefined): void {
    const entries: { level: number; title: string; anchor: string }[] = [];
    const walk = (s: DocSection): void => {
      const anchor = this.anchors.sections.get(s);
      if (anchor && s.level <= depth) entries.push({ level: s.level, title: s.title || `(sans titre)`, anchor });
      s.sections.forEach(walk);
    };
    sections.forEach(walk);
    this.entryRows(entries, heading, heading !== undefined);
  }

  // Liste des figures ou des tableaux nommes, dans l'ordre du document, avec leur page.
  private illustrationList(kind: `figures` | `tables`, underHeading: boolean): void {
    const entries: { level: number; title: string; anchor: string }[] = [];
    for (const [block, label] of this.anchors.labels) {
      if ((kind === `figures`) !== (block.type === `figure`)) continue;
      const text = block.type === `figure` || block.type === `table` ? plainOf(parseInline(block.type === `figure` ? block.caption : (block.caption ?? ``)).text).trim() : ``;
      const sep = this.language === `en` ? `:` : ` :`;
      entries.push({ level: 1, title: text === `` ? label : `${label}${sep} ${text}`, anchor: `lst:${label}` });
    }
    const heading = kind === `figures` ? (this.language === `en` ? `List of figures` : `Liste des figures`) : this.language === `en` ? `List of tables` : `Liste des tableaux`;
    this.entryRows(entries, underHeading ? undefined : heading, false, false);
  }

  // Lignes d'une liste de titres avec leur page (table des matieres, listes d'illustrations).
  private entryRows(entries: { level: number; title: string; anchor: string }[], heading: string | undefined, boldTop: boolean, compact = heading === undefined): void {
    if (entries.length === 0) return;
    const lead = this.setup.leading;
    const size = compact ? this.setup.fontSize - 1 : this.setup.fontSize;
    const top = Math.min(...entries.map((e) => e.level));
    if (heading !== undefined) {
      this.space(lead * 0.8);
      this.paragraph(heading, `heading`, 0, this.textWidth, { indent: 0, justify: false, hyphenate: false, fontSize: HEADING_SIZES[1], keep: true, notes: false, style: `bold` });
      this.space(lead * 0.5);
      this.sink[this.sink.length - 1].breakAfter = INF_PENALTY;
    }
    const numberWidth = 26;
    for (const e of entries) {
      const x = (e.level - top) * 16;
      const first = this.sink.length;
      this.paragraph(e.title, `toc`, x, this.textWidth - x - numberWidth, { indent: 0, justify: false, hyphenate: false, fontSize: size, notes: false, style: e.level === top && boldTop ? `bold` : `regular` });
      const last = this.sink[this.sink.length - 1];
      for (let k = first; k < this.sink.length - 1; k++) this.sink[k].breakAfter = INF_PENALTY;
      // Le titre peut etre sur plusieurs lignes : la zone cliquable et le numero sont sur la derniere.
      for (let k = first; k < this.sink.length; k++) this.sink[k].toc = { anchor: e.anchor, page: k === this.sink.length - 1 ? (this.opts.pageOf?.(e.anchor) ?? 0) : -1 };
      last.width = this.textWidth - x;
    }
    this.space(compact ? lead * 0.6 : lead);
  }

  section(s: DocSection): void {
    this.heading(s);
    for (const b of s.blocks) this.block(b);
    for (const c of s.sections) this.section(c);
  }
}

// Le titre nomme-t-il cette liste (« Liste des figures », « Table des tableaux », « List of tables »...) ?
function namesList(title: string, kind: `figures` | `tables`): boolean {
  const w = normalizeHeading(title);
  return kind === `figures` ? /figure/.test(w) : /tableau|table/.test(w);
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
export function typesetDoc(doc: ExportDoc, setup: PageSetup = A4_SETUP, params: TexParams = DEFAULT_TEX_PARAMS, style: PageStyle = DEFAULT_PAGE_STYLE, opts: TypesetOptions = {}): TypesetDoc {
  const language = languageOf(doc.language);
  const t = new Typesetter(setup, params, style, language, doc.footnotes, collectAnchors(doc, language), opts, doc.title);
  t.setChapterLevel(topLevel(doc.sections));
  t.title(doc.title);
  const plan = tocPlan(doc, style);
  t.setChapterTocDepth(plan.chapter);
  if (plan.general > 0) t.tableOfContents(doc, plan.general);
  for (const b of doc.blocks) t.block(b);
  for (const s of doc.sections) t.section(s);
  t.stats.wordCount = countWords(doc.blocks) + doc.sections.reduce((a, s) => a + sectionWords(s), 0);
  return { rows: t.rows, footnotes: t.footnotes, stats: t.stats, missing: [...new Set(t.missing)], warnings: [...new Set(t.warnings)], title: doc.title };
}

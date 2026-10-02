// Export de haute qualite, etages 3 et 4 : composition d'un paragraphe.
// Lit la mise en forme du texte (gras, italique, liens), mesure les mots avec la police de chacun, place les points de
// cesure, applique les conventions typographiques francaises, coupe le paragraphe en lignes (Knuth et Plass) et calcule
// l'espacement de chaque ligne justifiee d'apres la largeur reelle du texte affiche (ligatures et crenage compris).
import { FINE_SPACE, FontStyle, measureText, NO_BREAK_SPACE } from "./font-metrics";
import { getLanguage, HyphenationLanguage, hyphenPoints, LanguageCode } from "./hyphenate";
import { BOLD_OFF, BOLD_ON, InlineText, ITALIC_OFF, ITALIC_ON, LINK_NUM_END, LINK_OFF, LINK_ON, MATH_END, MATH_ON } from "./inline";
import type { MathAsset } from "./math";
import { breakParagraph, Item } from "./line-break";
import { DEFAULT_TEX_PARAMS, DECENT, Fitness, INF_PENALTY, TexParams } from "./tex-params";
import { leftProtrusion, rightProtrusion } from "./protrusion";
import { frenchSpacing } from "./typography";

export interface ParagraphOptions {
  language: LanguageCode;
  // Taille du texte et largeur de la colonne, en points.
  fontSize: number;
  lineWidth: number;
  // Retrait de la premiere ligne, en points.
  indent: number;
  // `justify` : lignes justifiees. `left` : composition en drapeau (marge droite irreguliere).
  align: `justify` | `left`;
  // Faux pour ne jamais couper les mots (titres).
  hyphenate: boolean;
  // Le dernier mot d'un paragraphe n'est jamais coupe, sauf si l'on demande le contraire.
  hyphenateLastWord?: boolean;
  // Les mots qui commencent par une majuscule (noms propres) peuvent etre coupes ; faux pour l'interdire.
  hyphenateCapitalized?: boolean;
  // Protrusion : en composition justifiee, la ponctuation en bout de ligne depasse dans la marge (voir protrusion.ts).
  protrusion?: boolean;
  // Police de base du paragraphe (gras pour les titres) ; le gras et l'italique du texte s'y ajoutent.
  style?: FontStyle;
  params?: TexParams;
  // Langue de cesure toute faite (par exemple avec les mots que l'utilisateur a ajoutes) ; sinon celle de `language`.
  hyphenation?: HyphenationLanguage;
}

// Morceau de ligne de meme police, a ecrire d'un trait.
export interface LineRun {
  text: string;
  style: FontStyle;
  // Adresse du lien web qui couvre le morceau.
  link?: string;
  // Numero d'appel de note en exposant.
  sup?: boolean;
  // Formule en ligne : dessinee a la place du texte (qui est vide).
  math?: MathAsset;
}

export interface TypesetLine {
  // Texte tel qu'il sera affiche (cesure comprise).
  text: string;
  // Le meme texte, decoupe par police.
  runs: LineRun[];
  // Retrait de la ligne, en points (alinea sur la premiere ligne) ; negatif quand un signe depasse dans la marge gauche.
  offset: number;
  // Largeur supplementaire a donner a chaque espace pour justifier la ligne, en points (negative si l'on comprime).
  wordSpacing: number;
  // Largeur naturelle de la ligne, en points, d'apres la mise en forme reelle du texte affiche.
  width: number;
  ratio: number;
  badness: number;
  fitness: Fitness;
  hyphenated: boolean;
  overfull: boolean;
  // Derniere ligne du paragraphe.
  last: boolean;
  // Appels de notes de bas de page de la ligne : cles des notes, et intervalles du texte a afficher en exposant.
  notes: number[];
  sups: [number, number][];
}

export interface TypesetParagraph {
  lines: TypesetLine[];
  pass: 1 | 2 | 3 | 0;
  demerits: number;
  // Caracteres absents de la police.
  missing: number[];
}

// Appel de note de bas de page prepare par la composition du document : cle de la note, numero affiche.
export const NOTE_CALL = /(\d+),(\d+)/g;
// Taille d'un numero d'appel, en fraction du corps du texte.
export const SUP_SCALE = 0.7;
// Appel de note ou formule en ligne dans un mot.
const SPECIAL = new RegExp(`${NOTE_CALL.source}|${MATH_ON}(\\d+)${MATH_END}`, `g`);

// Vrai si le mot a autre chose que des reperes de style (et le numero qui suit un repere de lien) a afficher.
function hasContent(w: string): boolean {
  return w.replace(/\uE014\d*\uE015/g, ``).replace(/[\uE010-\uE016]/g, ``) !== ``;
}

const WORD_RUN = /[\p{L}\x27’]+/gu;
const APOSTROPHE = /[\x27’]/;

// Style et lien de chaque caractere d'un morceau de mot.
interface CharMeta {
  style: FontStyle;
  link: number;
}

function combine(base: FontStyle, bold: boolean, italic: boolean): FontStyle {
  const b = bold || base === `bold` || base === `boldItalic`;
  const i = italic || base === `italic` || base === `boldItalic`;
  return b ? (i ? `boldItalic` : `bold`) : i ? `italic` : `regular`;
}

function buildItems(input: InlineText, o: ParagraphOptions, p: TexParams, lang: HyphenationLanguage): { items: Item[]; missing: number[] } {
  const items: Item[] = [];
  const missing: number[] = [];
  const size = o.fontSize;
  const base: FontStyle = o.style ?? `regular`;
  const space = measureText(` `, size, base).width;
  const justify = o.align === `justify`;
  const glue = (shown: string): Item => ({ type: `glue`, width: space, stretch: justify ? space * p.spaceStretch : 0, shrink: justify ? space * p.spaceShrink : 0, text: shown, style: base });
  const mins = { left: p.leftHyphenMin, right: p.rightHyphenMin };
  // Etat de la mise en forme, qui se poursuit d'un mot au suivant.
  let bold = false;
  let italic = false;
  let link = -1;
  let gluePending = false;

  const pushBox = (s: string, meta: CharMeta): void => {
    if (s === ``) return;
    if (gluePending) {
      items.push(glue(` `));
      gluePending = false;
    }
    const m = measureText(s, size, meta.style);
    missing.push(...m.missing);
    items.push({ type: `box`, width: m.width, text: s, style: meta.style, ...(meta.link >= 0 ? { link: meta.link } : {}) });
  };
  // Boite dont les caracteres peuvent differer de police ou de lien : une boite par morceau uniforme.
  const pushMeta = (plain: string, meta: CharMeta[], from: number, to: number): void => {
    let start = from;
    for (let i = from + 1; i <= to; i++) {
      if (i === to || meta[i].style !== meta[start].style || meta[i].link !== meta[start].link) {
        pushBox(plain.slice(start, i), meta[start]);
        start = i;
      }
    }
  };
  const pushHyphen = (style: FontStyle): void => {
    items.push({ type: `penalty`, width: measureText(`-`, size, style).width, penalty: p.hyphenPenalty, flagged: true, hyphen: true, text: `-`, style });
  };

  // Un segment est un morceau de mot sans tiret explicite : on y place les points de cesure.
  const pushSegment = (plain: string, meta: CharMeta[], from: number, to: number, hyphenOk: boolean): void => {
    const seg = plain.slice(from, to);
    if (!hyphenOk || !o.hyphenate) {
      pushMeta(plain, meta, from, to);
      return;
    }
    let last = from;
    for (const m of seg.matchAll(WORD_RUN)) {
      const run = m[0];
      const at = from + (m.index ?? 0);
      if (run.length < p.minHyphenWordLength) continue;
      if (o.hyphenateCapitalized === false && run[0] !== run[0].toLowerCase()) continue;
      for (const i of hyphenPoints(run, lang, mins)) {
        // On ne coupe pas juste avant ou juste apres une apostrophe : « l' » ne reste pas seul en fin de ligne.
        if (APOSTROPHE.test(run[i - 1]) || APOSTROPHE.test(run[i])) continue;
        pushMeta(plain, meta, last, at + i);
        pushHyphen(meta[at + i - 1].style);
        last = at + i;
      }
    }
    pushMeta(plain, meta, last, to);
  };

  // Un morceau est un mot sans espace : on le coupe aux tirets explicites, qui sont des points de coupure sans largeur.
  const pushPiece = (plain: string, meta: CharMeta[], hyphenOk: boolean): void => {
    let start = 0;
    for (let i = 1; i < plain.length - 1; i++) {
      if (plain[i] === `-` && /[\p{L}\d]/u.test(plain[i - 1]) && /[\p{L}\d]/u.test(plain[i + 1])) {
        pushSegment(plain, meta, start, i + 1, hyphenOk);
        items.push({ type: `penalty`, width: 0, penalty: p.exHyphenPenalty, flagged: true, text: `` });
        start = i + 1;
      }
    }
    pushSegment(plain, meta, start, plain.length, hyphenOk);
  };

  // Lit les reperes de style d'un texte : renvoie le texte brut et le style de chaque caractere.
  const readMarks = (piece: string): { plain: string; meta: CharMeta[] } => {
    let plain = ``;
    const meta: CharMeta[] = [];
    for (let i = 0; i < piece.length; i++) {
      const ch = piece[i];
      if (ch === BOLD_ON) bold = true;
      else if (ch === BOLD_OFF) bold = false;
      else if (ch === ITALIC_ON) italic = true;
      else if (ch === ITALIC_OFF) italic = false;
      else if (ch === LINK_ON) {
        const end = piece.indexOf(LINK_NUM_END, i);
        link = Number(piece.slice(i + 1, end));
        i = end;
      } else if (ch === LINK_OFF) link = -1;
      else {
        plain += ch;
        meta.push({ style: combine(base, bold, italic), link });
      }
    }
    return { plain, meta };
  };

  // Appel de note de bas de page : numero en exposant, colle au mot qui precede.
  const pushCall = (key: number, label: string): void => {
    if (gluePending) {
      items.push(glue(` `));
      gluePending = false;
    }
    const m = measureText(label, size * SUP_SCALE, `regular`);
    items.push({ type: `box`, width: m.width, text: label, sup: true, note: key, style: `regular` });
  };

  // Formule en ligne : un seul bloc insecable, colle au mot qui precede.
  const pushMath = (asset: MathAsset): void => {
    if (gluePending) {
      items.push(glue(` `));
      gluePending = false;
    }
    items.push({ type: `box`, width: (asset.width * size) / 1000, text: ``, style: base, math: asset });
  };

  const pushPieceWithCalls = (piece: string, hyphenOk: boolean): void => {
    let last = 0;
    const text = (s: string): void => {
      const { plain, meta } = readMarks(s);
      if (plain !== ``) pushPiece(plain, meta, hyphenOk);
    };
    for (const m of piece.matchAll(SPECIAL)) {
      text(piece.slice(last, m.index));
      if (m[3] !== undefined) {
        const asset = input.maths?.[Number(m[3])];
        if (asset) pushMath(asset);
      } else pushCall(Number(m[1]), m[2]);
      last = (m.index ?? 0) + m[0].length;
    }
    text(piece.slice(last));
  };

  const source = o.language === `fr` ? frenchSpacing(input.text) : input.text;
  const words = source.split(/[ \t\r\n]+/).filter((w) => w !== ``);
  // Un paragraphe qui ne contient que des reperes n'a rien a afficher.
  if (words.every((w) => !hasContent(w))) return { items: [], missing };
  if (o.indent > 0) items.push({ type: `box`, width: o.indent, text: `` });
  const lastIndex = (() => {
    let k = -1;
    words.forEach((w, i) => {
      if (hasContent(w)) k = i;
    });
    return k;
  })();
  let started = false;
  words.forEach((word, wi) => {
    const before = items.length;
    const parts = word.split(/([  ])/);
    parts.forEach((part, pi) => {
      if (part === NO_BREAK_SPACE) {
        // Espace insecable : colle etirable devant laquelle on ne coupe pas.
        items.push({ type: `penalty`, width: 0, penalty: INF_PENALTY, flagged: false, text: `` }, glue(NO_BREAK_SPACE));
        gluePending = false;
      } else if (part === FINE_SPACE) {
        // Espace fine insecable : largeur fixe, jamais etiree.
        pushBox(FINE_SPACE, { style: combine(base, bold, italic), link });
      } else {
        const lastPart = wi === lastIndex && pi === parts.length - 1;
        pushPieceWithCalls(part, o.hyphenateLastWord === true || !lastPart);
      }
    });
    if (items.length > before) {
      started = true;
      gluePending = true;
    }
  });
  if (!started) return { items: [], missing };
  items.push(
    { type: `penalty`, width: 0, penalty: INF_PENALTY, flagged: false, text: `` },
    { type: `glue`, width: 0, stretch: 0, shrink: 0, fil: true, text: `` },
    { type: `penalty`, width: 0, penalty: -INF_PENALTY, flagged: false, text: `` }
  );
  return { items, missing };
}

// Morceaux de ligne a partir des elements de la ligne ; les morceaux voisins de meme police et de meme lien sont fusionnes, ce
// qui laisse les ligatures et le crenage se former au-dessus des coupures de cesure invisibles.
function lineRuns(items: Item[], from: number, to: number, base: FontStyle, links: string[]): LineRun[] {
  const runs: LineRun[] = [];
  const add = (text: string, style: FontStyle, link: number | undefined, sup: boolean): void => {
    if (text === ``) return;
    const url = link !== undefined && link >= 0 ? links[link] : undefined;
    const prev = runs[runs.length - 1];
    if (prev && !prev.math && !sup && !prev.sup && prev.style === style && prev.link === url) prev.text += text;
    else runs.push({ text, style, ...(url !== undefined ? { link: url } : {}), ...(sup ? { sup: true } : {}) });
  };
  for (let i = from; i < to; i++) {
    const it = items[i];
    if (it.type === `box` && it.math) {
      runs.push({ text: ``, style: (it.style as FontStyle | undefined) ?? base, math: it.math });
      continue;
    }
    if (it.type === `box`) add(it.text, (it.style as FontStyle | undefined) ?? base, it.link, it.sup === true);
    else if (it.type === `glue` && it.text !== ``) add(it.text, base, undefined, false);
  }
  const end = items[to];
  if (end.type === `penalty` && end.hyphen) add(end.text, (end.style as FontStyle | undefined) ?? base, undefined, false);
  return runs;
}

export function typesetParagraph(text: string | InlineText, o: ParagraphOptions): TypesetParagraph {
  const input: InlineText = typeof text === `string` ? { text, links: [] } : text;
  const p = o.params ?? DEFAULT_TEX_PARAMS;
  const lang = o.hyphenation ?? getLanguage(o.language);
  const base: FontStyle = o.style ?? `regular`;
  const { items, missing } = buildItems(input, o, p, lang);
  if (items.length === 0) return { lines: [], pass: 0, demerits: 0, missing };

  const justify = o.align === `justify`;
  const result = breakParagraph(items, { lineWidth: o.lineWidth, em: o.fontSize, backgroundStretch: justify ? 0 : p.raggedStretch * o.fontSize }, p);
  const space = measureText(` `, o.fontSize, base).width;
  const shrinkOne = space * p.spaceShrink;

  if (!result) {
    // Ne devrait pas arriver apres la passe d'urgence : on se contente d'une coupure au plus court.
    return { lines: singleLine(items, o, input.links), pass: 0, demerits: 0, missing };
  }

  const lines: TypesetLine[] = result.lines.map((bl, index) => {
    const runs = lineRuns(items, bl.from, bl.to, base, input.links);
    const notes: number[] = [];
    for (let i = bl.from; i < bl.to; i++) {
      const it = items[i];
      if (it.type === `box` && it.sup && it.note !== undefined) notes.push(it.note);
    }
    return finishLine(runs, notes, bl, index === result.lines.length - 1, o, items[bl.from], justify, shrinkOne);
  });
  return { lines, pass: result.pass, demerits: result.demerits, missing };
}

// Largeur reelle d'une ligne (d'apres la mise en forme du texte affiche), espacement des mots qui la justifie, texte et
// intervalles en exposant.
function finishLine(
  runs: LineRun[],
  notes: number[],
  bl: { from: number; ratio: number; badness: number; fitness: Fitness; hyphenated: boolean; overfull: boolean },
  last: boolean,
  o: ParagraphOptions,
  firstItem: Item,
  justify: boolean,
  shrinkOne: number
): TypesetLine {
  let text = ``;
  let width = 0;
  let spaces = 0;
  const sups: [number, number][] = [];
  for (const r of runs) {
    if (r.sup) sups.push([text.length, text.length + r.text.length]);
    text += r.text;
    width += r.math ? (r.math.width * o.fontSize) / 1000 : measureText(r.text, o.fontSize * (r.sup ? SUP_SCALE : 1), r.style).width;
    if (!r.sup) for (const ch of r.text) if (ch === ` ` || ch === NO_BREAK_SPACE) spaces++;
  }
  let offset = bl.from === 0 && o.indent > 0 && firstItem.type === `box` && firstItem.text === `` ? o.indent : 0;
  // Protrusion : le premier signe d'une ligne qui n'a pas d'alinea depasse a gauche, le dernier signe d'une ligne justifiee
  // depasse a droite ; la ligne est justifiee sur la largeur de la colonne elargie de ces deux parts.
  let pl = 0;
  let pr = 0;
  if (o.protrusion && justify) {
    const first = runs[0];
    const end = runs[runs.length - 1];
    if (first && offset === 0 && !first.sup && !first.math) {
      const ch = Array.from(first.text)[0] ?? ``;
      pl = leftProtrusion(ch) * measureText(ch, o.fontSize, first.style).width;
    }
    if (end && !last && !end.sup && !end.math) {
      const ch = Array.from(end.text).pop() ?? ``;
      pr = rightProtrusion(ch) * measureText(ch, o.fontSize, end.style).width;
    }
  }
  let wordSpacing = 0;
  if (justify && !last && spaces > 0) {
    // Les espaces absorbent tout l'ecart, sans compression au-dela de la limite des espaces.
    wordSpacing = Math.max(-shrinkOne, (o.lineWidth - offset - width + pl + pr) / spaces);
  }
  offset -= pl;
  return { text, runs, offset, wordSpacing, width, ratio: bl.ratio, badness: bl.badness, fitness: bl.fitness, hyphenated: bl.hyphenated, overfull: bl.overfull, last, notes, sups };
}

// Coupure de secours si l'algorithme n'a trouve aucune solution (ne devrait pas arriver apres la passe d'urgence) : tout le
// paragraphe sur une seule ligne, signalee comme debordante.
function singleLine(items: Item[], o: ParagraphOptions, links: string[]): TypesetLine[] {
  const base: FontStyle = o.style ?? `regular`;
  const runs = lineRuns(items, 0, items.length - 1, base, links);
  const text = runs.map((r) => r.text).join(``);
  const width = runs.reduce((a, r) => a + (r.math ? (r.math.width * o.fontSize) / 1000 : measureText(r.text, o.fontSize * (r.sup ? SUP_SCALE : 1), r.style).width), 0);
  return [{ text, runs, offset: 0, wordSpacing: 0, width, ratio: 0, badness: 0, fitness: DECENT, hyphenated: false, overfull: width > o.lineWidth, last: true, notes: [], sups: [] }];
}

// Export de haute qualite, etages 3 et 4 : composition d'un paragraphe de texte brut.
// Mesure les mots avec la police, place les points de cesure, applique les conventions typographiques francaises, coupe le
// paragraphe en lignes (Knuth et Plass) et calcule l'espacement de chaque ligne justifiee.
import { displayChar, FINE_SPACE, measureText, NO_BREAK_SPACE } from "./font-metrics";
import { getLanguage, HyphenationLanguage, hyphenPoints, LanguageCode } from "./hyphenate";
import { breakParagraph, Item } from "./line-break";
import { DEFAULT_TEX_PARAMS, DECENT, Fitness, INF_PENALTY, TexParams } from "./tex-params";
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
  params?: TexParams;
  // Mots de cesure imposee supplementaires (liste que l'utilisateur enrichit), du type `ordi-nateur`.
  hyphenation?: HyphenationLanguage;
}

export interface TypesetLine {
  // Texte tel qu'il sera affiche (cesure comprise).
  text: string;
  // Retrait de la ligne, en points (alinea sur la premiere ligne).
  offset: number;
  // Largeur supplementaire a donner a chaque espace pour justifier la ligne, en points (negative si l'on comprime).
  wordSpacing: number;
  // Largeur naturelle de la ligne, en points.
  width: number;
  ratio: number;
  badness: number;
  fitness: Fitness;
  hyphenated: boolean;
  overfull: boolean;
  // Derniere ligne du paragraphe.
  last: boolean;
}

export interface TypesetParagraph {
  lines: TypesetLine[];
  pass: 1 | 2 | 3 | 0;
  demerits: number;
  // Caracteres absents de la police.
  missing: number[];
}

const WORD_RUN = /[\p{L}\x27\u2019]+/gu;
const APOSTROPHE = /[\x27\u2019]/;

function buildItems(text: string, o: ParagraphOptions, p: TexParams, lang: HyphenationLanguage): { items: Item[]; missing: number[] } {
  const items: Item[] = [];
  const missing: number[] = [];
  const size = o.fontSize;
  const space = measureText(` `, size).width;
  const justify = o.align === `justify`;
  const glue = (shown: string): Item => ({ type: `glue`, width: space, stretch: justify ? space * p.spaceStretch : 0, shrink: justify ? space * p.spaceShrink : 0, text: shown });
  const hyphenW = measureText(`-`, size).width;
  const mins = { left: p.leftHyphenMin, right: p.rightHyphenMin };

  const pushBox = (s: string): void => {
    if (s === ``) return;
    const m = measureText(s, size);
    missing.push(...m.missing);
    items.push({ type: `box`, width: m.width, text: s });
  };
  const pushHyphen = (): void => {
    items.push({ type: `penalty`, width: hyphenW, penalty: p.hyphenPenalty, flagged: true, hyphen: true, text: `-` });
  };

  // Un segment est un morceau de mot sans tiret explicite : on y place les points de cesure.
  const pushSegment = (seg: string, hyphenOk: boolean): void => {
    if (!hyphenOk || !o.hyphenate) {
      pushBox(seg);
      return;
    }
    let last = 0;
    for (const m of seg.matchAll(WORD_RUN)) {
      const run = m[0];
      const at = m.index ?? 0;
      if (run.length < p.minHyphenWordLength) continue;
      if (o.hyphenateCapitalized === false && run[0] !== run[0].toLowerCase()) continue;
      for (const i of hyphenPoints(run, lang, mins)) {
        // On ne coupe pas juste avant ou juste apres une apostrophe : « l' » ne reste pas seul en fin de ligne.
        if (APOSTROPHE.test(run[i - 1]) || APOSTROPHE.test(run[i])) continue;
        pushBox(seg.slice(last, at + i));
        pushHyphen();
        last = at + i;
      }
    }
    pushBox(seg.slice(last));
  };

  // Un morceau est un mot sans espace : on le coupe aux tirets explicites, qui sont des points de coupure sans largeur.
  const pushPiece = (piece: string, hyphenOk: boolean): void => {
    let start = 0;
    for (let i = 1; i < piece.length - 1; i++) {
      if (piece[i] === `-` && /[\p{L}\d]/u.test(piece[i - 1]) && /[\p{L}\d]/u.test(piece[i + 1])) {
        pushSegment(piece.slice(start, i + 1), hyphenOk);
        items.push({ type: `penalty`, width: 0, penalty: p.exHyphenPenalty, flagged: true, text: `` });
        start = i + 1;
      }
    }
    pushSegment(piece.slice(start), hyphenOk);
  };

  const source = o.language === `fr` ? frenchSpacing(text) : text;
  const words = source.split(/[ \t\r\n]+/).filter((w) => w !== ``);
  if (words.length === 0) return { items: [], missing };
  if (o.indent > 0) items.push({ type: `box`, width: o.indent, text: `` });
  words.forEach((word, wi) => {
    if (wi > 0) items.push(glue(` `));
    const lastWord = wi === words.length - 1;
    const parts = word.split(/([  ])/);
    parts.forEach((part, pi) => {
      if (part === NO_BREAK_SPACE) {
        // Espace insecable : colle etirable devant laquelle on ne coupe pas.
        items.push({ type: `penalty`, width: 0, penalty: INF_PENALTY, flagged: false, text: `` }, glue(NO_BREAK_SPACE));
      } else if (part === FINE_SPACE) {
        // Espace fine insecable : largeur fixe, jamais etiree.
        pushBox(FINE_SPACE);
      } else {
        const lastPart = lastWord && pi === parts.length - 1;
        pushPiece(part, o.hyphenateLastWord === true || !lastPart);
      }
    });
  });
  items.push(
    { type: `penalty`, width: 0, penalty: INF_PENALTY, flagged: false, text: `` },
    { type: `glue`, width: 0, stretch: 0, shrink: 0, fil: true, text: `` },
    { type: `penalty`, width: 0, penalty: -INF_PENALTY, flagged: false, text: `` }
  );
  return { items, missing };
}

export function typesetParagraph(text: string, o: ParagraphOptions): TypesetParagraph {
  const p = o.params ?? DEFAULT_TEX_PARAMS;
  const lang = o.hyphenation ?? getLanguage(o.language);
  const { items, missing } = buildItems(text, o, p, lang);
  if (items.length === 0) return { lines: [], pass: 0, demerits: 0, missing };

  const justify = o.align === `justify`;
  const result = breakParagraph(items, { lineWidth: o.lineWidth, em: o.fontSize, backgroundStretch: justify ? 0 : p.raggedStretch * o.fontSize }, p);
  const space = measureText(` `, o.fontSize).width;
  const stretchOne = space * p.spaceStretch;
  const shrinkOne = space * p.spaceShrink;

  if (!result) {
    // Ne devrait pas arriver apres la passe d'urgence : on se contente d'une coupure au plus court.
    return { lines: greedyLines(items, o), pass: 0, demerits: 0, missing };
  }

  const lines: TypesetLine[] = result.lines.map((bl, index) => {
    let shown = ``;
    let width = 0;
    let stretch = 0;
    let shrink = 0;
    for (let i = bl.from; i < bl.to; i++) {
      const it = items[i];
      if (it.type === `penalty`) continue;
      width += it.width;
      shown += it.text;
      if (it.type === `glue` && !it.fil) {
        stretch += it.stretch;
        shrink += it.shrink;
      }
    }
    const end = items[bl.to];
    if (end.type === `penalty` && end.hyphen) {
      shown += end.text;
      width += end.width;
    }
    const last = index === result.lines.length - 1;
    // Rapport reel : un ecart que la colle ne peut pas absorber (passe d'urgence) reste visible dans l'espacement.
    let ratio = 0;
    if (justify && !last) {
      if (width < o.lineWidth) ratio = stretch > 0 ? (o.lineWidth - width) / stretch : 0;
      else ratio = shrink > 0 ? Math.max(-1, (o.lineWidth - width) / shrink) : -1;
    }
    const wordSpacing = ratio > 0 ? ratio * stretchOne : ratio * shrinkOne;
    return {
      text: Array.from(shown).map(displayChar).join(``),
      offset: bl.from === 0 && o.indent > 0 ? o.indent : 0,
      wordSpacing: justify ? wordSpacing : 0,
      width,
      ratio: bl.ratio,
      badness: bl.badness,
      fitness: bl.fitness,
      hyphenated: bl.hyphenated,
      overfull: bl.overfull,
      last,
    };
  });
  return { lines, pass: result.pass, demerits: result.demerits, missing };
}

// Coupure de secours : remplit chaque ligne autant que possible, sans optimisation.
function greedyLines(items: Item[], o: ParagraphOptions): TypesetLine[] {
  const lines: TypesetLine[] = [];
  let shown = ``;
  let width = 0;
  let pendingGlue: Item | null = null;
  const flush = (last: boolean): void => {
    lines.push({ text: Array.from(shown).map(displayChar).join(``), offset: 0, wordSpacing: 0, width, ratio: 0, badness: 0, fitness: DECENT, hyphenated: false, overfull: width > o.lineWidth, last });
    shown = ``;
    width = 0;
  };
  for (const it of items) {
    if (it.type === `glue`) {
      pendingGlue = it;
    } else if (it.type === `box`) {
      const gap = pendingGlue && shown !== `` ? pendingGlue.width : 0;
      if (shown !== `` && pendingGlue && width + gap + it.width > o.lineWidth) flush(false);
      if (pendingGlue && shown !== ``) {
        shown += pendingGlue.text;
        width += pendingGlue.width;
      }
      shown += it.text;
      width += it.width;
      pendingGlue = null;
    }
  }
  if (shown !== ``) flush(true);
  return lines;
}

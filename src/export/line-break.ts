// Export de haute qualite, etage 4 : coupure d'un paragraphe en lignes par l'algorithme de Knuth et Plass.
// Le paragraphe est une suite de boites (mots), de colle (espaces etirables) et de penalites (endroits ou l'on peut couper,
// avec leur cout). L'algorithme examine toutes les facons de couper le paragraphe entier et retient celle dont le total de
// demerites est le plus faible. Reimplementation d'apres l'article « Breaking Paragraphs into Lines » (1981) et les
// paragraphes 813 a 890 de tex.web (programme de reference de TeX), sans reprise de code.
// Ce module ne depend ni d'Obsidian ni d'une police : il ne manipule que des largeurs.
import { AWFUL_DEMERITS, DECENT, Fitness, INF_BAD, INF_PENALTY, LOOSE, TexParams, TIGHT, VERY_LOOSE } from "./tex-params";

export type Item =
  // Mot ou morceau de mot, de largeur fixe.
  | { type: `box`; width: number; text: string }
  // Espace : largeur naturelle, etirement et compression. `fil` indique un etirement infini (fin de paragraphe).
  | { type: `glue`; width: number; stretch: number; shrink: number; fil?: boolean; text: string }
  // Endroit de coupure possible. `width` est la largeur ajoutee a la ligne si l'on coupe ici (le tiret d'une cesure).
  // `flagged` marque une coupure sur un tiret (pour les demerites de cesures consecutives). `hyphen` marque une cesure
  // automatique, ignoree par la premiere passe.
  | { type: `penalty`; width: number; penalty: number; flagged: boolean; hyphen?: boolean; text: string };

export interface BreakLine {
  // Indice du premier element de la ligne et de l'element ou elle se termine (la colle ou la penalite de coupure).
  from: number;
  to: number;
  // Rapport d'ajustement : negatif si l'on comprime les espaces, positif si on les etire.
  ratio: number;
  badness: number;
  fitness: Fitness;
  // La ligne finit par une cesure ou un tiret.
  hyphenated: boolean;
  // La ligne depasse la largeur permise : la passe d'urgence n'a pas trouve mieux.
  overfull: boolean;
}

export interface BreakResult {
  lines: BreakLine[];
  // Passe qui a trouve la solution : 1 sans cesure, 2 avec cesure, 3 avec etirement d'urgence.
  pass: 1 | 2 | 3;
  demerits: number;
}

export interface BreakOptions {
  lineWidth: number;
  // Taille du texte, pour convertir l'etirement d'urgence (en em) en unites.
  em: number;
  // Etirement ajoute a chaque ligne (composition en drapeau).
  backgroundStretch?: number;
}

// Laideur d'une ligne qui doit s'etirer ou se comprimer de `t` sur une capacite `s` : environ 100 fois (t / s) au cube,
// plafonnee a 10000. Meme formule entiere que tex.web (fonction badness), dont le facteur 297 approche la racine cubique
// de 100 fois 2 puissance 18.
export function badness(t: number, s: number): number {
  if (t <= 0) return 0;
  if (s <= 0) return INF_BAD;
  const r = Math.floor((297 * t) / s);
  if (r > 1290) return INF_BAD;
  return Math.floor((r * r * r + 131072) / 262144);
}

export function fitnessOf(ratio: number, bad: number): Fitness {
  if (ratio < 0) return bad > 12 ? TIGHT : DECENT;
  if (bad > 99) return VERY_LOOSE;
  return bad > 12 ? LOOSE : DECENT;
}

interface Node {
  // Element de coupure (-1 pour le debut du paragraphe) et premier element de la ligne suivante.
  at: number;
  next: number;
  fitness: Fitness;
  demerits: number;
  prev: Node | null;
  hyphenated: boolean;
  ratio: number;
  badness: number;
  overfull: boolean;
}

interface Candidate {
  demerits: number;
  node: Node | null;
  ratio: number;
  badness: number;
  overfull: boolean;
}

// Demerites d'une ligne (tex.web, paragraphe 859).
export function lineDemerits(
  p: Pick<TexParams, `linePenalty` | `adjDemerits` | `doubleHyphenDemerits` | `finalHyphenDemerits`>,
  bad: number,
  penalty: number,
  fitness: Fitness,
  prevFitness: Fitness,
  hyphenated: boolean,
  prevHyphenated: boolean,
  isLast: boolean
): number {
  let d = p.linePenalty + bad;
  d = Math.abs(d) >= 10000 ? AWFUL_DEMERITS : d * d;
  if (penalty > 0) d += penalty * penalty;
  else if (penalty < 0 && penalty > -INF_PENALTY) d -= penalty * penalty;
  if (hyphenated && prevHyphenated) d += isLast ? p.finalHyphenDemerits : p.doubleHyphenDemerits;
  if (Math.abs(fitness - prevFitness) > 1) d += p.adjDemerits;
  return d;
}

function runPass(items: Item[], opts: BreakOptions, p: TexParams, threshold: number, allowHyphens: boolean, background: number, finalPass: boolean): BreakResult | null {
  const n = items.length;
  // Sommes cumulees : W[i] est la somme des elements 0 a i - 1.
  const W = new Array<number>(n + 1).fill(0);
  const Y = new Array<number>(n + 1).fill(0);
  const F = new Array<number>(n + 1).fill(0);
  const Z = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    W[i + 1] = W[i] + (it.type === `penalty` ? 0 : it.width);
    Y[i + 1] = Y[i] + (it.type === `glue` && !it.fil ? it.stretch : 0);
    F[i + 1] = F[i] + (it.type === `glue` && it.fil ? 1 : 0);
    Z[i + 1] = Z[i] + (it.type === `glue` ? it.shrink : 0);
  }
  // Apres une coupure, la colle et les penalites qui suivent sont supprimees jusqu'au premier mot.
  const firstAfter = (k: number): number => {
    let j = k + 1;
    while (j < n && items[j].type !== `box`) j++;
    return j;
  };

  const start: Node = { at: -1, next: 0, fitness: DECENT, demerits: 0, prev: null, hyphenated: false, ratio: 0, badness: 0, overfull: false };
  let active: Node[] = [start];
  let best: Node | null = null;

  for (let b = 0; b < n; b++) {
    const it = items[b];
    let penalty = 0;
    let hyphenated = false;
    if (it.type === `glue`) {
      if (b === 0 || items[b - 1].type !== `box`) continue;
    } else if (it.type === `penalty`) {
      if (it.penalty >= INF_PENALTY || (it.hyphen && !allowHyphens)) continue;
      penalty = it.penalty;
      hyphenated = it.flagged;
    } else {
      continue;
    }
    const forced = penalty <= -INF_PENALTY;
    const isLast = b === n - 1;
    const extra = it.type === `penalty` ? it.width : 0;

    const cands: Candidate[] = [0, 1, 2, 3].map(() => ({ demerits: Infinity, node: null, ratio: 0, badness: 0, overfull: false }));
    let found = false;
    const stays: Node[] = [];

    for (let ai = 0; ai < active.length; ai++) {
      const a = active[ai];
      // Coupure situee dans la colle supprimee apres la coupure precedente : la ligne serait vide.
      if (a.next > b) {
        stays.push(a);
        continue;
      }
      const width = W[b] - W[a.next] + extra;
      const stretch = Y[b] - Y[a.next] + background;
      const fil = F[b] - F[a.next];
      const shrink = Z[b] - Z[a.next];
      const shortfall = opts.lineWidth - width;
      let bad: number;
      let ratio: number;
      if (shortfall > 0) {
        if (fil > 0) {
          bad = 0;
          ratio = 0;
        } else {
          bad = badness(shortfall, stretch);
          ratio = stretch > 0 ? shortfall / stretch : Infinity;
        }
      } else if (shortfall === 0) {
        bad = 0;
        ratio = 0;
      } else if (-shortfall > shrink) {
        bad = INF_BAD + 1;
        ratio = -Infinity;
      } else {
        bad = badness(-shortfall, shrink);
        ratio = shortfall / shrink;
      }
      const fit = fitnessOf(ratio, bad);

      let artificial = false;
      let nodeStays: boolean;
      if (bad > INF_BAD || forced) {
        // Cette ligne ne peut plus etre prolongee. Elle n'est consideree que si elle est acceptable, ou si c'est la
        // derniere chance de la derniere passe (alors on accepte une ligne trop longue plutot que d'echouer).
        // (comme dans TeX : seul le dernier noeud restant de la liste, aucun autre n'ayant ete conserve)
        if (finalPass && !found && stays.length === 0 && ai === active.length - 1) artificial = true;
        else if (bad > threshold) continue;
        nodeStays = false;
      } else {
        if (bad > threshold) {
          stays.push(a);
          continue;
        }
        nodeStays = true;
      }
      if (nodeStays) stays.push(a);
      found = true;
      const d = artificial ? 0 : lineDemerits(p, bad, penalty, fit, a.fitness, hyphenated, a.hyphenated, isLast);
      const total = d + a.demerits;
      if (total < cands[fit].demerits) cands[fit] = { demerits: total, node: a, ratio, badness: bad, overfull: bad > INF_BAD };
    }
    active = stays;

    if (found) {
      const minimum = Math.min(...cands.map((c) => c.demerits));
      const limit = minimum + Math.abs(p.adjDemerits);
      for (const fit of [0, 1, 2, 3] as Fitness[]) {
        const c = cands[fit];
        if (c.node && c.demerits <= limit) {
          const node: Node = { at: b, next: firstAfter(b), fitness: fit, demerits: c.demerits, prev: c.node, hyphenated, ratio: c.ratio, badness: c.badness, overfull: c.overfull };
          active.push(node);
          if (isLast && (!best || node.demerits < best.demerits)) best = node;
        }
      }
    }
    if (active.length === 0) return null;
  }
  if (!best) return null;

  const lines: BreakLine[] = [];
  for (let node: Node | null = best; node && node.prev; node = node.prev) {
    lines.push({ from: node.prev.next, to: node.at, ratio: node.ratio, badness: node.badness, fitness: node.fitness, hyphenated: node.hyphenated, overfull: node.overfull });
  }
  lines.reverse();
  return { lines, pass: 1, demerits: best.demerits };
}

// Coupe le paragraphe en lignes, en trois passes comme TeX : sans cesure avec un seuil de laideur severe, puis avec cesure
// et un seuil plus large, puis avec un etirement d'urgence. Le paragraphe doit se terminer par une penalite de -10000
// (coupure obligatoire), precedee d'une colle de fin de paragraphe a etirement infini.
export function breakParagraph(items: Item[], opts: BreakOptions, p: TexParams): BreakResult | null {
  const background = opts.backgroundStretch ?? 0;
  if (p.pretolerance >= 0) {
    const r = runPass(items, opts, p, p.pretolerance, false, background, false);
    if (r) return { ...r, pass: 1 };
  }
  const emergency = p.emergencyStretch * opts.em;
  const second = runPass(items, opts, p, p.tolerance, true, background, emergency <= 0);
  if (second) return { ...second, pass: 2 };
  if (emergency > 0) {
    const third = runPass(items, opts, p, p.tolerance, true, background + emergency, true);
    if (third) return { ...third, pass: 3 };
  }
  return null;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { badness, breakParagraph, fitnessOf, Item, lineDemerits } from "../src/export/line-break";
import { DEFAULT_TEX_PARAMS, TexParams } from "../src/export/tex-params";

const P: TexParams = { ...DEFAULT_TEX_PARAMS };
const box = (width: number, text = `m`): Item => ({ type: `box`, width, text });
const glue = (): Item => ({ type: `glue`, width: 10, stretch: 5, shrink: 3, text: ` ` });
const END: Item[] = [
  { type: `penalty`, width: 0, penalty: 10000, flagged: false, text: `` },
  { type: `glue`, width: 0, stretch: 0, shrink: 0, fil: true, text: `` },
  { type: `penalty`, width: 0, penalty: -10000, flagged: false, text: `` },
];
const hyphen = (): Item => ({ type: `penalty`, width: 5, penalty: P.hyphenPenalty, flagged: true, hyphen: true, text: `-` });

// Mots separes par de la colle, suivis de la fin de paragraphe.
function paragraph(widths: number[]): Item[] {
  const items: Item[] = [];
  widths.forEach((w, i) => {
    if (i > 0) items.push(glue());
    items.push(box(w));
  });
  return [...items, ...END];
}

test(`la laideur suit la formule de TeX : 100 fois le rapport au cube, plafonnee a 10000`, () => {
  assert.equal(badness(0, 5), 0);
  assert.equal(badness(5, 0), 10000);
  assert.equal(badness(1, 1), 100);
  assert.equal(badness(1, 2), 12);
  assert.equal(badness(2, 1), 800);
  assert.equal(badness(30, 1), 10000);
});

test(`les classes d'espacement se deduisent du rapport et de la laideur`, () => {
  assert.equal(fitnessOf(0.2, 8), 2);
  assert.equal(fitnessOf(0.6, 22), 1);
  assert.equal(fitnessOf(1.2, 172), 0);
  assert.equal(fitnessOf(-0.5, 12), 2);
  assert.equal(fitnessOf(-0.8, 51), 3);
});

test(`les demerites d'une ligne sont calcules comme dans TeX`, () => {
  // (10 + 12) au carre
  assert.equal(lineDemerits(P, 12, 0, 2, 2, false, false, false), 484);
  // plus le carre de la penalite de coupure
  assert.equal(lineDemerits(P, 12, 50, 2, 2, true, false, false), 484 + 2500);
  // moins le carre d'une penalite negative
  assert.equal(lineDemerits(P, 12, -50, 2, 2, false, false, false), 484 - 2500);
  // cesures consecutives
  assert.equal(lineDemerits(P, 12, 50, 2, 2, true, true, false), 484 + 2500 + 10000);
  assert.equal(lineDemerits(P, 12, 50, 2, 2, true, true, true), 484 + 2500 + 5000);
  // classes d'espacement qui different de plus de 1
  assert.equal(lineDemerits(P, 12, 0, 0, 2, false, false, false), 484 + 10000);
  assert.equal(lineDemerits(P, 12, 0, 1, 2, false, false, false), 484);
  // ligne infiniment laide
  assert.equal(lineDemerits(P, 10000, 0, 0, 2, false, false, false) >= 100000000, true);
});

test(`un paragraphe dont les lignes tombent juste donne la solution calculee a la main`, () => {
  // 60 + 10 + 30 = 100 exactement, puis 50 sur la derniere ligne : deux lignes de laideur nulle, 100 + 100 demerites.
  const items = paragraph([60, 30, 50]);
  const r = breakParagraph(items, { lineWidth: 100, em: 10 }, P)!;
  assert.equal(r.pass, 1);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines.map((l) => [l.from, l.to, l.badness]), [[0, 3, 0], [4, 7, 0]]);
  assert.equal(r.demerits, 200);
});

test(`l'optimum global evite une ligne tres lache que le remplissage au plus court produirait`, () => {
  // Largeur 100. Au plus court : 60 10 30 (=100), puis 55 seul. Mieux : ici les deux solutions existent ; on verifie
  // que la solution retenue est de cout minimal en la comparant a une recherche exhaustive (voir test suivant).
  const r = breakParagraph(paragraph([45, 45, 45, 45]), { lineWidth: 100, em: 10 }, P)!;
  assert.equal(r.lines.length, 2);
  // 45 + 10 + 45 = 100 : deux lignes parfaites.
  assert.deepEqual(r.lines.map((l) => l.badness), [0, 0]);
});

// Recherche exhaustive, independante de l'algorithme : essaie tous les ensembles de coupures sur la colle.
function bruteForce(widths: number[], lineWidth: number, p: TexParams = P): number {
  const n = widths.length;
  const stretch = 5;
  const shrink = 3;
  const gap = 10;
  let best = Infinity;
  // Une coupure apres le mot i (0 a n - 2) : masque binaire.
  for (let mask = 0; mask < 1 << (n - 1); mask++) {
    let total = 0;
    let prevFit = 2;
    let from = 0;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const last = i === n - 1;
      if (!last && !(mask & (1 << i))) continue;
      const count = i - from + 1;
      const natural = widths.slice(from, i + 1).reduce((a, b) => a + b, 0) + gap * (count - 1);
      const gaps = count - 1;
      const shortfall = lineWidth - natural;
      let bad: number;
      let ratio: number;
      if (last && shortfall > 0) {
        bad = 0;
        ratio = 0;
      } else if (shortfall > 0) {
        bad = badness(shortfall, stretch * gaps);
        ratio = gaps > 0 ? shortfall / (stretch * gaps) : Infinity;
      } else if (-shortfall > shrink * gaps) {
        ok = false;
        break;
      } else {
        bad = shortfall === 0 ? 0 : badness(-shortfall, shrink * gaps);
        ratio = shortfall === 0 ? 0 : shortfall / (shrink * gaps);
      }
      const fit = fitnessOf(ratio, bad);
      total += lineDemerits(p, bad, last ? -10000 : 0, fit, prevFit, false, false, last);
      prevFit = fit;
      from = i + 1;
    }
    if (ok && total < best) best = total;
  }
  return best;
}

test(`le resultat est de cout minimal : comparaison avec une recherche exhaustive`, () => {
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // Plusieurs valeurs de adjDemerits : plus elles sont faibles, plus le choix de la classe d'espacement de chaque
  // coupure compte, et plus la recherche exhaustive met l'elagage de l'algorithme a l'epreuve.
  for (const adj of [10000, 2000, 300]) {
    // Passe 1 avec un seuil de 10000 : ni cesure ni passe d'urgence, donc aucune ligne forcee artificiellement.
    const params: TexParams = { ...P, pretolerance: 10000, tolerance: 10000, emergencyStretch: 0, adjDemerits: adj };
    for (let t = 0; t < 150; t++) {
      const n = 6 + Math.floor(rnd() * 9);
      const widths = Array.from({ length: n }, () => 10 + Math.floor(rnd() * 50));
      const lineWidth = 100 + Math.floor(rnd() * 40);
      const r = breakParagraph(paragraph(widths), { lineWidth, em: 10 }, params);
      assert.ok(r, `essai ${t}`);
      assert.equal(r!.demerits, bruteForce(widths, lineWidth, params), `adj ${adj}, essai ${t} : ${widths.join(`,`)} sur ${lineWidth}`);
    }
  }
});

test(`la cesure n'est utilisee que si la premiere passe echoue`, () => {
  // Trois mots de 55, dont chacun peut se couper en 25 + tiret + 30. Sans cesure, 55 + 10 + 55 depasse 100 et un mot seul
  // ne remplit pas la ligne : la premiere passe echoue. Avec cesure, la premiere ligne devient 55 + 10 + 25 + tiret = 95.
  const word = (): Item[] => [box(25), hyphen(), box(30)];
  const items: Item[] = [...word(), glue(), ...word(), glue(), ...word(), ...END];
  const r = breakParagraph(items, { lineWidth: 100, em: 10 }, P)!;
  assert.ok(r);
  assert.equal(r.pass, 2);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].hyphenated, true);
  assert.equal(r.lines[1].hyphenated, false);
  // Sans point de cesure possible, les lignes ne contiennent jamais de tiret.
  const plain: Item[] = [box(55), glue(), box(55), glue(), box(55), ...END];
  const r2 = breakParagraph(plain, { lineWidth: 100, em: 10 }, { ...P, emergencyStretch: 3 })!;
  assert.ok(r2.lines.every((l) => !l.hyphenated));
});

test(`deux cesures consecutives sont decouragees`, () => {
  const word = (): Item[] => [box(40), hyphen(), box(40), hyphen(), box(40)];
  const items: Item[] = [...word(), ...END];
  const params: TexParams = { ...P, pretolerance: -1, tolerance: 10000 };
  const cheap = breakParagraph(items, { lineWidth: 90, em: 10 }, { ...params, doubleHyphenDemerits: 0 })!;
  const dear = breakParagraph(items, { lineWidth: 90, em: 10 }, params)!;
  assert.ok(cheap && dear);
  assert.ok(dear.demerits >= cheap.demerits);
});

test(`un mot plus large que la ligne est signale comme debordant apres la passe d'urgence`, () => {
  const items: Item[] = [box(150), glue(), box(20), ...END];
  const r = breakParagraph(items, { lineWidth: 100, em: 10 }, P)!;
  assert.ok(r);
  assert.equal(r.pass, 3);
  assert.equal(r.lines[0].overfull, true);
  assert.equal(r.lines[r.lines.length - 1].overfull, false);
});

test(`la composition en drapeau accepte les lignes courtes grace a l'etirement de fond`, () => {
  // Colle sans etirement : sans etirement de fond, une ligne a 80 % ne serait pas acceptable.
  const rigid = (): Item => ({ type: `glue`, width: 10, stretch: 0, shrink: 0, text: ` ` });
  const items: Item[] = [box(40), rigid(), box(30), rigid(), box(40), rigid(), box(30), ...END];
  const without = breakParagraph(items, { lineWidth: 100, em: 10 }, { ...P, emergencyStretch: 0 });
  const withBg = breakParagraph(items, { lineWidth: 100, em: 10, backgroundStretch: 20 }, { ...P, emergencyStretch: 0 })!;
  assert.ok(withBg);
  assert.equal(withBg.pass, 1);
  assert.ok(without === null || without.pass > 1 || without.lines.length >= withBg.lines.length);
});

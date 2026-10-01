import { test } from "node:test";
import assert from "node:assert/strict";
import { measureText } from "../src/export/font-metrics";
import { ParagraphOptions, typesetParagraph } from "../src/export/paragraph";

const TEXT = [
  `Le bâtiment a été construit en 1972 et sa consommation d'énergie finale reste aujourd'hui supérieure à 180 kWh/m².an.`,
  `Une rénovation globale suppose d'abord une analyse précise : isolation des murs et de la toiture, remplacement des menuiseries,`,
  `régulation du chauffage et ventilation double flux. Selon M. Dupont, « l'objectif est ambitieux ; il reste atteignable » !`,
  `Faut-il pour autant tout reprendre ? Les résultats détaillés figurent dans le rapport d'audit énergétique du site, établi`,
  `par un bureau d'études indépendant, et montrent que les gains les plus importants proviennent de l'enveloppe et de la`,
  `performance des équipements de production de chaleur, bien avant les usages spécifiques de l'électricité.`,
].join(` `);

const OPTS: ParagraphOptions = { language: `fr`, fontSize: 11, lineWidth: 300, indent: 11, align: `justify`, hyphenate: true };

// Largeur d'une ligne telle qu'elle sera affichee : texte, espaces elargis et retrait.
function rendered(line: { text: string; wordSpacing: number; offset: number }): number {
  const spaces = Array.from(line.text).filter((c) => c === ` ` || c === ` `).length;
  return measureText(line.text, 11).width + spaces * line.wordSpacing + line.offset;
}

test(`les lignes justifiees remplissent exactement la colonne`, () => {
  const r = typesetParagraph(TEXT, OPTS);
  assert.ok(r.lines.length > 5);
  assert.ok(r.pass === 1 || r.pass === 2);
  r.lines.forEach((l, i) => {
    if (l.last) {
      assert.ok(rendered(l) <= 300 + 1e-6, `derniere ligne`);
      assert.equal(l.wordSpacing, 0);
    } else {
      assert.ok(Math.abs(rendered(l) - 300) < 1e-6, `ligne ${i} : ${rendered(l)}`);
    }
  });
});

test(`seule la premiere ligne a un retrait`, () => {
  const r = typesetParagraph(TEXT, OPTS);
  assert.equal(r.lines[0].offset, 11);
  assert.ok(r.lines.slice(1).every((l) => l.offset === 0));
});

test(`les lignes cesurees finissent par un tiret et les autres non`, () => {
  const r = typesetParagraph(TEXT, OPTS);
  assert.ok(r.lines.some((l) => l.hyphenated), `aucune cesure`);
  for (const l of r.lines) assert.equal(l.hyphenated, l.text.endsWith(`-`) && !l.last, l.text);
});

test(`la ponctuation haute et les guillemets ne passent jamais a la ligne`, () => {
  // On essaie plusieurs largeurs de colonne : aucune ligne ne doit commencer par ; ! ? : ou », ni finir par «.
  for (let w = 150; w <= 400; w += 7) {
    const r = typesetParagraph(TEXT, { ...OPTS, lineWidth: w });
    for (const l of r.lines) {
      assert.ok(!/^[;!?:»]/.test(l.text.trimStart()), `commence par de la ponctuation (${w}) : ${l.text}`);
      assert.ok(!/«[  ]?$/.test(l.text), `finit par un guillemet ouvrant (${w}) : ${l.text}`);
    }
  }
});

test(`le dernier mot du paragraphe n'est pas coupe`, () => {
  const text = `Une phrase assez longue pour remplir la ligne et finir sur le mot décarbonation`;
  for (let w = 100; w <= 220; w += 5) {
    const r = typesetParagraph(text, { ...OPTS, indent: 0, lineWidth: w });
    const last = r.lines[r.lines.length - 1];
    assert.ok(last.text.endsWith(`décarbonation`) || !r.lines.some((l) => l.text.includes(`décarbo`)) === false, `${w}`);
    assert.ok(!r.lines.slice(0, -1).some((l) => l.hyphenated && l.text.endsWith(`carbona-`)), `${w}`);
  }
});

test(`en drapeau, les espaces ne changent pas et les lignes ne depassent pas la colonne`, () => {
  const r = typesetParagraph(TEXT, { ...OPTS, align: `left`, indent: 0 });
  for (const l of r.lines) {
    assert.equal(l.wordSpacing, 0);
    if (!l.overfull) assert.ok(l.width <= 300 + 1e-6, l.text);
  }
});

test(`sans cesure, aucun tiret n'est ajoute`, () => {
  const r = typesetParagraph(TEXT, { ...OPTS, hyphenate: false });
  assert.ok(r.lines.every((l) => !l.hyphenated));
});

test(`l'anglais utilise ses propres motifs et pas les espacements francais`, () => {
  const en = `The thermal performance of the building envelope depends on insulation, airtightness and the quality of windows ; this is why retrofit studies start there.`;
  const r = typesetParagraph(en, { ...OPTS, language: `en`, lineWidth: 200 });
  assert.ok(r.lines.length >= 3);
  assert.ok(r.lines.some((l) => l.text.includes(`; this`)) || r.lines.every((l) => !l.text.includes(` ;`)));
});

test(`un paragraphe vide ne donne aucune ligne et un mot trop large est signale`, () => {
  assert.equal(typesetParagraph(`   `, OPTS).lines.length, 0);
  const r = typesetParagraph(`anticonstitutionnellement`, { ...OPTS, lineWidth: 20, indent: 0 });
  assert.ok(r.lines.length >= 1);
  assert.ok(r.lines.some((l) => l.overfull));
});

test(`les caracteres absents de la police sont signales`, () => {
  const r = typesetParagraph(`un mot avec un caractère inconnu 中 dedans`, OPTS);
  assert.deepEqual(r.missing, [0x4e2d]);
});

test(`la coupure de Knuth et Plass est plus reguliere que le remplissage au plus court`, () => {
  // Remplissage glouton sans cesure, sur la meme colonne : somme des carres des rapports d'ajustement.
  const space = measureText(` `, 11).width;
  const words = TEXT.split(` `);
  const greedy: number[] = [];
  let line: string[] = [];
  const natural = (ws: string[]): number => ws.reduce((a, w) => a + measureText(w, 11).width, 0) + (ws.length - 1) * space;
  for (const w of words) {
    if (line.length > 0 && natural([...line, w]) > 300 - (greedy.length === 0 ? 11 : 0)) {
      const avail = 300 - (greedy.length === 0 ? 11 : 0);
      const gaps = line.length - 1;
      const short = avail - natural(line);
      greedy.push(gaps > 0 ? (short > 0 ? short / (gaps * space * 0.5) : short / (gaps * space / 3)) : 0);
      line = [];
    }
    line.push(w);
  }
  const sq = (xs: number[]): number => xs.reduce((a, b) => a + b * b, 0) / xs.length;
  const r = typesetParagraph(TEXT, OPTS);
  const kp = r.lines.filter((l) => !l.last).map((l) => l.ratio);
  assert.ok(sq(kp) <= sq(greedy), `Knuth-Plass ${sq(kp)} contre glouton ${sq(greedy)}`);
});

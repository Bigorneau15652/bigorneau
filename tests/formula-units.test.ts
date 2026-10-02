import { test } from "node:test";
import assert from "node:assert/strict";
import { colorUnit, deleteUnit, svgLeaves, texUnits, unitsAt } from "../src/formula-units";
import { renderTexSvg } from "../src/export/mathjax";

const texts = (tex: string): string[] => texUnits(tex).map((u) => tex.slice(u.start, u.end));

test(`une fraction donne ses deux arguments et l'ensemble`, () => {
  const t = String.raw`\frac{a+1}{b}`;
  const found = texts(t);
  for (const expected of [`a+1`, `b`, t, `a`, `1`, `+`]) assert.ok(found.includes(expected), `${expected} dans ${JSON.stringify(found)}`);
});

test(`une racine avec indice garde l'indice, le contenu et l'ensemble`, () => {
  const t = String.raw`\sqrt[3]{c}`;
  const found = texts(t);
  for (const expected of [`3`, `c`, t]) assert.ok(found.includes(expected), expected);
});

test(`un exposant avec sa base forment une unite, et l'argument du signe aussi`, () => {
  const t = `x^{2}+y_1`;
  const found = texts(t);
  for (const expected of [`x^{2}`, `2`, `y_1`, `1`, `x`, `y`]) assert.ok(found.includes(expected), `${expected} dans ${JSON.stringify(found)}`);
});

test(`une matrice, \\left...\\right et les sommes avec bornes`, () => {
  const m = String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`;
  const f = texts(m);
  for (const expected of [m, `a`, `b`, `c`, `d`]) assert.ok(f.includes(expected), expected);
  const l = String.raw`\left( x+1 \right)`;
  assert.ok(texts(l).includes(l));
  const s = String.raw`\sum_{i=1}^{n} i`;
  const g = texts(s);
  for (const expected of [String.raw`\sum_{i=1}^{n}`, `i=1`, `n`]) assert.ok(g.includes(expected), expected);
});

test(`les chiffres se groupent et les plages sont dans le texte`, () => {
  assert.ok(texts(`12,5`).includes(`12`));
  for (const u of texUnits(String.raw`\frac{\sqrt{x}}{\left[ 2 \right]}+\alpha^2_{ij}`)) assert.ok(u.start >= 0 && u.end > u.start);
  // Texte incomplet : aucune boucle infinie ni plage hors du texte.
  for (const t of [String.raw`\frac{`, String.raw`\left(`, String.raw`x^`, `}{`, String.raw`\begin{pmatrix} a`, String.raw`\sqrt[3`]) {
    for (const u of texUnits(t)) assert.ok(u.end <= t.length, t);
  }
});

test(`la suppression d'une unite efface toute la partie`, () => {
  const t = String.raw`a+\sqrt[3]{c}+b`;
  const root = texUnits(t).find((u) => t.slice(u.start, u.end) === String.raw`\sqrt[3]{c}`);
  assert.ok(root);
  assert.equal(deleteUnit(t, root).text, `a++b`);
  // Un exposant disparait avec son signe, un argument de fraction laisse son emplacement.
  const p = `x^{2}+1`;
  const two = texUnits(p).find((u) => p.slice(u.start, u.end) === `2`);
  assert.ok(two);
  assert.equal(deleteUnit(p, two).text, `x+1`);
  const f = String.raw`\frac{a}{b}`;
  const a = texUnits(f).find((u) => f.slice(u.start, u.end) === `a`);
  assert.ok(a);
  assert.equal(deleteUnit(f, a).text, String.raw`\frac{}{b}`);
});

test(`le dessin colore d'une unite donne les elements qui lui appartiennent`, () => {
  const tex = String.raw`\frac{a}{b}+x^{2}`;
  const base = renderTexSvg(tex, false);
  assert.ok(base);
  const leaves = svgLeaves(base);
  // a, b, la barre de fraction, +, x, 2.
  assert.equal(leaves.length, 6);
  assert.ok(leaves.every((l) => l.color === null));
  const units = texUnits(tex);
  const sets = units.map((u) => {
    const v = renderTexSvg(colorUnit(tex, u, `red`), false);
    assert.ok(v, tex.slice(u.start, u.end));
    const l = svgLeaves(v);
    assert.equal(l.length, leaves.length, `meme nombre d'elements pour ${tex.slice(u.start, u.end)}`);
    return l.flatMap((e, k) => (e.color === `red` ? [k] : []));
  });
  const setOf = (s: string): number[] => sets[units.findIndex((u) => tex.slice(u.start, u.end) === s)];
  assert.deepEqual(setOf(String.raw`\frac{a}{b}`), [0, 1, 2]);
  assert.deepEqual(setOf(`a`), [0]);
  assert.deepEqual(setOf(`x^{2}`), [4, 5]);
  assert.deepEqual(setOf(`2`), [5]);
  // Cliquer sur le « 2 » propose d'abord le « 2 », puis x^{2}.
  const order = unitsAt(units, sets, 5).map((u) => tex.slice(u.start, u.end));
  assert.deepEqual(order, [`2`, `x^{2}`]);
  // Cliquer sur la barre propose la fraction entiere.
  assert.deepEqual(unitsAt(units, sets, 2).map((u) => tex.slice(u.start, u.end)), [String.raw`\frac{a}{b}`]);
});

test(`chaque unite d'une matrice, d'une racine et de parentheses se dessine en couleur sans changer le dessin`, () => {
  for (const tex of [String.raw`\sqrt[3]{c}+\left( a \right)`, String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`, String.raw`\sum_{i=1}^{n} i^2`, String.raw`\binom{n}{k}\overline{x}`]) {
    const base = renderTexSvg(tex, true);
    assert.ok(base, tex);
    const n = svgLeaves(base).length;
    for (const u of texUnits(tex)) {
      const v = renderTexSvg(colorUnit(tex, u, `red`), true);
      assert.ok(v, `${tex} : ${tex.slice(u.start, u.end)}`);
      assert.equal(svgLeaves(v).length, n, `${tex} : ${tex.slice(u.start, u.end)}`);
    }
  }
});

import { eraseAt, pickVertical, previewTex, stepPoint, texModel, typeKey, unitEndingAt } from "../src/formula-units";

test(`les points de curseur et les emplacements vides d'une fraction`, () => {
  const t = String.raw`\frac{}{b}+x^{}`;
  const m = texModel(t);
  assert.deepEqual(m.slots, [6, t.indexOf(`^{`) + 2]);
  // Debut et fin de chaque suite, et entre les elements : numerateur vide, denominateur, apres la fraction, apres le +.
  for (const p of [0, 6, 8, 9, t.indexOf(`+`) + 1]) assert.ok(m.points.includes(p), `point ${p} dans ${m.points}`);
  assert.ok(!m.points.includes(2), `pas de point au milieu d'un nom de commande`);
  assert.deepEqual(texModel(`{}`).slots, [1]);
  assert.deepEqual(texModel(String.raw`\sqrt[]{x}`).slots, [6]);
});

test(`les fleches avancent et reculent de point en point, une selection se replie sur son bord`, () => {
  const points = [0, 3, 5, 9];
  assert.equal(stepPoint(points, 3, 3, 1), 5);
  assert.equal(stepPoint(points, 3, 3, -1), 0);
  assert.equal(stepPoint(points, 9, 9, 1), null);
  assert.equal(stepPoint(points, 0, 0, -1), null);
  assert.equal(stepPoint(points, 3, 9, 1), 9);
  assert.equal(stepPoint(points, 3, 9, -1), 3);
});

test(`haut et bas choisissent la rangee voisine puis le point le plus proche horizontalement`, () => {
  const spots = [
    { offset: 1, x: 10, y: 0 },
    { offset: 2, x: 50, y: 0 },
    { offset: 3, x: 30, y: 40 },
    { offset: 4, x: 90, y: 41 },
    { offset: 5, x: 30, y: 80 },
  ];
  assert.equal(pickVertical(spots, { x: 48, y: 0 }, `down`, 10)?.offset, 3);
  assert.equal(pickVertical(spots, { x: 95, y: 40 }, `up`, 10)?.offset, 2);
  assert.equal(pickVertical(spots, { x: 30, y: 40 }, `down`, 10)?.offset, 5);
  assert.equal(pickVertical(spots, { x: 30, y: 80 }, `down`, 10), null);
  assert.equal(pickVertical(spots, { x: 10, y: 0 }, `up`, 10), null);
});

test(`la frappe dans la vue : caractere, exposant, indice et fraction avec l'element precedent`, () => {
  const units = (t: string) => texModel(t).units;
  assert.deepEqual(typeKey(`ab`, 1, 1, `x`, units(`ab`)), { text: `axb`, start: 2, end: 2 });
  assert.deepEqual(typeKey(`ab`, 1, 2, `x`, units(`ab`)), { text: `ax`, start: 2, end: 2 });
  assert.deepEqual(typeKey(`x`, 1, 1, `^`, units(`x`)), { text: `x^{}`, start: 3, end: 3 });
  assert.deepEqual(typeKey(`x`, 1, 1, `_`, units(`x`)), { text: `x_{}`, start: 3, end: 3 });
  // a/ devient \frac{a}{} avec le curseur dans le denominateur ; un nombre entier passe au numerateur.
  const f = typeKey(`12`, 2, 2, `/`, units(`12`));
  assert.equal(f?.text, String.raw`\frac{12}{}`);
  assert.equal(f?.start, String.raw`\frac{12}{`.length);
  const g = typeKey(`a+b`, 3, 3, `/`, units(`a+b`));
  assert.equal(g?.text, String.raw`a+\frac{b}{}`);
  // Sans element precedent, la barre oblique est un simple caractere.
  assert.equal(typeKey(``, 0, 0, `/`, [])?.text, `/`);
});

test(`Retour arriere et Suppr dans la vue effacent l'unite entiere, sauf un chiffre d'un nombre`, () => {
  const t = String.raw`a+\sqrt[3]{c}`;
  const u = texModel(t).units;
  assert.deepEqual(eraseAt(t, t.length, t.length, -1, u), { text: `a+`, start: 2, end: 2 });
  assert.deepEqual(eraseAt(t, 1, 1, 1, u)?.text, String.raw`a\sqrt[3]{c}`);
  assert.equal(eraseAt(t, 0, 0, -1, u), null);
  assert.deepEqual(eraseAt(`x12`, 3, 3, -1, texModel(`x12`).units), { text: `x1`, start: 2, end: 2 });
  assert.deepEqual(eraseAt(`x12`, 1, 1, 1, texModel(`x12`).units), { text: `x2`, start: 1, end: 1 });
  // Une selection qui est une unite part avec son signe d'exposant.
  const p = `x^{2}`;
  assert.deepEqual(eraseAt(p, 3, 4, -1, texModel(p).units)?.text, `x`);
  assert.equal(unitEndingAt(texModel(p).units, 5)?.start, 0);
  // Retour arriere dans un exposant vide supprime l'exposant.
  assert.deepEqual(eraseAt(`x^{}+1`, 3, 3, -1, texModel(`x^{}+1`).units), { text: `x+1`, start: 1, end: 1 });
});

test(`l'apercu montre un carre dans chaque emplacement vide, et chaque emplacement ou unite se repere par sa couleur`, () => {
  const t = String.raw`\frac{}{b}+\sqrt[]{x}`;
  const m = texModel(t);
  const shown = previewTex(t, m.slots);
  assert.equal(shown, String.raw`\frac{\square}{b}+\sqrt[\square]{x}`);
  const base = renderTexSvg(shown, true);
  assert.ok(base);
  const n = svgLeaves(base).length;
  const reds = m.slots.map((s) => {
    const v = renderTexSvg(previewTex(t, m.slots, { color: `red`, slot: s }), true);
    assert.ok(v, `emplacement ${s}`);
    const l = svgLeaves(v);
    assert.equal(l.length, n);
    return l.flatMap((e, k) => (e.color === `red` ? [k] : []));
  });
  assert.deepEqual(reds.map((r) => r.length), [1, 1]);
  assert.notDeepEqual(reds[0], reds[1]);
  // Une unite coloree en meme temps que les carres garde le meme nombre d'elements.
  for (const u of m.units) {
    const v = renderTexSvg(previewTex(t, m.slots, { color: `red`, unit: u }), true);
    assert.ok(v, t.slice(u.start, u.end));
    assert.equal(svgLeaves(v).length, n, t.slice(u.start, u.end));
  }
});

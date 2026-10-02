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

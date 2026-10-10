import test from "node:test";
import assert from "node:assert/strict";
import { rangeBetween, toggled } from "../src/selection";
import { moveNodes } from "../src/edit";
import { flattenDoc, parseNote } from "../src/model";

const ORDER = [`r`, `r.0`, `r.0.0`, `r.1`, `r.2`];

test(`plage entre deux titres, dans les deux sens`, () => {
  assert.deepEqual(rangeBetween(ORDER, `r.0`, `r.1`), [`r.0`, `r.0.0`, `r.1`]);
  assert.deepEqual(rangeBetween(ORDER, `r.2`, `r.0.0`), [`r.0.0`, `r.1`, `r.2`]);
  assert.deepEqual(rangeBetween(ORDER, `r.1`, `r.1`), [`r.1`]);
});

test(`plage avec une cle inconnue`, () => {
  assert.deepEqual(rangeBetween(ORDER, `zz`, `r.1`), [`r.1`]);
  assert.deepEqual(rangeBetween(ORDER, `r.1`, `zz`), [`r.1`]);
  assert.deepEqual(rangeBetween(ORDER, `zz`, `yy`), []);
});

test(`bascule d'un titre`, () => {
  assert.deepEqual(toggled([`a`, `b`], `c`), [`a`, `b`, `c`]);
  assert.deepEqual(toggled([`a`, `b`], `a`), [`b`]);
});

const NOTE = `## A\n\n### A1\n\n## B\n\n## C\n\n### C1\n\n## D\n\n## E\n`;
const titles = (text: string): string[] => flattenDoc(parseNote(text, `n.md`)).filter((e) => e.key !== `r`).map((e) => `${e.node.level}:${e.node.title}`);

test(`deplacement de deux titres vers la fin, avec leurs sous-titres`, () => {
  const before = titles(NOTE).length;
  const r = moveNodes(NOTE, `n.md`, [`r.0`, `r.2`], `r.0`, `r`, 4)!;
  assert.ok(r);
  const after = titles(r.text);
  assert.equal(after.length, before);
  assert.deepEqual(after, [`2:B`, `2:D`, `2:E`, `2:A`, `3:A1`, `2:C`, `3:C1`]);
});

test(`deplacement de groupe : les titres prennent le niveau de la destination`, () => {
  const r = moveNodes(NOTE, `n.md`, [`r.1`, `r.3`], `r.1`, `r.0`, 1)!;
  assert.ok(r);
  assert.deepEqual(titles(r.text), [`2:A`, `3:A1`, `3:B`, `3:D`, `2:C`, `3:C1`, `2:E`]);
});

test(`deplacement de groupe : destination avant un titre deplace`, () => {
  const r = moveNodes(NOTE, `n.md`, [`r.1`, `r.3`], `r.3`, `r`, 2)!;
  assert.ok(r);
  assert.deepEqual(titles(r.text), [`2:A`, `3:A1`, `2:B`, `2:D`, `2:C`, `3:C1`, `2:E`]);
});

test(`deplacement de groupe refuse dans un titre deplace`, () => {
  assert.equal(moveNodes(NOTE, `n.md`, [`r.0`, `r.2`], `r.0`, `r.2`, 0), null);
});

test(`un seul titre : meme resultat que moveNode`, () => {
  const r = moveNodes(NOTE, `n.md`, [`r.3`], `r.3`, `r`, 0)!;
  assert.deepEqual(titles(r.text).slice(0, 2), [`2:D`, `2:A`]);
});

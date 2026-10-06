import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARS_PER_LINE, generateLorem, loremParagraph, parseSizes } from "../src/lorem";

test(`les tailles se lisent avec virgules, points-virgules et espaces, et ce qui n'est pas un nombre est ignore`, () => {
  assert.deepEqual(parseSizes(`6`), [6]);
  assert.deepEqual(parseSizes(`6,4,2`), [6, 4, 2]);
  assert.deepEqual(parseSizes(` 6 ; 4  2 `), [6, 4, 2]);
  assert.deepEqual(parseSizes(`a, 0, -3, 5`), [5]);
  assert.deepEqual(parseSizes(`9999`), [200]);
  assert.deepEqual(parseSizes(``), []);
  assert.equal(parseSizes(Array.from({ length: 80 }, () => `3`).join(`,`)).length, 30);
});

test(`un paragraphe fait environ le nombre de lignes demande, commence par la phrase habituelle et finit par un point`, () => {
  const p = loremParagraph(6, 0);
  assert.ok(p.startsWith(`Lorem ipsum dolor sit amet, consectetur adipiscing elit`));
  assert.ok(p.endsWith(`.`));
  assert.ok(p.length <= 6 * CHARS_PER_LINE && p.length >= 6 * CHARS_PER_LINE - 40, String(p.length));
  assert.ok(!loremParagraph(2, 1).startsWith(`Lorem ipsum dolor sit amet`));
  assert.equal(loremParagraph(6, 0), loremParagraph(6, 0));
  assert.ok(loremParagraph(1, 0).length >= 20);
});

test(`6,4,2 donne trois paragraphes separes par un retour a la ligne, ou par une ligne vide`, () => {
  const simple = generateLorem(`6,4,2`, false);
  assert.equal(simple.split(`\n`).length, 3);
  const blank = generateLorem(`6,4,2`, true);
  assert.equal(blank.split(`\n\n`).length, 3);
  assert.equal(generateLorem(`6`, false).includes(`\n`), false);
  assert.equal(generateLorem(`rien`, false), ``);
  assert.ok(generateLorem(`3,3`, true, `\r\n`).includes(`\r\n\r\n`));
});

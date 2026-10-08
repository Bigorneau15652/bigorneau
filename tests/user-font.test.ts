import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OpenTypeFont } from "../src/export/font";

const load = (name: string): OpenTypeFont => new OpenTypeFont(new Uint8Array(readFileSync(`tests/fonts/${name}`)));

test(`une police TrueType est lue : noms, style, droits, largeurs et crenage de la table kern`, () => {
  const regular = load(`TestSerif-Regular.ttf`);
  assert.equal(regular.flavor, `truetype`);
  assert.equal(regular.family, `Test Serif`);
  assert.equal(regular.subfamily, `Regular`);
  assert.equal(regular.isBold, false);
  assert.equal(regular.isItalic, false);
  assert.equal(regular.embeddingRestricted, false);
  assert.equal(regular.cff.length, regular.data.length);
  const bold = load(`TestSerif-Bold.ttf`);
  assert.deepEqual([bold.isBold, bold.isItalic, bold.subfamily], [true, false, `Bold`]);
  const italic = load(`TestSerif-Italic.ttf`);
  assert.deepEqual([italic.isBold, italic.isItalic], [false, true]);
  const bi = load(`TestSerif-BoldItalic.ttf`);
  assert.deepEqual([bi.isBold, bi.isItalic], [true, true]);
  // Largeurs : majuscule 650, minuscule 500, la gras est plus large de 60.
  assert.equal(regular.width(`A`), 650);
  assert.equal(regular.width(`a`), 500);
  assert.equal(bold.width(`a`), 560);
  // Crenage A V (-80) lu dans la table kern.
  assert.equal(regular.width(`AV`), 650 + 650 - 80);
  // Lettres accentuees presentes.
  assert.ok(regular.hasChar(0xe9) && regular.hasChar(0xe7) && !regular.hasChar(0x4e2d));
});

test(`une police dont la licence interdit l'incorporation est reperee`, () => {
  assert.equal(load(`TestLocked-Regular.ttf`).embeddingRestricted, true);
});

test(`une police OpenType a contours CFF garde son comportement, et un fichier qui n'est pas une police est refuse`, () => {
  const text = readFileSync(`tests/fonts/TestSerif-Regular.ttf`);
  assert.throws(() => new OpenTypeFont(new Uint8Array(Buffer.from(`wOF2xxxxxxxxxxxxxxxx`))), /WOFF/);
  assert.throws(() => new OpenTypeFont(new Uint8Array(text.subarray(0, 40))));
});

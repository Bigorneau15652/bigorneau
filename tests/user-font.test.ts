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

// Police de test dont la table cmap est remplacee : un seul groupe (format 12) qui declare des milliards de caracteres.
function fontWithHostileCmap(): Uint8Array {
  const src = readFileSync(`tests/fonts/TestSerif-Regular.ttf`);
  const tableCount = src.readUInt16BE(4);
  const cmap = Buffer.alloc(12 + 8 + 16 + 12);
  cmap.writeUInt16BE(0, 0);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4);
  cmap.writeUInt16BE(10, 6);
  cmap.writeUInt32BE(12, 8);
  cmap.writeUInt16BE(12, 12);
  cmap.writeUInt32BE(16 + 12, 16);
  cmap.writeUInt32BE(1, 24);
  cmap.writeUInt32BE(0, 28);
  cmap.writeUInt32BE(0xffffffff, 32);
  cmap.writeUInt32BE(1, 36);
  const out = Buffer.concat([src, cmap]);
  for (let i = 0; i < tableCount; i++) {
    const at = 12 + 16 * i;
    if (out.toString(`latin1`, at, at + 4) === `cmap`) {
      out.writeUInt32BE(src.length, at + 8);
      out.writeUInt32BE(cmap.length, at + 12);
    }
  }
  return new Uint8Array(out);
}

test(`une police qui declare des milliards de caracteres est lue sans saturer la memoire`, () => {
  const font = new OpenTypeFont(fontWithHostileCmap());
  const start = Date.now();
  const before = process.memoryUsage().heapUsed;
  assert.equal(font.cmap.size, 0);
  assert.ok(Date.now() - start < 1000, `duree ${Date.now() - start} ms`);
  assert.ok(process.memoryUsage().heapUsed - before < 200 * 1024 * 1024);
});

test(`une police ordinaire garde tous ses caracteres`, () => {
  assert.ok(load(`TestSerif-Regular.ttf`).cmap.size > 50);
});

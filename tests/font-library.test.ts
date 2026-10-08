import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLibrary, familyId, variantsOf } from "../src/font-library";

const file = (name: string, path = `Bigorneau/Polices/${name}`) => ({ path, bytes: new Uint8Array(readFileSync(`tests/fonts/${name}`)) });

test(`les fichiers d'une meme famille sont regroupes par variante`, () => {
  const lib = buildLibrary([file(`TestSerif-Bold.ttf`), file(`TestSerif-Regular.ttf`), file(`TestSerif-BoldItalic.ttf`), file(`TestSerif-Italic.ttf`)]);
  assert.equal(lib.families.length, 1);
  const f = lib.families[0];
  assert.deepEqual([f.id, f.name], [`test-serif`, `Test Serif`]);
  assert.deepEqual(variantsOf(f), [`regular`, `italic`, `bold`, `boldItalic`]);
  assert.equal(f.paths.bold, `Bigorneau/Polices/TestSerif-Bold.ttf`);
  assert.deepEqual(lib.problems, []);
});

test(`les fichiers inutilisables sont signales avec leur raison`, () => {
  const lib = buildLibrary([
    file(`TestSerif-Regular.ttf`),
    file(`TestSerif-Regular.ttf`, `Bigorneau/Polices/copie/TestSerif-Regular.ttf`),
    file(`TestLocked-Regular.ttf`),
    { path: `Bigorneau/Polices/Police.woff2`, bytes: new Uint8Array(4) },
    { path: `Bigorneau/Polices/Police.ttc`, bytes: new Uint8Array(4) },
    { path: `Bigorneau/Polices/casse.ttf`, bytes: new Uint8Array(40) },
    { path: `Bigorneau/Polices/lisez-moi.txt`, bytes: new Uint8Array(4) },
  ]);
  const by = Object.fromEntries(lib.problems.map((p) => [p.path.split(`/`).pop(), p.kind]));
  assert.equal(by[`Police.woff2`], `woff`);
  assert.equal(by[`Police.ttc`], `collection`);
  assert.equal(by[`casse.ttf`], `unreadable`);
  assert.equal(by[`TestLocked-Regular.ttf`], `restricted`);
  assert.equal(by[`TestSerif-Regular.ttf`], `duplicate`);
  assert.equal(lib.problems.length, 5);
  assert.equal(lib.families.length, 1);
});

test(`l'identifiant d'une famille ne depend ni des accents ni de la casse`, () => {
  assert.equal(familyId(`Été Gras & Co`), `ete-gras-co`);
  assert.equal(familyId(`???`), `police`);
});

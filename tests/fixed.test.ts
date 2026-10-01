import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFixed } from "../src/fixed";
import { parseNote } from "../src/model";
import { migrateSettings, sanitizeFixed } from "../src/settings";

const NOTE = [`Intro`, ``, `## A`, `texte a`, `### A1`, `texte a1`, `## B`, `texte b`, ``].join(`\n`);

test(`une note fixe montre le paragraphe de son titre sans les sous-titres`, () => {
  const doc = parseNote(NOTE, `N.md`);
  const r = resolveFixed(doc, { key: `r.0`, title: `A` }, false)!;
  assert.deepEqual([r.key, r.startLine, r.endLine], [`r.0`, 2, 4]);
});

test(`avec les sous-titres, la note fixe va jusqu'a la fin de la branche`, () => {
  const doc = parseNote(NOTE, `N.md`);
  const r = resolveFixed(doc, { key: `r.0`, title: `A` }, true)!;
  assert.deepEqual([r.startLine, r.endLine], [2, 6]);
});

test(`le titre est retrouve quand sa place a change`, () => {
  const doc = parseNote([`Intro`, ``, `## Nouveau`, `x`, NOTE.split(`\n`).slice(2).join(`\n`)].join(`\n`), `N.md`);
  const r = resolveFixed(doc, { key: `r.0`, title: `A` }, false)!;
  assert.equal(r.key, `r.1`);
});

test(`un titre qui n'existe plus ne donne aucun chapitre`, () => {
  const doc = parseNote(NOTE, `N.md`);
  assert.equal(resolveFixed(doc, { key: `r.0`, title: `Disparu` }, false), null);
});

test(`les notes fixes memorisees sont verifiees`, () => {
  const ok = { id: `abc`, path: `N.md`, key: `r.1.0`, title: `T` };
  assert.deepEqual(sanitizeFixed([ok, { ...ok }, { id: ``, path: `x`, key: `r`, title: `` }, { id: `z`, path: `x`, key: `../`, title: `` }, 4, null]), [ok]);
  assert.deepEqual(sanitizeFixed(`n'importe quoi`), []);
  assert.equal(migrateSettings({}).fixedLikeDynamic, false);
  assert.deepEqual(migrateSettings({ fixedViews: [ok] }).fixedViews, [ok]);
});

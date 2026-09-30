import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLineEdits, flattenDoc, nodeByKey, parseNote } from "../src/model";
import { metaEditsFor, planReset, planStyle } from "../src/style-edit";

// Trois niveaux : A (niveau 2) avec un sous-titre, B (niveau 2), C (niveau 3 sous B).
const NOTE = `intro\n## A\ntexte A\n### A1\ntexte A1\n## B\ntexte B\n`;

function run(text: string, keys: string[], patch: object, individual: boolean): string {
  const doc = parseNote(text, `f.md`);
  const plan = planStyle(doc, keys, patch, individual);
  return applyLineEdits(text, metaEditsFor(doc, plan.changes), doc.eol);
}

test(`portee : sans selection, la modification s applique a toute la carte`, () => {
  const doc = parseNote(NOTE, `f.md`);
  const plan = planStyle(doc, [], { strokeColor: `#e03131` }, false);
  assert.deepEqual(plan.settings, { strokeColor: `#e03131` });
  assert.deepEqual(plan.changes, []);
});

test(`portee : un titre de niveau 2 selectionne, tous les titres de niveau 2 changent`, () => {
  const out = run(NOTE, [`r.0`], { strokeColor: `#e03131` }, false);
  // Le style de niveau est porte par le noeud racine, sous le titre general.
  assert.equal(out, `%% mmw {"levels":{"2":{"strokeColor":"#e03131"}}} %%\nintro\n## A\ntexte A\n### A1\ntexte A1\n## B\ntexte B\n`);
  // Les deux titres de niveau 2 sont concernes, pas le sous-titre de niveau 3.
  const doc = parseNote(out, `f.md`);
  assert.deepEqual(doc.root.meta?.levels, { "2": { strokeColor: `#e03131` } });
  assert.equal(nodeByKey(doc, `r.0.0`)!.meta, undefined);
});

test(`portee : plusieurs modifications successives sur le meme niveau se cumulent`, () => {
  const one = run(NOTE, [`r.0`], { strokeColor: `#e03131` }, false);
  const two = run(one, [`r.1`], { fillColor: `#a5d8ff` }, false);
  const doc = parseNote(two, `f.md`);
  assert.deepEqual(doc.root.meta?.levels, { "2": { strokeColor: `#e03131`, fillColor: `#a5d8ff` } });
  assert.equal((two.match(/%% mmw/g) ?? []).length, 1);
});

test(`portee : avec Cmd, seule la case selectionnee change`, () => {
  const out = run(NOTE, [`r.1`], { strokeColor: `#1971c2` }, true);
  assert.equal(out, `intro\n## A\ntexte A\n### A1\ntexte A1\n## B\n%% mmw {"style":{"strokeColor":"#1971c2"}} %%\ntexte B\n`);
  const doc = parseNote(out, `f.md`);
  assert.equal(nodeByKey(doc, `r.0`)!.meta, undefined);
  assert.deepEqual(nodeByKey(doc, `r.1`)!.meta?.style, { strokeColor: `#1971c2` });
});

test(`portee : une case individuelle l emporte sur le style de son niveau`, () => {
  const level = run(NOTE, [`r.0`], { strokeColor: `#e03131` }, false);
  const both = run(level, [`r.1`], { strokeColor: `#2f9e44` }, true);
  const doc = parseNote(both, `f.md`);
  assert.deepEqual(doc.root.meta?.levels, { "2": { strokeColor: `#e03131` } });
  assert.deepEqual(nodeByKey(doc, `r.1`)!.meta?.style, { strokeColor: `#2f9e44` });
});

test(`portee : plusieurs niveaux selectionnes`, () => {
  const doc = parseNote(NOTE, `f.md`);
  const plan = planStyle(doc, [`r.0`, `r.0.0`], { strokeWidth: 3 }, false);
  const levels = plan.changes[0].meta!.levels!;
  assert.deepEqual(levels, { "2": { strokeWidth: 3 }, "3": { strokeWidth: 3 } });
});

test(`portee : tout selectionner modifie la carte entiere et retire les styles de niveau concernes`, () => {
  const level = run(NOTE, [`r.0`], { strokeColor: `#e03131`, strokeWidth: 3 }, false);
  const doc = parseNote(level, `f.md`);
  const all = flattenDoc(doc).map((e) => e.key);
  const plan = planStyle(doc, all, { strokeColor: `#1971c2` }, false);
  assert.deepEqual(plan.settings, { strokeColor: `#1971c2` });
  // La couleur du niveau 2 disparait, sa largeur reste.
  assert.deepEqual(plan.changes[0].meta!.levels, { "2": { strokeWidth: 3 } });
  // Avec Cmd et tout selectionne, chaque case reçoit son style.
  const individual = planStyle(doc, all, { strokeColor: `#1971c2` }, true);
  assert.equal(individual.settings, undefined);
  assert.equal(individual.changes.length, all.length);
});

test(`retrait : d un niveau, d une case, de toute la carte`, () => {
  const styled = run(run(NOTE, [`r.0`], { strokeColor: `#e03131` }, false), [`r.1`], { fillColor: `#a5d8ff` }, true);
  const doc = parseNote(styled, `f.md`);

  const level = planReset(doc, [`r.0`], false);
  assert.equal(applyLineEdits(styled, metaEditsFor(doc, level.changes), doc.eol).includes(`levels`), false);
  assert.equal(applyLineEdits(styled, metaEditsFor(doc, level.changes), doc.eol).includes(`fillColor`), true);

  const single = planReset(doc, [`r.1`], true);
  const noSingle = applyLineEdits(styled, metaEditsFor(doc, single.changes), doc.eol);
  assert.equal(noSingle.includes(`fillColor`), false);
  assert.equal(noSingle.includes(`levels`), true);

  const all = planReset(doc, [], false);
  assert.equal(all.resetSettings, true);
  const clean = applyLineEdits(styled, metaEditsFor(doc, all.changes), doc.eol);
  assert.equal(clean, NOTE);
});

test(`portee : la note reste identique apres l ecriture et la relecture des styles`, () => {
  const out = run(run(NOTE, [`r.0`], { strokeColor: `#e03131` }, false), [`r.0.0`], { showFrames: false }, true);
  const doc = parseNote(out, `f.md`);
  assert.equal(nodeByKey(doc, `r.0.0`)!.meta?.style?.showFrames, false);
  // Le texte des chapitres n est pas touche.
  assert.ok(out.includes(`texte A1\n`));
  assert.equal(out.replace(/%% mmw .* %%\n/g, ``), NOTE);
});

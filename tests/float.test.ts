import { test } from "node:test";
import assert from "node:assert/strict";
import { addNode, deleteNodes, renameTitle } from "../src/edit";
import { branchToFloat, createFloat, deleteFloat, floatToBranch, moveFloat } from "../src/float";
import { activeLines, flattenDoc, isHiddenKey, nodeAtLine, nodeByKey, parseNote, serializeNote } from "../src/model";

const NOTE = [`Intro`, ``, `## A`, `texte a`, `### A1`, `texte a1`, `## B`, `texte b`, ``].join(`\n`);

test(`creer un sujet flottant l'ajoute en fin de note sans toucher la carte`, () => {
  const r = createFloat(NOTE, `N.md`, 2, { x: 120, y: 40 })!;
  assert.equal(r.key, `f0`);
  assert.ok(r.text.startsWith(NOTE));
  const doc = parseNote(r.text, `N.md`);
  assert.equal(doc.floats.length, 1);
  assert.equal(doc.floats[0].level, 2);
  assert.deepEqual([doc.floats[0].float!.x, doc.floats[0].float!.y], [120, 40]);
  assert.equal(flattenDoc(parseNote(NOTE, `N.md`)).length, flattenDoc(doc).length - 1);
  assert.equal(serializeNote(doc), r.text);
  // La carte principale ne change pas.
  assert.equal(doc.root.children.length, 2);
  assert.equal(nodeByKey(doc, `r.1`)!.endLine, doc.floatStart);
});

test(`les sujets flottants se suivent et se retrouvent par leur cle`, () => {
  let t = createFloat(NOTE, `N.md`, 2, { x: 1, y: 2 }, `Premier`)!.text;
  const second = createFloat(t, `N.md`, 3, {}, `Second`)!;
  assert.equal(second.key, `f1`);
  const doc = parseNote(second.text, `N.md`);
  assert.deepEqual(doc.floats.map((f) => f.title), [`Premier`, `Second`]);
  assert.equal(doc.floats[1].float!.x, undefined);
  assert.equal(nodeByKey(doc, `f1`)!.title, `Second`);
  assert.equal(nodeAtLine(doc, doc.floats[1].line!).key, `f1`);
  t = second.text;
});

test(`le texte et les sous-titres d'un sujet flottant lui appartiennent`, () => {
  const text = `${NOTE}%% mmw-float {"x":5,"y":6} %%\n## Idee\nnote libre\n### Detail\nplus\n`;
  const doc = parseNote(text, `N.md`);
  assert.equal(doc.floats.length, 1);
  assert.equal(doc.floats[0].children.length, 1);
  assert.equal(nodeByKey(doc, `f0.0`)!.title, `Detail`);
  const lines = activeLines(doc, `f0`, false)!;
  assert.deepEqual([lines.startLine, lines.endLine], [doc.floats[0].line!, doc.floats[0].children[0].line!]);
  assert.equal(nodeAtLine(doc, doc.floats[0].children[0].line! + 1).key, `f0.0`);
  assert.equal(isHiddenKey(doc, `f0.0`), false);
  assert.equal(serializeNote(doc), text);
});

test(`un repere dans un bloc de code n'ouvre pas la zone`, () => {
  const text = `Intro\n\n\`\`\`\n%% mmw-float %%\n## X\n\`\`\`\n\n## A\n`;
  assert.equal(parseNote(text, `N.md`).floats.length, 0);
});

test(`deplacer un sujet ne change que son repere`, () => {
  const t = createFloat(NOTE, `N.md`, 2, { x: 1, y: 2 })!.text;
  const moved = moveFloat(t, `N.md`, `f0`, { x: 300, y: 200 })!;
  const doc = parseNote(moved.text, `N.md`);
  assert.deepEqual([doc.floats[0].float!.x, doc.floats[0].float!.y], [300, 200]);
  assert.equal(moved.text.split(`\n`).length, t.split(`\n`).length);
});

test(`renommer et ajouter un enfant fonctionnent dans un sujet flottant`, () => {
  const t = createFloat(NOTE, `N.md`, 2, { x: 1, y: 2 })!.text;
  const renamed = renameTitle(t, `N.md`, `f0`, `Mes notes`)!;
  assert.equal(parseNote(renamed.text, `N.md`).floats[0].title, `Mes notes`);
  const child = addNode(renamed.text, `N.md`, `f0`, `child`)!;
  assert.equal(child.key, `f0.0`);
  assert.equal(parseNote(child.text, `N.md`).floats[0].children[0].level, 3);
});

test(`supprimer un sujet flottant retire son bloc entier`, () => {
  const t = createFloat(createFloat(NOTE, `N.md`, 2, {}, `A1`)!.text, `N.md`, 2, {}, `A2`)!.text;
  const del = deleteFloat(t, `N.md`, `f0`)!;
  const doc = parseNote(del.text, `N.md`);
  assert.deepEqual(doc.floats.map((f) => f.title), [`A2`]);
  const viaNodes = deleteNodes(t, `N.md`, [`f1`])!;
  assert.deepEqual(parseNote(viaNodes.text, `N.md`).floats.map((f) => f.title), [`A1`]);
  assert.equal(deleteNodes(del.text, `N.md`, [`f0`])!.text, NOTE);
});

test(`un titre sorti de la carte devient un sujet flottant avec sa branche`, () => {
  const r = branchToFloat(NOTE, `N.md`, `r.0`, { x: 10, y: 20 })!;
  const doc = parseNote(r.text, `N.md`);
  assert.equal(r.key, `f0`);
  assert.deepEqual(doc.root.children.map((c) => c.title), [`B`]);
  assert.equal(doc.floats[0].title, `A`);
  assert.equal(doc.floats[0].children[0].title, `A1`);
  assert.equal(doc.floats[0].level, 2);
});

test(`un sujet flottant qui entre dans la carte prend le niveau de sa place`, () => {
  const t = createFloat(NOTE, `N.md`, 2, {}, `Idee`)!.text;
  // Sous le titre B : il devient un titre de niveau 3.
  const under = floatToBranch(t, `N.md`, `f0`, `r.1`, 0)!;
  const doc = parseNote(under.text, `N.md`);
  assert.equal(doc.floats.length, 0);
  const b = nodeByKey(doc, `r.1`)!;
  assert.deepEqual(b.children.map((c) => [c.title, c.level]), [[`Idee`, 3]]);
  // Au premier niveau, avant A : niveau 2.
  const top = floatToBranch(t, `N.md`, `f0`, `r`, 0)!;
  const doc2 = parseNote(top.text, `N.md`);
  assert.deepEqual(doc2.root.children.map((c) => [c.title, c.level]), [[`Idee`, 2], [`A`, 2], [`B`, 2]]);
});

test(`le style d'un sujet flottant : seul, ou pour tous les sujets flottants`, async () => {
  const { planStyle, planReset, metaEditsFor } = await import(`../src/style-edit`);
  const { createFloat: create } = await import(`../src/float`);
  const text = create(create(NOTE, `N.md`, 2, { x: 1, y: 1 }, `Un`)!.text, `N.md`, 2, { x: 5, y: 5 }, `Deux`)!.text;
  const doc = parseNote(text, `N.md`);
  // Seul : le commentaire de style va sous le titre du sujet.
  const one = planStyle(doc, [`f0`], { fillColor: `#b2f2bb` }, true);
  const out = applyTo(text, doc, one.changes, metaEditsFor);
  assert.deepEqual(parseNote(out, `N.md`).floats[0].meta?.style, { fillColor: `#b2f2bb` });
  assert.equal(parseNote(out, `N.md`).floats[1].meta, undefined);
  // Tous les sujets flottants : un style de niveau f sur la racine de la note.
  const all = planStyle(doc, [`f0`, `f1`], { shape: `diamond` }, false);
  const out2 = applyTo(text, doc, all.changes, metaEditsFor);
  assert.deepEqual(parseNote(out2, `N.md`).root.meta?.levels, { f: { shape: `diamond` } });
  // Retirer ce style.
  const reset = planReset(parseNote(out2, `N.md`), [`f0`], false);
  assert.deepEqual(reset.changes.length, 1);
});

function applyTo(text: string, doc: ReturnType<typeof parseNote>, changes: { key: string; meta: unknown }[], edits: (d: ReturnType<typeof parseNote>, c: never) => { kind: `insert` | `replace` | `delete`; line: number; text: string }[]): string {
  const lines = edits(doc, changes as never);
  let out = text.split(`\n`);
  for (const e of [...lines].sort((a, b) => b.line - a.line)) {
    if (e.kind === `delete`) out.splice(e.line, 1);
    else if (e.kind === `replace`) out[e.line] = e.text;
    else out.splice(e.line, 0, e.text);
  }
  return out.join(`\n`);
}

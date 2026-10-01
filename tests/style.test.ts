import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLineEdits, nodeByKey, parseNote, planMetaEdit, serializeNote } from "../src/model";
import { DEFAULT_SETTINGS } from "../src/settings";
import { describeScope, formatMetaLine, globalStyle, isEmptyMeta, MmMeta, omitKeys, parseMetaLine, resolveStyle, sanitizeMeta, sanitizePatch } from "../src/style";

test(`style : ordre de priorite carte, niveau, case`, () => {
  const base = globalStyle(DEFAULT_SETTINGS);
  const levels = { "2": { strokeColor: `#e03131`, strokeWidth: 3 } };
  const own = { strokeColor: `#1971c2` };
  assert.equal(resolveStyle(base, levels, 1, undefined).strokeColor, ``);
  assert.equal(resolveStyle(base, levels, 2, undefined).strokeColor, `#e03131`);
  assert.equal(resolveStyle(base, levels, 2, undefined).strokeWidth, 3);
  assert.equal(resolveStyle(base, levels, 2, own).strokeColor, `#1971c2`);
  assert.equal(resolveStyle(base, levels, 2, own).strokeWidth, 3);
  // Choisir la couleur du theme pour une case ecrase la couleur du niveau.
  assert.equal(resolveStyle(base, levels, 2, { strokeColor: `` }).strokeColor, ``);
});

test(`style : seules les valeurs valides sont conservees`, () => {
  const p = sanitizePatch({ strokeColor: `red; background:url(x)`, fillColor: `#ffc9c9`, strokeWidth: 99, strokeDash: `dashed`, roughness: 5, corners: `round`, showFrames: `oui`, fontScale: 1.15, textAlign: `left`, inconnu: 1 });
  assert.deepEqual(p, { fillColor: `#ffc9c9`, strokeDash: `dashed`, corners: `round`, fontScale: 1.15, textAlign: `left` });
  assert.deepEqual(sanitizePatch(null), {});
  const m = sanitizeMeta({ style: { strokeColor: `#fff` }, levels: { "2": { fillColor: `#000000` }, "9": { fillColor: `#000000` }, "x": {} } });
  assert.deepEqual(m, { style: { strokeColor: `#fff` }, levels: { "2": { fillColor: `#000000` } } });
  assert.ok(isEmptyMeta({}));
  assert.ok(!isEmptyMeta(m));
});

test(`commentaire de style : lecture et ecriture`, () => {
  const meta: MmMeta = { style: { strokeColor: `#e03131` }, levels: { "2": { fillColor: `#a5d8ff` } } };
  const line = formatMetaLine(meta);
  assert.ok(line.startsWith(`%% mmw {`) && line.endsWith(`} %%`));
  assert.deepEqual(parseMetaLine(line), meta);
  assert.deepEqual(parseMetaLine(line + `\r\n`), meta);
  assert.equal(parseMetaLine(`%% un commentaire ordinaire %%`), null);
  assert.equal(parseMetaLine(`texte`), null);
  assert.deepEqual(parseMetaLine(`%% mmw {pas du json} %%`), {});
});

test(`modele : le commentaire de style sous un titre est lu et la note reste identique`, () => {
  const text = `%% mmw {"levels":{"2":{"strokeColor":"#e03131"}}} %%\nintro\n## A\n%% mmw {"style":{"fillColor":"#ffc9c9"}} %%\ntexte\n## B\ntexte\n`;
  const doc = parseNote(text, `f.md`);
  assert.deepEqual(doc.root.meta?.levels, { "2": { strokeColor: `#e03131` } });
  assert.equal(doc.root.metaLine, 0);
  const a = nodeByKey(doc, `r.0`)!;
  assert.deepEqual(a.meta?.style, { fillColor: `#ffc9c9` });
  assert.equal(a.metaLine, 3);
  assert.equal(nodeByKey(doc, `r.1`)!.meta, undefined);
  assert.equal(serializeNote(doc), text);
});

test(`modele : commentaire de style du noeud racine sans titre general`, () => {
  const text = `---\na: b\n---\n%% mmw {"levels":{"1":{"strokeWidth":3}}} %%\nintro\n# A\n# B\n`;
  const doc = parseNote(text, `f.md`);
  assert.deepEqual(doc.root.meta?.levels, { "1": { strokeWidth: 3 } });
  assert.equal(doc.root.metaLine, 3);
});

test(`modification de style : insertion, remplacement et suppression dans la note`, () => {
  const text = `texte\n## A\ntexte A\n## B\n%% mmw {"style":{"strokeColor":"#e03131"}} %%\ntexte B\n`;
  const doc = parseNote(text, `f.md`);
  const insert = planMetaEdit(doc, `r.0`, { style: { fillColor: `#ffc9c9` } })!;
  assert.deepEqual(insert, { kind: `insert`, line: 2, text: `%% mmw {"style":{"fillColor":"#ffc9c9"}} %%` });
  const replace = planMetaEdit(doc, `r.1`, { style: { strokeColor: `#2f9e44` } })!;
  assert.equal(replace.kind, `replace`);
  assert.equal(replace.line, 4);
  const del = planMetaEdit(doc, `r.1`, null)!;
  assert.deepEqual(del, { kind: `delete`, line: 4, text: `` });
  assert.equal(planMetaEdit(doc, `r.0`, null), null);
  assert.equal(planMetaEdit(doc, `r.9`, { style: { strokeColor: `#000` } }), null);

  const out = applyLineEdits(text, [insert, replace], `\n`);
  assert.equal(out, `texte\n## A\n%% mmw {"style":{"fillColor":"#ffc9c9"}} %%\ntexte A\n## B\n%% mmw {"style":{"strokeColor":"#2f9e44"}} %%\ntexte B\n`);
  assert.equal(applyLineEdits(text, [del], `\n`), `texte\n## A\ntexte A\n## B\ntexte B\n`);
  // La note modifiee est relue avec les nouveaux styles, et le reste du texte est intact.
  const again = parseNote(out, `f.md`);
  assert.deepEqual(nodeByKey(again, `r.0`)!.meta?.style, { fillColor: `#ffc9c9` });
  assert.equal(nodeByKey(again, `r.1`)!.body.endsWith(`texte B\n`), true);
});

test(`modification de style : racine sans titre, fin de fichier sans retour, fins de ligne Windows`, () => {
  const plain = parseNote(`intro\n# A\n# B\n`, `f.md`);
  const e = planMetaEdit(plain, `r`, { levels: { "1": { strokeWidth: 3 } } })!;
  assert.deepEqual([e.kind, e.line], [`insert`, 0]);
  assert.equal(applyLineEdits(`intro\n# A\n# B\n`, [e], `\n`), `%% mmw {"levels":{"1":{"strokeWidth":3}}} %%\nintro\n# A\n# B\n`);
  // La racine est toujours le nom de la note : son commentaire se place en tete, meme si la note commence par un titre.
  const bare = `# A`;
  const doc = parseNote(bare, `f.md`);
  const ins = planMetaEdit(doc, `r`, { style: { strokeColor: `#fff` } })!;
  assert.deepEqual([ins.kind, ins.line], [`insert`, 0]);
  assert.equal(applyLineEdits(bare, [ins], `\n`), `%% mmw {"style":{"strokeColor":"#fff"}} %%\n# A`);

  const crlf = `# A\r\ntexte\r\n`;
  const d2 = parseNote(crlf, `f.md`);
  const i2 = planMetaEdit(d2, `r`, { style: { strokeColor: `#fff` } })!;
  const once = applyLineEdits(crlf, [i2], d2.eol);
  assert.equal(once, `%% mmw {"style":{"strokeColor":"#fff"}} %%\r\n# A\r\ntexte\r\n`);
  const rep = planMetaEdit(parseNote(once, `f.md`), `r`, { style: { strokeColor: `#000` } })!;
  assert.equal(applyLineEdits(once, [rep], d2.eol), `%% mmw {"style":{"strokeColor":"#000"}} %%\r\n# A\r\ntexte\r\n`);
});

test(`portee d une modification : libelles`, () => {
  assert.equal(describeScope([], 0, false, false), `toute la carte`);
  assert.equal(describeScope([1, 2, 3], 9, true, false), `toute la carte`);
  assert.equal(describeScope([2], 1, false, false), `tous les titres de niveau 2`);
  assert.equal(describeScope([2, 2], 2, false, false), `tous les titres de niveau 2`);
  assert.equal(describeScope([1, 3], 2, false, false), `tous les titres de niveaux 1 et 3`);
  assert.equal(describeScope([1, 2, 3], 3, false, false), `tous les titres de niveaux 1, 2 et 3`);
  assert.equal(describeScope([0], 1, false, false), `le titre principal`);
  assert.equal(describeScope([2], 1, false, true), `cette case seulement`);
  assert.equal(describeScope([2, 3], 4, false, true), `les 4 cases sélectionnées`);
});

test(`retrait de proprietes d un style`, () => {
  assert.deepEqual(omitKeys({ strokeColor: `#fff`, strokeWidth: 3 }, [`strokeColor`]), { strokeWidth: 3 });
  assert.deepEqual(omitKeys(undefined, [`strokeColor`]), {});
});

test(`les formes : choix proposes, correspondance avec le cadre et nettoyage`, async () => {
  const { shapeChoice, shapePatch, SHAPE_CHOICES } = await import(`../src/style`);
  assert.deepEqual(SHAPE_CHOICES, [`rect`, `rounded`, `oval`, `underline`, `parallelogram`, `diamond`]);
  assert.equal(shapeChoice({ shape: `frame`, corners: `round` }), `rounded`);
  assert.equal(shapeChoice({ shape: `frame`, corners: `sharp` }), `rect`);
  assert.equal(shapeChoice({ shape: `diamond`, corners: `round` }), `diamond`);
  for (const c of SHAPE_CHOICES) assert.equal(shapeChoice({ shape: `frame`, corners: `round`, ...shapePatch(c) }), c);
  assert.deepEqual(sanitizePatch({ shape: `diamond` }), { shape: `diamond` });
  assert.deepEqual(sanitizePatch({ shape: `etoile` }), {});
  assert.deepEqual(sanitizeMeta({ levels: { f: { fillColor: `#b2f2bb` }, "9": { fillColor: `#b2f2bb` } } }).levels, { f: { fillColor: `#b2f2bb` } });
});

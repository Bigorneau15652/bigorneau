import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLineEdits, nodeByKey, parseNote, serializeNote } from "../src/model";
import { migrateSettings, newTagId, sanitizeTags, SETTINGS_VERSION } from "../src/settings";
import { detailsOnly, formatMetaLine, isEmptyMeta, parseMetaLine, sanitizeMeta } from "../src/style";
import { metaEditsFor, planReset, planStyle } from "../src/style-edit";

test(`etiquettes, titre court et commentaire : ecriture et lecture d'une ligne`, () => {
  const meta = { style: { strokeColor: `#e03131` }, tags: [`a1`, `b2`], short: `Budget`, comment: `Ligne 1\nLigne 2` };
  const line = formatMetaLine(meta);
  assert.equal(line, `%% mmw {"style":{"strokeColor":"#e03131"},"tags":["a1","b2"],"short":"Budget","comment":"Ligne 1\\nLigne 2"} %%`);
  assert.equal(line.includes(`\n`), false);
  assert.deepEqual(parseMetaLine(line), meta);
});

test(`un commentaire contenant deux signes pour cent ne ferme pas le commentaire de la note`, () => {
  const meta = { comment: `Objectif 50%% puis 100 % ensuite` };
  const line = formatMetaLine(meta);
  assert.equal(line.slice(6, -3).includes(`%%`), false);
  assert.deepEqual(parseMetaLine(line), meta);
  const doc = parseNote(`## A\n${line}\ntexte\n`, `f.md`);
  assert.equal(nodeByKey(doc, `r.0`)!.meta?.comment, meta.comment);
  assert.equal(serializeNote(doc), `## A\n${line}\ntexte\n`);
});

test(`valeurs invalides ecartees : identifiants, titre court, commentaire`, () => {
  const m = sanitizeMeta({ tags: [`ok`, `pas ok`, 3, `ok`, `x`.repeat(30)], short: `  a\nb  `, comment: `  texte \r\n suite  ` });
  assert.deepEqual(m.tags, [`ok`]);
  assert.equal(m.short, `a b`);
  assert.equal(m.comment, `texte \n suite`);
  assert.deepEqual(sanitizeMeta({ tags: [], short: `   `, comment: `` }), {});
});

test(`meta vide et details seuls`, () => {
  assert.equal(isEmptyMeta({ tags: [`a`] }), false);
  assert.equal(isEmptyMeta({ short: `x` }), false);
  assert.equal(isEmptyMeta({ tags: [] }), true);
  assert.deepEqual(detailsOnly({ style: { strokeColor: `#fff` }, levels: { "2": { strokeColor: `#000` } }, tags: [`a`], short: `s` }), { tags: [`a`], short: `s` });
  assert.equal(detailsOnly({ style: { strokeColor: `#fff` } }), null);
  assert.equal(detailsOnly(undefined), null);
});

test(`retrait de toute l'apparence : les etiquettes, titres courts et commentaires sont conserves`, () => {
  const text = `## A\n%% mmw {"style":{"strokeColor":"#e03131"},"tags":["a1"],"short":"Court"} %%\ntexte A\n## B\n%% mmw {"style":{"strokeColor":"#2f9e44"}} %%\ntexte B\n`;
  const doc = parseNote(text, `f.md`);
  const plan = planReset(doc, [], false);
  assert.equal(plan.resetSettings, true);
  const out = applyLineEdits(text, metaEditsFor(doc, plan.changes), doc.eol);
  assert.equal(out, `## A\n%% mmw {"tags":["a1"],"short":"Court"} %%\ntexte A\n## B\ntexte B\n`);
});

test(`un style applique a une case garde ses etiquettes`, () => {
  const text = `## A\n%% mmw {"tags":["a1"],"comment":"note"} %%\ntexte A\n`;
  const doc = parseNote(text, `f.md`);
  const plan = planStyle(doc, [`r.0`], { strokeColor: `#e03131` }, true);
  const out = applyLineEdits(text, metaEditsFor(doc, plan.changes), doc.eol);
  assert.equal(out, `## A\n%% mmw {"style":{"strokeColor":"#e03131"},"tags":["a1"],"comment":"note"} %%\ntexte A\n`);
});

test(`etiquettes des reglages : seules les valides sont gardees`, () => {
  const tags = sanitizeTags([
    { id: `a1`, name: `DMG`, bg: `#ffe8cc`, fg: `#7c3a00` },
    { id: `a1`, name: `doublon`, bg: `#fff`, fg: `#000` },
    { id: `pas valide`, name: `x`, bg: `#fff`, fg: `#000` },
    { id: `b2`, name: `  Long\nnom `, bg: `rouge`, fg: 3 },
    `texte`,
    null,
  ]);
  assert.deepEqual(tags, [
    { id: `a1`, name: `DMG`, bg: `#ffe8cc`, fg: `#7c3a00` },
    { id: `b2`, name: `Long nom`, bg: `#ffe8cc`, fg: `#7c3a00` },
  ]);
  assert.deepEqual(sanitizeTags(undefined), []);
});

test(`identifiant d'etiquette : nouveau et valide`, () => {
  const existing = [{ id: `taaaa`, name: ``, bg: `#fff`, fg: `#000` }];
  const id = newTagId(existing);
  assert.match(id, /^[A-Za-z0-9_-]{1,24}$/);
  assert.notEqual(id, `taaaa`);
});

test(`migration : les reglages de la version 3 recoivent une liste d'etiquettes vide`, () => {
  const s = migrateSettings({ settingsVersion: 3, compactness: 0.7 });
  assert.deepEqual(s.tags, []);
  assert.equal(s.compactness, 0.7);
  assert.equal(s.settingsVersion, SETTINGS_VERSION);
  const kept = migrateSettings({ settingsVersion: 4, tags: [{ id: `k1`, name: `P1`, bg: `#ffc9c9`, fg: `#c92a2a` }] });
  assert.equal(kept.tags.length, 1);
});

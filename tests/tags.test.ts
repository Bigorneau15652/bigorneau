import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { applyLineEdits, hiddenLineRanges, isHiddenKey, metaLineNumbers, nodeByKey, parseNote, serializeNote } from "../src/model";
import { setActiveRange } from "../src/active-range";
import { activeRangeField } from "../src/active-range";
import { hideExtension, hideField, setHideEnabled, setHideInactive, setHideMeta } from "../src/note-hide";
import { makeTag, migrateSettings, newTagId, nextTagColors, sanitizeTags, SETTINGS_VERSION, TAG_DEFAULT_COLORS, TAG_PALETTE } from "../src/settings";
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

test(`couleurs proposees : vert, bleu, rouge, jaune, puis gris`, () => {
  let tags: ReturnType<typeof sanitizeTags> = [];
  for (let i = 0; i < 6; i++) tags = [...tags, makeTag(tags, `T${i}`)];
  assert.deepEqual(tags.slice(0, 4).map((t) => t.bg), TAG_PALETTE.map((c) => c.bg));
  assert.equal(tags[4].bg, TAG_DEFAULT_COLORS.bg);
  assert.equal(tags[5].fg, TAG_DEFAULT_COLORS.fg);
  // Une couleur liberee par la suppression d'une etiquette est reproposee.
  assert.equal(nextTagColors(tags.filter((t) => t.name !== `T1`)).bg, TAG_PALETTE[1].bg);
  assert.equal(makeTag([], `  Etude   fine \n`).name, `Etude   fine`);
  assert.equal(migrateSettings({}).selectionContrast, 50);
});

test(`titres masques : ecriture de la ligne, plages de lignes et heritage`, async () => {
  const text = [`Intro`, ``, `## A`, `%% mmw {"hidden":true} %%`, `Texte A`, `### A1`, `Texte A1`, `## B`, `Texte B`, `## C`, `### C1`, `%% mmw {"hidden":true} %%`, `Texte C1`, ``].join(`\n`);
  const doc = parseNote(text, `n.md`);
  assert.equal(nodeByKey(doc, `r.0`)?.meta?.hidden, true);
  assert.deepEqual(hiddenLineRanges(doc), [{ start: 2, end: 6 }, { start: 10, end: 12 }]);
  assert.equal(isHiddenKey(doc, `r.0`), true);
  assert.equal(isHiddenKey(doc, `r.0.0`), true);
  assert.equal(isHiddenKey(doc, `r.1`), false);
  assert.equal(isHiddenKey(doc, `r.2`), false);
  assert.equal(isHiddenKey(doc, `r.2.0`), true);
  assert.equal(formatMetaLine({ tags: [`a`], hidden: true }), `%% mmw {"tags":["a"],"hidden":true} %%`);
  assert.equal(isEmptyMeta({ hidden: true }), false);
  assert.deepEqual(detailsOnly({ hidden: true, style: { strokeColor: `#e03131` } }), { hidden: true });
  assert.equal(sanitizeMeta({ hidden: `oui` }).hidden, undefined);
  // Un parent et un enfant masques : une seule plage.
  const both = parseNote([`## A`, `%% mmw {"hidden":true} %%`, `### A1`, `%% mmw {"hidden":true} %%`, `x`].join(`\n`), `n.md`);
  assert.equal(hiddenLineRanges(both).length, 1);

  // Decorations de l'editeur : la plage masquee couvre les lignes du titre a la fin de ses sous-titres.
  const state = EditorState.create({ doc: text, extensions: [hideExtension] });
  assert.equal(state.field(hideField).deco.size, 0);
  const on = state.update({ effects: setHideEnabled.of(true) }).state;
  const found: number[][] = [];
  on.field(hideField).deco.between(0, text.length, (from, to) => void found.push([on.doc.lineAt(from).number, on.doc.lineAt(to).number]));
  assert.deepEqual(found, [[3, 7], [11, 13]]);
});

test(`lignes de commentaire du plugin : masquees dans la note selon le reglage`, () => {
  const meta = `%% mmw {"tags":["a"]} %%`;
  const text = [`Intro`, `## A`, meta, `texte`, `## B`, `%% mmw {"hidden":true} %%`, `texte b`, ``].join(`\n`);
  const doc = parseNote(text, `n.md`);
  assert.deepEqual(metaLineNumbers(doc), [2, 5]);
  const lines = (meta: boolean): number[][] => {
    let st = EditorState.create({ doc: text, extensions: [hideExtension] });
    st = st.update({ effects: [setHideEnabled.of(true), setHideMeta.of(meta)] }).state;
    const out: number[][] = [];
    st.field(hideField).deco.between(0, text.length, (from, to) => void out.push([st.doc.lineAt(from).number, st.doc.lineAt(to).number]));
    return out;
  };
  // Sans le reglage, seule la partie masquee disparait ; avec le reglage, la ligne de A disparait aussi.
  assert.deepEqual(lines(false), [[5, 7]]);
  assert.deepEqual(lines(true), [[3, 3], [5, 7]]);
  // Une suppression au clavier qui emporterait la ligne cachee sans son titre est refusee.
  const st = EditorState.create({ doc: text, extensions: [hideExtension] }).update({ effects: [setHideEnabled.of(true), setHideMeta.of(true)] }).state;
  const head = st.doc.line(2);
  const refused = st.update({ changes: { from: head.to, to: head.to + 1 }, userEvent: `delete.forward` }).state;
  assert.equal(refused.doc.toString(), text);
  const allowed = st.update({ changes: { from: head.from, to: st.doc.line(3).to + 1 }, userEvent: `delete.selection` }).state;
  assert.equal(allowed.doc.toString().includes(meta), false);
});

test(`masquer les chapitres inactifs : seul le chapitre actif reste visible`, () => {
  const text = [`Intro`, `## A`, `texte a`, `## B`, `%% mmw {"tags":["x"]} %%`, `texte b`, `### B1`, `texte b1`, `## C`, `texte c`, ``].join(`\n`);
  const build = (range: { from: number; to: number } | null, inactive = true): number[][] => {
    let st = EditorState.create({ doc: text, extensions: [activeRangeField, hideExtension] });
    st = st.update({ effects: [setHideEnabled.of(true), setHideMeta.of(true), setHideInactive.of(inactive), setActiveRange.of(range)] }).state;
    const out: number[][] = [];
    st.field(hideField).deco.between(0, text.length, (from, to) => void out.push([st.doc.lineAt(from).number, st.doc.lineAt(to).number]));
    return out;
  };
  const doc = EditorState.create({ doc: text }).doc;
  const at = (line: number): number => doc.line(line).from;
  // Chapitre B (lignes 4 a 6, sans sous-titres) : tout le reste disparait, sa ligne de commentaire aussi.
  assert.deepEqual(build({ from: at(4), to: at(7) }), [[1, 3], [5, 5], [7, 11]]);
  // Chapitre A : il reste seul en haut, la ligne de commentaire de B est comprise dans ce qui suit.
  assert.deepEqual(build({ from: at(2), to: at(4) }), [[1, 1], [4, 11]]);
  // Sans le mode, seule la ligne de commentaire est masquee.
  assert.deepEqual(build({ from: at(4), to: at(7) }, false), [[5, 5]]);
  // Une suppression qui fusionnerait le chapitre actif avec une partie masquee est refusee.
  let st = EditorState.create({ doc: text, extensions: [activeRangeField, hideExtension] });
  st = st.update({ effects: [setHideEnabled.of(true), setHideInactive.of(true), setActiveRange.of({ from: at(2), to: at(4) })] }).state;
  const end = doc.line(3).to;
  assert.equal(st.update({ changes: { from: end, to: end + 1 }, userEvent: `delete.forward` }).state.doc.toString(), text);
  assert.equal(st.update({ changes: { from: at(2) - 1, to: at(2) }, userEvent: `delete.backward` }).state.doc.toString(), text);
});

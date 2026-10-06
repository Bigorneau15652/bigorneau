import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote } from "../src/export/compose";
import { parseBlocks } from "../src/export/doc-tree";
import { defaultConfig, formatPageMarker } from "../src/page-config";
import { formatParagraphMarker, paragraphMarkerAt, parseParagraphFormat, readParagraphMarker, sanitizeParagraphSettings, setParagraphMarker } from "../src/paragraph-format";

const LONG = `Un texte assez long pour passer sur plusieurs lignes et montrer le retrait, l'alignement et l'espace. `.repeat(4);

const note = (patch: (c: ReturnType<typeof defaultConfig>) => void, body: string): string => {
  const c = defaultConfig();
  patch(c);
  return `${formatPageMarker(c)}\n\n# Titre\n\n${body}`;
};

test(`une exception se lit en francais ou en anglais, dans n'importe quel ordre`, () => {
  assert.deepEqual(parseParagraphFormat(`droite`), { align: `right` });
  assert.deepEqual(parseParagraphFormat(`Centré, espace M`), { align: `center`, mode: `space`, size: `m` });
  assert.deepEqual(parseParagraphFormat(`retrait , justifie`), { mode: `indent`, align: `justify` });
  assert.deepEqual(parseParagraphFormat(`left, none`), { align: `left`, mode: `none` });
  assert.deepEqual(parseParagraphFormat(`n'importe quoi`), {});
  assert.equal(formatParagraphMarker({ align: `right`, mode: `space`, size: `l` }), `%% p: droite, espace l %%`);
  assert.equal(formatParagraphMarker({}), ``);
  assert.deepEqual(readParagraphMarker(`%% p: gauche %% Texte`)?.format, { align: `left` });
  assert.equal(readParagraphMarker(`Texte %% p: gauche %%`), null);
});

test(`le bouton pose, remplace et retire l'etiquette au debut de la ligne du curseur`, () => {
  const text = `Premier.\nSecond paragraphe.\nTroisieme.`;
  const at = text.indexOf(`Second`) + 3;
  const put = setParagraphMarker(text, at, { align: `right` });
  const next = text.slice(0, put.from) + put.insert + text.slice(put.to);
  assert.equal(next, `Premier.\n%% p: droite %% Second paragraphe.\nTroisieme.`);
  assert.deepEqual(paragraphMarkerAt(next, next.indexOf(`Second`)), { align: `right` });
  const swap = setParagraphMarker(next, next.indexOf(`Second`), { align: `center`, mode: `none` });
  assert.equal(next.slice(0, swap.from) + swap.insert + next.slice(swap.to), `Premier.\n%% p: centré, aucun %% Second paragraphe.\nTroisieme.`);
  const off = setParagraphMarker(next, next.indexOf(`Second`), null);
  assert.equal(next.slice(0, off.from) + off.insert + next.slice(off.to), text);
});

test(`l'etiquette est retiree du texte et attachee a son paragraphe, seule sur sa ligne elle vise le suivant`, () => {
  const blocks = parseBlocks([`%% p: droite %% Premier.`, `Deuxieme.`, `%% p: centré %%`, `Troisieme.`, "```", `%% p: gauche %% dans un code`, "```"].join(`\n`));
  assert.deepEqual(blocks[0], { type: `paragraph`, text: `Premier.`, format: { align: `right` } });
  assert.deepEqual(blocks[1], { type: `paragraph`, text: `Deuxieme.` });
  assert.deepEqual(blocks[2], { type: `paragraph`, text: `Troisieme.`, format: { align: `center` } });
  assert.ok(blocks[3].type === `code` && blocks[3].text.includes(`%% p: gauche %%`));
});

test(`les reglages de paragraphes du document sont relus et bornes`, () => {
  assert.deepEqual(sanitizeParagraphSettings({ mode: `space`, size: `l`, align: `right` }), { mode: `space`, size: `l`, align: `right` });
  assert.deepEqual(sanitizeParagraphSettings({ mode: `x`, size: `xl`, align: `bas` }), { mode: `indent`, size: `m`, align: `justify` });
  assert.deepEqual(sanitizeParagraphSettings(null), { mode: `indent`, size: `m`, align: `justify` });
});

const firstLines = (text: string): { x: number; width: number; kind: string; height: number }[] => composeNote(text, `N.md`).typeset.rows.filter((r) => r.kind === `text`);

test(`par defaut, un retrait et du texte justifie ; le mode espace supprime le retrait et ajoute l'espace entre paragraphes`, () => {
  const body = `${LONG}\n${LONG}`;
  const indent = composeNote(note(() => undefined, body), `N.md`).typeset.rows;
  const firstIndent = indent.find((r) => r.kind === `text`);
  assert.ok(firstIndent && firstIndent.x > 0);
  const space = composeNote(note((c) => (c.paragraphs = { mode: `space`, size: `l`, align: `justify` }), body), `N.md`).typeset.rows;
  const firstSpace = space.find((r) => r.kind === `text`);
  assert.ok(firstSpace && firstSpace.x === 0);
  // Un seul espace de 14 points entre les deux paragraphes.
  const gaps = space.filter((r, i) => r.kind === `space` && space[i - 1]?.kind === `text` && space[i + 1]?.kind === `text`);
  assert.ok(gaps.some((g) => Math.abs(g.height - 14) < 1e-6));
  assert.equal(space.filter((r) => r.kind === `text`).length, space.filter((r) => r.kind === `text`).length);
});

test(`texte a droite ou centre : les lignes sont decalees, et l'exception ne touche que son paragraphe`, () => {
  const text = note(() => undefined, `%% p: droite %% Court.\nAutre court.`);
  const rows = composeNote(text, `N.md`).typeset.rows.filter((r) => r.kind === `text`);
  assert.equal(rows.length, 2);
  // A droite : le bord droit de la ligne touche la marge ; l'autre paragraphe reste a gauche (avec son retrait).
  assert.ok(Math.abs(rows[0].x + rows[0].width - 451.28) < 1);
  assert.ok(rows[1].x < 30);
  const centred = composeNote(note((c) => (c.paragraphs = { mode: `indent`, size: `m`, align: `center` }), `Court.`), `N.md`).typeset.rows.find((r) => r.kind === `text`);
  assert.ok(centred && centred.x > 100 && centred.x < 300);
});

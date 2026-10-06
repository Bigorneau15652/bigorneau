import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote, composeToPdf } from "../src/export/compose";
import { parseBlocks } from "../src/export/doc-tree";
import { defaultConfig, formatPageMarker } from "../src/page-config";
import { formatPageZone, pageZoneAt, parsePageZone, readPageZone, setPageZone } from "../src/page-zone";

const FILL = `Un texte assez long pour remplir plusieurs lignes de la page et la faire changer. `.repeat(12);
const para = (n: number): string => Array.from({ length: n }, () => FILL).join(`\n\n`);
const note = (body: string, patch: (c: ReturnType<typeof defaultConfig>) => void = () => undefined): string => {
  const c = defaultConfig();
  patch(c);
  return `${formatPageMarker(c)}\n\n# Titre\n\n${body}`;
};

test(`une etiquette de zone se lit et s'ecrit en francais ou en anglais`, () => {
  assert.deepEqual(parsePageZone(`paysage`), { orientation: `landscape` });
  assert.deepEqual(parsePageZone(`Portrait, 2 colonnes, seulement`), { orientation: `portrait`, columns: 2, once: true });
  assert.deepEqual(parsePageZone(`landscape, 3 columns, only`), { orientation: `landscape`, columns: 3, once: true });
  assert.equal(parsePageZone(`2 colonnes`), null);
  assert.equal(formatPageZone({ orientation: `landscape`, columns: 1, once: true }), `%% page: paysage, 1 colonne, seulement %%`);
  assert.deepEqual(readPageZone(`%% page: portrait %%`), { orientation: `portrait` });
  assert.equal(readPageZone(`du texte %% page: portrait %%`), null);
  assert.equal(readPageZone(`%% mmw-page {} %%`), null);
});

test(`le bouton pose l'etiquette avant le bloc du curseur, la remplace et la retire`, () => {
  const text = `Intro.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite.`;
  const at = text.indexOf(`| 1 |`);
  const put = setPageZone(text, at, { orientation: `landscape` });
  const next = text.slice(0, put.from) + put.insert + text.slice(put.to);
  assert.equal(next, `Intro.\n\n%% page: paysage %%\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite.`);
  assert.deepEqual(pageZoneAt(next, next.indexOf(`| 1 |`))?.zone, { orientation: `landscape` });
  const swap = setPageZone(next, next.indexOf(`| 1 |`), { orientation: `landscape`, once: true });
  assert.equal(next.slice(0, swap.from) + swap.insert + next.slice(swap.to), `Intro.\n\n%% page: paysage, seulement %%\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite.`);
  const off = setPageZone(next, next.indexOf(`| 1 |`), null);
  assert.equal(next.slice(0, off.from) + off.insert + next.slice(off.to), text);
  assert.equal(pageZoneAt(text, text.indexOf(`Suite`)), null);
});

test(`l'etiquette devient un bloc de zone et reste ignoree dans un bloc de code`, () => {
  const blocks = parseBlocks([`Avant.`, ``, `%% page: paysage %%`, ``, `Apres.`, ``, "```", `%% page: portrait %%`, "```"].join(`\n`));
  assert.deepEqual(blocks.map((b) => b.type), [`paragraph`, `zone`, `paragraph`, `code`]);
  assert.deepEqual((blocks[1] as { zone: unknown }).zone, { orientation: `landscape` });
});

test(`une zone en paysage a ses propres pages, la numerotation continue et le retour au portrait suit`, () => {
  const text = note(`${para(2)}\n\n%% page: paysage %%\n\n${para(2)}\n\n%% page: portrait %%\n\n${para(2)}`);
  const composed = composeNote(text, `N.md`);
  const sizes = composed.pages.map((p) => (p.setup ? `L` : `P`));
  assert.ok(sizes.includes(`L`) && sizes[0] === `P` && sizes[sizes.length - 1] === `P`, sizes.join(``));
  // Aucune page portrait entre deux pages paysage, et les numeros se suivent.
  assert.deepEqual(composed.pages.map((p) => p.number), composed.pages.map((_, i) => i + 1));
  const land = composed.pages.find((p) => p.setup)!.setup!;
  assert.ok(land.width > land.height);
  assert.ok(Math.abs(land.width - composed.setup.height) < 1e-6);
});

test(`seulement : une seule partie en paysage puis la feuille reprend son orientation`, () => {
  const text = note(`${para(1)}\n\n%% page: paysage, seulement %%\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n${para(2)}`);
  const composed = composeNote(text, `N.md`);
  const kinds = composed.pages.map((p) => (p.setup ? `L` : `P`)).join(``);
  assert.match(kinds, /^P+LP+$/);
  const landPage = composed.pages.find((p) => p.setup)!;
  assert.ok(landPage.rows.some((r) => r.kind === `table`));
});

test(`les colonnes d'une zone sont propres a la zone`, () => {
  const text = note(`${para(1)}\n\n%% page: paysage, 3 colonnes %%\n\n${para(4)}`);
  const composed = composeNote(text, `N.md`);
  const land = composed.pages.filter((p) => p.setup);
  assert.ok(land.length > 0 && land.every((p) => p.columns && p.columns.length <= 3));
  assert.ok(land.some((p) => (p.columns?.length ?? 0) === 3));
  assert.ok(composed.pages.filter((p) => !p.setup).every((p) => !p.columns));
});

test(`le PDF donne a chaque page sa propre taille et l'en-tete suit la feuille`, async () => {
  const text = note(`${para(1)}\n\n%% page: paysage %%\n\n${para(1)}`, (c) => {
    c.footer.zones.center = `{page}`;
  });
  const composed = composeNote(text, `N.md`);
  const pdf = await composeToPdf(composed, { creator: `test`, created: new Date(0) });
  const body = Buffer.from(pdf).toString(`latin1`);
  const boxes = [...body.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => `${m[1]}x${m[2]}`);
  assert.ok(new Set(boxes).size === 2, boxes.join(` `));
  const land = composed.pages.find((p) => p.setup)!;
  const footer = land.decor?.find((d) => d.kind === `text`);
  assert.ok(footer && footer.kind === `text` && footer.baseline > land.setup!.height - 60);
});

test(`une feuille imposee ignore les etiquettes de zone`, () => {
  const composed = composeNote(note(`${para(1)}\n\n%% page: paysage %%\n\n${para(1)}`), `N.md`, { ...composeNote(`# a`, `N.md`).setup });
  assert.ok(composed.pages.every((p) => !p.setup));
});

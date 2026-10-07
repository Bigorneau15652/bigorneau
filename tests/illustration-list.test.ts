import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote } from "../src/export/compose";
import { parseBlocks } from "../src/export/doc-tree";
import { anchorPages } from "../src/export/paginate";
import { formatListMarker, listMarkersIn, placeListMarker, readListMarker, removeListMarker } from "../src/illustration-list";

const FILL = `Un texte assez long pour remplir plusieurs lignes de la page et la faire changer. `.repeat(14);

test(`l'etiquette d'une liste se lit en francais ou en anglais`, () => {
  assert.equal(readListMarker(`%% liste: figures %%`), `figures`);
  assert.equal(readListMarker(`%% liste: Tableaux %%`), `tables`);
  assert.equal(readListMarker(`%% list: tables %%`), `tables`);
  assert.equal(readListMarker(`%% liste: photos %%`), null);
  assert.equal(readListMarker(`texte %% liste: figures %%`), null);
  assert.equal(formatListMarker(`tables`), `%% liste: tableaux %%`);
  assert.deepEqual(listMarkersIn([`%% liste: figures %%`, `x`, "```", `%% liste: tableaux %%`, "```"].join(`\n`)), [`figures`]);
});

test(`le bouton pose l'etiquette avant le bloc du curseur, la deplace et la retire`, () => {
  const text = `Intro.\n\nSuite du texte.\n\nFin.`;
  const placed = placeListMarker(text, text.indexOf(`Suite`) + 2, `figures`);
  assert.equal(placed, `Intro.\n\n%% liste: figures %%\n\nSuite du texte.\n\nFin.`);
  // Deplacee : une seule etiquette de ce genre dans la note.
  const moved = placeListMarker(placed, placed.indexOf(`Fin`), `figures`);
  assert.equal(moved, `Intro.\n\nSuite du texte.\n\n%% liste: figures %%\n\nFin.`);
  const both = placeListMarker(moved, 0, `tables`);
  assert.deepEqual(listMarkersIn(both), [`tables`, `figures`]);
  assert.equal(removeListMarker(moved, `figures`), text);
  assert.equal(removeListMarker(moved, `tables`), moved);
});

test(`l'etiquette devient un bloc de liste, sauf dans un bloc de code`, () => {
  const blocks = parseBlocks([`Avant.`, ``, `%% liste: figures %%`, ``, "```", `%% liste: tableaux %%`, "```"].join(`\n`));
  assert.deepEqual(blocks.map((b) => b.type), [`paragraph`, `illustrations`, `code`]);
});

const NOTE = [
  `# Titre`,
  ``,
  `%% liste: figures %%`,
  ``,
  `%% liste: tableaux %%`,
  ``,
  FILL,
  ``,
  `![[plan.png|Plan de masse]]`,
  ``,
  FILL,
  FILL,
  ``,
  `Tableau : Consommations`,
  `| Poste | Valeur |`,
  `| - | - |`,
  `| a | 1 |`,
  ``,
  FILL,
  ``,
  `![[coupe.png|Coupe du batiment]]`,
].join(`\n`);

test(`les listes donnent chaque figure et chaque tableau nomme avec sa page`, () => {
  const composed = composeNote(NOTE, `N.md`);
  const rows = composed.typeset.rows;
  const text = (r: { text: string }): string => r.text;
  const headings = rows.filter((r) => r.kind === `heading`).map(text);
  assert.ok(headings.includes(`Liste des figures`) && headings.includes(`Liste des tableaux`), headings.join(`|`));
  const entries = rows.filter((r) => r.kind === `toc`);
  assert.equal(entries.length, 3);
  assert.ok(entries[0].text.startsWith(`Figure 1`) && entries[0].text.includes(`Plan de masse`));
  assert.ok(entries[1].text.startsWith(`Figure 2`));
  assert.ok(entries[2].text.startsWith(`Tableau 1`) && entries[2].text.includes(`Consommations`));
  // Chaque entree renvoie a la legende de son element, et sa page est celle de la legende.
  const pages = anchorPages(composed.pages);
  for (const e of entries) {
    assert.ok(e.toc && pages.has(e.toc.anchor), e.toc?.anchor);
    assert.equal(e.toc?.page, pages.get(e.toc?.anchor ?? ``), e.text);
    assert.ok((e.toc?.page ?? 0) >= 1);
  }
});

test(`sans etiquette, aucune liste n'est ajoutee`, () => {
  const composed = composeNote(NOTE.replace(/%% liste[^\n]*\n\n/g, ``), `N.md`);
  assert.ok(!composed.typeset.rows.some((r) => r.kind === `toc`));
});

test(`sur une ligne de titre, la liste est placee sous le titre`, () => {
  const text = `# Intro\n\nTexte.\n\n# Liste des figures\n\nSuite.`;
  const placed = placeListMarker(text, text.indexOf(`Liste des`) + 3, `figures`);
  assert.equal(placed, `# Intro\n\nTexte.\n\n# Liste des figures\n%% liste: figures %%\n\n\nSuite.`);
  assert.deepEqual(listMarkersIn(placed), [`figures`]);
  // Titre en derniere ligne.
  assert.equal(placeListMarker(`# Fin`, 2, `tables`), `# Fin\n%% liste: tableaux %%\n\n`);
});

test(`une liste placee sous un titre n'ajoute pas son propre titre`, () => {
  const named = [`# Liste des figures`, ``, `%% liste: figures %%`, ``, `Un texte.`, ``, `![[plan.png|Plan]]`].join(`\n`);
  const rows = composeNote(named, `N.md`).typeset.rows;
  assert.equal(rows.filter((r) => r.kind === `heading` && r.text === `Liste des figures`).length, 1);
  assert.equal(rows.filter((r) => r.kind === `toc`).length, 1);
  // Sous un titre qui ne la nomme pas, ou sans titre juste avant, la liste a le sien.
  const bare = composeNote([`# Chapitre`, ``, `Un texte.`, ``, `%% liste: figures %%`, ``, `![[plan.png|Plan]]`].join(`\n`), `N.md`).typeset.rows;
  assert.equal(bare.filter((r) => r.kind === `heading` && r.text === `Liste des figures`).length, 1);
});

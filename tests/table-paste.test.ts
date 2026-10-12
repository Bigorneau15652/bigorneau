import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTable, looksLikeSpreadsheet, markdownCell, parseSpreadsheet, pasteIntoTable } from "../src/table-paste";
import { findTable } from "../src/table-edit";
import { tableMenu } from "../src/table-menu";

const NOTE = `Avant.\n\nTableau : Postes\n%% mmw-table {"header":true} %%\n| Poste | kWh | Part |\n| :-- | --: | :-: |\n| Chauffage | 120 | 60 % |\n| Éclairage | 15 | 8 % |\n\nApres.`;

test(`le texte d'un tableur est lu en lignes et en colonnes, avec ou sans retour a la ligne final`, () => {
  assert.deepEqual(parseSpreadsheet(`a\tb\r\nc\td\r\n`), [[`a`, `b`], [`c`, `d`]]);
  assert.deepEqual(parseSpreadsheet(`a\tb\nc\td`), [[`a`, `b`], [`c`, `d`]]);
  assert.deepEqual(parseSpreadsheet(`a`), [[`a`]]);
  assert.equal(parseSpreadsheet(``), null);
  assert.deepEqual(parseSpreadsheet(`a\t\tc\n\nd\te\tf`), [[`a`, ``, `c`], [``, ``, ``], [`d`, `e`, `f`]]);
});

test(`les lignes plus courtes sont completees pour avoir toutes la meme largeur`, () => {
  assert.deepEqual(parseSpreadsheet(`a\tb\tc\nd\ne\tf`), [[`a`, `b`, `c`], [`d`, ``, ``], [`e`, `f`, ``]]);
});

test(`une cellule entre guillemets garde ses tabulations, ses retours a la ligne et ses guillemets`, () => {
  const cells = parseSpreadsheet(`"ligne 1\nligne 2"\t"dit ""oui"""\t"a\tb"\r\nx\ty\tz`);
  assert.deepEqual(cells, [[`ligne 1<br>ligne 2`, `dit "oui"`, `a b`], [`x`, `y`, `z`]]);
  // Un guillemet qui ne ferme rien reste du texte ordinaire.
  assert.deepEqual(parseSpreadsheet(`"abc\tdef`), [[`"abc`, `def`]]);
});

test(`une cellule devient du texte de tableau Markdown : barre protegee, espaces des bords retires`, () => {
  assert.equal(markdownCell(`  a | b  `), `a \\| b`);
  assert.equal(markdownCell(`x\ny`), `x<br>y`);
  assert.deepEqual(parseSpreadsheet(`1,5\t2 | 3`), [[`1,5`, `2 \\| 3`]]);
});

test(`le presse-papiers est reconnu comme un tableur : plusieurs cellules et des tabulations ou un tableau HTML`, () => {
  assert.equal(looksLikeSpreadsheet(`a\tb\nc\td`), true);
  assert.equal(looksLikeSpreadsheet(`a\tb`), true);
  assert.equal(looksLikeSpreadsheet(`a\nb`, `<table><tr><td>a</td></tr><tr><td>b</td></tr></table>`), true);
  // Un simple texte, une seule cellule ou plusieurs lignes sans tableau HTML : le collage habituel d'Obsidian reste.
  assert.equal(looksLikeSpreadsheet(`un texte`), false);
  assert.equal(looksLikeSpreadsheet(`a\nb`), false);
  assert.equal(looksLikeSpreadsheet(`x`, `<table><tr><td>x</td></tr></table>`), false);
  assert.equal(looksLikeSpreadsheet(``), false);
});

test(`les memes dimensions : toutes les cellules sont remplacees`, () => {
  const t = findTable(NOTE, NOTE.indexOf(`| Poste`))!;
  const r = fillTable({ rows: t.rows, align: t.align }, 0, 0, [[`A`, `B`, `C`], [`1`, `2`, `3`], [`4`, `5`, `6`]]);
  assert.deepEqual(r.data.rows, [[`A`, `B`, `C`], [`1`, `2`, `3`], [`4`, `5`, `6`]]);
  assert.deepEqual(r.data.align, [`left`, `right`, `center`]);
  assert.equal(r.rowsAdded + r.colsAdded, 0);
});

test(`le collage part de la cellule visee et le tableau grandit sans rien couper`, () => {
  const t = findTable(NOTE, NOTE.indexOf(`| Poste`))!;
  const r = fillTable({ rows: t.rows, align: t.align }, 2, 1, [[`a`, `b`, `c`], [`d`, `e`, `f`]]);
  assert.equal(r.rowsAdded, 1);
  assert.equal(r.colsAdded, 1);
  assert.deepEqual(r.data.rows, [
    [`Poste`, `kWh`, `Part`, ``],
    [`Chauffage`, `120`, `60 %`, ``],
    [`Éclairage`, `a`, `b`, `c`],
    [``, `d`, `e`, `f`],
  ]);
  assert.deepEqual(r.data.align, [`left`, `right`, `center`, `none`]);
  // Un collage plus petit laisse le reste du tableau intact.
  const small = fillTable({ rows: t.rows, align: t.align }, 1, 1, [[`9`]]);
  assert.deepEqual(small.data.rows[1], [`Chauffage`, `9`, `60 %`]);
  assert.deepEqual(small.data.rows[2], [`Éclairage`, `15`, `8 %`]);
});

test(`le collage dans la note garde la legende, le style et le reste du texte`, () => {
  const done = pasteIntoTable(NOTE, NOTE.indexOf(`| Chauffage`), { row: 1, col: 0 }, `Four\t10\t5 %\nPompe\t20\t9 %\n`)!;
  assert.ok(done);
  assert.ok(done.text.startsWith(`Avant.\n\nTableau : Postes\n%% mmw-table {"header":true} %%\n| Poste | kWh | Part |\n| :--- | ---: | :---: |\n| Four | 10 | 5 % |`), done.text);
  assert.ok(done.text.endsWith(`\n\nApres.`));
  assert.deepEqual(findTable(done.text, done.text.indexOf(`| Four`))!.rows[2], [`Pompe`, `20`, `9 %`]);
  assert.match(done.message, /2 ligne\(s\) et 3 colonne\(s\)/);
  assert.equal(pasteIntoTable(NOTE, 0, { row: 0, col: 0 }, `a\tb`), null);
  assert.equal(pasteIntoTable(NOTE, NOTE.indexOf(`| Chauffage`), { row: 1, col: 0 }, ``), null);
});

test(`le message annonce l'agrandissement du tableau`, () => {
  const done = pasteIntoTable(NOTE, NOTE.indexOf(`| Poste`), { row: 0, col: 2 }, `a\tb\nc\td\ne\tf`)!;
  assert.match(done.message, /3 ligne\(s\) et 2 colonne\(s\)/);
  assert.match(done.message, /Lignes ajoutées : 0/);
  assert.match(done.message, /Colonnes ajoutées : 1/);
});

test(`l'entree du menu colle le presse-papiers dans le tableau, depuis la cellule du clic droit`, () => {
  const menu = tableMenu(NOTE, NOTE.indexOf(`| Chauffage`), { row: 1, col: 1 })!;
  const entry = menu.find((i) => i.title === `Coller depuis un tableur`)!;
  assert.ok(entry && entry.paste);
  const done = entry.paste!(NOTE, `1\n2`)!;
  assert.equal(done.text.includes(`| Chauffage | 1 | 60 % |`), true);
  assert.equal(done.text.includes(`| Éclairage | 2 | 8 % |`), true);
});

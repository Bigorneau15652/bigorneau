import { test } from "node:test";
import assert from "node:assert/strict";
import { addColumn, addRow, columnAt, deleteColumn, deleteRow, findTable, insertBlock, moveColumn, moveRow, newTableBlock, renderTable, replaceTable, setAlign, setCaption, setTableStyle, splitCells, tableContext } from "../src/table-edit";

const NOTE = `# Titre\n\nUn texte.\n\n| Poste | kWh | Part |\n| :-- | --: | :-: |\n| Chauffage | 120 | 60 % |\n| Éclairage | 15 | 8 % |\n\nSuite.`;

test(`les cellules se coupent aux barres non echappees`, () => {
  assert.deepEqual(splitCells(`| a | b \\| c |  |`), [`a`, `b \\| c`, ``]);
  assert.deepEqual(splitCells(`a | b`), [`a`, `b`]);
});

test(`le tableau est retrouve avec son alignement, depuis n'importe laquelle de ses lignes`, () => {
  const at = NOTE.indexOf(`Éclairage`);
  const t = findTable(NOTE, at);
  assert.ok(t);
  assert.deepEqual(t.rows, [[`Poste`, `kWh`, `Part`], [`Chauffage`, `120`, `60 %`], [`Éclairage`, `15`, `8 %`]]);
  assert.deepEqual(t.align, [`left`, `right`, `center`]);
  assert.equal(NOTE.slice(t.from, t.to).split(`\n`).length, 4);
  assert.equal(findTable(NOTE, NOTE.indexOf(`Un texte`)), null);
  assert.equal(findTable(NOTE, NOTE.indexOf(`Suite`)), null);
  assert.equal(findTable(`| a |\n| b |`, 2), null);
});

test(`ajouter, supprimer et deplacer des lignes et des colonnes`, () => {
  const t = findTable(NOTE, NOTE.indexOf(`Éclairage`))!;
  const below = addRow(t, 1, `below`);
  assert.deepEqual(below.rows[2], [``, ``, ``]);
  assert.equal(below.rows.length, 4);
  // Au-dessus de l'en-tete : la ligne se place sous l'en-tete.
  assert.deepEqual(addRow(t, 0, `above`).rows[1], [``, ``, ``]);
  assert.equal(addRow(t, 2, `above`).rows[2][0], ``);
  const col = addColumn(t, 0, `right`);
  assert.deepEqual(col.rows[0], [`Poste`, ``, `kWh`, `Part`]);
  assert.deepEqual(col.align, [`left`, `none`, `right`, `center`]);
  assert.deepEqual(addColumn(t, 0, `left`).rows[1], [``, `Chauffage`, `120`, `60 %`]);
  assert.deepEqual(deleteRow(t, 1)?.rows.map((r) => r[0]), [`Poste`, `Éclairage`]);
  assert.equal(deleteRow(t, 0), null);
  assert.deepEqual(deleteColumn(t, 1)?.rows[0], [`Poste`, `Part`]);
  assert.equal(deleteColumn({ rows: [[`a`]], align: [`none`] }, 0), null);
  assert.deepEqual(moveRow(t, 2, -1)?.rows.map((r) => r[0]), [`Poste`, `Éclairage`, `Chauffage`]);
  assert.equal(moveRow(t, 1, -1), null);
  assert.deepEqual(moveColumn(t, 0, 1)?.rows[0], [`kWh`, `Poste`, `Part`]);
  assert.deepEqual(setAlign(t, 0, `center`).align[0], `center`);
});

test(`le tableau modifie remplace l'ancien sans toucher au reste de la note`, () => {
  const t = findTable(NOTE, NOTE.indexOf(`Éclairage`))!;
  const next = replaceTable(NOTE, t, addRow(t, 2, `below`));
  assert.ok(next.startsWith(`# Titre\n\nUn texte.\n\n| Poste`));
  assert.ok(next.endsWith(`\n\nSuite.`));
  const again = findTable(next, next.indexOf(`Éclairage`))!;
  assert.equal(again.rows.length, 4);
  assert.deepEqual(again.align, t.align);
  assert.equal(renderTable({ rows: [[`a`, `b`], [``, `x`]], align: [`none`, `right`] }), `| a | b |\n| --- | ---: |\n|   | x |`);
});

test(`la colonne se lit d'apres la position dans la ligne`, () => {
  const line = `| Poste | kWh | Part |`;
  assert.equal(columnAt(line, 3), 0);
  assert.equal(columnAt(line, line.indexOf(`kWh`) + 1), 1);
  assert.equal(columnAt(line, line.length - 2), 2);
});

test(`le style s'ecrit au-dessus du tableau, ou de sa legende, et se retire`, () => {
  let text = NOTE;
  let span = findTable(text, text.indexOf(`Éclairage`))!;
  text = setTableStyle(text, span, { header: true, equal: true });
  assert.ok(text.includes(`Un texte.\n\n%% mmw-table {"header":true,"equal":true} %%\n\n| Poste`));
  span = findTable(text, text.indexOf(`Éclairage`))!;
  assert.deepEqual(tableContext(text, span).style, { header: true, equal: true });
  // Une legende s'ajoute sous le repere.
  text = setCaption(text, span, `Consommations`);
  span = findTable(text, text.indexOf(`Éclairage`))!;
  assert.ok(text.includes(`%%\n\nTableau : Consommations\n\n| Poste`));
  assert.equal(tableContext(text, span).caption, `Consommations`);
  // Le repere change, sans toucher a la legende.
  text = setTableStyle(text, span, { header: true, stripes: true, equal: true });
  span = findTable(text, text.indexOf(`Éclairage`))!;
  assert.deepEqual(tableContext(text, span).style, { header: true, stripes: true, equal: true });
  assert.equal(tableContext(text, span).caption, `Consommations`);
  // Plus aucun choix : le repere disparait avec sa ligne vide.
  text = setTableStyle(text, span, {});
  assert.ok(!text.includes(`mmw-table`));
  assert.ok(text.includes(`Un texte.\n\nTableau : Consommations\n\n| Poste`));
  span = findTable(text, text.indexOf(`Éclairage`))!;
  text = setCaption(text, span, null);
  assert.equal(text, NOTE);
});

test(`creation d'un tableau neuf : repere, legende a remplir et cellules vides`, () => {
  const b = newTableBlock({ rows: 3, cols: 2, style: { header: true, equal: true }, caption: true });
  assert.equal(b.text, `%% mmw-table {"header":true,"equal":true} %%\n\nTableau : \n\n|   |   |\n| --- | --- |\n|   |   |\n|   |   |`);
  assert.equal(b.text.slice(0, b.cursor), `%% mmw-table {"header":true,"equal":true} %%\n\nTableau : `);
  const plain = newTableBlock({ rows: 2, cols: 2, style: {}, caption: false });
  assert.equal(plain.text, `|   |   |\n| --- | --- |\n|   |   |`);
  assert.equal(plain.cursor, 2);
});

test(`le bloc s'insere separe du texte voisin par des lignes vides`, () => {
  const block = newTableBlock({ rows: 2, cols: 2, style: {}, caption: false });
  const a = insertBlock(`Un texte.\nAutre ligne.`, 3, block);
  assert.equal(a.text, `Un texte.\n\n${block.text}\n\nAutre ligne.`);
  const onBlank = insertBlock(`Avant.\n\n\nApres.`, 7, block);
  assert.ok(onBlank.text.startsWith(`Avant.\n\n|   |`));
  assert.ok(onBlank.text.endsWith(`\n\nApres.`));
  assert.equal(onBlank.text.slice(onBlank.cursor - 2, onBlank.cursor), `| `.slice(0, 2));
  const end = insertBlock(`Fin`, 3, block);
  assert.equal(end.text, `Fin\n\n${block.text}`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { cellAtLine, MenuSpec, tableMenu } from "../src/table-menu";
import { columnAt, findTable } from "../src/table-edit";

const NOTE = `Avant.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\nApres.`;
const at = NOTE.indexOf(`| 3`);

function flat(items: MenuSpec[]): MenuSpec[] {
  return items.flatMap((i) => (i.submenu ? [i, ...flat(i.submenu)] : [i]));
}
const item = (items: MenuSpec[], title: string): MenuSpec => {
  const f = flat(items).find((i) => i.title === title);
  assert.ok(f, title);
  return f;
};

test(`le menu n'existe que dans un tableau et propose les actions de ligne, colonne, style et nom`, () => {
  assert.equal(tableMenu(NOTE, 0), null);
  const m = tableMenu(NOTE, at, { row: 2, col: 1 });
  assert.ok(m);
  const titles = flat(m).map((i) => i.title).filter(Boolean);
  for (const expected of [`Insérer une ligne en dessous`, `Supprimer la colonne`, `Ligne d'en-tête foncée`, `Alternance de lignes`, `Colonnes de largeur égale`, `Nom du tableau`, `Centré`]) assert.ok(titles.includes(expected), expected);
});

test(`les actions de ligne et de colonne s'appliquent au texte`, () => {
  const m = tableMenu(NOTE, at, { row: 1, col: 0 })!;
  const added = item(m, `Insérer une ligne en dessous`).run!(NOTE)!;
  assert.equal(findTable(added, added.indexOf(`| 1`))!.rows.length, 4);
  assert.ok(added.startsWith(`Avant.\n\n| A | B |`) && added.endsWith(`\n\nApres.`));
  const col = item(m, `Insérer une colonne à droite`).run!(NOTE)!;
  assert.deepEqual(findTable(col, col.indexOf(`| 1`))!.rows[0], [`A`, ``, `B`]);
  const del = item(m, `Supprimer la ligne`).run!(NOTE)!;
  assert.equal(findTable(del, del.indexOf(`| 3`))!.rows.length, 2);
  const moved = item(tableMenu(NOTE, at, { row: 2, col: 0 })!, `Déplacer la ligne vers le haut`).run!(NOTE)!;
  assert.deepEqual(findTable(moved, moved.indexOf(`| A`))!.rows.map((r) => r[0]), [`A`, `3`, `1`]);
  const right = item(m, `À droite`).run!(NOTE)!;
  assert.deepEqual(findTable(right, right.indexOf(`| A`))!.align, [`right`, `none`]);
});

test(`l'en-tete ne se supprime pas ni ne se deplace, et la derniere colonne reste`, () => {
  const m = tableMenu(NOTE, at, { row: 0, col: 0 })!;
  assert.equal(item(m, `Insérer une ligne au-dessus`).disabled, true);
  assert.equal(item(m, `Supprimer la ligne`).disabled, true);
  const one = tableMenu(`| A |\n| --- |\n| 1 |`, 1, { row: 1, col: 0 })!;
  assert.equal(item(one, `Supprimer la colonne`).disabled, true);
});

test(`le style et le nom se basculent, et les coches suivent l'etat`, () => {
  let text = NOTE;
  for (const title of [`Ligne d'en-tête foncée`, `Colonnes de largeur égale`, `Nom du tableau`]) {
    const m = tableMenu(text, text.indexOf(`| 3`), { row: 1, col: 0 })!;
    assert.equal(item(m, title).checked, false, title);
    text = item(m, title).run!(text)!;
  }
  assert.ok(text.includes(`%% mmw-table {"header":true,"equal":true} %%`));
  assert.ok(/Tableau : \n\n\| A/.test(text));
  const m = tableMenu(text, text.indexOf(`| 3`), { row: 1, col: 0 })!;
  assert.equal(item(m, `Ligne d'en-tête foncée`).checked, true);
  assert.equal(item(m, `Nom du tableau`).checked, true);
  assert.equal(item(m, `Alternance de lignes`).checked, false);
  // Un second passage retire ce qui avait ete ajoute.
  for (const title of [`Ligne d'en-tête foncée`, `Colonnes de largeur égale`, `Nom du tableau`]) text = item(tableMenu(text, text.indexOf(`| 3`), { row: 1, col: 0 })!, title).run!(text)!;
  assert.equal(text, NOTE);
});

test(`une legende en anglais s'ecrit avec le mot Table`, () => {
  const en = `---\nlang: en\n---\n\n${NOTE}`;
  const m = tableMenu(en, en.indexOf(`| 3`), { row: 1, col: 0 })!;
  const next = item(m, `Nom du tableau`).run!(en)!;
  assert.ok(next.includes(`Table: \n\n| A`));
});

test(`la cellule visee se deduit de la ligne et de la colonne du curseur dans le texte brut`, () => {
  const headerLine = NOTE.split(`\n`).findIndex((l) => l.startsWith(`| A`));
  assert.deepEqual(cellAtLine(NOTE, headerLine, 2, columnAt), { row: 0, col: 0 });
  assert.deepEqual(cellAtLine(NOTE, headerLine + 1, 2, columnAt), { row: 0, col: 0 });
  assert.deepEqual(cellAtLine(NOTE, headerLine + 3, NOTE.split(`\n`)[headerLine + 3].indexOf(`4`), columnAt), { row: 2, col: 1 });
  assert.equal(cellAtLine(NOTE, 0, 0, columnAt), null);
});

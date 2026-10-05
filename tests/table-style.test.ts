import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc } from "../src/export/doc-tree";
import { composeNote, composeToPdf } from "../src/export/compose";
import { A4_SETUP, DEFAULT_PAGE_STYLE, typesetDoc } from "../src/export/typeset";
import { equalWidths, HEADER_FILL } from "../src/export/table";
import { formatTableMarker, markTableMarkers, parseTableMarker } from "../src/table-marker";

const INLINE = { ...DEFAULT_PAGE_STYLE, floats: `inline` as const };
const TABLE = `| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |`;

test(`le repere de style d'un tableau se lit et s'ecrit`, () => {
  assert.deepEqual(parseTableMarker(`%% mmw-table {"header":true,"stripes":true,"equal":true} %%`), { header: true, stripes: true, equal: true });
  assert.deepEqual(parseTableMarker(`%% mmw-table {"equal":true} %%`), { equal: true });
  assert.deepEqual(parseTableMarker(`%% mmw-table %%`), {});
  assert.equal(parseTableMarker(`%% mmw-table {abime %%`), null);
  assert.equal(parseTableMarker(`%% mmw {"short":"x"} %%`), null);
  assert.equal(parseTableMarker(`Tableau : x`), null);
  assert.equal(formatTableMarker({}), null);
  assert.equal(formatTableMarker({ header: true, equal: true }), `%% mmw-table {"header":true,"equal":true} %%`);
  assert.deepEqual(parseTableMarker(formatTableMarker({ header: true, stripes: true }) as string), { header: true, stripes: true });
  assert.ok(!markTableMarkers(`%% mmw-table {"equal":true} %%\n\nTexte`).includes(`%%`));
});

test(`le style se rattache au tableau, avec ou sans legende, et ne laisse aucune trace dans le texte`, () => {
  for (const note of [
    `# A\n\n%% mmw-table {"header":true} %%\n\n${TABLE}`,
    `# A\n\n%% mmw-table {"header":true} %%\n\nTableau : Consommations\n\n${TABLE}`,
    `# A\n\n%% mmw-table {"header":true} %%\nTableau : Consommations\n${TABLE}`,
  ]) {
    const doc = buildExportDoc(note, `A.md`);
    const blocks = doc.sections[0]?.blocks ?? doc.blocks;
    const table = blocks.find((b) => b.type === `table`);
    assert.ok(table && table.type === `table`, note);
    assert.deepEqual(table.style, { header: true });
    assert.ok(!blocks.some((b) => b.type === `paragraph` && /mmw-table/.test(b.text)), `aucun reste du repere`);
    if (note.includes(`Consommations`)) assert.equal(table.caption, `Consommations`);
  }
  // Un repere sans tableau, ou separe du tableau par un paragraphe, ne change rien.
  const orphan = buildExportDoc(`# A\n\n%% mmw-table {"header":true} %%\n\nUn paragraphe.\n\n${TABLE}`, `A.md`);
  const t = (orphan.sections[0]?.blocks ?? orphan.blocks).find((b) => b.type === `table`);
  assert.ok(t && t.type === `table` && t.style === undefined);
});

test(`en-tete fonce, alternance et colonnes egales dans la mise en page`, () => {
  const note = `# A\n\n%% mmw-table {"header":true,"stripes":true,"equal":true} %%\n\n| Poste | Valeur | Remarque |\n| --- | --- | --- |\n| Chauffage | 120 | Électricité |\n| Éclairage | 15 | LED |\n| Eau | 40 | Réseau |\n| Autre | 3 | Divers |`;
  const t = typesetDoc(buildExportDoc(note, `A.md`), A4_SETUP, undefined, INLINE);
  const rows = t.rows.filter((r) => r.kind === `table`);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0].shade, { fill: HEADER_FILL, text: `white` });
  assert.equal(rows[1].shade, undefined);
  assert.deepEqual(rows[2].shade, { fill: 0.93 });
  assert.equal(rows[3].shade, undefined);
  assert.deepEqual(rows[4].shade, { fill: 0.93 });
  // Les trois colonnes ont la meme largeur : les cellules de la premiere ligne sont a intervalle regulier.
  const xs = (rows[0].cells ?? []).map((c) => c.x);
  assert.equal(xs.length, 3);
  assert.ok(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1])) < 0.01);
  // Sans style : ni fond ni largeurs egales.
  const plain = typesetDoc(buildExportDoc(note.replace(/%% mmw-table.*%%\n\n/, ``), `A.md`), A4_SETUP, undefined, INLINE).rows.filter((r) => r.kind === `table`);
  assert.ok(plain.every((r) => r.shade === undefined));
});

test(`les largeurs egales cedent devant un mot trop long`, () => {
  assert.deepEqual(equalWidths([100, 40, 10], [20, 20, 10], 300), [100, 100, 100]);
  const w = equalWidths([400, 40], [200, 20], 300);
  assert.ok(w[0] > w[1]);
  assert.ok(Math.abs(w[0] + w[1] - 300) < 1e-6);
});

test(`le PDF d'un tableau avec fond et ecriture blanche se produit`, async () => {
  const note = `# A\n\n%% mmw-table {"header":true,"stripes":true,"equal":true} %%\n\n${TABLE}`;
  const composed = composeNote(note, `A.md`, A4_SETUP, { ...DEFAULT_PAGE_STYLE, floats: `inline` });
  const shaded = composed.pages.flatMap((p) => p.rows).filter((r) => r.shade);
  assert.equal(shaded.length, 2);
  const pdf = await composeToPdf(composed, { creator: `Bigorneau`, created: new Date(`2026-10-01T15:00:00Z`) });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(`latin1`), `%PDF-`);
});

test(`les lignes de repere de style d'un tableau sont reperees pour etre masquees`, async () => {
  const { markerLineStarts } = await import(`../src/table-marker-hide`);
  const text = `Avant\n%% mmw-table {"header":true} %%\n\nTableau : x\n\n| A |\n| --- |\n%% commentaire %%\n%% mmw-table %%`;
  assert.deepEqual(markerLineStarts(text), [text.indexOf(`%% mmw-table {`), text.lastIndexOf(`%% mmw-table %%`)]);
  assert.deepEqual(markerLineStarts(`Rien ici`), []);
});

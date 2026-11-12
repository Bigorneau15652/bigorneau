import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { chartBlock, defaultChart, parseChart, serializeChart } from "../src/chart/spec";
import { columnIndex, decodeText, parseCsv, parseRange, readSpreadsheet, SpreadsheetError, tableOfSheet } from "../src/chart/spreadsheet";

const inflate = async (data: Uint8Array, limit: number): Promise<Uint8Array> => new Uint8Array(inflateRawSync(data, { maxOutputLength: limit }));
const noTranspose = { range: ``, transpose: false };

test(`tableur : fichiers CSV avec guillemets, separateurs et codage`, () => {
  assert.deepEqual(parseCsv(`a;b;c\n1;"x;y";3,5\n`), [[`a`, `b`, `c`], [`1`, `x;y`, `3,5`]]);
  assert.deepEqual(parseCsv(`a,b\n"dit ""oui""",2\r\n\r\n3,4`), [[`a`, `b`], [`dit "oui"`, `2`], [`3`, `4`]]);
  assert.deepEqual(parseCsv(`a\tb\n1\t2`), [[`a`, `b`], [`1`, `2`]]);
  // UTF-8 with its mark, or the Windows encoding that Excel writes in France.
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x43, 0xc3, 0xa9])), `Cé`);
  assert.equal(decodeText(new Uint8Array([0x43, 0xe9])), `Cé`);
});

test(`tableur : lecture d'un fichier xlsx (textes partages, nombres, deux feuilles)`, async () => {
  const sheets = await readSpreadsheet(`sample.xlsx`, new Uint8Array(readFileSync(`tests/charts/sample.xlsx`)), inflate);
  assert.deepEqual(sheets.map((s) => s.name), [`Ventes`, `Autre & co`]);
  assert.deepEqual(sheets[0].rows, [[`Mois`, `Ventes`, `Coûts`], [`Janvier`, `120`, `80.5`], [`Février`, `0.3`, ``], [], [`Mars & avril`, `7`, `12`]]);
  assert.deepEqual(sheets[1].rows, [[`X`, `Y`], [`a`, `1`]]);
  const table = tableOfSheet(sheets[0].rows, noTranspose);
  assert.deepEqual(table?.categories, [`Janvier`, `Février`, `Mars & avril`]);
  assert.deepEqual(table?.series.map((s) => [s.name, s.values]), [[`Ventes`, [120, 0.3, 7]], [`Coûts`, [80.5, null, 12]]]);
});

test(`tableur : lecture d'un fichier ods (cellules et lignes repetees, espaces, pourcentages)`, async () => {
  const sheets = await readSpreadsheet(`sample.ods`, new Uint8Array(readFileSync(`tests/charts/sample.ods`)), inflate);
  assert.deepEqual(sheets.map((s) => s.name), [`Feuille1`, `Deux`]);
  assert.deepEqual(sheets[0].rows, [[`Mois`, `Ventes`, `Coûts`], [`Jan  vier & co`, `120`, `0.25`], [`Rep`, `5`, `5`], [`Rep`, `5`, `5`]]);
  assert.deepEqual(sheets[1].rows, [[`A`, `B`], [`x`, `2`]]);
});

test(`tableur : fichiers refuses, vides ou abimes`, async () => {
  await assert.rejects(readSpreadsheet(`vieux.xls`, new Uint8Array(10), inflate), (e: unknown) => e instanceof SpreadsheetError && e.code === `unsupported`);
  await assert.rejects(readSpreadsheet(`vide.csv`, new Uint8Array(0), inflate), (e: unknown) => e instanceof SpreadsheetError && e.code === `empty`);
  await assert.rejects(readSpreadsheet(`casse.xlsx`, new Uint8Array(100), inflate), (e: unknown) => e instanceof SpreadsheetError);
});

test(`tableur : plage, lignes et colonnes inversees, limites`, () => {
  assert.equal(columnIndex(`A`), 0);
  assert.equal(columnIndex(`AB`), 27);
  assert.deepEqual(parseRange(`b2:D4`), { c0: 1, r0: 1, c1: 3, r1: 3 });
  assert.equal(parseRange(`n'importe quoi`), null);
  const rows = [[`x`, `a`, `b`, `c`], [`r1`, `1`, `2`, `3`], [`r2`, `4`, `5`, `6`], [`r3`, `7`, `8`, `9`]];
  // The part B1:C3 has its own header row and first column.
  const part = tableOfSheet(rows, { range: `B1:C3`, transpose: false });
  assert.deepEqual(part?.categories, [`1`, `4`]);
  assert.deepEqual(part?.series.map((s) => [s.name, s.values]), [[`b`, [2, 5]]]);
  const flipped = tableOfSheet(rows, { range: ``, transpose: true });
  assert.deepEqual(flipped?.categories, [`a`, `b`, `c`]);
  assert.deepEqual(flipped?.series.map((s) => s.name), [`r1`, `r2`, `r3`]);
  assert.equal(tableOfSheet(rows, { range: `zz`, transpose: false }), null);
  assert.equal(tableOfSheet([[`seulement`, `un en-tete`]], noTranspose), null);
  // A sheet without a row of names: the first row is data.
  const bare = tableOfSheet([[`Lundi`, `35`, `14`], [`Mardi`, `25`, `53`]], noTranspose);
  assert.deepEqual(bare?.categories, [`Lundi`, `Mardi`]);
  assert.deepEqual(bare?.series.map((x) => x.name), [``, ``]);
  assert.deepEqual(tableOfSheet([[`x`, `y`], [`a`, `1`]], { ...noTranspose, header: false })?.categories, [`x`, `a`]);
  // More than 12 series are cut and reported.
  const wide = [Array.from({ length: 20 }, (_x, i) => `s${i}`), Array.from({ length: 20 }, (_x, i) => String(i))];
  const cut = tableOfSheet(wide, noTranspose);
  assert.equal(cut?.series.length, 12);
  assert.equal(cut?.truncated, true);
});

test(`tableur : la source d'un graphique est ecrite et relue dans son bloc`, () => {
  const spec = { ...defaultChart(), source: { path: `Donnees/Ventes 2026.xlsx`, sheet: `Ventes`, range: `A1:C9`, transpose: true, header: true } };
  assert.deepEqual(parseChart(serializeChart(spec)), spec);
  assert.ok(chartBlock(spec).includes(`source: Donnees/Ventes 2026.xlsx\nsheet: Ventes\nrange: A1:C9\ntranspose: true\ndata:`));
  // Headers are the default; a table without headers is written and read back.
  assert.equal(parseChart(`source: a.csv\ndata:\n;A\nx;1`).source?.header, true);
  const bare = { ...spec, source: { ...spec.source, header: false } };
  assert.ok(chartBlock(bare).includes(`header: false\ndata:`));
  assert.deepEqual(parseChart(serializeChart(bare)), bare);
  assert.equal(parseChart(`type: bar\n`).source, undefined);
});

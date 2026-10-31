import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPrintOptions, directPrintOptions, isPageListSyntax, PAPER_SIZES, paperName, parsePageList, placement, runsOfSameSheet, sanitizePrintOptions, sheetFor } from "../src/print-options";

const A4 = PAPER_SIZES.a4;
const A4_LAND = { width: A4.height, height: A4.width };

test(`a list of pages is read: all, one page, a range, an open range, several parts`, () => {
  assert.deepEqual(parsePageList(``, 4), [1, 2, 3, 4]);
  assert.deepEqual(parsePageList(`3`, 5), [3]);
  assert.deepEqual(parsePageList(`2-4`, 5), [2, 3, 4]);
  assert.deepEqual(parsePageList(`3-`, 5), [3, 4, 5]);
  assert.deepEqual(parsePageList(`5, 1-2 ; 2`, 6), [1, 2, 5]);
  assert.deepEqual(parsePageList(`2-99`, 4), [2, 3, 4]);
});

test(`a wrong list of pages gives nothing`, () => {
  for (const bad of [`a`, `0`, `0-2`, `4-2`, `1,,2`, `-3`, `1-2-3`, `9`, `7-9`]) assert.equal(parsePageList(bad, 5), null, bad);
  assert.ok(isPageListSyntax(`2-5, 8`) && isPageListSyntax(``) && !isPageListSyntax(`x`));
});

test(`the sheet follows the note, or the chosen paper turned as asked`, () => {
  const portrait = { width: 595.276, height: 841.89 };
  const landscape = { width: 841.89, height: 595.276 };
  assert.deepEqual(sheetFor(portrait, { paper: `note`, orientation: `auto` }), portrait);
  assert.deepEqual(sheetFor(landscape, { paper: `note`, orientation: `auto` }), landscape);
  assert.deepEqual(sheetFor(portrait, { paper: `note`, orientation: `landscape` }), landscape);
  assert.deepEqual(sheetFor(landscape, { paper: `note`, orientation: `portrait` }), portrait);
  assert.deepEqual(sheetFor(portrait, { paper: `a3`, orientation: `auto` }), PAPER_SIZES.a3);
  assert.deepEqual(sheetFor(landscape, { paper: `a3`, orientation: `auto` }), { width: PAPER_SIZES.a3.height, height: PAPER_SIZES.a3.width });
  assert.deepEqual(sheetFor(portrait, { paper: `letter`, orientation: `landscape` }), { width: 792, height: 612 });
});

test(`a page keeps its size on a sheet of the same size and is centred and reduced on a smaller one`, () => {
  assert.deepEqual(placement(A4, A4), { scale: 1, x: 0, y: 0 });
  const half = placement(PAPER_SIZES.a4, PAPER_SIZES.a5);
  assert.ok(half.scale < 0.71 && half.scale > 0.7);
  assert.ok(Math.abs(half.x) < 0.01 && Math.abs(half.y) < 2);
  // A portrait page on a landscape sheet is limited by the height and centred on the width.
  const turned = placement(A4, A4_LAND);
  assert.ok(Math.abs(turned.scale - A4.width / A4.height) < 1e-9);
  assert.ok(turned.x > 0 && Math.abs(turned.y) < 1e-9);
  // Nothing is ever cut: the reduced page always fits in the sheet.
  for (const paper of [`a3`, `a5`, `letter`] as const) {
    const p = placement(A4, PAPER_SIZES[paper]);
    assert.ok(A4.width * p.scale + p.x * 2 <= PAPER_SIZES[paper].width + 1e-6 && A4.height * p.scale + p.y * 2 <= PAPER_SIZES[paper].height + 1e-6);
  }
});

test(`the pages are cut into jobs of consecutive pages that have the same sheet`, () => {
  const pages = [`p1`, `p2`, `l3`, `p4`, `p5`];
  const runs = runsOfSameSheet(pages, (p) => (p.startsWith(`l`) ? A4_LAND : A4));
  assert.deepEqual(runs, [[`p1`, `p2`], [`l3`], [`p4`, `p5`]]);
  assert.deepEqual(runsOfSameSheet(pages, () => A4), [pages]);
  assert.deepEqual(runsOfSameSheet([], () => A4), []);
});

test(`the settings for a printer carry the paper name, the colour, the copies, and the duplex only when it is wanted`, () => {
  const s = directPrintOptions(`Canon G6000 series`, A4_LAND, { color: `gray`, copies: 3, duplex: `long` });
  assert.equal(s.silent, true);
  assert.equal(s.deviceName, `Canon G6000 series`);
  assert.equal(s.color, false);
  assert.equal(s.copies, 3);
  assert.equal(s.landscape, true);
  assert.equal(s.duplexMode, `longEdge`);
  assert.equal(s.pageSize, `A4`);
  const plain = directPrintOptions(`P`, A4, { color: `color`, copies: 1, duplex: `none` });
  assert.equal(plain.color, true);
  assert.equal(plain.landscape, false);
  assert.ok(!(`duplexMode` in plain), `no duplex mode asked, none sent`);
  assert.equal(directPrintOptions(`P`, A4, { color: `color`, copies: 1, duplex: `short` }).duplexMode, `shortEdge`);
  // A size without a name goes in microns, in portrait.
  const odd = directPrintOptions(`P`, { width: 700, height: 500 }, { color: `color`, copies: 1, duplex: `none` });
  const size = odd.pageSize as { width: number; height: number };
  assert.ok(size.width < size.height && odd.landscape === true);
  assert.equal(paperName({ width: 612.5, height: 791 }), `Letter`);
  assert.equal(paperName({ width: 700, height: 500 }), null);
});

test(`saved options are checked: a wrong value goes back to its default`, () => {
  assert.deepEqual(sanitizePrintOptions(undefined), defaultPrintOptions());
  assert.deepEqual(sanitizePrintOptions({ pages: `2-5`, orientation: `landscape`, paper: `a3`, color: `bw`, printer: `Canon`, copies: 2, duplex: `short` }), { pages: `2-5`, orientation: `landscape`, paper: `a3`, color: `bw`, printer: `Canon`, copies: 2, duplex: `short` });
  const bad = sanitizePrintOptions({ pages: `x;y`, orientation: `diagonal`, paper: `b0`, color: 5, printer: `a\u0007b`, copies: 500, duplex: null });
  assert.deepEqual(bad, { ...defaultPrintOptions(), copies: 99 });
  assert.equal(sanitizePrintOptions({ copies: -3 }).copies, 1);
});

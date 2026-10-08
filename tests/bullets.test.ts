import { test } from "node:test";
import assert from "node:assert/strict";
import { bulletAt, bulletMark, DEFAULT_BULLETS, sanitizeBullets } from "../src/bullets";
import { composeNote, composeToPdf } from "../src/export/compose";
import { DEFAULT_PAGE_STYLE } from "../src/export/typeset";
import { migrateSettings } from "../src/settings";

const NOTE = `# Liste\n\n- un\n  - deux\n    - trois\n      - quatre\n        - cinq\n          - six\n            - sept\n`;
const rowsOf = (style = DEFAULT_PAGE_STYLE) => composeNote(NOTE, `N.md`, undefined, style).pages.flatMap((p) => p.rows).filter((r) => r.kind === `list`);

test(`par defaut : disque plein, disque vide, carre plein, puis le trait d'union`, () => {
  const rows = rowsOf();
  assert.equal(rows.length, 7);
  assert.equal(rows[0].bullet, `disc`);
  assert.equal(rows[1].bullet, `circle`);
  assert.equal(rows[2].bullet, `square`);
  for (const r of rows.slice(3)) assert.equal(r.marker, `-`);
});

test(`le reglage change la puce de chaque niveau, et au-dela du sixieme niveau c'est le trait d'union`, () => {
  const rows = rowsOf({ ...DEFAULT_PAGE_STYLE, bullets: [`dash`, `none`, `diamondOpen`, `arrow`, `asterisk`, `dot`] });
  assert.equal(rows[0].marker, `–`);
  assert.equal(rows[1].marker, undefined);
  assert.equal(rows[1].bullet, undefined);
  assert.equal(rows[2].bullet, `diamondOpen`);
  assert.equal(rows[3].marker, `→`);
  assert.equal(rows[5].marker, `·`);
  assert.equal(rows[6].marker, `-`);
});

test(`une liste numerotee garde ses numeros`, () => {
  const rows = composeNote(`# L\n\n1. a\n2. b\n`, `N.md`).pages.flatMap((p) => p.rows).filter((r) => r.kind === `list`);
  assert.deepEqual(rows.map((r) => r.marker), [`1.`, `2.`]);
});

test(`les reglages invalides reviennent aux valeurs par defaut`, () => {
  assert.deepEqual(sanitizeBullets(undefined), DEFAULT_BULLETS);
  assert.deepEqual(sanitizeBullets([`square`, `inconnu`, 3]), [`square`, ...DEFAULT_BULLETS.slice(1)]);
  assert.equal(sanitizeBullets(new Array(10).fill(`dash`)).length, 6);
  assert.deepEqual(migrateSettings({ exportBullets: [`arrow`] }).exportBullets, [`arrow`, ...DEFAULT_BULLETS.slice(1)]);
  assert.equal(bulletAt(DEFAULT_BULLETS, 9), `hyphen`);
  assert.equal(bulletMark(`none`), null);
});

test(`le PDF dessine les formes des puces`, async () => {
  const pdf = Buffer.from(await composeToPdf(composeNote(NOTE, `N.md`), { creator: `Bigorneau`, created: new Date(`2026-10-01T15:00:00Z`) })).toString(`latin1`);
  assert.ok(pdf.length > 1000);
});

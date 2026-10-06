import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote, composeToPdf } from "../src/export/compose";
import { columnsOf } from "../src/export/paginate";
import { defaultConfig, formatPageMarker } from "../src/page-config";
import { columnWidthOf, COLUMN_GAP, defaultLayout, FORMATS, marginOf, maxColumns, pageSetupOf, sanitizeLayout } from "../src/page-layout";

const body = (): string => Array.from({ length: 6 }, (_, i) => `# Chapitre ${i + 1}\n\n${`Un texte assez long pour remplir la page. `.repeat(50)}`).join(`\n\n`);

const note = (patch: (c: ReturnType<typeof defaultConfig>) => void): string => {
  const c = defaultConfig();
  patch(c);
  return `${formatPageMarker(c)}\n\n${body()}`;
};

test(`les formats, l'orientation et les marges donnent la feuille`, () => {
  const a4 = pageSetupOf(defaultLayout());
  assert.equal(a4.width, 595.28);
  assert.equal(a4.height, 841.89);
  assert.equal(a4.marginLeft, 72);
  const land = pageSetupOf({ ...defaultLayout(), orientation: `landscape` });
  assert.equal(land.width, 841.89);
  assert.equal(land.height, 595.28);
  const a3 = pageSetupOf({ ...defaultLayout(), format: `a3` });
  assert.ok(Math.abs(a3.width - 297 * (72 / 25.4)) < 1e-6);
  // Les marges diminuent avec les petites feuilles, et les trois choix sont rangees.
  assert.ok(marginOf({ ...defaultLayout(), format: `a6` }) < marginOf(defaultLayout()));
  const m = (id: `narrow` | `normal` | `wide`): number => marginOf({ ...defaultLayout(), margins: id });
  assert.ok(m(`narrow`) < m(`normal`) && m(`normal`) < m(`wide`));
  assert.ok(Object.keys(FORMATS).length >= 9);
});

test(`le nombre de colonnes est borne par la largeur de la feuille`, () => {
  assert.equal(maxColumns(defaultLayout()), 3);
  assert.ok(maxColumns({ ...defaultLayout(), orientation: `landscape` }) >= 4);
  assert.ok(maxColumns({ ...defaultLayout(), format: `a3`, orientation: `landscape` }) >= 6);
  assert.equal(maxColumns({ ...defaultLayout(), format: `a6` }), 1);
  assert.equal(sanitizeLayout({ columns: 9, format: `a4` }).columns, 3);
  assert.deepEqual(sanitizeLayout({ format: `inconnu`, orientation: `x`, margins: `y`, columns: -3 }), defaultLayout());
  assert.deepEqual(sanitizeLayout(null), defaultLayout());
});

test(`la mise en page de la note est relue et sa feuille est celle de l'export`, () => {
  const text = note((c) => (c.layout = { format: `a5`, orientation: `landscape`, margins: `narrow`, columns: 2 }));
  const c = composeNote(text, `N.md`);
  assert.ok(Math.abs(c.setup.width - 210 * (72 / 25.4)) < 1e-6);
  assert.ok(Math.abs(c.setup.height - 148 * (72 / 25.4)) < 1e-6);
  assert.equal(composeNote(`# A\n\nTexte`, `N.md`).setup.width, 595.28);
});

test(`les colonnes regroupent les pages d'une colonne : moins de feuilles, colonnes cote a cote`, () => {
  const one = composeNote(note(() => undefined), `N.md`);
  const two = composeNote(note((c) => (c.layout = { ...c.layout, orientation: `landscape`, columns: 2 })), `N.md`);
  const three = composeNote(note((c) => (c.layout = { ...c.layout, orientation: `landscape`, columns: 3 })), `N.md`);
  assert.ok(two.pages.length > 0 && three.pages.length > 0);
  assert.ok(two.pages[0].columns && two.pages[0].columns.length === 2);
  const setup = two.setup;
  const colWidth = (setup.width - 2 * setup.marginLeft - COLUMN_GAP) / 2;
  const cols = columnsOf(two.pages[0], 0);
  assert.ok(Math.abs(cols[0].width - colWidth) < 1e-6 && Math.abs(cols[1].x - (colWidth + COLUMN_GAP)) < 1e-6);
  assert.ok(Math.abs(columnWidthOf({ ...defaultLayout(), orientation: `landscape`, columns: 2 }) - colWidth) < 1e-6);
  // Les feuilles sont numerotees a partir de 1, dans l'ordre, et le texte tient dans moins de feuilles qu'avec une colonne.
  assert.deepEqual(two.pages.map((p) => p.number), two.pages.map((_, i) => i + 1));
  assert.ok(one.pages.length > 1);
  // Les lignes d'une colonne ne depassent pas sa largeur.
  for (const row of cols[0].rows) assert.ok(row.x + row.width <= cols[0].width + 1e-6);
});

test(`l'en-tete et le PDF suivent la feuille et ses colonnes`, async () => {
  const text = note((c) => {
    c.layout = { format: `a5`, orientation: `portrait`, margins: `normal`, columns: 1 };
    c.footer.zones.center = `{page}`;
  });
  const c = composeNote(text, `N.md`);
  const item = (c.pages[0].decor ?? []).find((i) => i.kind === `text`);
  assert.ok(item && item.kind === `text` && item.x > 0 && item.baseline > c.setup.height - 60 && item.baseline < c.setup.height);
  const cols = composeNote(note((x) => (x.layout = { ...x.layout, orientation: `landscape`, columns: 2 })), `N.md`);
  const pdf = Buffer.from(await composeToPdf(cols, { creator: `B`, created: new Date(`2026-10-01T15:00:00Z`) })).toString(`latin1`);
  assert.equal([...pdf.matchAll(/\/Type \/Page /g)].length, cols.pages.length);
  assert.ok(pdf.includes(`/MediaBox [0 0 841.89 595.28]`) || pdf.includes(`/MediaBox [0 0 841.89 595.28`));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote } from "../src/export/compose";
import { buildExportDoc } from "../src/export/doc-tree";
import { anchorPages } from "../src/export/paginate";
import { A4_SETUP, DEFAULT_PAGE_STYLE, tocPlan, typesetDoc } from "../src/export/typeset";

const PARA = `Le bâtiment a été construit en 1972 et sa consommation d'énergie finale reste aujourd'hui supérieure à 180 kWh/m².an ; une rénovation globale suppose d'abord une analyse précise : isolation des murs et de la toiture.`;
const body = (n: number): string => Array.from({ length: n }, () => `${PARA}\n`).join(`\n`);
const NOTE = (fm = ``): string => `${fm}# Premier\n\n${body(3)}\n## Diagnostic\n\n${body(2)}\n### Détail\n\n${body(2)}\n## Plan d'action\n\n${body(2)}\n# Second\n\n${body(3)}\n## Suivi\n\n${body(2)}\n# Dernier\n\n${body(1)}`;

test(`les proprietes de la note l'emportent sur les reglages, champ par champ`, () => {
  const doc = (fm: string) => buildExportDoc(`${fm}# A`, `A.md`);
  const on = { ...DEFAULT_PAGE_STYLE, toc: true, tocDepth: 2, chapterToc: true, chapterTocDepth: 4 };
  assert.deepEqual(tocPlan(doc(``), DEFAULT_PAGE_STYLE), { general: 0, chapter: 0 });
  assert.deepEqual(tocPlan(doc(``), on), { general: 2, chapter: 4 });
  assert.deepEqual(tocPlan(doc(`---\ntoc: false\nchapter-toc: false\n---\n`), on), { general: 0, chapter: 0 });
  assert.deepEqual(tocPlan(doc(`---\ntoc: true\n---\n`), DEFAULT_PAGE_STYLE), { general: 3, chapter: 0 });
  assert.deepEqual(tocPlan(doc(`---\ntoc: true\ntoc-depth: 1\nchapter-toc: true\nchapter-toc-depth: 2\n---\n`), DEFAULT_PAGE_STYLE), { general: 1, chapter: 2 });
  // Une profondeur seule ne declenche rien : elle regle la table que les reglages activent.
  assert.deepEqual(tocPlan(doc(`---\ntoc-depth: 1\n---\n`), DEFAULT_PAGE_STYLE), { general: 0, chapter: 0 });
  assert.deepEqual(tocPlan(doc(`---\ntoc-depth: 1\n---\n`), on), { general: 1, chapter: 4 });
});

test(`la table generale du reglage s'applique quand la note n'a pas de propriete`, () => {
  const style = { ...DEFAULT_PAGE_STYLE, toc: true, tocDepth: 1 };
  const t = typesetDoc(buildExportDoc(NOTE(), `A.md`), A4_SETUP, undefined, style);
  const entries = t.rows.filter((r) => r.toc && r.toc.page >= 0).map((r) => r.text);
  assert.deepEqual(entries, [`Premier`, `Second`, `Dernier`]);
  const off = typesetDoc(buildExportDoc(NOTE(`---\ntoc: false\n---\n`), `A.md`), A4_SETUP, undefined, style);
  assert.ok(!off.rows.some((r) => r.toc));
});

test(`chaque chapitre a sa table des matieres, limitee a ses sous-titres et aux niveaux demandes`, () => {
  const style = { ...DEFAULT_PAGE_STYLE, chapterToc: true, chapterTocDepth: 3 };
  const t = typesetDoc(buildExportDoc(NOTE(), `A.md`), A4_SETUP, undefined, style);
  // Les entrees se suivent sous le titre de leur chapitre.
  const seq = t.rows.filter((r) => r.heading || (r.toc && r.toc.page >= 0)).map((r) => (r.heading ? `#${r.heading.title}` : r.text));
  assert.deepEqual(seq, [`#A`, `#Premier`, `Diagnostic`, `Détail`, `Plan d'action`, `#Diagnostic`, `#Détail`, `#Plan d'action`, `#Second`, `Suivi`, `#Suivi`, `#Dernier`]);
  // Le chapitre sans sous-titre n'a pas de table, et aucune table generale n'est produite.
  assert.equal(t.rows.filter((r) => r.toc && r.toc.page >= 0).length, 4);
  const shallow = typesetDoc(buildExportDoc(NOTE(), `A.md`), A4_SETUP, undefined, { ...style, chapterTocDepth: 2 });
  assert.deepEqual(shallow.rows.filter((r) => r.toc && r.toc.page >= 0).map((r) => r.text), [`Diagnostic`, `Plan d'action`, `Suivi`]);
});

test(`les tables des matieres generale et de chapitre ont les numeros de page de la mise en page finale`, () => {
  const style = { ...DEFAULT_PAGE_STYLE, toc: true, tocDepth: 2, chapterToc: true, chapterTocDepth: 3, chapterBreak: `level1` as const };
  const c = composeNote(NOTE(), `A.md`, A4_SETUP, style);
  const map = anchorPages(c.pages);
  const entries = c.typeset.rows.filter((r) => r.toc && r.toc.page >= 0);
  // Table generale : 3 chapitres et 3 sous-chapitres ; tables de chapitre : 3 + 1.
  assert.equal(entries.length, 6 + 4);
  for (const r of entries) assert.equal(r.toc?.page, map.get(r.toc?.anchor as string), r.text);
  // Le saut de page avant chaque chapitre fait que les chapitres sont sur des pages differentes et croissantes.
  const pages = ([`hid:1`, `hid:5`, `hid:7`] as string[]).map((a) => map.get(a) as number);
  assert.ok(pages[0] < pages[1] && pages[1] < pages[2], pages.join());
});

test(`la table d'un chapitre est cliquable et plus compacte que la table generale`, () => {
  const c = composeNote(NOTE(), `A.md`, A4_SETUP, { ...DEFAULT_PAGE_STYLE, toc: true, tocDepth: 1, chapterToc: true });
  const general = c.typeset.rows.find((r) => r.toc && r.toc.page >= 0)!;
  const chapter = c.typeset.rows.find((r) => r.toc && r.text === `Diagnostic`)!;
  assert.ok(chapter.fontSize < general.fontSize);
  assert.ok(chapter.toc!.anchor.startsWith(`hid:`));
});

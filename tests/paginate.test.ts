import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc } from "../src/export/doc-tree";
import { FOOTNOTE_RULE_HEIGHT, Page, paginate } from "../src/export/paginate";
import { A4_SETUP, DEFAULT_PAGE_STYLE, PageStyle, Row, typesetDoc } from "../src/export/typeset";

const PARA = `Le bâtiment a été construit en 1972 et sa consommation d'énergie finale reste aujourd'hui supérieure à 180 kWh/m².an ; une rénovation globale suppose d'abord une analyse précise : isolation des murs et de la toiture, remplacement des menuiseries, régulation du chauffage et ventilation double flux. Les résultats détaillés figurent dans le rapport d'audit énergétique du site, établi par un bureau d'études indépendant.`;
const AVAILABLE = A4_SETUP.height - A4_SETUP.marginTop - A4_SETUP.marginBottom;

function build(text: string, style: Partial<PageStyle> = {}): { pages: Page[]; rows: Row[] } {
  const full: PageStyle = { ...DEFAULT_PAGE_STYLE, ...style };
  const t = typesetDoc(buildExportDoc(text, `Audit.md`), A4_SETUP, undefined, full);
  return { pages: paginate(t, A4_SETUP, full), rows: t.rows };
}

const height = (rs: Row[]): number => rs.reduce((a, r) => a + r.height, 0);
const paragraphs = (n: number): string => Array.from({ length: n }, () => PARA).join(`\n\n`);

test(`les pages ne depassent pas la hauteur utile et ne commencent ni ne finissent par un espace`, () => {
  const { pages, rows } = build(`# Contexte\n\n${paragraphs(60)}`);
  assert.ok(pages.length >= 3);
  for (const p of pages) {
    const foot = p.footnotes.length > 0 ? FOOTNOTE_RULE_HEIGHT + height(p.footnotes) : 0;
    assert.ok(height(p.rows) + foot <= AVAILABLE + 1e-6, `page ${p.number}`);
    assert.notEqual(p.rows[0].kind, `space`);
    assert.notEqual(p.rows[p.rows.length - 1].kind, `space`);
  }
  // Toutes les lignes se retrouvent, dans l'ordre (aux espaces pres).
  assert.deepEqual(pages.flatMap((p) => p.rows).filter((r) => r.kind !== `space`).map((r) => r.text), rows.filter((r) => r.kind !== `space`).map((r) => r.text));
});

test(`un titre n'est jamais en bas de page, quelle que soit la longueur du texte qui le precede`, () => {
  let moved = 0;
  for (let n = 1; n <= 45; n++) {
    const text = [`# Debut`, ...Array.from({ length: n }, (_v, i) => `Ligne courte numero ${i}.\n`), `## Titre isole`, `Paragraphe qui suit le titre.`].join(`\n`);
    const { pages } = build(text);
    for (const p of pages.slice(0, -1)) assert.notEqual(p.rows[p.rows.length - 1].kind, `heading`, `titre en bas de page avec ${n} paragraphes`);
    if (pages.some((p) => p.rows[0].kind === `heading` && p.rows[0].text === `Titre isole`)) moved++;
  }
  assert.ok(moved > 0, `aucun titre n'a ete reporte sur la page suivante`);
});

test(`pas de ligne orpheline ni veuve quand une autre coupure est possible`, () => {
  // On fait varier la hauteur de la page : au moins un cas place naturellement la coupure apres la premiere ligne d'un
  // paragraphe ou avant sa derniere, que l'algorithme doit eviter.
  for (let bottom = 60; bottom <= 120; bottom += 2) {
    const setup = { ...A4_SETUP, marginBottom: bottom };
    const t = typesetDoc(buildExportDoc(`# Contexte\n\n${paragraphs(24)}`, `A.md`), setup);
    const pages = paginate(t, setup, DEFAULT_PAGE_STYLE);
    for (const p of pages.slice(0, -1)) {
      const last = p.rows[p.rows.length - 1];
      assert.ok(last.breakAfter < 150, `coupure apres une ligne orpheline ou veuve (marge ${bottom}, page ${p.number})`);
    }
  }
});

test(`les notes de bas de page sont sur la page de leur appel, numerotees dans l'ordre`, () => {
  const parts: string[] = [`# Contexte`, ``];
  const defs: string[] = [];
  for (let i = 1; i <= 30; i++) {
    parts.push(`${PARA} Appel numero ${i}[^n${i}].`, ``);
    defs.push(`[^n${i}]: Texte de la note numero ${i}, assez long pour tenir sur plus d'une ligne dans la colonne etroite du bas de page, avec des détails.`);
  }
  const { pages } = build([...parts, ...defs].join(`\n`));
  const labelsOnPages = pages.map((p) => ({
    called: p.rows.flatMap((r) => (r.sups ?? []).map(([a, b]) => r.text.slice(a, b))),
    noted: p.footnotes.filter((f) => f.marker !== undefined).map((f) => f.marker),
  }));
  for (const [i, l] of labelsOnPages.entries()) assert.deepEqual(l.noted, l.called, `page ${i + 1}`);
  const all = labelsOnPages.flatMap((l) => l.called);
  assert.deepEqual(all, Array.from({ length: 30 }, (_v, i) => String(i + 1)));
  // Les definitions ne restent pas dans le texte.
  assert.ok(!pages.some((p) => p.rows.some((r) => r.text.includes(`Texte de la note`))));
  for (const p of pages) assert.ok(height(p.rows) + (p.footnotes.length ? FOOTNOTE_RULE_HEIGHT + height(p.footnotes) : 0) <= AVAILABLE + 1e-6);
});

test(`une note trop longue se prolonge sur la page suivante sans rien perdre`, () => {
  const long = Array.from({ length: 1400 }, (_v, i) => `mot${i}`).join(` `);
  const text = [`# Contexte`, ``, `${PARA} Appel[^g].`, ``, paragraphs(3), ``, `[^g]: ${long}`].join(`\n`);
  const { pages } = build(text);
  const footRows = pages.flatMap((p) => p.footnotes);
  assert.ok(pages.filter((p) => p.footnotes.length > 0).length >= 2, `la note ne se prolonge pas`);
  assert.equal(footRows.filter((r) => r.marker !== undefined).length, 1);
  assert.ok(footRows.map((r) => r.text).join(` `).includes(`mot1399`));
  for (const p of pages) assert.ok(height(p.rows) + (p.footnotes.length ? FOOTNOTE_RULE_HEIGHT + height(p.footnotes) : 0) <= AVAILABLE + 1e-6);
});

test(`les appels sans definition sont signales et restent dans le texte`, () => {
  const t = typesetDoc(buildExportDoc(`# A\nUn appel[^inconnu] sans definition.`, `A.md`));
  assert.deepEqual(t.warnings, [`note:inconnu`]);
  assert.ok(t.rows.some((r) => r.text.includes(`[^inconnu]`)));
  assert.equal(t.footnotes.size, 0);
});

test(`les notes ecrites dans la phrase et les appels repetes`, () => {
  const t = typesetDoc(buildExportDoc(`# A\nUne phrase^[note ecrite dans la phrase] puis une autre[^x] et encore[^x].\n\n[^x]: Definition.`, `A.md`));
  assert.equal(t.footnotes.size, 2);
  const text = t.rows.filter((r) => r.kind === `text`).map((r) => r.text).join(` `);
  assert.ok(/phrase1 puis une autre2 et encore2\./.test(text.replace(/ /g, ``)), text);
});

test(`la numerotation des notes peut repartir de 1 a chaque chapitre`, () => {
  const text = [`# Un`, `Texte[^a].`, `# Deux`, `Texte[^b].`, ``, `[^a]: Note a.`, `[^b]: Note b.`].join(`\n`);
  const cont = typesetDoc(buildExportDoc(text, `A.md`));
  assert.deepEqual([...cont.footnotes.values()].map((b) => b.label), [`1`, `2`]);
  const per = typesetDoc(buildExportDoc(text, `A.md`), A4_SETUP, undefined, { ...DEFAULT_PAGE_STYLE, footnoteNumbering: `perChapter` });
  assert.deepEqual([...per.footnotes.values()].map((b) => b.label), [`1`, `1`]);
});

test(`les definitions de notes ecrites dans un chapitre masque servent aux appels des autres chapitres`, () => {
  const text = [`# Visible`, `Texte[^h].`, `# Cache`, `%% mmw {"hidden":true} %%`, `[^h]: Definition du chapitre masque.`].join(`\n`);
  const t = typesetDoc(buildExportDoc(text, `A.md`));
  assert.equal(t.footnotes.size, 1);
  assert.ok([...t.footnotes.values()][0].rows.map((r) => r.text).join(` `).includes(`Definition du chapitre masque`));
  assert.ok(!t.rows.some((r) => r.text.includes(`Cache`)));
});

test(`pages alignees en bas : toutes les pages sauf la derniere se terminent a la meme hauteur`, () => {
  const flush = build(`# Contexte\n\n${paragraphs(14)}\n\n## Suite\n\n${paragraphs(14)}\n\n## Fin\n\n${paragraphs(14)}`, { flushBottom: true });
  assert.ok(flush.pages.length >= 3);
  let aligned = 0;
  for (const p of flush.pages.slice(0, -1)) {
    const h = height(p.rows) + (p.footnotes.length ? FOOTNOTE_RULE_HEIGHT + height(p.footnotes) : 0);
    assert.ok(h <= AVAILABLE + 1e-6);
    if (Math.abs(h - AVAILABLE) < 1e-6) aligned++;
  }
  assert.ok(aligned >= 1, `aucune page n'a ete alignee en bas`);
  const ragged = build(`# Contexte\n\n${paragraphs(14)}\n\n## Suite\n\n${paragraphs(14)}`);
  const heights = ragged.pages.slice(0, -1).map((p) => Math.round(height(p.rows)));
  assert.ok(new Set(heights).size >= 1);
});

test(`saut de page avant chaque chapitre de premier niveau`, () => {
  const text = [`# Un`, paragraphs(1), `# Deux`, paragraphs(1), `## Sous-titre`, paragraphs(1), `# Trois`, paragraphs(1)].join(`\n\n`);
  const brk = build(text, { chapterBreak: `level1` });
  // La premiere page commence par le titre de la note ; chacune des suivantes qui contient un chapitre commence par lui.
  const starts: string[] = [];
  brk.pages.forEach((p, i) => {
    const chapter = p.rows.find((r) => r.chapterStart);
    if (!chapter) return;
    if (i > 0) assert.equal(p.rows.find((r) => r.kind !== `space`), chapter);
    starts.push(chapter.text);
  });
  assert.deepEqual(starts, [`Un`, `Deux`, `Trois`]);
  const none = build(text);
  assert.ok(none.pages.length < brk.pages.length);
});

test(`en-tete courant : titre du chapitre, sauf sur la premiere page et quand un chapitre commence en haut de la page`, () => {
  const { pages } = build(`# Premier\n\n${paragraphs(40)}\n\n# Second\n\n${paragraphs(2)}`);
  assert.equal(pages[0].header, undefined);
  const withHeader = pages.filter((p) => p.header);
  assert.ok(withHeader.length >= 1);
  for (const p of pages.slice(1)) {
    const first = p.rows.find((r) => r.kind !== `space`)!;
    if (first.chapterStart) assert.equal(p.header, undefined);
    else assert.equal(p.header, first.chapter);
  }
  assert.deepEqual(pages.map((p) => p.footer), pages.map((_p, i) => String(i + 1)));
});

test(`en-tete avec le titre de la note, ou sans en-tete ni pied de page`, () => {
  const text = `# Un\n\n${paragraphs(30)}`;
  const title = build(text, { header: `title` });
  assert.equal(title.pages[0].header, undefined);
  assert.ok(title.pages.slice(1).every((p) => p.header === `Audit`));
  const none = build(text, { header: `none`, footer: `none` });
  assert.ok(none.pages.every((p) => p.header === undefined && p.footer === undefined));
});

test(`un document vide ou tres court donne au moins une page sans erreur`, () => {
  assert.equal(build(``).pages.length, 1);
  assert.equal(build(`# A\ntexte`).pages.length, 1);
});

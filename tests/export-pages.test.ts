import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc } from "../src/export/doc-tree";
import { paginatePlain, wrapText } from "../src/export/plain-pages";

test(`la coupure de lignes respecte la largeur et garde les mots longs entiers`, () => {
  assert.deepEqual(wrapText(`un deux trois quatre`, 9), [`un deux`, `trois`, `quatre`]);
  assert.deepEqual(wrapText(`anticonstitutionnellement court`, 10), [`anticonstitutionnellement`, `court`]);
  assert.deepEqual(wrapText(`un deux trois`, 12, `  `, ``), [`  un deux`, `trois`]);
  assert.deepEqual(wrapText(`   `, 10), []);
});

const longText = (n: number): string => Array.from({ length: n }, (_v, i) => `mot${i}`).join(` `);

test(`les pages ne depassent jamais le nombre de lignes prevu`, () => {
  const doc = buildExportDoc([`# A`, longText(400), `# B`, longText(400)].join(`\n`), `N.md`);
  const { pages } = paginatePlain(doc, { columns: 40, linesPerPage: 20 });
  assert.ok(pages.length > 3);
  for (const p of pages) assert.ok(p.lines.length <= 20, `page ${p.number}`);
  assert.deepEqual(pages.map((p) => p.number), pages.map((_p, i) => i + 1));
  // Aucune page ne commence par une ligne vide.
  for (const p of pages) assert.notEqual(p.lines[0], ``);
});

test(`un titre n'est jamais seul en bas de page`, () => {
  // On fait varier la longueur du texte qui precede le titre : l'une des valeurs place le titre en fin de page.
  let moved = 0;
  for (let n = 5; n <= 25; n++) {
    const filler = Array.from({ length: n }, (_v, i) => `ligne${i}`).join(`\n\n`);
    const doc = buildExportDoc([`Intro`, ``, filler, ``, `## Titre isole`, `Paragraphe qui suit.`].join(`\n`), `N.md`);
    const { pages } = paginatePlain(doc, { columns: 40, linesPerPage: 20 });
    for (const p of pages) {
      const last = p.lines[p.lines.length - 1];
      assert.ok(last !== `Titre isole` && !/^-+$/.test(last), `titre en bas de la page ${p.number} avec ${n} lignes`);
    }
    const page = pages.find((p) => p.lines.includes(`Titre isole`))!;
    assert.ok(page.lines.some((l) => l.includes(`Paragraphe qui suit.`)), `titre separe de son paragraphe avec ${n} lignes`);
    // Le titre ouvre la page quand il a ete reporte.
    if (page.lines[0] === `Titre isole`) moved++;
  }
  assert.ok(moved > 0, `le cas d'un titre reporte sur la page suivante n'est jamais survenu`);
});

test(`le nombre de mots compte les paragraphes, listes, citations et tableaux`, () => {
  const doc = buildExportDoc([`# A`, `un deux trois`, ``, `- quatre cinq`, ``, `> six`, ``, `| sept | huit |`].join(`\n`), `N.md`);
  assert.equal(paginatePlain(doc).wordCount, 8);
});

test(`les listes ordonnees imbriquees numerotent chaque niveau`, () => {
  const doc = buildExportDoc([`# A`, `1. un`, `   1. sous un`, `   2. sous deux`, `2. deux`].join(`\n`), `N.md`);
  const text = paginatePlain(doc).pages.flatMap((p) => p.lines).join(`\n`);
  assert.ok(text.includes(`1. un\n  1. sous un\n  2. sous deux\n2. deux`), text);
});

test(`un document vide donne une page avec son titre`, () => {
  const { pages } = paginatePlain(buildExportDoc(``, `Vide.md`));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].lines[0], `VIDE`);
});

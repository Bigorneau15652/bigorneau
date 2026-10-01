import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc } from "../src/export/doc-tree";
import { A4_SETUP, languageOf, paginateRows, typesetDoc } from "../src/export/typeset";

const PARA = `Le bâtiment a été construit en 1972 et sa consommation d'énergie finale reste aujourd'hui supérieure à 180 kWh/m².an ; une rénovation globale suppose d'abord une analyse précise : isolation des murs et de la toiture, remplacement des menuiseries, régulation du chauffage et ventilation double flux.`;

function note(paragraphs: number): string {
  const body: string[] = [];
  for (let i = 0; i < paragraphs; i++) body.push(PARA, ``);
  return [`# Contexte`, ``, ...body, `## Constats`, `- Isolation des murs`, `  - laine de roche`, `- Menuiseries`, ``, `> Une citation sur l'objectif.`, ``, `# Résultats`, `1. Chauffage`, `2. Éclairage`, ``, `![[plan.png|Plan du site]]`, ``, `| a | b |`, `| - | - |`, `| 1 | 2 |`].join(`\n`);
}

test(`le document compose commence par son titre et contient tous les blocs`, () => {
  const t = typesetDoc(buildExportDoc(note(2), `Audit.md`));
  assert.equal(t.rows[0].kind, `title`);
  assert.equal(t.rows[0].text, `Audit`);
  const kinds = new Set(t.rows.map((r) => r.kind));
  for (const k of [`title`, `heading`, `text`, `list`, `quote`, `figure`, `code`, `space`]) assert.ok(kinds.has(k as never), k);
  assert.ok(t.stats.lines > 10);
  assert.ok(t.stats.wordCount > 80);
  assert.deepEqual(t.missing, []);
});

test(`seule la premiere ligne d'un paragraphe a un retrait et les lignes justifiees sont etirees`, () => {
  const t = typesetDoc(buildExportDoc(note(1), `A.md`));
  const text = t.rows.filter((r) => r.kind === `text`);
  assert.ok(text.length >= 3);
  assert.equal(text[0].x, 11);
  assert.ok(text.slice(1).every((r) => r.x === 0));
  assert.ok(text.some((r) => r.wordSpacing !== 0));
});

test(`les puces et numeros sont places en marge des elements de liste`, () => {
  const t = typesetDoc(buildExportDoc(note(0), `A.md`));
  const markers = t.rows.filter((r) => r.marker !== undefined).map((r) => r.marker);
  assert.deepEqual(markers, [`–`, `–`, `–`, `1.`, `2.`]);
});

test(`une note en anglais n'a pas les espaces fines francaises`, () => {
  const fr = typesetDoc(buildExportDoc(`# A\nIs it done ? Yes ; done !`, `A.md`));
  const en = typesetDoc(buildExportDoc(`---\nlang: en\n---\n# A\nIs it done ? Yes ; done !`, `A.md`));
  assert.ok(fr.rows.some((r) => r.text.includes(` `)));
  assert.ok(en.rows.every((r) => !r.text.includes(` `)));
  assert.equal(languageOf(`en-GB`), `en`);
  assert.equal(languageOf(undefined), `fr`);
});

test(`les pages ne depassent pas la hauteur utile et ne commencent pas par un espace`, () => {
  const t = typesetDoc(buildExportDoc(note(60), `A.md`));
  const pages = paginateRows(t.rows);
  const available = A4_SETUP.height - A4_SETUP.marginTop - A4_SETUP.marginBottom;
  assert.ok(pages.length >= 3);
  for (const p of pages) {
    assert.ok(p.reduce((a, r) => a + r.height, 0) <= available + 1e-6);
    assert.notEqual(p[0].kind, `space`);
    assert.notEqual(p[p.length - 1].kind, `space`);
  }
  // Toutes les lignes se retrouvent, dans l'ordre (aux espaces pres).
  const flat = pages.flat().filter((r) => r.kind !== `space`).map((r) => r.text);
  assert.deepEqual(flat, t.rows.filter((r) => r.kind !== `space`).map((r) => r.text));
});

test(`un titre n'est jamais en bas de page, quelle que soit la longueur du texte qui le precede`, () => {
  let moved = 0;
  for (let n = 1; n <= 40; n++) {
    const text = [`# Debut`, ...Array.from({ length: n }, (_v, i) => `Ligne courte numero ${i}.\n`), `## Titre isole`, `Paragraphe qui suit le titre.`].join(`\n`);
    const pages = paginateRows(typesetDoc(buildExportDoc(text, `A.md`)).rows);
    for (const p of pages.slice(0, -1)) {
      const last = p[p.length - 1];
      assert.ok(last.kind !== `heading`, `titre en bas de page avec ${n} paragraphes`);
    }
    if (pages.some((p) => p[0].kind === `heading` && p[0].text === `Titre isole`)) moved++;
  }
  assert.ok(moved > 0, `aucun titre n'a ete reporte sur la page suivante`);
});

test(`les titres masques et les sujets flottants restent absents de la composition`, () => {
  const text = [`# Visible`, `Texte.`, `## Cache`, `%% mmw {"hidden":true} %%`, `Texte masque.`, `%% mmw-float {"x":1} %%`, `## Flottant`, `Texte flottant.`].join(`\n`);
  const t = typesetDoc(buildExportDoc(text, `A.md`));
  const all = t.rows.map((r) => r.text).join(`\n`);
  assert.ok(all.includes(`Visible`));
  for (const s of [`Cache`, `masque`, `Flottant`, `flottant`, `mmw`]) assert.ok(!all.includes(s), s);
});

test(`les indicateurs de qualite sont calcules`, () => {
  // Colonne etroite (235 pt) : la premiere passe, sans cesure, echoue souvent.
  const t = typesetDoc(buildExportDoc(note(8), `A.md`), { ...A4_SETUP, marginLeft: 180, marginRight: 180 });
  const s = t.stats;
  assert.ok(s.paragraphs > 8);
  assert.equal(s.passes[0] + s.passes[1] + s.passes[2], s.paragraphs);
  assert.ok(s.hyphenatedLines > 0);
  assert.ok(s.consecutiveHyphens <= s.hyphenatedLines);
});

test(`le Markdown en ligne est reduit a du texte brut dans la composition`, () => {
  const t = typesetDoc(buildExportDoc(`# A\nUn **gras** et un [[Note#Titre|lien]] avec \`code\`.\n\n| **x** | y |\n| - | - |\n| [[B]] | 2 |`, `A.md`));
  const all = t.rows.map((r) => r.text).join(`\n`);
  assert.ok(all.includes(`Un gras et un lien avec code.`));
  assert.ok(!all.includes(`**`) && !all.includes(`[[`) && !all.includes("`"));
  assert.ok(all.includes(`x | y`));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { measureText } from "../src/export/font-metrics";
import { typesetParagraph } from "../src/export/paragraph";
import { leftProtrusion, rightProtrusion } from "../src/export/protrusion";
import { buildExportDoc } from "../src/export/doc-tree";
import { A4_SETUP, DEFAULT_PAGE_STYLE, typesetDoc } from "../src/export/typeset";

const TEXT = `L'anticonstitutionnellement et l'électroencéphalographiquement sont des mots longs, « disait-il », que la composition doit couper ; sinon, les lignes deviennent « très » lâches. Une rénovation globale suppose d'abord une analyse précise : isolation des murs, remplacement des menuiseries, régulation du chauffage, ventilation double flux, « récupération de chaleur ».`;
const OPTS = { language: `fr` as const, fontSize: 11, lineWidth: 200, indent: 0, align: `justify` as const, hyphenate: true };

// Largeur de la ligne composee : texte naturel plus espaces elargis.
function setWidth(l: { runs: { text: string; style: never }[]; wordSpacing: number; width: number; text: string }): number {
  const spaces = Array.from(l.text).filter((c) => c === ` ` || c === ` `).length;
  return l.width + spaces * l.wordSpacing;
}

test(`les facteurs de protrusion sont forts pour la ponctuation et nuls pour les lettres`, () => {
  assert.equal(rightProtrusion(`-`), 0.7);
  assert.equal(rightProtrusion(`,`), 0.7);
  assert.equal(rightProtrusion(`a`), 0);
  assert.ok(leftProtrusion(`«`) > 0);
  assert.equal(leftProtrusion(`A`), 0);
});

test(`sans protrusion, chaque ligne justifiee a exactement la largeur de la colonne`, () => {
  const r = typesetParagraph(TEXT, OPTS);
  const lines = r.lines.filter((l) => !l.last && l.wordSpacing > -1.65);
  assert.ok(lines.length > 4);
  for (const l of lines) {
    assert.ok(Math.abs(setWidth(l as never) - 200) < 1e-6);
    assert.equal(l.offset, 0);
  }
});

test(`avec protrusion, la ligne est justifiee sur la colonne elargie et decalee de la part qui depasse a gauche`, () => {
  const r = typesetParagraph(TEXT, { ...OPTS, protrusion: true });
  const base = typesetParagraph(TEXT, OPTS);
  assert.equal(r.lines.length, base.lines.length);
  let shifted = 0;
  let widened = 0;
  r.lines.forEach((l, i) => {
    if (l.last || l.wordSpacing <= -1.65) return;
    const first = l.runs[0];
    const ch = Array.from(first.text)[0];
    const end = l.runs[l.runs.length - 1];
    const last = Array.from(end.text).pop() as string;
    const pl = leftProtrusion(ch) * measureText(ch, 11, first.style).width;
    const pr = rightProtrusion(last) * measureText(last, 11, end.style).width;
    // La ligne commence pl avant la marge et finit pr apres le bord droit.
    assert.ok(Math.abs(l.offset + pl) < 1e-9, `decalage ligne ${i}`);
    assert.ok(Math.abs(setWidth(l) - (200 + pl + pr)) < 1e-6, `largeur ligne ${i}`);
    if (pl > 0) shifted++;
    if (pr > 0) widened++;
    // Les coupures sont celles de la composition sans protrusion.
    assert.equal(l.text.replace(/\s+/g, ` `), base.lines[i].text.replace(/\s+/g, ` `));
  });
  // Le texte d'essai contient des lignes finissant par un trait d'union de cesure ou une virgule, et des guillemets en debut.
  assert.ok(widened >= 2, `lignes avec depassement a droite : ${widened}`);
  assert.ok(shifted >= 1, `lignes avec depassement a gauche : ${shifted}`);
});

test(`pas de protrusion sur une ligne qui n'est pas justifiee ni apres un alinea`, () => {
  const left = typesetParagraph(TEXT, { ...OPTS, align: `left`, protrusion: true });
  assert.ok(left.lines.every((l) => l.offset === 0));
  const indented = typesetParagraph(`« Un texte qui commence par un guillemet et qui est assez long pour tenir sur plusieurs lignes de la colonne étroite choisie. »`, { ...OPTS, indent: 11, protrusion: true });
  assert.equal(indented.lines[0].offset, 11);
});

test(`la feuille de style active la protrusion par defaut et peut la couper`, () => {
  const doc = buildExportDoc(`# A\n\n${TEXT} ${TEXT} ${TEXT}`, `A.md`);
  assert.equal(DEFAULT_PAGE_STYLE.protrusion, true);
  const on = typesetDoc(doc, A4_SETUP);
  const off = typesetDoc(doc, A4_SETUP, undefined, { ...DEFAULT_PAGE_STYLE, protrusion: false });
  const text = (t: ReturnType<typeof typesetDoc>): ReturnType<typeof typesetDoc>[`rows`] => t.rows.filter((r) => r.kind === `text`);
  assert.ok(text(on).some((r) => r.x < 0));
  assert.ok(text(off).every((r) => r.x >= 0));
});

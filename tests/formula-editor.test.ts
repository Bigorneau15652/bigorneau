import { test } from "node:test";
import assert from "node:assert/strict";
import { findFormula, insertTemplate, nextSlot, writeFormula } from "../src/formula-edit";
import { allItems, PALETTE } from "../src/formula-palette";
import { renderTex } from "../src/export/mathjax";

const apply = (text: string, r: { edits: { from: number; to: number; insert: string }[] }): string => {
  let out = text;
  for (const e of [...r.edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return out;
};

test(`la formule en ligne sous le curseur est retrouvee, sans confondre les prix ni les signes echappes`, () => {
  const text = `Soit $x^2 + 1$ et le prix de 5 \\$ puis $y$.`;
  const at = text.indexOf(`x^2`) + 2;
  assert.deepEqual(findFormula(text, at), { from: 5, to: 14, tex: `x^2 + 1`, display: false });
  assert.equal(findFormula(text, 1), null);
  assert.equal(findFormula(text, text.indexOf(`puis`)), null);
  const y = findFormula(text, text.lastIndexOf(`y`));
  assert.equal(y?.tex, `y`);
});

test(`la formule en bloc sur plusieurs lignes est retrouvee`, () => {
  const text = `Avant\n\n$$\n\\frac{a}{b}\n= c\n$$\n\nApres $z$`;
  const f = findFormula(text, text.indexOf(`= c`));
  assert.equal(f?.display, true);
  assert.equal(f?.tex, `\\frac{a}{b}\n= c`);
  assert.equal(text.slice(f?.from, f?.to), `$$\n\\frac{a}{b}\n= c\n$$`);
  assert.equal(findFormula(text, 2), null);
});

test(`une formule en ligne vide ou deux signes colles ne sont pas des formules en ligne`, () => {
  assert.equal(findFormula(`a $$ b`, 3), null);
  assert.equal(findFormula(`a $ b`, 3), null);
});

test(`ecriture d'une formule en ligne et en bloc`, () => {
  const t = `Un texte ici.`;
  const inline = writeFormula(t, 3, 8, `x^2`, false);
  assert.equal(apply(t, inline), `Un $x^2$ ici.`);
  assert.equal(inline.cursor, 3 + 5);
  const block = writeFormula(t, 3, 8, `x^2`, true);
  assert.equal(apply(t, block), `Un \n\n$$\nx^2\n$$\n\n ici.`.replace(`Un \n\n`, `Un\u0000`).replace(`Un\u0000`, `Un \n\n`));
  // Sur une ligne vide : pas de lignes vides en trop.
  assert.equal(apply(`\n\n`, writeFormula(`\n\n`, 1, 1, `a`, true)), `\n$$\na\n$$\n`);
  // Remplacement d'une formule en bloc par une formule en ligne.
  const src = `$$\na\n$$`;
  assert.equal(apply(src, writeFormula(src, 0, src.length, `b`, false)), `$b$`);
});

test(`un modele de la palette prend la selection dans son premier emplacement`, () => {
  const r = insertTemplate({ text: `ab+cd`, start: 0, end: 2 }, String.raw`\frac{}{}`);
  assert.equal(r.text, String.raw`\frac{ab}{}+cd`);
  assert.equal(r.start, String.raw`\frac{ab`.length);
  // Sans selection, le curseur est dans le premier emplacement ; Tab passe au suivant.
  const s = insertTemplate({ text: ``, start: 0, end: 0 }, String.raw`\frac{}{}`);
  assert.equal(s.text, String.raw`\frac{}{}`);
  assert.equal(s.start, 6);
  assert.equal(nextSlot(s.text, s.start), 8);
  assert.equal(nextSlot(s.text, 8), -1);
  // Fractions imbriquees : l'emplacement de la fraction interieure est atteint par Tab.
  const nested = insertTemplate({ text: s.text, start: 8, end: 8 }, String.raw`\frac{}{}`);
  assert.equal(nested.text, String.raw`\frac{}{\frac{}{}}`);
  assert.equal(nextSlot(nested.text, 0), 6);
});

test(`une commande qui finit par une lettre recoit une espace sauf devant une espace`, () => {
  assert.equal(insertTemplate({ text: `ab`, start: 1, end: 1 }, String.raw`\alpha`).text, String.raw`a\alpha b`);
  assert.equal(insertTemplate({ text: `a b`, start: 1, end: 1 }, String.raw`\alpha`).text, String.raw`a\alpha b`);
  assert.equal(insertTemplate({ text: ``, start: 0, end: 0 }, `^{}`).text, `^{}`);
  assert.equal(insertTemplate({ text: ``, start: 0, end: 0 }, `=`).text, `=`);
});

test(`tous les modeles de la palette sont dessines par MathJax`, () => {
  // Emplacements remplis (MathJax refuse un \text vide) et, pour les exposants et indices, un symbole de base.
  const filled = (tex: string): string => (/^[_^]/.test(tex) ? `x` : ``) + tex.split(`{}`).join(`{A}`);
  const bad = allItems().filter((i) => renderTex(filled(i.tex), false) === null).map((i) => i.tex);
  assert.deepEqual(bad, []);
  assert.ok(PALETTE.length >= 6);
  for (const i of allItems()) {
    assert.ok(i.label.length > 0 && i.tip.fr.length > 0 && i.tip.en.length > 0, i.tex);
    let depth = 0;
    for (const c of i.tex) depth += c === `{` ? 1 : c === `}` ? -1 : 0;
    assert.equal(depth, 0, `accolades : ${i.tex}`);
  }
});

test(`les modeles garnis d'emplacements vides restent dessinables`, () => {
  const text = insertTemplate({ text: ``, start: 0, end: 0 }, String.raw`\begin{pmatrix} {} & {} \\ {} & {} \end{pmatrix}`).text;
  assert.notEqual(renderTex(text, true), null);
  assert.equal(renderTex(String.raw`\frac{`, false), null);
});

test(`chaque bouton de structure a son explication et un dessin d'exemple valide`, async () => {
  const { sampleOf } = await import(`../src/formula-palette`);
  const { renderTexSvg } = await import(`../src/export/mathjax`);
  const structures = PALETTE.find((g) => g.id === `structures`);
  assert.ok(structures);
  for (const item of structures.items) {
    assert.ok(item.how && item.how.fr.length > 10 && item.how.en.length > 10, `explication : ${item.tex}`);
    assert.notEqual(renderTexSvg(sampleOf(item), false), null, `dessin : ${item.tex}`);
  }
});

test(`le cours de l'editeur couvre chaque bouton de structure dans les deux langues`, async () => {
  const { courseSections } = await import(`../src/formula-course`);
  const sections = courseSections();
  assert.deepEqual(sections.map((s) => s.id), [`start`, `modes`, `slots`, `preview`, `keyboard`, `structures`, `symbols`, `tex`]);
  for (const s of sections) for (const lang of [`fr`, `en`] as const) assert.ok(s.text[lang].length > 50 && s.title[lang].length > 5, `${s.id} ${lang}`);
  const structures = PALETTE.find((g) => g.id === `structures`);
  const fr = sections.find((s) => s.id === `structures`)?.text.fr ?? ``;
  for (const item of structures?.items ?? []) assert.ok(fr.includes(item.tip.fr), item.tip.fr);
});

test(`chaque etape des exemples du cours se dessine, et la partie marquee existe dans la formule`, async () => {
  const { EXAMPLES, KEYS } = await import(`../src/formula-course`);
  const { renderTexSvg } = await import(`../src/export/mathjax`);
  const { previewTex, texModel } = await import(`../src/formula-units`);
  assert.ok(EXAMPLES.length >= 5 && KEYS.length >= 6);
  const sections = (await import(`../src/formula-course`)).courseSections().map((x) => x.id);
  for (const ex of EXAMPLES) {
    assert.ok(sections.includes(ex.section), ex.id);
    assert.ok(ex.steps.length >= 3, ex.id);
    for (const st of ex.steps) {
      assert.ok(st.caption.fr.length > 5 && st.caption.en.length > 5, st.tex);
      assert.notEqual(renderTexSvg(previewTex(st.tex, texModel(st.tex).slots), false), null, `dessin : ${st.tex}`);
      if (st.mark !== undefined) assert.ok(st.tex.includes(st.mark), `marque ${st.mark} dans ${st.tex}`);
    }
  }
});

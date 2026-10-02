import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits, insertBlockMath, insertFootnote, insertInlineMath, insertTableCaption, toggleToc } from "../src/export/insert";

const run = (text: string, r: { edits: { from: number; to: number; insert: string }[]; cursor?: number }): string => {
  const out = applyEdits(text, r.edits);
  return r.cursor === undefined ? out : `${out.slice(0, r.cursor)}|${out.slice(r.cursor)}`;
};

test(`une note de bas de page est inseree apres la selection, curseur a l'interieur`, () => {
  const t = `Le texte ici.`;
  assert.equal(run(t, insertFootnote(t, 8, 8)), `Le texte^[|] ici.`);
  assert.equal(run(t, insertFootnote(t, 3, 8)), `Le texte^[|] ici.`);
});

test(`une formule en ligne entoure la selection ou s'ouvre entre deux signes`, () => {
  const t = `Soit E = mc2 ici`;
  assert.equal(run(t, insertInlineMath(t, 5, 12)), `Soit $E = mc2$| ici`);
  assert.equal(run(t, insertInlineMath(t, 4, 4)), `Soit$|$ E = mc2 ici`);
});

test(`une formule en bloc est sur ses propres lignes, separee du texte voisin`, () => {
  assert.equal(run(`avant\n\n\napres`, insertBlockMath(`avant\n\n\napres`, 7, 7)), `avant\n\n$$\n|\n$$\napres`);
  // Curseur au debut d'une ligne de texte : la formule est separee de ce texte par une ligne vide.
  assert.equal(run(`avant\n\napres`, insertBlockMath(`avant\n\napres`, 7, 7)), `avant\n\n$$\n|\n$$\n\napres`);
  assert.equal(run(`Un texte ici`, insertBlockMath(`Un texte ici`, 8, 8)), `Un texte\n\n$$\n|\n$$\n\n ici`);
  assert.equal(run(`a b c`, insertBlockMath(`a b c`, 2, 3)), `a \n\n$$\nb|\n$$\n\n c`);
  assert.equal(run(`a\r\nb`, insertBlockMath(`a\r\nb`, 3, 3)), `a\r\n$$\r\n|\r\n$$\r\n\r\nb`);
});

test(`la legende de tableau se place au-dessus du tableau ou du curseur`, () => {
  const t = `Du texte.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite.`;
  // Curseur dans la derniere ligne du tableau.
  assert.equal(run(t, insertTableCaption(t, t.indexOf(`| 1`) + 2)), `Du texte.\n\nTableau : |\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite.`);
  // Curseur sur une ligne vide juste avant le tableau.
  assert.equal(run(t, insertTableCaption(t, 10)), `Du texte.\n\nTableau : |\n| a | b |\n| - | - |\n| 1 | 2 |\n\nSuite.`);
  // Tableau colle au paragraphe qui le precede : une ligne vide est ajoutee avant la legende.
  const glued = `Du texte.\n| a |\n| - |`;
  assert.equal(run(glued, insertTableCaption(glued, 12)), `Du texte.\n\nTableau : |\n\n| a |\n| - |`);
});

test(`la legende est en anglais pour une note en anglais`, () => {
  const t = `---\nlang: en\n---\n\n| a |\n| - |`;
  assert.ok(run(t, insertTableCaption(t, t.indexOf(`| a`))).includes(`Table: |`));
  assert.ok(run(`| a |`, insertTableCaption(`| a |`, 0)).includes(`Tableau : |`));
});

test(`la table des matieres s'active, se desactive et cree l'en-tete au besoin`, () => {
  const none = toggleToc(`# Titre\n\nTexte`);
  assert.equal(applyEdits(`# Titre\n\nTexte`, none.edits), `---\ntoc: true\n---\n# Titre\n\nTexte`);
  assert.equal(none.enabled, true);
  const noProp = toggleToc(`---\nlang: fr\n---\n# A`);
  assert.equal(applyEdits(`---\nlang: fr\n---\n# A`, noProp.edits), `---\nlang: fr\ntoc: true\n---\n# A`);
  const on = toggleToc(`---\ntoc: true\nlang: fr\n---\n# A`);
  assert.equal(applyEdits(`---\ntoc: true\nlang: fr\n---\n# A`, on.edits), `---\ntoc: false\nlang: fr\n---\n# A`);
  assert.equal(on.enabled, false);
  const off = toggleToc(`---\nlang: fr\ntoc: false\n---\n# A`);
  assert.equal(applyEdits(`---\nlang: fr\ntoc: false\n---\n# A`, off.edits), `---\nlang: fr\ntoc: true\n---\n# A`);
  assert.equal(off.enabled, true);
  const crlf = toggleToc(`---\r\ntoc: oui\r\n---\r\n# A`);
  assert.equal(applyEdits(`---\r\ntoc: oui\r\n---\r\n# A`, crlf.edits), `---\r\ntoc: false\r\n---\r\n# A`);
  // Un toc-depth n'est pas pris pour la propriete toc.
  const depth = toggleToc(`---\ntoc-depth: 2\n---\n# A`);
  assert.equal(applyEdits(`---\ntoc-depth: 2\n---\n# A`, depth.edits), `---\ntoc-depth: 2\ntoc: true\n---\n# A`);
  // Un en-tete jamais ferme n'en est pas un.
  assert.equal(applyEdits(`---\nlang: fr\n# A`, toggleToc(`---\nlang: fr\n# A`).edits), `---\ntoc: true\n---\n---\nlang: fr\n# A`);
});

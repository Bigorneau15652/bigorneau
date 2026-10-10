import { test } from "node:test";
import assert from "node:assert/strict";

// Obsidian a son propre objet MathJax global, dont le chargeur n'a pas la fonction preLoad : la bibliotheque du plugin plantait des sa
// premiere ligne (« MathJax.loader.preLoad is not a function »). Ce test se joue dans son propre processus, avant tout chargement.
test(`la bibliotheque MathJax du plugin demarre malgre le MathJax d'Obsidian`, async () => {
  const g = globalThis as unknown as { window?: unknown; MathJax?: unknown };
  g.window = globalThis;
  const theirs = { loader: {}, version: `autre` };
  g.MathJax = theirs;
  const { loadMathJax } = await import(`../src/script-formulas`);
  const lib = await loadMathJax();
  assert.equal(g.MathJax, theirs, `le MathJax d'Obsidian est remis en place`);
  const asset = lib.renderTex(String.raw`\frac{a}{b}`, false);
  assert.ok(asset);
  assert.ok(asset.width > 0);
});

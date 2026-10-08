import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueSvgIds } from "../src/svg-ids";

test(`les identifiants d'un dessin et leurs references sont renommes ensemble`, () => {
  const svg = `<svg><defs><path id="MJX-1-TEX-I-1D44E" d="M0"/></defs><g><use data-c="1D44E" xlink:href="#MJX-1-TEX-I-1D44E"/><use href="#MJX-1-TEX-I-1D44E"/></g><rect fill="url(#MJX-1-TEX-I-1D44E)"/></svg>`;
  const a = uniqueSvgIds(svg, `1`);
  const b = uniqueSvgIds(svg, `2`);
  assert.ok(a.includes(`id="MJX-1-TEX-I-1D44E-1"`) && a.includes(`xlink:href="#MJX-1-TEX-I-1D44E-1"`) && a.includes(`href="#MJX-1-TEX-I-1D44E-1"`) && a.includes(`url(#MJX-1-TEX-I-1D44E-1)`));
  assert.ok(!a.includes(`MJX-1-TEX-I-1D44E"`));
  // Deux dessins identiques n'ont aucun identifiant en commun.
  assert.notEqual(a, b);
  assert.ok(!b.includes(`-1"`) || b.includes(`-2"`));
  assert.equal(uniqueSvgIds(`<svg><g/></svg>`, `3`), `<svg><g/></svg>`);
});

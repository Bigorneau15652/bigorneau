import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMathSvg } from "../src/export/svg-clean";
import { renderTexSvg } from "../src/export/mathjax";
import { PALETTE } from "../src/formula-palette";

// Drawing of ordinary formulas: the cleaning must not change anything.
const USUAL = [
  String.raw`\frac{a}{b}`,
  String.raw`\sqrt{x^2+y^2}`,
  String.raw`\sum_{i=1}^{n} x_i`,
  String.raw`\int_0^1 f(x)\,dx`,
  String.raw`\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}`,
  String.raw`\ce{CO2 + H2O -> H2CO3}`,
  String.raw`\color{red}{x} + \textcolor{blue}{y}`,
  String.raw`\text{CO}_2 \leq 400\ \mathrm{ppm}`,
  String.raw`\overline{AB} \cdot \vec{v}`,
  String.raw`\boxed{E = mc^2}`,
];

test(`un dessin ordinaire n'est pas modifie par le nettoyage`, () => {
  for (const tex of USUAL) {
    const svg = renderTexSvg(tex, false);
    assert.notEqual(svg, null, tex);
    assert.equal(cleanMathSvg(svg as string), svg, tex);
  }
});

test(`les boutons de la palette gardent un dessin identique`, () => {
  for (const group of PALETTE) {
    for (const item of group.items) {
      const svg = renderTexSvg(item.tex.replace(/\{\}/g, `x`), false);
      if (svg) assert.equal(cleanMathSvg(svg), svg, item.tex);
    }
  }
});

test(`les formules piegees ne laissent aucune adresse dans le dessin`, () => {
  const trapped = [
    String.raw`\href{http://evil.example/a}{x}`,
    String.raw`\style{background: url(http://evil.example/a)}{x}`,
    String.raw`\class{a}{x}`,
    String.raw`\cssId{a}{x}`,
    String.raw`\mmlToken{mi}[href="http://evil.example/a"]{x}`,
    String.raw`\mmlToken{mi}[style="background:url(http://evil.example/a)"]{x}`,
    String.raw`\mmlToken{mi}[xlink:href="http://evil.example/a"]{x}`,
    String.raw`\color{url(http://evil.example/a)}{x}`,
    String.raw`\HREF{http://evil.example/a}{x}`,
  ];
  for (const tex of trapped) {
    const svg = renderTexSvg(tex, false);
    if (svg === null) continue;
    const bare = svg.replace(/xmlns(:xlink)?="[^"]*"/g, ``);
    assert.ok(!/https?:|url\s*\(|javascript|file:|\bon\w+=/i.test(bare), `${tex} : ${bare.slice(0, 200)}`);
  }
});

test(`le nettoyage retire adresses, images, scripts et attributs d'evenement`, () => {
  const out = cleanMathSvg(
    `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://evil.example/a.png"/><g style="fill:url(http://evil.example/x)" onclick="x()">` +
      `<a xlink:href="http://evil.example/">t</a><a href="#ok">u</a><use href="#MJX-1"/><script>alert(1)</script>` +
      `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="http://evil.example/p"/></div></foreignObject></g></svg>`
  );
  assert.ok(!/evil|onclick|<image|<script|foreignObject|<img|<div/i.test(out), out);
  assert.ok(out.includes(`href="#ok"`), `un renvoi interne reste`);
  assert.ok(out.includes(`<use href="#MJX-1"/>`), `une reference de glyphe reste`);
});

test(`les ecritures detournees sont refusees (majuscules, entites, guillemets, balise mal formee)`, () => {
  const cases = [
    `<svg><G STYLE="fill:URL(http://evil.example)"/></svg>`,
    `<svg><g style="fill:u&#114;l(http://evil.example)"/></svg>`,
    `<svg><g style='fill:url( http://evil.example )'/></svg>`,
    `<svg><g style="fill:\\75rl(http://evil.example)"/></svg>`,
    `<svg><A HREF=javascript:alert(1)>x</A></svg>`,
    `<svg><a xlink:href="JaVaScRiPt:alert(1)">x</a></svg>`,
    `<svg><image/href="http://evil.example" x="1"/></svg>`,
    `<svg><!DOCTYPE x [<!ENTITY e SYSTEM "http://evil.example">]><g/></svg>`,
    `<svg><g foo="a>b" onload="x()"/></svg>`,
  ];
  for (const markup of cases) {
    const out = cleanMathSvg(markup);
    // A sign < that starts a malformed tag is written as text (&lt;): it is shown as a letter, never read as a tag.
    const asTag = out.replace(/&lt;[^>]*>/g, ``);
    assert.ok(!/evil|javascript|onload|onclick|<image/i.test(asTag), `${markup} => ${out}`);
  }
});

test(`un texte de 200000 caracteres est nettoye vite`, () => {
  const start = Date.now();
  cleanMathSvg(`<svg>` + `<g a="1" b="2"/>`.repeat(12000) + `<g ` + `a `.repeat(20000) + `</svg>`);
  assert.ok(Date.now() - start < 2000);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inlineMathOf, mathKey, parseMathSvg } from "../src/export/math";

const samples = JSON.parse(readFileSync(`tests/math-samples.json`, `utf8`)) as Record<string, string>;

test(`le dessin MathJax d'une formule en ligne devient un contour avec ses dimensions`, () => {
  const a = parseMathSvg(samples.inline, `E_s = \\frac{Q}{S} \\leq 90`, false);
  assert.ok(a);
  assert.equal(a!.width, 5819.1);
  assert.equal(a!.ascent, 975);
  assert.ok(Math.abs(a!.descent - 360.5) < 1e-6);
  assert.ok(a!.d.startsWith(`M `));
  assert.ok((a!.d.match(/Z/g) ?? []).length > 10);
  assert.ok(!/[QqSsTtAaHhVv]/.test(a!.d.replace(/[A-Z](?= )/g, (c) => (c === `M` || c === `L` || c === `C` || c === `Z` ? `` : c))));
});

test(`les coordonnees du contour restent dans la boite de la formule`, () => {
  for (const key of [`inline`, `display`]) {
    const a = parseMathSvg(samples[key], `x`, key === `display`)!;
    const nums = a.d.replace(/[MLCZ]/g, ``).trim().split(/\s+/).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    assert.ok(Math.min(...xs) >= -5 && Math.max(...xs) <= a.width + 5, `${key} x`);
    assert.ok(Math.min(...ys) >= -a.ascent - 5 && Math.max(...ys) <= a.descent + 5, `${key} y`);
    // Le dessin n'est pas reduit a un point : il occupe l'essentiel de la boite.
    assert.ok(Math.max(...xs) - Math.min(...xs) > a.width * 0.8, `${key} largeur`);
  }
});

test(`une formule invalide est reconnue et refusee`, () => {
  assert.equal(parseMathSvg(samples.bad, `\\frac{`, false), null);
  assert.equal(parseMathSvg(`<p>rien</p>`, `x`, false), null);
});

test(`les commandes relatives, quadratiques et les rectangles sont ramenes a M, L, C et Z`, () => {
  const svg = `<svg viewBox="0 -800 1000 1000"><defs><path id="g1" d="m10 20 l5 5 q10 0 10 10z"></path></defs><g transform="scale(1,-1)"><use xlink:href="#g1" x="100"></use><rect width="50" height="10" x="0" y="-5"></rect></g></svg>`;
  const a = parseMathSvg(svg, `x`, false)!;
  assert.equal(a.width, 1000);
  assert.equal(a.ascent, 800);
  assert.equal(a.descent, 200);
  // m10 20 + x=100, y retourne : (110, -20) ; l5 5 : (115, -25) ; quadratique vers (125, -35).
  assert.ok(a.d.startsWith(`M 110 -20 L 115 -25 C `));
  assert.ok(a.d.includes(`125 -35 Z`));
  assert.ok(a.d.endsWith(`M 0 5 L 50 5 L 50 -5 L 0 -5 Z`));
});

test(`les formules d'un texte sont repérées sans confondre les montants en euros ni le code`, () => {
  assert.deepEqual(inlineMathOf(`Soit $E = mc^2$ et $$a+b$$ puis $x_i$.`), [`E = mc^2`, `a+b`, `x_i`]);
  assert.deepEqual(inlineMathOf(`Cela coûte 5 $ aujourd'hui et 6 $ demain, ou \`$x$\` en code.`), []);
  assert.deepEqual(inlineMathOf(`Un seul $ isolé et un second prix de $7.`), []);
  assert.deepEqual(inlineMathOf(`Un prix de 12 $ et 15 $ : rien.`), []);
  assert.equal(mathKey(`x`, true), `D:x`);
  assert.equal(mathKey(`x`, false), `I:x`);
});

import { composeNote, composeToPdf, formulaTargets } from "../src/export/compose";
import { parseBlocks } from "../src/export/doc-tree";
import { paginate } from "../src/export/paginate";
import { A4_SETUP, DEFAULT_PAGE_STYLE, typesetDoc } from "../src/export/typeset";
import { buildExportDoc } from "../src/export/doc-tree";

const REQ = { creator: `Bigorneau`, created: new Date(`2026-10-01T15:00:00Z`) };
const inlineAsset = parseMathSvg(samples.inline, `x`, false)!;
const displayAsset = parseMathSvg(samples.display, `y`, true)!;
const FORMULAS = new Map([
  [mathKey(`x`, false), inlineAsset],
  [mathKey(`y`, true), displayAsset],
]);

test(`les formules en bloc sont des blocs du document, sur une ou plusieurs lignes`, () => {
  const blocks = parseBlocks(`Avant.\n\n$$y$$\n\n$$\n\\frac{a}{b}\n= c\n$$ ^eq1\n\nAprès.`);
  assert.deepEqual(
    blocks.map((b) => b.type),
    [`paragraph`, `math`, `math`, `paragraph`]
  );
  assert.equal(blocks[1].type === `math` && blocks[1].tex, `y`);
  assert.equal(blocks[2].type === `math` && blocks[2].tex, `\\frac{a}{b}\n= c`);
  assert.equal(blocks[2].type === `math` && blocks[2].id, `eq1`);
});

test(`les formules a dessiner sont listees une seule fois, en bloc et en ligne`, () => {
  const text = `# A\n\nSoit $x$ et $x$ puis $z$.\n\n$$y$$\n\n- liste avec $z$\n\n\`$code$\`\n\n[^1]: Note avec $n$.`;
  const found = formulaTargets(text, `A.md`);
  assert.deepEqual(
    found.map((f) => `${f.display ? `D` : `I`}:${f.tex}`),
    [`I:x`, `I:z`, `D:y`, `I:n`]
  );
});

test(`une formule en ligne est un bloc insecable de la largeur de son dessin dans la ligne`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\nSoit $x$ le facteur.`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { formulas: FORMULAS });
  const row = t.rows.find((r) => r.runs?.some((u) => u.math))!;
  assert.ok(row);
  assert.deepEqual(t.warnings, []);
  const m = row.runs!.find((u) => u.math)!;
  assert.equal(m.text, ``);
  assert.equal(m.math, inlineAsset);
  // La formule est entouree de texte ordinaire, non fusionne avec elle.
  const at = row.runs!.indexOf(m);
  assert.ok(at > 0 && at < row.runs!.length - 1);
  // La ligne est assez haute pour la formule (fraction et indices).
  assert.ok(row.height >= ((inlineAsset.ascent + inlineAsset.descent) * 11) / 1000);
});

test(`une formule sans dessin garde son texte et est signalee`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\nSoit $q_1$ ici et $$ z $$.`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { formulas: FORMULAS });
  assert.ok(t.rows.map((r) => r.text).join(` `).includes(`$q_1$`));
  assert.deepEqual(t.warnings, [`formule:q_1`, `formule:z`]);
  const b = typesetDoc(buildExportDoc(`# A\n\n$$ \\alpha $$`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { formulas: FORMULAS });
  assert.ok(b.warnings.includes(`formule:\\alpha`));
  assert.ok(b.rows.some((r) => r.text.includes(`\\alpha`)));
});

test(`une formule en bloc est centree et mise a l'echelle de la colonne`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\n$$y$$`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE, { formulas: FORMULAS });
  const row = t.rows.find((r) => r.math)!;
  const textWidth = A4_SETUP.width - 144;
  assert.ok(row.width <= textWidth + 1e-6);
  assert.ok(Math.abs(row.x - (textWidth - row.width) / 2) < 1e-6);
  assert.ok(row.math!.size <= 11 + 1e-9);
  assert.equal(row.math!.asset, displayAsset);
});

test(`le PDF dessine les formules en vectoriel`, async () => {
  const c = composeNote(`# A\n\nSoit $x$ le facteur.\n\n$$y$$`, `A.md`, A4_SETUP, DEFAULT_PAGE_STYLE, { formulas: FORMULAS });
  const pdf = Buffer.from(await composeToPdf(c, REQ)).toString(`latin1`);
  // Une formule en ligne et une formule en bloc : deux matrices de mise a l'echelle suivies de contours remplis.
  const fills = [...pdf.matchAll(/ cm [-\d. ]+ m [\s\S]*? f Q/g)];
  assert.equal(fills.length, 2);
  assert.ok(fills.every((f) => (f[0].match(/ c\b/g) ?? []).length > 10));
  assert.ok(/q 0\.011 0 0 -0\.011 /.test(pdf));
});

test(`les medias deviennent des blocs : fichier, adresse de video, iframe`, () => {
  const blocks = parseBlocks(`![[film.mp4|Visite du site]]\n\n![Vidéo](https://www.youtube.com/watch?v=abc)\n\n<iframe width="560" src="https://player.vimeo.com/video/1" title="Présentation"></iframe>\n\n![[bande.mp3]]\n\n![[rapport.pdf|Rapport]]\n\n![](https://exemple.fr/page)\n\nSuite.`);
  assert.deepEqual(
    blocks.map((b) => (b.type === `media` ? `${b.kind}:${b.target}:${b.caption}` : b.type)),
    [`video:film.mp4:Visite du site`, `video:https://www.youtube.com/watch?v=abc:Vidéo`, `video:https://player.vimeo.com/video/1:Présentation`, `audio:bande.mp3:`, `document:rapport.pdf:Rapport`, `embed:https://exemple.fr/page:`, `paragraph`]
  );
  // Une image reste une figure.
  assert.equal(parseBlocks(`![[plan.png|Plan]]`)[0].type, `figure`);
});

test(`un media est remplace par un cadre avec son titre et son adresse cliquable`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\n![Visite](https://www.youtube.com/watch?v=abc)`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE);
  const rows = t.rows.filter((r) => r.kind === `media`);
  assert.equal(rows[0].text, `Vidéo : Visite`);
  assert.equal(rows[0].runs?.[0].style, `bold`);
  assert.ok(rows.some((r) => r.runs?.some((u) => u.style === `mono` && u.link === `https://www.youtube.com/watch?v=abc`)));
  const framed = t.rows.filter((r) => r.frame);
  assert.ok(framed.length >= 2);
  assert.equal(framed.filter((r) => r.frame!.top).length, 1);
  assert.equal(framed.filter((r) => r.frame!.bottom).length, 1);
  assert.ok(t.warnings.includes(`media:https://www.youtube.com/watch?v=abc`));
  // Les lignes du cadre ne se separent pas d'une page a l'autre.
  assert.ok(framed.slice(0, -1).every((r) => r.breakAfter >= 10000));
  const text = typesetDoc(buildExportDoc(`# A\n\n![[film.mp4|Visite]]`, `A.md`), A4_SETUP, undefined, { ...DEFAULT_PAGE_STYLE, media: `text` });
  assert.ok(!text.rows.some((r) => r.frame));
  assert.ok(text.rows.some((r) => r.kind === `media` && r.text.includes(`film.mp4`)));
});

test(`une longue adresse est coupee a la largeur du cadre`, () => {
  const url = `https://exemple.fr/${`dossier/`.repeat(30)}video.mp4`;
  const t = typesetDoc(buildExportDoc(`# A\n\n![[${url}|Long]]`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE);
  const lines = t.rows.filter((r) => r.kind === `media` && r.runs?.[0].style === `mono`);
  assert.ok(lines.length > 2);
  assert.equal(lines.map((r) => r.text).join(``), url);
  const pages = paginate(t, A4_SETUP, DEFAULT_PAGE_STYLE);
  assert.equal(pages.length, 1);
});

test(`le PDF trace le cadre et rend l'adresse du media cliquable`, async () => {
  const c = composeNote(`# A\n\n![Visite](https://www.youtube.com/watch?v=abc)`, `A.md`);
  const pdf = Buffer.from(await composeToPdf(c, REQ)).toString(`latin1`);
  assert.ok(pdf.includes(`0.55 G 0.5 w`));
  assert.ok(pdf.includes(`/URI (https://www.youtube.com/watch?v=abc)`));
});

import { renderTex } from "../src/export/mathjax";

test(`MathJax dessine une formule TeX avec ses dimensions et refuse une formule incorrecte`, () => {
  const a = renderTex(`E_s = \\frac{Q}{S} \\leq 90`, false)!;
  assert.ok(a);
  assert.ok(a.width > 3000 && a.ascent > 500 && a.descent > 100);
  assert.ok(a.d.startsWith(`M `));
  const b = renderTex(`\\sum_{i=1}^{n} \\sqrt{x_i^2 + y_i^2} = \\int_0^1 f(t)\\,dt`, true)!;
  assert.ok(b && b.display && b.width > a.width * 0.5);
  assert.equal(renderTex(`\\frac{`, false), null);
  assert.equal(renderTex(`\\commandeinconnue`, false), null);
  // Quelques formules courantes en energetique et en mathematiques.
  for (const tex of [`\\text{kWh/m}^2\\text{.an}`, `\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}`, `\\alpha + \\beta \\neq \\gamma`, `\\overline{x}`, `\\ce{H2O}`]) {
    assert.ok(renderTex(tex, false), tex);
  }
});

test(`la page peut se couper apres un cadre de media et avant le titre suivant`, () => {
  const t = typesetDoc(buildExportDoc(`# A\n\n![[a.mp4|Un]]\n\n![[b.mp4|Deux]]\n\n# B\n\nTexte.`, `A.md`), A4_SETUP, undefined, DEFAULT_PAGE_STYLE);
  const lastOfFirst = t.rows.filter((r) => r.frame).find((r) => r.frame!.bottom)!;
  assert.ok(lastOfFirst.breakAfter < 10000);
  const heading = t.rows.findIndex((r) => r.heading?.title === `B`);
  assert.ok(t.rows.slice(0, heading).some((r) => r.kind === `space` && r.breakAfter < 10000));
});

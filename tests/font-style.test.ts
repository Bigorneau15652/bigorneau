import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCase, applyOverrides, defaultTypography, getPath, headingNumber, letters, overridePaths, roman, sanitizeOverrides, sanitizeTypography, setPath, sizeFactor } from "../src/text-style";

test(`le style d'origine ne change rien : tailles d'origine, police d'origine, titres en gras, pas de numerotation`, () => {
  const d = defaultTypography();
  assert.equal(d.headings.length, 6);
  assert.ok(d.headings.every((h) => h.bold && h.family === `` && h.points === 0 && h.case === `none` && !h.underline));
  assert.deepEqual([d.body.bold, d.body.italic, d.numbering], [false, false, `none`]);
  assert.equal(sizeFactor(d.body, 11), 1);
  assert.equal(sizeFactor({ ...d.body, points: 12 }, 11), 12 / 11);
  assert.deepEqual(sanitizeTypography(undefined), d);
  assert.deepEqual(sanitizeTypography(JSON.parse(JSON.stringify(d))), d);
});

test(`un style abime est nettoye champ par champ`, () => {
  const s = sanitizeTypography({ body: { family: `lora`, points: 900, bold: `oui` }, headings: [{ case: `bizarre`, underline: true }], numbering: `romain` });
  assert.equal(s.body.family, `lora`);
  assert.equal(s.body.points, 200);
  assert.equal(s.body.bold, false);
  assert.equal(s.headings[0].case, `none`);
  assert.equal(s.headings[0].underline, true);
  assert.equal(s.headings[1].bold, true);
  assert.equal(s.numbering, `none`);
});

test(`une note ne garde que ses changements, et le style general reste valable pour le reste`, () => {
  const general = setPath(defaultTypography(), `body.family`, `lora`);
  const note = sanitizeOverrides({ "h2.points": 25, "h2.case": `upper`, "numbering": `decimal`, "inconnu.champ": 1, "h9.points": 3, "body.bold": `oui`, "h1.underline": true });
  assert.deepEqual(note, { "h2.points": 25, "h2.case": `upper`, numbering: `decimal`, "h1.underline": true });
  const effective = applyOverrides(general, note);
  assert.equal(effective.body.family, `lora`);
  assert.equal(effective.headings[1].points, 25);
  assert.equal(effective.headings[1].case, `upper`);
  assert.equal(effective.numbering, `decimal`);
  // Si le style general change plus tard, la note suit pour tout ce qu'elle ne regle pas.
  const later = applyOverrides(setPath(general, `body.family`, `merri`), note);
  assert.equal(later.body.family, `merri`);
  assert.equal(getPath(later, `h2.points`), 25);
  assert.ok(overridePaths().includes(`title.underline`) && overridePaths().includes(`h6.numbered`) && !overridePaths().includes(`body.case`));
});

test(`la casse change les lettres sans toucher aux reperes de mise en forme`, () => {
  const marked = `un titre en été`;
  assert.equal(applyCase(marked, `upper`), `UN TITRE EN ÉTÉ`);
  assert.equal(applyCase(`ÉTUDE DE L'ÉCOLE`, `lower`), `étude de l'école`);
  assert.equal(applyCase(`étude de l'école d'été`, `capitalize`), `Étude De L'École D'Été`);
  assert.equal(applyCase(`inchangé`, `none`), `inchangé`);
});

test(`numerotation decimale et en plan`, () => {
  assert.equal(headingNumber(`decimal`, [3, 1, 2]), `3.1.2`);
  assert.deepEqual([1, 4, 9, 14, 2026].map(roman), [`I`, `IV`, `IX`, `XIV`, `MMXXVI`]);
  assert.deepEqual([1, 26, 27, 28].map(letters), [`A`, `Z`, `AA`, `AB`]);
  assert.deepEqual([[2], [2, 3], [2, 3, 1], [2, 3, 1, 4], [2, 3, 1, 4, 5]].map((p) => headingNumber(`outline`, p)), [`II.`, `C.`, `1.`, `d)`, `v)`]);
  assert.equal(headingNumber(`none`, [1]), ``);
});

test(`le cadre d'un titre : valeurs nettoyees et reglage par note`, () => {
  const s = sanitizeTypography({ headings: [{ frame: `full`, frameWidth: 99, frameColor: `#ABCDEF`, frameFill: `rouge` }, { frame: `ovale`, frameFill: `#FFF3BF` }] });
  assert.deepEqual([s.headings[0].frame, s.headings[0].frameWidth, s.headings[0].frameColor, s.headings[0].frameFill], [`full`, 6, `#abcdef`, ``]);
  assert.deepEqual([s.headings[1].frame, s.headings[1].frameFill], [`none`, `#fff3bf`]);
  const note = sanitizeOverrides({ "h1.frame": `text`, "h1.frameWidth": 1.5, "h1.frameColor": `#123456`, "h1.frameFill": ``, "body.frame": `full` });
  assert.deepEqual(note, { "h1.frame": `text`, "h1.frameWidth": 1.5, "h1.frameColor": `#123456`, "h1.frameFill": `` });
});

test(`couleur et surlignage du texte : valeurs nettoyees`, () => {
  const s = sanitizeTypography({ body: { color: `#ABCDEF`, highlight: `jaune` }, caption: { color: `` , highlight: `#FFFF00` } });
  assert.deepEqual([s.body.color, s.body.highlight, s.caption.highlight], [`#abcdef`, ``, `#ffff00`]);
  assert.deepEqual(sanitizeOverrides({ "body.color": `#123456`, "decor.highlight": `#fff000`, "body.color2": `#123456` }), { "body.color": `#123456`, "decor.highlight": `#fff000` });
});

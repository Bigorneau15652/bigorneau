import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OpenTypeFont } from "../src/export/font";
import { clearFontFamilies, registerFontFamily } from "../src/export/font-metrics";
import { composeNote, composeToPdf } from "../src/export/compose";
import { DEFAULT_PAGE_STYLE } from "../src/export/typeset";
import { defaultTypography, setPath } from "../src/text-style";
import { formatPageMarker, defaultConfig } from "../src/page-config";

const load = (name: string): OpenTypeFont => new OpenTypeFont(new Uint8Array(readFileSync(`tests/fonts/${name}`)));
const NOTE = `# Energie\nUn texte.\n## Bâtiments\nAutre texte.\n## Réseaux\nEncore.\n### Détail\nFin.\n# Eau\nDernier.`;
const style = (t: ReturnType<typeof defaultTypography>) => ({ ...DEFAULT_PAGE_STYLE, typography: t });
const headingRows = (c: ReturnType<typeof composeNote>) => c.typeset.rows.filter((r) => r.kind === `heading`).map((r) => r.text);

test(`sans reglage, les titres et les tailles restent ceux d'origine`, () => {
  const c = composeNote(NOTE, `N.md`);
  assert.deepEqual(headingRows(c), [`Energie`, `Bâtiments`, `Réseaux`, `Détail`, `Eau`]);
  assert.equal(c.typeset.rows.find((r) => r.kind === `heading`)?.fontSize, 17);
});

test(`numerotation decimale et en plan, dans le titre et dans le plan de navigation`, () => {
  const dec = composeNote(NOTE, `N.md`, undefined, style(setPath(defaultTypography(), `numbering`, `decimal`)));
  assert.deepEqual(headingRows(dec).map((t) => t.replace(/ /g, ` `)), [`1 Energie`, `1.1 Bâtiments`, `1.2 Réseaux`, `1.2.1 Détail`, `2 Eau`]);
  assert.equal(dec.typeset.rows.find((r) => r.kind === `heading`)?.heading?.title, `1 Energie`);
  const plan = composeNote(NOTE, `N.md`, undefined, style(setPath(defaultTypography(), `numbering`, `outline`)));
  assert.deepEqual(headingRows(plan).map((t) => t.replace(/ /g, ` `)), [`I. Energie`, `A. Bâtiments`, `B. Réseaux`, `1. Détail`, `II. Eau`]);
  // Un niveau non numerote est ignore et ne compte pas.
  const t2 = setPath(setPath(defaultTypography(), `numbering`, `decimal`), `h2.numbered`, false);
  assert.deepEqual(headingRows(composeNote(NOTE, `N.md`, undefined, style(t2))).map((t) => t.replace(/ /g, ` `)), [`1 Energie`, `Bâtiments`, `Réseaux`, `1.1 Détail`, `2 Eau`]);
});

test(`casse, taille et soulignement d'un niveau de titre`, () => {
  let t = setPath(defaultTypography(), `h2.case`, `upper`);
  t = setPath(t, `h2.points`, 21);
  t = setPath(t, `h2.underline`, true);
  const c = composeNote(NOTE, `N.md`, undefined, style(t));
  const h2 = c.typeset.rows.filter((r) => r.kind === `heading`)[1];
  assert.equal(h2.text, `BÂTIMENTS`);
  assert.equal(h2.fontSize, 21);
  assert.equal(h2.underline, true);
  // Le plan de navigation garde le titre tel qu'il est ecrit.
  assert.equal(h2.heading?.title, `Bâtiments`);
});

test(`une famille ajoutee sert au corps de texte et aux titres, et le PDF l'incorpore`, async () => {
  clearFontFamilies();
  registerFontFamily(`test-serif`, { regular: load(`TestSerif-Regular.ttf`), bold: load(`TestSerif-Bold.ttf`), italic: load(`TestSerif-Italic.ttf`), boldItalic: load(`TestSerif-BoldItalic.ttf`) });
  let t = setPath(defaultTypography(), `body.family`, `test-serif`);
  t = setPath(t, `h1.family`, `test-serif`);
  const c = composeNote(NOTE, `N.md`, undefined, style(t));
  const text = c.typeset.rows.find((r) => r.kind === `text`);
  assert.equal(text?.runs?.[0].style, `u:test-serif:regular`);
  const h1 = c.typeset.rows.find((r) => r.kind === `heading`);
  assert.equal(h1?.runs?.[0].style, `u:test-serif:bold`);
  const pdf = Buffer.from(await composeToPdf(c, { creator: `t`, created: new Date(0) })).toString(`latin1`);
  assert.match(pdf, /FontFile2/);
  assert.match(pdf, /\/BaseFont \/MMWU\d+\+\S+-regular/);
  // Une famille retiree du coffre retombe sur la police d'origine sans planter.
  clearFontFamilies();
  const back = composeNote(NOTE, `N.md`, undefined, style(t));
  assert.equal(back.typeset.rows.find((r) => r.kind === `text`)?.runs?.[0].style, `regular`);
});

test(`une note peut changer des champs du style general sans toucher aux autres`, () => {
  const marker = formatPageMarker({ ...defaultConfig(), typography: { "h1.case": `upper`, numbering: `decimal` } });
  const general = setPath(defaultTypography(), `h2.case`, `lower`);
  const c = composeNote(`${marker}\n${NOTE}`, `N.md`, undefined, style(general));
  assert.deepEqual(headingRows(c).map((t) => t.replace(/ /g, ` `)), [`1 ENERGIE`, `1.1 bâtiments`, `1.2 réseaux`, `1.2.1 Détail`, `2 EAU`]);
});

test(`la table des matieres reprend les numeros et garde la casse d'origine`, () => {
  const t = setPath(setPath(defaultTypography(), `numbering`, `decimal`), `h1.case`, `upper`);
  const c = composeNote(`${NOTE}`.replace(`# Energie`, `---\ntoc: true\n---\n# Energie`), `N.md`, undefined, style(t));
  const toc = c.typeset.rows.filter((r) => r.kind === `toc`).map((r) => r.text.replace(/ /g, ` `));
  assert.ok(toc.includes(`1 Energie`) && toc.includes(`1.1 Bâtiments`), toc.join(`|`));
});

test(`un titre encadre : cadre ajuste au texte ou sur toute la largeur, avec trait et fond`, async () => {
  let t = setPath(defaultTypography(), `h2.frame`, `text`);
  t = setPath(t, `h2.frameWidth`, 1.5);
  t = setPath(t, `h2.frameColor`, `#ff0000`);
  t = setPath(t, `h2.frameFill`, `#ffff00`);
  t = setPath(t, `h1.frame`, `full`);
  const c = composeNote(NOTE, `N.md`, undefined, style(t));
  const rows = c.typeset.rows.filter((r) => r.kind === `heading`);
  const h2 = rows[1];
  assert.ok(h2.box && h2.box.top && h2.box.bottom && h2.box.line === 1.5 && h2.box.color === `#ff0000` && h2.box.fill === `#ffff00`);
  // Cadre ajuste : plus etroit que la colonne ; cadre pleine largeur : la colonne entiere.
  const column = c.setup.width - c.setup.marginLeft - c.setup.marginRight;
  assert.ok(h2.box.width < column / 2);
  assert.equal(rows[0].box?.width, column);
  // Le texte est en retrait du cadre, qui ajoute de l'air en haut et en bas.
  assert.ok(h2.x > 0 && h2.height > 14 * 1.1);
  assert.equal(rows[2].box?.width !== undefined, true);
  const none = composeNote(NOTE, `N.md`).typeset.rows.filter((r) => r.kind === `heading`)[1];
  assert.equal(none.box, undefined);
  const pdf = Buffer.from(await composeToPdf(c, { creator: `t`, created: new Date(0) })).toString(`latin1`);
  assert.match(pdf, /1 0 0 RG 1\.5 w/);
  assert.match(pdf, /1 1 0 rg/);
});

test(`couleur et surlignage du texte : corps, titres, legendes et PDF`, async () => {
  let t = setPath(defaultTypography(), `body.color`, `#0000ff`);
  t = setPath(t, `body.highlight`, `#ffff00`);
  t = setPath(t, `h1.color`, `#ff0000`);
  const c = composeNote(NOTE, `N.md`, undefined, style(t));
  const text = c.typeset.rows.find((r) => r.kind === `text`);
  assert.deepEqual([text?.color, text?.highlight], [`#0000ff`, `#ffff00`]);
  const h1 = c.typeset.rows.find((r) => r.kind === `heading`);
  assert.deepEqual([h1?.color, h1?.highlight], [`#ff0000`, undefined]);
  const plain = composeNote(NOTE, `N.md`).typeset.rows.find((r) => r.kind === `text`);
  assert.equal(plain?.color, undefined);
  const pdf = Buffer.from(await composeToPdf(c, { creator: `t`, created: new Date(0) })).toString(`latin1`);
  assert.match(pdf, /q 0 0 1 rg/);
  assert.match(pdf, /q 1 1 0 rg [\d.]+ [\d.]+ [\d.]+ [\d.]+ re f Q/);
  assert.match(pdf, /q 1 0 0 rg/);
});

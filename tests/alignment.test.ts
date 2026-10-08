import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNote } from "../src/export/compose";
import { DEFAULT_PAGE_STYLE } from "../src/export/typeset";
import { defaultParagraphSettings, effectiveParagraphs, INDENT_POINTS, isParagraphSet, parseParagraphFormat, SHIFT_POINTS } from "../src/paragraph-format";
import { applyOverrides, defaultTypography, sanitizeOverrides, sanitizeTypography, setPath } from "../src/text-style";

const rows = (text: string, style = DEFAULT_PAGE_STYLE) => composeNote(text, `N.md`, undefined, style).typeset.rows;
const withHeadingAlign = (path: string, value: string) => ({ ...DEFAULT_PAGE_STYLE, typography: setPath(defaultTypography(), path, value) });

test(`un titre peut etre a gauche, centre ou a droite, mais pas justifie`, () => {
  const text = `# Court\n\nTexte.`;
  const left = rows(text).find((r) => r.kind === `heading`)!;
  const center = rows(text, withHeadingAlign(`h1.align`, `center`)).find((r) => r.kind === `heading`)!;
  const right = rows(text, withHeadingAlign(`h1.align`, `right`)).find((r) => r.kind === `heading`)!;
  assert.equal(left.x, 0);
  assert.ok(center.x > 0 && center.x < right.x);
  assert.ok(right.x > 100);
  assert.equal(sanitizeTypography({ headings: [{ align: `justify` }] }).headings[0].align, `left`);
  assert.deepEqual(sanitizeOverrides({ "h2.align": `center`, "h2.align2": `x` }), { "h2.align": `center` });
  assert.equal(applyOverrides(defaultTypography(), { "title.align": `right` }).title.align, `right`);
});

test(`le cadre ajuste au texte suit l'alignement du titre`, () => {
  const style = { ...DEFAULT_PAGE_STYLE, typography: setPath(setPath(defaultTypography(), `h1.frame`, `text`), `h1.align`, `center`) };
  const row = rows(`# Court\n\nTexte.`, style).find((r) => r.kind === `heading`)!;
  assert.ok(row.box && row.box.x > 0);
  const left = rows(`# Court\n\nTexte.`, { ...DEFAULT_PAGE_STYLE, typography: setPath(defaultTypography(), `h1.frame`, `text`) }).find((r) => r.kind === `heading`)!;
  assert.equal(left.box?.x, 0);
});

test(`le retrait de la premiere ligne a trois tailles`, () => {
  const long = `Un paragraphe assez long pour tenir sur plusieurs lignes dans la colonne, avec des mots qui se suivent et se suivent encore et encore pour remplir la largeur. `.repeat(3);
  for (const size of [`s`, `m`, `l`] as const) {
    const style = { ...DEFAULT_PAGE_STYLE, paragraphs: { ...defaultParagraphSettings(), indentSize: size } };
    const first = rows(`# T\n\n${long}`, style).find((r) => r.kind === `text`)!;
    assert.equal(first.x, INDENT_POINTS[size]);
  }
  assert.ok(INDENT_POINTS.s < INDENT_POINTS.m && INDENT_POINTS.m < INDENT_POINTS.l);
});

test(`les paragraphes de toutes les notes s'appliquent tant que la note n'a pas les siens`, () => {
  const general = { ...defaultParagraphSettings(), align: `left` as const, indentSize: `l` as const };
  assert.equal(isParagraphSet(defaultParagraphSettings()), false);
  assert.equal(effectiveParagraphs(general, defaultParagraphSettings()), general);
  assert.equal(effectiveParagraphs(general, undefined), general);
  const own = { ...defaultParagraphSettings(), set: true };
  assert.equal(effectiveParagraphs(general, own), own);
  const legacy = { ...defaultParagraphSettings(), align: `right` as const };
  assert.equal(effectiveParagraphs(general, legacy), legacy);
});

test(`une exception de paragraphe peut donner la taille du retrait`, () => {
  assert.deepEqual(parseParagraphFormat(`retrait m`), { mode: `indent`, indentSize: `m` });
  assert.deepEqual(parseParagraphFormat(`centre, retrait l`), { align: `center`, mode: `indent`, indentSize: `l` });
  assert.deepEqual(parseParagraphFormat(`retrait`), { mode: `indent` });
});

test(`un texte decale par des tabulations ou des espaces garde son decalage dans l'export`, () => {
  const text = `# T\n\nNormal.\n\n\tUn niveau.\n\n\t\tDeux niveaux.\n\n        Huit espaces.\n\n   Trois espaces.`;
  const byText = (s: string) => rows(text).find((r) => r.kind === `text` && r.text.includes(s))!;
  assert.equal(byText(`Normal`).x, INDENT_POINTS.s);
  assert.equal(byText(`Un niveau`).x, SHIFT_POINTS + INDENT_POINTS.s);
  assert.equal(byText(`Deux niveaux`).x, 2 * SHIFT_POINTS + INDENT_POINTS.s);
  assert.equal(byText(`Huit espaces`).x, 2 * SHIFT_POINTS + INDENT_POINTS.s);
  // Moins de quatre espaces : pas de decalage, comme dans Obsidian.
  assert.equal(byText(`Trois espaces`).x, INDENT_POINTS.s);
});

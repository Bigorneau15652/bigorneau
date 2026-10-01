import { test } from "node:test";
import assert from "node:assert/strict";
import { BOLD_OFF, BOLD_ON, ITALIC_OFF, ITALIC_ON, LINK_NUM_END, LINK_OFF, LINK_ON, parseInline, plainOf } from "../src/export/inline";

test(`gras, italique et gras italique`, () => {
  assert.equal(parseInline(`un **gras** et un *italique*`).text, `un ${BOLD_ON}gras${BOLD_OFF} et un ${ITALIC_ON}italique${ITALIC_OFF}`);
  assert.equal(parseInline(`__gras__ et _italique_`).text, `${BOLD_ON}gras${BOLD_OFF} et ${ITALIC_ON}italique${ITALIC_OFF}`);
  assert.equal(parseInline(`***les deux***`).text, `${BOLD_ON}${ITALIC_ON}les deux${ITALIC_OFF}${BOLD_OFF}`);
  // Italique a l'interieur du gras.
  assert.equal(parseInline(`**gras *et italique* gras**`).text, `${BOLD_ON}gras ${ITALIC_ON}et italique${ITALIC_OFF} gras${BOLD_OFF}`);
});

test(`le souligne au milieu d'un mot et les etoiles isolees ne sont pas des styles`, () => {
  assert.equal(parseInline(`snake_case_name et 2 * 3 * 4`).text, `snake_case_name et 2 * 3 * 4`);
  assert.equal(parseInline(`a ** b`).text, `a ** b`);
});

test(`les liens web gardent leur adresse dans une table`, () => {
  const r = parseInline(`voir [la page](https://exemple.fr/a?b=1) et https://autre.fr/x, puis [[Note#Titre|ce texte]].`);
  assert.deepEqual(r.links, [`https://exemple.fr/a?b=1`, `https://autre.fr/x`]);
  assert.equal(r.text, `voir ${LINK_ON}0${LINK_NUM_END}la page${LINK_OFF} et ${LINK_ON}1${LINK_NUM_END}https://autre.fr/x${LINK_OFF}, puis ce texte.`);
  assert.equal(plainOf(r.text), `voir la page et https://autre.fr/x, puis ce texte.`);
});

test(`le gras a l'interieur d'un texte de lien et le code en ligne`, () => {
  const r = parseInline(`[**fort** lien](https://a.fr) et \`*pas italique*\``);
  assert.equal(plainOf(r.text), `fort lien et *pas italique*`);
  assert.ok(r.text.includes(BOLD_ON));
  assert.deepEqual(r.links, [`https://a.fr`]);
});

test(`images et liens internes sont reduits a leur texte, barre et surlignage perdent leurs signes`, () => {
  assert.equal(plainOf(parseInline(`avant ![[a.png]] ![alt](b.png) ~~barre~~ ==surligne== [[Dossier/Note]] apres`).text), `avant  alt barre surligne Note apres`);
});

test(`un lien sans adresse garde son texte`, () => {
  assert.equal(parseInline(`[texte]()`).text, `texte`);
});

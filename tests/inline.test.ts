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

import { InlineContext, normalizeHeading } from "../src/export/inline";

function context(extra: Partial<InlineContext> = {}): InlineContext & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    noteName: `Audit`,
    headingAnchor: (t) => (normalizeHeading(t) === `résultats` ? `hid:3` : undefined),
    block: (id) => (id === `plan` ? { anchor: `b:plan`, label: `Figure 2` } : id === `para` ? { anchor: `b:para` } : undefined),
    pageRefs: false,
    warn: (m) => warnings.push(m),
    warnings,
    ...extra,
  };
}

test(`les renvois a un titre de la note deviennent des liens internes`, () => {
  const r = parseInline(`voir [[#Résultats]], [[Audit#résultats|ci-dessous]] et [[Autre#Titre]]`, context());
  assert.deepEqual(r.links, [`#hid:3`, `#hid:3`]);
  assert.equal(plainOf(r.text), `voir Résultats, ci-dessous et Titre`);
});

test(`les renvois a une figure ou un tableau prennent leur etiquette`, () => {
  const r = parseInline(`comme sur la [[#^plan]] ou [[#^plan|ce plan]] ou [[#^para]]`, context());
  assert.deepEqual(r.links, [`#b:plan`, `#b:plan`, `#b:para`]);
  assert.equal(plainOf(r.text), `comme sur la Figure 2 ou ce plan ou para`);
});

test(`les renvois peuvent ajouter le numero de page`, () => {
  const ctx = context({ pageRefs: true, pageOf: (a) => (a === `hid:3` ? 7 : undefined) });
  assert.equal(plainOf(parseInline(`voir [[#Résultats]]`, ctx).text), `voir Résultats (page 7)`);
  assert.equal(plainOf(parseInline(`voir [[#^plan]]`, ctx).text), `voir Figure 2 (page 0)`);
});

test(`un renvoi sans cible garde son texte et est signale`, () => {
  const ctx = context();
  const r = parseInline(`voir [[#Inconnu]] et [[#^absent]]`, ctx);
  assert.deepEqual(r.links, []);
  assert.equal(plainOf(r.text), `voir Inconnu et absent`);
  assert.deepEqual(ctx.warnings, [`renvoi:Inconnu`, `renvoi:^absent`]);
});

test(`sans contexte, les liens internes restent du texte`, () => {
  assert.equal(plainOf(parseInline(`voir [[#Résultats]]`).text), `voir Résultats`);
});

test(`les titres se comparent sans tenir compte de la casse, des signes et des espaces`, () => {
  assert.equal(normalizeHeading(`Les  **Résultats** [détaillés]`), `les résultats détaillés`);
  assert.equal(normalizeHeading(`Résultats`), normalizeHeading(`résultats `));
});

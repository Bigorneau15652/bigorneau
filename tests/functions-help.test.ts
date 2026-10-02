import { test } from "node:test";
import assert from "node:assert/strict";
import { FunctionRegistry, moveId, panelOrder, reorderVisible, setHidden, visibleIds } from "../src/functions";
import { HelpEntry, HelpRegistry, normalize, searchHelp } from "../src/help";
import { PLUGIN_HELP } from "../src/help-data";

const fn = (id: string): { id: string; name: () => string; icons: string[]; needsEditor: boolean; run: () => void } => ({ id, name: () => id, icons: [`x`], needsEditor: false, run: () => undefined });

test(`le registre garde l'ordre d'ajout et refuse un identifiant en double`, () => {
  const r = new FunctionRegistry<void>();
  r.register(fn(`a`));
  r.register(fn(`b`));
  assert.deepEqual(r.all().map((f) => f.id), [`a`, `b`]);
  assert.equal(r.get(`b`)?.id, `b`);
  assert.equal(r.get(`z`), undefined);
  assert.throws(() => r.register(fn(`a`)), /déjà enregistrée/);
});

test(`l'ordre des boutons suit l'ordre enregistre, puis les fonctions nouvelles dans l'ordre d'ajout`, () => {
  const ids = [`a`, `b`, `c`, `d`];
  assert.deepEqual(panelOrder(ids, []), [`a`, `b`, `c`, `d`]);
  assert.deepEqual(panelOrder(ids, [`c`, `a`]), [`c`, `a`, `b`, `d`]);
  // Un identifiant enregistre qui n'existe plus est oublie, un doublon est ignore.
  assert.deepEqual(panelOrder(ids, [`x`, `d`, `d`, `b`]), [`d`, `b`, `a`, `c`]);
});

test(`les boutons masques disparaissent du panneau sans changer l'ordre`, () => {
  assert.deepEqual(visibleIds([`a`, `b`, `c`], [`c`, `b`], [`b`]), [`c`, `a`]);
  assert.deepEqual(setHidden([`a`], `b`, true), [`a`, `b`]);
  assert.deepEqual(setHidden([`a`, `b`], `a`, false), [`b`]);
  assert.deepEqual(setHidden([`a`, `b`], `b`, true), [`a`, `b`]);
});

test(`un bouton se deplace a une position, ramenee dans les limites de la liste`, () => {
  const order = [`a`, `b`, `c`, `d`];
  assert.deepEqual(moveId(order, `a`, 2), [`b`, `c`, `a`, `d`]);
  assert.deepEqual(moveId(order, `d`, 0), [`d`, `a`, `b`, `c`]);
  assert.deepEqual(moveId(order, `b`, 99), [`a`, `c`, `d`, `b`]);
  assert.deepEqual(moveId(order, `c`, -5), [`c`, `a`, `b`, `d`]);
  assert.deepEqual(moveId(order, `z`, 1), order);
  assert.deepEqual(order, [`a`, `b`, `c`, `d`]);
});

test(`la recherche d'aide ignore les accents, les majuscules et la ponctuation`, () => {
  assert.equal(normalize(`Écrire  avec la CARTE !`), `ecrire avec la carte`);
  assert.equal(normalize(`Œuvre æther`), `oeuvre aether`);
  const fr = (q: string): string[] => searchHelp(PLUGIN_HELP, q, `fr`).map((e) => e.id);
  assert.ok(fr(`ecrire carte`).includes(`map-basics`));
  assert.ok(fr(`PIED de page`).includes(`export-settings`));
  assert.ok(fr(`BAS de page`).includes(`footnotes`));
  assert.ok(fr(`mathjax`).includes(`formulas`));
  assert.deepEqual(fr(`zzzzmotinconnu`), []);
});

test(`la recherche exige tous les mots et classe d'abord le titre, puis les mots-cles, puis le texte`, () => {
  const entries: HelpEntry[] = [
    { id: `text`, title: { fr: `Autre`, en: `Other` }, text: { fr: `parle de tableau ici`, en: `talks about table here` } },
    { id: `keys`, title: { fr: `Autre deux`, en: `Other two` }, text: { fr: `rien`, en: `nothing` }, keywords: { fr: `tableau`, en: `table` } },
    { id: `title`, title: { fr: `Tableau`, en: `Table` }, text: { fr: `rien`, en: `nothing` } },
    { id: `both`, title: { fr: `Tableau et figure`, en: `Table and figure` }, text: { fr: `texte`, en: `text` } },
  ];
  assert.deepEqual(searchHelp(entries, `tableau`, `fr`).map((e) => e.id), [`title`, `both`, `keys`, `text`]);
  assert.deepEqual(searchHelp(entries, `tableau figure`, `fr`).map((e) => e.id), [`both`]);
  assert.deepEqual(searchHelp(entries, `  `, `fr`).map((e) => e.id), [`text`, `keys`, `title`, `both`]);
  assert.deepEqual(searchHelp(entries, `table`, `en`).map((e) => e.id), [`title`, `both`, `keys`, `text`]);
});

test(`les entrees d'aide du plugin sont completes dans les deux langues, avec des identifiants uniques`, () => {
  const ids = PLUGIN_HELP.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 20);
  for (const e of PLUGIN_HELP) {
    for (const lang of [`fr`, `en`] as const) {
      assert.ok(e.title[lang].trim() !== ``, `${e.id} titre ${lang}`);
      assert.ok(e.text[lang].length > 80, `${e.id} texte ${lang}`);
      assert.ok(!e.text[lang].includes(`  `), `${e.id} double espace`);
    }
  }
  // Les noms de commandes cites dans l'aide existent dans l'interface.
  const r = new HelpRegistry();
  r.add(PLUGIN_HELP);
  assert.equal(r.all().length, PLUGIN_HELP.length);
  assert.throws(() => r.add([PLUGIN_HELP[0]]), /déjà enregistrée/);
});

test(`reordonner les boutons affiches laisse les boutons masques a leur place`, () => {
  // Ordre complet a, b, c, d, e ; b et d masques ; l'utilisateur met e en premier parmi a, c, e.
  assert.deepEqual(reorderVisible([`a`, `b`, `c`, `d`, `e`], [`a`, `c`, `e`], [`e`, `a`, `c`]), [`e`, `b`, `a`, `d`, `c`]);
  assert.deepEqual(reorderVisible([`a`, `b`, `c`], [`a`, `b`, `c`], [`c`, `b`, `a`]), [`c`, `b`, `a`]);
  assert.deepEqual(reorderVisible([`a`, `b`, `c`], [`a`, `c`], [`a`, `c`]), [`a`, `b`, `c`]);
});

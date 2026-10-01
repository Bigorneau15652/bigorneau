import { test } from "node:test";
import assert from "node:assert/strict";
import { addExceptions, buildLanguage, getLanguage, hyphenate, hyphenPoints } from "../src/export/hyphenate";

const MINS = { left: 2, right: 3 };

test(`l'exemple de la these de Liang : hy-phen-ation`, () => {
  // Motifs de l'exemple de la these (1983).
  const lang = buildLanguage(`.hy3ph he2n hena4 hen5at 1na n2at 1tio 2io o2n`, ``);
  // Le motif hena4 interdit la coupure avant « tion » que le motif 1tio permettrait : le resultat est hy-phen-ation.
  assert.equal(hyphenate(`hyphenation`, lang, MINS), `hy-phen-ation`);
});

test(`un chiffre pair interdit la coupure meme si un autre motif la permet`, () => {
  const lang = buildLanguage(`a1b a2b`, ``);
  assert.equal(hyphenate(`aab`, lang, { left: 1, right: 1 }), `aab`);
  const lang2 = buildLanguage(`a1b`, ``);
  assert.equal(hyphenate(`aab`, lang2, { left: 1, right: 1 }), `aa-b`);
});

test(`les minimums de lettres avant et apres la cesure sont respectes`, () => {
  const lang = buildLanguage(`1a1 1b1 1c1 1d1 1e1`, ``);
  const word = `abcde`;
  assert.deepEqual(hyphenPoints(word, lang, { left: 2, right: 2 }), [2, 3]);
  assert.deepEqual(hyphenPoints(word, lang, { left: 1, right: 1 }), [1, 2, 3, 4]);
  // Mot trop court pour les minimums.
  assert.deepEqual(hyphenPoints(`abc`, lang, { left: 2, right: 2 }), []);
});

test(`les exceptions l'emportent sur les motifs et peuvent etre enrichies`, () => {
  const lang = buildLanguage(`1a1 1b1 1c1 1d1 1e1`, `ab-cde`);
  assert.equal(hyphenate(`abcde`, lang, { left: 1, right: 1 }), `ab-cde`);
  addExceptions(lang, `abc-de`);
  assert.equal(hyphenate(`ABCDE`, lang, { left: 1, right: 1 }), `ABC-DE`);
});

test(`motifs francais : mots courants`, () => {
  const fr = getLanguage(`fr`);
  const m = { left: 2, right: 2 };
  assert.equal(hyphenate(`ordinateur`, fr, m), `or-di-na-teur`);
  assert.equal(hyphenate(`bibliothèque`, fr, m), `bi-blio-thèque`);
  assert.equal(hyphenate(`Montpellier`, fr, m), `Mont-pel-lier`);
  assert.equal(hyphenate(`rénovation`, fr, m), `ré-no-va-tion`);
  assert.equal(hyphenate(`anticonstitutionnellement`, fr, m), `an-ti-cons-ti-tu-tion-nel-le-ment`);
  // L'apostrophe typographique est traitee comme l'apostrophe droite.
  assert.equal(hyphenate(`aujourd’hui`, fr, m), `au-jour-d’hui`);
  // Aucune coupure dans un mot trop court.
  assert.equal(hyphenate(`pour`, fr, m), `pour`);
});

test(`motifs anglais britanniques et exceptions de la liste`, () => {
  const en = getLanguage(`en`);
  const m = { left: 2, right: 3 };
  assert.equal(hyphenate(`hyphenation`, en, m), `hy-phen-a-tion`);
  assert.equal(hyphenate(`university`, en, m), `uni-ver-sity`);
  assert.equal(hyphenate(`something`, en, m), `some-thing`);
});

test(`chaque coupure respecte les minimums, sur un echantillon de mots`, () => {
  const fr = getLanguage(`fr`);
  for (const w of [`électroencéphalographiquement`, `extraordinairement`, `thermodynamique`, `réhabilitation`, `décarbonation`]) {
    for (const i of hyphenPoints(w, fr, { left: 2, right: 3 })) {
      assert.ok(i >= 2 && i <= w.length - 3, `${w} : coupure ${i}`);
    }
  }
});

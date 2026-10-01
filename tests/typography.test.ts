import { test } from "node:test";
import assert from "node:assert/strict";
import { frenchSpacing } from "../src/export/typography";
import { charUnits, hasGlyph, measureText } from "../src/export/font-metrics";

const FINE = ` `;
const NB = ` `;

test(`espace fine insecable avant ; ! ?`, () => {
  assert.equal(frenchSpacing(`Quoi ? Oui ; non !`), `Quoi${FINE}? Oui${FINE}; non${FINE}!`);
  assert.equal(frenchSpacing(`Quoi?`), `Quoi${FINE}?`);
  assert.equal(frenchSpacing(`Vraiment ?!`), `Vraiment${FINE}?!`);
  assert.equal(frenchSpacing(`un ${NB}!`), `un${FINE}!`);
});

test(`espace insecable avant les deux-points, sauf heures et adresses`, () => {
  assert.equal(frenchSpacing(`Note : voir`), `Note${NB}: voir`);
  assert.equal(frenchSpacing(`Note: voir`), `Note${NB}: voir`);
  assert.equal(frenchSpacing(`rendez-vous a 10:30`), `rendez-vous a 10:30`);
  assert.equal(frenchSpacing(`voir http://exemple.fr`), `voir http://exemple.fr`);
});

test(`les guillemets francais sont separes du texte par une insecable`, () => {
  assert.equal(frenchSpacing(`il dit « bonjour » puis part`), `il dit «${NB}bonjour${NB}» puis part`);
  assert.equal(frenchSpacing(`«bonjour»`), `«${NB}bonjour${NB}»`);
});

test(`abreviations et unites ne se coupent pas`, () => {
  assert.equal(frenchSpacing(`M. Dupont et Mme Martin`), `M.${NB}Dupont et Mme${NB}Martin`);
  assert.equal(frenchSpacing(`voir p. 12 et n° 4`), `voir p.${NB}12 et n°${NB}4`);
  assert.equal(frenchSpacing(`180 kWh/m² pour 30 m et 5 %`), `180${NB}kWh/m² pour 30${NB}m et 5${NB}%`);
  // Un nombre suivi d'un mot ordinaire n'est pas modifie.
  assert.equal(frenchSpacing(`en 2030 les batiments`), `en 2030 les batiments`);
});

test(`la police contient les caracteres francais, y compris l'espace fine insecable, et mesure en points`, () => {
  for (const ch of `œŒéÈçàùûôîêëïü«»’–—`) assert.ok(hasGlyph(ch.codePointAt(0)!), ch);
  assert.ok(hasGlyph(0x202f));
  // Libertinus : espace de 250 unites sur 1000, soit 2,75 pt a 11 pt ; espace fine de 125 unites.
  assert.equal(measureText(` `, 11).width, 2.75);
  assert.equal(charUnits(0x202f), 125);
  assert.deepEqual(measureText(`a\u0001`, 10).missing, [1]);
  assert.ok(measureText(`mot`, 11).width > measureText(`m`, 11).width);
});

test(`les ligatures et le crenage sont appliques aux largeurs`, () => {
  // « ffi » forme une seule ligature : « office » est plus etroit que la somme de ses lettres.
  const letters = [...`office`].reduce((a, c) => a + measureText(c, 1000).width, 0);
  assert.ok(measureText(`office`, 1000).width < letters);
  // « AV » est creno : plus etroit que A + V.
  assert.ok(measureText(`AV`, 1000).width < measureText(`A`, 1000).width + measureText(`V`, 1000).width);
  // Le gras est plus large que le normal.
  assert.ok(measureText(`mot`, 11, `bold`).width > measureText(`mot`, 11).width);
});

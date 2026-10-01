import { test } from "node:test";
import assert from "node:assert/strict";
import { frenchSpacing } from "../src/export/typography";
import { charUnits, displayChar, hasGlyph, measureText } from "../src/export/font-metrics";

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

test(`la police contient les caracteres francais et mesure en points`, () => {
  for (const ch of `œŒéÈçàùûôîêëïü«»’–—`) assert.ok(hasGlyph(ch.codePointAt(0)!), ch);
  // L'espace fine insecable est mesuree et affichee comme l'espace fine de la police.
  assert.equal(displayChar(FINE), ` `);
  assert.equal(charUnits(0x202f), charUnits(0x2009));
  // Libertinus : espace de 250 unites sur 1000, soit 2,75 pt a 11 pt.
  assert.equal(measureText(` `, 11).width, 2.75);
  assert.deepEqual(measureText(`a\u0001`, 10).missing, [1]);
  assert.ok(measureText(`mot`, 11).width > measureText(`m`, 11).width);
});

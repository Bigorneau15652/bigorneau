import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, OFFERED_VARIABLES, bandUsed, configImages, defaultConfig, findPageConfig, formatPageMarker, mirrorZones, parsePageMarker, parseZone, sameConfig, sanitizeConfig, writePageConfig } from "../src/page-config";

const withFooter = () => {
  const c = defaultConfig();
  c.footer.zones = { left: `**{document}**`, center: `Page {page} sur {pages}`, right: `![[logo.png|16]]` };
  return c;
};

test(`les reglages se relisent tels qu'ils ont ete ecrits, sur une seule ligne`, () => {
  const c = withFooter();
  c.edge.zones.center = `{chapter}`;
  c.edge.pageShape = { ...c.edge.pageShape, shape: `circle`, fill: `#ffd43b` };
  const line = formatPageMarker(c);
  assert.ok(!line.includes(`\n`));
  assert.ok(line.startsWith(`%% mmw-page {`));
  assert.deepEqual(parsePageMarker(line), c);
  // Deux signes pour cent de suite ne ferment pas le commentaire.
  const pct = defaultConfig();
  pct.header.zones.left = `100%%`;
  const l = formatPageMarker(pct);
  assert.equal(l.slice(2, -2).includes(`%%`), false);
  assert.equal(parsePageMarker(l)?.header.zones.left, `100%%`);
});

test(`des reglages abimes ou incomplets sont completes par les valeurs par defaut`, () => {
  assert.deepEqual(sanitizeConfig(null), defaultConfig());
  const c = sanitizeConfig({ footer: { zones: { center: 12, left: `a` } }, numbering: { shape: `triangle`, fill: `rouge`, size: `xl`, enabled: true, place: `outer`, align: `center` }, skipFirst: `oui` });
  assert.equal(bandUsed(c.footer), true);
  assert.deepEqual(c.footer.zones, { left: `a`, center: ``, right: `` });
  // L'ancienne numerotation devient un {page} dans la zone du bord exterieur, avec des valeurs par defaut pour ce qui est invalide.
  assert.equal(c.edge.zones.center, `{m}{page}`);
  assert.equal(c.edge.pageShape.shape, `none`);
  assert.equal(c.edge.pageShape.fill, defaultConfig().edge.pageShape.fill);
  assert.equal(c.skipFirst, false);
  assert.deepEqual(parsePageMarker(`%% mmw-page {abime} %%`), defaultConfig());
  assert.equal(parsePageMarker(`Texte`), null);
});

test(`le repere s'ecrit sous les proprietes, se remplace et disparait quand les reglages sont ceux par defaut`, () => {
  const note = `---\nauthor: Moi\n---\n\n# Titre\n\nTexte.`;
  const c = withFooter();
  const once = writePageConfig(note, c);
  assert.ok(once.startsWith(`---\nauthor: Moi\n---\n%% mmw-page {`));
  assert.ok(once.endsWith(`\n\n# Titre\n\nTexte.`));
  assert.deepEqual(findPageConfig(once)?.config, c);
  // Remplacement : toujours un seul repere.
  const twice = writePageConfig(once, c);
  assert.equal(twice.split(`mmw-page`).length, 2);
  assert.equal(bandUsed(findPageConfig(twice)?.config.footer ?? defaultConfig().footer), true);
  // Retour aux reglages par defaut : la ligne disparait, et la note redevient identique.
  assert.equal(writePageConfig(twice, defaultConfig()), note);
  // Note sans proprietes : en tete de note. Fins de ligne Windows conservees.
  assert.ok(writePageConfig(`# A\n`, c).startsWith(`%% mmw-page {`));
  const crlf = writePageConfig(`---\r\na: 1\r\n---\r\n\r\nTexte`, c);
  assert.ok(crlf.includes(`---\r\n%% mmw-page`) && crlf.includes(`%%\r\n\r\nTexte`));
  assert.equal(writePageConfig(note, defaultConfig()), note);
});

test(`le balisage d'une zone donne du texte, des valeurs variables et des images mis en forme`, () => {
  const t = parseZone(`**Rapport** {s}*annuel* {page}/{pages} ![[logo.png|20]]`);
  assert.deepEqual(t[0], { kind: `text`, text: `Rapport`, bold: true, italic: false, size: `m` });
  assert.deepEqual(t[1], { kind: `text`, text: ` `, bold: false, italic: false, size: `m` });
  assert.deepEqual(t[2], { kind: `text`, text: `annuel`, bold: false, italic: true, size: `s` });
  assert.deepEqual(t[4], { kind: `variable`, name: `page`, bold: false, italic: false, size: `s` });
  assert.deepEqual(t[t.length - 1], { kind: `image`, target: `logo.png`, width: 20 });
  assert.deepEqual(parseZone(`{document}`, `l`), [{ kind: `variable`, name: `document`, bold: false, italic: false, size: `l` }]);
  assert.deepEqual(parseZone(`{inconnu} 2 * 3`).map((x) => (x.kind === `text` ? x.text : x.kind)), [`{inconnu} 2 `, ` 3`]);
  assert.deepEqual(parseZone(``), []);
});

test(`les images des zones sont listees, et les zones se reflechissent`, () => {
  const c = withFooter();
  c.header.verso.right = `![[a.png]]`;
  assert.deepEqual(configImages(c), [{ target: `a.png`, width: undefined }, { target: `logo.png`, width: 16 }]);
  assert.deepEqual(mirrorZones({ left: `a`, center: `b`, right: `c` }), { left: `c`, center: `b`, right: `a` });
  assert.equal(sameConfig(defaultConfig(), defaultConfig()), true);
});

test(`une bande existe des qu'une de ses zones est remplie, sans interrupteur`, () => {
  const c = defaultConfig();
  assert.equal(bandUsed(c.header), false);
  c.header.zones.center = `   `;
  assert.equal(bandUsed(c.header), false);
  c.header.zones.center = `Titre`;
  assert.equal(bandUsed(c.header), true);
  // Les zones des pages de gauche ne comptent que si elles sont differentes.
  c.footer.verso.left = `x`;
  assert.equal(bandUsed(c.footer), false);
  c.footer.mirror = true;
  assert.equal(bandUsed(c.footer), true);
});

test(`une image se redimensionne avec |largeur comme dans Obsidian`, () => {
  const t = parseZone(`![[logo.png|200]] ![[fond.png]]`);
  assert.deepEqual(t[0], { kind: `image`, target: `logo.png`, width: 200 });
  assert.deepEqual(t[2], { kind: `image`, target: `fond.png`, width: undefined });
});

test(`une couleur s'ecrit en hexadecimal, avec ou sans diese, sur trois ou six chiffres ; vide veut dire aucune`, () => {
  assert.equal(normalizeHex(`#FFD43B`), `#ffd43b`);
  assert.equal(normalizeHex(`ffd43b`), `#ffd43b`);
  assert.equal(normalizeHex(`#f90`), `#ff9900`);
  assert.equal(normalizeHex(`  `), ``);
  assert.equal(normalizeHex(`rouge`), null);
  assert.equal(normalizeHex(`#12345`), null);
});

test(`le remplissage et le contour de la forme peuvent etre vides, et {pages} n'est plus propose`, () => {
  const c = sanitizeConfig({ footer: { pageShape: { shape: `square`, fill: ``, stroke: ``, color: `#112233` } } });
  assert.equal(c.footer.pageShape.fill, ``);
  assert.equal(c.footer.pageShape.stroke, ``);
  assert.equal(c.footer.pageUpright, true);
  assert.deepEqual(parsePageMarker(formatPageMarker(c))?.footer.pageShape, c.footer.pageShape);
  assert.ok(!OFFERED_VARIABLES.includes(`pages`));
  assert.ok(OFFERED_VARIABLES.includes(`created`) && OFFERED_VARIABLES.includes(`modified`));
});

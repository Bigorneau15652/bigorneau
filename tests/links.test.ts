import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNote } from "../src/model";
import { edgePoint, linkPath } from "../src/link-geom";
import { formatLink, insertLink, linkHeading, parseLinks, removeLink, webLinks } from "../src/links";

const NAME = `Ma note.md`;

test(`liens entre titres : lecture des liens en debut de paragraphe`, () => {
  const text = [
    `Intro`,
    `## Budget`,
    `%% mmw {"tags":["a"]} %%`,
    `[[Ma note#Planning|Lien vers Planning]]`,
    `[[Autre#Risques|Lien vers Risques]]`,
    `Texte libre`,
    `[[Ma note#Planning|pas au debut]]`,
    `## Planning`,
    `[[#Budget|Lien vers Budget]]`,
    `[[Ma note#Absent|Lien vers Absent]]`,
    `[[Ma note#^bloc]]`,
    ``,
  ].join(`\n`);
  const doc = parseNote(text, NAME);
  const links = parseLinks(doc, NAME);
  assert.equal(links.length, 4);
  assert.deepEqual(links[0], { from: `r.0`, line: 3, note: `Ma note`, heading: `Planning`, external: false, to: `r.1` });
  assert.deepEqual(links[1], { from: `r.0`, line: 4, note: `Autre`, heading: `Risques`, external: true, to: null });
  assert.deepEqual(links[2], { from: `r.1`, line: 8, note: ``, heading: `Budget`, external: false, to: `r.0` });
  assert.equal(links[3].to, null);
  assert.equal(links[3].external, false);
});

test(`liens entre titres : ecriture et suppression d'une ligne de lien`, () => {
  const text = [`Intro`, `## A`, `%% mmw {"tags":["a"]} %%`, `[[Ma note#B|Lien vers B]]`, `texte`, `## B`, `suite`, ``].join(`\n`);
  const doc = parseNote(text, NAME);
  // Le nouveau lien s'ajoute apres ceux qui existent, avant le texte.
  const added = insertLink(text, doc, `r.0`, `Ma note`, `C [x]`);
  assert.ok(added);
  const lines = added!.split(`\n`);
  assert.equal(lines[4], `[[Ma note#C x|Lien vers C x]]`);
  assert.equal(lines[5], `texte`);
  // Un titre sans commentaire ni lien : le lien vient juste sous le titre.
  const b = insertLink(text, doc, `r.1`, `Ma note`, `A`)!.split(`\n`);
  assert.equal(b[6], `[[Ma note#A|Lien vers A]]`);
  assert.equal(b[7], `suite`);
  // Suppression.
  const link = parseLinks(doc, NAME)[0];
  assert.equal(removeLink(text, doc, link), [`Intro`, `## A`, `%% mmw {"tags":["a"]} %%`, `texte`, `## B`, `suite`, ``].join(`\n`));
  // Racine et titre vide : refuses.
  assert.equal(insertLink(text, doc, `r`, `Ma note`, `A`), null);
  assert.equal(insertLink(text, doc, `r.0`, `Ma note`, `[]`), null);
  assert.equal(linkHeading(` A  #B | C ^`), `A B C`);
  assert.equal(formatLink(`N`, `T`), `[[N#T|Lien vers T]]`);
});

test(`liens entre titres : fins de ligne Windows`, () => {
  const text = `## A\r\ntexte\r\n## B\r\n`;
  const doc = parseNote(text, NAME);
  const out = insertLink(text, doc, `r.0`, `Ma note`, `B`)!;
  assert.equal(out, `## A\r\n[[Ma note#B|Lien vers B]]\r\ntexte\r\n## B\r\n`);
});

test(`fleches de lien : trace droit ou courbe entre deux cases`, () => {
  const a = { x: 0, y: 0, w: 100, h: 40 };
  const b = { x: 300, y: 200, w: 100, h: 40 };
  const p = edgePoint(a, 350, 20);
  assert.equal(p.x, 100);
  assert.equal(p.y, 20);
  assert.match(linkPath(a, b, false), /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
  assert.match(linkPath(a, b, true), /^M [\d.]+ [\d.]+ Q [\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
  // Cases l'une sous l'autre : le trait droit part du bord droit de chacune.
  const c = { x: 0, y: 100, w: 80, h: 40 };
  assert.equal(linkPath(a, c, false), `M 102 20 L 83 120`);
});

test(`liens vers une note entiere et liens web`, () => {
  const text = [
    `## A`,
    `%% mmw {"comment":"voir https://exemple.org/cache"} %%`,
    `[[Dossier/Autre note|Lien vers Autre note]]`,
    `[[Ma note]]`,
    `[[]]`,
    `Texte avec [un site](https://exemple.org/page) et https://www.youtube.com/watch?v=abc123, puis <https://autre.fr/x>.`,
    `![](https://www.youtube.com/watch?v=xyz789)`,
    `<iframe width="560" src="https://www.youtube.com/embed/zzz" frameborder="0"></iframe>`,
    `Doublon : https://exemple.org/page`,
    "Code `https://code.test/a` ignore",
    "```",
    `https://bloc.test/b`,
    "```",
    `[[Note interne]] et ![[image.png]] ne sont pas des liens web.`,
    `## B`,
    `https://b.test`,
    ``,
  ].join(`\n`);
  const doc = parseNote(text, NAME);
  const links = parseLinks(doc, NAME);
  // [[Ma note]] est un lien vers la note elle-meme sans titre : ce n'est pas un lien entre titres.
  assert.deepEqual(links, [{ from: `r.0`, line: 2, note: `Dossier/Autre note`, heading: null, external: true, to: null }]);
  assert.equal(formatLink(`Dossier/Autre note`, null), `[[Dossier/Autre note|Lien vers Autre note]]`);
  assert.equal(insertLink(`## A\n`, parseNote(`## A\n`, NAME), `r.0`, `Autre`, null), `## A\n[[Autre|Lien vers Autre]]\n`);
  assert.equal(insertLink(`## A\n`, parseNote(`## A\n`, NAME), `r.0`, ``, null), null);
  const web = webLinks(doc, `r.0`);
  assert.deepEqual(
    web.map((w) => w.url),
    [`https://exemple.org/page`, `https://www.youtube.com/watch?v=abc123`, `https://autre.fr/x`, `https://www.youtube.com/watch?v=xyz789`, `https://www.youtube.com/embed/zzz`]
  );
  assert.equal(web[0].label, `un site`);
  assert.equal(web[2].label, `autre.fr/x`);
  assert.deepEqual(webLinks(doc, `r.1`).map((w) => w.url), [`https://b.test`]);
  assert.deepEqual(webLinks(doc, `r`), []);
});

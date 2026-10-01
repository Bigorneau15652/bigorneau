import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc, inlineToPlain, parseBlocks, stripComments } from "../src/export/doc-tree";

test(`les commentaires du plugin disparaissent, y compris sur plusieurs lignes`, () => {
  const text = [`avant`, `%% mmw {"hidden":true} %%`, `milieu %% cache %% fin`, `%% debut`, `suite`, `fin %%`, `apres`].join(`\n`);
  assert.equal(stripComments(text), [`avant`, `milieu  fin`, `apres`].join(`\n`));
});

test(`les commentaires situes dans un bloc de code sont conserves`, () => {
  const text = [`\`\`\``, `%% reste %%`, `\`\`\``, `x %% parti %%`].join(`\n`);
  assert.equal(stripComments(text), [`\`\`\``, `%% reste %%`, `\`\`\``, `x `].join(`\n`));
});

test(`les paragraphes sont separes par une ligne vide et leurs lignes se rejoignent`, () => {
  const blocks = parseBlocks([`L'ete dernier,`, `il a plu.`, ``, `Second paragraphe.`].join(`\n`));
  assert.deepEqual(blocks, [
    { type: `paragraph`, text: `L'ete dernier, il a plu.` },
    { type: `paragraph`, text: `Second paragraphe.` },
  ]);
});

test(`listes ordonnees, a puces et imbriquees`, () => {
  const blocks = parseBlocks([`- un`, `  - sous-un`, `- deux`, `  suite de deux`, ``, `1. premier`, `2. second`].join(`\n`));
  assert.deepEqual(blocks[0], {
    type: `list`,
    ordered: false,
    items: [
      { text: `un`, depth: 0 },
      { text: `sous-un`, depth: 1 },
      { text: `deux suite de deux`, depth: 0 },
    ],
  });
  assert.deepEqual(blocks[1], {
    type: `list`,
    ordered: true,
    items: [
      { text: `premier`, depth: 0 },
      { text: `second`, depth: 0 },
    ],
  });
});

test(`citations, code, tableaux et figures`, () => {
  const blocks = parseBlocks(
    [
      `> ligne une`,
      `> ligne deux`,
      ``,
      `\`\`\`ts`,
      `const a = \`x\`;`,
      `\`\`\``,
      ``,
      `| Nom | Valeur |`,
      `| --- | --- |`,
      `| a | 1 |`,
      ``,
      `![[plan.png|400]]`,
      ``,
      `![[carte.png|Carte du site]]`,
      ``,
      `![Vue](https://exemple.fr/v.png)`,
      ``,
      `---`,
    ].join(`\n`)
  );
  assert.deepEqual(blocks, [
    { type: `quote`, text: `ligne une\nligne deux` },
    { type: `code`, lang: `ts`, text: `const a = \`x\`;` },
    { type: `table`, rows: [[`Nom`, `Valeur`], [`a`, `1`]] },
    { type: `figure`, target: `plan.png`, caption: `` },
    { type: `figure`, target: `carte.png`, caption: `Carte du site` },
    { type: `figure`, target: `https://exemple.fr/v.png`, caption: `Vue` },
  ]);
});

test(`le Markdown en ligne devient du texte brut`, () => {
  assert.equal(inlineToPlain(`un **gras**, un *italique*, du \`code\` et un [lien](http://a.fr)`), `un gras, un italique, du code et un lien`);
  assert.equal(inlineToPlain(`voir [[Dossier/Note#Titre|ce texte]] puis [[Note]] et [[Autre#Partie]]`), `voir ce texte puis Note et Partie`);
  assert.equal(inlineToPlain(`image ![[a.png]] retiree, snake_case reste`), `image  retiree, snake_case reste`);
});

const NOTE = [
  `---`,
  `tags: test`,
  `---`,
  `Introduction de la note.`,
  ``,
  `# Premier`,
  `%% mmw {"short":"P"} %%`,
  `Texte du premier.`,
  `## Premier A`,
  `Texte A.`,
  `## Cache`,
  `%% mmw {"hidden":true} %%`,
  `Texte masque.`,
  `### Sous le cache`,
  `Texte sous le cache.`,
  `## Premier B`,
  `Texte B.`,
  `# Second`,
  `Texte du second.`,
  `%% mmw-float {"x":1,"y":2} %%`,
  `## Flottant`,
  `Texte flottant.`,
].join(`\n`);

test(`l'arbre suit l'ordre et la hierarchie de la note`, () => {
  const doc = buildExportDoc(NOTE, `Ma note.md`);
  assert.equal(doc.title, `Ma note`);
  assert.deepEqual(doc.blocks, [{ type: `paragraph`, text: `Introduction de la note.` }]);
  assert.deepEqual(doc.sections.map((s) => s.title), [`Premier`, `Second`]);
  assert.deepEqual(doc.sections[0].sections.map((s) => s.title), [`Premier A`, `Premier B`]);
  assert.deepEqual(doc.sections[0].blocks, [{ type: `paragraph`, text: `Texte du premier.` }]);
});

test(`les titres masques et les sujets flottants sont exclus par defaut`, () => {
  const doc = buildExportDoc(NOTE, `Ma note.md`);
  const all = JSON.stringify(doc);
  assert.ok(!all.includes(`Cache`));
  assert.ok(!all.includes(`Texte masque`));
  assert.ok(!all.includes(`Sous le cache`));
  assert.ok(!all.includes(`Flottant`));
  assert.ok(!all.includes(`mmw`));
});

test(`les options font revenir les titres masques et les sujets flottants`, () => {
  const doc = buildExportDoc(NOTE, `Ma note.md`, { includeHidden: true, includeFloats: true });
  assert.deepEqual(doc.sections[0].sections.map((s) => s.title), [`Premier A`, `Cache`, `Premier B`]);
  assert.deepEqual(doc.sections[0].sections[1].sections.map((s) => s.title), [`Sous le cache`]);
  assert.deepEqual(doc.sections.map((s) => s.title), [`Premier`, `Second`, `Flottant`]);
  assert.ok(!JSON.stringify(doc).includes(`mmw`));
});

test(`une note sans titre donne seulement une introduction`, () => {
  const doc = buildExportDoc(`Juste du texte.\n`, `Vide.md`);
  assert.deepEqual(doc.sections, []);
  assert.deepEqual(doc.blocks, [{ type: `paragraph`, text: `Juste du texte.` }]);
});

test(`la langue est lue dans les proprietes de la note`, () => {
  assert.equal(buildExportDoc(`---\nlang: en-GB\n---\n# A\ntexte`, `N.md`).language, `en-GB`);
  assert.equal(buildExportDoc(`---\nlangue: "fr"\n---\n# A\ntexte`, `N.md`).language, `fr`);
  assert.equal(buildExportDoc(`# A\ntexte`, `N.md`).language, undefined);
});

test(`une ligne de tableau sans cellule remplie est ignoree`, () => {
  const blocks = parseBlocks([`| a | b |`, `| --- | --- |`, `| 1 | 2 |`, `|  |  |`].join(`\n`));
  assert.deepEqual(blocks, [{ type: `table`, rows: [[`a`, `b`], [`1`, `2`]] }]);
});

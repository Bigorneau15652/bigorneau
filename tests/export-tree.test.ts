import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExportDoc, parseBlocks, stripComments } from "../src/export/doc-tree";

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
    { type: `table`, rows: [[`Nom`, `Valeur`], [`a`, `1`]], align: [`left`, `left`] },
    { type: `figure`, target: `plan.png`, caption: ``, width: 400 },
    { type: `figure`, target: `carte.png`, caption: `Carte du site` },
    { type: `figure`, target: `https://exemple.fr/v.png`, caption: `Vue` },
  ]);
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
  assert.deepEqual(blocks, [{ type: `table`, rows: [[`a`, `b`], [`1`, `2`]], align: [`left`, `left`] }]);
});

test(`les definitions de notes de bas de page sont retirees du texte et rassemblees`, () => {
  const doc = buildExportDoc([`# A`, `Un appel[^1] et un autre[^deux].`, ``, `[^1]: Premiere note,`, `    suite sur la ligne suivante.`, `[^deux]: Seconde note.`, ``, `Fin du texte.`].join(`\n`), `N.md`);
  assert.deepEqual(doc.footnotes, { "1": `Premiere note, suite sur la ligne suivante.`, deux: `Seconde note.` });
  assert.deepEqual(doc.sections[0].blocks, [
    { type: `paragraph`, text: `Un appel[^1] et un autre[^deux].` },
    { type: `paragraph`, text: `Fin du texte.` },
  ]);
});

test(`une definition ecrite dans un bloc de code reste du code`, () => {
  const blocks = parseBlocks([`\`\`\``, `[^1]: pas une note`, `\`\`\``].join(`\n`));
  assert.deepEqual(blocks, [{ type: `code`, lang: ``, text: `[^1]: pas une note` }]);
});

test(`l'auteur est lu dans les proprietes de la note`, () => {
  assert.equal(buildExportDoc(`---\nauthor: Olivier H.\n---\n# A`, `N.md`).author, `Olivier H.`);
  assert.equal(buildExportDoc(`---\nauteur: "Marie Curie"\n---\n# A`, `N.md`).author, `Marie Curie`);
  assert.equal(buildExportDoc(`# A`, `N.md`).author, undefined);
});

test(`figures : legende, taille et identifiant de bloc`, () => {
  const blocks = parseBlocks([`![[plan.png|Plan de masse|420]] ^plan`, ``, `![Vue aerienne|300x200](vue.jpg)`, ``, `![[sans-legende.png]]`].join(`\n`));
  assert.deepEqual(blocks, [
    { type: `figure`, target: `plan.png`, caption: `Plan de masse`, width: 420, id: `plan` },
    { type: `figure`, target: `vue.jpg`, caption: `Vue aerienne`, width: 300 },
    { type: `figure`, target: `sans-legende.png`, caption: `` },
  ]);
});

test(`tableaux : alignement des colonnes, legende et identifiant de bloc`, () => {
  const blocks = parseBlocks([`Tableau : Consommations par poste`, `| Poste | Avant | Apres |`, `| :-- | :-: | --: |`, `| Chauffage | 120 | 60 |`, `^conso`, ``, `Un paragraphe.`].join(`\n`));
  assert.deepEqual(blocks[0], { type: `table`, rows: [[`Poste`, `Avant`, `Apres`], [`Chauffage`, `120`, `60`]], align: [`left`, `center`, `right`], caption: `Consommations par poste`, id: `conso` });
  assert.equal(blocks.length, 2);
  // Une ligne qui commence par « Table: » (anglais) est aussi une legende, mais pas un paragraphe quelconque.
  assert.equal((parseBlocks(`Table: Heat\n| a |\n| - |\n| 1 |`)[0] as { caption?: string }).caption, `Heat`);
  assert.equal(parseBlocks(`Un tableau suit.\n\n| a |\n| - |\n| 1 |`)[0].type, `paragraph`);
});

test(`identifiants de bloc des paragraphes et citations`, () => {
  const blocks = parseBlocks([`Un paragraphe important. ^important`, ``, `> Une citation ^cite`].join(`\n`));
  assert.deepEqual(blocks, [
    { type: `paragraph`, text: `Un paragraphe important.`, id: `important` },
    { type: `quote`, text: `Une citation`, id: `cite` },
  ]);
});

test(`table des matieres demandee par les proprietes de la note`, () => {
  assert.deepEqual(buildExportDoc(`---\ntoc: true\n---\n# A`, `N.md`).toc, { depth: 3 });
  assert.deepEqual(buildExportDoc(`---\ntoc: oui\ntoc-depth: 2\n---\n# A`, `N.md`).toc, { depth: 2 });
  assert.equal(buildExportDoc(`---\ntoc: false\n---\n# A`, `N.md`).toc, undefined);
  assert.equal(buildExportDoc(`# A`, `N.md`).toc, undefined);
});

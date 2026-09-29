import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNote, serializeNote, renameNode, computeStats, MmNode } from "../src/model";

const FENCE = String.fromCharCode(96).repeat(3);

function roundTrip(text: string): void {
  const doc = parseNote(text, `note.md`);
  assert.equal(serializeNote(doc), text);
}

function titles(nodes: MmNode[]): string[] {
  return nodes.map((n) => n.title);
}

test(`note simple : structure et reconstruction identique`, () => {
  const text = `Introduction\n\n# Chapitre 1\nTexte 1\n## Section 1.1\nTexte\n# Chapitre 2\nTexte 2\n`;
  const doc = parseNote(text, `Ma note.md`);
  assert.equal(doc.hasGeneralTitle, false);
  assert.equal(doc.root.title, `Ma note`);
  assert.equal(doc.root.body, `Introduction\n\n`);
  assert.deepEqual(titles(doc.root.children), [`Chapitre 1`, `Chapitre 2`]);
  assert.deepEqual(titles(doc.root.children[0].children), [`Section 1.1`]);
  assert.equal(serializeNote(doc), text);
});

test(`titre general unique : il devient le noeud racine`, () => {
  const text = `# Titre general\nIntro\n## A\nx\n### A1\ny\n## B\nz\n`;
  const doc = parseNote(text, `f.md`);
  assert.equal(doc.hasGeneralTitle, true);
  assert.equal(doc.root.title, `Titre general`);
  assert.equal(doc.root.body, `Intro\n`);
  assert.deepEqual(titles(doc.root.children), [`A`, `B`]);
  assert.deepEqual(titles(doc.root.children[0].children), [`A1`]);
  assert.equal(serializeNote(doc), text);
});

test(`texte avant le titre general conserve`, () => {
  const text = `Avant\n\n# Titre\nSuite\n## A\n`;
  const doc = parseNote(text, `f.md`);
  assert.equal(doc.hasGeneralTitle, true);
  assert.equal(doc.preamble, `Avant\n\n`);
  assert.equal(serializeNote(doc), text);
});

test(`plusieurs titres de niveau 1 : le nom du fichier est la racine`, () => {
  const text = `# A\n## A1\n# B\n# C\n`;
  const doc = parseNote(text, `Racine.md`);
  assert.equal(doc.hasGeneralTitle, false);
  assert.equal(doc.root.title, `Racine`);
  assert.deepEqual(titles(doc.root.children), [`A`, `B`, `C`]);
  assert.equal(serializeNote(doc), text);
});

test(`un titre de niveau 1 qui n est pas le premier titre n est pas general`, () => {
  const text = `## A\n# B\n## C\n`;
  const doc = parseNote(text, `f.md`);
  assert.equal(doc.hasGeneralTitle, false);
  assert.deepEqual(titles(doc.root.children), [`A`, `B`]);
  assert.equal(serializeNote(doc), text);
});

test(`niveaux sautes : le niveau reel est conserve`, () => {
  const text = `# A\n### B\ntexte\n## C\n`;
  const doc = parseNote(text, `f.md`);
  assert.equal(doc.root.title, `A`);
  assert.deepEqual(titles(doc.root.children), [`B`, `C`]);
  assert.equal(doc.root.children[0].level, 3);
  assert.equal(computeStats(doc).skippedLevels, 1);
  assert.equal(serializeNote(doc), text);
});

test(`titres dans les blocs de code, callouts et commentaires ignores`, () => {
  const text = [
    `# Vrai`,
    FENCE + `python`,
    `# faux 1`,
    FENCE,
    `> [!note]`,
    `> # faux 2`,
    `%%`,
    `# faux 3`,
    `%%`,
    `<!--`,
    `# faux 4`,
    `-->`,
    `$$`,
    `# faux 5`,
    `$$`,
    `## Vrai 2`,
    ``,
  ].join(`\n`);
  const doc = parseNote(text, `f.md`);
  const all = [doc.root, ...doc.root.children];
  assert.deepEqual(titles(all), [`Vrai`, `Vrai 2`]);
  assert.equal(serializeNote(doc), text);
});

test(`un bloc de code plus long ne se ferme pas avec un marqueur plus court`, () => {
  const long = String.fromCharCode(96).repeat(4);
  const text = `# A\n${long}\n${FENCE}\n# faux\n${long}\n## B\n`;
  const doc = parseNote(text, `f.md`);
  assert.deepEqual(titles(doc.root.children), [`B`]);
  assert.equal(serializeNote(doc), text);
});

test(`ce qui n est pas un titre : hashtag, sept dieses, retrait`, () => {
  const text = `# A\n#tag\n####### sept\n  # retrait\n## B\n`;
  const doc = parseNote(text, `f.md`);
  assert.deepEqual(titles(doc.root.children), [`B`]);
  assert.equal(serializeNote(doc), text);
});

test(`titre vide : conserve et compte`, () => {
  const text = `# A\n##\nbloc libre\n## \nautre\n`;
  const doc = parseNote(text, `f.md`);
  const a = doc.root;
  assert.deepEqual(titles(a.children), [``, ``]);
  assert.equal(a.children[0].body, `bloc libre\n`);
  assert.equal(computeStats(doc).emptyTitles, 2);
  assert.equal(serializeNote(doc), text);
});

test(`proprietes YAML conservees et non lues comme des titres`, () => {
  const text = `---\ntags: [a]\n# commentaire yaml\n---\n# A\nx\n`;
  const doc = parseNote(text, `f.md`);
  assert.equal(doc.frontmatter, `---\ntags: [a]\n# commentaire yaml\n---\n`);
  assert.equal(doc.hasGeneralTitle, true);
  assert.equal(serializeNote(doc), text);
});

test(`fins de ligne Windows et absence de retour final`, () => {
  roundTrip(`# A\r\ntexte\r\n## B\r\nfin`);
  roundTrip(`# A\r\n`);
  roundTrip(``);
  roundTrip(`sans titre`);
});

test(`renommer un noeud regenere sa ligne de titre`, () => {
  const doc = parseNote(`# A\n## B  \ntexte\n`, `f.md`);
  renameNode(doc.root.children[0], `Nouveau`);
  assert.equal(serializeNote(doc), `# A\n## Nouveau\ntexte\n`);
});

test(`ajouter un noeud apres un texte sans retour final insere un retour`, () => {
  const doc = parseNote(`# A\n## B\nfin`, `f.md`);
  doc.root.children.push({ level: 2, title: `C`, heading: null, body: ``, children: [] });
  assert.equal(serializeNote(doc), `# A\n## B\nfin\n## C\n`);
});

test(`deplacer un noeud dans l arbre reconstruit la note dans le nouvel ordre`, () => {
  const doc = parseNote(`# A\n## B\nb\n## C\nc\n`, `f.md`);
  const [b, c] = doc.root.children;
  doc.root.children = [c, b];
  assert.equal(serializeNote(doc), `# A\n## C\nc\n## B\nb\n`);
});

test(`reconstruction identique sur 3000 notes tirees au hasard`, () => {
  const fragments = [
    `# T\n`, `## S\n`, `### U\n`, `#### V\n`, `##\n`, `# \n`, `#tag\n`, `####### x\n`, `  # r\n`,
    `texte\n`, `\n`, `> # q\n`, `> [!note]\n`, `- # item\n`, `\t# tab\n`,
    FENCE + `\n`, FENCE + `js\n`, `~~~\n`, String.fromCharCode(96).repeat(4) + `\n`,
    `%%\n`, `%% inline %% ## X\n`, `<!--\n`, `-->\n`, `$$\n`, `$$x$$\n`,
    `---\n`, `...\n`, `\r\n`, `# fin sans retour`, `## \r\n`, `ecole été \n`,
  ];
  let seed = 12345;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let t = 0; t < 3000; t++) {
    let text = ``;
    const len = rnd(14);
    for (let i = 0; i < len; i++) text += fragments[rnd(fragments.length)];
    const doc = parseNote(text, `f.md`);
    assert.equal(serializeNote(doc), text, `echec pour : ${JSON.stringify(text)}`);
    const check = (node: MmNode): void => {
      for (const child of node.children) {
        assert.ok(child.level > node.level, `niveau incoherent pour ${JSON.stringify(text)}`);
        check(child);
      }
    };
    check(doc.root);
  }
});

import { splitSections, nodeByKey, flattenDoc, pathTitles, splitBody, joinBody } from "../src/model";

test(`sections : texte avant le premier titre puis un element par titre`, () => {
  const s = splitSections(`intro\n# A\ntexte\n## B\n`);
  assert.equal(s.length, 3);
  assert.equal(s[0].heading, null);
  assert.equal(s[0].body, `intro\n`);
  assert.equal(s[1].title, `A`);
  assert.equal(s[2].level, 2);
  assert.equal(s.map((x) => (x.heading ?? ``) + x.body).join(``), `intro\n# A\ntexte\n## B\n`);
});

test(`sections : un titre dans un bloc de code n est pas une section`, () => {
  const fence = String.fromCharCode(96).repeat(3);
  assert.equal(splitSections(`${fence}\n# x\n${fence}\n`).length, 1);
});

test(`recherche d un noeud par sa cle, chemin et ordre du document`, () => {
  const doc = parseNote(`# A\n## B\n### C\n## D\n`, `f.md`);
  assert.equal(nodeByKey(doc, `r`)?.title, `A`);
  assert.equal(nodeByKey(doc, `r.0.0`)?.title, `C`);
  assert.equal(nodeByKey(doc, `r.1`)?.title, `D`);
  assert.equal(nodeByKey(doc, `r.5`), null);
  assert.equal(nodeByKey(doc, `x`), null);
  assert.deepEqual(flattenDoc(doc).map((e) => e.node.title), [`A`, `B`, `C`, `D`]);
  assert.deepEqual(pathTitles(doc, `r.0.0`), [`A`, `B`, `C`]);
});

test(`texte d un noeud : les lignes vides autour sont conservees`, () => {
  assert.deepEqual(splitBody(`\nBonjour\nmonde\n\n`), { lead: `\n`, core: `Bonjour\nmonde`, trail: `\n\n` });
  assert.deepEqual(splitBody(``), { lead: ``, core: ``, trail: `` });
  assert.deepEqual(splitBody(`seul`), { lead: ``, core: `seul`, trail: `` });
  assert.deepEqual(splitBody(`\n\n`), { lead: `\n\n`, core: ``, trail: `` });
  for (const body of [`\nA\n\n`, `A`, `A  \nB\n`, `\r\nA\r\n`, ``, `\n`]) {
    assert.equal(joinBody(splitBody(body), splitBody(body).core), body);
  }
});

test(`modifier le texte d un noeud laisse le reste de la note intact`, () => {
  const original = `# A\n\nun\n\n## B\n\ndeux\n\n## C\ntrois\n`;
  const doc = parseNote(original, `f.md`);
  const b = doc.root.children[0];
  const parts = splitBody(b.body);
  b.body = joinBody(parts, `deux modifie\nsur deux lignes`);
  assert.equal(serializeNote(doc), `# A\n\nun\n\n## B\n\ndeux modifie\nsur deux lignes\n\n## C\ntrois\n`);
});

import { locateInSections } from "../src/model";

test(`curseur apres un titre tape : la section suivante est reperee`, () => {
  const text = `avant\n## Nouveau\n\nsuite du texte`;
  assert.deepEqual(locateInSections(text, text.length), { count: 2, index: 1, offset: `suite du texte`.length });
  assert.deepEqual(locateInSections(text, 3), { count: 2, index: 0, offset: 3 });
  assert.equal(locateInSections(`texte simple`, 4).count, 1);
});

test(`positions des noeuds dans le fichier : lignes du titre et de fin`, () => {
  const doc = parseNote(`---\na: b\n---\n# T\ntexte\n## S\nx\ny\n`, `f.md`);
  assert.equal(doc.root.line, 3);
  assert.equal(doc.root.endLine, 5);
  const s = doc.root.children[0];
  assert.equal(s.line, 5);
  assert.equal(s.endLine, 8);
  const plain = parseNote(`intro\n\n# A\n# B\n`, `f.md`);
  assert.equal(plain.root.line, 0);
  assert.equal(plain.root.endLine, 2);
  assert.equal(plain.root.children[0].line, 2);
  assert.equal(plain.root.children[1].line, 3);
});

import test from "node:test";
import assert from "node:assert/strict";
import { addNode, cleanTitle, deleteNodes, describeDeletion, newLevel, renameTitle } from "../src/edit";
import { parseNote, nodeByKey } from "../src/model";

const NOTE = `# Projet\n\nIntro\n\n## A\n\ntexte a\n\n### A1\n\ntexte a1\n\n## B\n\ntexte b\n`;

test(`ajout d'un frere apres la branche entiere`, () => {
  const r = addNode(NOTE, `n.md`, `r.0`, `sibling`)!;
  assert.equal(r.text, `# Projet\n\nIntro\n\n## A\n\ntexte a\n\n### A1\n\ntexte a1\n\n##\n## B\n\ntexte b\n`);
  assert.equal(r.key, `r.1`);
});

test(`ajout d'un enfant : dernier enfant au niveau des autres enfants`, () => {
  const r = addNode(NOTE, `n.md`, `r.0`, `child`)!;
  assert.match(r.text, /texte a1\n\n###\n## B/);
  assert.equal(r.key, `r.0.1`);
});

test(`ajout d'un premier enfant : niveau du parent plus un`, () => {
  const r = addNode(NOTE, `n.md`, `r.1`, `child`)!;
  assert.ok(r.text.endsWith(`texte b\n###\n`));
  assert.equal(r.key, `r.1.0`);
});

test(`frere de la racine : devient un enfant`, () => {
  const r = addNode(NOTE, `n.md`, `r`, `sibling`)!;
  assert.equal(r.key, `r.2`);
  assert.ok(r.text.endsWith(`texte b\n##\n`));
});

test(`ajout en fin de fichier sans retour a la ligne final`, () => {
  const r = addNode(`# T\n## A\ntexte`, `n.md`, `r.0`, `sibling`)!;
  assert.equal(r.text, `# T\n## A\ntexte\n##\n`);
  assert.equal(r.key, `r.1`);
});

test(`note sans titre general : les enfants de la racine sont au niveau 1`, () => {
  assert.equal(newLevel(parseNote(`texte\n`, `n.md`), `r`, `child`), 1);
});

test(`niveau 6 : pas d'enfant possible`, () => {
  assert.equal(addNode(`# T\n###### Six\n`, `n.md`, `r.0`, `child`), null);
});

test(`renommer conserve le niveau et le reste de la note`, () => {
  const r = renameTitle(NOTE, `n.md`, `r.0.0`, `  Nouveau  titre \n`)!;
  assert.equal(r.text, NOTE.replace(`### A1`, `### Nouveau  titre`));
  assert.equal(renameTitle(`texte\n## A\n`, `n.md`, `r`, `x`), null);
  assert.equal(cleanTitle(`a\r\nb`), `a b`);
});

test(`renommer avec un titre vide`, () => {
  const r = renameTitle(NOTE, `n.md`, `r.1`, ``)!;
  assert.match(r.text, /texte a1\n\n##\n\ntexte b/);
});

test(`suppression d'une branche avec descendants`, () => {
  const r = deleteNodes(NOTE, `n.md`, [`r.0`])!;
  assert.equal(r.text, `# Projet\n\nIntro\n\n## B\n\ntexte b\n`);
  assert.equal(r.key, `r`);
});

test(`suppression : selection sur le frere precedent`, () => {
  const r = deleteNodes(NOTE, `n.md`, [`r.1`])!;
  assert.equal(r.text, `# Projet\n\nIntro\n\n## A\n\ntexte a\n\n### A1\n\ntexte a1\n\n`);
  assert.equal(r.key, `r.0`);
});

test(`suppression multiple sans doublon d'ancetre`, () => {
  const r = deleteNodes(NOTE, `n.md`, [`r.0`, `r.0.0`, `r.1`])!;
  assert.equal(r.text, `# Projet\n\nIntro\n\n`);
  assert.equal(nodeByKey(parseNote(r.text, `n.md`), r.key!)?.title, `Projet`);
});

test(`la racine ne se supprime pas`, () => {
  assert.equal(deleteNodes(NOTE, `n.md`, [`r`]), null);
});

test(`rapport de suppression`, () => {
  const rep = describeDeletion(NOTE, `n.md`, [`r.0`]);
  assert.equal(rep.nodes, 1);
  assert.equal(rep.subtitles, 1);
  assert.equal(rep.words, 6);
});

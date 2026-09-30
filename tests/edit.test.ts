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

test(`note sans titre general : les enfants de la racine sont au niveau 2`, () => {
  assert.equal(newLevel(parseNote(`texte\n`, `n.md`), `r`, `child`), 2);
});

test(`note vierge : le premier titre cree est selectionne, pas la racine`, () => {
  const r = addNode(``, `Sans titre.md`, `r`, `child`)!;
  assert.equal(r.text, `##\n`);
  assert.equal(r.key, `r.0`);
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

import { arrowTarget, dropToParentIndex, moveNode, previewMove } from "../src/edit";
import { flattenDoc } from "../src/model";

const TREE = `# Projet\n\n## A\n\ntexte a\n\n### A1\n\ntexte a1\n\n## B\n\ntexte b\n\n### B1\n\n## C\n`;

test(`deplacement au clavier : monter et descendre parmi les freres`, () => {
  const doc = parseNote(TREE, `n.md`);
  assert.deepEqual(arrowTarget(doc, `r.1`, `up`), { parentKey: `r`, index: 0 });
  assert.equal(arrowTarget(doc, `r.0`, `up`), null);
  assert.equal(arrowTarget(doc, `r.2`, `down`), null);
  const r = moveNode(TREE, `n.md`, `r.1`, `r`, 0)!;
  assert.equal(r.text, `# Projet\n\n## B\n\ntexte b\n\n### B1\n\n## A\n\ntexte a\n\n### A1\n\ntexte a1\n\n## C\n`);
  assert.equal(r.key, `r.0`);
});

test(`entrer dans le frere precedent : les niveaux de la branche s'ajustent`, () => {
  const doc = parseNote(TREE, `n.md`);
  assert.deepEqual(arrowTarget(doc, `r.2`, `right`), { parentKey: `r.1`, index: 1 });
  const r = moveNode(TREE, `n.md`, `r.2`, `r.1`, 1)!;
  assert.equal(r.text, `# Projet\n\n## A\n\ntexte a\n\n### A1\n\ntexte a1\n\n## B\n\ntexte b\n\n### B1\n\n### C\n`);
  assert.equal(r.key, `r.1.1`);
});

test(`sortir apres le parent avec sa branche`, () => {
  const doc = parseNote(TREE, `n.md`);
  assert.deepEqual(arrowTarget(doc, `r.0.0`, `left`), { parentKey: `r`, index: 1 });
  const r = moveNode(TREE, `n.md`, `r.0.0`, `r`, 1)!;
  assert.match(r.text, /texte a\n\n## A1\n\ntexte a1\n\n## B/);
  assert.equal(r.key, `r.1`);
  assert.equal(arrowTarget(doc, `r.0`, `left`), null);
});

test(`un titre deplace avec ses descendants change de niveau`, () => {
  const t = `# T\n## A\n### A1\n#### A1a\n## B\n`;
  const r = moveNode(t, `n.md`, `r.0`, `r.1`, 0)!;
  assert.equal(r.text, `# T\n## B\n### A\n#### A1\n##### A1a\n`);
  assert.equal(r.key, `r.0.0`);
});

test(`niveau 6 depasse ou destination dans la branche : refuse`, () => {
  const t = `# T\n## A\n### A1\n#### A1a\n##### A1b\n###### A1c\n## B\n### B1\n`;
  assert.equal(moveNode(t, `n.md`, `r.0`, `r.1`, 1), null);
  assert.equal(moveNode(TREE, `n.md`, `r.0`, `r.0.0`, 0), null);
  assert.equal(moveNode(TREE, `n.md`, `r`, `r.0`, 0), null);
});

test(`deplacement en fin de fichier sans retour a la ligne`, () => {
  const t = `# T\n## A\ntexte\n## B\nfin`;
  const r = moveNode(t, `n.md`, `r.1`, `r`, 0)!;
  assert.equal(r.text, `# T\n## B\nfin\n## A\ntexte\n`);
});

test(`les commentaires de style suivent la branche`, () => {
  const t = `# T\n## A\n%% mmw {"style":{"strokeColor":"#e03131"}} %%\ntexte\n## B\n`;
  const r = moveNode(t, `n.md`, `r.0`, `r`, 1)!;
  assert.equal(r.text, `# T\n## B\n## A\n%% mmw {"style":{"strokeColor":"#e03131"}} %%\ntexte\n`);
});

test(`position de depot : parent et rang`, () => {
  const doc = parseNote(TREE, `n.md`);
  // deplacer C (r.2) : apres A1 (r.0.0) a la profondeur 2 = frere de A1, apres lui
  assert.deepEqual(dropToParentIndex(doc, `r.2`, `r.0.0`, 2, false), { parentKey: `r.0`, index: 1 });
  // apres A1 a la profondeur 1 : frere de A, apres A
  assert.deepEqual(dropToParentIndex(doc, `r.2`, `r.0.0`, 1, false), { parentKey: `r`, index: 1 });
  // apres A1 a la profondeur 3 : enfant de A1
  assert.deepEqual(dropToParentIndex(doc, `r.2`, `r.0.0`, 3, false), { parentKey: `r.0.0`, index: 0 });
  // apres la racine : premier enfant de la racine
  assert.deepEqual(dropToParentIndex(doc, `r.2`, `r`, 1, false), { parentKey: `r`, index: 0 });
  // deplacer A (r.0) apres B (r.1) : rang compte sans A
  assert.deepEqual(dropToParentIndex(doc, `r.0`, `r.1`, 1, false), { parentKey: `r`, index: 1 });
  // case repliee : enfant ajoute apres ses enfants
  assert.deepEqual(dropToParentIndex(doc, `r.2`, `r.1`, 2, true), { parentKey: `r.1`, index: 1 });
  assert.equal(dropToParentIndex(doc, `r.2`, `r.0.0`, 4, false), null);
});

test(`apercu du deplacement : structure et niveaux, sans modifier l'original`, () => {
  const doc = parseNote(TREE, `n.md`);
  const p = previewMove(doc, `r.2`, `r.0`, 0)!;
  assert.equal(p.key, `r.0.0`);
  const flat = flattenDoc(p.doc);
  assert.deepEqual(flat.map((e) => e.node.title), [`Projet`, `A`, `C`, `A1`, `B`, `B1`]);
  assert.equal(flat[2].node.level, 3);
  assert.equal(doc.root.children.length, 3);
  assert.equal(doc.root.children[2].level, 2);
  assert.equal(p.origin.get(flat[2].node), doc.root.children[2]);
});

test(`niveaux irreguliers : le titre deplace reste le frere de celui qui le precede`, () => {
  const t = `# T\n## P\n#### A\n### B\n## Q\n`;
  // Q devient dernier enfant de P : niveau de B (3), pas celui de A (4)
  const r = moveNode(t, `n.md`, `r.1`, `r.0`, 2)!;
  assert.equal(r.text, `# T\n## P\n#### A\n### B\n### Q\n`);
  assert.equal(r.key, `r.0.2`);
});

test(`note qui commence par un titre, sans titre general : deplacement possible`, () => {
  const t = `## A\ntexte\n## B\n`;
  const r = moveNode(t, `n.md`, `r.1`, `r`, 0)!;
  assert.equal(r.text, `## B\n## A\ntexte\n`);
  assert.equal(r.key, `r.0`);
});

// Verification sur des notes tirees au hasard : un deplacement valide n'est jamais refuse, et la note obtenue a la
// structure montree par l'apercu.
test(`deplacements sur des notes aleatoires`, () => {
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (n: number) => Math.floor(rnd() * n);
  let refused = 0;
  let different = 0;
  for (let n = 0; n < 150; n++) {
    const out: string[] = [];
    if (rnd() < 0.3) out.push(`---`, `tags: x`, `---`);
    if (rnd() < 0.5) out.push(`# Racine`, ``);
    const count = 3 + pick(7);
    for (let i = 0; i < count; i++) {
      out.push(`${`#`.repeat(2 + pick(4))} T${i}`);
      if (rnd() < 0.4) out.push(`%% mmw {"style":{"strokeColor":"#e03131"}} %%`);
      if (rnd() < 0.6) out.push(`texte ${i}`);
      if (rnd() < 0.5) out.push(``);
    }
    const text = out.join(`\n`) + (rnd() < 0.5 ? `\n` : ``);
    const doc = parseNote(text, `n.md`);
    const flat = flattenDoc(doc);
    for (const x of flat) {
      if (x.key === `r`) continue;
      for (const q of flat) {
        if (q.key === x.key || q.key.startsWith(x.key + `.`)) continue;
        const others = q.node.children.filter((c) => c !== x.node).length;
        for (let rank = 0; rank <= others; rank++) {
          const pv = previewMove(doc, x.key, q.key, rank);
          const r = moveNode(text, `n.md`, x.key, q.key, rank);
          if (pv === null) continue;
          if (r === null) {
            refused++;
            continue;
          }
          const after = flattenDoc(parseNote(r.text, `n.md`));
          const want = flattenDoc(pv.doc);
          if (after.length !== want.length || !after.every((e, i) => e.node.title === want[i].node.title && e.key === want[i].key)) different++;
        }
      }
    }
  }
  assert.equal(refused, 0);
  assert.equal(different, 0);
});

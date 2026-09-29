import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNote } from "../src/model";
import { buildLayoutTree, computeLayout, flatten, sequential, trunkX, LNode } from "../src/layout";
import { elbowPoints, framePath, resample, rng, trunkBranch, trunkLine } from "../src/sketch";

const NOTE = `# Racine\n## A\n### A1\n### A2\n#### A2a\n## B\n## C\n### C1\n`;

function laidOut(collapsed: Set<string> = new Set()): LNode {
  const doc = parseNote(NOTE, `f.md`);
  const root = buildLayoutTree(doc.root, `r`, 0, collapsed);
  for (const n of flatten(root)) {
    n.w = 100 + n.node.title.length * 4;
    n.h = n.depth === 0 ? 60 : 30;
  }
  computeLayout(root, 1);
  return root;
}

test(`disposition : les enfants sont sous le parent, decales vers la droite`, () => {
  const root = laidOut();
  for (const n of flatten(root)) {
    for (const child of n.children) {
      assert.ok(child.y >= n.y + n.h, `${child.key} n est pas sous ${n.key}`);
      if (n.depth > 0) assert.ok(child.x > trunkX(n), `${child.key} n est pas decale`);
    }
  }
});

test(`disposition : les noeuds de premier niveau sont alignes avec la racine`, () => {
  const root = laidOut();
  for (const child of root.children) assert.equal(child.x, root.x);
});

test(`disposition : aucun chevauchement entre noeuds`, () => {
  const all = flatten(laidOut());
  for (const a of all) {
    for (const b of all) {
      if (a === b) continue;
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!(overlapX && overlapY), `${a.key} chevauche ${b.key}`);
    }
  }
});

test(`disposition : l ordre de la note est respecte de haut en bas`, () => {
  const all = flatten(laidOut());
  for (let i = 1; i < all.length; i++) assert.ok(all[i].y > all[i - 1].y, `${all[i].key} mal place`);
});

test(`disposition : la largeur de la carte reste faible meme avec beaucoup de titres`, () => {
  const lines = [`# R`];
  for (let i = 0; i < 40; i++) lines.push(`## Titre ${i}`, `### Sous-titre ${i}`, `#### Detail ${i}`);
  const doc = parseNote(lines.join(`\n`) + `\n`, `f.md`);
  const root = buildLayoutTree(doc.root, `r`, 0, new Set());
  for (const n of flatten(root)) {
    n.w = 120;
    n.h = 30;
  }
  const b = computeLayout(root, 1);
  assert.ok(b.maxX - b.minX < 400, `carte trop large : ${b.maxX - b.minX}`);
});

test(`branche repliee : ses descendants disparaissent de la disposition`, () => {
  const root = laidOut(new Set([`r.0`]));
  const keys = flatten(root).map((n) => n.key);
  assert.ok(keys.includes(`r.0`));
  assert.ok(!keys.includes(`r.0.0`));
  assert.ok(root.children[0].collapsed);
});

test(`navigation : noeud precedent et suivant dans l ordre d affichage`, () => {
  const list = flatten(laidOut());
  const byKey = (k: string): LNode => list.find((n) => n.key === k)!;
  assert.equal(sequential(list, byKey(`r`), `down`)?.key, `r.0`);
  assert.equal(sequential(list, byKey(`r.0`), `down`)?.key, `r.0.0`);
  assert.equal(sequential(list, byKey(`r.0.1`), `up`)?.key, `r.0.0`);
  assert.equal(sequential(list, byKey(`r`), `up`), null);
  assert.equal(sequential(list, list[list.length - 1], `down`), null);
});

test(`trait de crayon : stable d un affichage a l autre et extremites conservees`, () => {
  const a = trunkLine(`sketch`, 0, 0, 100, `graine`);
  const b = trunkLine(`sketch`, 0, 0, 100, `graine`);
  const c = trunkLine(`sketch`, 0, 0, 100, `autre`);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a!.startsWith(`M 0.0 0.0`));
  assert.ok(a!.endsWith(`0.0 100.0`));
  assert.ok(trunkBranch(`sketch`, 10, 0, 90, 80, `t`).endsWith(`90.0 80.0`));
  assert.equal(trunkLine(`curve`, 0, 0, 100, `x`), null);
});

test(`outils de trace : nombres valides et formes attendues`, () => {
  const pts = elbowPoints(0, 0, 100, 60, 26, 12);
  assert.ok(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.deepEqual(pts[0], { x: 0, y: 0 });
  assert.deepEqual(pts[pts.length - 1], { x: 100, y: 60 });
  assert.equal(elbowPoints(0, 0, 100, 0, 26, 12).length, 2);
  assert.equal(resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 25, false).length, 5);
  const r = rng(`x`);
  const v = r();
  assert.ok(v >= 0 && v < 1);
  assert.equal(framePath(`none`, 0, 0, 10, 10, `k`, false), null);
  assert.equal(framePath(`straight`, 0, 0, 10, 10, `k`, false)?.kind, `rect`);
  assert.equal(framePath(`sketch`, 0, 0, 80, 30, `k`, false)?.kind, `path`);
});

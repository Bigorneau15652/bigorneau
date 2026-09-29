import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNote } from "../src/model";
import { buildLayoutTree, computeLayout, flatten, neighbor, LNode } from "../src/layout";
import { childLink, elbowPoints, framePath, resample, rng, trunkBranch } from "../src/sketch";

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

test(`disposition : un noeud est centre sur ses enfants`, () => {
  const root = laidOut();
  for (const n of flatten(root)) {
    if (n.depth === 0 || n.children.length === 0) continue;
    const first = n.children[0];
    const last = n.children[n.children.length - 1];
    const mid = (first.y + first.h / 2 + last.y + last.h / 2) / 2;
    assert.ok(Math.abs(n.y + n.h / 2 - mid) < 0.001, `noeud ${n.key} mal centre`);
  }
});

test(`disposition : aucun chevauchement entre noeuds de meme colonne`, () => {
  const root = laidOut();
  const all = flatten(root);
  for (const a of all) {
    for (const b of all) {
      if (a === b) continue;
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!(overlapX && overlapY), `${a.key} chevauche ${b.key}`);
    }
  }
});

test(`disposition : les enfants sont a droite du parent et dans l ordre de la note`, () => {
  const root = laidOut();
  for (const n of flatten(root)) {
    for (let i = 0; i < n.children.length; i++) {
      assert.ok(n.children[i].x > n.x + (n.depth === 0 ? 0 : n.w));
      if (i > 0) assert.ok(n.children[i].y > n.children[i - 1].y);
    }
  }
});

test(`branche repliee : ses descendants disparaissent de la disposition`, () => {
  const root = laidOut(new Set([`r.0`]));
  const keys = flatten(root).map((n) => n.key);
  assert.ok(keys.includes(`r.0`));
  assert.ok(!keys.includes(`r.0.0`));
  assert.ok(root.children[0].collapsed);
});

test(`navigation : voisin de meme niveau`, () => {
  const root = laidOut();
  const list = flatten(root);
  const byKey = (k: string): LNode => list.find((n) => n.key === k)!;
  assert.equal(neighbor(list, byKey(`r.0`), `down`)?.key, `r.1`);
  assert.equal(neighbor(list, byKey(`r.1`), `up`)?.key, `r.0`);
  assert.equal(neighbor(list, byKey(`r.2`), `down`), null);
  assert.equal(neighbor(list, byKey(`r.0.1`), `up`)?.key, `r.0.0`);
});

test(`trait de crayon : stable d un affichage a l autre et extremites conservees`, () => {
  const a = childLink(`sketch`, 0, 0, 100, 50, `graine`);
  const b = childLink(`sketch`, 0, 0, 100, 50, `graine`);
  const c = childLink(`sketch`, 0, 0, 100, 50, `autre`);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith(`M 0.0 0.0`));
  assert.ok(a.endsWith(`100.0 50.0`));
  assert.ok(trunkBranch(`sketch`, 10, 0, 90, 80, `t`).endsWith(`90.0 80.0`));
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

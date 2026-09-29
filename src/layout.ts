// Calcul de la position des noeuds de la carte (fonctions pures, sans acces au DOM).
import type { MmNode } from "./model";

export interface LNode {
  key: string;
  node: MmNode;
  depth: number;
  parent: LNode | null;
  children: LNode[];
  hasChildren: boolean;
  collapsed: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function buildLayoutTree(
  node: MmNode,
  key: string,
  depth: number,
  collapsed: Set<string>,
  parent: LNode | null = null
): LNode {
  const hasChildren = node.children.length > 0;
  const isCollapsed = depth > 0 && hasChildren && collapsed.has(key);
  const ln: LNode = {
    key,
    node,
    depth,
    parent,
    children: [],
    hasChildren,
    collapsed: isCollapsed,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
  if (!isCollapsed) {
    ln.children = node.children.map((c, i) => buildLayoutTree(c, `${key}.${i}`, depth + 1, collapsed, ln));
  }
  return ln;
}

export function flatten(root: LNode): LNode[] {
  const out: LNode[] = [];
  const walk = (n: LNode): void => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

function shift(n: LNode, dy: number): void {
  n.y += dy;
  n.children.forEach((c) => shift(c, dy));
}

// Les tailles (w, h) doivent etre renseignees avant l'appel. La racine est placee en (0, 0),
// une ligne verticale part de son centre et les noeuds de premier niveau sont empiles dessous.
// Les enfants d'un noeud sont places a sa droite, le noeud etant centre sur ses enfants.
export function computeLayout(root: LNode, compact: number): Bounds {
  const c = compact;
  const hGap = 48 * c;
  const vGap = 14 * c;
  const vGapTop = 34 * c;
  const rootGap = 56 * c;
  const branchOffset = 90 * c;

  const place = (n: LNode, x: number, top: number): { top: number; bottom: number } => {
    n.x = x;
    if (n.children.length === 0) {
      n.y = top;
      return { top, bottom: top + n.h };
    }
    const gap = n.depth === 0 ? vGapTop : vGap;
    let cursor = top;
    for (const child of n.children) {
      const r = place(child, x + n.w + hGap, cursor);
      if (r.top < cursor) {
        const d = cursor - r.top;
        shift(child, d);
        r.top += d;
        r.bottom += d;
      }
      cursor = r.bottom + gap;
    }
    const first = n.children[0];
    const last = n.children[n.children.length - 1];
    const center = (first.y + first.h / 2 + last.y + last.h / 2) / 2;
    n.y = center - n.h / 2;
    return { top: Math.min(top, n.y), bottom: Math.max(cursor - gap, n.y + n.h) };
  };

  root.x = 0;
  root.y = 0;
  const lineX = root.w / 2;
  let cursor = root.h + rootGap;
  for (const child of root.children) {
    const r = place(child, lineX + branchOffset, cursor);
    if (r.top < cursor) {
      const d = cursor - r.top;
      shift(child, d);
      r.bottom += d;
    }
    cursor = r.bottom + vGapTop;
  }

  const all = flatten(root);
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of all) {
    b.minX = Math.min(b.minX, n.x);
    b.minY = Math.min(b.minY, n.y);
    b.maxX = Math.max(b.maxX, n.x + n.w);
    b.maxY = Math.max(b.maxY, n.y + n.h);
  }
  return b;
}

// Noeud voisin de meme niveau, dans l'ordre d'affichage.
export function neighbor(list: LNode[], cur: LNode, dir: `up` | `down`): LNode | null {
  const step = dir === `up` ? -1 : 1;
  for (let j = list.indexOf(cur) + step; j >= 0 && j < list.length; j += step) {
    if (list[j].depth === cur.depth) return list[j];
  }
  return null;
}

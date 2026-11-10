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

// La cascade des titres ne doit pas s'etaler vers la droite : la ligne verticale part pres du bord gauche de la
// case, et chaque niveau n'est decale que de peu (cette distance est multipliee par la compacite).
const TRUNK_MAX = 22;
const INDENT = 20;

export function childIndent(compact: number): number {
  return INDENT * compact;
}

// Abscisse de la ligne verticale d'ou partent les enfants d'un noeud.
export function trunkX(n: LNode): number {
  return n.x + Math.min(n.w / 2, TRUNK_MAX);
}

// Les tailles (w, h) doivent etre renseignees avant l'appel. La racine est placee en (0, 0).
// Les noeuds de premier niveau sont empiles sous la racine, alignes a gauche. Les enfants d'un
// noeud sont empiles sous lui, decales vers la droite, ce qui garde la carte etroite.
export function computeLayout(root: LNode, compact: number): Bounds {
  const c = compact;
  const vGap = 16 * c;
  const vGapTop = 26 * c;
  const rootGap = 30 * c;
  const indent = childIndent(c);

  // Place le sous-arbre et renvoie l'ordonnee de son bord inferieur.
  const place = (n: LNode, x: number, y: number): number => {
    n.x = x;
    n.y = y;
    let bottom = y + n.h;
    if (n.children.length > 0) {
      const childX = n.depth === 0 ? x : trunkX(n) + indent;
      const gap = n.depth === 0 ? vGapTop : vGap;
      let cursor = bottom + (n.depth === 0 ? rootGap : vGap);
      for (const child of n.children) {
        bottom = place(child, childX, cursor);
        cursor = bottom + gap;
      }
    }
    return bottom;
  };
  place(root, 0, 0);

  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of flatten(root)) {
    b.minX = Math.min(b.minX, n.x);
    b.minY = Math.min(b.minY, n.y);
    b.maxX = Math.max(b.maxX, n.x + n.w);
    b.maxY = Math.max(b.maxY, n.y + n.h);
  }
  return b;
}

// Retrait d'un niveau dans la vue Liste (en pixels, multiplie par la compacite), et ecart entre deux lignes.
export const LIST_INDENT = 22;

export function listIndent(compact: number): number {
  return Math.round(LIST_INDENT * Math.max(0.6, compact));
}

// Vue Liste : les titres visibles sont empiles, un par ligne, decales vers la droite selon leur niveau, sans trait. Les
// hauteurs (h) doivent etre renseignees avant l'appel ; la largeur est celle de la ligne.
export function computeListLayout(root: LNode, indent: number, width: number, gap = 2): Bounds {
  let y = 0;
  const b: Bounds = { minX: 0, minY: 0, maxX: width, maxY: 0 };
  for (const n of flatten(root)) {
    n.x = n.depth * indent;
    n.y = y;
    n.w = Math.max(40, width - n.x);
    y += n.h + gap;
    b.maxY = n.y + n.h;
  }
  return b;
}

// Noeud precedent ou suivant dans l'ordre d'affichage (racine comprise).
export function sequential(list: LNode[], cur: LNode, dir: `up` | `down`): LNode | null {
  const i = list.indexOf(cur) + (dir === `up` ? -1 : 1);
  return i >= 0 && i < list.length ? list[i] : null;
}

// Vertical places of the boxes of the linked notes, drawn at the left of the map. `groups` holds, for each title of the map, the height
// of its middle and the heights of its boxes. The boxes of a title are centred on it; a group that would overlap the one above it is
// pushed down, so that two boxes never lie on each other. Returns the top of each box, group by group, in the order of `groups`.
export function stackBoxes(groups: { middle: number; heights: number[] }[], gap: number): number[][] {
  const tops: number[][] = groups.map(() => []);
  const order = groups.map((_g, i) => i).sort((a, b) => groups[a].middle - groups[b].middle || a - b);
  let floor = -Infinity;
  for (const i of order) {
    const { middle, heights } = groups[i];
    if (heights.length === 0) continue;
    const total = heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1);
    let top = Math.max(middle - total / 2, floor);
    for (const h of heights) {
      tops[i].push(top);
      top += h + gap;
    }
    floor = top;
  }
  return tops;
}

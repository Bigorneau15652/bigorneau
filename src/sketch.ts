// Trace des cadres et des branches : trait de crayon (leger tremblement, stable d'un affichage
// a l'autre), courbe, angle ou droit.
import type { BranchStyle, FrameStyle } from "./settings";

export interface Pt {
  x: number;
  y: number;
}

const WOBBLE = 0.45;

function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number): string => n.toFixed(1);

export function resample(pts: Pt[], step: number, closed: boolean): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts;
  const cum: number[] = [0];
  for (let i = 1; i < src.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return [pts[0]];
  const n = Math.max(closed ? 4 : 1, Math.round(total / step));
  const count = closed ? n : n + 1;
  const out: Pt[] = [];
  let seg = 1;
  for (let k = 0; k < count; k++) {
    const d = (total * k) / n;
    while (seg < cum.length - 1 && cum[seg] < d) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const t = (d - cum[seg - 1]) / span;
    out.push({
      x: src[seg - 1].x + (src[seg].x - src[seg - 1].x) * t,
      y: src[seg - 1].y + (src[seg].y - src[seg - 1].y) * t,
    });
  }
  return out;
}

export function wobble(pts: Pt[], rnd: () => number, amp: number, closed: boolean): Pt[] {
  const n = pts.length;
  return pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return p;
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = (rnd() * 2 - 1) * amp;
    return { x: p.x - (dy / len) * off, y: p.y + (dx / len) * off };
  });
}

// Passe une courbe lisse par tous les points (Catmull-Rom converti en Bezier).
export function smoothPath(pts: Pt[], closed: boolean): string {
  const n = pts.length;
  if (n === 0) return ``;
  if (n === 1) return `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.min(Math.max(i, 0), n - 1)]);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return closed ? d + ` Z` : d;
}

function polyPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? `M` : `L`} ${f(p.x)} ${f(p.y)}`).join(` `);
}

const ARC_STEPS = 7;

// Coude arrondi : horizontale, verticale le long de x = sx, puis horizontale.
export function elbowPoints(x1: number, y1: number, x2: number, y2: number, sx: number, r: number): Pt[] {
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const dir = dy > 0 ? 1 : -1;
  const rr = Math.max(0, Math.min(r, Math.abs(dy) / 2, sx - x1, x2 - sx));
  const pts: Pt[] = [{ x: x1, y: y1 }];
  const c1 = { x: sx - rr, y: y1 + dir * rr };
  for (let k = 0; k <= ARC_STEPS; k++) {
    const t = (k / ARC_STEPS) * (Math.PI / 2);
    pts.push({ x: c1.x + rr * Math.sin(t), y: c1.y - dir * rr * Math.cos(t) });
  }
  const c2 = { x: sx + rr, y: y2 - dir * rr };
  for (let k = 0; k <= ARC_STEPS; k++) {
    const t = (k / ARC_STEPS) * (Math.PI / 2);
    pts.push({ x: c2.x - rr * Math.cos(t), y: c2.y + dir * rr * Math.sin(t) });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

// Lien d'un noeud vers un de ses enfants : (x1,y1) milieu du bord droit du parent,
// (x2,y2) milieu du bord gauche de l'enfant.
export function childLink(style: BranchStyle, x1: number, y1: number, x2: number, y2: number, seed: string): string {
  if (style === `straight`) return `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)}`;
  if (style === `curve`) {
    const mx = (x1 + x2) / 2;
    return `M ${f(x1)} ${f(y1)} C ${f(mx)} ${f(y1)} ${f(mx)} ${f(y2)} ${f(x2)} ${f(y2)}`;
  }
  const sx = x1 + Math.min(26, (x2 - x1) / 2);
  const pts = elbowPoints(x1, y1, x2, y2, sx, 12);
  if (style === `elbow`) return polyPath(pts);
  const rnd = rng(seed);
  return smoothPath(wobble(resample(pts, 10, false), rnd, WOBBLE * 0.7, false), false);
}

export function trunkRadius(ly0: number, y2: number, lx: number, x2: number): number {
  return Math.max(0, Math.min(24, y2 - ly0, x2 - lx));
}

// Ligne verticale issue du noeud racine (styles crayon et angle uniquement).
export function trunkLine(style: BranchStyle, x: number, y1: number, y2: number, seed: string): string | null {
  if (style === `curve` || style === `straight`) return null;
  if (style === `elbow`) return `M ${f(x)} ${f(y1)} L ${f(x)} ${f(y2)}`;
  const pts = resample([{ x, y: y1 }, { x, y: y2 }], 40, false);
  return smoothPath(wobble(pts, rng(seed), WOBBLE, false), false);
}

// Branche entre la ligne verticale du noeud racine et un noeud de premier niveau.
export function trunkBranch(style: BranchStyle, lx: number, ly0: number, x2: number, y2: number, seed: string): string {
  if (style === `straight`) return `M ${f(lx)} ${f(ly0)} L ${f(x2)} ${f(y2)}`;
  if (style === `curve`) {
    const cx = lx + (x2 - lx) * 0.35;
    return `M ${f(lx)} ${f(ly0)} C ${f(lx)} ${f(y2)} ${f(cx)} ${f(y2)} ${f(x2)} ${f(y2)}`;
  }
  const r = trunkRadius(ly0, y2, lx, x2);
  const pts: Pt[] = [];
  const c = { x: lx + r, y: y2 - r };
  for (let k = 0; k <= ARC_STEPS; k++) {
    const t = (k / ARC_STEPS) * (Math.PI / 2);
    pts.push({ x: c.x - r * Math.cos(t), y: c.y + r * Math.sin(t) });
  }
  pts.push({ x: x2, y: y2 });
  if (style === `elbow`) return polyPath(pts);
  return smoothPath(wobble(resample(pts, 8, false), rng(seed), WOBBLE * 0.6, false), false);
}

export type FrameShape = { kind: `path`; d: string } | { kind: `rect`; rx: number } | null;

export function framePath(style: FrameStyle, x: number, y: number, w: number, h: number, seed: string, isRoot: boolean): FrameShape {
  if (style === `none`) return null;
  if (style === `straight`) return { kind: `rect`, rx: 0 };
  if (style === `rounded`) return { kind: `rect`, rx: isRoot ? 4 : Math.min(10, h / 2) };
  const r = Math.min(isRoot ? 9 : 8, h / 2);
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number): void => {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  const amp = isRoot ? 0.45 : 0.3;
  const sampled = resample(pts, 9, true);
  return { kind: `path`, d: smoothPath(wobble(sampled, rng(seed), amp, true), true) };
}

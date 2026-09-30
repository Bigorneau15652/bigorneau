// Trace des fleches de lien entre deux cases : droite ou courbe, du bord d'une case au bord de l'autre.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pt {
  x: number;
  y: number;
}

const round = (n: number): number => Math.round(n * 10) / 10;

// Point du bord de la case, sur la droite qui va de son centre vers (tx, ty).
export function edgePoint(box: Box, tx: number, ty: number, gap = 0): Pt {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  const len = Math.hypot(dx, dy);
  const extra = gap / len;
  return { x: cx + dx * (s + extra), y: cy + dy * (s + extra) };
}

// Trace de la fleche : `curved` donne une courbe qui s'ecarte vers la droite, sinon une droite.
export function linkPath(a: Box, b: Box, curved: boolean): string {
  const c1: Pt = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const c2: Pt = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (!curved) {
    // Cases l'une au-dessus de l'autre : le trait part du bord droit de chacune, pour ne pas traverser les cases voisines.
    if (Math.abs(c2.x - c1.x) < (a.w + b.w) / 2) {
      const ay = c1.y;
      const by = c2.y;
      return `M ${round(a.x + a.w + 2)} ${round(ay)} L ${round(b.x + b.w + 3)} ${round(by)}`;
    }
    const p1 = edgePoint(a, c2.x, c2.y, 2);
    const p2 = edgePoint(b, c1.x, c1.y, 3);
    return `M ${round(p1.x)} ${round(p1.y)} L ${round(p2.x)} ${round(p2.y)}`;
  }
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx < 0 || (nx === 0 && ny < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(120, Math.max(36, len * 0.22));
  const cp: Pt = { x: (c1.x + c2.x) / 2 + nx * bulge, y: (c1.y + c2.y) / 2 + ny * bulge };
  const p1 = edgePoint(a, cp.x, cp.y, 2);
  const p2 = edgePoint(b, cp.x, cp.y, 3);
  return `M ${round(p1.x)} ${round(p1.y)} Q ${round(cp.x)} ${round(cp.y)} ${round(p2.x)} ${round(p2.y)}`;
}

// Export de haute qualite : formules mathematiques. MathJax (le moteur d'Obsidian) dessine chaque formule en SVG ; ce module lit
// ce dessin et le ramene a un contour unique (une suite de segments et de courbes, en milliemes d'em), que le PDF reprend tel
// quel en vectoriel et que l'apercu affiche. Ce module ne depend pas d'Obsidian : il se teste avec node --test.

// Formule prete a etre placee. Largeur, hauteur au-dessus de la ligne de base (ascent) et sous elle (descent) sont en milliemes
// d'em ; `d` est le contour (commandes M, L, C et Z, ordonnees vers le bas, ligne de base a 0), dans la meme unite.
export interface MathAsset {
  tex: string;
  display: boolean;
  width: number;
  ascent: number;
  descent: number;
  d: string;
}

export const mathKey = (tex: string, display: boolean): string => `${display ? `D` : `I`}:${tex}`;

// Formules ecrites dans un texte : $...$ (le premier $ n'est pas suivi d'une espace, le dernier n'est pas precede d'une espace
// ni suivi d'un chiffre, comme dans Obsidian) et $$...$$ dans un paragraphe.
export const INLINE_MATH_RE = /\$\$([^$]+?)\$\$|(?<![\\$])\$(?![\s$])([^$\n]+?)(?<![\s\\])\$(?!\d)/g;

export function inlineMathOf(text: string): string[] {
  const out: string[] = [];
  const clean = text.replace(/`[^`]*`/g, ``);
  for (const m of clean.matchAll(INLINE_MATH_RE)) out.push((m[1] ?? m[2]).trim());
  return out;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

// Produit a . b : on applique b d'abord, puis a.
function mul(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function parseTransform(s: string | undefined): Matrix {
  let m = IDENTITY;
  if (!s) return m;
  for (const t of s.matchAll(/(translate|scale|matrix)\(([^)]*)\)/g)) {
    const n = t[2].split(/[\s,]+/).filter((x) => x !== ``).map(Number);
    if (t[1] === `translate`) m = mul(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    else if (t[1] === `scale`) m = mul(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
    else if (n.length === 6) m = mul(m, n as Matrix);
  }
  return m;
}

const fmt = (n: number): string => {
  const s = (Math.round(n * 100) / 100).toString();
  return s === `-0` ? `0` : s;
};

// Contour d'un dessin SVG (commandes M L H V C S Q T A Z, absolues ou relatives) transforme par `m` et ecrit avec M, L, C, Z.
function transformPath(d: string, m: Matrix): string {
  const out: string[] = [];
  const pt = (x: number, y: number): string => `${fmt(m[0] * x + m[2] * y + m[4])} ${fmt(m[1] * x + m[3] * y + m[5])}`;
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = ``;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  // Dernier point de controle (pour les commandes S et T), et sorte de la commande precedente.
  let cx = 0;
  let cy = 0;
  let prev = ``;
  const next = (): number => Number(tokens[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number): void => {
    out.push(`C ${pt(x1, y1)} ${pt(x2, y2)} ${pt(ex, ey)}`);
    cx = x2;
    cy = y2;
    x = ex;
    y = ey;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === `M`) cmd = `L`;
    else if (cmd === `m`) cmd = `l`;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const up = cmd.toUpperCase();
    if (up === `Z`) {
      out.push(`Z`);
      x = sx;
      y = sy;
    } else if (up === `M`) {
      x = ox + next();
      y = oy + next();
      sx = x;
      sy = y;
      out.push(`M ${pt(x, y)}`);
    } else if (up === `L`) {
      x = ox + next();
      y = oy + next();
      out.push(`L ${pt(x, y)}`);
    } else if (up === `H`) {
      x = ox + next();
      out.push(`L ${pt(x, y)}`);
    } else if (up === `V`) {
      y = oy + next();
      out.push(`L ${pt(x, y)}`);
    } else if (up === `C`) {
      const x1 = ox + next();
      const y1 = oy + next();
      const x2 = ox + next();
      const y2 = oy + next();
      cubic(x1, y1, x2, y2, ox + next(), oy + next());
    } else if (up === `S`) {
      const x1 = prev === `C` || prev === `S` ? 2 * x - cx : x;
      const y1 = prev === `C` || prev === `S` ? 2 * y - cy : y;
      const x2 = ox + next();
      const y2 = oy + next();
      cubic(x1, y1, x2, y2, ox + next(), oy + next());
    } else if (up === `Q` || up === `T`) {
      let qx: number;
      let qy: number;
      if (up === `Q`) {
        qx = ox + next();
        qy = oy + next();
      } else {
        qx = prev === `Q` || prev === `T` ? 2 * x - cx : x;
        qy = prev === `Q` || prev === `T` ? 2 * y - cy : y;
      }
      const ex = ox + next();
      const ey = oy + next();
      // Courbe quadratique ramenee a une courbe cubique.
      const x1 = x + (2 / 3) * (qx - x);
      const y1 = y + (2 / 3) * (qy - y);
      const x2 = ex + (2 / 3) * (qx - ex);
      const y2 = ey + (2 / 3) * (qy - ey);
      cubic(x1, y1, x2, y2, ex, ey);
      cx = qx;
      cy = qy;
    } else if (up === `A`) {
      // Arc : approche par un segment jusqu'a son point d'arrivee (MathJax n'en produit pas pour les formules courantes).
      i += 5;
      x = ox + next();
      y = oy + next();
      out.push(`L ${pt(x, y)}`);
    } else {
      break;
    }
    prev = up;
  }
  return out.join(` `);
}

interface Tag {
  closing: boolean;
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
}

function* tags(svg: string): Generator<Tag> {
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  for (const m of svg.matchAll(re)) {
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) attrs[a[1]] = a[2] ?? a[3] ?? ``;
    yield { closing: m[1] === `/`, name: m[2], attrs, selfClosing: m[4] === `/` };
  }
}

// Lit le SVG d'une formule produit par MathJax. Renvoie null si ce n'est pas un dessin lisible, ou si MathJax signale une erreur
// de syntaxe dans la formule.
export function parseMathSvg(svg: string, tex: string, display: boolean): MathAsset | null {
  if (/data-mml-node="merror"|<mjx-merror|data-mjx-error/.test(svg)) return null;
  const glyphs = new Map<string, string>();
  const stack: { m: Matrix; defs: boolean }[] = [];
  const parts: string[] = [];
  let width = 0;
  let ascent = 0;
  let descent = 0;
  let root = false;
  for (const t of tags(svg)) {
    if (t.closing) {
      if (![`mjx-container`, `title`, `desc`].includes(t.name)) stack.pop();
      continue;
    }
    const top = stack[stack.length - 1] ?? { m: IDENTITY, defs: false };
    const push = (m: Matrix, defs = top.defs): void => {
      if (!t.selfClosing) stack.push({ m, defs });
    };
    if (t.name === `svg`) {
      const vb = (t.attrs.viewBox ?? ``).split(/[\s,]+/).map(Number);
      if (!root) {
        root = true;
        if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) return null;
        width = vb[2];
        ascent = Math.max(0, -vb[1]);
        descent = Math.max(0, vb[1] + vb[3]);
        push(mul(IDENTITY, [1, 0, 0, 1, -vb[0], 0]));
      } else {
        // Dessin imbrique (delimiteur extensible) : place en (x, y), mis a l'echelle de sa boite.
        const x = Number(t.attrs.x ?? 0);
        const y = Number(t.attrs.y ?? 0);
        const w = Number(t.attrs.width);
        const h = Number(t.attrs.height);
        let m = mul(top.m, [1, 0, 0, 1, x, y]);
        if (vb.length === 4 && w > 0 && h > 0 && vb[2] > 0 && vb[3] > 0) m = mul(m, [w / vb[2], 0, 0, h / vb[3], (-vb[0] * w) / vb[2], (-vb[1] * h) / vb[3]]);
        push(m);
      }
    } else if (t.name === `defs`) {
      push(top.m, true);
    } else if (t.name === `g`) {
      push(mul(top.m, parseTransform(t.attrs.transform)));
    } else if (t.name === `path`) {
      if (top.defs) {
        if (t.attrs.id) glyphs.set(t.attrs.id, t.attrs.d ?? ``);
      } else if (t.attrs.d) parts.push(transformPath(t.attrs.d, mul(top.m, parseTransform(t.attrs.transform))));
      if (!t.selfClosing) stack.push(top);
    } else if (t.name === `use` && !top.defs) {
      const id = (t.attrs[`xlink:href`] ?? t.attrs.href ?? ``).replace(/^#/, ``);
      const d = glyphs.get(id);
      const m = mul(mul(top.m, [1, 0, 0, 1, Number(t.attrs.x ?? 0), Number(t.attrs.y ?? 0)]), parseTransform(t.attrs.transform));
      if (d) parts.push(transformPath(d, m));
      if (!t.selfClosing) stack.push(top);
    } else if (t.name === `rect` && !top.defs) {
      const x = Number(t.attrs.x ?? 0);
      const y = Number(t.attrs.y ?? 0);
      const w = Number(t.attrs.width);
      const h = Number(t.attrs.height);
      // Les fonds (data-background) ne sont pas dessines ; les filets (barre de fraction, radical) le sont.
      if (t.attrs[`data-background`] === undefined && w > 0 && h > 0) parts.push(transformPath(`M${x} ${y}H${x + w}V${y + h}H${x}Z`, mul(top.m, parseTransform(t.attrs.transform))));
      if (!t.selfClosing) stack.push(top);
    } else if (!t.selfClosing && ![`mjx-container`, `title`, `desc`].includes(t.name)) {
      // Autre element avec contenu (text, title...) : ignore, mais sa fermeture doit equilibrer la pile.
      stack.push(top);
    }
  }
  if (!root || width <= 0 || parts.length === 0) return null;
  return { tex, display, width: Math.round(width * 100) / 100, ascent: Math.round(ascent * 100) / 100, descent: Math.round(descent * 100) / 100, d: parts.join(` `) };
}

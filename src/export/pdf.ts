// Export de haute qualite, etage 7 : ecriture du PDF (PDF 1.7) a partir des pages composees.
// Le fichier est ecrit directement, sans bibliotheque : polices OpenType incorporees (Libertinus Serif et Mono, contours CFF), texte reel
// et copiable (table ToUnicode, ligatures comprises), signets hierarchiques qui reprennent les titres, liens web cliquables,
// metadonnees. Chaque ligne est placee a la position que calcule la composition, comme dans l'apercu.
import { BulletShape } from "../bullets";
import { fontFor, resolvedVariant, userStyle, FontStyle, parseUserStyle, variantOf } from "./font-metrics";
import { ImageAsset } from "./image";
import { OpenTypeFont } from "./font";
import type { DecorLeaf } from "./page-decor";
import { LineRun, SUP_SCALE } from "./paragraph";
import { columnsOf, FOOTNOTE_RULE_HEIGHT, Page } from "./paginate";
import { PageSetup, Row } from "./typeset";

export interface PdfOptions {
  title: string;
  author?: string;
  // Langue du document (fr-FR, en-GB).
  language: string;
  creator: string;
  created: Date;
  // Compression des flux (Flate). Absente : flux non compresses, utile pour les tests.
  deflate?: (data: Uint8Array) => Promise<Uint8Array>;
  // Images des figures, par cible.
  images?: Map<string, ImageAsset>;
}

const encoder = new TextEncoder();

// Ecrit des morceaux d'octets bout a bout et memorise la position de chaque objet.
class Writer {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(data: string | Uint8Array): void {
    const bytes = typeof data === `string` ? encoder.encode(data) : data;
    this.chunks.push(bytes);
    this.length += bytes.length;
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

const num = (n: number): string => {
  const s = n.toFixed(3);
  return s.includes(`.`) ? s.replace(/0+$/, ``).replace(/\.$/, ``) : s;
};

// Puce dessinee (disque, carre, losange, pleins ou vides) : `x` est le bord gauche de la puce, `y` la ligne de base dans le repere du PDF
// (origine en bas). La forme est centree a la hauteur des minuscules, et sa taille suit celle du texte.
function bulletOps(shape: BulletShape, x: number, y: number, fontSize: number, color: string | undefined): string {
  const diamond = shape === `diamond` || shape === `diamondOpen`;
  const filled = shape === `disc` || shape === `square` || shape === `diamond`;
  const line = Math.max(0.5, fontSize * 0.06);
  const outer = (fontSize * (diamond ? 0.46 : 0.36)) / 2;
  // Une forme vide est tracee a l'interieur de sa boite : le trait est rentre de la moitie de son epaisseur.
  const r = filled ? outer : outer - line / 2;
  const cx = x + 0.12 * fontSize + outer;
  const cy = y + 0.3 * fontSize;
  let path: string;
  if (shape === `disc` || shape === `circle`) {
    // Cercle en quatre courbes de Bezier.
    const k = 0.5523 * r;
    const p = (dx: number, dy: number): string => `${num(cx + dx)} ${num(cy + dy)}`;
    path = `${p(r, 0)} m ${p(r, k)} ${p(k, r)} ${p(0, r)} c ${p(-k, r)} ${p(-r, k)} ${p(-r, 0)} c ${p(-r, -k)} ${p(-k, -r)} ${p(0, -r)} c ${p(k, -r)} ${p(r, -k)} ${p(r, 0)} c h`;
  } else if (diamond) {
    path = `${num(cx)} ${num(cy + r)} m ${num(cx + r)} ${num(cy)} l ${num(cx)} ${num(cy - r)} l ${num(cx - r)} ${num(cy)} l h`;
  } else {
    path = `${num(cx - r)} ${num(cy - r)} ${num(2 * r)} ${num(2 * r)} re`;
  }
  if (filled) return `q ${color ? `${color} rg ` : ``}${path} f Q`;
  return `q ${color ? `${color} RG ` : ``}${num(line)} w ${path} S Q`;
}

// Chaine PDF : en ASCII simple entre parentheses, sinon en UTF-16BE avec marque d'ordre.
function pdfText(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = `FEFF`;
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, `0`);
  return `<${hex}>`;
}

// Contour d'une formule (M, L, C, Z) en operateurs PDF.
function mathOps(d: string): string {
  const t = d.split(` `);
  const out: string[] = [];
  for (let i = 0; i < t.length; ) {
    const c = t[i++];
    if (c === `M`) out.push(`${t[i++]} ${t[i++]} m`);
    else if (c === `L`) out.push(`${t[i++]} ${t[i++]} l`);
    else if (c === `C`) out.push(`${t.slice(i, i + 6).join(` `)} c`), (i += 6);
    else if (c === `Z`) out.push(`h`);
  }
  return out.join(` `);
}

// Couleur #rrggbb en trois nombres entre 0 et 1, comme les attend un operateur de couleur PDF.
const hexOperands = (hex: string): string => {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return n.map((v) => num(v)).join(` `);
};

// Contour d'une forme (cercle, carre, carre aux coins arrondis) dont le coin bas gauche est (x, y), en coordonnees PDF.
const shapePath = (shape: `circle` | `square` | `rounded`, x: number, y: number, w: number, h: number): string => {
  if (shape === `square`) return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
  // Cercle ou coins arrondis : quatre courbes de Bezier (constante 0,5523 pour un quart de cercle).
  const r = shape === `circle` ? Math.min(w, h) / 2 : Math.min(w, h) * 0.22;
  const k = 0.5523 * r;
  const x2 = x + w;
  const y2 = y + h;
  return [
    `${num(x + r)} ${num(y)} m`,
    `${num(x2 - r)} ${num(y)} l`,
    `${num(x2 - r + k)} ${num(y)} ${num(x2)} ${num(y + r - k)} ${num(x2)} ${num(y + r)} c`,
    `${num(x2)} ${num(y2 - r)} l`,
    `${num(x2)} ${num(y2 - r + k)} ${num(x2 - r + k)} ${num(y2)} ${num(x2 - r)} ${num(y2)} c`,
    `${num(x + r)} ${num(y2)} l`,
    `${num(x + r - k)} ${num(y2)} ${num(x)} ${num(y2 - r + k)} ${num(x)} ${num(y2 - r)} c`,
    `${num(x)} ${num(y + r)} l`,
    `${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)} c h`,
  ].join(` `);
};

const hex4 = (n: number): string => n.toString(16).padStart(4, `0`);

function pdfDate(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, `0`);
  return `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// Glyphes d'une police utilises dans le document : pour la table des largeurs et la table ToUnicode.
interface FontUse {
  font: OpenTypeFont;
  name: string;
  glyphs: Map<number, string>;
}

interface LinkBox {
  rect: [number, number, number, number];
  url: string;
}

// Lecture des hauteurs de ligne de base d'apres la police, comme le fait le navigateur pour centrer le texte dans sa ligne.
function baselineIn(top: number, height: number, size: number, font: OpenTypeFont): number {
  const asc = (font.ascender * size) / font.unitsPerEm;
  const desc = (-font.descender * size) / font.unitsPerEm;
  return top + (height - (asc + desc)) / 2 + asc;
}

// Style sous lequel une police est incorporee : pour une famille ajoutee, la variante reellement fournie par ses fichiers.
function canonicalStyle(style: FontStyle): FontStyle {
  const u = parseUserStyle(style);
  if (!u) return style;
  const variant = resolvedVariant(u.family, u.variant);
  return variant ? userStyle(u.family, variant) : variantOf(style);
}

export async function buildPdf(pages: Page[], baseSetup: PageSetup, opts: PdfOptions): Promise<Uint8Array> {
  const uses = new Map<FontStyle, FontUse>();
  const use = (requested: FontStyle): FontUse => {
    // Une variante absente de la famille (gras, italique) est remplacee par une autre : la police n'est incorporee qu'une fois.
    const s = canonicalStyle(requested);
    let u = uses.get(s);
    if (!u) {
      u = { font: fontFor(s), name: `F${uses.size + 1}`, glyphs: new Map() };
      uses.set(s, u);
    }
    return u;
  };
  // Feuille de la page en cours de dessin : celle de la note, ou celle de la page quand une zone en change l'orientation.
  let setup = baseSetup;
  let textWidth = setup.width - setup.marginLeft - setup.marginRight;
  let H = setup.height;
  const pageSetups: PageSetup[] = pages.map((p) => p.setup ?? baseSetup);
  const regular = use(`regular`);

  interface Heading {
    level: number;
    title: string;
    page: number;
    x: number;
    y: number;
  }
  const headings: Heading[] = [];

  // Operateurs de dessin d'une ligne de morceaux. Renvoie la largeur ecrite.
  const drawRuns = (ops: string[], links: LinkBox[], runs: LineRun[], x0: number, baseline: number, size: number, wordSpacing: number, color?: string): number => {
    let x = x0;
    for (const run of runs) {
      if (run.math) {
        // Formule en ligne : contour rempli, a l'echelle du corps du texte, pose sur la ligne de base.
        const k = size / 1000;
        ops.push(`q ${num(k)} 0 0 ${num(-k)} ${num(x)} ${num(H - baseline)} cm ${mathOps(run.math.d)} f Q`);
        x += run.math.width * k;
        continue;
      }
      const u = use(run.style);
      const f = u.font;
      const sz = size * (run.sup ? SUP_SCALE : 1);
      // L'exposant monte de 0,38 fois sa propre taille ; les ordonnees d'ici comptent depuis le haut de la page.
      const y = baseline - (run.sup ? 0.38 * sz : 0);
      const glyphs = f.shape(run.text);
      const parts: string[] = [];
      let cur = ``;
      let width = 0;
      for (const g of glyphs) {
        if (!u.glyphs.has(g.gid)) u.glyphs.set(g.gid, g.text);
        cur += hex4(g.gid);
        const kern = g.advance - f.advance(g.gid);
        const isSpace = g.text === ` ` || g.text === ` `;
        const extra = isSpace && !run.sup ? wordSpacing : 0;
        const adj = (-kern * 1000) / f.unitsPerEm - (extra * 1000) / sz;
        width += (g.advance * sz) / f.unitsPerEm + extra;
        if (Math.abs(adj) > 1e-6) {
          parts.push(`<${cur}>`, num(adj));
          cur = ``;
        }
      }
      if (cur !== ``) parts.push(`<${cur}>`);
      const link = run.link !== undefined;
      if (link) ops.push(`q 0.102 0.31 0.612 rg`);
      else if (color) ops.push(`q ${color} rg`);
      ops.push(`BT /${u.name} ${num(sz)} Tf ${num(x)} ${num(H - y)} Td [${parts.join(` `)}] TJ ET`);
      if (link) {
        // Soulignement et zone cliquable du lien.
        ops.push(`${num(x)} ${num(H - baseline - 1.4)} ${num(width)} 0.4 re f Q`);
        const rect: [number, number, number, number] = [x, H - baseline - 2, x + width, H - baseline + size * 0.8];
        // Les mots d'un meme lien, separes par une espace, ne forment qu'une zone cliquable.
        const prev = links[links.length - 1];
        if (prev && prev.url === run.link && Math.abs(prev.rect[1] - rect[1]) < 0.01 && rect[0] - prev.rect[2] < size) prev.rect[2] = rect[2];
        else links.push({ rect, url: run.link as string });
      } else if (color) {
        ops.push(`Q`);
      }
      x += width;
    }
    return x - x0;
  };

  // Surlignage : un fond de couleur derriere le texte, de la hauteur du corps.
  const highlightRuns = (ops: string[], runs: LineRun[], x: number, baseline: number, size: number, wordSpacing: number, hex: string): void => {
    const width = natural(runs, size, wordSpacing);
    if (width <= 0) return;
    ops.push(`q ${hexOperands(hex)} rg ${num(x)} ${num(H - baseline - 0.25 * size)} ${num(width)} ${num(1.1 * size)} re f Q`);
  };

  const runsOf = (row: Row): LineRun[] => row.runs ?? [{ text: row.text, style: `regular` }];
  const natural = (runs: LineRun[], size: number, wordSpacing: number): number =>
    runs.reduce((a, r) => {
      if (r.math) return a + (r.math.width * size) / 1000;
      const f = fontFor(r.style);
      const sz = size * (r.sup ? SUP_SCALE : 1);
      const spaces = r.sup ? 0 : Array.from(r.text).filter((c) => c === ` ` || c === ` `).length;
      return a + (f.width(r.text) * sz) / f.unitsPerEm + spaces * wordSpacing;
    }, 0);

  // Images utilisees : nom de la ressource de page et image, par cible. Reperes des renvois : page et position.
  const usedImages = new Map<string, { name: string; asset: ImageAsset }>();
  const imageName = (target: string): string | undefined => {
    const known = usedImages.get(target);
    if (known) return known.name;
    const asset = opts.images?.get(target);
    if (!asset) return undefined;
    const name = `Im${usedImages.size + 1}`;
    usedImages.set(target, { name, asset });
    return name;
  };
  const anchors = new Map<string, { page: number; x: number; y: number }>();

  const pageContents: { ops: string[]; links: LinkBox[] }[] = [];
  pages.forEach((page, pageIndex) => {
    setup = pageSetups[pageIndex];
    textWidth = setup.width - setup.marginLeft - setup.marginRight;
    H = setup.height;
    const ops: string[] = [];
    const links: LinkBox[] = [];

    // Corps de page : lignes empilees depuis la marge haute.
    let top = setup.marginTop;
    const drawRow = (row: Row, left: number, rowTop: number): void => {
      if (row.anchor !== undefined && !anchors.has(row.anchor)) anchors.set(row.anchor, { page: pageIndex, x: left + row.x, y: rowTop });
      if (row.alias !== undefined && !anchors.has(row.alias)) anchors.set(row.alias, { page: pageIndex, x: left + row.x, y: rowTop });
      if (row.shade) ops.push(`q ${num(row.shade.fill)} g ${num(left + row.x)} ${num(H - rowTop - row.height)} ${num(row.width)} ${num(row.height)} re f Q`);
      if (row.rules) {
        // Filets du tableau, sur toute sa largeur.
        const x1 = left + row.x;
        const x2 = x1 + row.width;
        if (row.rules.top) ops.push(`q 0.15 G 0.6 w ${num(x1)} ${num(H - rowTop)} m ${num(x2)} ${num(H - rowTop)} l S Q`);
        if (row.rules.bottom) ops.push(`q 0.15 G 0.6 w ${num(x1)} ${num(H - rowTop - row.height)} m ${num(x2)} ${num(H - rowTop - row.height)} l S Q`);
      }
      if (row.box) {
        // Cadre d'un titre : fond sur toute la ligne, bords gauche et droit sur chaque ligne, haut et bas sur la premiere et la derniere.
        const x1 = left + row.box.x;
        const x2 = x1 + row.box.width;
        const y1 = H - rowTop;
        const y2 = H - rowTop - row.height;
        if (row.box.fill !== ``) ops.push(`q ${hexOperands(row.box.fill)} rg ${num(x1)} ${num(y2)} ${num(x2 - x1)} ${num(y1 - y2)} re f Q`);
        const edges: string[] = [`${num(x1)} ${num(y1)} m ${num(x1)} ${num(y2)} l S`, `${num(x2)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`];
        if (row.box.top) edges.push(`${num(x1)} ${num(y1)} m ${num(x2)} ${num(y1)} l S`);
        if (row.box.bottom) edges.push(`${num(x1)} ${num(y2)} m ${num(x2)} ${num(y2)} l S`);
        if (row.box.line > 0) ops.push(`q ${hexOperands(row.box.color)} RG ${num(row.box.line)} w ${edges.join(` `)} Q`);
      }
      if (row.frame) {
        // Cadre d'un media : bords gauche et droit, et haut ou bas sur la premiere et la derniere ligne.
        const x1 = left;
        const x2 = left + row.frame.width;
        const y1 = H - rowTop;
        const y2 = H - rowTop - row.height;
        const edges: string[] = [`${num(x1)} ${num(y1)} m ${num(x1)} ${num(y2)} l S`, `${num(x2)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`];
        if (row.frame.top) edges.push(`${num(x1)} ${num(y1)} m ${num(x2)} ${num(y1)} l S`);
        if (row.frame.bottom) edges.push(`${num(x1)} ${num(y2)} m ${num(x2)} ${num(y2)} l S`);
        ops.push(`q 0.55 G 0.5 w ${edges.join(` `)} Q`);
      }
      if (row.kind === `space` || row.kind === `float`) return;
      if (row.math) {
        // Formule en bloc : centree dans sa ligne, ligne de base placee d'apres la hauteur du dessin.
        const k = row.math.size / 1000;
        const top = (row.height - (row.math.asset.ascent + row.math.asset.descent) * k) / 2;
        ops.push(`q ${num(k)} 0 0 ${num(-k)} ${num(left + row.x)} ${num(H - (rowTop + top + row.math.asset.ascent * k))} cm ${mathOps(row.math.asset.d)} f Q`);
        return;
      }
      if (row.cells) {
        const inner = row.height - (row.inset?.top ?? 0) - (row.inset?.bottom ?? 0);
        const cellBase = baselineIn(rowTop + (row.inset?.top ?? 0), inner, row.fontSize, regular.font);
        if (row.shade?.text === `white`) ops.push(`q 1 g`);
        const cellColor = row.shade?.text !== `white` && row.color ? hexOperands(row.color) : undefined;
        for (const c of row.cells) {
          if (row.highlight) highlightRuns(ops, c.runs, left + row.x + c.x, cellBase, row.fontSize, 0, row.highlight);
          drawRuns(ops, links, c.runs, left + row.x + c.x, cellBase, row.fontSize, 0, cellColor);
        }
        if (row.shade?.text === `white`) ops.push(`Q`);
        return;
      }
      if (row.image) {
        const name = imageName(row.image.target);
        if (name) ops.push(`q ${num(row.image.width)} 0 0 ${num(row.image.height)} ${num(left + row.x)} ${num(H - rowTop - row.image.height)} cm /${name} Do Q`);
        return;
      }
      const rowColor = row.color ? hexOperands(row.color) : undefined;
      const baseline = row.inset ? baselineIn(rowTop + row.inset.top, row.height - row.inset.top - row.inset.bottom, row.fontSize, regular.font) : baselineIn(rowTop, row.height, row.fontSize, regular.font);
      if (row.heading) headings.push({ level: row.heading.level, title: row.heading.title, page: pageIndex, x: left + row.x, y: rowTop });
      if (row.kind === `quote`) {
        // Filet vertical a gauche des citations.
        ops.push(`q 0.6 g ${num(left + 12)} ${num(H - rowTop - row.height)} 1.5 ${num(row.height)} re f Q`);
      }
      if (row.marker !== undefined) {
        const small = row.kind === `footnote`;
        const run: LineRun = { text: row.marker, style: `regular`, ...(small ? { sup: true } : {}) };
        if (small) {
          const ms = row.fontSize * SUP_SCALE;
          const markerBase = rowTop + (row.height - 1.14 * ms) / 2 + 0.894 * ms - 0.3 * ms;
          drawRuns(ops, links, [{ ...run, sup: false }], left, markerBase, ms, 0);
        } else {
          drawRuns(ops, links, [run], left + row.x - 16, baseline, row.fontSize, 0, rowColor);
        }
      }
      if (row.bullet) ops.push(bulletOps(row.bullet, left + row.x - 16, H - baseline, row.fontSize, rowColor));
      const runs = runsOf(row);
      let x = left + row.x;
      if (row.align === `center`) x += (row.width - natural(runs, row.fontSize, row.wordSpacing)) / 2;
      if (row.highlight) highlightRuns(ops, runs, x, baseline, row.fontSize, row.wordSpacing, row.highlight);
      const written = drawRuns(ops, links, runs, x, baseline, row.fontSize, row.wordSpacing, rowColor);
      if (row.underline && written > 0) ops.push(`q ${rowColor ? `${rowColor} rg ` : ``}${num(x)} ${num(H - baseline - row.fontSize * 0.1 - 0.4)} ${num(written)} ${num(Math.max(0.4, row.fontSize * 0.04))} re f Q`);
      if (row.toc) {
        // Entree de la table des matieres : numero de page a droite, points de conduite, zone cliquable sur toute la ligne.
        const right = left + row.x + row.width;
        if (row.toc.page >= 0) {
          const label = String(row.toc.page);
          const labelWidth = natural([{ text: label, style: `regular` }], row.fontSize, 0);
          drawRuns(ops, links, [{ text: label, style: `regular` }], right - labelWidth, baseline, row.fontSize, 0);
          const from = x + written + 4;
          const to = right - labelWidth - 4;
          if (to - from > 6) ops.push(`q [0.1 3.2] 0 d 1 J 0.6 w 0.4 G ${num(from)} ${num(H - baseline)} m ${num(to)} ${num(H - baseline)} l S Q`);
        }
        links.push({ rect: [left + row.x, H - rowTop - row.height, right, H - rowTop], url: `#${row.toc.anchor}` });
      }
    };
    // Chaque colonne se dessine a part : lignes depuis la marge haute, flottants du bas puis notes au bas de la colonne.
    for (const col of columnsOf(page, textWidth)) {
      const left = setup.marginLeft + col.x;
      let y0 = setup.marginTop;
      for (const row of col.topFloats ?? []) {
        drawRow(row, left, y0);
        y0 += row.height;
      }
      for (const row of col.rows) {
        drawRow(row, left, y0);
        y0 += row.height;
      }
      // Flottants du bas : juste au-dessus des notes de bas de page.
      if (col.bottomFloats && col.bottomFloats.length > 0) {
        const noteArea = col.footnotes.length > 0 ? FOOTNOTE_RULE_HEIGHT + col.footnotes.reduce((a, r) => a + r.height, 0) : 0;
        let by = H - setup.marginBottom - noteArea - col.bottomFloats.reduce((a, r) => a + r.height, 0);
        for (const row of col.bottomFloats) {
          drawRow(row, left, by);
          by += row.height;
        }
      }
      // Notes de bas de page : en bas de la colonne, sous un filet.
      if (col.footnotes.length > 0) {
        const area = FOOTNOTE_RULE_HEIGHT + col.footnotes.reduce((a, r) => a + r.height, 0);
        let y = H - setup.marginBottom - area;
        ops.push(`q 0.267 G 0.4 w ${num(left)} ${num(H - y)} m ${num(left + col.width * 0.33)} ${num(H - y)} l S Q`);
        y += FOOTNOTE_RULE_HEIGHT;
        for (const row of col.footnotes) {
          drawRow(row, left, y);
          y += row.height;
        }
      }
    }

    // En-tete courant et numero de page.
    if (page.header) {
      const hs = 9;
      const top0 = setup.marginTop - 34;
      drawRuns(ops, links, [{ text: page.header, style: `regular` }], setup.marginLeft, top0 + 0.894 * hs, hs, 0, `0.333 0.333 0.333`);
      ops.push(`q 0.6 G 0.4 w ${num(setup.marginLeft)} ${num(H - (top0 + 1.14 * hs + 3.2))} m ${num(setup.marginLeft + textWidth)} ${num(H - (top0 + 1.14 * hs + 3.2))} l S Q`);
    }
    if (page.footer) {
      const fs = 10;
      const w = natural([{ text: page.footer, style: `regular` }], fs, 0);
      const boxTop = H - 30 - 1.14 * fs;
      drawRuns(ops, links, [{ text: page.footer, style: `regular` }], (setup.width - w) / 2, boxTop + 0.894 * fs, fs, 0, `0.4 0.4 0.4`);
    }
    // En-tete, pied de page et bord exterieur composes d'apres les reglages de la note.
    const drawLeaf = (item: DecorLeaf): void => {
      if (item.kind === `text`) {
        drawRuns(ops, links, [{ text: item.text, style: item.style }], item.x, item.baseline, item.size, 0, hexOperands(item.color));
      } else if (item.kind === `image`) {
        const name = imageName(item.target);
        if (name) ops.push(`q ${num(item.width)} 0 0 ${num(item.height)} ${num(item.x)} ${num(H - item.y - item.height)} cm /${name} Do Q`);
      } else if (item.kind === `rule`) {
        ops.push(`q 0.6 G 0.4 w ${num(item.x1)} ${num(H - item.y)} m ${num(item.x2)} ${num(H - item.y)} l S Q`);
      } else {
        // Remplissage et contour facultatifs (couleur vide : rien n'est dessine).
        const path = shapePath(item.shape, item.x, H - item.y - item.height, item.width, item.height);
        const paint = item.fill !== `` && item.stroke !== `` ? `B` : item.fill !== `` ? `f` : item.stroke !== `` ? `S` : `n`;
        const colors = `${item.fill !== `` ? `${hexOperands(item.fill)} rg ` : ``}${item.stroke !== `` ? `${hexOperands(item.stroke)} RG 0.8 w ` : ``}`;
        if (paint !== `n`) ops.push(`q ${colors}${path} ${paint} Q`);
      }
    };
    for (const item of page.decor ?? []) {
      if (item.kind !== `group`) {
        drawLeaf(item);
        continue;
      }
      // Rotation de 90 degres : la ligne horizontale composee est posee sur son origine (qx, qy) de la page.
      const qy = H - item.qy;
      const m = item.rot === 90 ? [0, -1, 1, 0, item.qx - H, qy] : [0, 1, -1, 0, item.qx + H, qy];
      ops.push(`q ${m.map((v) => num(v)).join(` `)} cm`);
      for (const leaf of item.items) drawLeaf(leaf);
      ops.push(`Q`);
    }
    pageContents.push({ ops, links });
  });

  // ---------------------------------------------------------------- objets
  const out = new Writer();
  const offsets: number[] = [0];
  const objects: ((id: number) => Promise<void>)[] = [];
  let nextId = 1;
  const reserve = (): number => nextId++;
  const define = (id: number, body: () => Promise<string | Uint8Array>): void => {
    objects[id] = async () => {
      offsets[id] = out.length;
      out.push(`${id} 0 obj\n`);
      out.push(await body());
      out.push(`\nendobj\n`);
    };
  };
  // Flux ecrit tel quel (image JPEG, deja compressee).
  const rawStream = async (dict: string, data: Uint8Array): Promise<Uint8Array> => {
    const w = new Writer();
    w.push(`<< ${dict} /Length ${data.length} >>\nstream\n`);
    w.push(data);
    w.push(`\nendstream`);
    return w.bytes();
  };
  const stream = async (dict: string, data: Uint8Array): Promise<Uint8Array> => {
    let body = data;
    let filter = ``;
    if (opts.deflate) {
      body = await opts.deflate(data);
      filter = ` /Filter /FlateDecode`;
    }
    const w = new Writer();
    w.push(`<< ${dict}${filter} /Length ${body.length} >>\nstream\n`);
    w.push(body);
    w.push(`\nendstream`);
    return w.bytes();
  };

  const catalog = reserve();
  const pagesRoot = reserve();
  const info = reserve();
  const outlineRoot = reserve();
  const fontIds = new Map<FontStyle, number>();
  // Numero d'ordre de chaque famille ajoutee, pour des noms de police distincts dans le PDF.
  const userNumbers = new Map<string, number>();
  const userNumber = (family: string): number => {
    if (!userNumbers.has(family)) userNumbers.set(family, userNumbers.size + 1);
    return userNumbers.get(family) as number;
  };
  // Nom de police PDF : lettres, chiffres et tirets seulement.
  const pdfName = (name: string): string => name.replace(/[^A-Za-z0-9]/g, ``).slice(0, 40) || `Font`;
  for (const s of uses.keys()) fontIds.set(s, reserve());
  const pageIds = pages.map(() => reserve());
  const contentIds = pages.map(() => reserve());

  // Polices.
  for (const [styleName, u] of uses) {
    const type0 = fontIds.get(styleName) as number;
    const cid = reserve();
    const desc = reserve();
    const file = reserve();
    const toUni = reserve();
    const f = u.font;
    // Les polices sont des sous-ensembles latins : leur nom porte la marque de sous-ensemble de six majuscules.
    const user = parseUserStyle(styleName);
    const baseName = user
      ? `MMWU${String(userNumber(user.family)).padStart(2, `0`)}+${pdfName(f.postScriptName || f.family || user.family)}-${user.variant}`
      : {
          regular: `MMWSRG+LibertinusSerif-Regular`,
          italic: `MMWSIT+LibertinusSerif-Italic`,
          bold: `MMWSBD+LibertinusSerif-Bold`,
          boldItalic: `MMWSBI+LibertinusSerif-BoldItalic`,
          mono: `MMWMRG+LibertinusMono-Regular`,
        }[styleName as `regular`];
    const truetype = f.flavor === `truetype`;
    define(type0, async () => `<< /Type /Font /Subtype /Type0 /BaseFont /${baseName} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUni} 0 R >>`);
    const gids = [...u.glyphs.keys()].sort((a, b) => a - b);
    define(cid, async () => {
      const w = gids.map((g) => `${g} [${num((f.advance(g) * 1000) / f.unitsPerEm)}]`).join(` `);
      return `<< /Type /Font /Subtype /${truetype ? `CIDFontType2` : `CIDFontType0`} /BaseFont /${baseName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /DW 500 ${truetype ? `/CIDToGIDMap /Identity ` : ``}/W [${w}] >>`;
    });
    const bold = variantOf(styleName) === `bold` || variantOf(styleName) === `boldItalic` || f.isBold;
    const italic = variantOf(styleName) === `italic` || variantOf(styleName) === `boldItalic` || f.isItalic;
    define(desc, async () => {
      const bbox = f.bbox.map((v) => num((v * 1000) / f.unitsPerEm)).join(` `);
      return `<< /Type /FontDescriptor /FontName /${baseName} /Flags ${styleName === `mono` ? 33 : 34 | (italic ? 64 : 0)} /FontBBox [${bbox}] /ItalicAngle ${num(f.italicAngle)} /Ascent ${num((f.ascender * 1000) / f.unitsPerEm)} /Descent ${num((f.descender * 1000) / f.unitsPerEm)} /CapHeight ${num((f.capHeight * 1000) / f.unitsPerEm)} /StemV ${bold ? 140 : 80} /${truetype ? `FontFile2` : `FontFile3`} ${file} 0 R >>`;
    });
    define(file, async () => stream(truetype ? `/Length1 ${f.cff.length}` : `/Subtype /CIDFontType0C`, f.cff));
    define(toUni, async () => stream(``, encoder.encode(toUnicodeCMap(u.glyphs))));
  }

  // Pages et flux de contenu.
  const fontRes = (): string => {
    const f = [...uses.entries()].map(([s, u]) => `/${u.name} ${fontIds.get(s)} 0 R`);
    return `<< ${f.join(` `)} >>`;
  };
  // Images : un objet par image, avec son masque de transparence s'il y en a un.
  const imageIds = new Map<string, number>();
  for (const [target, { asset }] of usedImages) {
    const id = reserve();
    imageIds.set(target, id);
    const mask = asset.alpha ? reserve() : undefined;
    define(id, async () => {
      const dict = `/Type /XObject /Subtype /Image /Width ${asset.pixelWidth} /Height ${asset.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8${mask ? ` /SMask ${mask} 0 R` : ``}`;
      return asset.kind === `jpeg` ? rawStream(`${dict} /Filter /DCTDecode`, asset.data) : stream(dict, asset.data);
    });
    if (mask && asset.alpha) {
      const alpha = asset.alpha;
      define(mask, async () => stream(`/Type /XObject /Subtype /Image /Width ${asset.pixelWidth} /Height ${asset.pixelHeight} /ColorSpace /DeviceGray /BitsPerComponent 8`, alpha));
    }
  }
  const xobjectRes = (): string => (usedImages.size === 0 ? `` : ` /XObject << ${[...usedImages.entries()].map(([t, u]) => `/${u.name} ${imageIds.get(t)} 0 R`).join(` `)} >>`);
  const annotIds: number[][] = pages.map(() => []);
  pages.forEach((_p, i) => {
    for (const link of pageContents[i].links) {
      const target = link.url.startsWith(`#`) ? anchors.get(link.url.slice(1)) : undefined;
      // Renvoi vers un repere absent du document : pas de zone cliquable.
      if (link.url.startsWith(`#`) && !target) continue;
      const id = reserve();
      annotIds[i].push(id);
      const r = link.rect.map(num).join(` `);
      define(id, async () =>
        target
          ? `<< /Type /Annot /Subtype /Link /Rect [${r}] /Border [0 0 0] /F 4 /Dest [${pageIds[target.page]} 0 R /XYZ ${num(target.x)} ${num(pageSetups[target.page].height - target.y + 4)} null] >>`
          : `<< /Type /Annot /Subtype /Link /Rect [${r}] /Border [0 0 0] /F 4 /A << /S /URI /URI ${uriString(link.url)} >> >>`
      );
    }
  });
  pages.forEach((_p, i) => {
    define(pageIds[i], async () => {
      const annots = annotIds[i].length > 0 ? ` /Annots [${annotIds[i].map((a) => `${a} 0 R`).join(` `)}]` : ``;
      return `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${num(pageSetups[i].width)} ${num(pageSetups[i].height)}] /Resources << /Font ${fontRes()}${xobjectRes()} >> /Contents ${contentIds[i]} 0 R${annots} >>`;
    });
    define(contentIds[i], async () => stream(``, encoder.encode(pageContents[i].ops.join(`\n`))));
  });
  define(pagesRoot, async () => `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(` `)}] /Count ${pages.length} >>`);

  // Signets : les titres, imbriques selon leur niveau, comme dans la vue Liste. La note elle-meme est la racine.
  interface OutlineNode {
    id: number;
    heading: Heading;
    children: OutlineNode[];
    parent: OutlineNode | null;
  }
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const h of headings) {
    const node: OutlineNode = { id: reserve(), heading: h, children: [], parent: null };
    while (stack.length > 0 && stack[stack.length - 1].heading.level >= h.level) stack.pop();
    if (stack.length > 0) {
      node.parent = stack[stack.length - 1];
      node.parent.children.push(node);
    } else roots.push(node);
    stack.push(node);
  }
  const count = (n: OutlineNode): number => n.children.reduce((a, c) => a + 1 + count(c), 0);
  const defineOutline = (n: OutlineNode, siblings: OutlineNode[], index: number, parentId: number): void => {
    define(n.id, async () => {
      const h = n.heading;
      const parts = [`/Title ${pdfText(h.title)}`, `/Parent ${parentId} 0 R`, `/Dest [${pageIds[h.page]} 0 R /XYZ ${num(h.x)} ${num(pageSetups[h.page].height - h.y + 4)} null]`];
      if (index > 0) parts.push(`/Prev ${siblings[index - 1].id} 0 R`);
      if (index < siblings.length - 1) parts.push(`/Next ${siblings[index + 1].id} 0 R`);
      if (n.children.length > 0) parts.push(`/First ${n.children[0].id} 0 R /Last ${n.children[n.children.length - 1].id} 0 R /Count ${count(n)}`);
      return `<< ${parts.join(` `)} >>`;
    });
    n.children.forEach((c, i) => defineOutline(c, n.children, i, n.id));
  };
  roots.forEach((r, i) => defineOutline(r, roots, i, outlineRoot));
  if (roots.length > 0) {
    define(outlineRoot, async () => `<< /Type /Outlines /First ${roots[0].id} 0 R /Last ${roots[roots.length - 1].id} 0 R /Count ${roots.reduce((a, r) => a + 1 + count(r), 0)} >>`);
  }

  define(info, async () => {
    const parts = [`/Title ${pdfText(opts.title)}`, `/Creator ${pdfText(opts.creator)}`, `/Producer ${pdfText(opts.creator)}`, `/CreationDate (${pdfDate(opts.created)})`, `/ModDate (${pdfDate(opts.created)})`];
    if (opts.author) parts.push(`/Author ${pdfText(opts.author)}`);
    return `<< ${parts.join(` `)} >>`;
  });
  define(catalog, async () => `<< /Type /Catalog /Pages ${pagesRoot} 0 R${roots.length > 0 ? ` /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines` : ``} /Lang ${pdfText(opts.language)} /ViewerPreferences << /DisplayDocTitle true >> >>`);

  // ---------------------------------------------------------------- ecriture
  out.push(`%PDF-1.7\n`);
  out.push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const total = nextId;
  for (let id = 1; id < total; id++) {
    if (objects[id]) await objects[id](id);
    else {
      // Racine des signets sans titre : objet vide, jamais reference.
      offsets[id] = out.length;
      out.push(`${id} 0 obj\nnull\nendobj\n`);
    }
  }
  const xref = out.length;
  out.push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) out.push(`${String(offsets[id]).padStart(10, `0`)} 00000 n \n`);
  const fileId = idOf(opts.title + opts.created.toISOString() + total);
  out.push(`trailer\n<< /Size ${total} /Root ${catalog} 0 R /Info ${info} 0 R /ID [<${fileId}> <${fileId}>] >>\nstartxref\n${xref}\n%%EOF\n`);
  return out.bytes();
}

// Identifiant du fichier : 32 caracteres hexadecimaux tires du titre et de la date.
function idOf(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let out = ``;
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
      h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0;
    }
    out += h1.toString(16).padStart(8, `0`);
    h2 ^= h1;
  }
  return out.slice(0, 32);
}

// Adresse d'un lien : caracteres ASCII, avec les autres codes en pourcentage.
function uriString(url: string): string {
  const ascii = url.replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
  return `(${ascii.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

// Table de correspondance glyphe -> texte (UTF-16BE), pour que le texte du PDF se selectionne, se copie et se recherche.
function toUnicodeCMap(glyphs: Map<number, string>): string {
  const entries = [...glyphs.entries()].sort((a, b) => a[0] - b[0]);
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const [gid, text] of chunk) {
      let u = ``;
      for (let k = 0; k < text.length; k++) u += hex4(text.charCodeAt(k));
      lines.push(`<${hex4(gid)}> <${u}>`);
    }
    lines.push(`endbfchar`);
  }
  return [
    `/CIDInit /ProcSet findresource begin`,
    `12 dict begin`,
    `begincmap`,
    `/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def`,
    `/CMapName /Adobe-Identity-UCS def`,
    `/CMapType 2 def`,
    `1 begincodespacerange`,
    `<0000> <FFFF>`,
    `endcodespacerange`,
    ...lines,
    `endcmap`,
    `CMapName currentdict /CMap defineresource pop`,
    `end`,
    `end`,
  ].join(`\n`);
}

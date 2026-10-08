// Export de haute qualite : composition de l'en-tete, du pied de page et du numero de chaque page, d'apres les reglages de la note
// (voir src/page-config.ts). Le resultat est une liste d'elements positionnes (texte, image, forme, filet), identique pour l'apercu
// et le PDF. Le numero est dessine en dernier, donc au premier plan.
import { measureText, FontStyle } from "./font-metrics";
import type { ImageAsset } from "./image";
import { BASE_POINTS, sizeFactor, styleOf, TextSpec } from "../text-style";
import type { Page } from "./paginate";
import type { PageSetup } from "./typeset";
import { displaySize } from "./image";
import { Band, bandUsed, IMAGE_MAX_HEIGHT_PX, IMAGE_MAX_WIDTH_PX, PageConfig, PageValues, parseZone, POINTS_PER_MM, SIZE_POINTS, SizeCode, valueOf, ZONE_MAX_LINES, ZoneFrame, Zones } from "../page-config";

export type DecorLeaf =
  | { kind: `text`; x: number; baseline: number; size: number; style: FontStyle; text: string; color: string }
  | { kind: `image`; target: string; x: number; y: number; width: number; height: number }
  | { kind: `shape`; shape: `circle` | `square` | `rounded`; x: number; y: number; width: number; height: number; fill: string; stroke: string }
  | { kind: `rule`; x1: number; x2: number; y: number };

// Elements ecrits a 90 degres (bord exterieur). Leurs coordonnees sont celles d'une ligne horizontale dont l'origine (debut de la ligne,
// ligne de base 0) est posee en (qx, qy) sur la page ; `rot` 90 : le texte descend (a droite des pages de droite), -90 : il monte.
export interface DecorGroup {
  kind: `group`;
  rot: 90 | -90;
  qx: number;
  qy: number;
  items: DecorLeaf[];
}

export type DecorItem = DecorLeaf | DecorGroup;

export interface DecorContext {
  setup: PageSetup;
  title: string;
  author: string;
  // Date du jour, deja ecrite dans la langue du document.
  date: string;
  // Dates de creation et de derniere modification de la note, deja ecrites dans la langue du document.
  created: string;
  modified: string;
  images?: Map<string, ImageAsset>;
  // Police et taille du texte de l'en-tete, du pied de page et du bord (reglage « Polices et titres »).
  typography?: TextSpec;
}

export interface DecorResult {
  pages: DecorItem[][];
  // Images des zones que le coffre ne contient pas.
  missing: string[];
}

const TEXT_COLOR = `#444444`;
const HEADER_BASELINE_OFFSET = 26;
const FOOTER_BASELINE_OFFSET = 32.5;
const RULE_GAP = 4;

// Titre du chapitre et de la section en cours en haut de chaque page. Le titre du chapitre est vide sur la page ou il commence (il y est
// deja ecrit), comme l'en-tete courant d'origine.
function runningTitles(pages: Page[]): { chapter: string; section: string }[] {
  let chapterLevel = Infinity;
  for (const p of pages) for (const r of p.rows) if (r.heading) chapterLevel = Math.min(chapterLevel, r.heading.level);
  let section = ``;
  return pages.map((p) => {
    const first = p.rows.find((r) => r.kind !== `space`);
    for (const r of p.rows) {
      if (r.heading && r.heading.level === chapterLevel + 1) {
        section = r.heading.title;
        break;
      }
      if (r.heading && r.heading.level === chapterLevel) section = ``;
      if (r.kind !== `space` && !r.heading) break;
    }
    return { chapter: first?.chapterStart ? `` : (first?.chapter ?? ``), section };
  });
}

interface Piece {
  width: number;
  size: number;
  // Hauteur au-dessus et au-dessous de la ligne de base (pour dimensionner un cadre).
  above: number;
  below: number;
  // Vrai : le numero de page reste droit dans une bande tournee (il est pose a part, sans rotation).
  upright?: boolean;
  item: (x: number, baseline: number) => DecorLeaf[];
}

// Morceaux d'une zone, avec leur largeur ; une image absente est signalee. Un {page} est entoure de la forme de la bande.
function pieces(source: string, band: Band, rotated: boolean, textColor: string, values: PageValues, ctx: DecorContext, missing: Set<string>): Piece[] {
  const out: Piece[] = [];
  for (const t of parseZone(source)) {
    if (t.kind === `image`) {
      const asset = ctx.images?.get(t.target);
      if (!asset) {
        missing.add(t.target);
        continue;
      }
      // Largeur demandee en pixels comme dans Obsidian (|200), taille naturelle sinon, ramenee au maximum permis.
      const { width, height } = displaySize(asset.naturalWidth, asset.naturalHeight, t.width, IMAGE_MAX_WIDTH_PX * 0.75, IMAGE_MAX_HEIGHT_PX * 0.75);
      out.push({ width, size: height, above: height - 2, below: 2, item: (x, baseline) => [{ kind: `image`, target: t.target, x, y: baseline + 2 - height, width, height }] });
      continue;
    }
    const text = t.kind === `text` ? t.text : valueOf(t.name, values);
    if (text === ``) continue;
    const size = SIZE_POINTS[t.size] * (ctx.typography ? sizeFactor(ctx.typography, BASE_POINTS.decor) : 1);
    const style: FontStyle = ctx.typography ? styleOf({ ...ctx.typography, bold: ctx.typography.bold || t.bold, italic: ctx.typography.italic || t.italic }) : t.bold && t.italic ? `boldItalic` : t.bold ? `bold` : t.italic ? `italic` : `regular`;
    const w = measureText(text, size, style).width;
    if (t.kind === `variable` && t.name === `page`) {
      const shape = band.pageShape;
      const box = shape.shape === `none` ? 0 : Math.max(size * 2, w + size * 0.9);
      const upright = rotated && band.pageUpright;
      // Droit dans une ligne tournee, le chiffre n'occupe sur la ligne que sa hauteur.
      const width = upright ? Math.max(box, size * 1.2) : Math.max(w, box);
      out.push({
        width,
        size,
        above: Math.max(size * ASCENT, box / 2 + size * 0.33),
        below: Math.max(size * DESCENT, box / 2 - size * 0.33),
        ...(upright ? { upright: true } : {}),
        item: (x, baseline) => {
          const cx = x + width / 2;
          const items: DecorLeaf[] = [];
          if (shape.shape !== `none`) items.push({ kind: `shape`, shape: shape.shape, x: cx - box / 2, y: baseline - size * 0.33 - box / 2, width: box, height: box, fill: shape.fill, stroke: shape.stroke });
          items.push({ kind: `text`, x: cx - w / 2, baseline, size, style, text, color: shape.color });
          return items;
        },
      });
      continue;
    }
    out.push({ width: w, size, above: size * ASCENT, below: size * DESCENT, item: (x, baseline) => [{ kind: `text`, x, baseline, size, style, text, color: textColor }] });
  }
  return out;
}

// Interligne des zones sur plusieurs lignes, en points.
const ZONE_LINE_HEIGHT = 12;
// Hauteur au-dessus et au-dessous de la ligne de base, en fraction du corps, pour un cadre.
const ASCENT = 0.78;
const DESCENT = 0.25;

const zoneLines = (s: string): string[] => s.split(/\r?\n/).slice(0, ZONE_MAX_LINES);

// Pieces de chaque ligne de chaque zone d'une bande, et mesures de la bande : hauteur au-dessus de la premiere ligne de base, au-dessous
// de la derniere (images comprises), nombre de lignes et plus grande marge de cadre.
interface BandLayout {
  lists: Record<`left` | `center` | `right`, Piece[][]>;
  above: number;
  below: number;
  rows: number;
  pad: number;
}

function layoutBand(band: Band, zones: Zones, rotated: boolean, values: PageValues, ctx: DecorContext, missing: Set<string>): BandLayout {
  const lists = { left: [] as Piece[][], center: [] as Piece[][], right: [] as Piece[][] };
  let rows = 1;
  let pad = 0;
  for (const key of KEYS) {
    const frame = band.frames[key];
    const textColor = frame.color !== `` ? frame.color : ctx.typography?.color ? ctx.typography.color : TEXT_COLOR;
    lists[key] = zoneLines(zones[key]).map((line) => pieces(line, band, rotated, textColor, values, ctx, missing));
    if (lists[key].some((l) => l.length > 0)) {
      rows = Math.max(rows, lists[key].length);
      if (frame.shape !== `none`) pad = Math.max(pad, frame.padding);
    }
  }
  let above = 10 * ASCENT;
  let below = 10 * DESCENT;
  for (const key of KEYS) {
    const first = lists[key][0] ?? [];
    const last = lists[key][lists[key].length - 1] ?? [];
    for (const p of first) above = Math.max(above, p.above);
    for (const p of last) below = Math.max(below, p.below);
  }
  return { lists, above, below, rows, pad };
}

// Une zone : ses lignes (ligne de base donnee pour chacune), puis son cadre s'il y en a un, dessine derriere le texte. Tous les cadres
// d'une bande ont la meme hauteur (images comprises), pour que les onglets restent alignes.
function placeZone(lines: Piece[][], frame: ZoneFrame, m: BandLayout, align: `left` | `center` | `right`, left: number, right: number, baselineOf: (i: number) => number, out: DecorLeaf[], upright: DecorLeaf[] = out): void {
  const mine: DecorLeaf[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  lines.forEach((list, i) => {
    if (list.length === 0) return;
    const total = list.reduce((a, p) => a + p.width, 0);
    let x = align === `left` ? left : align === `right` ? right - total : (left + right) / 2 - total / 2;
    const baseline = baselineOf(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + total);
    for (const p of list) {
      (p.upright ? upright : mine).push(...p.item(x, baseline));
      x += p.width;
    }
  });
  if (frame.shape !== `none` && minX <= maxX) {
    const pad = frame.padding;
    const top = baselineOf(0) - m.above - pad;
    const bottom = baselineOf(m.rows - 1) + m.below + pad;
    out.push({ kind: `shape`, shape: frame.shape, x: minX - pad, y: top, width: maxX - minX + 2 * pad, height: bottom - top, fill: frame.fill, stroke: frame.stroke });
  }
  out.push(...mine);
}

const KEYS = [`left`, `center`, `right`] as const;

function bandItems(band: Band, odd: boolean, edge: `header` | `footer`, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorItem[]): void {
  const zones: Zones = band.mirror && !odd ? band.verso : band.zones;
  const { setup } = ctx;
  const left = setup.marginLeft;
  const right = setup.width - setup.marginRight;
  const m = layoutBand(band, zones, false, values, ctx, missing);
  const d = band.distance === null ? null : band.distance * POINTS_PER_MM;
  // Ligne de base de la premiere ligne. Sans distance, l'en-tete garde sa derniere ligne et le pied de page sa premiere a la place
  // habituelle ; avec une distance, c'est le bord exterieur de la bande (cadre compris) qui est a cette distance.
  let firstBase: number;
  if (edge === `header`) firstBase = d === null ? setup.marginTop - HEADER_BASELINE_OFFSET - (m.rows - 1) * ZONE_LINE_HEIGHT : d + m.pad + m.above;
  else firstBase = d === null ? setup.height - FOOTER_BASELINE_OFFSET : setup.height - d - m.pad - m.below - (m.rows - 1) * ZONE_LINE_HEIGHT;
  const baselineOf = (i: number): number => firstBase + i * ZONE_LINE_HEIGHT;
  for (const key of KEYS) placeZone(m.lists[key], band.frames[key], m, key, left, right, baselineOf, out as DecorLeaf[]);
  if (band.rule) {
    const lastBase = baselineOf(m.rows - 1);
    const y = edge === `header` ? lastBase + RULE_GAP + 3 + m.pad : d === null ? firstBase - 14 : firstBase - m.above - m.pad - RULE_GAP;
    out.push({ kind: `rule`, x1: left, x2: right, y });
  }
}

// Bord exterieur : la bande est composee comme une ligne horizontale de la hauteur du texte, puis tournee. Les zones sont, de haut en
// bas, gauche (haut), centre (milieu) et droite (bas) ; le texte descend sur les pages de droite et monte sur celles de gauche.
function edgeItems(band: Band, odd: boolean, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorItem[]): void {
  const { setup } = ctx;
  const zones: Zones = band.mirror && !odd ? band.verso : band.zones;
  const length = setup.height - setup.marginTop - setup.marginBottom;
  const m = layoutBand(band, zones, true, values, ctx, missing);
  // Le bloc de lignes est centre sur la ligne de base 0 (a une demi-hauteur de lettre pres).
  const baselineOf = (i: number): number => (i - (m.rows - 1) / 2) * ZONE_LINE_HEIGHT;
  const leaves: DecorLeaf[] = [];
  const uprights: DecorLeaf[] = [];
  // Sur les pages de gauche le texte monte : le haut de la page est la fin de la ligne.
  const alignOf: Record<`left` | `center` | `right`, `left` | `center` | `right`> = odd ? { left: `left`, center: `center`, right: `right` } : { left: `right`, center: `center`, right: `left` };
  for (const key of KEYS) placeZone(m.lists[key], band.frames[key], m, alignOf[key], 0, length, baselineOf, leaves, uprights);
  // Le centre du bloc (hauteur de ligne, cadre compris) est a (above - below) / 2 au-dessus de la ligne de base.
  const glyphHalf = (m.above - m.below) / 2;
  // Epaisseur du bloc, cadres compris.
  const thickness = (m.rows - 1) * ZONE_LINE_HEIGHT + m.above + m.below + 2 * m.pad;
  const d = band.distance === null ? null : band.distance * POINTS_PER_MM;
  const cx = d !== null ? (odd ? setup.width - d - thickness / 2 : d + thickness / 2) : odd ? setup.width - setup.marginRight / 2 : setup.marginLeft / 2;
  const qx = odd ? cx - glyphHalf : cx + glyphHalf;
  if (band.rule) {
    // Filet sur le cote interieur de la bande, a 6 points du bloc (ou de la marge quand il n'y a pas de distance).
    const inner = d !== null ? (odd ? setup.width - d - thickness - 6 : d + thickness + 6) : odd ? setup.width - setup.marginRight + 6 : setup.marginLeft - 6;
    leaves.push({ kind: `rule`, x1: 0, x2: length, y: odd ? qx - inner : inner - qx });
  }
  // Numeros de page droits : leur centre est ramene de la ligne tournee a la page, puis ils sont poses sans rotation.
  const toPage = (vx: number, vy: number): { x: number; y: number } => (odd ? { x: qx - vy, y: setup.marginTop + vx } : { x: qx + vy, y: setup.height - setup.marginBottom - vx });
  for (const u of uprights) {
    if (u.kind === `shape`) {
      const c = toPage(u.x + u.width / 2, u.y + u.height / 2);
      out.push({ ...u, x: c.x - u.width / 2, y: c.y - u.height / 2 });
    } else if (u.kind === `text`) {
      const w = measureText(u.text, u.size, u.style).width;
      const c = toPage(u.x + w / 2, u.baseline - u.size * 0.33);
      out.push({ ...u, x: c.x - w / 2, baseline: c.y + u.size * 0.33 });
    }
  }
  if (leaves.length === 0) return;
  out.push({ kind: `group`, rot: odd ? 90 : -90, qx, qy: odd ? setup.marginTop : setup.height - setup.marginBottom, items: leaves });
}

export function layoutDecor(config: PageConfig, pages: Page[], ctx: DecorContext): DecorResult {
  const titles = runningTitles(pages);
  const missing = new Set<string>();
  const result: DecorItem[][] = pages.map((page, index) => {
    const out: DecorItem[] = [];
    if (index === 0 && config.skipFirst) return out;
    const values: PageValues = { document: ctx.title, chapter: titles[index].chapter, section: titles[index].section, author: ctx.author, date: ctx.date, created: ctx.created, modified: ctx.modified, page: page.number, pages: pages.length };
    const odd = page.number % 2 === 1;
    // Une page d'une autre orientation a sa propre feuille : les bandes sont placees d'apres elle.
    const here = page.setup ? { ...ctx, setup: page.setup } : ctx;
    if (bandUsed(config.header)) bandItems(config.header, odd, `header`, values, here, missing, out);
    if (bandUsed(config.footer)) bandItems(config.footer, odd, `footer`, values, here, missing, out);
    if (bandUsed(config.edge)) edgeItems(config.edge, odd, values, here, missing, out);
    return out;
  });
  return { pages: result, missing: [...missing] };
}

// Taille de texte (en points) d'un code de taille, pour les fenetres de reglage.
export const sizePoints = (code: SizeCode): number => SIZE_POINTS[code];

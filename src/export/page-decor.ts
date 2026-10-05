// Export de haute qualite : composition de l'en-tete, du pied de page et du numero de chaque page, d'apres les reglages de la note
// (voir src/page-config.ts). Le resultat est une liste d'elements positionnes (texte, image, forme, filet), identique pour l'apercu
// et le PDF. Le numero est dessine en dernier, donc au premier plan.
import { measureText, FontStyle } from "./font-metrics";
import type { ImageAsset } from "./image";
import type { Page } from "./paginate";
import type { PageSetup } from "./typeset";
import { displaySize } from "./image";
import { Band, bandUsed, IMAGE_MAX_HEIGHT_PX, IMAGE_MAX_WIDTH_PX, PageConfig, PageValues, parseZone, SIZE_POINTS, SizeCode, valueOf, ZONE_MAX_LINES, Zones } from "../page-config";

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
  images?: Map<string, ImageAsset>;
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
  item: (x: number, baseline: number) => DecorLeaf[];
}

// Morceaux d'une zone, avec leur largeur ; une image absente est signalee. Un {page} est entoure de la forme de la bande.
function pieces(source: string, band: Band, values: PageValues, ctx: DecorContext, missing: Set<string>): Piece[] {
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
      out.push({ width, item: (x, baseline) => [{ kind: `image`, target: t.target, x, y: baseline + 2 - height, width, height }] });
      continue;
    }
    const text = t.kind === `text` ? t.text : valueOf(t.name, values);
    if (text === ``) continue;
    const size = SIZE_POINTS[t.size];
    const style: FontStyle = t.bold && t.italic ? `boldItalic` : t.bold ? `bold` : t.italic ? `italic` : `regular`;
    const w = measureText(text, size, style).width;
    if (t.kind === `variable` && t.name === `page`) {
      const shape = band.pageShape;
      const box = shape.shape === `none` ? 0 : Math.max(size * 2, w + size * 0.9);
      const width = Math.max(w, box);
      out.push({
        width,
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
    out.push({ width: w, item: (x, baseline) => [{ kind: `text`, x, baseline, size, style, text, color: TEXT_COLOR }] });
  }
  return out;
}

function placeZone(source: string, band: Band, align: `left` | `center` | `right`, left: number, right: number, baseline: number, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorLeaf[]): void {
  const list = pieces(source, band, values, ctx, missing);
  const total = list.reduce((a, p) => a + p.width, 0);
  let x = align === `left` ? left : align === `right` ? right - total : (left + right) / 2 - total / 2;
  for (const p of list) {
    out.push(...p.item(x, baseline));
    x += p.width;
  }
}

// Interligne des zones sur plusieurs lignes, en points. L'en-tete grandit vers le haut et le pied de page vers le bas.
const ZONE_LINE_HEIGHT = 12;

const zoneLines = (s: string): string[] => s.split(/\r?\n/).slice(0, ZONE_MAX_LINES);

function bandItems(band: Band, odd: boolean, baseline: number, grow: -1 | 1, ruleY: number, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorItem[]): void {
  const zones: Zones = band.mirror && !odd ? band.verso : band.zones;
  const left = ctx.setup.marginLeft;
  const right = ctx.setup.width - ctx.setup.marginRight;
  const rows = Math.max(zoneLines(zones.left).length, zoneLines(zones.center).length, zoneLines(zones.right).length);
  // L'en-tete garde sa derniere ligne a la place habituelle, le pied de page sa premiere.
  const rowBaseline = (i: number): number => (grow === -1 ? baseline - (rows - 1 - i) * ZONE_LINE_HEIGHT : baseline + i * ZONE_LINE_HEIGHT);
  const leaves: DecorLeaf[] = [];
  for (const [key, align] of [[`left`, `left`], [`center`, `center`], [`right`, `right`]] as const) {
    zoneLines(zones[key]).forEach((line, i) => placeZone(line, band, align, left, right, rowBaseline(i), values, ctx, missing, leaves));
  }
  out.push(...leaves);
  if (band.rule) out.push({ kind: `rule`, x1: left, x2: right, y: ruleY });
}

// Bord exterieur : la bande est composee comme une ligne horizontale de la hauteur du texte, puis tournee. Les zones sont, de haut en
// bas, gauche (haut), centre (milieu) et droite (bas) ; le texte descend sur les pages de droite et monte sur celles de gauche.
function edgeItems(band: Band, odd: boolean, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorItem[]): void {
  const { setup } = ctx;
  const zones: Zones = band.mirror && !odd ? band.verso : band.zones;
  const length = setup.height - setup.marginTop - setup.marginBottom;
  const rows = Math.max(zoneLines(zones.left).length, zoneLines(zones.center).length, zoneLines(zones.right).length);
  // Le bloc de lignes est centre sur la ligne de base 0 (a une demi-hauteur de lettre pres).
  const rowBaseline = (i: number): number => (i - (rows - 1) / 2) * ZONE_LINE_HEIGHT;
  const leaves: DecorLeaf[] = [];
  // Sur les pages de gauche le texte monte : le haut de la page est la fin de la ligne.
  const alignOf: Record<`left` | `center` | `right`, `left` | `center` | `right`> = odd ? { left: `left`, center: `center`, right: `right` } : { left: `right`, center: `center`, right: `left` };
  for (const key of [`left`, `center`, `right`] as const) {
    zoneLines(zones[key]).forEach((line, i) => placeZone(line, band, alignOf[key], 0, length, rowBaseline(i), values, ctx, missing, leaves));
  }
  const glyphHalf = 3.5;
  const cx = odd ? setup.width - setup.marginRight / 2 : setup.marginLeft / 2;
  const qx = odd ? cx - glyphHalf : cx + glyphHalf;
  if (band.rule) {
    // Filet sur le cote interieur de la bande, a 6 points de la marge.
    const inner = odd ? setup.width - setup.marginRight + 6 : setup.marginLeft - 6;
    leaves.push({ kind: `rule`, x1: 0, x2: length, y: odd ? qx - inner : inner - qx });
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
    const values: PageValues = { document: ctx.title, chapter: titles[index].chapter, section: titles[index].section, author: ctx.author, date: ctx.date, page: page.number, pages: pages.length };
    const odd = page.number % 2 === 1;
    if (bandUsed(config.header)) {
      const baseline = ctx.setup.marginTop - HEADER_BASELINE_OFFSET;
      bandItems(config.header, odd, baseline, -1, baseline + RULE_GAP + 3, values, ctx, missing, out);
    }
    if (bandUsed(config.footer)) {
      const baseline = ctx.setup.height - FOOTER_BASELINE_OFFSET;
      bandItems(config.footer, odd, baseline, 1, baseline - 14, values, ctx, missing, out);
    }
    if (bandUsed(config.edge)) edgeItems(config.edge, odd, values, ctx, missing, out);
    return out;
  });
  return { pages: result, missing: [...missing] };
}

// Taille de texte (en points) d'un code de taille, pour les fenetres de reglage.
export const sizePoints = (code: SizeCode): number => SIZE_POINTS[code];

// Export de haute qualite : composition de l'en-tete, du pied de page et du numero de chaque page, d'apres les reglages de la note
// (voir src/page-config.ts). Le resultat est une liste d'elements positionnes (texte, image, forme, filet), identique pour l'apercu
// et le PDF. Le numero est dessine en dernier, donc au premier plan.
import { measureText, FontStyle } from "./font-metrics";
import type { ImageAsset } from "./image";
import type { Page } from "./paginate";
import type { PageSetup } from "./typeset";
import { Band, PageConfig, PageValues, parseZone, SIZE_POINTS, SizeCode, valueOf, Zones } from "../page-config";

export type DecorItem =
  | { kind: `text`; x: number; baseline: number; size: number; style: FontStyle; text: string; color: string }
  | { kind: `image`; target: string; x: number; y: number; width: number; height: number }
  | { kind: `shape`; shape: `circle` | `square` | `rounded`; x: number; y: number; width: number; height: number; fill: string; stroke: string }
  | { kind: `rule`; x1: number; x2: number; y: number };

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
  item: (x: number, baseline: number) => DecorItem;
}

// Morceaux d'une zone, avec leur largeur ; une image absente est signalee.
function pieces(source: string, values: PageValues, ctx: DecorContext, missing: Set<string>): Piece[] {
  const out: Piece[] = [];
  for (const t of parseZone(source)) {
    if (t.kind === `image`) {
      const asset = ctx.images?.get(t.target);
      if (!asset) {
        missing.add(t.target);
        continue;
      }
      const width = (t.height * asset.naturalWidth) / asset.naturalHeight;
      out.push({ width, item: (x, baseline) => ({ kind: `image`, target: t.target, x, y: baseline + 2 - t.height, width, height: t.height }) });
      continue;
    }
    const text = t.kind === `text` ? t.text : valueOf(t.name, values);
    if (text === ``) continue;
    const size = SIZE_POINTS[t.size];
    const style: FontStyle = t.bold && t.italic ? `boldItalic` : t.bold ? `bold` : t.italic ? `italic` : `regular`;
    out.push({ width: measureText(text, size, style).width, item: (x, baseline) => ({ kind: `text`, x, baseline, size, style, text, color: TEXT_COLOR }) });
  }
  return out;
}

function placeZone(source: string, align: `left` | `center` | `right`, left: number, right: number, baseline: number, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorItem[]): void {
  const list = pieces(source, values, ctx, missing);
  const total = list.reduce((a, p) => a + p.width, 0);
  let x = align === `left` ? left : align === `right` ? right - total : (left + right) / 2 - total / 2;
  for (const p of list) {
    out.push(p.item(x, baseline));
    x += p.width;
  }
}

function bandItems(band: Band, odd: boolean, baseline: number, ruleY: number, values: PageValues, ctx: DecorContext, missing: Set<string>, out: DecorItem[]): void {
  const zones: Zones = band.mirror && !odd ? band.verso : band.zones;
  const left = ctx.setup.marginLeft;
  const right = ctx.setup.width - ctx.setup.marginRight;
  placeZone(zones.left, `left`, left, right, baseline, values, ctx, missing, out);
  placeZone(zones.center, `center`, left, right, baseline, values, ctx, missing, out);
  placeZone(zones.right, `right`, left, right, baseline, values, ctx, missing, out);
  if (band.rule) out.push({ kind: `rule`, x1: left, x2: right, y: ruleY });
}

// Numero de la page, avec sa forme, au premier plan.
function numberItems(config: PageConfig, number: number, odd: boolean, ctx: DecorContext, out: DecorItem[]): void {
  const n = config.numbering;
  const { setup } = ctx;
  const size = SIZE_POINTS[n.size];
  const text = String(number);
  const w = measureText(text, size, `regular`).width;
  let cx: number;
  let baseline: number;
  if (n.place === `outer`) {
    // Dans la marge exterieure de la page, a mi-hauteur : a droite des pages de droite, a gauche des pages de gauche.
    cx = odd ? setup.width - setup.marginRight / 2 : setup.marginLeft / 2;
    baseline = setup.height / 2 + size * 0.35;
  } else {
    const band = n.place === `header` ? config.header : config.footer;
    baseline = n.place === `header` ? setup.marginTop - HEADER_BASELINE_OFFSET : setup.height - FOOTER_BASELINE_OFFSET;
    const left = setup.marginLeft;
    const right = setup.width - setup.marginRight;
    const pad = n.shape === `none` ? 0 : size * 1.0;
    // Exterieur et interieur suivent la symetrie quand la bande a des pages de gauche et de droite differentes, sinon : exterieur a droite.
    const rightIsOuter = band.mirror ? odd : true;
    const side = n.align === `center` ? `center` : (n.align === `outer`) === rightIsOuter ? `right` : `left`;
    cx = side === `center` ? (left + right) / 2 : side === `right` ? right - w / 2 - pad : left + w / 2 + pad;
  }
  if (n.shape !== `none`) {
    const s = Math.max(size * 2, w + size * 0.9);
    out.push({ kind: `shape`, shape: n.shape, x: cx - s / 2, y: baseline - size * 0.33 - s / 2, width: s, height: s, fill: n.fill, stroke: n.stroke });
  }
  out.push({ kind: `text`, x: cx - w / 2, baseline, size, style: `regular`, text, color: n.color });
}

export function layoutDecor(config: PageConfig, pages: Page[], ctx: DecorContext): DecorResult {
  const titles = runningTitles(pages);
  const missing = new Set<string>();
  const result: DecorItem[][] = pages.map((page, index) => {
    const out: DecorItem[] = [];
    if (index === 0 && config.skipFirst) return out;
    const values: PageValues = { document: ctx.title, chapter: titles[index].chapter, section: titles[index].section, author: ctx.author, date: ctx.date, page: page.number, pages: pages.length };
    const odd = page.number % 2 === 1;
    if (config.header.enabled) {
      const baseline = ctx.setup.marginTop - HEADER_BASELINE_OFFSET;
      bandItems(config.header, odd, baseline, baseline + RULE_GAP + 3, values, ctx, missing, out);
    }
    if (config.footer.enabled) {
      const baseline = ctx.setup.height - FOOTER_BASELINE_OFFSET;
      bandItems(config.footer, odd, baseline, baseline - 14, values, ctx, missing, out);
    }
    if (config.numbering.enabled) numberItems(config, page.number, odd, ctx, out);
    return out;
  });
  return { pages: result, missing: [...missing] };
}

// Taille de texte (en points) d'un code de taille, pour les fenetres de reglage.
export const sizePoints = (code: SizeCode): number => SIZE_POINTS[code];

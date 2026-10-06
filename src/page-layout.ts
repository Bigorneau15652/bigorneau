// Mise en page d'une note : format de la feuille, orientation, marges et nombre de colonnes. Les choix sont ecrits dans la note avec
// les reglages d'en-tete et de pied de page (voir page-config.ts). Ce module ne depend pas d'Obsidian.
import { A4_SETUP, PageSetup } from "./export/typeset";

export type FormatId = `a3` | `a4` | `a5` | `a6` | `b5` | `letter` | `legal` | `book6x9` | `book55x85`;
export type Orientation = `portrait` | `landscape`;
export type MarginId = `normal` | `narrow` | `wide`;

const MM = 72 / 25.4;
const IN = 72;

// Dimensions en points, en portrait (largeur puis hauteur).
export const FORMATS: Record<FormatId, { fr: string; en: string; width: number; height: number }> = {
  a3: { fr: `A3 (297 x 420 mm)`, en: `A3 (297 x 420 mm)`, width: 297 * MM, height: 420 * MM },
  // Les valeurs de l'A4 sont celles d'origine du moteur de mise en page (arrondies a deux decimales).
  a4: { fr: `A4 (210 x 297 mm)`, en: `A4 (210 x 297 mm)`, width: 595.28, height: 841.89 },
  a5: { fr: `A5 (148 x 210 mm)`, en: `A5 (148 x 210 mm)`, width: 148 * MM, height: 210 * MM },
  a6: { fr: `A6 (105 x 148 mm)`, en: `A6 (105 x 148 mm)`, width: 105 * MM, height: 148 * MM },
  b5: { fr: `B5 (176 x 250 mm)`, en: `B5 (176 x 250 mm)`, width: 176 * MM, height: 250 * MM },
  letter: { fr: `Lettre américaine (8,5 x 11 pouces)`, en: `US Letter (8.5 x 11 in)`, width: 8.5 * IN, height: 11 * IN },
  legal: { fr: `Légal américain (8,5 x 14 pouces)`, en: `US Legal (8.5 x 14 in)`, width: 8.5 * IN, height: 14 * IN },
  book6x9: { fr: `Livre 6 x 9 pouces`, en: `Book 6 x 9 in`, width: 6 * IN, height: 9 * IN },
  book55x85: { fr: `Livre 5,5 x 8,5 pouces`, en: `Book 5.5 x 8.5 in`, width: 5.5 * IN, height: 8.5 * IN },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];
export const MARGIN_IDS: MarginId[] = [`narrow`, `normal`, `wide`];

export interface PageLayout {
  format: FormatId;
  orientation: Orientation;
  margins: MarginId;
  columns: number;
}

export const defaultLayout = (): PageLayout => ({ format: `a4`, orientation: `portrait`, margins: `normal`, columns: 1 });

// Espace entre deux colonnes (1 cm) et largeur minimale d'une colonne (environ 4,6 cm : assez pour du texte courant).
export const COLUMN_GAP = 28.35;
export const MIN_COLUMN_WIDTH = 130;
export const MAX_COLUMNS = 8;

// Marges de l'A4 d'origine (2,5 cm) : etroites = moitie, larges = une fois et demie. Elles diminuent avec les petites feuilles.
const MARGIN_POINTS: Record<MarginId, number> = { narrow: 36, normal: 72, wide: 108 };

export function size(layout: PageLayout): { width: number; height: number } {
  const f = FORMATS[layout.format];
  return layout.orientation === `landscape` ? { width: f.height, height: f.width } : { width: f.width, height: f.height };
}

export function marginOf(layout: PageLayout): number {
  const s = size(layout);
  const factor = Math.min(1, Math.min(s.width, s.height) / A4_SETUP.width);
  return Math.round(MARGIN_POINTS[layout.margins] * factor * 100) / 100;
}

// Nombre maximal de colonnes de cette feuille : chacune garde au moins MIN_COLUMN_WIDTH.
export function maxColumns(layout: PageLayout): number {
  const text = size(layout).width - 2 * marginOf(layout);
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor((text + COLUMN_GAP) / (MIN_COLUMN_WIDTH + COLUMN_GAP))));
}

// Mise en page nettoyee : valeurs inconnues remplacees, colonnes ramenees au maximum permis.
export function sanitizeLayout(raw: unknown): PageLayout {
  const r = typeof raw === `object` && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = defaultLayout();
  const layout: PageLayout = {
    format: typeof r.format === `string` && (FORMAT_IDS as string[]).includes(r.format) ? (r.format as FormatId) : d.format,
    orientation: r.orientation === `landscape` ? `landscape` : `portrait`,
    margins: typeof r.margins === `string` && (MARGIN_IDS as string[]).includes(r.margins) ? (r.margins as MarginId) : d.margins,
    columns: typeof r.columns === `number` && Number.isFinite(r.columns) ? Math.max(1, Math.round(r.columns)) : 1,
  };
  layout.columns = Math.min(layout.columns, maxColumns(layout));
  return layout;
}

export const sameLayout = (a: PageLayout, b: PageLayout): boolean => JSON.stringify(a) === JSON.stringify(b);

// Reglages de la feuille entiere (dimensions et marges), pour l'apercu, le PDF et les en-tetes.
export function pageSetupOf(layout: PageLayout): PageSetup {
  const s = size(layout);
  const m = marginOf(layout);
  return { ...A4_SETUP, width: s.width, height: s.height, marginTop: m, marginBottom: m, marginLeft: m, marginRight: m };
}

// Largeur d'une colonne de texte.
export function columnWidthOf(layout: PageLayout): number {
  const setup = pageSetupOf(layout);
  const text = setup.width - setup.marginLeft - setup.marginRight;
  return (text - (layout.columns - 1) * COLUMN_GAP) / layout.columns;
}

// Reglages pour composer le texte : une « feuille » de la largeur d'une colonne et de la hauteur de la vraie feuille. Le texte est
// compose et mis en pages comme sur une seule colonne, puis les colonnes sont regroupees par feuille.
export function columnSetupOf(layout: PageLayout): PageSetup {
  const setup = pageSetupOf(layout);
  if (layout.columns <= 1) return setup;
  return { ...setup, width: columnWidthOf(layout) + setup.marginLeft + setup.marginRight };
}

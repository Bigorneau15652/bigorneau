// Export de haute qualite : de la note au fichier PDF, sans rien qui depende d'Obsidian (se teste avec node --test).
import { layoutDecor } from "./page-decor";
import { findPageConfig } from "../page-config";
import { buildExportDoc } from "./doc-tree";
import { languageOf } from "./typeset";
import { anchorPages, groupColumns, paginate, Page } from "./paginate";
import { columnSetupOf, columnWidthOf, defaultLayout, gapOf, pageSetupOf, PageLayout, sanitizeLayout } from "../page-layout";
import type { PageZone } from "../page-zone";
import { ImageAsset } from "./image";
import { inlineMathOf, MathAsset } from "./math";
import { buildPdf } from "./pdf";
import { DEFAULT_PAGE_STYLE, PageSetup, PageStyle, tocPlan, typesetDoc, TypesetDoc } from "./typeset";

export interface Composed {
  typeset: TypesetDoc;
  pages: Page[];
  // Feuille : dimensions et marges (celles de la mise en page de la note).
  setup: PageSetup;
  language: string;
  author?: string;
  title: string;
  images?: Map<string, ImageAsset>;
}

// Ce qui vient d'Obsidian avant la composition : images des figures et dessins des formules.
export interface ComposeAssets {
  // Date du jour ecrite dans la langue du document (variable {date} des en-tetes et pieds de page) ; par defaut, la date de l'appel.
  date?: string;
  // Dates de creation et de derniere modification du fichier de la note (millisecondes), ecrites par composeNote dans la langue du document.
  created?: number;
  modified?: number;
  // Auteur a utiliser quand la note n'en indique pas (reglage du plugin).
  defaultAuthor?: string;
  images?: Map<string, ImageAsset>;
  formulas?: Map<string, MathAsset>;
}

// Formules de la note, a dessiner avant la composition : en bloc ($$) ou en ligne ($).
export function formulaTargets(text: string, fileName: string): { tex: string; display: boolean }[] {
  const doc = buildExportDoc(text, fileName);
  const seen = new Set<string>();
  const out: { tex: string; display: boolean }[] = [];
  const add = (tex: string, display: boolean): void => {
    const key = `${display ? `D` : `I`}:${tex}`;
    if (tex !== `` && !seen.has(key)) {
      seen.add(key);
      out.push({ tex, display });
    }
  };
  const inText = (t: string | undefined): void => {
    for (const tex of inlineMathOf(t ?? ``)) add(tex, false);
  };
  const blocks = (list: ReturnType<typeof buildExportDoc>[`blocks`]): void => {
    for (const b of list) {
      if (b.type === `math`) add(b.tex, true);
      else if (b.type === `paragraph` || b.type === `quote`) inText(b.text);
      else if (b.type === `list`) for (const it of b.items) inText(it.text);
      else if (b.type === `table`) {
        inText(b.caption);
        for (const r of b.rows) for (const c of r) inText(c);
      } else if (b.type === `figure` || b.type === `media`) inText(b.caption);
    }
  };
  const sections = (list: typeof doc.sections): void => {
    for (const sec of list) {
      inText(sec.title);
      blocks(sec.blocks);
      sections(sec.sections);
    }
  };
  blocks(doc.blocks);
  sections(doc.sections);
  for (const f of Object.values(doc.footnotes)) inText(f);
  return out;
}

// Cibles des images que la note affiche (figures), pour les charger avant la composition.
export function imageTargets(text: string, fileName: string): { target: string; width?: number }[] {
  const out: { target: string; width?: number }[] = [];
  const walk = (blocks: ReturnType<typeof buildExportDoc>[`blocks`]): void => {
    for (const b of blocks) if (b.type === `figure`) out.push({ target: b.target, ...(b.width ? { width: b.width } : {}) });
  };
  const doc = buildExportDoc(text, fileName);
  walk(doc.blocks);
  const sections = (list: typeof doc.sections): void => {
    for (const s of list) {
      walk(s.blocks);
      sections(s.sections);
    }
  };
  sections(doc.sections);
  return out;
}

// Compose la note en pages (apercu et PDF partagent ce resultat, pour qu'ils soient identiques).
export function composeNote(text: string, fileName: string, explicitSetup: PageSetup | undefined = undefined, style: PageStyle = DEFAULT_PAGE_STYLE, assets: ComposeAssets = {}): Composed {
  const images = assets.images;
  const noteConfig = findPageConfig(text);
  const options = { ...(images ? { images } : {}), ...(assets.formulas ? { formulas: assets.formulas } : {}), ...(noteConfig ? { paragraphs: noteConfig.config.paragraphs } : {}) };
  const doc = buildExportDoc(text, fileName);
  // Mise en page de la note (format, orientation, marges, colonnes), sauf si une feuille est imposee : alors une seule colonne.
  const found = noteConfig;
  const layout = explicitSetup ? defaultLayout() : (found?.config.layout ?? defaultLayout());
  const setup = explicitSetup ?? pageSetupOf(layout);
  const columnSetup = explicitSetup ?? columnSetupOf(layout);
  // Zone d'une autre orientation (etiquettes %% page: paysage %%) : sa mise en page derive de celle de la note.
  const zoneLayout = (zone: PageZone | null): PageLayout => (zone === null ? layout : sanitizeLayout({ ...layout, orientation: zone.orientation, columns: zone.columns ?? layout.columns }));
  const zoneSetup = explicitSetup ? undefined : (zone: PageZone | null): PageSetup => (zone === null ? columnSetup : columnSetupOf(zoneLayout(zone)));
  // Le texte est compose d'une traite, puis coupe aux changements de zone : chaque partie est mise en pages avec sa feuille.
  const build = (pageOf: ((a: string) => number | undefined) | undefined): { typeset: TypesetDoc; pages: Page[] } => {
    const typeset = typesetDoc(doc, columnSetup, undefined, style, { ...options, ...(zoneSetup ? { zoneSetup } : {}), ...(pageOf ? { pageOf } : {}) });
    const parts: { zone: PageZone | null; rows: Page[`rows`] }[] = [{ zone: null, rows: [] }];
    for (const r of typeset.rows) {
      if (r.zoneStart) parts.push({ zone: r.zoneStart.zone, rows: [] });
      else parts[parts.length - 1].rows.push(r);
    }
    const pages: Page[] = [];
    const real = parts.filter((p, i) => i === 0 || p.rows.some((r) => r.kind !== `space`));
    for (const part of real) {
      const l = zoneLayout(part.zone);
      const first = pages.length + 1;
      let list = paginate({ rows: part.rows, footnotes: typeset.footnotes, title: typeset.title }, part.zone === null ? columnSetup : columnSetupOf(l), style, first);
      if (l.columns > 1) list = groupColumns(list, l.columns, columnWidthOf(l), gapOf(l), first);
      // Une partie dont la feuille n'est pas celle de la note la porte avec ses pages.
      const sheet = pageSetupOf(l);
      const differs = sheet.width !== setup.width || sheet.height !== setup.height;
      pages.push(...(differs ? list.map((p) => ({ ...p, setup: sheet })) : list));
    }
    return { typeset, pages };
  };
  // Table des matieres et renvois avec numero de page : la mise en page depend des numeros de page, qui dependent de la mise
  // en page. On recompose avec les numeros de la composition precedente jusqu'a ce qu'ils ne changent plus (quatre fois au plus).
  const plan = tocPlan(doc, style);
  const needsPages = plan.general > 0 || plan.chapter > 0 || style.pageRefs;
  let known: Map<string, number> | undefined;
  let { typeset, pages } = build(undefined);
  for (let pass = 0; needsPages && pass < 4; pass++) {
    const found = anchorPages(pages);
    if (known && sameMap(known, found)) break;
    known = found;
    ({ typeset, pages } = build((a: string) => found.get(a)));
  }
  // En-tete, pied de page et numero d'apres les reglages ecrits dans la note : ils remplacent ceux d'origine.
  if (found) {
    const english = languageOf(doc.language) === `en`;
    const format = new Intl.DateTimeFormat(english ? `en-GB` : `fr-FR`, { dateStyle: `long` });
    const date = assets.date ?? format.format(new Date());
    const dated = (ms: number | undefined): string => (ms === undefined ? `` : format.format(new Date(ms)));
    const decor = layoutDecor(found.config, pages, { setup, title: doc.title, author: doc.author ?? assets.defaultAuthor ?? ``, date, created: dated(assets.created), modified: dated(assets.modified), ...(images ? { images } : {}) });
    pages = pages.map((p, i) => {
      const { header: _header, footer: _footer, ...rest } = p;
      return { ...rest, decor: decor.pages[i] };
    });
    for (const target of decor.missing) typeset.warnings.push(`image:${target}`);
  }
  return {
    typeset,
    pages,
    setup,
    language: languageOf(doc.language) === `en` ? `en-GB` : `fr-FR`,
    ...(doc.author ? { author: doc.author } : {}),
    title: doc.title,
    ...(images ? { images } : {}),
  };
}

function sameMap(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export interface PdfRequest {
  // Auteur a ecrire dans le PDF quand la note n'en indique pas.
  defaultAuthor?: string;
  creator: string;
  created: Date;
  deflate?: (data: Uint8Array) => Promise<Uint8Array>;
}

export async function composeToPdf(composed: Composed, req: PdfRequest, setup: PageSetup = composed.setup): Promise<Uint8Array> {
  const author = composed.author ?? (req.defaultAuthor ? req.defaultAuthor : undefined);
  return buildPdf(composed.pages, setup, {
    title: composed.title,
    ...(author ? { author } : {}),
    language: composed.language,
    creator: req.creator,
    created: req.created,
    ...(composed.images ? { images: composed.images } : {}),
    ...(req.deflate ? { deflate: req.deflate } : {}),
  });
}

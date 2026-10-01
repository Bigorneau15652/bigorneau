// Export de haute qualite : de la note au fichier PDF, sans rien qui depende d'Obsidian (se teste avec node --test).
import { buildExportDoc } from "./doc-tree";
import { languageOf } from "./typeset";
import { anchorPages, paginate, Page } from "./paginate";
import { ImageAsset } from "./image";
import { inlineMathOf, MathAsset } from "./math";
import { buildPdf } from "./pdf";
import { A4_SETUP, DEFAULT_PAGE_STYLE, PageSetup, PageStyle, typesetDoc, TypesetDoc } from "./typeset";

export interface Composed {
  typeset: TypesetDoc;
  pages: Page[];
  language: string;
  author?: string;
  title: string;
  images?: Map<string, ImageAsset>;
}

// Ce qui vient d'Obsidian avant la composition : images des figures et dessins des formules.
export interface ComposeAssets {
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
export function composeNote(text: string, fileName: string, setup: PageSetup = A4_SETUP, style: PageStyle = DEFAULT_PAGE_STYLE, assets: ComposeAssets = {}): Composed {
  const images = assets.images;
  const options = { ...(images ? { images } : {}), ...(assets.formulas ? { formulas: assets.formulas } : {}) };
  const doc = buildExportDoc(text, fileName);
  // Table des matieres et renvois avec numero de page : la mise en page depend des numeros de page, qui dependent de la mise
  // en page. On recompose avec les numeros de la composition precedente jusqu'a ce qu'ils ne changent plus (quatre fois au plus).
  const needsPages = doc.toc !== undefined || style.pageRefs;
  let known: Map<string, number> | undefined;
  let typeset = typesetDoc(doc, setup, undefined, style, options);
  let pages = paginate(typeset, setup, style);
  for (let pass = 0; needsPages && pass < 4; pass++) {
    const found = anchorPages(pages);
    if (known && sameMap(known, found)) break;
    known = found;
    const pageOf = (a: string): number | undefined => found.get(a);
    typeset = typesetDoc(doc, setup, undefined, style, { ...options, pageOf });
    pages = paginate(typeset, setup, style);
  }
  return {
    typeset,
    pages,
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

export async function composeToPdf(composed: Composed, req: PdfRequest, setup: PageSetup = A4_SETUP): Promise<Uint8Array> {
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

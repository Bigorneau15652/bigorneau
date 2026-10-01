// Export de haute qualite : de la note au fichier PDF, sans rien qui depende d'Obsidian (se teste avec node --test).
import { buildExportDoc } from "./doc-tree";
import { languageOf } from "./typeset";
import { paginate, Page } from "./paginate";
import { buildPdf } from "./pdf";
import { A4_SETUP, DEFAULT_PAGE_STYLE, PageSetup, PageStyle, typesetDoc, TypesetDoc } from "./typeset";

export interface Composed {
  typeset: TypesetDoc;
  pages: Page[];
  language: string;
  author?: string;
  title: string;
}

// Compose la note en pages (apercu et PDF partagent ce resultat, pour qu'ils soient identiques).
export function composeNote(text: string, fileName: string, setup: PageSetup = A4_SETUP, style: PageStyle = DEFAULT_PAGE_STYLE): Composed {
  const doc = buildExportDoc(text, fileName);
  const typeset = typesetDoc(doc, setup, undefined, style);
  return {
    typeset,
    pages: paginate(typeset, setup, style),
    language: languageOf(doc.language) === `en` ? `en-GB` : `fr-FR`,
    ...(doc.author ? { author: doc.author } : {}),
    title: doc.title,
  };
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
    ...(req.deflate ? { deflate: req.deflate } : {}),
  });
}

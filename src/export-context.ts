// Export de haute qualite, cote Obsidian : choix de mise en page tires des reglages, chargement des images des figures et
// libelles du compte rendu. Le calcul de la mise en page est dans src/export (sans Obsidian).
import { App, TFile } from "obsidian";
import { formulaTargets, imageTargets } from "./export/compose";
import { displaySize, figureBounds, ImageAsset, imageCandidates, isImageTarget, isWebTarget, jpegInfo, targetPixels } from "./export/image";
import { MathAsset, mathKey } from "./export/math";
import { A4_SETUP, DEFAULT_PAGE_STYLE, PageStyle } from "./export/typeset";
import { configImages, findPageConfig, IMAGE_MAX_HEIGHT_PX, IMAGE_MAX_WIDTH_PX } from "./page-config";
import type { MathRenderer } from "./script-formulas";
import type { MmSettings } from "./settings";

export function pageStyleOf(settings: Pick<MmSettings, `exportFloats` | `exportFigureCaption` | `exportPageRefs` | `exportMedia` | `exportHeader` | `exportFooter` | `exportFlushBottom` | `exportChapterBreak` | `exportFootnoteNumbering` | `exportProtrusion` | `exportToc` | `exportTocDepth` | `exportChapterToc` | `exportChapterTocDepth`>): PageStyle {
  return {
    ...DEFAULT_PAGE_STYLE,
    header: settings.exportHeader,
    footer: settings.exportFooter,
    flushBottom: settings.exportFlushBottom,
    chapterBreak: settings.exportChapterBreak,
    footnoteNumbering: settings.exportFootnoteNumbering,
    floats: settings.exportFloats,
    figureCaption: settings.exportFigureCaption,
    pageRefs: settings.exportPageRefs,
    media: settings.exportMedia,
    protrusion: settings.exportProtrusion,
    toc: settings.exportToc,
    tocDepth: settings.exportTocDepth,
    chapterToc: settings.exportChapterToc,
    chapterTocDepth: settings.exportChapterTocDepth,
  };
}

export interface LoadedAssets {
  images: Map<string, ImageAsset>;
  formulas: Map<string, MathAsset>;
  // Adresses a liberer quand l'apercu se ferme.
  urls: string[];
}

const MIME: Record<string, string> = { png: `image/png`, jpg: `image/jpeg`, jpeg: `image/jpeg`, webp: `image/webp`, gif: `image/gif`, svg: `image/svg+xml`, bmp: `image/bmp`, avif: `image/avif` };

function fileFor(app: App, target: string, sourcePath: string): TFile | null {
  const clean = target.split(`#`)[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    // Adresse deja en clair.
  }
  return app.metadataCache.getFirstLinkpathDest(decoded, sourcePath) ?? app.metadataCache.getFirstLinkpathDest(clean, sourcePath);
}

// Charge les images des figures de la note : lues dans le coffre, decodees par le navigateur, reduites a 300 points par pouce au
// plus de la taille affichee. Les JPEG en couleurs sont gardes tels quels. Les images absentes ou illisibles n'ont pas d'entree :
// la composition les remplace par un repere et les signale.
export async function loadAssets(app: App, text: string, fileName: string, sourcePath: string, math?: MathRenderer): Promise<LoadedAssets> {
  const formulas = math ? await loadFormulas(text, fileName, math) : new Map<string, MathAsset>();
  const images = new Map<string, ImageAsset>();
  const urls: string[] = [];
  const bounds = figureBounds(A4_SETUP);
  const widths = new Map<string, number | undefined>();
  for (const { target, width } of imageTargets(text, fileName)) if (!widths.has(target) || widths.get(target) === undefined) widths.set(target, width);
  for (const [target, width] of widths) {
    if (!isImageTarget(target) || isWebTarget(target)) continue;
    // Un dessin Excalidraw se lit par son export image (.excalidraw.svg ou .excalidraw.png), sinon la cible elle-meme.
    for (const name of imageCandidates(target)) {
      const file = fileFor(app, name, sourcePath);
      if (!file || !isImageTarget(file.name) || /\.excalidraw(\.md)?$/i.test(file.name)) continue;
      try {
        const asset = await loadOne(app, file, width, bounds, urls);
        if (asset) {
          images.set(target, asset);
          break;
        }
      } catch {
        // Image illisible : traitee comme absente.
      }
    }
  }
  // Images de l'en-tete et du pied de page. Un dessin Excalidraw est lu par son export image (.excalidraw.svg ou .excalidraw.png).
  const found = findPageConfig(text);
  if (found) {
    for (const { target, width } of configImages(found.config)) {
      if (images.has(target) || isWebTarget(target)) continue;
      for (const name of imageCandidates(target)) {
        const file = fileFor(app, name, sourcePath);
        if (!file || !isImageTarget(file.name)) continue;
        try {
          const asset = await loadOne(app, file, width, { maxWidth: IMAGE_MAX_WIDTH_PX * 0.75, maxHeight: IMAGE_MAX_HEIGHT_PX * 0.75 }, urls);
          if (asset) {
            images.set(target, asset);
            break;
          }
        } catch {
          // Image illisible : traitee comme absente.
        }
      }
    }
  }
  return { images, formulas, urls };
}

async function loadOne(app: App, file: TFile, requestedWidth: number | undefined, bounds: { maxWidth: number; maxHeight: number }, urls: string[]): Promise<ImageAsset | null> {
  const bytes = new Uint8Array(await app.vault.readBinary(file));
  const ext = file.extension.toLowerCase();
  const blob = new Blob([bytes], { type: MIME[ext] ?? `application/octet-stream` });
  const url = URL.createObjectURL(blob);
  urls.push(url);
  const img = new Image();
  img.src = url;
  await img.decode();
  // Un SVG sans dimensions s'affiche en 300 par 150 pixels.
  const naturalWidth = img.naturalWidth > 0 ? img.naturalWidth : 300;
  const naturalHeight = img.naturalHeight > 0 ? img.naturalHeight : 150;
  const d = displaySize(naturalWidth, naturalHeight, requestedWidth, bounds.maxWidth, bounds.maxHeight);

  // JPEG en couleurs, non tourne par ses metadonnees : le fichier est repris tel quel.
  if (ext === `jpg` || ext === `jpeg`) {
    const info = jpegInfo(bytes);
    if (info && info.components === 3 && info.width === naturalWidth && info.height === naturalHeight) {
      return { naturalWidth, naturalHeight, pixelWidth: info.width, pixelHeight: info.height, kind: `jpeg`, data: bytes, previewUrl: url };
    }
  }

  // Autres formats (et SVG) : on trace l'image a la resolution voulue et on garde les pixels.
  const pw = ext === `svg` ? Math.max(1, Math.ceil((d.width / 72) * 300)) : targetPixels(naturalWidth, d.width);
  const ph = Math.max(1, Math.round((pw * naturalHeight) / naturalWidth));
  const canvas = document.createElement(`canvas`);
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext(`2d`);
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = `high`;
  ctx.drawImage(img, 0, 0, pw, ph);
  const rgba = ctx.getImageData(0, 0, pw, ph).data;
  const rgb = new Uint8Array(pw * ph * 3);
  const alpha = new Uint8Array(pw * ph);
  let translucent = false;
  for (let p = 0, q = 0; p < pw * ph; p++, q += 4) {
    rgb[p * 3] = rgba[q];
    rgb[p * 3 + 1] = rgba[q + 1];
    rgb[p * 3 + 2] = rgba[q + 2];
    alpha[p] = rgba[q + 3];
    if (rgba[q + 3] !== 255) translucent = true;
  }
  return { naturalWidth, naturalHeight, pixelWidth: pw, pixelHeight: ph, kind: `rgb`, data: rgb, ...(translucent ? { alpha } : {}), previewUrl: url };
}

// Dessin des formules de la note par le service du script Formules. Une formule que MathJax refuse n'a pas d'entree : la composition
// garde son texte et le signale.
async function loadFormulas(text: string, fileName: string, render: MathRenderer): Promise<Map<string, MathAsset>> {
  const out = new Map<string, MathAsset>();
  for (const { tex, display } of formulaTargets(text, fileName)) {
    const asset = await render(tex, display);
    if (asset) out.set(mathKey(tex, display), asset);
  }
  return out;
}

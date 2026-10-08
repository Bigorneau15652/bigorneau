// Export de haute qualite, cote Obsidian : choix de mise en page tires des reglages, chargement des images des figures et
// libelles du compte rendu. Le calcul de la mise en page est dans src/export (sans Obsidian).
import { App, TFile } from "obsidian";
import { formulaTargets, imageTargets } from "./export/compose";
import { displaySize, figureBounds, ImageAsset, imageCandidates, isImageTarget, isWebTarget, jpegInfo, targetPixels } from "./export/image";
import { excalidrawSvg } from "./excalidraw-export";
import { isExcalidrawTarget } from "./export/image";
import { MathAsset, mathKey } from "./export/math";
import { DEFAULT_PAGE_STYLE, PageStyle } from "./export/typeset";
import { columnSetupOf, defaultLayout } from "./page-layout";
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
  // Zone des figures : la largeur d'une colonne de la mise en page de la note.
  const bounds = figureBounds(columnSetupOf(findPageConfig(text)?.config.layout ?? defaultLayout()));
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
    // Dessin Excalidraw sans fichier d'export : l'image est demandee au plugin Excalidraw.
    if (!images.has(target) && isExcalidrawTarget(target)) {
      const drawn = await loadDrawing(app, target, sourcePath, width, bounds, urls);
      if (drawn) images.set(target, drawn);
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
      if (!images.has(target) && isExcalidrawTarget(target)) {
        const drawn = await loadDrawing(app, target, sourcePath, width, { maxWidth: IMAGE_MAX_WIDTH_PX * 0.75, maxHeight: IMAGE_MAX_HEIGHT_PX * 0.75 }, urls);
        if (drawn) images.set(target, drawn);
      }
    }
  }
  return { images, formulas, urls };
}

// Images deja decodees, gardees d'une composition a l'autre : l'apercu de l'export est recompose a chaque pause de frappe, et relire,
// decoder et reduire chaque image (ou redemander son dessin a Excalidraw) a chaque fois le rendrait tres lent. Une image garde son entree
// tant que son fichier, sa taille d'affichage et sa date de modification ne changent pas. La memoire reservee est plafonnee.
const IMAGE_CACHE_LIMIT_BYTES = 120 * 1024 * 1024;
const imageCache = new Map<string, { asset: ImageAsset; blob: Blob | null; bytes: number }>();
// Fichier d'origine de chaque image decodee, pour redonner une adresse d'apercu valide quand elle est reprise du cache.
const sourceBlobs = new WeakMap<ImageAsset, Blob>();

const sizeOf = (asset: ImageAsset, blob: Blob | null): number => asset.data.length + (asset.alpha?.length ?? 0) + (blob?.size ?? 0);

async function cachedImage(key: string, urls: string[], make: () => Promise<ImageAsset | null>): Promise<ImageAsset | null> {
  const hit = imageCache.get(key);
  if (hit) {
    // Entree reprise : elle devient la plus recente, et l'apercu recoit une adresse neuve (les anciennes sont liberees a chaque recomposition).
    imageCache.delete(key);
    imageCache.set(key, hit);
    if (!hit.blob) return hit.asset;
    const url = URL.createObjectURL(hit.blob);
    urls.push(url);
    return { ...hit.asset, previewUrl: url };
  }
  const asset = await make();
  if (!asset) return null;
  const blob = sourceBlobs.get(asset) ?? null;
  imageCache.set(key, { asset, blob, bytes: sizeOf(asset, blob) });
  let total = 0;
  for (const e of imageCache.values()) total += e.bytes;
  for (const k of Array.from(imageCache.keys())) {
    if (total <= IMAGE_CACHE_LIMIT_BYTES || imageCache.size <= 1) break;
    total -= imageCache.get(k)?.bytes ?? 0;
    imageCache.delete(k);
  }
  return asset;
}

const boundsKey = (b: { maxWidth: number; maxHeight: number }): string => `${Math.round(b.maxWidth)}x${Math.round(b.maxHeight)}`;

// Dessin Excalidraw dont l'image n'a pas ete exportee : le plugin Excalidraw en fournit le SVG.
async function loadDrawing(app: App, target: string, sourcePath: string, requestedWidth: number | undefined, bounds: { maxWidth: number; maxHeight: number }, urls: string[]): Promise<ImageAsset | null> {
  const file = fileFor(app, target, sourcePath) ?? fileFor(app, `${target.replace(/\.md$/i, ``)}.md`, sourcePath);
  if (!file) return null;
  return cachedImage(`drawing|${file.path}|${file.stat.mtime}|${file.stat.size}|${requestedWidth ?? ``}|${boundsKey(bounds)}`, urls, async () => {
    const svg = await excalidrawSvg(app, file);
    if (!svg) return null;
    try {
      return await loadBytes(new TextEncoder().encode(svg), `svg`, requestedWidth, bounds, urls);
    } catch {
      return null;
    }
  });
}

async function loadOne(app: App, file: TFile, requestedWidth: number | undefined, bounds: { maxWidth: number; maxHeight: number }, urls: string[]): Promise<ImageAsset | null> {
  return cachedImage(`file|${file.path}|${file.stat.mtime}|${file.stat.size}|${requestedWidth ?? ``}|${boundsKey(bounds)}`, urls, async () =>
    loadBytes(new Uint8Array(await app.vault.readBinary(file)), file.extension.toLowerCase(), requestedWidth, bounds, urls)
  );
}

function remember(asset: ImageAsset, blob: Blob): ImageAsset {
  sourceBlobs.set(asset, blob);
  return asset;
}

async function loadBytes(bytes: Uint8Array<ArrayBuffer>, ext: string, requestedWidth: number | undefined, bounds: { maxWidth: number; maxHeight: number }, urls: string[]): Promise<ImageAsset | null> {
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
      return remember({ naturalWidth, naturalHeight, pixelWidth: info.width, pixelHeight: info.height, kind: `jpeg`, data: bytes, previewUrl: url }, blob);
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
  return remember({ naturalWidth, naturalHeight, pixelWidth: pw, pixelHeight: ph, kind: `rgb`, data: rgb, ...(translucent ? { alpha } : {}), previewUrl: url }, blob);
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

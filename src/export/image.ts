// Export de haute qualite : images des figures. Ce module ne depend pas d'Obsidian : le chargement des fichiers et leur
// decodage se font cote Obsidian (export-images.ts) ; ici on ne garde que ce qui sert a la composition et au PDF.

// Image prete a etre placee : pixels deja reduits a 300 points par pouce au plus de la taille affichee.
export interface ImageAsset {
  // Taille de l'image d'origine, en pixels (96 par pouce) : c'est la taille naturelle d'affichage.
  naturalWidth: number;
  naturalHeight: number;
  // Taille des pixels conserves.
  pixelWidth: number;
  pixelHeight: number;
  // `jpeg` : octets du fichier JPEG tels quels ; `rgb` : pixels RGB sur 8 bits, ligne apres ligne.
  kind: `jpeg` | `rgb`;
  data: Uint8Array;
  // Transparence (un octet par pixel), si l'image en a.
  alpha?: Uint8Array;
  // Adresse utilisable dans l'apercu (image d'origine).
  previewUrl?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif|excalidraw(\.md)?)$/i;
const EXCALIDRAW_EXT = /\.excalidraw(\.md)?$/i;

// Vrai si la cible d'une figure est un fichier image (les autres medias sont traites a la phase 6).
export function isImageTarget(target: string): boolean {
  return IMAGE_EXT.test(target.split(/[?#]/)[0]);
}

// Dessin Excalidraw (![[dessin.excalidraw]]) : il s'imprime par son export image, .excalidraw.svg ou .excalidraw.png, que le plugin
// Excalidraw ecrit a cote du dessin quand son export automatique est active.
export function isExcalidrawTarget(target: string): boolean {
  return EXCALIDRAW_EXT.test(target.split(/[?#]/)[0]);
}

// Noms de fichier a essayer, dans l'ordre, pour une cible de figure : l'export image d'un dessin Excalidraw, sinon la cible elle-meme.
export function imageCandidates(target: string): string[] {
  const clean = target.split(`#`)[0];
  if (!isExcalidrawTarget(clean)) return [clean];
  const base = clean.replace(/\.md$/i, ``);
  return [`${base}.svg`, `${base}.png`];
}

export function isWebTarget(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

// Pixels de l'ecran (96 par pouce) vers points (72 par pouce).
export const PT_PER_PX = 0.75;
// Resolution maximale conservee dans le PDF, en points par pouce.
export const MAX_DPI = 300;

// Taille d'affichage d'une image, en points : largeur demandee (en pixels) sinon taille naturelle, reduite pour tenir dans la
// zone disponible en gardant les proportions.
export function displaySize(naturalWidth: number, naturalHeight: number, requestedWidth: number | undefined, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const ratio = naturalHeight > 0 && naturalWidth > 0 ? naturalHeight / naturalWidth : 1;
  let width = (requestedWidth && requestedWidth > 0 ? requestedWidth : naturalWidth > 0 ? naturalWidth : 200) * PT_PER_PX;
  let height = width * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width * ratio;
  }
  if (height > maxHeight) {
    height = maxHeight;
    width = height / ratio;
  }
  return { width, height };
}

// Nombre de pixels a conserver pour une taille d'affichage donnee : 300 points par pouce au plus.
export function targetPixels(naturalPixels: number, displayPoints: number): number {
  const wanted = Math.ceil((displayPoints / 72) * MAX_DPI);
  return Math.max(1, Math.min(naturalPixels, wanted));
}

// Zone maximale d'une image : la largeur de la colonne, et 70 % de la hauteur du texte pour que la legende tienne avec elle.
export function figureBounds(setup: { width: number; height: number; marginTop: number; marginBottom: number; marginLeft: number; marginRight: number }): { maxWidth: number; maxHeight: number } {
  return { maxWidth: setup.width - setup.marginLeft - setup.marginRight, maxHeight: (setup.height - setup.marginTop - setup.marginBottom) * 0.7 };
}

// Dimensions et nombre de composantes d'un fichier JPEG (3 : couleurs RGB, qu'un PDF peut reprendre tel quel), lues dans
// l'en-tete SOF. Renvoie null si le fichier n'est pas un JPEG lisible.
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; components: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Reperes sans longueur.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    i += 2 + length;
  }
  return null;
}

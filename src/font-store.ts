// Polices ajoutees au coffre, cote Obsidian : lecture des fichiers du dossier choisi, enregistrement des familles pour la composition
// et pour l'apercu. Les fichiers ne sont relus que lorsque le dossier change (nom, taille ou date d'un fichier).
import { App, normalizePath, TFile } from "obsidian";
import { clearFontFamilies, parseUserStyle, registerFontFamily, resolvedVariant, Variant } from "./export/font-metrics";
import { buildLibrary, extensionOf, FONT_EXTENSIONS, FontFile, FontLibrary, REJECTED_EXTENSIONS } from "./font-library";

// Le type FontFaceSet de la bibliotheque de types n'a pas add ni delete.
const faceSet = (): { add(f: FontFace): void; delete(f: FontFace): void } => document.fonts as unknown as { add(f: FontFace): void; delete(f: FontFace): void };

const KNOWN = [...FONT_EXTENSIONS, ...REJECTED_EXTENSIONS];

// Rend la main a Obsidian entre deux fichiers : sans cela, lire de nombreuses polices gele l'interface pendant tout le chargement.
const pause = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

export class FontStore {
  library: FontLibrary = { families: [], problems: [] };
  private signature = ``;
  private faces: FontFace[] = [];
  private listeners = new Set<() => void>();
  private running: Promise<boolean> | null = null;
  private destroyed = false;

  constructor(private app: App, private folder: () => string) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Le fichier est-il dans le dossier des polices ?
  isFontPath(path: string): boolean {
    const folder = normalizePath(this.folder());
    return folder !== `` && path.startsWith(`${folder}/`) && KNOWN.includes(extensionOf(path));
  }

  private files(): TFile[] {
    const folder = normalizePath(this.folder());
    if (folder === ``) return [];
    return this.app.vault.getFiles().filter((f) => f.path.startsWith(`${folder}/`) && KNOWN.includes(f.extension.toLowerCase()));
  }

  // Relit le dossier si son contenu a change. Renvoie vrai quand les familles ont ete mises a jour.
  refresh(force = false): Promise<boolean> {
    if (this.running) return this.running;
    this.running = this.run(force).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(force: boolean): Promise<boolean> {
    const files = this.files();
    const signature = files
      .map((f) => `${f.path}|${f.stat.mtime}|${f.stat.size}`)
      .sort()
      .join(`\n`);
    if (!force && signature === this.signature) return false;
    const read: FontFile[] = [];
    for (const f of files) {
      try {
        read.push({ path: f.path, bytes: new Uint8Array(await this.app.vault.readBinary(f)) });
      } catch {
        read.push({ path: f.path, bytes: new Uint8Array(0) });
      }
      await pause();
    }
    if (this.destroyed) return false;
    this.library = buildLibrary(read);
    this.signature = signature;
    clearFontFamilies();
    for (const family of this.library.families) registerFontFamily(family.id, family.fonts);
    // La composition peut deja se servir des polices : on previent tout de suite, puis une seconde fois quand l'apercu a les siennes.
    for (const l of this.listeners) l();
    if (await this.registerFaces(read)) for (const l of this.listeners) l();
    return true;
  }

  // Polices de l'apercu : le navigateur doit connaitre chaque fichier sous un nom de famille CSS. Une seule a la fois, avec une pause
  // entre deux, pour ne pas figer l'interface. Renvoie vrai quand au moins une police a ete ajoutee.
  private async registerFaces(read: FontFile[]): Promise<boolean> {
    for (const face of this.faces) faceSet().delete(face);
    this.faces = [];
    const bytes = new Map(read.map((f) => [f.path, f.bytes]));
    for (const family of this.library.families) {
      for (const [variant, path] of Object.entries(family.paths) as [Variant, string][]) {
        const data = bytes.get(path);
        if (!data) continue;
        try {
          // Le navigateur copie les octets : inutile d'en faire une copie de plus.
          const face = new FontFace(cssFamily(family.id, variant), data as unknown as BufferSource);
          await face.load();
          if (this.destroyed) return false;
          faceSet().add(face);
          this.faces.push(face);
        } catch {
          // Le navigateur refuse ce fichier : la composition l'utilise quand meme, l'apercu affiche une autre police.
        }
        await pause();
      }
    }
    return this.faces.length > 0;
  }

  destroy(): void {
    this.destroyed = true;
    for (const face of this.faces) faceSet().delete(face);
    this.faces = [];
    clearFontFamilies();
    this.listeners.clear();
  }
}

export const cssFamily = (id: string, variant: Variant): string => `mmwu-${id}-${variant}`;

// Nom de famille CSS de l'apercu pour un style de composition (u:famille:variante), ou null pour les polices d'origine.
export function cssFamilyOf(style: string): string | null {
  const u = parseUserStyle(style);
  if (!u) return null;
  const variant = resolvedVariant(u.family, u.variant);
  return variant ? cssFamily(u.family, variant) : null;
}

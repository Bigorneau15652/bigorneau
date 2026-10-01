// Chargement de la police de l'export (Libertinus Serif) dans le navigateur d'Obsidian, pour que l'apercu s'affiche avec la
// meme police que celle qui a servi a mesurer le texte.
import { FONT_WOFF_BASE64 } from "./export/font-libertinus";

export const EXPORT_FONT_FAMILY = `MMW Libertinus Serif`;

let loading: Promise<boolean> | null = null;

// Charge la police une seule fois. Renvoie faux si le navigateur la refuse : l'apercu utilise alors une police de secours
// et ses lignes ne tombent plus exactement.
export function loadExportFont(): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      try {
        const binary = atob(FONT_WOFF_BASE64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const face = new FontFace(EXPORT_FONT_FAMILY, bytes.buffer, { weight: `400`, style: `normal` });
        await face.load();
        (document.fonts as unknown as { add(f: FontFace): void }).add(face);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return loading;
}

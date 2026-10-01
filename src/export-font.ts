// Chargement des polices de l'export (Libertinus Serif : normal, italique, gras, gras italique ; Libertinus Mono) dans le navigateur
// d'Obsidian, pour que l'apercu s'affiche avec les memes polices que celles qui ont servi a mesurer le texte.
import { FONT_STYLES, fontBytes, FontStyle } from "./export/font-metrics";

export const EXPORT_FONT_FAMILY = `MMW Libertinus Serif`;
export const EXPORT_MONO_FAMILY = `MMW Libertinus Mono`;

const DESCRIPTORS: Record<FontStyle, { weight: string; style: string }> = {
  regular: { weight: `400`, style: `normal` },
  italic: { weight: `400`, style: `italic` },
  bold: { weight: `700`, style: `normal` },
  boldItalic: { weight: `700`, style: `italic` },
  mono: { weight: `400`, style: `normal` },
};

let loading: Promise<boolean> | null = null;

// Charge les cinq polices une seule fois. Renvoie faux si le navigateur en refuse une : l'apercu utilise alors une police
// de secours et ses lignes ne tombent plus exactement.
export function loadExportFont(): Promise<boolean> {
  if (!loading) {
    loading = (async () => {
      try {
        for (const style of FONT_STYLES) {
          const bytes = fontBytes(style);
          const face = new FontFace(style === `mono` ? EXPORT_MONO_FAMILY : EXPORT_FONT_FAMILY, bytes.slice().buffer, DESCRIPTORS[style]);
          await face.load();
          (document.fonts as unknown as { add(f: FontFace): void }).add(face);
        }
        return true;
      } catch {
        return false;
      }
    })();
  }
  return loading;
}

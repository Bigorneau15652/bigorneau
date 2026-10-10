// Image d'un dessin Excalidraw pour l'export PDF. Quand l'export automatique d'Excalidraw n'a pas ecrit de fichier .excalidraw.svg ou
// .excalidraw.png a cote du dessin, on demande l'image au plugin Excalidraw lui-meme (son interface d'automatisation) : le dessin
// s'imprime sans reglage a faire. Parties non documentees de l'application : chaque appel est protege.
import type { App, TFile } from "obsidian";

const EXCALIDRAW_PLUGIN = `obsidian-excalidraw-plugin`;

interface ExcalidrawAutomate {
  reset?: () => void;
  createSVG?: (templatePath?: string, embedFont?: boolean, exportSettings?: { withBackground: boolean; withTheme: boolean }, loader?: unknown, theme?: string, padding?: number) => Promise<SVGSVGElement>;
}

interface AppWithPlugins {
  plugins?: { plugins?: Record<string, { ea?: ExcalidrawAutomate } | undefined> };
}

// Dessin au format SVG (texte), fond blanc et couleurs du theme clair, ou null si Excalidraw est absent ou refuse.
export async function excalidrawSvg(app: App, file: TFile): Promise<string | null> {
  const ea = (app as unknown as AppWithPlugins).plugins?.plugins?.[EXCALIDRAW_PLUGIN]?.ea;
  if (!ea || typeof ea.createSVG !== `function`) return null;
  try {
    ea.reset?.();
    // Excalidraw may never answer: after 10 seconds the drawing is treated as absent instead of blocking the preview and the export.
    const wait = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 10000));
    const svg = await Promise.race([ea.createSVG(file.path, true, { withBackground: true, withTheme: false }, undefined, `light`), wait]);
    return svg ? new XMLSerializer().serializeToString(svg) : null;
  } catch {
    return null;
  }
}

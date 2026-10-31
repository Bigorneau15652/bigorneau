// HTML export from Obsidian: loads the pictures, the formulas and the fonts of the note, renders one self-contained page and writes it into
// the vault. The export never changes the note.
import { Notice, Platform, TFile } from "obsidian";
import { buildExportDoc } from "./export/doc-tree";
import { builtinFontCss, userFontCss } from "./export/html/html-assets";
import { renderHtml } from "./export/html/html-doc";
import { pannellumAssets } from "./export/html/pannellum-assets";
import { ExportReportModal, ExportTarget, targetPath } from "./export-dialog";
import { loadFormulas, loadHtmlImages } from "./export-context";
import { warningLines } from "./export-report";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";
import { findPageConfig } from "./page-config";
import { MATH_SERVICE, MathRenderer } from "./script-formulas";
import { applyOverrides } from "./text-style";

// Size in megabytes with one decimal, for the report.
const megabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

// Writes the HTML page of the note at the place chosen in the export window.
export async function exportNoteToHtml(plugin: MindmapWritingPlugin, file: TFile, target: ExportTarget): Promise<void> {
  if (!Platform.isDesktop) return;
  const path = targetPath(target, `html`);
  const notice = new Notice(t(`Composition de la page HTML…`), 0);
  try {
    const text = plugin.getOpenText(file) ?? (await plugin.app.vault.read(file));
    // Leaves time to show the message before the work starts.
    await new Promise((r) => window.setTimeout(r, 30));
    await plugin.fonts.refresh();
    const config = findPageConfig(text)?.config;
    const typography = applyOverrides(plugin.settings.typography, config?.typography);
    const math = plugin.scripts.service<MathRenderer>(MATH_SERVICE);
    const formulas = math ? await loadFormulas(text, file.name, math) : new Map();
    const images = await loadHtmlImages(plugin.app, text, file.name, file.path, plugin.settings.exportHtmlPanoramas);
    const panorama = [...images.values()].some((i) => i.panorama) ? pannellumAssets() : undefined;
    const result = renderHtml(buildExportDoc(text, file.name), {
      images,
      formulas,
      typography,
      ...(config ? { paragraphs: config.paragraphs } : {}),
      fontCss: builtinFontCss() + userFontCss(typography, plugin.fonts.library.families),
      ...(panorama ? { panorama } : {}),
    });
    const folder = path.includes(`/`) ? path.slice(0, path.lastIndexOf(`/`)) : ``;
    if (folder !== `` && !plugin.app.vault.getAbstractFileByPath(folder)) await plugin.app.vault.createFolder(folder);
    const existing = plugin.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await plugin.app.vault.modify(existing, result.html);
    else await plugin.app.vault.create(path, result.html);
    notice.hide();

    const size = megabytes(new Blob([result.html]).size);
    const lines = warningLines(result.warnings, { formulasEnabled: plugin.scripts.isEnabled(`formulas`) });
    if (lines.length > 0) new ExportReportModal(plugin.app, path, [...lines, t(`Taille du fichier : {0} Mo.`, size)], `html`).open();
    else new Notice(t(`HTML enregistré : {0} ({1} Mo)`, path, size));
  } catch (e) {
    notice.hide();
    new Notice(t(`L'export a échoué : {0}`, e instanceof Error ? e.message : String(e)), 8000);
  }
}

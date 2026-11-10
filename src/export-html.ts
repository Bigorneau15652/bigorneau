// HTML export from Obsidian: loads the pictures, the formulas and the fonts of the note, renders one self-contained page and writes it into
// the vault. The export never changes the note.
import { App, Notice, Platform, TFile, TFolder } from "obsidian";
import { buildExportDoc } from "./export/doc-tree";
import { builtinFontCss, builtinFontFiles, ExportFile, userFontCss, userFontFiles } from "./export/html/html-assets";
import { renderHtml } from "./export/html/html-doc";
import { pannellumAssets } from "./export/html/pannellum-assets";
import { ExportReportModal, ExportTarget, targetFolderPath, targetPath } from "./export-dialog";
import { HtmlMediaSink, loadFormulas, loadHtmlImages } from "./export-context";
import { warningLines } from "./export-report";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";
import { findPageConfig } from "./page-config";
import { MATH_SERVICE, MathRenderer } from "./script-formulas";
import { applyOverrides } from "./text-style";

// Size in megabytes with one decimal, for the report.
const megabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

// Creates a folder of the vault and the folders above it that are missing.
async function ensureFolder(app: App, path: string): Promise<void> {
  let current = ``;
  for (const part of path.split(`/`).filter((p) => p !== ``)) {
    current = current === `` ? part : `${current}/${part}`;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}

// Writes a text or a binary file of the vault, replacing the one that is there.
async function writeVaultFile(app: App, path: string, data: string | Uint8Array): Promise<void> {
  await ensureFolder(app, path.includes(`/`) ? path.slice(0, path.lastIndexOf(`/`)) : ``);
  const existing = app.vault.getAbstractFileByPath(path);
  if (typeof data === `string`) {
    if (existing instanceof TFile) await app.vault.modify(existing, data);
    else await app.vault.create(path, data);
    return;
  }
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  if (existing instanceof TFile) await app.vault.modifyBinary(existing, buffer);
  else await app.vault.createBinary(path, buffer);
}

// Writes the HTML export of the note at the place chosen in the export window: one file, or (folder) a folder with index.html and
// the pictures, the fonts and the panorama viewer in their own folders.
export async function exportNoteToHtml(plugin: MindmapWritingPlugin, file: TFile, target: ExportTarget, folderMode = false): Promise<void> {
  if (!Platform.isDesktop) return;
  const base = targetFolderPath(target);
  const path = folderMode ? `${base}/index.html` : targetPath(target, `html`);
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
    const sink: HtmlMediaSink | undefined = folderMode ? { files: [], taken: new Set() } : undefined;
    const images = await loadHtmlImages(plugin.app, text, file.name, file.path, plugin.settings.exportHtmlPanoramas, sink);
    const panorama = [...images.values()].some((i) => i.panorama) ? pannellumAssets() : undefined;
    const builtinFonts = folderMode ? builtinFontFiles() : null;
    const userFonts = folderMode ? userFontFiles(typography, plugin.fonts.library.families) : null;
    const result = renderHtml(buildExportDoc(text, file.name), {
      images,
      formulas,
      typography,
      ...(config ? { paragraphs: config.paragraphs } : {}),
      fontCss: builtinFonts && userFonts ? builtinFonts.css + userFonts.css : builtinFontCss() + userFontCss(typography, plugin.fonts.library.families),
      ...(panorama ? { panorama: folderMode ? { ...panorama, jsUrl: `lib/pannellum.js`, cssUrl: `lib/pannellum.css` } : panorama } : {}),
      ...(folderMode ? { separate: true } : {}),
    });
    let total = new Blob([result.html]).size;
    let count = 1;
    if (folderMode && sink && builtinFonts && userFonts) {
      // The folders of the export are made again: the files of an older export that the page no longer uses must not stay.
      for (const sub of [`medias`, `polices`, `lib`]) {
        const old = plugin.app.vault.getAbstractFileByPath(`${base}/${sub}`);
        if (old instanceof TFolder) await plugin.app.fileManager.trashFile(old);
      }
      const groups: [string, ExportFile[]][] = [
        [`medias`, sink.files],
        [`polices`, [...builtinFonts.files, ...userFonts.files]],
        [`lib`, panorama ? [{ name: `pannellum.js`, bytes: new TextEncoder().encode(panorama.js) }, { name: `pannellum.css`, bytes: new TextEncoder().encode(panorama.css) }] : []],
      ];
      for (const [sub, files] of groups) {
        for (const f of files) {
          await writeVaultFile(plugin.app, `${base}/${sub}/${f.name}`, f.bytes);
          total += f.bytes.length;
          count++;
        }
      }
      await writeVaultFile(plugin.app, path, result.html);
    } else {
      await writeVaultFile(plugin.app, path, result.html);
    }
    notice.hide();

    const size = megabytes(total);
    const lines = warningLines(result.warnings, { formulasEnabled: plugin.scripts.isEnabled(`formulas`) });
    const sizeLine = folderMode ? t(`Taille du dossier : {0} Mo en {1} fichiers.`, size, count) : t(`Taille du fichier : {0} Mo.`, size);
    if (lines.length > 0) new ExportReportModal(plugin.app, path, [...lines, sizeLine], `html`).open();
    else new Notice(folderMode ? t(`Dossier HTML enregistré : {0} ({1} Mo, {2} fichiers)`, base, size, count) : t(`HTML enregistré : {0} ({1} Mo)`, path, size));
  } catch (e) {
    notice.hide();
    new Notice(t(`L'export a échoué : {0}`, e instanceof Error ? e.message : String(e)), 8000);
  }
}

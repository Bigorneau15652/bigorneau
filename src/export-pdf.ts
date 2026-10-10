// Export en PDF depuis Obsidian : composition de la note, choix de l'emplacement, ecriture du fichier dans le coffre et compte
// rendu. L'export ne modifie jamais les notes.
import { Notice, Platform, TFile } from "obsidian";
import { composeNote, composeToPdf } from "./export/compose";
import { ExportDialog, ExportReportModal, targetPath } from "./export-dialog";
import { loadAssets, pageStyleOf } from "./export-context";
import { missingCharsLine, warningLines } from "./export-report";
import { MATH_SERVICE, MathRenderer } from "./script-formulas";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

// Compression Flate des flux du PDF, par le navigateur d'Obsidian.
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const g = window as unknown as { CompressionStream?: new (format: string) => { readable: ReadableStream; writable: WritableStream } };
  if (!g.CompressionStream) return data;
  const stream = new Blob([data.slice().buffer]).stream().pipeThrough(new g.CompressionStream(`deflate`));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function askTarget(plugin: MindmapWritingPlugin, file: TFile): Promise<{ folder: string; name: string } | null> {
  return new Promise((resolve) => {
    const folder = file.parent && file.parent.path !== `/` ? file.parent.path : ``;
    new ExportDialog(plugin.app, { folder, name: `${file.basename}.pdf` }, resolve).open();
  });
}

// Composes the note and writes it as a PDF (the same pages as the preview). Used by the export and by the print button.
async function makePdf(plugin: MindmapWritingPlugin, file: TFile): Promise<{ pdf: Uint8Array; composed: ReturnType<typeof composeNote> }> {
  const text = plugin.getOpenText(file) ?? (await plugin.app.vault.read(file));
  // Laisse le temps d'afficher le message avant le calcul.
  await new Promise((r) => window.setTimeout(r, 30));
  await plugin.fonts.refresh();
  const { images, formulas, urls } = await loadAssets(plugin.app, text, file.name, file.path, plugin.scripts.service<MathRenderer>(MATH_SERVICE));
  const composed = composeNote(text, file.name, undefined, pageStyleOf(plugin.settings), { images, formulas, created: file.stat.ctime, modified: file.stat.mtime, defaultAuthor: plugin.settings.exportAuthor });
  for (const u of urls) URL.revokeObjectURL(u);
  const pdf = await composeToPdf(composed, {
    defaultAuthor: plugin.settings.exportAuthor,
    creator: `Bigorneau ${plugin.manifest.version}`,
    created: new Date(),
    deflate,
  });
  return { pdf, composed };
}

export async function exportNoteToPdf(plugin: MindmapWritingPlugin, file: TFile): Promise<void> {
  if (!Platform.isDesktop) return;
  const target = await askTarget(plugin, file);
  if (!target) return;
  const path = targetPath(target);
  const notice = new Notice(t(`Composition du PDF…`), 0);
  try {
    const { pdf, composed } = await makePdf(plugin, file);
    const folder = path.includes(`/`) ? path.slice(0, path.lastIndexOf(`/`)) : ``;
    if (folder !== `` && !plugin.app.vault.getAbstractFileByPath(folder)) await plugin.app.vault.createFolder(folder);
    const existing = plugin.app.vault.getAbstractFileByPath(path);
    const data = pdf.slice().buffer;
    if (existing instanceof TFile) await plugin.app.vault.modifyBinary(existing, data);
    else await plugin.app.vault.createBinary(path, data);
    notice.hide();

    const lines: string[] = [];
    lines.push(...warningLines(composed.typeset.warnings, { formulasEnabled: plugin.scripts.isEnabled(`formulas`) }));
    if (composed.typeset.missing.length > 0) lines.push(missingCharsLine(composed.typeset.missing));
    if (composed.typeset.stats.overfullLines > 0) lines.push(t(`{0} lignes débordent de la colonne.`, composed.typeset.stats.overfullLines));
    if (lines.length > 0) new ExportReportModal(plugin.app, path, lines).open();
    else new Notice(t(`PDF enregistré : {0}`, path));
  } catch (e) {
    notice.hide();
    new Notice(t(`L'export a échoué : {0}`, e instanceof Error ? e.message : String(e)), 8000);
  }
}

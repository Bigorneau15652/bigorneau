// Export window of the note: asks what to do (PDF file, printing, HTML file) and runs it.
import { Notice, Platform } from "obsidian";
import { ExportChoice, ExportDialog, ExportTab } from "./export-dialog";
import { exportNoteToHtml } from "./export-html";
import { exportNoteToPdf } from "./export-pdf";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

// Opens the export window on a tab (the last one used by default) and runs the choice.
export async function openExport(plugin: MindmapWritingPlugin, tab: ExportTab = plugin.lastExportTab): Promise<void> {
  if (!Platform.isDesktop) return;
  plugin.rememberFile(plugin.app.workspace.getActiveFile());
  const file = plugin.lastFile;
  if (!file) {
    new Notice(t(`Ouvrez d'abord une note.`));
    return;
  }
  const folder = file.parent && file.parent.path !== `/` ? file.parent.path : ``;
  const choice = await new Promise<ExportChoice | null>((resolve) => {
    new ExportDialog(plugin.app, { folder, name: file.basename }, resolve, tab).open();
  });
  if (!choice) return;
  plugin.lastExportTab = choice.kind;
  if (choice.kind === `print`) await plugin.printPdf();
  else if (choice.kind === `html`) await exportNoteToHtml(plugin, file, choice.target);
  else await exportNoteToPdf(plugin, file, choice.target);
}

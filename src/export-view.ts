// Apercu de l'export de haute qualite : volet qui montre la note ouverte telle que l'export la verra.
// Phase 1 : texte brut paginé grossierement ; la composition definitive arrive aux phases suivantes.
import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import { buildExportDoc } from "./export/doc-tree";
import { paginatePlain } from "./export/plain-pages";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

export const VIEW_TYPE_EXPORT = `mindmap-writing-export-preview`;

export class ExportPreviewView extends ItemView {
  private token = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: MindmapWritingPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXPORT;
  }

  getDisplayText(): string {
    return t(`Aperçu de l'export`);
  }

  getIcon(): string {
    return `file-text`;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass(`mmw-export`);
    await this.refresh();
  }

  async refresh() {
    const token = ++this.token;
    const root = this.contentEl;
    // L'export de haute qualite n'existe que sur ordinateur : ailleurs, le volet l'explique sans rien calculer.
    if (!Platform.isDesktop) {
      root.empty();
      root.createDiv({ cls: `mmw-export-message`, text: t(`L'export n'est disponible que sur ordinateur.`) });
      return;
    }
    const file = this.plugin.lastFile;
    if (!file) {
      root.empty();
      root.createDiv({ cls: `mmw-export-message`, text: t(`Ouvrez d'abord une note.`) });
      return;
    }
    const text = this.plugin.getOpenText(file) ?? (await this.app.vault.read(file));
    if (token !== this.token) return;
    const result = paginatePlain(buildExportDoc(text, file.name));
    root.empty();
    const head = root.createDiv({ cls: `mmw-export-head` });
    head.createDiv({ cls: `mmw-export-title`, text: t(`Aperçu de l'export : {0}`, file.basename) });
    head.createDiv({ cls: `mmw-export-stats`, text: t(`{0} pages, {1} mots`, result.pages.length, result.wordCount) });
    head.createDiv({
      cls: `mmw-export-hint`,
      text: t(`Aperçu provisoire en texte brut. Les titres masqués et les sujets flottants ne sont pas exportés.`),
    });
    const pages = root.createDiv({ cls: `mmw-export-pages` });
    for (const page of result.pages) {
      const box = pages.createDiv({ cls: `mmw-export-page` });
      box.createEl(`pre`, { text: page.lines.join(`\n`) });
      box.createDiv({ cls: `mmw-export-number`, text: String(page.number) });
    }
  }
}

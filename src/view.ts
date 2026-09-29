import { ItemView, WorkspaceLeaf } from "obsidian";
import type MindmapWritingPlugin from "./main";
import { parseNote, serializeNote } from "./model";
import { MapRenderer } from "./renderer";

export const VIEW_TYPE_MINDMAP = `mindmap-writing-view`;

export class MindmapView extends ItemView {
  private plugin: MindmapWritingPlugin;
  private renderer: MapRenderer | null = null;
  private renderToken = 0;

  constructor(leaf: WorkspaceLeaf, plugin: MindmapWritingPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return `Mindmap Note Writing`;
  }

  getIcon(): string {
    return `network`;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass(`mmw-view`);
    this.renderer = new MapRenderer(this.contentEl, () => this.plugin.settings, (v) => {
      this.plugin.settings.compactness = v;
      void this.plugin.saveSettings(false);
    });
    await this.refresh();
  }

  async onClose() {
    this.renderer?.destroy();
    this.renderer = null;
  }

  async refresh() {
    const renderer = this.renderer;
    if (!renderer) return;
    const token = ++this.renderToken;
    const file = this.plugin.lastFile;
    if (!file) {
      renderer.setDoc(null, ``, true);
      return;
    }
    const text = await this.app.vault.cachedRead(file);
    if (token !== this.renderToken || this.renderer !== renderer) return;
    const doc = parseNote(text, file.name);
    renderer.setDoc(doc, file.path, serializeNote(doc) === text);
  }

  // Redessine la carte apres un changement de reglage, sans relire le fichier.
  redraw() {
    this.renderer?.rebuild();
  }
}

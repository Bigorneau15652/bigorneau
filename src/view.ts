import { ItemView, TFile, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_MINDMAP = `mindmap-writing-view`;

export class MindmapView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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
    this.registerEvent(this.app.workspace.on(`file-open`, () => this.render()));
    this.render();
  }

  async onClose() {
    this.contentEl.empty();
  }

  private render() {
    const el = this.contentEl;
    el.empty();
    el.addClass(`mmw-view`);
    const file: TFile | null = this.app.workspace.getActiveFile();
    el.createEl(`h3`, { text: `Mindmap Note Writing` });
    if (file) {
      el.createEl(`p`, { text: `Note active : ${file.basename}` });
    } else {
      el.createEl(`p`, { text: `Aucune note active. Ouvrez une note du coffre.` });
    }
    el.createEl(`p`, { text: `Version de test (phase 0) : la vue s'ouvre correctement.` });
  }
}

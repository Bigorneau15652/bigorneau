import { debounce, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";

export default class MindmapWritingPlugin extends Plugin {
  // Derniere note Markdown consultee : la vue Carte s'y rattache.
  lastFile: TFile | null = null;

  async onload() {
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new MindmapView(leaf, this));

    this.app.workspace.onLayoutReady(() => {
      this.rememberFile(this.app.workspace.getActiveFile());
    });

    this.registerEvent(
      this.app.workspace.on(`file-open`, (file) => {
        if (this.rememberFile(file)) this.refreshViews();
      })
    );

    const refreshLater = debounce(() => this.refreshViews(), 400, true);
    this.registerEvent(
      this.app.vault.on(`modify`, (file) => {
        if (this.lastFile && file.path === this.lastFile.path) refreshLater();
      })
    );

    this.addRibbonIcon(`network`, `Ouvrir Mindmap Note Writing`, () => {
      void this.activateView();
    });

    this.addCommand({
      id: `open-mindmap-view`,
      name: `Ouvrir la carte de la note active`,
      callback: () => {
        void this.activateView();
      },
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
  }

  private rememberFile(file: TFile | null): boolean {
    if (file && file.extension === `md`) {
      this.lastFile = file;
      return true;
    }
    return false;
  }

  private refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      const view = leaf.view;
      if (view instanceof MindmapView) void view.refresh();
    }
  }

  async activateView() {
    const { workspace } = this.app;
    this.rememberFile(workspace.getActiveFile());
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(`tab`);
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    workspace.revealLeaf(leaf);
    this.refreshViews();
  }
}

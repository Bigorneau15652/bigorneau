import { Plugin, WorkspaceLeaf } from "obsidian";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";

export default class MindmapWritingPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new MindmapView(leaf));

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

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(`tab`);
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

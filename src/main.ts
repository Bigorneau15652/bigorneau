import { debounce, MarkdownView, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";
import { DEFAULT_SETTINGS, MmSettings } from "./settings";
import { MmSettingTab } from "./settings-tab";

export default class MindmapWritingPlugin extends Plugin {
  // Derniere note Markdown consultee : la vue Carte s'y rattache.
  lastFile: TFile | null = null;
  settings: MmSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    this.addSettingTab(new MmSettingTab(this.app, this));

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
    // La carte suit la frappe dans l'editeur d'Obsidian sans attendre l'enregistrement du fichier.
    this.registerEvent(
      this.app.workspace.on(`editor-change`, (_editor, info) => {
        if (this.lastFile && info.file && info.file.path === this.lastFile.path) refreshLater();
      })
    );

    this.addRibbonIcon(`network`, `Ouvrir Mindmap Note Writing`, () => {
      void this.activateView();
    });

    this.addCommand({
      id: `focus-note-paragraph`,
      name: `Aller à la rédaction du titre sélectionné`,
      callback: () => this.forEachView((v) => v.focusNote()),
    });

    this.addCommand({
      id: `focus-map`,
      name: `Revenir à la carte`,
      callback: () => this.forEachView((v) => v.focusMap()),
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

  // Enregistre les reglages et, si demande, redessine les cartes ouvertes.
  async saveSettings(redraw = true) {
    await this.saveData(this.settings);
    if (!redraw) return;
    this.forEachView((v) => v.redraw());
  }

  private rememberFile(file: TFile | null): boolean {
    if (file && file.extension === `md`) {
      this.lastFile = file;
      return true;
    }
    return false;
  }

  private forEachView(fn: (view: MindmapView) => void) {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapView) fn(leaf.view);
    }
  }

  private refreshViews() {
    this.forEachView((view) => void view.refresh());
  }

  // Texte actuel d'une note ouverte dans un editeur (y compris les modifications pas encore enregistrees).
  getOpenText(file: TFile): string | null {
    let text: string | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (text === null && v instanceof MarkdownView && v.file && v.file.path === file.path) text = v.getViewData();
    });
    return text;
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

import type { EditorView } from "@codemirror/view";
import { debounce, Editor, MarkdownView, Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { noteExtension } from "./active-chapter";
import { comboMatches, isModEnter } from "./keys";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";
import { DEFAULT_SETTINGS, migrateSettings, MmSettings } from "./settings";
import { MmSettingTab } from "./settings-tab";

export default class MindmapWritingPlugin extends Plugin {
  // Derniere note Markdown consultee : la vue Carte s'y rattache.
  lastFile: TFile | null = null;
  settings: MmSettings = { ...DEFAULT_SETTINGS };
  // Editeurs de note ouverts (tous les editeurs Markdown), pour retrouver celui qui est relie a la carte.
  editorViews = new Set<EditorView>();

  async onload() {
    this.settings = migrateSettings(await this.loadData());
    this.addSettingTab(new MmSettingTab(this.app, this));
    this.applyBodySettings();

    // Extension d'editeur : grisage des chapitres inactifs, suivi du curseur, touches de navigation.
    const notifyMoved = debounce(
      (cm: EditorView) => {
        this.forEachView((v) => {
          if (v.ownsEditor(cm)) v.onNoteMoved(cm);
        });
      },
      30,
      true
    );
    this.registerEditorExtension(
      noteExtension({
        attach: (cm) => this.editorViews.add(cm),
        detach: (cm) => this.editorViews.delete(cm),
        changed: (cm) => {
          if (this.isLinkedEditor(cm)) notifyMoved(cm);
        },
        replaced: (cm) => {
          this.forEachView((v) => {
            if (v.ownsEditor(cm)) v.resyncNote(cm);
          });
        },
        click: (cm, event) => {
          if (!this.isLinkedEditor(cm)) return;
          this.forEachView((v) => {
            if (v.ownsEditor(cm)) v.onNoteClick(cm, event);
          });
        },
        key: (event, cm) => {
          if (!this.isLinkedEditor(cm)) return false;
          // Cmd ou Ctrl + Entree dans la note reliee : retour a la carte (meme raccourci que pour aller dans la note).
          if (isModEnter(event)) {
            event.preventDefault();
            this.forEachView((v) => {
              if (v.ownsEditor(cm)) v.focusMap();
            });
            return true;
          }
          const dir = this.navigationFor(event);
          if (!dir) return false;
          event.preventDefault();
          this.forEachView((v) => {
            if (v.ownsEditor(cm)) void v.navigateFromNote(dir);
          });
          return true;
        },
      })
    );

    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new MindmapView(leaf, this));

    this.app.workspace.onLayoutReady(() => {
      this.rememberFile(this.app.workspace.getActiveFile());
    });

    this.registerEvent(
      this.app.workspace.on(`file-open`, (file) => {
        if (this.rememberFile(file)) this.refreshViews();
      })
    );

    // Filet de securite : quand Obsidian change d'onglet ou reorganise les volets, il peut recreer l'editeur de la note ;
    // le grisage ou le masquage des chapitres inactifs est alors remis d'apres le titre selectionne.
    const reapplyActive = debounce(() => this.forEachView((v) => v.updateActiveRange()), 150, true);
    this.registerEvent(this.app.workspace.on(`active-leaf-change`, () => reapplyActive()));
    this.registerEvent(this.app.workspace.on(`layout-change`, () => reapplyActive()));

    const refreshLater = debounce(() => this.refreshViews(), 400, true);
    this.registerEvent(
      this.app.vault.on(`modify`, (file) => {
        if (this.lastFile && file.path === this.lastFile.path) refreshLater();
      })
    );
    // Le titre de la racine est le nom du fichier : la carte le relit des qu'Obsidian signale un renommage,
    // que le changement vienne de la carte, du titre de la note ou de l'explorateur de fichiers.
    this.registerEvent(
      this.app.vault.on(`rename`, (file) => {
        if (this.lastFile && file === this.lastFile) this.refreshViews();
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

    const navCommands: { id: string; name: string; dir: `up` | `down` | `left` | `right` }[] = [
      { id: `chapter-previous`, name: `Chapitre précédent`, dir: `up` },
      { id: `chapter-next`, name: `Chapitre suivant`, dir: `down` },
      { id: `chapter-parent`, name: `Chapitre parent`, dir: `left` },
      { id: `chapter-first-child`, name: `Premier sous-titre du chapitre`, dir: `right` },
    ];
    for (const c of navCommands) {
      this.addCommand({
        id: c.id,
        name: c.name,
        callback: () => this.forEachView((v) => void v.navigateFromNote(c.dir)),
      });
    }

    this.addCommand({
      id: `focus-note-paragraph`,
      name: `Aller à la rédaction du titre sélectionné`,
      callback: () => this.forEachView((v) => v.focusNote()),
    });

    this.addCommand({
      id: `duplicate-selection`,
      name: `Dupliquer le titre sélectionné`,
      callback: () => this.forEachView((v) => v.duplicateSelection()),
    });

    this.addCommand({
      id: `toggle-hide-inactive`,
      name: `Basculer l'affichage du seul chapitre actif dans la note`,
      callback: async () => {
        this.settings.hideInactive = !this.settings.hideInactive;
        await this.saveSettings();
        new Notice(this.settings.hideInactive ? `La note ne montre que le chapitre actif.` : `La note montre tous les chapitres.`);
      },
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
    void this.saveData(this.settings);
    this.forEachView((v) => v.clearActive());
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
    document.body.style.removeProperty(`--mmw-inactive-opacity`);
  }

  // Un editeur est relie a la carte s'il se trouve dans le volet de note ouvert par une carte.
  isLinkedEditor(cm: EditorView): boolean {
    let linked = false;
    this.forEachView((v) => {
      if (v.ownsEditor(cm)) linked = true;
    });
    return linked;
  }

  // Direction de navigation correspondant a une touche pressee, selon les reglages.
  private navigationFor(event: KeyboardEvent): `up` | `down` | `left` | `right` | null {
    const s = this.settings;
    const mac = Platform.isMacOS;
    if (comboMatches(event, s.keyPrev, mac)) return `up`;
    if (comboMatches(event, s.keyNext, mac)) return `down`;
    if (comboMatches(event, s.keyParent, mac)) return `left`;
    if (comboMatches(event, s.keyChild, mac)) return `right`;
    return null;
  }

  private applyBodySettings() {
    document.body.style.setProperty(`--mmw-inactive-opacity`, String(this.settings.inactiveOpacity));
  }

  // Ecriture differee : evite d'enregistrer a chaque cran d'une reglette.
  private persistLater = debounce(() => void this.saveData(this.settings), 400, true);

  // Enregistre les reglages et, si demande, redessine les cartes ouvertes.
  async saveSettings(redraw = true) {
    this.applyBodySettings();
    this.persistLater();
    if (!redraw) return;
    this.forEachView((v) => v.redraw());
  }

  // Applique des reglages modifies depuis la carte.
  async updateSettings(patch: Partial<MmSettings>) {
    Object.assign(this.settings, patch);
    await this.saveSettings();
  }

  // Ouvre la page de reglages du plugin dans les parametres d'Obsidian.
  openSettings() {
    const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    if (!setting) return;
    setting.open();
    setting.openTabById(this.manifest.id);
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
    const linked = this.linkedNoteView(file);
    if (linked) return linked.getViewData();
    let text: string | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (text === null && v instanceof MarkdownView && v.file && v.file.path === file.path) text = v.getViewData();
    });
    return text;
  }

  // Editeur (mode Edition ou Aperçu en direct) dans lequel la note est ouverte, s'il existe.
  getOpenEditor(file: TFile): Editor | null {
    const linked = this.linkedNoteView(file);
    if (linked && linked.getMode() === `source`) return linked.editor;
    let editor: Editor | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (!editor && v instanceof MarkdownView && v.file && v.file.path === file.path && v.getMode() === `source`) editor = v.editor;
    });
    return editor;
  }

  // Vue de note ouverte a cote d'une carte pour ce fichier : c'est elle qui sert aux modifications.
  private linkedNoteView(file: TFile): MarkdownView | null {
    let found: MarkdownView | null = null;
    this.forEachView((v) => {
      const nv = v.getNoteView();
      if (nv && nv.file && nv.file.path === file.path) found = nv;
    });
    return found;
  }

  // Ouvre la carte de la note active. La note active devient le volet de rédaction, a la place reglee
  // (a gauche par defaut) : elle ne reste pas cachee derriere la carte.
  async activateView() {
    const { workspace } = this.app;
    const active = workspace.getActiveViewOfType(MarkdownView);
    this.rememberFile(workspace.getActiveFile());
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0] ?? null;
    let adopted: WorkspaceLeaf | null = null;
    if (!leaf) {
      if (active && active.file) {
        const pos = this.settings.panePosition;
        const direction = pos === `right` || pos === `left` ? `vertical` : `horizontal`;
        leaf = workspace.createLeafBySplit(active.leaf, direction, pos === `right` || pos === `bottom`);
        adopted = active.leaf;
      } else {
        leaf = workspace.getLeaf(`tab`);
      }
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof MindmapView) {
      if (adopted) view.adoptNoteLeaf(adopted);
      await view.refresh();
      await view.showNote();
    }
  }
}

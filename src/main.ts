import type { EditorView } from "@codemirror/view";
import { setLanguage, t } from "./i18n";
import { debounce, Editor, MarkdownView, Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { noteExtension } from "./active-chapter";
import { applyFixedState, clearFixedState, currentFixedTarget } from "./fixed-editor";
import { comboMatches, isModEnter } from "./keys";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";
import { exportNoteToPdf } from "./export-pdf";
import { ExportPreviewView, VIEW_TYPE_EXPORT } from "./export-view";
import { DEFAULT_SETTINGS, FixedEntry, migrateSettings, MmSettings } from "./settings";
import { MmSettingTab } from "./settings-tab";

export default class MindmapWritingPlugin extends Plugin {
  // Derniere note Markdown consultee : la vue Carte s'y rattache.
  lastFile: TFile | null = null;
  settings: MmSettings = { ...DEFAULT_SETTINGS };
  // Editeurs de note ouverts (tous les editeurs Markdown), pour retrouver celui qui est relie a la carte.
  editorViews = new Set<EditorView>();
  // Notes fixes ouvertes : chapitre montre et volet qui les contient (retrouve par son identifiant apres un redemarrage).
  fixed: { entry: FixedEntry; leaf: WorkspaceLeaf | null }[] = [];

  async onload() {
    this.settings = migrateSettings(await this.loadData());
    setLanguage(this.settings.language);
    this.fixed = this.settings.fixedViews.map((entry) => ({ entry: { ...entry }, leaf: null }));
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
          else if (this.fixedFor(cm)) this.refreshFixedLater(cm);
        },
        replaced: (cm) => {
          if (this.fixedFor(cm)) this.applyFixed(cm);
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
    this.registerView(VIEW_TYPE_EXPORT, (leaf) => new ExportPreviewView(leaf, this));

    this.registerEvent(this.app.workspace.on(`layout-change`, () => this.syncFixed()));
    this.registerEvent(this.app.workspace.on(`active-leaf-change`, (leaf) => void this.swapIfFixed(leaf)));
    this.registerEvent(this.app.workspace.on(`file-open`, () => this.syncFixed()));
    this.app.workspace.onLayoutReady(() => {
      this.syncFixed();
      this.refreshFixed();
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

    this.addRibbonIcon(`network`, t(`Ouvrir Mindmap Note Writing`), () => {
      void this.activateView();
    });

    const navCommands: { id: string; name: string; dir: `up` | `down` | `left` | `right` }[] = [
      { id: `chapter-previous`, name: t(`Chapitre précédent`), dir: `up` },
      { id: `chapter-next`, name: t(`Chapitre suivant`), dir: `down` },
      { id: `chapter-parent`, name: t(`Chapitre parent`), dir: `left` },
      { id: `chapter-first-child`, name: t(`Premier sous-titre du chapitre`), dir: `right` },
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
      name: t(`Aller à la rédaction du titre sélectionné`),
      callback: () => this.forEachView((v) => v.focusNote()),
    });

    this.addCommand({
      id: `duplicate-selection`,
      name: t(`Dupliquer le titre sélectionné`),
      callback: () => this.forEachView((v) => v.duplicateSelection()),
    });

    this.addCommand({
      id: `toggle-view-mode`,
      name: t(`Basculer entre la vue Mindmap et la vue Liste`),
      callback: async () => {
        this.settings.viewMode = this.settings.viewMode === `list` ? `map` : `list`;
        await this.saveSettings();
      },
    });

    this.addCommand({
      id: `toggle-hide-inactive`,
      name: t(`Basculer l'affichage du seul chapitre actif dans la note`),
      callback: async () => {
        this.settings.hideInactive = !this.settings.hideInactive;
        await this.saveSettings();
        new Notice(this.settings.hideInactive ? t(`La note ne montre que le chapitre actif.`) : t(`La note montre tous les chapitres.`));
      },
    });

    this.addCommand({
      id: `add-fixed-note`,
      name: t(`Ajouter une note fixe`),
      callback: () => {
        let found = false;
        this.forEachView((v) => {
          if (found) return;
          found = true;
          void v.addFixedNote();
        });
        if (!found) new Notice(t(`Ouvrez d'abord la carte de la note.`));
      },
    });

    this.addCommand({
      id: `focus-map`,
      name: t(`Revenir à la carte`),
      callback: () => this.forEachView((v) => v.focusMap()),
    });

    // L'export de haute qualite est reserve a l'ordinateur : sur tablette et telephone, la commande n'est pas proposee.
    this.addCommand({
      id: `export-preview`,
      name: t(`Aperçu de l'export de la note`),
      checkCallback: (checking) => {
        if (!Platform.isDesktop) return false;
        if (!checking) void this.openExportPreview();
        return true;
      },
    });

    this.addCommand({
      id: `export-pdf`,
      name: t(`Exporter la note en PDF`),
      checkCallback: (checking) => {
        if (!Platform.isDesktop) return false;
        if (!this.app.workspace.getActiveFile() && !this.lastFile) return false;
        if (!checking) void this.exportPdf();
        return true;
      },
    });

    this.addCommand({
      id: `open-mindmap-view`,
      name: t(`Ouvrir la carte de la note active`),
      callback: () => {
        void this.activateView();
      },
    });
  }

  onunload() {
    void this.saveData(this.settings);
    this.forEachView((v) => v.clearActive());
    for (const cm of this.editorViews) if (this.fixedFor(cm)) clearFixedState(cm);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXPORT);
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

  // ---------------------------------------------------------------- notes fixes

  private fixedLeaf(f: { entry: FixedEntry; leaf: WorkspaceLeaf | null }): WorkspaceLeaf | null {
    const ws = this.app.workspace;
    const attached = ws.getLeavesOfType(`markdown`);
    if (f.leaf && attached.includes(f.leaf)) return f.leaf;
    const byId = ws.getLeafById(f.entry.id);
    return byId && attached.includes(byId) ? byId : null;
  }

  // Note fixe a laquelle appartient cet editeur, s'il y en a une.
  fixedFor(cm: EditorView): { entry: FixedEntry; leaf: WorkspaceLeaf | null } | null {
    for (const f of this.fixed) {
      const leaf = this.fixedLeaf(f);
      if (leaf && leaf.view.containerEl.contains(cm.dom)) return f;
    }
    return null;
  }

  private persistFixed() {
    this.settings.fixedViews = this.fixed.map((f) => ({ ...f.entry }));
    this.persistLater();
  }

  addFixed(leaf: WorkspaceLeaf, target: { path: string; key: string; title: string }) {
    const id = (leaf as unknown as { id?: string }).id;
    if (!id) return;
    this.fixed.push({ entry: { id, ...target }, leaf });
    this.persistFixed();
    window.setTimeout(() => this.refreshFixed(), 80);
  }

  private removeFixed(f: { entry: FixedEntry }) {
    this.fixed = this.fixed.filter((x) => x !== f);
    this.persistFixed();
  }

  // Une note fixe ne montre que le contenu de son titre : tout le reste de la note est masque dans son editeur.
  applyFixed(cm: EditorView) {
    const f = this.fixedFor(cm);
    if (!f) return;
    const s = this.settings;
    const range = applyFixedState(cm, f.entry, s.fixedLikeDynamic && s.includeSubtitles, s.hideMetaLines);
    if (!range) {
      // Le titre n'existe plus : la note redevient une note ordinaire.
      this.removeFixed(f);
      return;
    }
    f.entry.key = range.key;
  }

  refreshFixed() {
    for (const cm of [...this.editorViews]) if (this.fixedFor(cm)) this.applyFixed(cm);
  }

  // Apres une modification venue d'ailleurs (note dynamique, carte) : le chapitre est recalcule quand on n'ecrit pas dedans.
  private refreshFixedLater = debounce(
    (cm: EditorView) => {
      if (!this.editorViews.has(cm)) return;
      if (!cm.hasFocus) {
        this.applyFixed(cm);
        return;
      }
      // On ecrit dans la note fixe : si le titre est renomme, la note fixe le suit.
      const f = this.fixedFor(cm);
      const target = f ? currentFixedTarget(cm) : null;
      if (f && target && (target.key !== f.entry.key || target.title !== f.entry.title)) {
        f.entry.key = target.key;
        f.entry.title = target.title;
        this.persistFixed();
      }
    },
    800,
    true
  );

  // Un clic dans une note fixe la rend dynamique : la note qui l'etait devient fixe sur le chapitre qu'elle montrait.
  private swapping = false;

  private async swapIfFixed(leaf: WorkspaceLeaf | null) {
    if (!leaf || this.swapping || this.fixed.length === 0) return;
    const f = this.fixed.find((x) => this.fixedLeaf(x) === leaf);
    if (!f) return;
    let view: MindmapView | null = null;
    this.forEachView((v) => {
      if (!view) view = v;
    });
    const map = view as MindmapView | null;
    if (!map) return;
    const dynamic = map.getNoteLeaf();
    if (dynamic === leaf) return;
    const attached = this.app.workspace.getLeavesOfType(`markdown`);
    const previous = dynamic && attached.includes(dynamic) ? map.currentChapter() : null;
    this.swapping = true;
    try {
      this.removeFixed(f);
      for (const cm of this.editorViews) if (leaf.view.containerEl.contains(cm.dom)) clearFixedState(cm);
      await map.takeOver(leaf, f.entry);
      if (dynamic && previous) this.addFixed(dynamic, previous);
    } finally {
      this.swapping = false;
    }
  }

  // Volets fermes ou changes de note : retires de la liste. Si la note dynamique est fermee alors qu'il reste des notes
  // fixes, la plus recente devient la note dynamique : il y a toujours une vue dynamique.
  syncFixed() {
    if (this.fixed.length === 0) return;
    for (const f of [...this.fixed]) {
      const leaf = this.fixedLeaf(f);
      if (!leaf) {
        this.removeFixed(f);
        continue;
      }
      f.leaf = leaf;
      const v = leaf.view;
      if (v instanceof MarkdownView && v.file && v.file.path !== f.entry.path) this.removeFixed(f);
    }
    const attached = this.app.workspace.getLeavesOfType(`markdown`);
    this.forEachView((v) => {
      const dynamic = v.getNoteLeaf();
      if (!dynamic || attached.includes(dynamic) || this.fixed.length === 0) return;
      const last = this.fixed[this.fixed.length - 1];
      const leaf = this.fixedLeaf(last);
      if (!leaf) return;
      this.removeFixed(last);
      for (const cm of this.editorViews) if (leaf.view.containerEl.contains(cm.dom)) clearFixedState(cm);
      v.adoptNoteLeaf(leaf);
      void v.showNote();
    });
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
    this.refreshFixed();
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
    this.refreshExportPreviews();
  }

  private refreshExportPreviews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_EXPORT)) {
      if (leaf.view instanceof ExportPreviewView) void leaf.view.refresh();
    }
  }

  // Exporte la note ouverte en PDF (fenetre de choix du dossier et du nom).
  async exportPdf() {
    if (!Platform.isDesktop) return;
    this.rememberFile(this.app.workspace.getActiveFile());
    if (!this.lastFile) {
      new Notice(t(`Ouvrez d'abord une note.`));
      return;
    }
    await exportNoteToPdf(this, this.lastFile);
  }

  // Ouvre l'apercu de l'export a cote de la note (ou le montre s'il est deja ouvert).
  async openExportPreview() {
    if (!Platform.isDesktop) return;
    const { workspace } = this.app;
    this.rememberFile(workspace.getActiveFile());
    if (!this.lastFile) {
      new Notice(t(`Ouvrez d'abord une note.`));
      return;
    }
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_EXPORT)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(`split`, `vertical`);
      await leaf.setViewState({ type: VIEW_TYPE_EXPORT, active: true });
    }
    workspace.revealLeaf(leaf);
    if (leaf.view instanceof ExportPreviewView) await leaf.view.refresh();
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

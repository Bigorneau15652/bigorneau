import type { EditorView } from "@codemirror/view";
import { currentLang, setLanguage, t } from "./i18n";
import { debounce, Editor, MarkdownView, Menu, normalizePath, Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { noteExtension } from "./active-chapter";
import { applyFixedState, clearFixedState, currentFixedTarget } from "./fixed-editor";
import { comboMatches, isModEnter } from "./keys";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";
import { captionWord, insertFootnote, toggleToc } from "./export/insert";
import { exportNoteToPdf } from "./export-pdf";
import { DiagnosticModal } from "./diagnostic-modal";
import { noteError, record } from "./diagnostics";
import { FunctionRegistry, isSeparator, panelOrder, PanelFunction } from "./functions";
import { HelpRegistry } from "./help";
import { PLUGIN_HELP } from "./help-data";
import { HelpModal } from "./help-modal";
import { ButtonPanel, FunctionContext } from "./panel";
import { applyInsert } from "./insert-apply";
import { runScript } from "./script-runner";
import { FORMULAS_SCRIPT } from "./script-formulas";
import { ICON_FOOTNOTE, ICON_LOREM, registerCustomIcons } from "./custom-icons";
import { drawFigure, insertNamedImage } from "./drawing";
import { LoremModal } from "./lorem-dialog";
import { createPageScript } from "./script-page";
import { buildExternal, ExternalScript, ScriptManager } from "./scripts";
import { ScriptStore } from "./script-store";
import { ScriptsModal } from "./scripts-modal";
import * as obsidianApi from "obsidian";
import { columnAt, findTable, insertBlock, newTableBlock, tableContext } from "./table-edit";
import { cellAtLine, MenuSpec, tableMenu } from "./table-menu";
import { TableModal } from "./table-modal";
import { figureCaptionExtension, tableNumberExtension } from "./figure-caption-widget";
import { listMarkerWidgetExtension, paragraphMarkerHideExtension, tableMarkerHideExtension } from "./table-marker-hide";
import { diffChange, tableWidgetExtension } from "./table-widget";
import { ExportPreviewView, VIEW_TYPE_EXPORT } from "./export-view";
import { DEFAULT_SETTINGS, FixedEntry, migrateSettings, MmSettings } from "./settings";
import { MmSettingTab } from "./settings-tab";
import { FontStore } from "./font-store";
import { importFonts } from "./font-import";
import type { TypographyHost } from "./typography-modal";

// Part de la largeur, en pourcentage, donnee au volet de la vue Liste a son ouverture.
const LIST_PANE_PERCENT = 28;

const FONT_LOAD_DELAY = 3000;

export default class MindmapWritingPlugin extends Plugin {
  // Derniere note Markdown consultee : la vue Carte s'y rattache.
  lastFile: TFile | null = null;
  settings: MmSettings = { ...DEFAULT_SETTINGS };
  // Editeurs de note ouverts (tous les editeurs Markdown), pour retrouver celui qui est relie a la carte.
  editorViews = new Set<EditorView>();
  // Fonctions du plugin (commandes de la palette et boutons du panneau) et textes d'aide.
  functions = new FunctionRegistry<FunctionContext>();
  helpEntries = new HelpRegistry();
  panel = new ButtonPanel(this);
  // Polices ajoutees au coffre (dossier des polices).
  fonts = new FontStore(this.app, () => this.settings.fontFolder);
  // Scripts : les scripts officiels sont integres au plugin ; les autres sont des fichiers ajoutes a la main.
  scriptStore = new ScriptStore(this.app, `bigorneau`);
  scripts: ScriptManager = new ScriptManager(
    {
      app: this.app,
      obsidian: obsidianApi,
      language: () => currentLang(),
      notice: (message) => void new Notice(message),
      registerFunction: (fn) => this.addFunction(fn),
      addHelp: (entries) => this.helpEntries.add(entries),
      runExternal: (code, api, id) => runScript(code, api, id),
      saveState: () => void this.saveSettings(false),
    },
    { enabled: {}, approved: {} },
    [FORMULAS_SCRIPT, createPageScript(() => this.settings.exportAuthor, this.typographyHost())]
  );
  // Notes fixes ouvertes : chapitre montre et volet qui les contient (retrouve par son identifiant apres un redemarrage).
  fixed: { entry: FixedEntry; leaf: WorkspaceLeaf | null }[] = [];

  async onload() {
    const started = performance.now();
    const stored: unknown = await this.loadData();
    // Premier lancement sous le nom Bigorneau : les reglages de l'ancien plugin (Mindmap Note Writing) sont repris une fois.
    const legacy = stored === null || stored === undefined ? await this.legacyData() : null;
    this.settings = migrateSettings(legacy ?? stored);
    if (legacy) {
      void this.saveData(this.settings);
      new Notice(t(`Les réglages de l'ancien plugin Mindmap Note Writing ont été repris.`));
    }
    setLanguage(this.settings.language);
    this.scripts.bindState({ enabled: this.settings.scriptsEnabled, approved: this.settings.scriptsApproved });
    this.fixed = this.settings.fixedViews.map((entry) => ({ entry: { ...entry }, leaf: null }));
    this.addSettingTab(new MmSettingTab(this.app, this));
    this.applyBodySettings();
    registerCustomIcons();

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

    // Panneau de boutons : pose dans chaque editeur Markdown, mis a jour quand les volets changent.
    this.helpEntries.add(PLUGIN_HELP);
    this.app.workspace.onLayoutReady(() => void this.startScripts());
    // Polices du coffre : lues au demarrage, puis des qu'un fichier du dossier des polices est ajoute, change, renomme ou supprime.
    // Le chargement attend quelques secondes apres l'ouverture de l'espace de travail : Obsidian et les autres plugins finissent d'abord.
    this.app.workspace.onLayoutReady(() => {
      const timer = window.setTimeout(() => void this.fonts.refresh(), FONT_LOAD_DELAY);
      this.register(() => window.clearTimeout(timer));
    });
    const refreshFonts = debounce(() => void this.fonts.refresh(), 600, true);
    const fontFileChanged = (file: { path: string }): void => {
      if (this.fonts.isFontPath(file.path)) refreshFonts();
    };
    this.registerEvent(this.app.vault.on(`create`, fontFileChanged));
    this.registerEvent(this.app.vault.on(`modify`, fontFileChanged));
    this.registerEvent(this.app.vault.on(`delete`, fontFileChanged));
    this.registerEvent(
      this.app.vault.on(`rename`, (file, oldPath) => {
        if (this.fonts.isFontPath(file.path) || this.fonts.isFontPath(oldPath)) refreshFonts();
      })
    );
    this.register(this.fonts.onChange(() => this.refreshExportPreviews()));
    // Obsidian signale souvent plusieurs changements de volets de suite : un seul recalcul du panneau.
    const syncPanelSoon = debounce(() => this.panel.sync(), 60, true);
    this.registerEvent(this.app.workspace.on(`layout-change`, () => syncPanelSoon()));
    const syncPanelLater = debounce(() => this.panel.sync(), 400, true);
    this.registerEvent(this.app.workspace.on(`editor-change`, () => syncPanelLater()));
    this.registerEvent(
      this.app.workspace.on(`active-leaf-change`, (leaf) => {
        this.panel.sync();
        if (leaf?.view instanceof ExportPreviewView) leaf.view.refreshIfDirty();
      })
    );
    this.app.workspace.onLayoutReady(() => this.panel.sync());
    this.register(() => this.panel.detachAll());

    this.addRibbonIcon(`network`, t(`Ouvrir Bigorneau`), () => {
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

    // Fonctions du plugin : chacune est une commande de la palette (sans raccourci impose : chacun s'attribue dans les reglages
    // d'Obsidian, Raccourcis clavier) et un bouton du panneau, dans l'ordre d'ajout. Les cinq premieres ecrivent dans la note
    // (editeur actif) pour preparer les elements que l'export met en forme.
    // Aide de Bigorneau : un bouton du panneau comme les autres (deplacable, masquable), sans commande en double de celle de la palette.
    this.functions.register({
      id: `help`,
      name: () => t(`Aide de Bigorneau`),
      icons: [`circle-help`, `help-circle`, `info`],
      needsEditor: false,
      run: () => this.openHelp(),
    });
    this.addFunction({
      id: `insert-footnote`,
      name: () => t(`Insérer une note de bas de page`),
      icons: [ICON_FOOTNOTE],
      needsEditor: true,
      run: ({ editor }) => applyInsert(editor as Editor, (text, from, to) => insertFootnote(text, from, to)),
    });
    this.addFunction({
      id: `toggle-toc`,
      name: () => t(`Activer ou désactiver la table des matières de la note`),
      icons: [`list-ordered`, `list`],
      needsEditor: true,
      run: ({ editor }) => {
        let enabled = false;
        applyInsert(editor as Editor, (text) => {
          const r = toggleToc(text);
          enabled = r.enabled;
          return r;
        });
        new Notice(enabled ? t(`La table des matières est activée pour cette note.`) : t(`La table des matières est désactivée pour cette note.`));
      },
    });
    this.addFunction({
      id: `insert-table`,
      name: () => t(`Insérer un tableau`),
      icons: [`table`, `table-2`],
      needsEditor: true,
      run: ({ editor }) => this.openTableDialog(editor as Editor),
    });
    this.addFunction({
      id: `lorem-ipsum`,
      name: () => t(`Générer du texte Lorem ipsum`),
      icons: [ICON_LOREM],
      needsEditor: true,
      run: ({ editor }) => this.openLoremDialog(editor as Editor),
    });
    this.addFunction({
      id: `draw`,
      name: () => t(`Dessiner (Excalidraw)`),
      icons: [`pencil-ruler`, `pencil`, `brush`],
      needsEditor: true,
      run: ({ editor }) => drawFigure(this.app, editor as Editor),
    });
    this.addFunction({
      id: `insert-figure`,
      name: () => t(`Insérer une image ou un dessin avec son nom`),
      icons: [`image-plus`, `image`, `file-image`],
      needsEditor: true,
      run: ({ editor }) => insertNamedImage(this.app, editor as Editor),
    });
    // L'export de haute qualite est reserve a l'ordinateur : sur tablette et telephone, ces fonctions ne sont pas proposees.
    this.addFunction({
      id: `export-preview`,
      name: () => t(`Aperçu et export PDF de la note`),
      icons: [`file-search`, `eye`, `file-text`],
      needsEditor: false,
      available: () => Platform.isDesktop,
      run: () => void this.openExportPreview(),
    });
    this.addFunction({
      id: `export-pdf`,
      name: () => t(`Exporter la note en PDF`),
      icons: [`file-output`, `file-down`, `download`],
      needsEditor: false,
      // L'export se lance depuis l'apercu : la commande de la palette reste, le bouton du panneau n'existe plus.
      button: false,
      available: () => Platform.isDesktop,
      run: () => {
        if (!this.app.workspace.getActiveFile() && !this.lastFile) {
          new Notice(t(`Ouvrez d'abord une note.`));
          return;
        }
        void this.exportPdf();
      },
    });
    // Lignes et colonnes du tableau sous le curseur (le clic droit et les triangles du tableau font la meme chose).
    const tableCommands: { id: string; name: string; title: string }[] = [
      { id: `table-row-below`, name: t(`Tableau : insérer une ligne en dessous`), title: t(`Insérer une ligne en dessous`) },
      { id: `table-row-above`, name: t(`Tableau : insérer une ligne au-dessus`), title: t(`Insérer une ligne au-dessus`) },
      { id: `table-column-right`, name: t(`Tableau : insérer une colonne à droite`), title: t(`Insérer une colonne à droite`) },
      { id: `table-column-left`, name: t(`Tableau : insérer une colonne à gauche`), title: t(`Insérer une colonne à gauche`) },
      { id: `table-delete-row`, name: t(`Tableau : supprimer la ligne`), title: t(`Supprimer la ligne`) },
      { id: `table-delete-column`, name: t(`Tableau : supprimer la colonne`), title: t(`Supprimer la colonne`) },
    ];
    for (const c of tableCommands) {
      this.addCommand({
        id: c.id,
        name: c.name,
        editorCheckCallback: (checking, editor) => {
          const found = this.tableItem(editor, c.title);
          if (!found || found.disabled) return false;
          if (!checking) this.runTableItem(editor, found);
          return true;
        },
      });
    }
    this.addCommand({
      id: `describe-tables`,
      name: t(`Décrire les tableaux de la note (diagnostic)`),
      callback: () => this.describeTables(),
    });
    this.registerEditorExtension(tableMarkerHideExtension());
    this.registerEditorExtension(paragraphMarkerHideExtension());
    this.registerEditorExtension(listMarkerWidgetExtension());
    this.registerEditorExtension(figureCaptionExtension());
    this.registerEditorExtension(tableNumberExtension());
    this.registerEditorExtension(tableWidgetExtension({ showMenu: (event, items, access) => this.showTableMenu(event, items, access) }));
    // Mode Source : clic droit dans un tableau.
    this.registerEvent(
      this.app.workspace.on(`editor-menu`, (menu, editor) => {
        const items = this.tableItems(editor);
        if (!items) return;
        menu.addSeparator();
        this.fillMenu(menu, items, this.editorAccess(editor));
      })
    );
    // Mode Lecture : le style du tableau (en-tete fonce, alternance, colonnes egales).
    this.registerMarkdownPostProcessor((el, ctx) => {
      const info = ctx.getSectionInfo(el);
      if (!info || !info.text.includes(`mmw-table`)) return;
      let offset = 0;
      const lines = info.text.split(`\n`);
      for (let i = 0; i < info.lineStart && i < lines.length; i++) offset += lines[i].length + 1;
      const span = findTable(info.text, offset);
      if (!span) return;
      const style = tableContext(info.text, span).style;
      for (const table of Array.from(el.querySelectorAll(`table`))) {
        table.classList.toggle(`mmw-t-header`, style.header === true);
        table.classList.toggle(`mmw-t-stripes`, style.stripes === true);
        table.classList.toggle(`mmw-t-equal`, style.equal === true);
      }
    });
    this.addCommand({
      id: `diagnostic`,
      name: t(`Diagnostic de Bigorneau`),
      callback: () => this.openDiagnostic(),
    });
    this.addCommand({
      id: `toggle-panel`,
      name: t(`Afficher ou masquer le panneau de boutons`),
      callback: () => {
        this.settings.panelVisible = !this.settings.panelVisible;
        void this.saveSettings(false);
      },
    });
    this.addCommand({
      id: `open-scripts`,
      name: t(`Ouvrir les scripts de Bigorneau`),
      callback: () => this.openScripts(),
    });
    this.addCommand({
      id: `open-help`,
      name: t(`Ouvrir l'aide de Bigorneau`),
      callback: () => this.openHelp(),
    });

    this.addCommand({
      id: `open-mindmap-view`,
      name: t(`Ouvrir la carte de la note active`),
      callback: () => {
        void this.activateView();
      },
    });
    record(`Démarrage du plugin (onload)`, performance.now() - started);
  }

  onunload() {
    void this.saveData(this.settings);
    this.fonts.destroy();
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
  // Enregistre une fonction : elle devient une commande de la palette, et le panneau de boutons lui donne un bouton.
  addFunction(fn: PanelFunction<FunctionContext>): void {
    this.functions.register(fn);
    if (fn.needsEditor) {
      this.addCommand({
        id: fn.id,
        name: fn.name(),
        editorCheckCallback: (checking, editor, view) => {
          if (fn.available && !fn.available()) return false;
          if (!checking) void fn.run({ app: this.app, editor, ...(view instanceof MarkdownView ? { view } : {}) });
          return true;
        },
      });
    } else {
      this.addCommand({
        id: fn.id,
        name: fn.name(),
        checkCallback: (checking) => {
          if (fn.available && !fn.available()) return false;
          if (!checking) void fn.run({ app: this.app });
          return true;
        },
      });
    }
  }

  openScripts(): void {
    new ScriptsModal(this.app, this).open();
  }

  // Lit le fichier choisi par l'utilisateur : renvoie le script a confirmer, ou affiche pourquoi il est refuse.
  async prepareScript(file: string, code: string): Promise<ExternalScript | null> {
    const built = await buildExternal(file, code);
    if (!built.ok) {
      const why = built.error === `header` ? t(`l'en-tête /* bigorneau-script */ est absent`) : built.error === `name` ? t(`le nom du script est absent de l'en-tête`) : t(`la version de l'interface (api) est absente ou invalide`);
      new Notice(t(`Ce fichier n'est pas un script Bigorneau : {0}.`, why));
      return null;
    }
    return built.script;
  }

  // Apres confirmation : le fichier est copie dans le dossier technique du plugin, puis le script est active et charge.
  async confirmScript(script: ExternalScript, _isNew: boolean): Promise<void> {
    await this.scriptStore.write(script.file, script.code);
    await this.scripts.approve(script);
    this.panel.sync();
  }

  // Scripts ajoutes a la main presents dans le dossier technique, puis chargement des scripts actifs.
  private async startScripts(): Promise<void> {
    const started = performance.now();
    // Les scripts ajoutes a la main viennent d'un dossier que l'on peut ne pas pouvoir lire : les scripts officiels (Mise en page,
    // Formules) sont charges quand meme, et le panneau est toujours remis a jour.
    try {
      const found: ExternalScript[] = [];
      for (const f of await this.scriptStore.list()) {
        const built = await buildExternal(f.file, f.code);
        if (built.ok) found.push(built.script);
      }
      this.scripts.setExternal(found);
    } catch (e) {
      noteError(`Lecture des scripts ajoutés à la main`, e);
      new Notice(t(`Les scripts ajoutés à la main n'ont pas pu être lus : {0}`, e instanceof Error ? e.message : String(e)), 8000);
    }
    try {
      await this.scripts.loadEnabled();
    } catch (e) {
      noteError(`Chargement des scripts`, e);
      new Notice(t(`Les scripts n'ont pas pu être chargés : {0}`, e instanceof Error ? e.message : String(e)), 8000);
    }
    try {
      await this.placeDefaultSeparators();
    } catch (e) {
      noteError(`Disposition de départ du panneau`, e);
    }
    this.panel.sync();
    record(`Chargement des scripts`, performance.now() - started, `${this.scripts.info().filter((i) => i.loaded).length} chargés`);
  }

  // ---------------------------------------------------------------- tableaux

  // Fenetre de creation : le tableau est insere a la place du curseur, avec son style et, si demande, la ligne du nom a remplir.
  private openTableDialog(editor: Editor): void {
    const s = this.settings;
    new TableModal(
      this.app,
      { header: s.tableHeader, stripes: s.tableStripes, caption: s.tableCaption },
      (choice) => {
        const text = editor.getValue();
        const block = newTableBlock({ rows: choice.rows, cols: choice.cols, style: { header: choice.header, stripes: choice.stripes, equal: true }, caption: choice.caption, word: captionWord(text) }, text.includes(`\r\n`) ? `\r\n` : `\n`);
        const at = editor.posToOffset(editor.getCursor(`to`));
        const r = insertBlock(text, at, block);
        editor.replaceRange(r.edit.insert, editor.offsetToPos(r.edit.from), editor.offsetToPos(r.edit.to));
        editor.setCursor(editor.offsetToPos(r.cursor));
        editor.focus();
      },
      (v) => {
        s.tableHeader = v.header;
        s.tableStripes = v.stripes;
        s.tableCaption = v.caption;
        void this.saveSettings(false);
      }
    ).open();
  }

  // Fenetre Lorem ipsum : le texte est insere a la place du curseur, comme un bloc ; la derniere saisie est gardee.
  private openLoremDialog(editor: Editor): void {
    const s = this.settings;
    new LoremModal(this.app, { spec: s.loremSpec, blankLine: s.loremBlankLine }, (choice, generated) => {
      s.loremSpec = choice.spec;
      s.loremBlankLine = choice.blankLine;
      void this.saveSettings(false);
      const text = editor.getValue();
      const at = editor.posToOffset(editor.getCursor(`to`));
      const r = insertBlock(text, at, { text: generated, cursor: generated.length });
      editor.replaceRange(r.edit.insert, editor.offsetToPos(r.edit.from), editor.offsetToPos(r.edit.to));
      editor.setCursor(editor.offsetToPos(r.cursor));
      editor.focus();
    }).open();
  }

  private editorAccess(editor: Editor): { text(): string; apply(text: string): void } {
    return {
      text: () => editor.getValue(),
      apply: (next) => {
        const change = diffChange(editor.getValue(), next);
        if (change) editor.replaceRange(change.insert, editor.offsetToPos(change.from), editor.offsetToPos(change.to));
      },
    };
  }

  // Entrees du menu du tableau sous le curseur de l'editeur, ou null hors tableau.
  private tableItems(editor: Editor): MenuSpec[] | null {
    const text = editor.getValue();
    const cursor = editor.getCursor();
    const offset = editor.posToOffset(cursor);
    const cell = cellAtLine(text, cursor.line, cursor.ch, columnAt);
    return tableMenu(text, offset, cell ?? undefined);
  }

  private tableItem(editor: Editor, title: string): MenuSpec | undefined {
    return this.tableItems(editor)?.find((i) => i.title === title);
  }

  private runTableItem(editor: Editor, item: MenuSpec): void {
    const next = item.run?.(editor.getValue());
    if (next !== null && next !== undefined) this.editorAccess(editor).apply(next);
  }

  // Remplit un menu Obsidian avec les entrees d'un tableau (le sous-menu d'alignement est mis a plat : l'API ne propose pas de sous-menu).
  private fillMenu(menu: Menu, items: MenuSpec[], access: { text(): string; apply(text: string): void }): void {
    const add = (spec: MenuSpec, prefix = ``): void => {
      if (spec.separator) {
        menu.addSeparator();
        return;
      }
      if (spec.submenu) {
        for (const sub of spec.submenu) add(sub, `${spec.title ?? ``} : `);
        return;
      }
      menu.addItem((item) => {
        item.setTitle(`${prefix}${spec.title ?? ``}`);
        if (spec.icon) item.setIcon(spec.icon);
        if (spec.checked !== undefined) item.setChecked(spec.checked);
        if (spec.disabled) item.setDisabled(true);
        item.onClick(() => {
          const next = spec.run?.(access.text());
          if (next !== null && next !== undefined) access.apply(next);
        });
      });
    };
    for (const spec of items) add(spec);
  }

  private showTableMenu(event: MouseEvent, items: MenuSpec[], access: { text(): string; apply(text: string): void }): void {
    const menu = new Menu();
    this.fillMenu(menu, items, access);
    menu.showAtMouseEvent(event);
  }

  // Diagnostic : decrit les elements des tableaux affiches dans la note active et copie le resultat dans le presse-papiers, pour
  // adapter le plugin si Obsidian change la facon de les dessiner.
  private describeTables(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const tables = view ? Array.from(view.contentEl.querySelectorAll(`table`)) : [];
    const name = (el: Element): string => `${el.tagName.toLowerCase()}${el.className && typeof el.className === `string` ? `.${el.className.trim().split(/\s+/).join(`.`)}` : ``}`;
    const lines: string[] = [`Obsidian ${(this.app as unknown as { appVersion?: string }).appVersion ?? `?`}`, `Tableaux trouves : ${tables.length}`];
    tables.forEach((table, i) => {
      const chain: string[] = [];
      for (let e: Element | null = table; e && e !== view?.contentEl; e = e.parentElement) chain.push(name(e));
      lines.push(`Tableau ${i + 1} : ${chain.join(` < `)}`);
      const first = table.querySelector(`tr`);
      if (first) lines.push(`  premiere ligne : ${name(first)} > ${Array.from(first.children).map(name).join(`, `)}`);
      lines.push(`  freres : ${Array.from(table.parentElement?.children ?? []).map(name).join(`, `)}`);
    });
    const out = lines.join(`\n`);
    void navigator.clipboard.writeText(out).then(
      () => new Notice(t(`Description copiée dans le presse-papiers : {0} tableau(x).`, tables.length)),
      () => new Notice(out)
    );
  }

  openDiagnostic(): void {
    new DiagnosticModal(this.app, this).open();
  }

  openHelp(): void {
    new HelpModal(this.app, () => this.helpEntries.all()).open();
  }

  // Premiere fois : l'aide passe en tete, avec des separations autour de l'apercu et de l'export, les boutons des scripts venant apres.
  // Ensuite l'utilisateur dispose les boutons et les separations comme il veut ; rien n'est replace.
  private async placeDefaultSeparators(): Promise<void> {
    if (this.settings.panelLayoutDone) return;
    const ids = this.functions.all().filter((f) => f.button !== false && (!f.available || f.available())).map((f) => f.id);
    const full = panelOrder(ids, this.settings.panelOrder);
    const core = new Set([`insert-footnote`, `toggle-toc`, `insert-table`, `lorem-ipsum`, `draw`, `insert-figure`]);
    const rest = full.filter((id) => !isSeparator(id) && id !== `help` && id !== `export-preview`);
    const order: string[] = [];
    if (ids.includes(`help`)) order.push(`help`, `sep:1`);
    order.push(...rest.filter((id) => core.has(id)));
    if (ids.includes(`export-preview`)) order.push(`sep:2`, `export-preview`, `sep:3`);
    order.push(...rest.filter((id) => !core.has(id)));
    this.settings.panelLayoutDone = true;
    await this.saveOrder(order);
  }

  // Nouvel ordre des boutons du panneau, apres un deplacement.
  async saveOrder(order: string[]): Promise<void> {
    this.settings.panelOrder = order;
    await this.saveSettings(false);
  }

  // Reglages enregistres par l'ancien plugin (identifiant mindmap-writing), s'il est encore present dans ce coffre. Les fichiers
  // de configuration ne sont pas dans l'index du coffre : seul l'adaptateur peut les lire. A retirer dans une version ulterieure.
  private async legacyData(): Promise<unknown> {
    try {
      const path = normalizePath(`${this.app.vault.configDir}/plugins/mindmap-writing/data.json`);
      if (!(await this.app.vault.adapter.exists(path))) return null;
      return JSON.parse(await this.app.vault.adapter.read(path)) as unknown;
    } catch {
      return null;
    }
  }

  private persistLater = debounce(() => void this.saveData(this.settings), 400, true);

  // Polices et titres : style general, polices du coffre et dossier des polices (fenetre « Polices et titres » et reglages).
  typographyHost(): Omit<TypographyHost, `note`> {
    return {
      general: () => this.settings.typography,
      setGeneral: (style) => {
        this.settings.typography = style;
        void this.saveSettings(false);
        this.refreshExportPreviews();
    },
      families: () => this.fonts.library.families,
      problems: () => this.fonts.library.problems,
      folder: () => this.settings.fontFolder,
      setFolder: async (path) => {
        this.settings.fontFolder = normalizePath(path);
        void this.saveSettings(false);
        await this.fonts.refresh(true);
      },
      prepareFolder: async () => {
        let path = ``;
        for (const part of normalizePath(this.settings.fontFolder).split(`/`)) {
          path = path === `` ? part : `${path}/${part}`;
          if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
        }
        await this.fonts.refresh();
      },
      importFiles: async (files) => {
        const report = await importFonts(this.app, this.settings.fontFolder, files);
        await this.fonts.refresh(true);
        return report;
      },
      refresh: async () => {
        await this.fonts.refresh(true);
    },
    };
  }

  // Enregistre les reglages et, si demande, redessine les cartes ouvertes.
  async saveSettings(redraw = true) {
    this.applyBodySettings();
    this.persistLater();
    this.panel.sync();
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
    this.refreshExportPreviewsSoon();
  }

  // La recomposition de l'apercu de l'export (mise en page entiere) est lourde : elle attend une pause de frappe plus longue que la
  // carte, et ne se fait pas pour un apercu cache.
  private refreshExportPreviewsSoon = debounce(() => this.refreshExportPreviews(), 1500, true);

  refreshExportPreviews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_EXPORT)) {
      if (leaf.view instanceof ExportPreviewView) leaf.view.requestRefresh();
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
  // Donne au volet de la liste une part etroite de la largeur (le reste va a la note) ; on l'ajuste ensuite a la souris. Obsidian
  // ne propose pas d'API pour cela : la part de chaque volet est lue dans ses reglages internes, et un echec est sans consequence.
  private narrowPane(list: WorkspaceLeaf, note: WorkspaceLeaf): void {
    type Item = { setDimension?: (percent: number) => void; containerEl?: HTMLElement };
    try {
      const shares: [Item | undefined, number][] = [
        [(list as unknown as { parent?: Item }).parent, LIST_PANE_PERCENT],
        [(note as unknown as { parent?: Item }).parent, 100 - LIST_PANE_PERCENT],
      ];
      for (const [item, percent] of shares) {
        if (!item) continue;
        if (typeof item.setDimension === `function`) item.setDimension(percent);
        else item.containerEl?.style.setProperty(`flex-grow`, String(percent));
      }
      this.app.workspace.requestSaveLayout();
    } catch {
      // La taille reste celle qu'Obsidian a choisie.
    }
  }

  async activateView() {
    const { workspace } = this.app;
    const active = workspace.getActiveViewOfType(MarkdownView);
    this.rememberFile(workspace.getActiveFile());
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0] ?? null;
    let adopted: WorkspaceLeaf | null = null;
    let narrow = false;
    if (!leaf) {
      if (active && active.file) {
        // La vue Liste s'ouvre dans un volet etroit a gauche de la note (la note est donc a droite) ; la carte, a la place choisie
        // dans les reglages (position de la note par rapport a la carte).
        const listMode = this.settings.viewMode === `list`;
        const pos = listMode ? `right` : this.settings.panePosition;
        const direction = pos === `right` || pos === `left` ? `vertical` : `horizontal`;
        leaf = workspace.createLeafBySplit(active.leaf, direction, pos === `right` || pos === `bottom`);
        adopted = active.leaf;
        if (listMode) narrow = true;
      } else {
        leaf = workspace.getLeaf(`tab`);
      }
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
      if (narrow && adopted) this.narrowPane(leaf, adopted);
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

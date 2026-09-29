import { EditorView } from "@codemirror/view";
import { setActiveRange } from "./active-chapter";
import { revealRange } from "./reveal";
import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type MindmapWritingPlugin from "./main";
import { activeLines, flattenDoc, joinBody, locateInSections, MmDoc, nodeAtLine, nodeByKey, parseNote, pathTitles, serializeNote, splitBody } from "./model";
import { ParagraphPane } from "./paragraph";
import { MapRenderer } from "./renderer";

export const VIEW_TYPE_MINDMAP = `mindmap-writing-view`;

const SAVE_DELAY = 350;

export class MindmapView extends ItemView {
  private plugin: MindmapWritingPlugin;
  private renderer: MapRenderer | null = null;
  private pane: ParagraphPane | null = null;
  private splitEl!: HTMLElement;
  private mapHost!: HTMLElement;
  private splitter!: HTMLElement;
  private paneHost!: HTMLElement;

  private doc: MmDoc | null = null;
  private renderToken = 0;
  private selectedKey: string | null = null;
  private paneFile: TFile | null = null;
  private expectedTitle = ``;
  private pendingTimer: number | null = null;
  private cursors = new Map<string, number>();
  private noteLeaf: WorkspaceLeaf | null = null;
  private noteCursors = new Map<string, { line: number; ch: number }>();
  private lastNoteLine = -1;
  private lastNoteLines = -1;
  private currentPath = ``;

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
    this.splitEl = this.contentEl.createDiv({ cls: `mmw-split` });
    this.mapHost = this.splitEl.createDiv({ cls: `mmw-map-host` });
    this.splitter = this.splitEl.createDiv({ cls: `mmw-splitter` });
    this.paneHost = this.splitEl.createDiv({ cls: `mmw-pane-host` });

    this.renderer = new MapRenderer(this.mapHost, () => this.plugin.settings, {
      onCompactChange: (v) => {
        this.plugin.settings.compactness = v;
        void this.plugin.saveSettings(false);
      },
      onSelect: (key) => void this.onSelect(key),
      onEnter: () => this.focusNote(),
    });
    this.pane = new ParagraphPane(this.paneHost, {
      onChange: () => this.schedulePaneWrite(),
      onEscape: () => this.focusMap(),
    });
    this.setupSplitter();
    this.applyLayout();
    await this.refresh();
  }

  async onClose() {
    this.clearActive();
    await this.flushPane();
    this.renderer?.destroy();
    this.pane?.destroy();
    this.renderer = null;
    this.pane = null;
  }

  // ---------------------------------------------------------------- disposition

  applyLayout() {
    const s = this.plugin.settings;
    for (const pos of [`right`, `left`, `top`, `bottom`]) this.splitEl.removeClass(`mmw-pos-${pos}`);
    this.splitEl.addClass(`mmw-pos-${s.panePosition}`);
    this.splitEl.toggleClass(`mmw-native`, s.paragraphMode === `native`);
    this.paneHost.style.flex = `0 0 ${s.paneSize}px`;
  }

  private setupSplitter() {
    this.splitter.addEventListener(`pointerdown`, (e: PointerEvent) => {
      e.preventDefault();
      const s = this.plugin.settings;
      const horizontal = s.panePosition === `right` || s.panePosition === `left`;
      const sign = s.panePosition === `right` || s.panePosition === `bottom` ? -1 : 1;
      const start = horizontal ? e.clientX : e.clientY;
      const startSize = s.paneSize;
      const total = horizontal ? this.splitEl.clientWidth : this.splitEl.clientHeight;
      this.splitter.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const delta = (horizontal ? ev.clientX : ev.clientY) - start;
        s.paneSize = Math.round(Math.max(200, Math.min(total - 200, startSize + sign * delta)));
        this.paneHost.style.flex = `0 0 ${s.paneSize}px`;
      };
      const up = (ev: PointerEvent) => {
        this.splitter.removeEventListener(`pointermove`, move);
        this.splitter.removeEventListener(`pointerup`, up);
        if (this.splitter.hasPointerCapture(ev.pointerId)) this.splitter.releasePointerCapture(ev.pointerId);
        void this.plugin.saveSettings(false);
      };
      this.splitter.addEventListener(`pointermove`, move);
      this.splitter.addEventListener(`pointerup`, up);
    });
  }

  // ---------------------------------------------------------------- lecture du fichier

  async refresh() {
    const renderer = this.renderer;
    const pane = this.pane;
    if (!renderer || !pane) return;
    const token = ++this.renderToken;
    const file = this.plugin.lastFile;

    if (this.paneFile && file?.path !== this.paneFile.path) {
      await this.flushPane();
      this.selectedKey = null;
      this.paneFile = null;
      pane.clear();
    }
    if (!file) {
      this.doc = null;
      renderer.setDoc(null, ``, true);
      return;
    }
    if (file.path !== this.currentPath) {
      // Autre note : la selection et les positions memorisees ne s'appliquent plus.
      this.currentPath = file.path;
      this.selectedKey = null;
      this.noteCursors.clear();
      this.lastNoteLine = -1;
      this.lastNoteLines = -1;
    }
    const text = this.plugin.getOpenText(file) ?? (await this.app.vault.cachedRead(file));
    if (token !== this.renderToken || this.renderer !== renderer) return;
    const doc = parseNote(text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, file.path, serializeNote(doc) === text);
    if (!this.isNative()) this.syncPane();
  }

  // Redessine la carte apres un changement de reglage, sans relire le fichier.
  redraw() {
    this.applyLayout();
    this.renderer?.rebuild();
    if (this.selectedKey) {
      if (this.isNative()) void this.revealInNote(this.selectedKey, false);
      else this.loadPane();
    }
    this.updateActiveRange();
  }

  private isNative(): boolean {
    return this.plugin.settings.paragraphMode === `native`;
  }

  // ---------------------------------------------------------------- chapitre actif

  // Vrai si l'editeur est celui du volet de note ouvert par cette carte.
  ownsEditor(cm: EditorView): boolean {
    const leaf = this.noteLeaf;
    return !!leaf && leaf.view.containerEl.contains(cm.dom);
  }

  private getNoteCm(): EditorView | null {
    for (const cm of this.plugin.editorViews) if (this.ownsEditor(cm)) return cm;
    return null;
  }

  // Le curseur de la note a change de ligne : la carte selectionne le chapitre correspondant.
  onNoteMoved(cm: EditorView) {
    const file = this.plugin.lastFile;
    const renderer = this.renderer;
    if (!file || !renderer || !this.isNative()) return;
    const state = cm.state;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const line0 = line.number - 1;
    // Une frappe dans la meme ligne ne change pas de chapitre : le changement se fait a la validation par Entree.
    if (line0 === this.lastNoteLine && state.doc.lines === this.lastNoteLines) return;
    this.lastNoteLine = line0;
    this.lastNoteLines = state.doc.lines;

    const text = state.doc.toString();
    const doc = parseNote(text, file.name);
    const { key } = nodeAtLine(doc, line0);
    this.doc = doc;
    this.selectedKey = key;
    this.noteCursors.set(key, { line: line0, ch: head - line.from });
    renderer.setDoc(doc, file.path, serializeNote(doc) === text);
    renderer.reveal(key);
    renderer.select(key, false);
    this.updateActiveRange();
  }

  // Grise les chapitres inactifs dans la note reliee, selon le noeud selectionne.
  updateActiveRange() {
    const cm = this.getNoteCm();
    if (!cm) return;
    const s = this.plugin.settings;
    const range = s.contrastEnabled && this.selectedKey && this.doc ? activeLines(this.doc, this.selectedKey, s.includeSubtitles) : null;
    if (!range) {
      cm.dispatch({ effects: setActiveRange.of(null) });
      return;
    }
    const d = cm.state.doc;
    const from = d.line(Math.min(range.startLine, d.lines - 1) + 1).from;
    const to = range.endLine >= d.lines ? d.length : d.line(range.endLine + 1).from;
    cm.dispatch({ effects: setActiveRange.of({ from, to }) });
  }

  clearActive() {
    const cm = this.getNoteCm();
    if (cm) cm.dispatch({ effects: setActiveRange.of(null) });
  }

  // Deplacement d'un chapitre a l'autre depuis la note, avec les touches configurees.
  async navigateFromNote(dir: `up` | `down` | `left` | `right`) {
    const renderer = this.renderer;
    if (!this.doc || !renderer) return;
    const flat = flattenDoc(this.doc);
    const current = this.selectedKey ?? `r`;
    const index = flat.findIndex((e) => e.key === current);
    let target: string | undefined;
    if (dir === `up`) target = flat[index - 1]?.key;
    else if (dir === `down`) target = flat[index + 1]?.key;
    else if (dir === `left`) target = current.includes(`.`) ? current.slice(0, current.lastIndexOf(`.`)) : undefined;
    else target = nodeByKey(this.doc, current)?.children.length ? `${current}.0` : undefined;
    if (!target) return;
    this.selectedKey = target;
    renderer.reveal(target);
    renderer.select(target, false);
    await this.revealInNote(target, true);
  }

  // ---------------------------------------------------------------- note Obsidian en vis-a-vis

  focusMap() {
    this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
    this.renderer?.focus();
  }

  // Passe en saisie du paragraphe : dans l'editeur d'Obsidian ou dans l'editeur simple.
  focusNote() {
    if (!this.renderer) return;
    const key = this.renderer.getSelectedKey();
    if (!key) return;
    this.selectedKey = key;
    if (this.isNative()) void this.revealInNote(key, true);
    else this.pane?.focus();
  }

  private async ensureNoteLeaf(file: TFile): Promise<WorkspaceLeaf> {
    const ws = this.app.workspace;
    let leaf = this.noteLeaf;
    if (leaf && !ws.getLeavesOfType(`markdown`).includes(leaf)) leaf = null;
    if (!leaf) {
      const pos = this.plugin.settings.panePosition;
      const direction = pos === `right` || pos === `left` ? `vertical` : `horizontal`;
      leaf = ws.createLeafBySplit(this.leaf, direction, pos === `left` || pos === `top`);
    }
    this.noteLeaf = leaf;
    const v = leaf.view;
    if (!(v instanceof MarkdownView) || !v.file || v.file.path !== file.path) {
      await leaf.openFile(file, { active: false });
    }
    return leaf;
  }

  // Memorise la position du curseur dans la note si elle se trouve dans le texte du noeud quitte.
  private rememberNoteCursor(key: string | null) {
    if (!key || !this.doc || !this.noteLeaf) return;
    const view = this.noteLeaf.view;
    const node = nodeByKey(this.doc, key);
    if (!(view instanceof MarkdownView) || !node || node.line === undefined || node.endLine === undefined) return;
    const cursor = view.editor.getCursor();
    if (cursor.line > node.line && cursor.line < node.endLine) this.noteCursors.set(key, { line: cursor.line, ch: cursor.ch });
  }

  // Affiche le chapitre du noeud dans la note, curseur dans son texte pret a etre complete.
  // Avec focus, le clavier passe aussi dans la note.
  private async revealInNote(key: string, focus: boolean) {
    const file = this.plugin.lastFile;
    const node = this.doc ? nodeByKey(this.doc, key) : null;
    if (!file || !node) return;
    const leaf = await this.ensureNoteLeaf(file);
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const editor = view.editor;
    const last = editor.lastLine();
    const headLine = Math.min(node.line ?? 0, last);

    // Premiere et derniere lignes du texte du noeud (sans les lignes vides finales).
    const first = Math.min(headLine + 1, last);
    let end = Math.min((node.endLine ?? first + 1) - 1, last);
    while (end > first && editor.getLine(end).trim() === ``) end--;
    end = Math.max(end, headLine);
    const hasText = end >= first && editor.getLine(end).trim() !== ``;
    const endLine = hasText ? end : headLine;

    const remembered = this.noteCursors.get(key);
    const mode = this.plugin.settings.cursorPosition;
    let cursor = { line: endLine, ch: editor.getLine(endLine).length };
    if (mode === `start`) cursor = { line: hasText ? first : headLine, ch: 0 };
    else if (mode === `last` && remembered && remembered.line >= first && remembered.line <= endLine) cursor = remembered;

    if (view.getMode() !== `source`) {
      if (focus) await view.setState({ ...view.getState(), mode: `source` }, { history: false });
      else {
        leaf.setEphemeralState({ line: headLine });
        return;
      }
    }

    const cm = (editor as unknown as { cm?: EditorView }).cm;
    if (cm) {
      revealRange(cm, { headLine, endLine, cursorLine: cursor.line, cursorCh: cursor.ch });
    } else {
      editor.setCursor(cursor);
      editor.scrollIntoView({ from: { line: headLine, ch: 0 }, to: { line: endLine, ch: 0 } }, true);
    }
    if (focus) {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      editor.focus();
    }
    this.updateActiveRange();
  }

  // ---------------------------------------------------------------- vue Paragraphe simple

  private async onSelect(key: string | null) {
    if (this.isNative()) {
      this.rememberNoteCursor(this.selectedKey);
      this.selectedKey = key;
      if (key) await this.revealInNote(key, this.plugin.settings.focusNoteOnSelect);
      return;
    }
    await this.flushPane();
    if (this.selectedKey && this.pane) this.cursors.set(this.selectedKey, this.pane.getCursor());
    this.selectedKey = key;
    this.loadPane();
  }

  private loadPane(cursorOverride?: number) {
    const pane = this.pane;
    if (!pane) return;
    const key = this.selectedKey;
    const doc = this.doc;
    const file = this.plugin.lastFile;
    const node = key && doc ? nodeByKey(doc, key) : null;
    if (!key || !doc || !file || !node) {
      this.paneFile = null;
      pane.clear();
      return;
    }
    this.paneFile = file;
    this.expectedTitle = node.title;
    const core = splitBody(node.body).core;
    let cursor = core.length;
    if (cursorOverride !== undefined) cursor = cursorOverride;
    else if (this.plugin.settings.cursorPosition === `start`) cursor = 0;
    else if (this.plugin.settings.cursorPosition === `last` && this.cursors.has(key)) cursor = this.cursors.get(key)!;
    pane.setNode(key, pathTitles(doc, key), core, cursor);
  }

  // Apres une relecture du fichier : garde la vue Paragraphe coherente avec la note.
  private syncPane() {
    const pane = this.pane;
    const renderer = this.renderer;
    if (!pane || !renderer || !this.selectedKey || !this.doc) return;
    const node = nodeByKey(this.doc, this.selectedKey);
    if (!node) {
      this.selectedKey = null;
      renderer.select(null, false);
      pane.clear();
      return;
    }
    const core = splitBody(node.body).core;
    if (core === pane.getText()) {
      this.expectedTitle = node.title;
      return;
    }
    if (pane.hasFocus() || this.pendingTimer !== null) {
      // Texte en cours de saisie : si un titre Markdown vient d'etre tape, le texte est scinde en noeuds.
      if (this.pendingTimer === null) this.followSplit();
      return;
    }
    this.loadPane();
  }

  // Un titre tape dans le paragraphe cree un nouveau noeud : la selection suit le curseur.
  private followSplit() {
    const pane = this.pane;
    const renderer = this.renderer;
    const doc = this.doc;
    const key = this.selectedKey;
    if (!pane || !renderer || !doc || !key) return;
    const loc = locateInSections(pane.getText(), pane.getCursor());
    if (loc.count < 2) return;
    if (loc.index === 0) {
      this.loadPane(pane.getCursor());
      return;
    }
    const flat = flattenDoc(doc);
    const at = flat.findIndex((e) => e.key === key);
    const target = flat[at + loc.index];
    if (at < 0 || !target) {
      this.loadPane(pane.getCursor());
      return;
    }
    const rel = loc.offset;
    renderer.reveal(target.key);
    renderer.select(target.key, false);
    this.cursors.delete(target.key);
    this.selectedKey = target.key;
    this.loadPane(rel);
  }

  private schedulePaneWrite() {
    if (this.pendingTimer !== null) window.clearTimeout(this.pendingTimer);
    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      void this.writeEdit();
    }, SAVE_DELAY);
  }

  private async flushPane() {
    if (this.pendingTimer === null) return;
    window.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    await this.writeEdit();
  }

  // Ecrit le texte du paragraphe dans le fichier, en repartant du contenu le plus recent du fichier.
  private async writeEdit() {
    const pane = this.pane;
    const file = this.paneFile;
    const key = this.selectedKey;
    if (!pane || !file || !key) return;
    const text = pane.getText();
    const expected = this.expectedTitle;
    let conflict = false;
    await this.app.vault.process(file, (data) => {
      const d = parseNote(data, file.name);
      const node = nodeByKey(d, key);
      if (!node || node.title !== expected) {
        conflict = true;
        return data;
      }
      const parts = splitBody(node.body);
      if (parts.core === text) return data;
      node.body = joinBody(parts, text);
      return serializeNote(d);
    });
    if (conflict) {
      new Notice(`La note a été modifiée ailleurs : le paragraphe a été rechargé sans écraser ces changements.`);
      this.selectedKey = null;
      this.renderer?.select(null, false);
      pane.clear();
      await this.refresh();
    }
  }
}

import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type MindmapWritingPlugin from "./main";
import { flattenDoc, joinBody, locateInSections, MmDoc, nodeByKey, parseNote, pathTitles, serializeNote, splitBody } from "./model";
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
      onEnter: () => this.pane?.focus(),
    });
    this.pane = new ParagraphPane(this.paneHost, {
      onChange: () => this.schedulePaneWrite(),
      onEscape: () => this.renderer?.focus(),
    });
    this.setupSplitter();
    this.applyLayout();
    await this.refresh();
  }

  async onClose() {
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
    const text = await this.app.vault.cachedRead(file);
    if (token !== this.renderToken || this.renderer !== renderer) return;
    const doc = parseNote(text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, file.path, serializeNote(doc) === text);
    this.syncPane();
  }

  // Redessine la carte apres un changement de reglage, sans relire le fichier.
  redraw() {
    this.applyLayout();
    this.renderer?.rebuild();
  }

  // ---------------------------------------------------------------- vue Paragraphe

  private async onSelect(key: string | null) {
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

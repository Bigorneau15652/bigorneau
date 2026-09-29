import { EditorView } from "@codemirror/view";
import { setActiveRange } from "./active-chapter";
import { revealRange } from "./reveal";
import { Editor, ItemView, MarkdownView, Modal, Notice, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { addNode, deleteNodes, DeletionReport, describeDeletion, EditResult, renameTitle } from "./edit";
import type MindmapWritingPlugin from "./main";
import { activeLines, applyLineEdits, flattenDoc, LineEdit, MmDoc, nodeAtLine, nodeByKey, parseNote, serializeNote } from "./model";
import { appearanceDefaults, MmSettings, PanePosition } from "./settings";
import { MetaChange, metaEditsFor, planReset, planStyle } from "./style-edit";
import type { StylePatch } from "./style";
import { MapEdit, MapRenderer } from "./renderer";

// Fenetre de confirmation avant de supprimer des titres et leur contenu.
class ConfirmDeleteModal extends Modal {
  private confirmed = false;

  constructor(app: import("obsidian").App, private report: DeletionReport, private done: (ok: boolean) => void) {
    super(app);
  }

  onOpen() {
    const r = this.report;
    const what = r.nodes === 1 ? `« ${r.titles[0]} »` : `${r.nodes} titres`;
    this.titleEl.setText(`Supprimer ${what} ?`);
    const parts: string[] = [];
    if (r.subtitles > 0) parts.push(`${r.subtitles} sous-titre${r.subtitles > 1 ? `s` : ``}`);
    parts.push(`environ ${r.words} mot${r.words > 1 ? `s` : ``} de texte`);
    this.contentEl.createEl(`p`, { text: `Cette suppression retire aussi ${parts.join(` et `)}. Vous pourrez l'annuler avec l'historique de la note (Cmd ou Ctrl + Z).` });
    let confirmButton: HTMLElement | null = null;
    new Setting(this.contentEl)
      .addButton((b) => {
        b.setButtonText(`Supprimer`).setWarning().onClick(() => {
          this.confirmed = true;
          this.close();
        });
        confirmButton = b.buttonEl;
      })
      .addButton((b) => b.setButtonText(`Annuler`).onClick(() => this.close()));
    (confirmButton as HTMLElement | null)?.focus();
  }

  onClose() {
    this.contentEl.empty();
    this.done(this.confirmed);
  }
}

export const VIEW_TYPE_MINDMAP = `mindmap-writing-view`;

export class MindmapView extends ItemView {
  private plugin: MindmapWritingPlugin;
  private renderer: MapRenderer | null = null;
  private mapHost!: HTMLElement;

  private doc: MmDoc | null = null;
  private renderToken = 0;
  private selectedKey: string | null = null;
  private noteLeaf: WorkspaceLeaf | null = null;
  private notePosition: PanePosition | null = null;
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
    this.mapHost = this.contentEl.createDiv({ cls: `mmw-map-host` });

    this.renderer = new MapRenderer(this.mapHost, () => this.plugin.settings, {
      onChange: (patch) => void this.plugin.updateSettings(patch),
      onStyle: (patch, individual) => void this.applyStyle(patch, individual),
      onResetStyle: (individual) => void this.resetStyle(individual),
      onUndo: () => this.undoRedo(`undo`),
      onRedo: () => this.undoRedo(`redo`),
      onOpenSettings: () => this.plugin.openSettings(),
      onSelect: (key) => void this.onSelect(key),
      onEnter: () => this.focusNote(),
      onEdit: (edit) => void this.onEdit(edit),
      onMessage: (text) => new Notice(text),
    });
    await this.refresh();
  }

  async onClose() {
    this.clearActive();
    this.renderer?.destroy();
    this.renderer = null;
  }

  // ---------------------------------------------------------------- lecture du fichier

  async refresh() {
    const renderer = this.renderer;
    if (!renderer) return;
    const token = ++this.renderToken;
    const file = this.plugin.lastFile;

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
  }

  // Redessine la carte apres un changement de reglage, sans relire le fichier.
  redraw() {
    this.renderer?.rebuild();
    const position = this.plugin.settings.panePosition;
    if (this.notePosition !== null && position !== this.notePosition) {
      // La position de la note a change : le volet est recree au bon endroit.
      this.noteLeaf?.detach();
      this.noteLeaf = null;
      this.notePosition = null;
      if (this.selectedKey) void this.revealInNote(this.selectedKey, false);
      return;
    }
    this.updateActiveRange();
  }

  // ---------------------------------------------------------------- modifications de la structure

  // Creer, renommer ou supprimer depuis la carte : le nouveau texte est calcule puis ecrit dans l'editeur
  // de la note en une seule transaction, ce qui rend l'annulation d'Obsidian utilisable.
  private async onEdit(edit: MapEdit) {
    const file = this.plugin.lastFile;
    const renderer = this.renderer;
    if (!file || !renderer) return;
    const readText = async (): Promise<string> => {
      const editor = this.plugin.getOpenEditor(file);
      return editor ? editor.getValue() : await this.app.vault.read(file);
    };

    if (edit.kind === `delete`) {
      const report = describeDeletion(await readText(), file.name, edit.keys);
      if (report.nodes === 0) {
        new Notice(`La racine ne peut pas être supprimée.`);
        return;
      }
      const ok = await new Promise<boolean>((resolve) => new ConfirmDeleteModal(this.app, report, resolve).open());
      if (!ok) {
        renderer.focus();
        return;
      }
    }

    const before = await readText();
    let result: EditResult | null;
    if (edit.kind === `delete`) result = deleteNodes(before, file.name, edit.keys);
    else if (edit.kind === `rename`) result = renameTitle(before, file.name, edit.key, edit.title ?? ``);
    else {
      result = addNode(before, file.name, edit.key, edit.kind);
      if (!result) new Notice(`Le niveau de titre maximum (6) est atteint : impossible d'ajouter un sous-titre.`);
    }
    if (!result) return;

    await this.writeText(file, before, result.text);
    const doc = parseNote(result.text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, file.path, serializeNote(doc) === result.text);
    const key = result.key;
    if (edit.kind !== `rename` && key) {
      this.selectedKey = key;
      renderer.reveal(key);
      renderer.select(key, false);
      await this.revealInNote(key, false);
      this.updateActiveRange();
    }
    if (edit.kind === `delete`) renderer.focus();
    else if (edit.kind !== `rename` && key) renderer.startRename(key);
  }

  // Remplace le texte de la note en ne touchant que la partie modifiee.
  private async writeText(file: TFile, before: string, after: string) {
    const editor = this.plugin.getOpenEditor(file);
    if (!editor) {
      await this.app.vault.process(file, (data) => (data === before ? after : data));
      return;
    }
    const limit = Math.min(before.length, after.length);
    let start = 0;
    while (start < limit && before[start] === after[start]) start++;
    let tail = 0;
    while (tail < limit - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
    editor.transaction({
      changes: [{ from: editor.offsetToPos(start), to: editor.offsetToPos(before.length - tail), text: after.slice(start, after.length - tail) }],
    });
  }

  // ---------------------------------------------------------------- styles

  // Modifie le style de la selection (voir planStyle pour les regles de portee). Les styles par niveau
  // et par case sont inscrits dans des commentaires invisibles de la note.
  private async applyStyle(patch: StylePatch, individual: boolean) {
    const renderer = this.renderer;
    if (!renderer || !this.doc) {
      await this.plugin.updateSettings(patch as Partial<MmSettings>);
      return;
    }
    const plan = planStyle(this.doc, renderer.getSelection(), patch, individual);
    if (plan.settings) await this.plugin.updateSettings(plan.settings as Partial<MmSettings>);
    await this.applyMetaChanges(plan.changes);
  }

  // Retire les styles de la selection (par niveau, ou de la case seule), ou reinitialise toute la carte.
  private async resetStyle(individual: boolean) {
    const renderer = this.renderer;
    if (!renderer || !this.doc) return;
    const plan = planReset(this.doc, renderer.getSelection(), individual);
    if (plan.resetSettings) await this.plugin.updateSettings(appearanceDefaults());
    await this.applyMetaChanges(plan.changes);
  }

  // Ecrit des commentaires de style dans la note : dans l'editeur d'Obsidian s'il est ouvert (l'annulation
  // de la note les couvre), sinon directement dans le fichier.
  private async applyMetaChanges(changes: MetaChange[]) {
    const file = this.plugin.lastFile;
    if (!file || changes.length === 0) return;
    const editor = this.plugin.getOpenEditor(file);
    if (editor) {
      const edits = metaEditsFor(parseNote(editor.getValue(), file.name), changes);
      if (edits.length > 0) this.applyEditsToEditor(editor, edits);
    } else {
      await this.app.vault.process(file, (data) => {
        const doc = parseNote(data, file.name);
        const edits = metaEditsFor(doc, changes);
        return edits.length > 0 ? applyLineEdits(data, edits, doc.eol) : data;
      });
    }
    await this.refresh();
  }

  private applyEditsToEditor(editor: Editor, edits: LineEdit[]) {
    const last = editor.lastLine();
    const changes = edits.map((e) => {
      if (e.kind === `replace`) {
        return { from: { line: e.line, ch: 0 }, to: { line: e.line, ch: editor.getLine(e.line).length }, text: e.text };
      }
      if (e.kind === `delete`) {
        if (e.line < last) return { from: { line: e.line, ch: 0 }, to: { line: e.line + 1, ch: 0 }, text: `` };
        return { from: { line: e.line - 1, ch: editor.getLine(e.line - 1).length }, to: { line: e.line, ch: editor.getLine(e.line).length }, text: `` };
      }
      if (e.line <= last) return { from: { line: e.line, ch: 0 }, text: `${e.text}\n` };
      return { from: { line: last, ch: editor.getLine(last).length }, text: `\n${e.text}` };
    });
    editor.transaction({ changes });
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
    if (!file || !renderer) return;
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

  // Passe en saisie du paragraphe dans l'editeur d'Obsidian.
  focusNote() {
    if (!this.renderer) return;
    const key = this.renderer.getSelectedKey();
    if (!key) return;
    this.selectedKey = key;
    void this.revealInNote(key, true);
  }

  // Annuler et retablir agissent sur l'historique de l'editeur de la note.
  private undoRedo(action: `undo` | `redo`) {
    const view = this.noteLeaf?.view;
    if (!(view instanceof MarkdownView)) {
      new Notice(`Sélectionnez d'abord un titre : la note s'ouvre à côté de la carte.`);
      return;
    }
    if (action === `undo`) view.editor.undo();
    else view.editor.redo();
  }

  private async onSelect(key: string | null) {
    this.rememberNoteCursor(this.selectedKey);
    this.selectedKey = key;
    if (key) await this.revealInNote(key, this.plugin.settings.focusNoteOnSelect);
  }

  private async ensureNoteLeaf(file: TFile): Promise<WorkspaceLeaf> {
    const ws = this.app.workspace;
    let leaf = this.noteLeaf;
    if (leaf && !ws.getLeavesOfType(`markdown`).includes(leaf)) leaf = null;
    if (!leaf) {
      const pos = this.plugin.settings.panePosition;
      const direction = pos === `right` || pos === `left` ? `vertical` : `horizontal`;
      leaf = ws.createLeafBySplit(this.leaf, direction, pos === `left` || pos === `top`);
      this.notePosition = pos;
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
    const first = Math.min((node.metaLine ?? headLine) + 1, last);
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
}

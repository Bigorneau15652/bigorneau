import { EditorView } from "@codemirror/view";
import { setActiveRange, tempLineField } from "./active-chapter";
import { openBlankLine, releaseTempLine } from "./temp-line";
import { revealRange } from "./reveal";
import { Editor, ItemView, MarkdownView, Menu, Modal, Notice, Platform, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { addNode, arrowTarget, countHeadings, deleteNodes, DeletionReport, describeDeletion, duplicateNodes, EditResult, extractBranches, insertBranches, moveNode, renameTitle } from "./edit";
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
  private currentFile: TFile | null = null;
  private mapKey = ``;
  private editQueue: Promise<void> = Promise.resolve();

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
    // Revenir a la carte retire la ligne vierge ajoutee sous un titre si on n'y a rien ecrit.
    this.registerDomEvent(this.mapHost, `focusin`, () => this.releaseTemp());
    // Cmd ou Ctrl + D : enregistre aupres d'Obsidian pour cette vue, car un raccourci general peut l'intercepter
    // avant la carte. Il n'agit que si la carte a le focus.
    this.scope?.register([`Mod`], `d`, () => {
      const active = this.mapHost.ownerDocument.activeElement;
      if (!active || !this.mapHost.contains(active)) return true;
      this.duplicateSelection();
      return false;
    });

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
      onContextMenu: (key, event) => this.showContextMenu(key, event),
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
    if (file !== this.currentFile) {
      // Autre note : la selection et les positions memorisees ne s'appliquent plus.
      this.currentFile = file;
      this.mapKey = file.path;
      this.selectedKey = null;
      this.noteCursors.clear();
      this.lastNoteLine = -1;
      this.lastNoteLines = -1;
    }
    const text = this.plugin.getOpenText(file) ?? (await this.app.vault.cachedRead(file));
    if (token !== this.renderToken || this.renderer !== renderer) return;
    const doc = parseNote(text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, this.mapKey, serializeNote(doc) === text);
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
  // Les modifications se font l'une apres l'autre : des appuis rapproches sur les fleches ne se melangent pas.
  private onEdit(edit: MapEdit) {
    this.editQueue = this.editQueue.then(() => this.runEdit(edit)).catch(() => undefined);
  }

  private async runEdit(edit: MapEdit) {
    const file = this.plugin.lastFile;
    const renderer = this.renderer;
    if (!file || !renderer) return;
    const readText = async (): Promise<string> => {
      const editor = this.plugin.getOpenEditor(file);
      return editor ? editor.getValue() : await this.app.vault.read(file);
    };

    // Copier et couper : le presse-papiers recoit les titres en Markdown. Couper supprime ensuite, sans confirmation
    // (la note garde l'historique d'annulation).
    if (edit.kind === `copy` || edit.kind === `cut`) {
      const markdown = extractBranches(await readText(), file.name, edit.keys);
      if (markdown === null) {
        new Notice(`Le nom de la note ne se copie pas : sélectionnez un titre.`);
        return;
      }
      try {
        await navigator.clipboard.writeText(markdown);
      } catch {
        new Notice(`Impossible d'écrire dans le presse-papiers.`);
        return;
      }
      const count = countHeadings(markdown);
      new Notice(`${count} titre${count > 1 ? `s` : ``} ${edit.kind === `cut` ? `coupé` : `copié`}${count > 1 ? `s` : ``}.`, 1500);
      if (edit.kind === `copy`) return;
    }

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
    // Une direction (fleches) s'applique a la case selectionnee au moment du traitement, pas a celle de l'appui.
    if (edit.kind === `move` && edit.dir) edit.key = renderer.getSelectedKey() ?? edit.key;
    if (edit.kind === `rename` && edit.key === `r`) {
      await this.renameFile(file, edit.title ?? ``);
      return;
    }
    let result: EditResult | null;
    if (edit.kind === `delete` || edit.kind === `cut`) result = deleteNodes(before, file.name, edit.keys);
    else if (edit.kind === `duplicate`) {
      result = duplicateNodes(before, file.name, edit.keys);
      if (!result) new Notice(`Le nom de la note ne se duplique pas : sélectionnez un titre.`);
    } else if (edit.kind === `paste` || edit.kind === `pasteAfter`) {
      let clip = ``;
      try {
        clip = await navigator.clipboard.readText();
      } catch {
        new Notice(`Impossible de lire le presse-papiers.`);
        return;
      }
      let parentKey = edit.key;
      let index = Number.MAX_SAFE_INTEGER;
      if (edit.kind === `pasteAfter`) {
        const parts = edit.key.split(`.`);
        index = Number(parts.pop()) + 1;
        parentKey = parts.join(`.`);
      }
      result = edit.kind === `pasteAfter` && edit.key === `r` ? null : insertBranches(before, file.name, parentKey, index, clip);
      if (!result) new Notice(`Le presse-papiers ne contient pas de titres Markdown à coller ici (ou le niveau 6 serait dépassé).`);
    } else if (edit.kind === `rename`) result = renameTitle(before, file.name, edit.key, edit.title ?? ``);
    else if (edit.kind === `move`) {
      const target = edit.dir
        ? arrowTarget(parseNote(before, file.name), edit.key, edit.dir)
        : { parentKey: edit.parentKey ?? `r`, index: edit.index ?? 0 };
      result = target ? moveNode(before, file.name, edit.key, target.parentKey, target.index) : null;
      if (!target) new Notice(this.noMoveReason(edit.dir), 2500);
      else if (!result) new Notice(`Déplacement impossible : le niveau de titre maximum (6) serait dépassé.`);
      if (!result || result.text === before) {
        renderer.resetPreview();
        return;
      }
    } else {
      result = addNode(before, file.name, edit.key, edit.kind === `sibling` ? `sibling` : `child`);
      if (!result) new Notice(`Le niveau de titre maximum (6) est atteint : impossible d'ajouter un sous-titre.`);
    }
    if (!result) {
      renderer.resetPreview();
      return;
    }

    await this.writeText(file, before, result.text);
    const doc = parseNote(result.text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, this.mapKey, serializeNote(doc) === result.text);
    const key = result.key;
    if (edit.kind !== `rename` && key) {
      this.selectedKey = key;
      renderer.reveal(key);
      renderer.select(key, false);
      await this.revealInNote(key, false);
      this.updateActiveRange();
    }
    // Une case creee s'ouvre en saisie ; apres les autres operations, le clavier reste sur la carte.
    if (edit.kind === `child` || edit.kind === `sibling`) {
      if (key) renderer.startRename(key);
    } else if (edit.kind !== `rename`) {
      renderer.focus();
    }
  }

  // Menu du clic droit sur une case : edition, presse-papiers et acces a l'apparence.
  private showContextMenu(key: string, event: MouseEvent) {
    const renderer = this.renderer;
    if (!renderer) return;
    const isRoot = key === `r`;
    const selection = renderer.getSelection();
    const keys = selection.includes(key) ? selection : [key];
    const mod = Platform.isMacOS ? `Cmd` : `Ctrl`;
    const menu = new Menu();
    const add = (title: string, icon: string, action: () => void, opts: { disabled?: boolean; warning?: boolean } = {}) => {
      menu.addItem((item) => {
        item.setTitle(title).setIcon(icon).onClick(action);
        if (opts.disabled) item.setDisabled(true);
        if (opts.warning) item.setWarning(true);
      });
    };
    const run = (kind: MapEdit[`kind`]) => () => this.onEdit({ kind, key, keys });

    add(isRoot ? `Renommer la note (F2)` : `Renommer (F2)`, `pencil`, () => renderer.startRename(key));
    add(`Ajouter un sous-titre (Tab)`, `corner-down-right`, run(`child`));
    add(`Ajouter un titre de même niveau (Entrée)`, `plus`, run(`sibling`), { disabled: isRoot });
    menu.addSeparator();
    add(`Dupliquer (${mod} + D)`, `files`, run(`duplicate`), { disabled: isRoot });
    add(`Copier (${mod} + C)`, `copy`, run(`copy`), { disabled: isRoot });
    add(`Couper (${mod} + X)`, `scissors`, run(`cut`), { disabled: isRoot });
    add(`Coller dedans (${mod} + V)`, `clipboard-paste`, run(`paste`));
    add(`Coller après`, `clipboard-list`, run(`pasteAfter`), { disabled: isRoot });
    menu.addSeparator();
    add(`Apparence…`, `palette`, () => renderer.openStylePanel());
    menu.addSeparator();
    add(`Supprimer (Suppr)`, `trash-2`, run(`delete`), { disabled: isRoot, warning: true });
    menu.showAtMouseEvent(event);
  }

  private noMoveReason(dir?: `up` | `down` | `left` | `right`): string {
    if (dir === `up`) return `Ce titre est déjà le premier parmi les titres de même niveau.`;
    if (dir === `down`) return `Ce titre est déjà le dernier parmi les titres de même niveau.`;
    if (dir === `right`) return `Il n'y a pas de titre juste avant celui-ci au même niveau pour l'accueillir comme sous-titre.`;
    if (dir === `left`) return `Ce titre est déjà au premier niveau.`;
    return `Déplacement impossible à cet endroit.`;
  }

  // Le titre de la racine est le nom du fichier : le modifier renomme la note.
  private async renameFile(file: TFile, title: string) {
    const name = title.replace(/[\\/:*?"<>|#^\[\]]/g, ` `).replace(/\s+/g, ` `).trim();
    if (name === ``) {
      new Notice(`Le nom de la note ne peut pas être vide.`);
      return;
    }
    const folder = file.parent && file.parent.path !== `/` ? `${file.parent.path}/` : ``;
    const path = `${folder}${name}.${file.extension}`;
    if (path === file.path) return;
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Une note porte déjà ce nom.`);
      return;
    }
    await this.app.fileManager.renameFile(file, path);
    await this.refresh();
    // Deuxieme lecture peu apres : si Obsidian met a jour le titre de la note avec un retard, la carte reste juste.
    window.setTimeout(() => void this.refresh(), 600);
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

  // ---------------------------------------------------------------- volet de note

  // Volet de note deja ouvert a cote de la carte (par exemple la note active au moment d'ouvrir la carte).
  adoptNoteLeaf(leaf: WorkspaceLeaf) {
    this.noteLeaf = leaf;
    this.notePosition = this.plugin.settings.panePosition;
  }

  getNoteView(): MarkdownView | null {
    const view = this.noteLeaf?.view;
    return view instanceof MarkdownView ? view : null;
  }

  // Ouvre la note a cote de la carte, sans attendre un clic sur un titre.
  async showNote() {
    const renderer = this.renderer;
    if (!renderer || !this.doc || !this.plugin.lastFile) return;
    const key = this.selectedKey && nodeByKey(this.doc, this.selectedKey) ? this.selectedKey : `r`;
    this.selectedKey = key;
    renderer.select(key, false);
    await this.revealInNote(key, false);
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
    // Le curseur a quitte la ligne vierge ajoutee : elle est retiree si rien n'y a ete ecrit.
    const temp = state.field(tempLineField, false);
    if (temp !== undefined && temp !== null) {
      const tempLine = state.doc.lineAt(Math.min(temp, state.doc.length));
      if (head < tempLine.from || head > tempLine.to) {
        releaseTempLine(cm);
        return;
      }
    }
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
    renderer.setDoc(doc, this.mapKey, serializeNote(doc) === text);
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
    this.releaseTemp();
    const cm = this.getNoteCm();
    if (cm) cm.dispatch({ effects: setActiveRange.of(null) });
  }

  // Duplique les titres selectionnes (raccourci de la carte et commande d'Obsidian).
  duplicateSelection() {
    const renderer = this.renderer;
    const key = renderer?.getSelectedKey();
    if (!renderer || !key) {
      new Notice(`Sélectionnez d'abord un titre dans la carte.`);
      return;
    }
    const keys = renderer.getSelection();
    this.onEdit({ kind: `duplicate`, key, keys: keys.includes(key) ? keys : [key] });
  }

  // Retire la ligne vierge temporaire de la note reliee, si elle est encore vide.
  private releaseTemp() {
    const cm = this.getNoteCm();
    if (cm) releaseTempLine(cm);
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
    if (!file || !this.doc || !nodeByKey(this.doc, key)) return;
    const leaf = await this.ensureNoteLeaf(file);
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const editor = view.editor;

    // Une ligne vierge ajoutee pour un titre precedent est retiree avant de relire la note.
    this.releaseTemp();
    const live = parseNote(editor.getValue(), file.name);
    const node = nodeByKey(live, key) ?? nodeByKey(this.doc, key)!;
    const last = editor.lastLine();
    const headLine = Math.min(node.line ?? 0, last);

    if (view.getMode() !== `source`) {
      if (focus) await view.setState({ ...view.getState(), mode: `source` }, { history: false });
      else {
        leaf.setEphemeralState({ line: headLine });
        return;
      }
    }

    // Premiere et derniere lignes du texte du noeud (sans les lignes vides finales).
    const first = Math.min((node.metaLine ?? headLine) + 1, last);
    let end = Math.min((node.endLine ?? first + 1) - 1, last);
    while (end > first && editor.getLine(end).trim() === ``) end--;
    end = Math.max(end, headLine);
    const hasText = end >= first && editor.getLine(end).trim() !== ``;
    let endLine = hasText ? end : headLine;

    const remembered = this.noteCursors.get(key);
    const mode = this.plugin.settings.cursorPosition;
    let cursor = { line: endLine, ch: editor.getLine(endLine).length };
    if (mode === `start`) cursor = { line: hasText ? first : headLine, ch: 0 };
    else if (mode === `last` && remembered && remembered.line >= first && remembered.line <= endLine) cursor = remembered;

    // Paragraphe vide et passage dans la note : une ligne vierge est ouverte sous le titre pour y ecrire.
    // Elle disparait si on la quitte sans rien ecrire.
    const noteCm = (editor as unknown as { cm?: EditorView }).cm;
    const target = (node.metaLine ?? node.line ?? 0) + 1;
    if (focus && !hasText && node !== live.root && noteCm) {
      openBlankLine(noteCm, target);
      cursor = { line: target, ch: 0 };
      endLine = target;
    }

    const cm = noteCm;
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
    // La note a pu changer (ligne vierge ajoutee ou retiree) : le chapitre actif est recalcule sur le texte actuel.
    this.doc = parseNote(editor.getValue(), file.name);
    this.updateActiveRange();
  }
}

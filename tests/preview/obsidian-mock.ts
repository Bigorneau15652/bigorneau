// Simulation minimale de l'API d'Obsidian, pour verifier la vue Carte avec un vrai editeur CodeMirror
// dans un navigateur, sans Obsidian.
import { history, redo, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Ajouts d'Obsidian aux elements du DOM.
declare global {
  interface HTMLElement {
    empty(): void;
    addClass(...c: string[]): void;
    removeClass(...c: string[]): void;
    createDiv(o?: { cls?: string; text?: string }): HTMLDivElement;
    createEl(tag: string, o?: { cls?: string; text?: string }): HTMLElement;
    setText(t: string): void;
  }
}
HTMLElement.prototype.empty = function (this: HTMLElement) {
  this.replaceChildren();
};
HTMLElement.prototype.addClass = function (this: HTMLElement, ...c: string[]) {
  this.classList.add(...c);
};
HTMLElement.prototype.removeClass = function (this: HTMLElement, ...c: string[]) {
  this.classList.remove(...c);
};
HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, o: { cls?: string; text?: string } = {}) {
  const el = document.createElement(tag);
  if (o.cls) el.className = o.cls;
  if (o.text) el.textContent = o.text;
  this.appendChild(el);
  return el;
};
HTMLElement.prototype.createDiv = function (this: HTMLElement, o: { cls?: string; text?: string } = {}) {
  return this.createEl(`div`, o) as HTMLDivElement;
};
HTMLElement.prototype.setText = function (this: HTMLElement, t: string) {
  this.textContent = t;
};

const w = window as unknown as Record<string, unknown>;
w.notices = [] as string[];

export const Platform = { isMacOS: false };
export function debounce<T extends (...a: never[]) => unknown>(fn: T, ms: number): T {
  let t: number | undefined;
  return ((...a: never[]) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  }) as T;
}
export class Notice {
  constructor(message: string) {
    (w.notices as string[]).push(message);
  }
}
export class Modal {
  contentEl = document.createElement(`div`);
  titleEl = document.createElement(`div`);
  constructor(public app: unknown) {}
  open(): void {
    (this as unknown as { onOpen?: () => void }).onOpen?.();
    // Simulation : la confirmation est acceptee.
    (w.confirmModal as (() => void) | undefined)?.();
  }
  close(): void {
    (this as unknown as { onClose?: () => void }).onClose?.();
  }
}
export class FuzzySuggestModal<T> {
  constructor(public app: unknown) {}
  setPlaceholder(): void {
    /* sans objet */
  }
  getItems(): T[] {
    return [];
  }
  getItemText(_item: T): string {
    return ``;
  }
  onChooseItem(_item: T): void {
    /* remplace par la vue */
  }
  // Simulation : l'element choisi est designe par window.suggestPick (nom ou indice, un par ouverture).
  open(): void {
    const picks = (w.suggestPicks as (string | number)[] | undefined) ?? [];
    const pick = picks.shift();
    const items = this.getItems();
    const item = typeof pick === `number` ? items[pick] : items.find((i) => this.getItemText(i).includes(String(pick)));
    if (item !== undefined) this.onChooseItem(item);
  }
}
export class Setting {
  constructor(public el: HTMLElement) {}
  addButton(cb: (b: unknown) => void): this {
    const btn = document.createElement(`button`);
    const c = {
      buttonEl: btn,
      setButtonText: () => c,
      setWarning: () => c,
      onClick: (f: () => void) => {
        btn.addEventListener(`click`, f);
        (w.confirmModal as unknown) = () => f();
        return c;
      },
    };
    cb(c);
    return this;
  }
}
export class Menu {
  addItem(cb: (i: unknown) => void): this {
    const i = { setTitle: () => i, setIcon: () => i, onClick: () => i, setDisabled: () => i, setWarning: () => i };
    cb(i);
    return this;
  }
  addSeparator(): this {
    return this;
  }
  showAtMouseEvent(): void {
    w.menuShown = true;
  }
}

export class TFile {
  parent = { path: `/` };
  constructor(public path: string, public extension = `md`) {}
  get name(): string {
    return this.path.split(`/`).pop()!;
  }
}

// Editeur d'Obsidian au-dessus d'un EditorView.
export class Editor {
  constructor(public cm: EditorView) {}
  getValue(): string {
    return this.cm.state.doc.toString();
  }
  lastLine(): number {
    return this.cm.state.doc.lines - 1;
  }
  getLine(n: number): string {
    return this.cm.state.doc.line(n + 1).text;
  }
  private offset(p: { line: number; ch: number }): number {
    const l = this.cm.state.doc.line(Math.min(p.line, this.cm.state.doc.lines - 1) + 1);
    return l.from + Math.min(p.ch, l.length);
  }
  offsetToPos(o: number): { line: number; ch: number } {
    const l = this.cm.state.doc.lineAt(o);
    return { line: l.number - 1, ch: o - l.from };
  }
  getCursor(): { line: number; ch: number } {
    return this.offsetToPos(this.cm.state.selection.main.head);
  }
  setCursor(p: { line: number; ch: number }): void {
    this.cm.dispatch({ selection: { anchor: this.offset(p) } });
  }
  scrollIntoView(): void {
    /* sans objet */
  }
  focus(): void {
    this.cm.focus();
  }
  undo(): void {
    undo(this.cm);
  }
  redo(): void {
    redo(this.cm);
  }
  transaction(spec: { changes: { from: { line: number; ch: number }; to?: { line: number; ch: number }; text: string }[] }): void {
    this.cm.dispatch({
      changes: spec.changes.map((c) => ({ from: this.offset(c.from), to: c.to ? this.offset(c.to) : this.offset(c.from), insert: c.text })),
    });
  }
}

export class ItemView {
  app: App;
  contentEl = document.createElement(`div`);
  containerEl = document.createElement(`div`);
  scope = null;
  constructor(public leaf: WorkspaceLeaf) {
    this.app = leaf.app;
    this.containerEl.style.cssText = `width:100%;height:100%`;
    this.contentEl.style.cssText = `width:100%;height:100%;position:relative`;
    this.containerEl.appendChild(this.contentEl);
    leaf.containerEl.appendChild(this.containerEl);
  }
  registerDomEvent(el: HTMLElement, type: string, fn: () => void): void {
    el.addEventListener(type, fn);
  }
  getViewType(): string {
    return ``;
  }
}

export class MarkdownView extends ItemView {
  file: TFile | null = null;
  editor!: Editor;
  getViewType(): string {
    return `markdown`;
  }
  getMode(): string {
    return `source`;
  }
  getState(): Record<string, unknown> {
    return {};
  }
  async setState(): Promise<void> {
    /* sans objet */
  }
  getViewData(): string {
    return this.editor.getValue();
  }
}

export class WorkspaceLeaf {
  view: ItemView & { getViewType(): string };
  containerEl = document.createElement(`div`);
  constructor(public app: App) {
    this.view = new ItemView(this);
    this.containerEl.className = `leaf`;
  }
  async openFile(file: TFile): Promise<void> {
    const create = (this.app as unknown as { makeNoteView: (leaf: WorkspaceLeaf, file: TFile) => MarkdownView }).makeNoteView;
    this.containerEl.replaceChildren();
    this.view = create(this, file);
  }
  setEphemeralState(): void {
    /* sans objet */
  }
  detach(): void {
    this.containerEl.remove();
    const ws = this.app.workspace;
    ws.leaves = ws.leaves.filter((l) => l !== this);
  }
}

export class Workspace {
  leaves: WorkspaceLeaf[] = [];
  activeLeaf: WorkspaceLeaf | null = null;
  constructor(public app: App, public layout: HTMLElement) {}
  addLeaf(leaf: WorkspaceLeaf, before?: WorkspaceLeaf, after = true): void {
    this.leaves.push(leaf);
    if (before) {
      if (after) before.containerEl.after(leaf.containerEl);
      else before.containerEl.before(leaf.containerEl);
    } else this.layout.appendChild(leaf.containerEl);
  }
  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((l) => l.view.getViewType() === type);
  }
  createLeafBySplit(leaf: WorkspaceLeaf, _dir: string, before?: boolean): WorkspaceLeaf {
    const created = new WorkspaceLeaf(this.app);
    this.addLeaf(created, leaf, !before);
    return created;
  }
  setActiveLeaf(leaf: WorkspaceLeaf): void {
    this.activeLeaf = leaf;
    (window as unknown as Record<string, unknown>).activeLeafType = leaf.view.getViewType();
  }
}

export class App {
  workspace: Workspace;
  files = new Map<string, string>();
  vault = {
    cachedRead: async (f: TFile) => this.files.get(f.path) ?? ``,
    read: async (f: TFile) => this.files.get(f.path) ?? ``,
    process: async (f: TFile, fn: (d: string) => string) => {
      this.files.set(f.path, fn(this.files.get(f.path) ?? ``));
    },
    getAbstractFileByPath: (p: string) => (this.files.has(p) ? new TFile(p) : null),
    getMarkdownFiles: () => [...this.files.keys()].map((p) => new TFile(p)),
  };
  metadataCache = {
    getFirstLinkpathDest: (name: string) => (this.files.has(`${name}.md`) ? new TFile(`${name}.md`) : null),
    fileToLinktext: (f: TFile) => f.path.replace(/\.md$/i, ``),
  };
  fileManager = {
    renameFile: async (f: TFile, path: string) => {
      const text = this.files.get(f.path) ?? ``;
      this.files.delete(f.path);
      f.path = path;
      this.files.set(path, text);
    },
  };
  makeNoteView!: (leaf: WorkspaceLeaf, file: TFile) => MarkdownView;
  constructor(layout: HTMLElement) {
    this.workspace = new Workspace(this, layout);
  }
}

export { EditorState };
export type Plugin = unknown;
export class PluginSettingTab {}
export class Plugin {}

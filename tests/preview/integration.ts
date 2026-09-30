// Banc d'essai d'integration : le vrai code de la vue Carte, avec l'API d'Obsidian simulee et un vrai editeur CodeMirror
// dans le volet de note.
import { defaultKeymap, history } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { App, Editor, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { noteExtension } from "../../src/active-chapter";
import { isModEnter } from "../../src/keys";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { MindmapView } from "../../src/view";

const w = window as unknown as Record<string, unknown>;
const params = new URLSearchParams(location.search);
const layout = document.getElementById(`layout`)!;
const app = new App(layout);
const file = new TFile(`Note.md`);
app.files.set(file.path, params.get(`text`) ?? ``);

const plugin = {
  settings: { ...DEFAULT_SETTINGS },
  lastFile: file as TFile | null,
  editorViews: new Set<EditorView>(),
  async updateSettings(patch: object): Promise<void> {
    Object.assign(plugin.settings, patch);
  },
  openSettings(): void {},
  getOpenText(f: TFile): string | null {
    const v = view.getNoteView();
    return v && v.file && v.file.path === f.path ? v.getViewData() : null;
  },
  getOpenEditor(f: TFile): Editor | null {
    const v = view.getNoteView();
    return v && v.file && v.file.path === f.path ? v.editor : null;
  },
};
for (const [k, v] of params) {
  if (k === `text`) continue;
  const cur = (plugin.settings as unknown as Record<string, unknown>)[k];
  (plugin.settings as unknown as Record<string, unknown>)[k] = typeof cur === `boolean` ? v === `1` : typeof cur === `number` ? Number(v) : v;
}

let timer: number | undefined;
app.makeNoteView = (leaf: WorkspaceLeaf, f: TFile): MarkdownView => {
  const nv = new MarkdownView(leaf);
  nv.file = f;
  const extensions = [
    history(),
    keymap.of(defaultKeymap),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) app.files.set(f.path, u.state.doc.toString());
    }),
    noteExtension({
      attach: (cm) => plugin.editorViews.add(cm),
      detach: (cm) => plugin.editorViews.delete(cm),
      changed: (cm) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (view.ownsEditor(cm)) view.onNoteMoved(cm);
        }, 30);
      },
      click: (cm, e) => {
        if (view.ownsEditor(cm)) view.onNoteClick(cm, e);
      },
      key: (e, cm) => {
        if (!isModEnter(e) || !view.ownsEditor(cm)) return false;
        e.preventDefault();
        view.focusMap();
        return true;
      },
    }),
  ];
  const cm = new EditorView({ parent: nv.contentEl, state: EditorState.create({ doc: app.files.get(f.path) ?? ``, extensions }) });
  nv.editor = new Editor(cm);
  return nv;
};

const mapLeaf = new WorkspaceLeaf(app);
app.workspace.addLeaf(mapLeaf);
const view = new MindmapView(mapLeaf as never, plugin as never);
mapLeaf.view = view as never;

w.app = app;
w.view = view;
w.plugin = plugin;
w.noteView = () => view.getNoteView();
w.noteText = () => view.getNoteView()?.editor.getValue() ?? null;
w.noteCursor = () => view.getNoteView()?.editor.getCursor() ?? null;
w.noteFocused = () => {
  const nv = view.getNoteView();
  return !!nv && nv.containerEl.contains(document.activeElement);
};
w.mapFocused = () => document.querySelector(`.mmw-map`)!.contains(document.activeElement);
w.ready = (async () => {
  await view.onOpen();
  await view.refresh();
  await view.showNote();
})();

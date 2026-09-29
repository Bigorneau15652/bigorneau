// Vue Paragraphe : editeur de texte Markdown du noeud selectionne (CodeMirror 6).
// N'utilise que CodeMirror et le DOM standard, pour pouvoir etre verifie hors d'Obsidian.
import { RangeSetBuilder, EditorState, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

export interface PaneOptions {
  // Appele a chaque modification faite par l'utilisateur, avec le texte complet.
  onChange: (text: string) => void;
  // Appele quand l'utilisateur appuie sur Echap : retour au mode Deplacement.
  onEscape: () => void;
}

interface Mark {
  from: number;
  to: number;
  cls: string;
}

// group : numero du groupe de capture a colorer (0 pour toute la correspondance).
const INLINE: { re: RegExp; cls: string; group?: number }[] = [
  { re: /`[^`\n]+`/g, cls: `mmw-md-code` },
  { re: /\*\*[^*\n]+\*\*/g, cls: `mmw-md-bold` },
  { re: /(^|[^*\w])(\*[^*\n]+\*)(?![*\w])/g, cls: `mmw-md-italic`, group: 2 },
  { re: /\[\[[^\]\n]+\]\]/g, cls: `mmw-md-link` },
  { re: /!?\[[^\]\n]*\]\([^)\n]*\)/g, cls: `mmw-md-link` },
  { re: /==[^=\n]+==/g, cls: `mmw-md-highlight` },
];

function highlight(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let inFence = false;
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const text = line.text;
    if (/^\s{0,3}(```|~~~)/.test(text)) {
      builder.add(line.from, line.from, Decoration.line({ class: `mmw-md-fence` }));
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      builder.add(line.from, line.from, Decoration.line({ class: `mmw-md-fence` }));
      continue;
    }
    if (/^#{1,6}(\s|$)/.test(text)) {
      builder.add(line.from, line.from, Decoration.line({ class: `mmw-md-heading` }));
    } else if (/^\s*>/.test(text)) {
      builder.add(line.from, line.from, Decoration.line({ class: `mmw-md-quote` }));
    }
    const marks: Mark[] = [];
    const list = /^\s*([-*+]|\d+[.)])\s/.exec(text);
    if (list) {
      const start = list[0].indexOf(list[1]);
      marks.push({ from: line.from + start, to: line.from + start + list[1].length, cls: `mmw-md-list` });
    }
    for (const { re, cls, group } of INLINE) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const part = group ? m[group] : m[0];
        const from = line.from + m.index + (group ? m[0].indexOf(part, m[1].length) : 0);
        marks.push({ from, to: from + part.length, cls });
      }
    }
    marks.sort((a, b) => a.from - b.from || a.to - b.to);
    for (const mk of marks) builder.add(mk.from, mk.to, Decoration.mark({ class: mk.cls }));
  }
  return builder.finish();
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = highlight(view.state);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged) this.decorations = highlight(u.state);
    }
  },
  { decorations: (v) => v.decorations }
);

export class ParagraphPane {
  private rootEl: HTMLElement;
  private pathEl: HTMLElement;
  private editorHost: HTMLElement;
  private placeholderEl: HTMLElement;
  private view: EditorView;
  private loading = false;
  private key: string | null = null;

  constructor(host: HTMLElement, private opts: PaneOptions) {
    this.rootEl = host;
    host.classList.add(`mmw-pane`);
    this.pathEl = document.createElement(`div`);
    this.pathEl.className = `mmw-pane-path`;
    this.editorHost = document.createElement(`div`);
    this.editorHost.className = `mmw-pane-editor`;
    this.placeholderEl = document.createElement(`div`);
    this.placeholderEl.className = `mmw-pane-placeholder`;
    this.placeholderEl.textContent = `Sélectionnez un titre dans la carte pour rédiger son paragraphe.`;
    host.append(this.pathEl, this.editorHost, this.placeholderEl);

    this.view = new EditorView({
      parent: this.editorHost,
      state: EditorState.create({
        doc: ``,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          highlighter,
          keymap.of([
            {
              key: `Escape`,
              run: () => {
                this.opts.onEscape();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !this.loading) this.opts.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    this.clear();
  }

  // Charge le texte d'un noeud. Le chargement n'entre pas dans l'historique d'annulation.
  setNode(key: string, path: string[], text: string, cursor: number): void {
    this.key = key;
    this.pathEl.textContent = path.join(`\\`);
    this.pathEl.title = path.join(`\\`);
    this.editorHost.style.display = ``;
    this.placeholderEl.style.display = `none`;
    const pos = Math.max(0, Math.min(cursor, text.length));
    this.loading = true;
    try {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: text },
        selection: { anchor: pos },
        annotations: Transaction.addToHistory.of(false),
      });
    } finally {
      this.loading = false;
    }
  }

  clear(): void {
    this.key = null;
    this.pathEl.textContent = ``;
    this.editorHost.style.display = `none`;
    this.placeholderEl.style.display = ``;
    this.loading = true;
    try {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: `` },
        annotations: Transaction.addToHistory.of(false),
      });
    } finally {
      this.loading = false;
    }
  }

  getKey(): string | null {
    return this.key;
  }

  getText(): string {
    return this.view.state.doc.toString();
  }

  getCursor(): number {
    return this.view.state.selection.main.head;
  }

  hasFocus(): boolean {
    return this.view.hasFocus;
  }

  focus(): void {
    if (this.key === null) return;
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
    this.rootEl.replaceChildren();
    this.rootEl.classList.remove(`mmw-pane`);
  }
}

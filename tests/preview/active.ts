import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { noteExtension, setActiveRange } from "../../src/active-chapter";
import { parseNote, nodeAtLine, activeLines } from "../../src/model";

const text = `intro\n\n# A\ntexte A\n## A1\ntexte A1\n## A2\ntexte A2\n# B\ntexte B\n`;
const log: string[] = [];
const w = window as unknown as Record<string, unknown>;
w.log = log;

let handled = false;
const cm = new EditorView({
  parent: document.getElementById(`editor`)!,
  state: EditorState.create({
    doc: text,
    extensions: [
      noteExtension({
        attach: () => log.push(`attach`),
        detach: () => log.push(`detach`),
        changed: (view) => log.push(`changed:${view.state.doc.lineAt(view.state.selection.main.head).number - 1}`),
        key: (e) => {
          if (e.ctrlKey && e.key === `ArrowDown`) {
            log.push(`key:down`);
            handled = true;
            return true;
          }
          return false;
        },
      }),
    ],
  }),
});
w.cm = cm;
w.handled = () => handled;
// Active le chapitre du noeud contenant la ligne donnee (comme la vue le fait).
w.activate = (line: number, includeSub: boolean): string => {
  const doc = parseNote(text, `f.md`);
  const { key } = nodeAtLine(doc, line);
  const r = activeLines(doc, key, includeSub)!;
  const d = cm.state.doc;
  const from = d.line(r.startLine + 1).from;
  const to = r.endLine >= d.lines ? d.length : d.line(r.endLine + 1).from;
  cm.dispatch({ effects: setActiveRange.of({ from, to }) });
  return key;
};
w.clear = () => cm.dispatch({ effects: setActiveRange.of(null) });
// Numeros (a partir de 0) des lignes grisees et opacite calculee de la premiere.
w.inactive = (): number[] => {
  const out: number[] = [];
  cm.contentDOM.querySelectorAll(`.cm-line`).forEach((el, i) => {
    if (el.classList.contains(`mmw-inactive`)) out.push(i);
  });
  return out;
};
w.opacityOf = (i: number): string => getComputedStyle(cm.contentDOM.querySelectorAll(`.cm-line`)[i]).opacity;

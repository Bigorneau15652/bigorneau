import { history, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tempLineField } from "../../src/active-chapter";
import { openBlankLine, releaseTempLine, tempLinePos } from "../../src/temp-line";

const w = window as unknown as Record<string, unknown>;
w.make = (doc: string): void => {
  document.getElementById(`editor`)!.replaceChildren();
  const cm = new EditorView({
    parent: document.getElementById(`editor`)!,
    state: EditorState.create({ doc, extensions: [tempLineField, history()] }),
  });
  w.cm = cm;
};
w.open = (line0: number): void => openBlankLine(w.cm as EditorView, line0);
w.release = (): boolean => releaseTempLine(w.cm as EditorView);
w.text = (): string => (w.cm as EditorView).state.doc.toString();
w.pos = (): number | null => tempLinePos(w.cm as EditorView);
w.cursor = (): number => (w.cm as EditorView).state.selection.main.head;
w.type = (s: string): void => {
  const cm = w.cm as EditorView;
  cm.dispatch(cm.state.replaceSelection(s), { userEvent: `input.type` });
};
w.undo = (): void => {
  undo(w.cm as EditorView);
};

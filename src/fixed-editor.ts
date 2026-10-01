// Mise en forme de l'editeur d'une note fixe : seul le contenu du titre reste visible, tout le reste de la note est masque.
// Utilise uniquement CodeMirror, pour pouvoir etre verifie hors d'Obsidian.
import type { EditorView } from "@codemirror/view";
import { setActiveRange } from "./active-range";
import { FixedRange, FixedTarget, resolveFixed } from "./fixed";
import { parseNote } from "./model";
import { moveCursorOutOfHidden, setHideEnabled, setHideInactive, setHideMeta } from "./note-hide";

// Montre seulement le chapitre de la note fixe. Renvoie le chapitre trouve, ou null (titre disparu) : l'editeur est alors
// remis dans son etat ordinaire.
export function applyFixedState(cm: EditorView, target: FixedTarget, includeSubtitles: boolean, hideMeta: boolean): FixedRange | null {
  const doc = parseNote(cm.state.doc.toString(), `note.md`);
  const range = resolveFixed(doc, target, includeSubtitles);
  if (!range) {
    clearFixedState(cm);
    return null;
  }
  const d = cm.state.doc;
  const from = d.line(Math.min(range.startLine, d.lines - 1) + 1).from;
  const to = range.endLine >= d.lines ? d.length : d.line(range.endLine + 1).from;
  cm.dispatch({ effects: [setHideEnabled.of(true), setHideMeta.of(hideMeta), setHideInactive.of(true), setActiveRange.of({ from, to })] });
  moveCursorOutOfHidden(cm);
  return range;
}

export function clearFixedState(cm: EditorView): void {
  cm.dispatch({ effects: [setHideInactive.of(false), setActiveRange.of(null), setHideEnabled.of(false)] });
}

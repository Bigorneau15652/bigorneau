// Mise en forme de l'editeur d'une note fixe : seul le contenu du titre reste visible, tout le reste de la note est masque.
// Utilise uniquement CodeMirror, pour pouvoir etre verifie hors d'Obsidian.
import type { EditorView } from "@codemirror/view";
import { activeRangeField, setActiveRange } from "./active-range";
import { FixedRange, FixedTarget, resolveFixed } from "./fixed";
import { flattenDoc, parseNote } from "./model";
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

// Chapitre que l'editeur montre en ce moment, d'apres le debut de sa plage : permet de suivre un titre que l'on renomme
// directement dans la note fixe.
export function currentFixedTarget(cm: EditorView): FixedTarget | null {
  const active = cm.state.field(activeRangeField, false);
  if (!active) return null;
  const line0 = cm.state.doc.lineAt(Math.min(active.from, cm.state.doc.length)).number - 1;
  const hit = flattenDoc(parseNote(cm.state.doc.toString(), `note.md`)).find((e) => e.key !== `r` && e.node.line === line0);
  return hit ? { key: hit.key, title: hit.node.title } : null;
}

export function clearFixedState(cm: EditorView): void {
  cm.dispatch({ effects: [setHideInactive.of(false), setActiveRange.of(null), setHideEnabled.of(false)] });
}

// Amene la note a un chapitre : place le curseur puis fait defiler pour montrer le chapitre entier
// (ou sa fin s'il est plus haut que l'ecran), afin de pouvoir completer son texte.
import { EditorView } from "@codemirror/view";

export interface RevealTarget {
  // Lignes a partir de 0 : titre du chapitre et derniere ligne de son texte.
  headLine: number;
  endLine: number;
  // Position du curseur.
  cursorLine: number;
  cursorCh: number;
}

const MARGIN = 16;
const END_MARGIN = 48;

export function revealRange(cm: EditorView, t: RevealTarget): void {
  const doc = cm.state.doc;
  const pos = (line: number, ch = 0): number => {
    const l = doc.line(Math.min(Math.max(line, 0), doc.lines - 1) + 1);
    return l.from + Math.min(Math.max(ch, 0), l.length);
  };
  const headPos = pos(t.headLine);
  const endPos = pos(Math.max(t.endLine, t.headLine), Number.MAX_SAFE_INTEGER);
  const anchor = pos(t.cursorLine, t.cursorCh);
  const viewHeight = cm.scrollDOM.clientHeight;
  const chapterHeight = cm.lineBlockAt(endPos).bottom - cm.lineBlockAt(headPos).top;
  // Le chapitre tient a l'ecran : le titre en haut. Sinon : la fin du texte en bas, la ou l'on complete.
  const fits = chapterHeight + MARGIN + END_MARGIN <= viewHeight;
  const effect = fits
    ? EditorView.scrollIntoView(headPos, { y: `start`, yMargin: MARGIN })
    : EditorView.scrollIntoView(endPos, { y: `end`, yMargin: END_MARGIN });
  cm.dispatch({ selection: { anchor }, effects: effect });
}

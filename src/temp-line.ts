// Ligne vierge temporaire sous un titre dont le paragraphe est vide : elle est ajoutee quand on passe dans la note pour
// y ecrire, puis retiree si on la quitte sans rien ecrire. L'ajout et le retrait ne comptent pas dans l'historique
// d'annulation. Utilise uniquement CodeMirror, pour pouvoir etre verifie hors d'Obsidian.
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { setTempLine, tempLineField } from "./active-chapter";

// Place le curseur sur la ligne `line0` (numero a partir de 0). Si cette ligne n'existe pas ou n'est pas vide,
// une ligne vierge est ajoutee a cet endroit et memorisee pour etre retiree plus tard.
export function openBlankLine(cm: EditorView, line0: number): void {
  const doc = cm.state.doc;
  const silent = Transaction.addToHistory.of(false);
  if (line0 < doc.lines) {
    const line = doc.line(line0 + 1);
    if (line.text.trim() === ``) {
      cm.dispatch({ selection: { anchor: line.from } });
      return;
    }
    cm.dispatch({ changes: { from: line.from, insert: `\n` }, selection: { anchor: line.from }, effects: setTempLine.of(line.from), annotations: silent });
    return;
  }
  // Le titre est la derniere ligne de la note, sans retour a la ligne final.
  const end = doc.length;
  cm.dispatch({ changes: { from: end, insert: `\n` }, selection: { anchor: end + 1 }, effects: setTempLine.of(end + 1), annotations: silent });
}

// Position de la ligne vierge temporaire, ou null.
export function tempLinePos(cm: EditorView): number | null {
  const pos = cm.state.field(tempLineField, false);
  return pos === undefined ? null : pos;
}

// Retire la ligne vierge temporaire si elle est toujours vide ; si on y a ecrit, elle reste. Renvoie vrai si elle a ete retiree.
export function releaseTempLine(cm: EditorView): boolean {
  const pos = tempLinePos(cm);
  if (pos === null) return false;
  const doc = cm.state.doc;
  const clear = setTempLine.of(null);
  const silent = Transaction.addToHistory.of(false);
  const line = doc.lineAt(Math.min(pos, doc.length));
  if (line.from === pos && line.text === ``) {
    if (line.to < doc.length) {
      cm.dispatch({ changes: { from: line.from, to: line.to + 1 }, effects: clear, annotations: silent });
      return true;
    }
    if (line.from > 0) {
      cm.dispatch({ changes: { from: line.from - 1, to: line.to }, effects: clear, annotations: silent });
      return true;
    }
  }
  cm.dispatch({ effects: clear, annotations: silent });
  return false;
}

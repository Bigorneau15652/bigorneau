// Applique dans l'editeur les modifications calculees par src/export/insert.ts, de la derniere a la premiere pour que les positions
// restent justes, puis place le curseur. L'historique d'annulation d'Obsidian garde chaque modification.
import type { Editor } from "obsidian";
import type { InsertResult } from "./export/insert";

export function applyInsert(editor: Editor, make: (text: string, from: number, to: number) => InsertResult): void {
  const text = editor.getValue();
  const from = editor.posToOffset(editor.getCursor(`from`));
  const to = editor.posToOffset(editor.getCursor(`to`));
  const r = make(text, from, to);
  for (const e of [...r.edits].sort((a, b) => b.from - a.from)) editor.replaceRange(e.insert, editor.offsetToPos(e.from), editor.offsetToPos(e.to));
  if (r.cursor !== undefined) editor.setCursor(editor.offsetToPos(r.cursor));
}

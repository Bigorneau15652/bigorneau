// Ecrit dans l'editeur les reglages de page d'une note en ne remplacant que le morceau qui change (le curseur et le defilement ne
// bougent pas). Les reglages sont lus et ecrits par src/page-config.ts, sans Obsidian.
import type { Editor } from "obsidian";
import { defaultConfig, findPageConfig, PageConfig, writePageConfig } from "./page-config";

export function readPageConfig(noteText: string): PageConfig {
  return findPageConfig(noteText)?.config ?? defaultConfig();
}

export function applyPageConfig(editor: Editor, config: PageConfig): void {
  const before = editor.getValue();
  replaceChanged(editor, before, writePageConfig(before, config));
}

// Remplace dans l'editeur le seul morceau qui change entre `before` (le texte actuel) et `after`.
export function replaceChanged(editor: Editor, before: string, after: string): void {
  if (after === before) return;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  editor.replaceRange(after.slice(start, endAfter), editor.offsetToPos(start), editor.offsetToPos(endBefore));
}

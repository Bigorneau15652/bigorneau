// Titres masques : leurs lignes (titre, texte et sous-titres) disparaissent de l'affichage de la note reliee a la carte,
// sans etre retirees du fichier. Utilise uniquement CodeMirror, pour pouvoir etre verifie hors d'Obsidian.
import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { hiddenLineRanges, parseNote } from "./model";

// Active ou coupe le masquage dans un editeur (seule la note reliee a la carte est concernee).
export const setHideEnabled = StateEffect.define<boolean>();

interface HideState {
  enabled: boolean;
  deco: DecorationSet;
}

const hiddenBlock = Decoration.replace({ block: true });

function compute(state: EditorState): DecorationSet {
  const doc = state.doc;
  const text = doc.toString();
  if (!text.includes(`"hidden"`)) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of hiddenLineRanges(parseNote(text, `note.md`))) {
    if (r.start >= doc.lines) continue;
    builder.add(doc.line(r.start + 1).from, doc.line(Math.min(r.end + 1, doc.lines)).to, hiddenBlock);
  }
  return builder.finish();
}

export const hideField = StateField.define<HideState>({
  create: () => ({ enabled: false, deco: Decoration.none }),
  update(value, tr) {
    let enabled = value.enabled;
    let changed = tr.docChanged;
    for (const e of tr.effects) {
      if (e.is(setHideEnabled)) {
        enabled = e.value;
        changed = true;
      }
    }
    if (!changed) return value;
    if (!enabled) return { enabled, deco: Decoration.none };
    return { enabled, deco: compute(tr.state) };
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), EditorView.atomicRanges.of((view) => view.state.field(f).deco)],
});

export const hideExtension: Extension = hideField;

// Si le curseur se trouve dans une partie masquee, le ramene juste avant elle (ou juste apres si elle ouvre la note).
export function moveCursorOutOfHidden(view: EditorView): void {
  const deco = view.state.field(hideField, false)?.deco;
  if (!deco) return;
  const head = view.state.selection.main.head;
  let target: number | null = null;
  deco.between(head, head, (from, to) => {
    if (head >= from && head <= to) {
      target = from > 0 ? from - 1 : Math.min(to + 1, view.state.doc.length);
      return false;
    }
    return undefined;
  });
  if (target !== null) view.dispatch({ selection: { anchor: target } });
}

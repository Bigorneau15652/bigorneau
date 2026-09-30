// Extension de l'editeur d'Obsidian : grise les chapitres inactifs de la note reliee a la carte,
// signale les deplacements du curseur et intercepte les touches de navigation entre chapitres.
// Utilise uniquement CodeMirror, pour pouvoir etre verifiee hors d'Obsidian.
import { Extension, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

export interface ActiveRange {
  from: number;
  to: number;
}

// Definit la plage du chapitre actif (positions dans le document). null : aucun grisage.
export const setActiveRange = StateEffect.define<ActiveRange | null>();

export const activeRangeField = StateField.define<ActiveRange | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setActiveRange)) return e.value;
    if (value && tr.docChanged) {
      return { from: tr.changes.mapPos(value.from, -1), to: tr.changes.mapPos(value.to, 1) };
    }
    return value;
  },
});

// Position (debut de ligne) de la ligne vierge que le plugin a ajoutee sous un titre vide pour y ecrire. null : aucune.
export const setTempLine = StateEffect.define<number | null>();

export const tempLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setTempLine)) return e.value;
    if (value !== null && tr.docChanged) return tr.changes.mapPos(value, -1);
    return value;
  },
});

const inactiveLine = Decoration.line({ class: `mmw-inactive` });

export interface NoteHooks {
  attach: (view: EditorView) => void;
  detach: (view: EditorView) => void;
  // Le curseur ou le texte a change. Ne pas modifier l'editeur pendant cet appel.
  changed: (view: EditorView) => void;
  // Une touche est pressee dans l'editeur. Renvoyer vrai si elle a ete traitee.
  key: (event: KeyboardEvent, view: EditorView) => boolean;
}

function buildDecorations(view: EditorView): DecorationSet {
  const active = view.state.field(activeRangeField, false);
  if (!active) return Decoration.none;
  const ranges: { from: number }[] = [];
  const doc = view.state.doc;
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = doc.lineAt(pos);
      if (line.from >= active.to || line.to < active.from) ranges.push({ from: line.from });
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges.map((r) => inactiveLine.range(r.from)));
}

export function noteExtension(hooks: NoteHooks): Extension[] {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(private view: EditorView) {
        this.decorations = buildDecorations(view);
        hooks.attach(view);
      }
      update(u: ViewUpdate): void {
        const effect = u.transactions.some((t) => t.effects.some((e) => e.is(setActiveRange)));
        if (u.docChanged || u.viewportChanged || effect) this.decorations = buildDecorations(u.view);
        if (u.selectionSet || u.docChanged) hooks.changed(u.view);
      }
      destroy(): void {
        hooks.detach(this.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
  const keys = Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event, view) => hooks.key(event, view),
    })
  );
  return [activeRangeField, tempLineField, plugin, keys];
}

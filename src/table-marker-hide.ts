// Masque, dans l'apercu en direct, la ligne de commentaire de style d'un tableau (%% mmw-table {...} %%) : le style se regle par le clic
// droit sur le tableau, il n'y a pas a voir ni a editer cette ligne. Le mode Source la montre toujours, pour pouvoir la corriger a la
// main. Utilise uniquement CodeMirror.
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { parseTableMarker } from "./table-marker";

const markerLine = Decoration.line({ class: `mmw-marker-line` });

// Positions (debut de ligne) des lignes de repere de style de tableau d'un texte.
export function markerLineStarts(text: string): number[] {
  if (!text.includes(`mmw-table`)) return [];
  const out: number[] = [];
  let pos = 0;
  for (const line of text.split(`\n`)) {
    if (line.includes(`mmw-table`) && parseTableMarker(line) !== null) out.push(pos);
    pos += line.length + 1;
  }
  return out;
}

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = doc.lineAt(pos);
      if (line.text.includes(`mmw-table`) && parseTableMarker(line.text) !== null) builder.add(line.from, line.from, markerLine);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export function tableMarkerHideExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

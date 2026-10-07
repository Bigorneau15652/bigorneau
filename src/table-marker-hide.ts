// Masque, dans l'apercu en direct, la ligne de commentaire de style d'un tableau (%% mmw-table {...} %%) : le style se regle par le clic
// droit sur le tableau, il n'y a pas a voir ni a editer cette ligne. Le mode Source la montre toujours, pour pouvoir la corriger a la
// main. Utilise uniquement CodeMirror.
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { parsePageMarker } from "./page-config";
import { readListMarker } from "./illustration-list";
import { readPageZone } from "./page-zone";
import { PARAGRAPH_MARKER_RE } from "./paragraph-format";
import { parseTableMarker } from "./table-marker";

const markerLine = Decoration.line({ class: `mmw-marker-line` });

// Ligne de repere de style de tableau, ou de reglages de page (en-tete, pied de page, numerotation).
const isMarker = (line: string): boolean => (line.includes(`mmw-table`) && parseTableMarker(line) !== null) || (line.includes(`mmw-page`) && parsePageMarker(line) !== null) || (line.includes(`page`) && readPageZone(line) !== null) || (line.includes(`%%`) && readListMarker(line) !== null);

// Positions (debut de ligne) des lignes de repere de style de tableau d'un texte.
export function markerLineStarts(text: string): number[] {
  if (!text.includes(`mmw-table`) && !text.includes(`mmw-page`) && !/%%[ \t]*(page|liste|list)[ \t]*:/.test(text)) return [];
  const out: number[] = [];
  let pos = 0;
  for (const line of text.split(`\n`)) {
    if (isMarker(line)) out.push(pos);
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
      if (isMarker(line.text)) builder.add(line.from, line.from, markerLine);
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

// Etiquette de paragraphe (%% p: droite %%) au debut d'une ligne : cachee dans l'apercu en direct, sauf sur la ligne du curseur.
function buildParagraphMarkers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const caret = doc.lineAt(view.state.selection.main.head).number;
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = doc.lineAt(pos);
      if (line.number !== caret && line.text.includes(`%%`)) {
        const m = PARAGRAPH_MARKER_RE.exec(line.text);
        if (m) builder.add(line.from + m[1].length, line.from + m[0].length, Decoration.replace({}));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export function paragraphMarkerHideExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildParagraphMarkers(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = buildParagraphMarkers(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

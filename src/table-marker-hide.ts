// Masque, dans l'apercu en direct, la ligne de commentaire de style d'un tableau (%% mmw-table {...} %%) : le style se regle par le clic
// droit sur le tableau, il n'y a pas a voir ni a editer cette ligne. Le mode Source la montre toujours, pour pouvoir la corriger a la
// main. Utilise uniquement CodeMirror.
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { t } from "./i18n";
import { parsePageMarker } from "./page-config";
import { readListMarker } from "./illustration-list";
import { readPageZone } from "./page-zone";
import { PARAGRAPH_MARKER_RE } from "./paragraph-format";
import { parseTableMarker } from "./table-marker";

const markerLine = Decoration.line({ class: `mmw-marker-line` });

// Ligne de repere de style de tableau, ou de reglages de page (en-tete, pied de page, numerotation).
const isMarker = (line: string): boolean => (line.includes(`mmw-table`) && parseTableMarker(line) !== null) || (line.includes(`mmw-page`) && parsePageMarker(line) !== null) || (line.includes(`page`) && readPageZone(line) !== null);

// Positions (debut de ligne) des lignes de repere de style de tableau d'un texte.
export function markerLineStarts(text: string): number[] {
  if (!text.includes(`mmw-table`) && !text.includes(`mmw-page`) && !/%%[ \t]*page[ \t]*:/.test(text)) return [];
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

// Etiquette de liste d'illustrations (%% liste: figures %%) : remplacee, dans l'apercu en direct, par une mention qui dit ou la liste sera
// placee a l'export. Sur la ligne du curseur, le texte de l'etiquette reste visible et modifiable.
class ListNoteWidget extends WidgetType {
  constructor(private kind: `figures` | `tables`) {
    super();
  }
  eq(other: ListNoteWidget): boolean {
    return other.kind === this.kind;
  }
  toDOM(): HTMLElement {
    const el = document.createElement(`span`);
    el.className = `mmw-list-marker`;
    el.textContent = `${this.kind === `figures` ? t(`Liste des figures`) : t(`Liste des tableaux`)} : ${t(`placée ici à l'export`)}`;
    return el;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

function buildListNotes(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const caret = doc.lineAt(view.state.selection.main.head).number;
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = doc.lineAt(pos);
      if (line.number !== caret && line.text.includes(`%%`)) {
        const kind = readListMarker(line.text);
        if (kind && line.to > line.from) builder.add(line.from, line.to, Decoration.replace({ widget: new ListNoteWidget(kind) }));
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export function listMarkerWidgetExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildListNotes(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = buildListNotes(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

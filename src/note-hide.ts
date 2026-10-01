// Titres masques : leurs lignes (titre, texte et sous-titres) disparaissent de l'affichage de la note reliee a la carte,
// sans etre retirees du fichier. Utilise uniquement CodeMirror, pour pouvoir etre verifie hors d'Obsidian.
import { EditorState, Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { activeRangeField, setActiveRange } from "./active-range";
import { hiddenLineRanges, metaLineNumbers, parseNote } from "./model";

// Active ou coupe le masquage dans un editeur (seule la note reliee a la carte est concernee).
export const setHideEnabled = StateEffect.define<boolean>();

// Masque aussi les lignes de commentaire du plugin (styles, etiquettes, titre court, commentaire) dans la note.
export const setHideMeta = StateEffect.define<boolean>();

// Masque tout ce qui n'est pas le chapitre actif (au lieu de le griser).
export const setHideInactive = StateEffect.define<boolean>();

interface HideState {
  enabled: boolean;
  meta: boolean;
  inactive: boolean;
  deco: DecorationSet;
}

const hiddenBlock = Decoration.replace({ block: true });

function compute(state: EditorState, meta: boolean, inactive: boolean): DecorationSet {
  const doc = state.doc;
  const text = doc.toString();
  const active = inactive ? state.field(activeRangeField, false) ?? null : null;
  if (!active && !text.includes(`%% mmw`)) return Decoration.none;
  const ranges: { start: number; end: number }[] = [];
  if (text.includes(`%% mmw`)) {
    const parsed = parseNote(text, `note.md`);
    for (const r of hiddenLineRanges(parsed)) ranges.push({ start: r.start, end: Math.max(r.start, r.end) });
    if (meta) for (const line of metaLineNumbers(parsed)) ranges.push({ start: line, end: line });
    // La zone des sujets flottants est masquee dans la note, sauf quand le chapitre actif est un sujet flottant.
    if (parsed.floatStart !== undefined) {
      const zoneFrom = doc.line(Math.min(parsed.floatStart + 1, doc.lines)).from;
      if (!(active && active.from >= zoneFrom)) ranges.push({ start: parsed.floatStart, end: doc.lines - 1 });
    }
  }
  // Seul le chapitre actif reste visible : tout ce qui le precede et tout ce qui le suit est masque.
  if (active) {
    const first = doc.lineAt(Math.min(active.from, doc.length)).number - 1;
    if (first > 0) ranges.push({ start: 0, end: first - 1 });
    if (active.to < doc.length) ranges.push({ start: doc.lineAt(active.to).number - 1, end: doc.lines - 1 });
  }
  // Les plages qui se recouvrent ou se touchent n'en forment qu'une.
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of merged) {
    if (r.start >= doc.lines) continue;
    builder.add(doc.line(r.start + 1).from, doc.line(Math.min(r.end + 1, doc.lines)).to, hiddenBlock);
  }
  return builder.finish();
}

export const hideField = StateField.define<HideState>({
  create: () => ({ enabled: false, meta: false, inactive: false, deco: Decoration.none }),
  update(value, tr) {
    let { enabled, meta, inactive } = value;
    let changed = tr.docChanged;
    for (const e of tr.effects) {
      if (e.is(setHideEnabled)) {
        enabled = e.value;
        changed = true;
      } else if (e.is(setHideMeta)) {
        meta = e.value;
        changed = true;
      } else if (e.is(setHideInactive)) {
        inactive = e.value;
        changed = true;
      } else if (e.is(setActiveRange)) changed = true;
    }
    if (!changed) return value;
    if (!enabled) return { enabled, meta, inactive, deco: Decoration.none };
    return { enabled, meta, inactive, deco: compute(tr.state, meta, inactive) };
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), EditorView.atomicRanges.of((view) => view.state.field(f).deco)],
});

// Une suppression au clavier ne doit pas emporter une partie masquee que l'on ne voit pas : par exemple Suppr en fin de
// titre, qui retirerait la ligne d'etiquettes cachee juste dessous. Elle n'est acceptee que si elle couvre aussi la ligne
// qui precede la partie masquee (le titre supprime avec ses commentaires, par exemple).
const guardDeletions = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent(`delete`) || tr.isUserEvent(`input`))) return tr;
  const deco = tr.startState.field(hideField, false)?.deco;
  if (!deco || deco.size === 0) return tr;
  const doc = tr.startState.doc;
  let refuse = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (toA <= fromA) return;
    // Les sauts de ligne qui touchent la partie masquee comptent : les supprimer collerait le texte a la ligne cachee.
    deco.between(fromA, toA, (from, to) => {
      if (toA < from || fromA > to) return undefined;
      const coveredFrom = from > 0 ? doc.lineAt(from - 1).from : 0;
      if (fromA > coveredFrom || toA < to) refuse = true;
      return undefined;
    });
  });
  return refuse ? [] : tr;
});

export const hideExtension: Extension = [hideField, guardDeletions];

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

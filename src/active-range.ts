// Plage du chapitre actif de la note reliee a la carte (positions dans le document).
import { StateEffect, StateField } from "@codemirror/state";

export interface ActiveRange {
  from: number;
  to: number;
}

// Definit la plage du chapitre actif. null : aucun grisage.
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

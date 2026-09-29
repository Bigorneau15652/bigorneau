// Portee d'une modification de style : quelles reglages et quels commentaires de la note changent
// selon la selection et la touche Cmd (ou Ctrl). Sans dependance a Obsidian.
import { flattenDoc, LineEdit, MmDoc, planMetaEdit } from "./model";
import { isEmptyMeta, MmMeta, mergePatch, omitKeys, StylePatch } from "./style";

export interface MetaChange {
  key: string;
  meta: MmMeta | null;
}

export interface StylePlan {
  // Reglages generaux a modifier (toute la carte).
  settings?: StylePatch;
  // Retablir les reglages d'apparence d'origine.
  resetSettings?: boolean;
  // Commentaires de style a ecrire dans la note.
  changes: MetaChange[];
}

const levelOf = (key: string, doc: MmDoc, levels: Map<string, number>): number => (key === `r` ? 0 : levels.get(key) ?? 0);

function levelMap(doc: MmDoc): Map<string, number> {
  return new Map(flattenDoc(doc).map((e) => [e.key, e.node.level]));
}

// Modification de style :
// - sans selection, ou avec toute la carte selectionnee : la carte entiere (reglages generaux) ;
// - avec une selection : tous les titres du niveau de chaque case selectionnee ;
// - avec `individual` (Cmd ou Ctrl maintenu) : les cases selectionnees seulement.
export function planStyle(doc: MmDoc, keys: string[], patch: StylePatch, individual: boolean): StylePlan {
  const flat = flattenDoc(doc);
  const levels = levelMap(doc);
  const rootMeta: MmMeta = doc.root.meta ?? {};

  if (keys.length === 0) return { settings: patch, changes: [] };

  if (keys.length >= flat.length && !individual) {
    // La modification devient le reglage general et ne reste pas masquee par un style de niveau.
    const changes: MetaChange[] = [];
    if (rootMeta.levels) {
      const drop = Object.keys(patch);
      const cleaned: Record<string, StylePatch> = {};
      for (const [lvl, p] of Object.entries(rootMeta.levels)) {
        const c = omitKeys(p, drop);
        if (Object.keys(c).length > 0) cleaned[lvl] = c;
      }
      changes.push({ key: `r`, meta: { ...rootMeta, levels: cleaned } });
    }
    return { settings: patch, changes };
  }

  if (!individual) {
    const merged: Record<string, StylePatch> = { ...(rootMeta.levels ?? {}) };
    for (const k of keys) {
      const lvl = String(levelOf(k, doc, levels));
      merged[lvl] = mergePatch(merged[lvl], patch);
    }
    return { changes: [{ key: `r`, meta: { ...rootMeta, levels: merged } }] };
  }

  const nodes = new Map(flat.map((e) => [e.key, e.node]));
  const changes: MetaChange[] = [];
  for (const k of keys) {
    const node = nodes.get(k);
    if (!node) continue;
    const meta: MmMeta = node.meta ?? {};
    changes.push({ key: k, meta: { ...meta, style: mergePatch(meta.style, patch) } });
  }
  return { changes };
}

// Retrait des styles : de toute la carte (sans selection ou tout selectionne), d'un niveau, ou des cases seules.
export function planReset(doc: MmDoc, keys: string[], individual: boolean): StylePlan {
  const flat = flattenDoc(doc);
  const levels = levelMap(doc);

  if (keys.length === 0 || (keys.length >= flat.length && !individual)) {
    return { resetSettings: true, changes: flat.filter((e) => e.node.meta).map((e) => ({ key: e.key, meta: null })) };
  }
  if (!individual) {
    const rootMeta: MmMeta = doc.root.meta ?? {};
    const merged: Record<string, StylePatch> = { ...(rootMeta.levels ?? {}) };
    for (const k of keys) delete merged[String(levelOf(k, doc, levels))];
    return { changes: [{ key: `r`, meta: { ...rootMeta, levels: merged } }] };
  }
  const changes: MetaChange[] = [];
  for (const k of keys) {
    const meta = flat.find((e) => e.key === k)?.node.meta;
    if (meta) changes.push({ key: k, meta: { ...meta, style: undefined } });
  }
  return { changes };
}

// Traduit des commentaires de style voulus en modifications de lignes de la note.
export function metaEditsFor(doc: MmDoc, changes: MetaChange[]): LineEdit[] {
  const edits: LineEdit[] = [];
  for (const c of changes) {
    let meta: MmMeta | null = c.meta ? { ...c.meta } : null;
    if (meta && (!meta.style || Object.keys(meta.style).length === 0)) delete meta.style;
    if (meta && (!meta.levels || Object.keys(meta.levels).length === 0)) delete meta.levels;
    if (meta && isEmptyMeta(meta)) meta = null;
    const e = planMetaEdit(doc, c.key, meta);
    if (e) edits.push(e);
  }
  return edits;
}

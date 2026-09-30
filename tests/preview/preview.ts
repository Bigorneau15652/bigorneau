import { applyLineEdits, parseNote } from "../../src/model";
import { MapEdit, MapRenderer } from "../../src/renderer";
import { addNode, arrowTarget, deleteNodes, duplicateNodes, EditResult, extractBranches, insertBranches, moveNode, renameTitle } from "../../src/edit";
import { appearanceDefaults, DEFAULT_SETTINGS, MmSettings } from "../../src/settings";
import { metaEditsFor, planReset, planStyle } from "../../src/style-edit";

let text = [
  `Introduction de la note.`,
  ``,
  `## Titre A`,
  `Un **paragraphe** avec du texte.`,
  ``,
  `### Sous-titre A1`,
  `## Titre B`,
  `## Titre C`,
  `### Sous-titre C1`,
  `#### Detail C1a`,
  `## Un titre vraiment tres long qui depasse largement la largeur maximale d une case`,
  `##`,
  ``,
].join(`\n`);

const params = new URLSearchParams(location.search);
if (params.get(`doc`) === `cascade`) {
  text = [`# Titre niveau 1`, `## Titre niveau 2`, `### Titre niveau 3`, `#### Titre niveau 4`, `##### Titre niveau 5`, ``].join(`\n`);
}
const settings: MmSettings = { ...DEFAULT_SETTINGS };
for (const [k, v] of params) {
  if (k === `select` || k === `collapse` || k === `doc`) continue;
  const current = (settings as unknown as Record<string, unknown>)[k];
  if (typeof current === `number`) (settings as unknown as Record<string, number>)[k] = Number(v);
  else if (typeof current === `boolean`) (settings as unknown as Record<string, boolean>)[k] = v === `1`;
  else (settings as unknown as Record<string, string>)[k] = v;
}

const w = window as unknown as Record<string, unknown>;
let clip = ``;
const calls: string[] = [];
const mapHost = document.getElementById(`map`)!;

// Reproduit le parcours de la vue : la modification de style est ecrite dans la note, puis la note est relue.
function write(edits: ReturnType<typeof metaEditsFor>, eol: string): void {
  if (edits.length > 0) text = applyLineEdits(text, edits, eol);
  renderer.setDoc(parseNote(text, `Nom de la note.md`), `sample.md`, true);
}

const renderer: MapRenderer = new MapRenderer(mapHost, () => settings, {
  onChange: (patch) => {
    Object.assign(settings, patch);
    renderer.rebuild();
  },
  onStyle: (patch, individual) => {
    const doc = parseNote(text, `Nom de la note.md`);
    const plan = planStyle(doc, renderer.getSelection(), patch, individual);
    if (plan.settings) Object.assign(settings, plan.settings);
    write(metaEditsFor(doc, plan.changes), doc.eol);
  },
  onResetStyle: (individual) => {
    const doc = parseNote(text, `Nom de la note.md`);
    const plan = planReset(doc, renderer.getSelection(), individual);
    if (plan.resetSettings) Object.assign(settings, appearanceDefaults());
    write(metaEditsFor(doc, plan.changes), doc.eol);
  },
  onUndo: () => calls.push(`undo`),
  onRedo: () => calls.push(`redo`),
  onOpenSettings: () => calls.push(`settings`),
  onSelect: (key) => calls.push(`select:${key}`),
  onEnter: () => calls.push(`enter`),
  onMessage: (m) => calls.push(`message:${m}`),
  onContextMenu: (k) => calls.push(`menu:${k}`),
  // Reproduit la vue : le nouveau texte est calcule, la note relue, la case creee passe en saisie.
  onEdit: (edit: MapEdit) => {
    calls.push(`edit:${edit.kind}:${edit.key}`);
    let r: EditResult | null;
    if (edit.kind === `copy` || edit.kind === `cut`) {
      clip = extractBranches(text, `Nom de la note.md`, edit.keys) ?? clip;
      w.clip = clip;
      if (edit.kind === `copy`) return;
      r = deleteNodes(text, `Nom de la note.md`, edit.keys);
    } else if (edit.kind === `duplicate`) r = duplicateNodes(text, `Nom de la note.md`, edit.keys);
    else if (edit.kind === `paste` || edit.kind === `pasteAfter`) {
      let parentKey = edit.key;
      let index = 999;
      if (edit.kind === `pasteAfter`) {
        const parts = edit.key.split(`.`);
        index = Number(parts.pop()) + 1;
        parentKey = parts.join(`.`);
      }
      r = insertBranches(text, `Nom de la note.md`, parentKey, index, clip);
    } else if (edit.kind === `delete`) r = deleteNodes(text, `Nom de la note.md`, edit.keys);
    else if (edit.kind === `rename`) r = renameTitle(text, `Nom de la note.md`, edit.key, edit.title ?? ``);
    else if (edit.kind === `move`) {
      const t = edit.dir ? arrowTarget(parseNote(text, `Nom de la note.md`), edit.key, edit.dir) : { parentKey: edit.parentKey ?? `r`, index: edit.index ?? 0 };
      r = t ? moveNode(text, `Nom de la note.md`, edit.key, t.parentKey, t.index) : null;
      if (!r || r.text === text) {
        renderer.resetPreview();
        return;
      }
    } else r = addNode(text, `Nom de la note.md`, edit.key, edit.kind);
    if (!r) return;
    text = r.text;
    renderer.setDoc(parseNote(text, `Nom de la note.md`), `sample.md`, true);
    if (edit.kind !== `rename` && r.key) {
      renderer.reveal(r.key);
      renderer.select(r.key, false);
      if (edit.kind === `child` || edit.kind === `sibling`) renderer.startRename(r.key);
    }
  },
});
renderer.setDoc(parseNote(text, `Nom de la note.md`), `sample.md`, true);
if (params.get(`collapse`) === `1`) renderer.collapseAll();
const sel = params.get(`select`);
if (sel) renderer.select(sel);
w.renderer = renderer;
w.settings = settings;
w.getText = () => text;
w.calls = calls;

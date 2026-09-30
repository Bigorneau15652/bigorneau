import { applyLineEdits, nodeByKey, parseNote } from "../../src/model";
import { MapEdit, MapRenderer } from "../../src/renderer";
import { addNode, arrowTarget, cleanTitle, deleteNodes, duplicateNodes, EditResult, extractBranches, insertBranches, moveNode, renameTitle } from "../../src/edit";
import { appearanceDefaults, DEFAULT_SETTINGS, MmSettings, TagDef } from "../../src/settings";
import type { MmMeta } from "../../src/style";
import { metaEditsFor, planReset, planStyle } from "../../src/style-edit";
import { insertLink, removeLink } from "../../src/links";

// Etiquettes de demonstration (parametre tags=demo).
const DEMO_TAGS: TagDef[] = [
  { id: `dmg`, name: `DMG`, bg: `#ffe8cc`, fg: `#b45309` },
  { id: `p2`, name: `P2`, bg: `#ffe3a3`, fg: `#946200` },
  { id: `dsin`, name: `DSIN`, bg: `#3b82f6`, fg: `#ffffff` },
  { id: `p1`, name: `P1`, bg: `#ffc9c9`, fg: `#c92a2a` },
];

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
if (params.get(`doc`) === `web`) {
  text = [
    `Intro`,
    ``,
    `## Un lien`,
    `Voir [le site](https://exemple.org/page).`,
    `## Deux liens`,
    `![](https://www.youtube.com/watch?v=abc123)`,
    `et https://autre.fr/x`,
    `## Avec etiquette`,
    `%% mmw {"tags":["dmg"]} %%`,
    `https://b.test`,
    `## Sans lien`,
    `texte`,
    ``,
  ].join(`\n`);
}
const settings: MmSettings = { ...DEFAULT_SETTINGS };
for (const [k, v] of params) {
  if (k === `select` || k === `collapse` || k === `doc`) continue;
  if (k === `tags`) {
    if (v === `demo`) settings.tags = DEMO_TAGS.map((t) => ({ ...t }));
    continue;
  }
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
  getFileName: () => `Nom de la note.md`,
  onLinkCreate: (from, to) => {
    calls.push(`link:${from}>${to}`);
    const name = `Nom de la note.md`;
    const doc = parseNote(text, name);
    const target = nodeByKey(doc, to);
    if (!target) return;
    const next = insertLink(text, doc, from, `Nom de la note`, target.title);
    if (next) text = next;
    renderer.setDoc(parseNote(text, name), `sample.md`, true);
  },
  getVaultFiles: () => [`Accueil.md`, `Projets/Alpha.md`, `Projets/Beta.md`, `Projets/Archives/Ancien.md`, `Reunions/2024-01.md`],
  getHeadings: async (path) => (path.endsWith(`Alpha.md`) ? [{ title: `Budget`, level: 1 }, { title: `Risques`, level: 2 }] : []),
  onLinkExternal: (from, path, heading) => {
    calls.push(`external:${from}:${path}:${heading}`);
    const name = `Nom de la note.md`;
    const doc = parseNote(text, name);
    const next = insertLink(text, doc, from, path.replace(/\.md$/i, ``), heading);
    if (next) text = next;
    renderer.setDoc(parseNote(text, name), `sample.md`, true);
  },
  onWebOpen: (links) => calls.push(`web:${links.map((l) => l.url).join(`,`)}`),
  onLinkOpen: (links) => calls.push(`open:${links.map((l) => l.note + `#` + l.heading).join(`,`)}`),
  onLinkDelete: (link) => {
    calls.push(`unlink:${link.from}:${link.line}`);
    const name = `Nom de la note.md`;
    text = removeLink(text, parseNote(text, name), link);
    renderer.setDoc(parseNote(text, name), `sample.md`, true);
  },
  onToggleHidden: (key) => {
    calls.push(`hidden:${key}`);
    const name = `Nom de la note.md`;
    const doc = parseNote(text, name);
    const node = nodeByKey(doc, key);
    if (!node || key === `r`) return;
    const meta: MmMeta = { ...(node.meta ?? {}) };
    if (meta.hidden) delete meta.hidden;
    else meta.hidden = true;
    const edits = metaEditsFor(doc, [{ key, meta }]);
    if (edits.length > 0) text = applyLineEdits(text, edits, doc.eol);
    renderer.setDoc(parseNote(text, name), `sample.md`, true);
  },
  // Reproduit la vue : titre puis commentaire invisible, en une seule modification de la note.
  onDetails: (key, values) => {
    calls.push(`details:${key}`);
    const name = `Nom de la note.md`;
    let next = text;
    const node = nodeByKey(parseNote(next, name), key);
    if (!node || key === `r`) return;
    if (cleanTitle(values.title) !== node.title) {
      const r = renameTitle(next, name, key, values.title);
      if (r) next = r.text;
    }
    const doc = parseNote(next, name);
    const meta: MmMeta = { ...(nodeByKey(doc, key)?.meta ?? {}) };
    if (values.short.trim()) meta.short = values.short.trim();
    else delete meta.short;
    if (values.comment.trim()) meta.comment = values.comment.trim();
    else delete meta.comment;
    if (values.tags.length > 0) meta.tags = values.tags;
    else delete meta.tags;
    const edits = metaEditsFor(doc, [{ key, meta }]);
    if (edits.length > 0) next = applyLineEdits(next, edits, doc.eol);
    text = next;
    renderer.setDoc(parseNote(text, name), `sample.md`, true);
  },
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

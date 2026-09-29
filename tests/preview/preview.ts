import { parseNote } from "../../src/model";
import { MapRenderer } from "../../src/renderer";
import { DEFAULT_SETTINGS, MmSettings } from "../../src/settings";

const SAMPLE = [
  `Introduction de la note.`,
  ``,
  `# Titre 1`,
  `Un **paragraphe** avec du texte.`,
  ``,
  `## Titre 2`,
  `# Titre 1`,
  `# Titre 1`,
  `## Titre 2`,
  `### Titre 3`,
  `# Titre 1`,
  `## Un titre vraiment tres long qui depasse largement la largeur maximale d une case`,
  `##`,
  ``,
].join(`\n`);

const params = new URLSearchParams(location.search);
const settings: MmSettings = { ...DEFAULT_SETTINGS };
for (const [k, v] of params) {
  if (k === `select` || k === `collapse`) continue;
  const current = (settings as unknown as Record<string, unknown>)[k];
  if (typeof current === `number`) (settings as unknown as Record<string, number>)[k] = Number(v);
  else if (typeof current === `boolean`) (settings as unknown as Record<string, boolean>)[k] = v === `1`;
  else (settings as unknown as Record<string, string>)[k] = v;
}

const w = window as unknown as Record<string, unknown>;
const doc = parseNote(SAMPLE, `Nom de la note.md`);
const changes: Partial<MmSettings>[] = [];
const calls: string[] = [];
const mapHost = document.getElementById(`map`)!;
const renderer: MapRenderer = new MapRenderer(mapHost, () => settings, {
  onChange: (patch) => {
    changes.push(patch);
    Object.assign(settings, patch);
    renderer.rebuild();
  },
  onUndo: () => calls.push(`undo`),
  onRedo: () => calls.push(`redo`),
  onOpenSettings: () => calls.push(`settings`),
  onSelect: (key) => calls.push(`select:${key}`),
  onEnter: () => calls.push(`enter`),
});
renderer.setDoc(doc, `sample.md`, true);
if (params.get(`collapse`) === `1`) renderer.collapseAll();
const sel = params.get(`select`);
if (sel) renderer.select(sel);
w.renderer = renderer;
w.settings = settings;
w.changes = changes;
w.calls = calls;

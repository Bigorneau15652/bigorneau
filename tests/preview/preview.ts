import { parseNote, nodeByKey, pathTitles, splitBody } from "../../src/model";
import { MapRenderer } from "../../src/renderer";
import { ParagraphPane } from "../../src/paragraph";
import { DEFAULT_SETTINGS, MmSettings } from "../../src/settings";

const SAMPLE = [
  `Introduction de la note.`,
  ``,
  `# Titre 1`,
  `Un **paragraphe** avec du *texte*, un [[lien]] et du \`code\`.`,
  ``,
  `- premier point`,
  `- second point`,
  ``,
  `## Titre 2`,
  `> une citation`,
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
  if (k === `maxWidth` || k === `compactness` || k === `paneSize`) (settings as unknown as Record<string, number>)[k] = Number(v);
  else if (k === `showPrefix`) settings.showPrefix = v === `1`;
  else if (k !== `select` && k !== `collapse`) (settings as unknown as Record<string, string>)[k] = v;
}

const w = window as unknown as Record<string, unknown>;
const doc = parseNote(SAMPLE, `Nom de la note.md`);
const split = document.getElementById(`split`)!;
split.classList.add(`mmw-pos-${settings.panePosition}`);
const mapHost = document.getElementById(`map`)!;
const paneHost = document.getElementById(`pane`)!;
paneHost.style.flex = `0 0 ${settings.paneSize}px`;

const changes: string[] = [];
const pane = new ParagraphPane(paneHost, { onChange: (t) => changes.push(t), onEscape: () => renderer.focus() });
const renderer = new MapRenderer(mapHost, () => settings, {
  onCompactChange: () => undefined,
  onSelect: (key) => {
    if (!key) return pane.clear();
    const node = nodeByKey(doc, key)!;
    pane.setNode(key, pathTitles(doc, key), splitBody(node.body).core, 0);
  },
  onEnter: () => pane.focus(),
});
renderer.setDoc(doc, `sample.md`, true);
if (params.get(`collapse`) === `1`) renderer.collapseAll();
const sel = params.get(`select`);
if (sel) {
  renderer.select(sel);
}
w.renderer = renderer;
w.pane = pane;
w.changes = changes;

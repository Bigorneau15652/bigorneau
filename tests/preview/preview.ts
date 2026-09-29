import { parseNote } from "../../src/model";
import { MapRenderer } from "../../src/renderer";
import { DEFAULT_SETTINGS, MmSettings } from "../../src/settings";

const SAMPLE = [
  `# Titre 1`,
  `## Titre 1`,
  `### Titre 1`,
  `## Titre 2`,
  `# Titre 2`,
  `## Titre 3`,
  `### Titre 2`,
  `#### Titre 1`,
  `#### Titre 2`,
  `#### Titre 3`,
  `## Titre 4`,
  `# Titre 3`,
  `# Titre 4`,
  `## Titre 5`,
  `### Un titre vraiment tres long qui depasse largement la largeur maximale d une case`,
  `## Titre 6`,
  `##`,
  ``,
].join(`\n`);

const params = new URLSearchParams(location.search);
const settings: MmSettings = { ...DEFAULT_SETTINGS };
for (const [k, v] of params) {
  if (k === `maxWidth` || k === `compactness`) (settings as unknown as Record<string, number>)[k] = Number(v);
  else if (k === `showPrefix`) settings.showPrefix = v === `1`;
  else if (k !== `select` && k !== `collapse`) (settings as unknown as Record<string, string>)[k] = v;
}

const doc = parseNote(SAMPLE, `Sujet Central.md`);
const container = document.getElementById(`map`)!;
const renderer = new MapRenderer(container, () => settings, () => undefined);
renderer.setDoc(doc, `sample.md`, true);
if (params.get(`collapse`) === `1`) renderer.collapseAll();
const sel = params.get(`select`);
if (sel) renderer.select(sel);
(window as unknown as Record<string, unknown>).renderer = renderer;

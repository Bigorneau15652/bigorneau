// Reglages du plugin (sans dependance a Obsidian pour pouvoir etre teste hors de l'application).

export type LongTitles = `ellipsis` | `wrap`;
export type BranchStyle = `elbow` | `curve` | `straight`;
export type PanePosition = `right` | `left` | `top` | `bottom`;
export type CursorPosition = `last` | `start` | `end`;
export type StrokeDash = `solid` | `dashed` | `dotted`;
export type Corners = `sharp` | `round`;
export type FontFamily = `default` | `handwritten` | `mono`;
export type TextAlign = `left` | `center` | `right`;
// 0 : trait net, 1 : trait de crayon leger, 2 : trait tres irregulier.
export type Roughness = 0 | 1 | 2;
export type ViewMode = `map` | `list`;
export type LanguageSetting = `auto` | `fr` | `en`;
// Note fixe memorisee : volet (identifiant Obsidian), note et chapitre montre.
export interface FixedEntry {
  id: string;
  path: string;
  key: string;
  title: string;
}

export function sanitizeFixed(raw: unknown): FixedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: FixedEntry[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== `object`) continue;
    if (typeof r.id !== `string` || typeof r.path !== `string` || typeof r.key !== `string` || typeof r.title !== `string`) continue;
    if (r.id === `` || !/^[rf]\d*(\.\d+)*$/.test(r.key) || out.some((e) => e.id === r.id)) continue;
    out.push({ id: r.id, path: r.path, key: r.key, title: r.title });
  }
  return out.slice(0, 30);
}

export type FloatShape = `oval` | `round` | `sharp`;
export type NewNoteFolderMode = `fixed` | `current` | `root`;

// Numero de la version du format des reglages enregistres.
export const SETTINGS_VERSION = 4;

// Etiquette affichee en petit a cote du titre, sur la carte seulement. `id` est stable : la note memorise l'identifiant.
export interface TagDef {
  id: string;
  name: string;
  bg: string;
  fg: string;
}

const TAG_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TAG_ID_RE = /^[A-Za-z0-9_-]{1,24}$/;

// Ne garde que des etiquettes valides : les reglages enregistres peuvent avoir ete modifies a la main.
export function sanitizeTags(raw: unknown): TagDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TagDef[] = [];
  for (const t of raw) {
    if (!t || typeof t !== `object`) continue;
    const r = t as Record<string, unknown>;
    if (typeof r.id !== `string` || !TAG_ID_RE.test(r.id) || seen.has(r.id)) continue;
    const name = typeof r.name === `string` ? r.name.replace(/[\r\n]+/g, ` `).trim().slice(0, 40) : ``;
    const bg = typeof r.bg === `string` && TAG_HEX.test(r.bg) ? r.bg : `#ffe8cc`;
    const fg = typeof r.fg === `string` && TAG_HEX.test(r.fg) ? r.fg : `#7c3a00`;
    seen.add(r.id);
    out.push({ id: r.id, name, bg, fg });
  }
  return out.slice(0, 100);
}

// Couleurs proposees pour les nouvelles etiquettes : vert, bleu, rouge, jaune, puis gris clair et gris fonce pour toutes les suivantes.
export const TAG_PALETTE: { bg: string; fg: string }[] = [
  { bg: `#dcf5e3`, fg: `#14532d` },
  { bg: `#dbeafe`, fg: `#1e3a8a` },
  { bg: `#fee2e2`, fg: `#7f1d1d` },
  { bg: `#fef3c7`, fg: `#713f12` },
];
export const TAG_DEFAULT_COLORS = { bg: `#e5e7eb`, fg: `#374151` };

// Couleurs de la prochaine etiquette : la premiere couleur de la palette pas encore utilisee, sinon le gris.
export function nextTagColors(existing: TagDef[]): { bg: string; fg: string } {
  const used = new Set(existing.map((t) => t.bg.toLowerCase()));
  return TAG_PALETTE.find((c) => !used.has(c.bg)) ?? TAG_DEFAULT_COLORS;
}

// Nouvelle etiquette prete a etre ajoutee a la liste.
export function makeTag(existing: TagDef[], name: string): TagDef {
  return { id: newTagId(existing), name: name.replace(/[\r\n]+/g, ` `).trim().slice(0, 40), ...nextTagColors(existing) };
}

// Nouvel identifiant d'etiquette, distinct de ceux qui existent.
export function newTagId(existing: TagDef[]): string {
  const used = new Set(existing.map((t) => t.id));
  for (let i = 0; i < 1000; i++) {
    const id = `t${Math.random().toString(36).slice(2, 6)}`;
    if (!used.has(id)) return id;
  }
  return `t${Date.now().toString(36)}`;
}

export interface MmSettings {
  settingsVersion: number;
  longTitles: LongTitles;
  maxWidth: number;
  showPrefix: boolean;
  compactness: number;
  panePosition: PanePosition;
  cursorPosition: CursorPosition;
  focusNoteOnSelect: boolean;
  contrastEnabled: boolean;
  inactiveOpacity: number;
  includeSubtitles: boolean;
  keyPrev: string;
  keyNext: string;
  keyParent: string;
  keyChild: string;
  // Apparence de la carte.
  branchStyle: BranchStyle;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeDash: StrokeDash;
  roughness: Roughness;
  corners: Corners;
  showFrames: boolean;
  fontFamily: FontFamily;
  fontScale: number;
  textAlign: TextAlign;
  // Liste des etiquettes disponibles (menu de la carte).
  tags: TagDef[];
  // Contraste de la case selectionnee, de 0 (discret) a 100 (tres marque).
  selectionContrast: number;
  // Masque dans la note les lignes de commentaire du plugin (%% mmw ... %%) : etiquettes, styles, titre court.
  hideMetaLines: boolean;
  // Fleches de lien toujours colorees (couleur des liens du theme) ; sinon neutres, et colorees quand on les selectionne.
  linkColored: boolean;
  // Note : masque les chapitres inactifs au lieu de les griser (seul le chapitre actif reste visible).
  hideInactive: boolean;
  // Elements visibles sur la carte (menu de l'oeil) et vue en noir et blanc.
  showTags: boolean;
  showComments: boolean;
  showWebLinks: boolean;
  showExternalLinks: boolean;
  showInternalLinks: boolean;
  blackWhite: boolean;
  // Type de vue : carte mentale ou liste condensee. Reglages propres a la liste : une ligne sur deux plus foncee, et
  // police manuscrite de la carte.
  viewMode: ViewMode;
  listStripes: boolean;
  listMapFont: boolean;
  // Langue du plugin : automatique (celle d'Obsidian), francais ou anglais.
  language: LanguageSetting;
  // Dossier des notes creees depuis la carte : un dossier choisi, le dossier de la note courante ou la racine du coffre.
  newNoteMode: NewNoteFolderMode;
  newNoteFolder: string;
  // Icones des reperes de liens (identifiants de src/icons.ts) et leur couleur (vide : couleur des liens du theme).
  iconExternal: string;
  iconInternal: string;
  iconWeb: string;
  iconColorExternal: string;
  iconColorInternal: string;
  iconColorWeb: string;
  // Chapitres de la page de reglages laisses ouverts.
  openChapters: string[];
  // Notes fixes : comportement des sous-titres (vrai : comme la note dynamique ; faux : paragraphe du titre seul) et liste
  // des notes fixes ouvertes, pour les retrouver au redemarrage.
  fixedLikeDynamic: boolean;
  fixedViews: FixedEntry[];
  // Sujets flottants : niveau du titre cree, forme, couleurs, trait et police par defaut (vide : comme la carte).
  floatLevel: number;
  floatShape: FloatShape;
  floatStrokeColor: string;
  floatFillColor: string;
  floatStrokeDash: StrokeDash | ``;
  floatFontFamily: FontFamily | ``;
}

export const DEFAULT_SETTINGS: MmSettings = {
  settingsVersion: SETTINGS_VERSION,
  longTitles: `ellipsis`,
  maxWidth: 240,
  showPrefix: false,
  compactness: 1,
  panePosition: `right`,
  cursorPosition: `last`,
  focusNoteOnSelect: false,
  contrastEnabled: true,
  inactiveOpacity: 0.45,
  includeSubtitles: false,
  keyPrev: `Mod-ArrowUp`,
  keyNext: `Mod-ArrowDown`,
  keyParent: `Mod-ArrowLeft`,
  keyChild: `Mod-ArrowRight`,
  branchStyle: `elbow`,
  strokeColor: ``,
  fillColor: ``,
  strokeWidth: 1.8,
  strokeDash: `solid`,
  roughness: 1,
  corners: `round`,
  showFrames: true,
  fontFamily: `default`,
  fontScale: 1,
  textAlign: `center`,
  tags: [],
  selectionContrast: 50,
  hideMetaLines: true,
  linkColored: false,
  hideInactive: false,
  showTags: true,
  showComments: true,
  showWebLinks: true,
  showExternalLinks: true,
  showInternalLinks: true,
  blackWhite: false,
  viewMode: `map`,
  listStripes: false,
  listMapFont: false,
  language: `auto`,
  newNoteMode: `current`,
  newNoteFolder: ``,
  iconExternal: `chain`,
  iconInternal: `return`,
  iconWeb: `globe`,
  iconColorExternal: ``,
  iconColorInternal: ``,
  iconColorWeb: ``,
  openChapters: [],
  fixedLikeDynamic: false,
  fixedViews: [],
  floatLevel: 2,
  floatShape: `oval`,
  floatStrokeColor: ``,
  floatFillColor: ``,
  floatStrokeDash: ``,
  floatFontFamily: ``,
};

// Reglages qui composent l'apparence de la carte (bouton palette).
export const APPEARANCE_KEYS: (keyof MmSettings)[] = [
  `branchStyle`,
  `strokeColor`,
  `fillColor`,
  `strokeWidth`,
  `strokeDash`,
  `roughness`,
  `corners`,
  `showFrames`,
  `fontFamily`,
  `fontScale`,
  `textAlign`,
];

export function appearanceDefaults(): Partial<MmSettings> {
  const out: Record<string, unknown> = {};
  for (const k of APPEARANCE_KEYS) out[k] = DEFAULT_SETTINGS[k];
  return out as Partial<MmSettings>;
}

// Convertit les reglages enregistres par une version precedente du plugin.
export function migrateSettings(stored: unknown): MmSettings {
  const data: Record<string, unknown> = stored && typeof stored === `object` ? { ...(stored as Record<string, unknown>) } : {};
  const version = typeof data.settingsVersion === `number` ? data.settingsVersion : 1;

  if (version < 3) {
    // Le chapitre actif est un seul bloc de texte, sans ses descendants.
    data.includeSubtitles = false;
    // Anciens reglages de contour et de branches.
    const frame = data.frameStyle;
    if (frame === `none`) data.showFrames = false;
    else if (frame === `straight`) data.corners = `sharp`;
    else if (frame === `rounded`) data.roughness = 0;
    if (data.branchStyle === `sketch`) data.branchStyle = `elbow`;
  }
  delete data.frameStyle;
  delete data.paragraphMode;
  delete data.paneSize;

  const merged = { ...DEFAULT_SETTINGS, ...data } as MmSettings;
  merged.tags = sanitizeTags(data.tags);
  merged.fixedViews = sanitizeFixed(data.fixedViews);
  merged.floatLevel = typeof merged.floatLevel === `number` && merged.floatLevel >= 1 && merged.floatLevel <= 6 ? Math.round(merged.floatLevel) : 2;
  if (![`oval`, `round`, `sharp`].includes(merged.floatShape)) merged.floatShape = `oval`;
  for (const k of [`floatStrokeColor`, `floatFillColor`] as const) {
    if (typeof merged[k] !== `string` || (merged[k] !== `` && !TAG_HEX.test(merged[k]))) merged[k] = ``;
  }
  if (![``, `solid`, `dashed`, `dotted`].includes(merged.floatStrokeDash)) merged.floatStrokeDash = ``;
  if (![``, `default`, `handwritten`, `mono`].includes(merged.floatFontFamily)) merged.floatFontFamily = ``;
  merged.openChapters = Array.isArray(data.openChapters) ? data.openChapters.filter((x): x is string => typeof x === `string`) : [];
  for (const k of [`iconColorExternal`, `iconColorInternal`, `iconColorWeb`] as const) {
    if (typeof merged[k] !== `string` || (merged[k] !== `` && !TAG_HEX.test(merged[k]))) merged[k] = ``;
  }
  merged.newNoteFolder = typeof merged.newNoteFolder === `string` ? merged.newNoteFolder.replace(/^\/+|\/+$/g, ``) : ``;
  merged.settingsVersion = SETTINGS_VERSION;
  return merged;
}

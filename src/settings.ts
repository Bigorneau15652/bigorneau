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
  merged.settingsVersion = SETTINGS_VERSION;
  return merged;
}

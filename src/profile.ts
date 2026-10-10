// Profils : copie nommee des reglages du plugin (apparence de la carte, options et mise en forme de l'export, polices et titres, puces,
// panneau de boutons...), gardee dans un fichier du coffre. Ce module ne depend pas d'Obsidian.
import { migrateSettings, MmSettings } from "./settings";

export const PROFILE_KIND = `bigorneau-profile`;
export const PROFILE_VERSION = 1;
// Profil cree automatiquement avant d'en charger un autre, pour pouvoir revenir en arriere.
export const AUTO_BACKUP_NAME = `Sauvegarde automatique`;

// What a profile does not contain: what belongs to the author (name of the PDF author), the location of folders in the vault, the
// windows currently open (fixed notes) and the chapters left open in the settings page. The on/off state of the built-in modules is
// part of a profile (a profile can only turn on modules that are built into the plugin, never load code).
export const PROFILE_EXCLUDED: (keyof MmSettings)[] = [
  `exportAuthor`,
  `profileFolder`,
  `fontFolder`,
  `newNoteFolder`,
  `foldersCreated`,
  `fixedViews`,
  `openChapters`,
];

export interface Profile {
  kind: typeof PROFILE_KIND;
  version: number;
  name: string;
  savedAt: string;
  // Version des reglages au moment de l'enregistrement : les anciens profils sont mis a niveau au chargement.
  settingsVersion: number;
  settings: Partial<MmSettings>;
}

// Nom utilisable comme nom de fichier : sans caracteres interdits, espaces nettoyes, 80 caracteres au plus.
export function profileName(raw: string): string {
  // Control characters (code below 32) are turned into spaces before the forbidden characters.
  const printable = Array.from(raw, (ch) => (ch.charCodeAt(0) < 32 ? ` ` : ch)).join(``);
  return printable
    .replace(/[\\/:*?"<>|]/g, ` `)
    .replace(/\s+/g, ` `)
    .trim()
    .replace(/^\.+/, ``)
    .slice(0, 80)
    .trim();
}

// Deux noms designent le meme profil quand ils ne different que par la casse (les disques de macOS et de Windows l'ignorent).
export const sameProfile = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export function buildProfile(name: string, settings: MmSettings, now: Date = new Date()): Profile {
  const copy = JSON.parse(JSON.stringify(settings)) as Partial<MmSettings>;
  for (const key of PROFILE_EXCLUDED) delete copy[key];
  delete copy.settingsVersion;
  return { kind: PROFILE_KIND, version: PROFILE_VERSION, name, savedAt: now.toISOString(), settingsVersion: settings.settingsVersion, settings: copy };
}

export const serializeProfile = (profile: Profile): string => `${JSON.stringify(profile, null, 2)}\n`;

// Lit un fichier de profil ; null si ce n'en est pas un (autre fichier, texte abime, profil d'une version plus recente).
export function parseProfile(text: string): Profile | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== `object`) return null;
  const p = data as Record<string, unknown>;
  if (p.kind !== PROFILE_KIND || typeof p.version !== `number` || p.version > PROFILE_VERSION) return null;
  if (!p.settings || typeof p.settings !== `object` || Array.isArray(p.settings)) return null;
  return {
    kind: PROFILE_KIND,
    version: p.version,
    name: typeof p.name === `string` ? p.name : ``,
    savedAt: typeof p.savedAt === `string` ? p.savedAt : ``,
    settingsVersion: typeof p.settingsVersion === `number` ? p.settingsVersion : 1,
    settings: p.settings,
  };
}

// Reglages obtenus en chargeant le profil : ceux du profil, verifies comme au demarrage du plugin, sauf ce qu'un profil ne contient pas.
export function applyProfile(current: MmSettings, profile: Profile): MmSettings {
  const base = JSON.parse(JSON.stringify(current)) as MmSettings;
  const merged = migrateSettings({ ...base, ...profile.settings, settingsVersion: profile.settingsVersion });
  const keep = JSON.parse(JSON.stringify(base)) as MmSettings;
  const target = merged as unknown as Record<string, unknown>;
  for (const key of PROFILE_EXCLUDED) target[key] = keep[key];
  merged.settingsVersion = base.settingsVersion;
  return merged;
}
